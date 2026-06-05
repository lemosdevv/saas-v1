import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";

export const requireSuperAdmin = createMiddleware({ type: "function" })
  .server(async ({ next }) => {
    const { supabase, user } = await requireSupabaseAuth();
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (error || !data) {
      throw new Error("Forbidden: super_admin role required");
    }
    return next({ context: { supabase, user, isSuperAdmin: true as const } });
  });
