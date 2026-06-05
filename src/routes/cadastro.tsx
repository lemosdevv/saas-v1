import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MessageCircle, CheckCircle2, Sparkles, ShieldCheck, Clock3 } from "lucide-react";
import logoAgenday from "@/assets/logo.png";
import signupIllustration from "@/assets/Login-rafiki.png";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal-constants";
import {
  validatePassword,
  PASSWORD_RULES_TEXT,
  genericAuthErrorMessage,
} from "@/lib/password-policy";
import { checkCredentialsUnique } from "@/lib/auth.functions.server";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Teste grátis — Agenday" },
      {
        name: "description",
        content:
          "Crie sua conta Agenday em menos de 1 minuto e teste grátis por 15 dias. Sem cartão de crédito.",
      },
      { property: "og:title", content: "Teste grátis — Agenday" },
      {
        property: "og:description",
        content: "Crie sua conta Agenday e teste grátis por 15 dias. Sem cartão de crédito.",
      },
      { property: "og:url", content: "https://agenday.lovable.app/cadastro" },
    ],
    links: [{ rel: "canonical", href: "https://agenday.lovable.app/cadastro" }],
  }),
  component: SignupPage,
});

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState<{
    name: string;
    waLink: string;
    needsEmailConfirm: boolean;
  } | null>(null);

  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) {
      toast.error("Por favor, insira o código de 6 dígitos.");
      return;
    }

    setVerifying(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode,
        type: "signup",
      });

      if (error) {
        setVerifying(false);
        toast.error(`Código incorreto ou expirado: ${error.message}`);
        return;
      }

      toast.success("E-mail verificado com sucesso!");

      if (data.user) {
        const phone = normalizePhone(whatsapp);
        await supabase
          .from("profiles")
          .update({
            phone,
            full_name: fullName,
          })
          .eq("id", data.user.id);
      }

      window.location.replace("/auth/callback?next=/app");
    } catch (err) {
      setVerifying(false);
      console.error("[otp-verify] Erro:", err);
      toast.error("Erro ao verificar código.");
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });

      if (error) {
        toast.error(`Erro ao reenviar: ${error.message}`);
      } else {
        toast.success("Código de confirmação reenviado para seu e-mail!");
      }
    } catch (err) {
      toast.error("Erro ao reenviar código.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptedTerms) {
      toast.error("Você precisa aceitar os Termos de Uso e a Política de Privacidade.");
      return;
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }

    const phone = normalizePhone(whatsapp);
    if (phone.length < 12) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }

    setLoading(true);

    try {
      const checkRes = await checkCredentialsUnique({
        data: {
          email: email.trim(),
          phone,
        },
      });

      if (!checkRes.available) {
        setLoading(false);
        if (checkRes.reason === "email") {
          toast.error("Este e-mail já está cadastrado. Faça login para continuar.");
        } else {
          toast.error("Este WhatsApp já está cadastrado. Faça login para continuar.");
        }
        return;
      }
    } catch (err) {
      setLoading(false);
      toast.error("Erro ao validar credenciais. Tente novamente.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
        data: {
          full_name: fullName.trim(),
          phone,
        },
      },
    });

    if (error) {
      setLoading(false);

      if (import.meta.env.DEV) {
        console.warn("[auth] sign-up failed:", error.message);
      }

      const msg = error.message.toLowerCase();

      if (msg.includes("registered") || msg.includes("already")) {
        toast.error("Não foi possível criar a conta. Se você já tem cadastro, faça login.");
      } else {
        toast.error(genericAuthErrorMessage(error.message));
      }

      return;
    }

    const hasSession = !!data.session;

    if (hasSession && data.user) {
      await supabase
        .from("profiles")
        .update({
          phone,
          full_name: fullName,
        })
        .eq("id", data.user.id);
    }

    const dashboardUrl = `${window.location.origin}/auth/callback?next=/app`;
    const firstName = fullName.trim().split(" ")[0] || "Tudo certo";

    const message = `Olá, ${firstName}! 👋\n\nSeu acesso à Agenday está pronto.\nAcesse seu dashboard aqui: ${dashboardUrl}`;
    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    setLoading(false);

    setSuccess({
      name: firstName,
      waLink,
      needsEmailConfirm: !hasSession,
    });
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
              <Sparkles className="h-4 w-4" />
              Teste grátis por 15 dias
            </div>

            <h2 className="mt-5 font-display text-4xl font-bold tracking-tight">
              Comece a organizar sua agenda hoje
            </h2>

            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              Crie sua conta em poucos minutos, sem cartão de crédito, e comece a gerenciar seus
              horários com mais profissionalismo.
            </p>

            <img
              src={signupIllustration}
              alt=""
              aria-hidden="true"
              className="mx-auto mt-7 h-[360px] max-h-[38vh] w-auto object-contain"
            />

            <div className="mt-5 grid gap-3 text-sm text-white/80">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <span>Teste grátis por 15 dias</span>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <Clock3 className="h-5 w-5 shrink-0 text-brand-200" />
                <span>Cadastro rápido, sem burocracia</span>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <ShieldCheck className="h-5 w-5 shrink-0 text-brand-200" />
                <span>Sem cartão de crédito para começar</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex h-dvh items-center justify-center overflow-hidden px-4 py-5 sm:px-6 lg:px-10">
        <div className="w-full max-w-[430px]">
          <Link to="/" className="mb-5 flex justify-center" aria-label="Agenday">
            <img src={logoAgenday} alt="Agenday" className="h-24 w-auto object-contain" />
          </Link>

          <div className="w-full">
            {success ? (
              success.needsEmailConfirm ? (
                // 1. TELA DE DIGITAR O CÓDIGO OTP (Substitui o formulário na mesma coluna!)
                <>
                  <div className="mb-4">
                    <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                      <Clock3 className="h-3.5 w-3.5" />
                      Confirmação pendente
                    </span>

                    <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink">
                      Verifique seu e-mail, {success.name}! ✉️
                    </h1>

                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                      Enviamos um código de verificação de 6 dígitos para o e-mail <strong className="text-ink">{email}</strong>.
                    </p>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-6 flex flex-col items-center">
                    <div className="flex justify-center w-full">
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={(val) => setOtpCode(val)}
                        disabled={verifying}
                      >
                        <InputOTPGroup className="gap-2">
                          <InputOTPSlot index={0} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                          <InputOTPSlot index={1} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                          <InputOTPSlot index={2} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                          <InputOTPSlot index={3} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                          <InputOTPSlot index={4} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                          <InputOTPSlot index={5} className="w-12 h-12 text-lg rounded-xl border border-border bg-white" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="min-h-11 w-full rounded-full text-base font-semibold shadow-md bg-brand-600 hover:bg-brand-700 text-white cursor-pointer"
                      disabled={verifying || otpCode.length < 6}
                    >
                      {verifying ? "Verificando código..." : "Confirmar Código"}
                    </Button>
                  </form>

                  <div className="mt-6 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resending || verifying}
                      className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {resending ? "Reenviando..." : "Não recebeu o e-mail? Reenviar código"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSuccess(null);
                        setOtpCode("");
                      }}
                      disabled={verifying}
                      className="text-sm text-ink-soft hover:underline cursor-pointer"
                    >
                      Voltar e alterar e-mail
                    </button>
                  </div>
                </>
              ) : (
                // 2. TELA DE SUCESSO COMPLETO
                <>
                  <div className="text-center">
                    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>

                    <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                      Tudo pronto, {success.name}! 🎉
                    </h1>

                    <p className="mt-2 text-sm leading-relaxed text-ink-soft mb-6">
                      Sua conta foi criada. Acesse o dashboard ou receba o link no WhatsApp.
                    </p>

                    <Link
                      to="/app"
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-brand-700"
                    >
                      Ir para o dashboard
                    </Link>

                    <a
                      href={success.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#25D366]/40 bg-white px-6 py-3 text-sm font-medium text-[#128C7E] transition hover:bg-[#25D366]/5"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Receber link no WhatsApp
                    </a>
                  </div>
                </>
              )
            ) : (
              // 3. FORMULÁRIO DE CADASTRO PADRÃO
              <>
                <div className="mb-4">
                  <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Teste grátis por 15 dias
                  </span>

                  <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink">
                    Comece a organizar seus agendamentos hoje
                  </h1>

                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    Crie sua conta grátis em menos de 1 minuto. Sem cartão de crédito.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Nome completo</Label>
                    <Input
                      id="fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      placeholder="Ex: Nome Sobrenome"
                      className="min-h-11 bg-white text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail profissional</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="voce@email.com"
                      className="min-h-11 bg-white text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp">WhatsApp com DDD</Label>
                    <Input
                      id="whatsapp"
                      type="tel"
                      required
                      placeholder="(00) 90000-0000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      autoComplete="tel"
                      className="min-h-11 bg-white text-base"
                    />
                    <p className="text-xs leading-relaxed text-ink-soft">
                      Usaremos para enviar seu link de acesso e avisos importantes.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Crie uma senha</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="min-h-11 bg-white text-base"
                    />
                    <p className="text-xs leading-relaxed text-ink-soft">{PASSWORD_RULES_TEXT}</p>
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="terms"
                      checked={acceptedTerms}
                      onCheckedChange={(v) => setAcceptedTerms(v === true)}
                      className="mt-0.5"
                    />

                    <Label
                      htmlFor="terms"
                      className="cursor-pointer text-xs font-normal leading-relaxed text-ink-soft"
                    >
                      Li e concordo com os{" "}
                      <Link
                        to="/termos"
                        target="_blank"
                        className="font-medium text-brand-600 hover:underline"
                      >
                        Termos de Uso
                      </Link>{" "}
                      e a{" "}
                      <Link
                        to="/privacidade"
                        target="_blank"
                        className="font-medium text-brand-600 hover:underline"
                      >
                        Política de Privacidade
                      </Link>
                      .
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="min-h-11 w-full rounded-full text-base font-semibold shadow-md cursor-pointer"
                    disabled={loading || !acceptedTerms}
                  >
                    {loading ? "Criando sua conta..." : "Criar minha conta grátis"}
                  </Button>
                </form>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>

                  <div className="relative flex justify-center text-xs">
                    <span className="bg-surface-warm px-2 text-ink-soft">ou continue com</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full rounded-full bg-white cursor-pointer"
                  disabled={loading || !acceptedTerms}
                  onClick={async () => {
                    if (!acceptedTerms) {
                      toast.error("Aceite os Termos antes de continuar com Google.");
                      return;
                    }

                    try {
                      sessionStorage.setItem(
                        "agenday.pending_terms_accept",
                        JSON.stringify({
                          t: TERMS_VERSION,
                          p: PRIVACY_VERSION,
                        }),
                      );
                    } catch {
                      // noop
                    }

                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback?next=/app`,
                      },
                    });

                    if (error) {
                      toast.error("Não foi possível continuar com Google. Tente novamente.");
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

                <p className="mt-4 text-center text-sm text-ink-soft">
                  Já tem uma conta?{" "}
                  <Link to="/entrar" className="font-medium text-brand-600 hover:underline">
                    Entrar
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
