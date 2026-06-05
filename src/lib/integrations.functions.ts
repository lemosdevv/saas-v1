import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";

export const getIntegrationsStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    await requireSupabaseAuth(); // garante que o usuário está autenticado
    return {
      mercadoPago: !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
      abacatePay: !!process.env.ABACATEPAY_API_KEY,
      googleCalendar: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      whatsApp: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) || !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE_NAME) || !!(process.env.MYZAP_API_URL && (process.env.MYZAP_API_KEY || process.env.MYZAP_SESSION_KEY)),
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    };
  });
