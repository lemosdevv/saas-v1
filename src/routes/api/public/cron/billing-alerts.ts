import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendTrialEndingEmail,
  sendTrialExpiredEmail,
  sendPaymentOverdueEmail,
} from "@/lib/email.server";

export const Route = createFileRoute("/api/public/cron/billing-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Verificar token de segurança (se configurado)
          const cronSecret = process.env.CRON_SECRET;
          if (cronSecret) {
            const clientSecret = request.headers.get("x-cron-secret");
            if (clientSecret !== cronSecret) {
              return new Response("Unauthorized", { status: 401 });
            }
          }

          const results: string[] = [];
          const nowStr = new Date().toISOString();

          // ====================================================================
          // 1. AVISO DE FIM DE TESTE (12 a 14 dias de trial ativo, sem e-mail enviado)
          // ====================================================================
          const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();
          
          const { data: endingSoonTenants } = await supabaseAdmin
            .from("tenants")
            .select("id, name, trial_start_date")
            .eq("plan", "trial")
            .lte("trial_start_date", twelveDaysAgo)
            .is("trial_ending_email_sent", null);

          if (endingSoonTenants && endingSoonTenants.length > 0) {
            for (const tenant of endingSoonTenants) {
              // Obter e-mail do proprietário
              const { data: roles } = await supabaseAdmin
                .from("user_roles")
                .select("user_id")
                .eq("tenant_id", tenant.id)
                .eq("role", "owner");

              const ownerId = roles?.[0]?.user_id;
              if (ownerId) {
                const { data: profile } = await supabaseAdmin
                  .from("profiles")
                  .select("email, full_name")
                  .eq("id", ownerId)
                  .maybeSingle();

                if (profile?.email) {
                  // Calcular dias restantes exatos
                  const elapsed = Math.floor(
                    (Date.now() - new Date(tenant.trial_start_date).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const daysLeft = Math.max(1, 15 - elapsed);

                  await sendTrialEndingEmail({
                    email: profile.email,
                    name: profile.full_name || "Parceiro",
                    daysLeft,
                  });

                  await supabaseAdmin
                    .from("tenants")
                    .update({ trial_ending_email_sent: nowStr })
                    .eq("id", tenant.id);

                  results.push(`Aviso de fim de teste enviado para ${tenant.name} (${profile.email})`);
                }
              }
            }
          }

          // ====================================================================
          // 2. AVISO DE TESTE EXPIRADO (15 ou mais dias de trial, sem e-mail enviado)
          // ====================================================================
          const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

          const { data: expiredTenants } = await supabaseAdmin
            .from("tenants")
            .select("id, name")
            .eq("plan", "trial")
            .lte("trial_start_date", fifteenDaysAgo)
            .is("trial_expired_email_sent", null);

          if (expiredTenants && expiredTenants.length > 0) {
            for (const tenant of expiredTenants) {
              const { data: roles } = await supabaseAdmin
                .from("user_roles")
                .select("user_id")
                .eq("tenant_id", tenant.id)
                .eq("role", "owner");

              const ownerId = roles?.[0]?.user_id;
              if (ownerId) {
                const { data: profile } = await supabaseAdmin
                  .from("profiles")
                  .select("email, full_name")
                  .eq("id", ownerId)
                  .maybeSingle();

                if (profile?.email) {
                  await sendTrialExpiredEmail({
                    email: profile.email,
                    name: profile.full_name || "Parceiro",
                  });

                  // Marcar e-mail enviado e expirar o status da tenant
                  await supabaseAdmin
                    .from("tenants")
                    .update({
                      trial_expired_email_sent: nowStr,
                      plan_status: "expired",
                    })
                    .eq("id", tenant.id);

                  results.push(`Aviso de teste expirado enviado para ${tenant.name} (${profile.email})`);
                }
              }
            }
          }

          // ====================================================================
          // 3. ALERTAS DE ASSINATURA PENDENTE / COBRANÇA ATRASADA (Vencendo em < 24h)
          // ====================================================================
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

          const { data: overdueBillings } = await supabaseAdmin
            .from("saas_billings")
            .select("id, tenant_id, plan, amount, checkout_url")
            .eq("status", "pending")
            .lte("expires_at", tomorrow)
            .is("overdue_email_sent", null);

          if (overdueBillings && overdueBillings.length > 0) {
            for (const billing of overdueBillings) {
              const { data: roles } = await supabaseAdmin
                .from("user_roles")
                .select("user_id")
                .eq("tenant_id", billing.tenant_id)
                .eq("role", "owner");

              const ownerId = roles?.[0]?.user_id;
              if (ownerId) {
                const { data: profile } = await supabaseAdmin
                  .from("profiles")
                  .select("email, full_name")
                  .eq("id", ownerId)
                  .maybeSingle();

                if (profile?.email && billing.checkout_url) {
                  const planLabels: Record<string, string> = {
                    start: "Plano Start",
                    profissional: "Plano Profissional",
                    studio: "Plano Studio",
                  };

                  await sendPaymentOverdueEmail({
                    email: profile.email,
                    name: profile.full_name || "Parceiro",
                    planName: planLabels[billing.plan] || "Plano Agenday",
                    amount: Number(billing.amount),
                    checkoutUrl: billing.checkout_url,
                  });

                  await supabaseAdmin
                    .from("saas_billings")
                    .update({ overdue_email_sent: nowStr })
                    .eq("id", billing.id);

                  results.push(`Aviso de cobrança vencendo enviado para Tenant ${billing.tenant_id} (${profile.email})`);
                }
              }
            }
          }

          return new Response(
            JSON.stringify({ ok: true, processed: results.length, logs: results }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (e) {
          console.error("Cron billing alerts error:", e);
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
