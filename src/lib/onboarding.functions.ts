import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";
import { sendWelcomeEmail } from "./email.server";


const BUSINESS_TYPES = [
  "lash_designer",
  "nail_designer",
  "manicure",
  "sobrancelhas",
  "estetica",
  "salao_beleza",
  "studio_beleza",
  "cabeleireiro",
  "outro",
] as const;

const onboardingSchema = z.object({
  // Step 1 — Empresa
  name: z.string().trim().min(1, "Informe o nome da empresa").max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  businessType: z.enum(BUSINESS_TYPES),
  whatsapp: z.string().trim().min(1).max(40),
  professionalsCount: z.string().trim().min(1).max(40),
  cnpj: z.string().trim().max(30).optional().nullable(),
  instagram: z.string().trim().max(60).optional().nullable(),
  // Step 2 — Endereço
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(60),
  // Step 3 — Expediente
  workingDays: z.array(z.string()).min(1, "Selecione ao menos um dia"),
  workingHours: z.string().trim().min(1).max(200),
  // Step 4 — Design
  logoUrl: z.string().trim().max(500).optional().nullable(),
  // Step 5 — WhatsApp settings
  whatsappSettings: z.object({
    reminder24h: z.boolean(),
    reminder1h: z.boolean(),
    followup30d: z.boolean(),
    followup60d: z.boolean(),
    followup90d: z.boolean(),
    notifyNew: z.boolean(),
    notifyCancel: z.boolean(),
  }),
  // Step 6 — Dados pessoais
  fullName: z.string().trim().min(1).max(120),
  ownerWhatsapp: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(160),
  cpf: z.string().trim().min(1).max(20),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .inputValidator((input) => onboardingSchema.parse(input))
  .handler(async ({ data }) => {
    const { user, supabase } = await requireSupabaseAuth();
    const userId = user.id;

    // ── 0. Verificar se já fez onboarding ──────────────────────────────────
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id,onboarded")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("[onboarding] Falha ao buscar perfil:", {
        etapa: "buscar_perfil",
        userId,
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
      });
      throw new Error(`Falha ao buscar perfil: ${profileError.message}`);
    }

    if (existingProfile?.onboarded && existingProfile.tenant_id) {
      return { tenantId: existingProfile.tenant_id };
    }

    // ── Se já tem tenant_id mas onboarded=false, significa que uma tentativa anterior
    //    criou tudo mas falhou ao marcar onboarded=true. Apenas finalizamos.
    if (existingProfile?.tenant_id) {
      const { error: fixError } = await supabase
        .from("profiles")
        .update({ onboarded: true, full_name: data.fullName, email: data.email, phone: data.ownerWhatsapp, cpf: data.cpf })
        .eq("id", userId);
      if (fixError) throw new Error(`Falha ao finalizar cadastro: ${fixError.message}`);
      return { tenantId: existingProfile.tenant_id };
    }

    // ── 1. Criar tenant ────────────────────────────────────────────────────
    const tenantId = crypto.randomUUID();
    const slug = `${data.slug}-${userId.slice(0, 8)}`;

    // Verificar se o slug já existe (retry com sufixo aleatório)
    const finalSlug = slug;

    const tenantPayload = {
      id: tenantId,
      name: data.name,
      slug: finalSlug,
      business_type: data.businessType,
      whatsapp: data.whatsapp,
      instagram: data.instagram ?? null,
      cnpj: data.cnpj ?? null,
      professionals_count: data.professionalsCount,
      address: data.address,
      city: data.city,
      state: data.state,
      working_days: data.workingDays,
      working_hours: data.workingHours,
      logo_url: data.logoUrl ?? null,
      whatsapp_settings: data.whatsappSettings,
    };

    const { error: tenantError } = await supabase
      .from("tenants")
      .insert(tenantPayload);

    if (tenantError) {
      console.error("[onboarding] Falha ao criar tenant:", {
        etapa: "criar_tenant",
        userId,
        tenantId,
        slug: finalSlug,
        message: tenantError.message,
        code: tenantError.code,
        details: tenantError.details,
        hint: tenantError.hint,
        payload: tenantPayload,
      });
      throw new Error(`Falha ao criar negócio: ${tenantError.message}`);
    }

    // ── 2. Criar user_role (owner) — idempotente ──────────────────────────
    const rolePayload = { user_id: userId, tenant_id: tenantId, role: "owner" as const };

    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert(rolePayload, { onConflict: "user_id,role", ignoreDuplicates: true });

    if (roleError) {
      console.error("[onboarding] Falha ao criar user_role:", {
        etapa: "criar_user_role",
        userId,
        tenantId,
        message: roleError.message,
        code: roleError.code,
        details: roleError.details,
        hint: roleError.hint,
        payload: rolePayload,
      });
      throw new Error(`Falha ao criar permissões de admin: ${roleError.message}`);
    }

    // ── 3. Atualizar profile ───────────────────────────────────────────────
    const profilePayload = {
      tenant_id: tenantId,
      full_name: data.fullName,
      email: data.email,
      phone: data.ownerWhatsapp,
      cpf: data.cpf,
      onboarded: true,
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profilePayload)
      .eq("id", userId);

    if (updateError) {
      console.error("[onboarding] Falha ao atualizar profile:", {
        etapa: "atualizar_profile",
        userId,
        tenantId,
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
        payload: profilePayload,
      });
      throw new Error(`Falha ao salvar dados pessoais: ${updateError.message}`);
    }

    // ── 4. Enviar e-mail de boas-vindas assincronamente e atualizar tenant ──
    try {
      await sendWelcomeEmail({
        email: data.email,
        name: data.fullName,
        businessName: data.name,
      });

      await supabase
        .from("tenants")
        .update({ welcome_email_sent: new Date().toISOString() })
        .eq("id", tenantId);
    } catch (err) {
      console.error("[onboarding] Falha ao disparar fluxo de e-mail de boas-vindas:", err);
    }

    return { tenantId };
  });
