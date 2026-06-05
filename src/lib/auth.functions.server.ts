import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const checkCredentialsUnique = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().trim().email(),
      phone: z.string().trim(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const phone = data.phone;

    // 1. Verificar se o e-mail já existe na tabela profiles
    const { data: emailMatch, error: emailError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (emailError) {
      console.error("[auth-check] Erro ao buscar e-mail no profiles:", emailError);
      throw new Error("Erro ao validar credenciais");
    }

    if (emailMatch) {
      return { available: false, reason: "email" as const };
    }

    // 2. Verificar se o telefone já existe na tabela profiles
    const { data: phoneMatch, error: phoneError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (phoneError) {
      console.error("[auth-check] Erro ao buscar telefone no profiles:", phoneError);
      throw new Error("Erro ao validar credenciais");
    }

    if (phoneMatch) {
      return { available: false, reason: "phone" as const };
    }

    return { available: true };
  });
