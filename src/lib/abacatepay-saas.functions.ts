import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ABACATE_API = "https://api.abacatepay.com/v2";

export type PlanId = "start" | "profissional" | "studio";

export const SAAS_PLANS: Record<PlanId, {
  amount: number; label: string; priceLabel: string;
  price: number; description: string;
}> = {
  start: {
    amount: 2999, price: 29.99,
    label: "Plano Start — Agenday",
    priceLabel: "R$ 29,99/mês",
    description: "Ideal para quem está começando",
  },
  profissional: {
    amount: 4999, price: 49.99,
    label: "Plano Profissional — Agenday",
    priceLabel: "R$ 49,99/mês",
    description: "Para profissionais em crescimento",
  },
  studio: {
    amount: 10999, price: 109.99,
    label: "Plano Studio — Agenday",
    priceLabel: "R$ 109,99/mês",
    description: "Para estúdios e equipes",
  },
};

async function assertOwner(userId: string): Promise<{ tenant_id: string; email: string; full_name: string | null; phone: string | null }> {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id, email, full_name, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.tenant_id) throw new Error("Sem estabelecimento vinculado");
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", profile.tenant_id)
    .eq("role", "owner")
    .maybeSingle();
  if (!role) throw new Error("Apenas o dono do estabelecimento pode contratar planos");
  return {
    tenant_id: profile.tenant_id,
    email: profile.email ?? "",
    full_name: profile.full_name,
    phone: profile.phone,
  };
}

/**
 * Cria um Billing (cobrança avulsa via Pix) no Abacate Pay.
 * Retorna o QR Code e código copia-e-cola para exibição inline no front.
 */
export const createSaasBilling = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      plan: z.enum(["start", "profissional", "studio"]),
      payerEmail: z.string().email(),
      payerName: z.string().min(2).max(120),
      payerTaxId: z.string().min(11).max(18),
      payerPhone: z.string().min(10).max(20),
      methods: z.array(z.string()).optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { user } = await requireSupabaseAuth();
    const token = process.env.ABACATEPAY_API_KEY;
    if (!token) throw new Error("ABACATEPAY_API_KEY não configurada");

    const { tenant_id } = await assertOwner(user.id);
    const plan = SAAS_PLANS[data.plan];

    // 1. Criar/atualizar Customer no Abacate Pay
    const customerRes = await fetch(`${ABACATE_API}/customers/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.payerEmail,
        name: data.payerName,
        taxId: data.payerTaxId.replace(/\D/g, ""),
        cellphone: data.payerPhone.replace(/\D/g, ""),
        metadata: { tenantId: tenant_id },
      }),
    });
    const customerResult = await customerRes.json();
    if (!customerRes.ok) {
      throw new Error(customerResult.error ?? `Erro ao criar cliente: ${customerRes.status}`);
    }
    const customerId: string = customerResult.data.id;

    // 1.5. Criar/garantir Produto do plano no Abacate Pay
    const productExternalId = `saas-plan-${data.plan}-${Date.now()}`;
    const prodRes = await fetch(`${ABACATE_API}/products/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: plan.label,
        description: plan.description,
        price: plan.amount,       // em centavos
        currency: "BRL",
        externalId: productExternalId,
      }),
    });
    const prodResult = await prodRes.json();
    if (!prodRes.ok) {
      throw new Error(prodResult.error ?? `Erro ao criar produto: ${prodRes.status}`);
    }
    const productId: string = prodResult.data.id;

    // 2. Criar Checkout (substitui o billing/create na v2)
    const checkoutExternalId = `saas-checkout-${tenant_id}-${data.plan}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    const checkoutRes = await fetch(`${ABACATE_API}/checkouts/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        frequency: "ONE_TIME",
        methods: data.methods ?? ["PIX"],
        items: [
          {
            id: productId,
            quantity: 1,
          },
        ],
        returnUrl: `${process.env.VITE_APP_URL ?? "https://agenday.com.br"}/app/pagamentos?status=ok`,
        completionUrl: `${process.env.VITE_APP_URL ?? "https://agenday.com.br"}/app/pagamentos?status=ok`,
        customerId: customerId,
        metadata: {
          tenantId: tenant_id,
          plan: data.plan,
          userId: user.id,
        },
      }),
    });
    const billingResult = await checkoutRes.json();
    if (!checkoutRes.ok) {
      console.error("[saas-checkout] error:", JSON.stringify(billingResult));
      throw new Error(billingResult.error ?? `Erro ao criar checkout: ${checkoutRes.status}`);
    }
    const billing = billingResult.data;

    // 3. Extrair QR Code Pix
    const pixData = billing.charges?.[0]?.pix ?? billing.pix ?? null;
    const pixQrCode: string | null = pixData?.qrCode ?? billing.pixQrCode ?? null;
    const pixCopyPaste: string | null = pixData?.copyPasteCode ?? billing.pixCopyPaste ?? null;
    const checkoutUrl: string | null = billing.url ?? billing.checkoutUrl ?? null;

    console.log("[saas-billing] billing response:", JSON.stringify({
      billingId: billing.id,
      status: billing.status,
      hasQrCode: !!pixQrCode,
      hasCopyPaste: !!pixCopyPaste,
      hasCheckoutUrl: !!checkoutUrl,
      chargesCount: billing.charges?.length,
      firstCharge: billing.charges?.[0],
    }));

    // 4. Salvar no banco
    const { data: savedBilling, error: dbError } = await supabaseAdmin
      .from("saas_billings")
      .insert({
        tenant_id,
        plan: data.plan,
        provider: "abacatepay",
        abacate_billing_id: billing.id,
        abacate_customer_id: customerId,
        pix_qr_code: pixQrCode,
        pix_copy_paste: pixCopyPaste,
        checkout_url: checkoutUrl,
        amount: plan.price,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[saas-billing] db error:", dbError);
    }

    return {
      billingId: billing.id as string,
      internalBillingId: savedBilling?.id ?? null,
      status: billing.status as string,
      pixQrCode,
      pixCopyPaste,
      checkoutUrl,
      expiresAt: expiresAt.toISOString(),
    };
  });

/**
 * Consulta o status de um billing específico (para polling).
 */
export const getSaasBillingStatus = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ billingId: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { user } = await requireSupabaseAuth();
    const { tenant_id } = await assertOwner(user.id);

    const { data: billing } = await supabaseAdmin
      .from("saas_billings")
      .select("id, status, plan, paid_at, created_at")
      .eq("abacate_billing_id", data.billingId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    return billing;
  });

/**
 * Retorna o plano e assinatura atual do tenant.
 */
export const getMyCurrentPlan = createServerFn({ method: "GET" })
  .handler(async () => {
    const { user, supabase } = await requireSupabaseAuth();
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.tenant_id) return null;

    const { data: tenant } = await supabase
      .from("tenants")
      .select("plan, plan_status, trial_start_date, name")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    return tenant;
  });

/**
 * Retorna dados do usuário para pré-preencher o formulário.
 */
export const getMyProfileForBilling = createServerFn({ method: "GET" })
  .handler(async () => {
    const { user, supabase } = await requireSupabaseAuth();
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, phone, cpf")
      .eq("id", user.id)
      .maybeSingle();
    return {
      fullName: data?.full_name ?? user.email?.split("@")[0] ?? "",
      email: data?.email ?? user.email ?? "",
      phone: data?.phone ?? "",
      cpf: (data as unknown as Record<string, string> | null)?.cpf ?? "",
    };
  });
