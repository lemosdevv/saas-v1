import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurityEvent } from "@/lib/security-log.server";
import { createHmac, timingSafeEqual } from "crypto";

function mapAbacateStatus(status: string): string {
  switch (status) {
    case "PAID": return "pago";
    case "PENDING": return "pendente";
    case "CANCELLED":
    case "EXPIRED":
    case "REFUNDED": return "falhou";
    default: return status;
  }
}

function verifyAbacateSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  
  // For development environment, if secret is not configured yet, log a warning but allow to proceed.
  // In production, we MUST fail if the secret is missing.
  if (!secret) {
    console.warn("WARNING: ABACATEPAY_WEBHOOK_SECRET is not configured in environment variables.");
    if (process.env.NODE_ENV === "production") {
      console.error("ERROR: Webhook secret required in production.");
      return false;
    }
    return true; // Bypass signature verification in development if secret not set
  }

  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/abacatepay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.clone().text();
          const signature = request.headers.get("x-webhook-signature") || request.headers.get("X-Webhook-Signature");

          if (!verifyAbacateSignature(rawBody, signature)) {
            await logSecurityEvent({
              eventType: "payment.webhook.invalid_signature",
              severity: "critical",
              metadata: { provider: "abacatepay" },
            });
            return new Response("Unauthorized Signature", { status: 401 });
          }

          const body = JSON.parse(rawBody);
          const event = body.event;
          
          if (!event || !event.startsWith("billing.")) {
            return new Response("ignored", { status: 200 });
          }

          const billing = body.data;
          if (!billing || !billing.id) {
            return new Response("invalid body", { status: 400 });
          }

          const paymentId = billing.id;
          const status = mapAbacateStatus(billing.status);
          const agId = billing.metadata?.agendamentoId || billing.externalId;

          // 1. DEDUP GERAL SAAS
          const { data: existingSaaS } = await supabaseAdmin
            .from("saas_webhook_events")
            .select("id")
            .eq("gateway", "abacatepay")
            .eq("event_id", event + ":" + paymentId)
            .maybeSingle();

          if (existingSaaS) {
            return new Response("ok (duplicate saas event)", { status: 200 });
          }

          await supabaseAdmin.from("saas_webhook_events").insert({
            gateway: "abacatepay",
            event_type: event,
            event_id: event + ":" + paymentId,
            payload: body,
          });

          // ====================================================================
          // FLUXO SAAS (Assinaturas da Plataforma)
          // ====================================================================
          if (billing.metadata?.tenantId && billing.metadata?.plan) {
            const tenantId = billing.metadata.tenantId;
            const plan = billing.metadata.plan;

            if (status === "pago") {
              // 1. Atualizar o saas_billing
              await supabaseAdmin
                .from("saas_billings")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("abacate_billing_id", paymentId);

              // 2. Atualizar o tenant
              await supabaseAdmin
                .from("tenants")
                .update({ plan, plan_status: "active" })
                .eq("id", tenantId);

              // 3. Atualizar/Inserir tenant_subscriptions
              await supabaseAdmin.from("tenant_subscriptions").upsert({
                tenant_id: tenantId,
                plan,
                provider: "abacatepay",
                mode: "recurring",
                status: "paid",
                amount: billing.amount / 100, // convertendo de centavos se aplicável
                idempotency_key: "abacate-pix-" + paymentId,
              }, { onConflict: "tenant_id, plan, idempotency_key" });

              await logSecurityEvent({
                eventType: "saas.subscription.activated",
                metadata: { tenantId, plan, paymentId },
              });
            } else if (status === "falhou") {
              await supabaseAdmin
                .from("saas_billings")
                .update({ status: "failed" })
                .eq("abacate_billing_id", paymentId);
            }
            
            return new Response("ok saas", { status: 200 });
          }

          // ====================================================================
          // FLUXO MARKETPLACE (Agendamentos)
          // ====================================================================
          if (agId && !agId.startsWith("saas-")) {
            // Dedup logic para payment_events...
            const { data: existing } = await supabaseAdmin
              .from("payment_events")
              .select("id")
              .eq("provider", "abacatepay")
              .eq("external_id", paymentId)
              .maybeSingle();

            if (existing) {
              return new Response("ok (duplicate)", { status: 200 });
            }

            // Verify amount mismatch for security
            if (status === "pago") {
              const { data: ag } = await supabaseAdmin
                .from("agendamentos")
                .select("preco")
                .eq("id", agId)
                .maybeSingle();

              const expected = Math.round(Number(ag?.preco ?? 0) * 100);
              const received = billing.amount; // Assume AbacatePay sends amount in cents

              if (expected > 0 && Math.abs(expected - received) > 1) {
                await logSecurityEvent({
                  eventType: "payment.amount.mismatch",
                  severity: "critical",
                  metadata: {
                    provider: "abacatepay",
                    agendamentoId: agId,
                    paymentId,
                    expected,
                    received,
                  },
                });
                await supabaseAdmin.from("payment_events").insert({
                  provider: "abacatepay",
                  external_id: paymentId,
                  agendamento_id: agId,
                  status: "falhou",
                  raw: JSON.parse(JSON.stringify(body)),
                });
                return new Response("amount mismatch", { status: 200 });
              }
            }

            // Update agendamento
            await supabaseAdmin
              .from("agendamentos")
              .update({ pagamento_status: status, pagamento_id: paymentId })
              .eq("id", agId);

            // Log event
            await supabaseAdmin.from("payment_events").insert({
              provider: "abacatepay",
              external_id: paymentId,
              agendamento_id: agId,
              status,
              raw: JSON.parse(JSON.stringify(body)),
            });

            await logSecurityEvent({
              eventType: "payment.webhook.received",
              metadata: { provider: "abacatepay", agendamentoId: agId, status },
            });
          }

          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("AbacatePay webhook error:", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
