import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";

function normalizePhoneForMeta(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error("Cliente sem telefone cadastrado");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

type WhatsAppSettings = {
  template_confirmacao?: string;
  template_lembrete?: string;
  template_pagamento?: string;
  language_code?: string;
};

const DEFAULT_SETTINGS: Required<WhatsAppSettings> = {
  template_confirmacao: "agendamento_confirmado",
  template_lembrete: "agendamento_lembrete",
  template_pagamento: "agendamento_pagamento",
  language_code: "pt_BR",
};

async function callMyZapApi(opts: { to: string; text: string }) {
  const url = process.env.MYZAP_API_URL;
  const apiKey = process.env.MYZAP_API_KEY || process.env.MYZAP_SESSION_KEY;
  const session = process.env.MYZAP_SESSION_NAME || "default";

  if (!url || !apiKey) {
    throw new Error("MYZAP não configurado no servidor");
  }

  const endpoint = `${url.replace(/\/$/, "")}/sendText`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "sessionkey": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: session,
      number: opts.to,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[myzap api error]", res.status, errText);
    throw new Error(`MyZap API ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function callEvolutionApi(opts: { to: string; text: string }) {
  const url = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE_NAME;

  if (!url || !apiKey || !instance) {
    throw new Error("EVOLUTION_API não configurada no servidor");
  }

  const endpoint = `${url.replace(/\/$/, "")}/message/sendText/${instance}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "apikey": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      number: opts.to,
      text: opts.text,
      delay: 1200,
      linkPreview: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[evolution api error]", res.status, errText);
    throw new Error(`Evolution API ${res.status}: ${errText.slice(0, 200)}`);
  }
  return res.json();
}

async function callMetaTemplate(opts: {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  buttonUrlParam?: string;
}) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error("WHATSAPP não configurado");
  }

  const components: unknown[] = [
    {
      type: "body",
      parameters: opts.parameters.map((text) => ({ type: "text", text })),
    },
  ];
  if (opts.buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: opts.buttonUrlParam }],
    });
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.languageCode },
        components,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[meta whatsapp]", res.status, text);
    throw new Error(`Meta API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const sendWhatsAppTemplate = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        agendamento_id: z.string().uuid(),
        tipo: z.enum(["confirmacao", "lembrete", "pagamento"]).default("confirmacao"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireSupabaseAuth();
    const { data: ag, error } = await supabase
      .from("agendamentos")
      .select(
        "id,tenant_id,inicio,pagamento_link,cliente:clientes(nome,telefone),servico:servicos(nome),profissional:profissionais(nome)",
      )
      .eq("id", data.agendamento_id)
      .maybeSingle();
    if (error || !ag) throw new Error("Agendamento não encontrado");

    const cliente = ag.cliente as unknown as { nome: string; telefone: string | null } | null;
    if (!cliente?.telefone) throw new Error("Cliente sem telefone cadastrado");

    const toPhone = normalizePhoneForMeta(cliente.telefone);

    const inicio = new Date(ag.inicio);
    const formattedDate = inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const formattedTime = inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const servName = (ag.servico as unknown as { nome: string } | null)?.nome ?? "";
    const profName = (ag.profissional as unknown as { nome: string } | null)?.nome ?? "";

    const isMyZap = !!process.env.MYZAP_API_URL;
    const isEvolution = !!process.env.EVOLUTION_API_URL;

    if (isMyZap || isEvolution) {
      let text = "";
      if (data.tipo === "confirmacao") {
        text = `Olá ${cliente.nome}! Seu agendamento de ${servName} com ${profName} no dia ${formattedDate} às ${formattedTime} está confirmado.`;
      } else if (data.tipo === "lembrete") {
        text = `Oi ${cliente.nome}, passando para lembrar do seu ${servName} no dia ${formattedDate} às ${formattedTime} com ${profName}. Te esperamos!`;
      } else if (data.tipo === "pagamento") {
        if (!ag.pagamento_link)
          throw new Error("Agendamento sem link de pagamento. Gere o link primeiro.");
        text = `${cliente.nome}, segue o link para pagamento do seu ${servName} do dia ${formattedDate} às ${formattedTime}: ${ag.pagamento_link}`;
      }

      if (isMyZap) {
        await callMyZapApi({ to: toPhone, text });
      } else {
        await callEvolutionApi({ to: toPhone, text });
      }
    } else {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("whatsapp_settings")
        .eq("id", ag.tenant_id)
        .maybeSingle();
      const settings = {
        ...DEFAULT_SETTINGS,
        ...((tenant?.whatsapp_settings ?? {}) as WhatsAppSettings),
      };

      const templateName =
        data.tipo === "lembrete"
          ? settings.template_lembrete
          : data.tipo === "pagamento"
            ? settings.template_pagamento
            : settings.template_confirmacao;

      const parameters = [
        cliente.nome,
        inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
        formattedTime,
        servName,
        profName,
      ];

      let buttonUrlParam: string | undefined;
      if (data.tipo === "pagamento") {
        if (!ag.pagamento_link)
          throw new Error("Agendamento sem link de pagamento. Gere o link primeiro.");
        buttonUrlParam = ag.pagamento_link;
      }

      await callMetaTemplate({
        to: toPhone,
        templateName,
        languageCode: settings.language_code,
        parameters,
        buttonUrlParam,
      });
    }

    if (data.tipo === "lembrete") {
      await supabase
        .from("agendamentos")
        .update({ lembrete_enviado_em: new Date().toISOString() })
        .eq("id", ag.id);
    }

    return { ok: true };
  });

export const getWhatsAppSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabase } = await requireSupabaseAuth();
    const { data: profile } = await supabase.from("profiles").select("tenant_id").single();
    if (!profile?.tenant_id) return { ...DEFAULT_SETTINGS, configured: false };
    const { data: tenant } = await supabase
      .from("tenants")
      .select("whatsapp_settings")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    const settings = {
      ...DEFAULT_SETTINGS,
      ...((tenant?.whatsapp_settings ?? {}) as WhatsAppSettings),
    };
    return { ...settings, configured: true };
  });

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        template_confirmacao: z.string().trim().min(1).max(100),
        template_lembrete: z.string().trim().min(1).max(100),
        template_pagamento: z.string().trim().min(1).max(100),
        language_code: z.string().trim().min(2).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabase } = await requireSupabaseAuth();
    const { data: profile } = await supabase.from("profiles").select("tenant_id").single();
    if (!profile?.tenant_id) throw new Error("Tenant não encontrado");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("whatsapp_settings")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    const current = (tenant?.whatsapp_settings ?? {}) as Record<string, unknown>;
    const next = { ...current, ...data };

    const { error } = await supabase
      .from("tenants")
      .update({ whatsapp_settings: next })
      .eq("id", profile.tenant_id);
    if (error) throw error;
    return { ok: true };
  });
