import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { genericAuthErrorMessage } from "@/lib/password-policy";
import { logAuthEvent } from "@/lib/security-log.functions";
import logoAgenday from "@/assets/logo.png";
import loginIllustration from "@/assets/computer-login-amico.png";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — Agenday" },
      {
        name: "description",
        content: "Acesse sua conta Agenday e gerencie sua agenda, clientes e profissionais.",
      },
      { property: "og:title", content: "Entrar — Agenday" },
      { property: "og:description", content: "Acesse sua conta Agenday." },
      { property: "og:url", content: "https://agenday.lovable.app/entrar" },
    ],
    links: [{ rel: "canonical", href: "https://agenday.lovable.app/entrar" }],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const logAuth = useServerFn(logAuthEvent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setLoading(false);

    const emailHashed = (await sha256Hex(normalizedEmail)).slice(0, 32);

    if (error) {
      if (import.meta.env.DEV) {
        console.warn("[auth] sign-in failed:", error.message);
      }

      logAuth({
        data: {
          eventType: "auth.signin.failed",
          emailHashed,
        },
      }).catch(() => {});

      toast.error(genericAuthErrorMessage(error.message));
      return;
    }

    logAuth({
      data: {
        eventType: "auth.signin.success",
        emailHashed,
      },
    }).catch(() => {});

    toast.success("Acesso realizado com sucesso!");

    if (redirect) {
      try {
        window.location.href = decodeURIComponent(redirect);
        return;
      } catch {
        // fallthrough
      }
    }

    navigate({ to: "/app" });
  };

  return (
    <div className="h-dvh overflow-hidden bg-surface-warm lg:grid lg:grid-cols-2">
      <aside className="relative hidden h-dvh overflow-hidden bg-slate-950 px-10 py-8 text-white lg:flex">
        <div className="absolute -left-28 top-20 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -right-28 bottom-10 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_35%)]" />

        <div className="relative z-10 mx-auto flex h-full max-w-xl flex-col justify-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
              <LockKeyhole className="h-4 w-4" />
              Acesso seguro à sua conta
            </div>

            <h2 className="mt-5 font-display text-4xl font-bold tracking-tight">
              Sua agenda sempre acessível
            </h2>

            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              Entre para gerenciar horários, clientes e atendimentos em uma experiência simples e
              profissional.
            </p>

            <img
              src={loginIllustration}
              alt=""
              aria-hidden="true"
              className="mx-auto mt-6 h-[min(42vh,420px)] w-auto object-contain"
            />

            <div className="mt-5 grid gap-3 text-sm text-white/80">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <span>Acesso rápido e seguro</span>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <CalendarDays className="h-5 w-5 shrink-0 text-brand-200" />
                <span>Agenda, clientes e horários em um só lugar</span>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <ShieldCheck className="h-5 w-5 shrink-0 text-brand-200" />
                <span>Ambiente preparado para sua rotina profissional</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex h-dvh items-center justify-center overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
        <div className="w-full max-w-[430px]">
          <Link to="/" className="mb-7 flex justify-center" aria-label="Agenday">
            <img src={logoAgenday} alt="Agenday" className="h-24 w-auto object-contain" />
          </Link>

          <div className="w-full">
            <div className="mb-6">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                <LockKeyhole className="h-3.5 w-3.5" />
                Login seguro
              </span>

              <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
                Bem-vindo de volta
              </h1>

              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Acesse sua agenda, clientes e horários em poucos segundos.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mb-4 min-h-12 w-full rounded-full bg-white"
              disabled={loading}
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=/app`,
                  },
                });

                if (error) {
                  toast.error("Não foi possível entrar com Google. Tente novamente.");
                }
              }}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
              Continuar com Google
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface-warm px-2 text-ink-soft">ou entre com seu e-mail</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="voce@email.com"
                  className="min-h-12 bg-white text-base"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password">Senha</Label>
                  <a
                    href="#"
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!email) {
                        toast.error("Por favor, digite seu e-mail no campo acima primeiro.");
                        return;
                      }
                      try {
                        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
                          redirectTo: `${window.location.origin}/auth/callback?next=/app/alterar-senha`,
                        });
                        if (error) {
                          toast.error(error.message);
                        } else {
                          toast.success("E-mail de recuperação enviado com sucesso!");
                        }
                      } catch (err) {
                        toast.error("Erro ao enviar e-mail de recuperação.");
                      }
                    }}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Esqueci minha senha
                  </a>
                </div>

                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="min-h-12 bg-white text-base"
                />
              </div>

              <Button
                type="submit"
                className="min-h-12 w-full rounded-full text-base font-semibold shadow-md"
                disabled={loading}
              >
                {loading ? "Acessando..." : "Acessar minha agenda"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-soft">
              Ainda não tem conta?{" "}
              <Link to="/cadastro" className="font-medium text-brand-600 hover:underline">
                Criar conta grátis
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
