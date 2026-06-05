import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseServerEnv() {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const supabaseKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  return {
    supabaseUrl,
    supabaseKey,
  };
}

export async function requireSupabaseAuth() {
  const { supabaseUrl, supabaseKey } = getSupabaseServerEnv();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env file.",
    );
  }

  const request = getRequest();

  if (!request?.headers) {
    throw new Error("Request headers not available.");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return {
    user,
    supabase,
  };
}