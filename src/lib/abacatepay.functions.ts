import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";

const ABACATEPAY_API = "https://api.abacatepay.com/v2";

function getBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return "https://project--9cc3364d-9527-4f85-bd61-2a6ab765f1ad.lovable.app";
}

export const createAbacatePaymentLink = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ agendamento_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { user, supabase } = await requireSupabaseAuth();
    const token = process.env.ABACATEPAY_API_KEY;
    if (!token) throw new Error("ABACATEPAY_API_KEY não configurada");

    const { data: ag, error } = await supabase
      .from("agendamentos")
      .select("id,preco,inicio,cliente:clientes(nome,email),servico:servicos(nome)")
      .eq("id", data.agendamento_id)
      .maybeSingle();
      
    if (error) throw error;
    if (!ag) throw new Error("Agendamento não encontrado");
    if (!ag.preco || Number(ag.preco) <= 0) throw new Error("Agendamento sem preço definido");

    const servico = (ag.servico as unknown as { nome: string } | null)?.nome ?? "Agendamento";
    const cliente = (ag.cliente as unknown as { nome: string } | null)?.nome ?? "Cliente";
    const baseUrl = getBaseUrl();
    const priceInCents = Math.round(Number(ag.preco) * 100);

    // 1. Create a Product for this specific appointment in v2
    const productPayload = {
      name: `${servico} - ${cliente}`,
      description: `Agendamento: ${ag.id}`,
      price: priceInCents,
      externalId: ag.id
    };

    const prodRes = await fetch(`${ABACATEPAY_API}/products/create`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(productPayload),
    });

    const prodResult = await prodRes.json();
    if (!prodRes.ok) throw new Error(`Abacate Pay Product: ${JSON.stringify(prodResult)}`);

    const productId = prodResult.data?.id;
    if (!productId) throw new Error("ID do produto não retornado");

    // 2. Create the Checkout in v2
    const checkoutPayload = {
      items: [
        {
          id: productId,
          quantity: 1
        }
      ],
      returnUrl: `${baseUrl}/app/agenda?pagamento=ok`,
      completionUrl: `${baseUrl}/app/agenda?pagamento=ok`,
      metadata: {
        agendamentoId: ag.id
      }
    };

    const res = await fetch(`${ABACATEPAY_API}/checkouts/create`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(checkoutPayload),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(`Abacate Pay Checkout: ${JSON.stringify(result)}`);

    const link = result.data?.url;
    const paymentId = result.data?.id;

    if (!link) {
      throw new Error("Link de pagamento não retornado pela API");
    }

    await supabase
      .from("agendamentos")
      .update({ pagamento_link: link, pagamento_id: paymentId, pagamento_status: "aguardando" })
      .eq("id", ag.id);

    void user;
    return { link, paymentId };
  });
