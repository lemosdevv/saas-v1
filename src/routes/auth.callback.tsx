import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const [status, setStatus] = useState("Finalizando login...");

  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      try {
        console.log("[auth callback] URL atual:", window.location.href);

        const url = new URL(window.location.href);
        const next = url.searchParams.get("next") || "/app";

        // 1. Verificar se o Supabase redirecionou com um erro na URL
        const urlError = url.searchParams.get("error") || url.searchParams.get("error_description");
        if (urlError) {
          const desc = url.searchParams.get("error_description") || urlError;
          const decodedDesc = decodeURIComponent(desc.replace(/\+/g, " "));
          setStatus(`Erro do Supabase: ${decodedDesc}`);
          console.error("[auth callback] Erro de autenticação:", decodedDesc);
          setTimeout(() => {
            window.location.replace("/entrar");
          }, 5000);
          return;
        }

        const code = url.searchParams.get("code");
        const nextParam = url.searchParams.get("next"); // keep it clear
        console.log("[auth callback] code:", code);
        console.log("[auth callback] next:", next);

        let session = null;

        if (code) {
          // Remove o código da URL imediatamente para evitar trocas duplicadas/erros no StrictMode
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("code");
          window.history.replaceState({}, "", cleanUrl.toString());

          setStatus("Validando acesso...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          console.log("[auth callback] exchange data:", data);
          console.log("[auth callback] exchange error:", error);

          if (error) {
            setStatus(`Erro no login: ${error.message}`);
            setTimeout(() => {
              window.location.replace("/entrar");
            }, 1500);
            return;
          }
          session = data?.session;
        }

        // Caso o login seja via fluxo Implicit (hash) e o SDK ainda esteja processando o hash da URL,
        // esperamos que o evento SIGNED_IN seja disparado pelo onAuthStateChange antes de prosseguir.
        if (!session && window.location.hash.includes("access_token")) {
          setStatus("Processando credenciais...");
          console.log("[auth callback] Fragmento de hash detectado, aguardando sessão...");

          const sessionPromise = new Promise<any>((resolve) => {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
              console.log("[auth callback] onAuthStateChange no hash wait:", event, !!newSession);
              if (newSession) {
                subscription.unsubscribe();
                resolve(newSession);
              }
            });

            // Timeout de segurança de 3 segundos
            setTimeout(() => {
              subscription.unsubscribe();
              resolve(null);
            }, 3000);
          });

          session = await sessionPromise;
        }

        // Fallback final: tenta obter a sessão atual
        if (!session) {
          setStatus("Verificando sessão...");
          const { data, error: sessionError } = await supabase.auth.getSession();
          console.log("[auth callback] getSession result:", { hasSession: !!data?.session, sessionError });
          if (!sessionError && data?.session) {
            session = data.session;
          }
        }

        if (!session) {
          setStatus("Sessão não encontrada. Voltando para login...");
          setTimeout(() => {
            window.location.replace("/entrar");
          }, 1500);
          return;
        }

        setStatus("Login concluído. Abrindo painel...");
        setTimeout(() => {
          if (mounted) {
            window.location.replace(next);
          }
        }, 500);
      } catch (error) {
        console.error("[auth callback] erro inesperado:", error);
        setStatus("Erro inesperado no login. Voltando para login...");
        setTimeout(() => {
          window.location.replace("/entrar");
        }, 1500);
      }
    }

    handleCallback();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-warm px-4">
      <div className="text-center">
        <p className="text-sm text-ink-soft">{status}</p>
      </div>
    </div>
  );
}