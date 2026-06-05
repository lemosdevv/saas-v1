import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertCircle, Copy, ChevronLeft, CreditCard, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSaasBilling, getSaasBillingStatus, getMyProfileForBilling, type PlanId } from "@/lib/abacatepay-saas.functions";

// ── Máscaras ──────────────────────────────────────────────────────────────────
function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plan: PlanId | null;
  planLabel: string;
  planAmount: number;
  onSuccess?: () => void;
}

type Step = "review" | "payment";

// Benefícios reais de cada plano do Agenday para o resumo
const PLAN_BENEFITS: Record<PlanId, string[]> = {
  start: [
    "Link público de agendamento",
    "Cadastro ilimitado de serviços",
    "Agenda online 24h",
    "Clientes com histórico",
    "Página com sua marca",
  ],
  profissional: [
    "Tudo do Start",
    "Até 5 profissionais",
    "Lembretes e confirmações",
    "Templates de mensagem",
    "Dashboard de operação",
  ],
  studio: [
    "Tudo do Profissional",
    "10+ profissionais",
    "Unidades e equipe",
    "Relatórios e visão geral",
    "Controle avançado",
  ],
};

export function PaymentCheckoutModal({ open, onClose, plan, planLabel, planAmount, onSuccess }: Props) {
  const createBillingFn = useServerFn(createSaasBilling);
  const getStatusFn = useServerFn(getSaasBillingStatus);
  const getProfileFn = useServerFn(getMyProfileForBilling);

  const [step, setStep] = useState<Step>("review");
  const [loadingPix, setLoadingPix] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dados do formulário
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");

  // Dados do Pix
  const [billingId, setBillingId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copyPaste, setCopyPaste] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("00:00");

  // Carregar dados iniciais ao abrir o modal
  useEffect(() => {
    if (open) {
      setLoadingPix(true);
      getProfileFn()
        .then((profile) => {
          setName(profile.fullName);
          setEmail(profile.email);
          setPhone(maskPhone(profile.phone));
          setTaxId(maskCpf(profile.cpf));
        })
        .finally(() => setLoadingPix(false));
    } else {
      // Resetar ao fechar
      setStep("review");
      setBillingId(null);
      setQrCode(null);
      setCopyPaste(null);
      setExpiresAt(null);
      setError(null);
    }
  }, [open, getProfileFn]);

  // Polling para checar status do pagamento
  useEffect(() => {
    if (step !== "payment" || !billingId) return;

    const interval = setInterval(async () => {
      try {
        const res = await getStatusFn({ data: { billingId } });
        if (res?.status === "PAID" || res?.status === "paid") {
          clearInterval(interval);
          toast.success("Assinatura ativada com sucesso!");
          onSuccess?.();
          onClose();
        } else if (res?.status === "FAILED" || res?.status === "failed") {
          clearInterval(interval);
          setError("Ocorreu um erro no pagamento ou ele expirou.");
          setStep("review");
        }
      } catch (err) {
        console.error("Erro no polling", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, billingId, getStatusFn, onSuccess, onClose]);

  // Timer para o expira em
  useEffect(() => {
    if (!expiresAt || step !== "payment") return;
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const exp = new Date(expiresAt).getTime();
      const diff = exp - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        return;
      }

      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [expiresAt, step]);

  async function handleGenerateCharge(method: "PIX" | "CARD") {
    if (!plan) return;
    
    // Validações básicas do formulário
    if (name.length < 2 || email.length < 5 || taxId.length < 14 || phone.length < 14) {
      toast.error("Por favor, preencha todos os dados corretamente.");
      return;
    }

    setError(null);
    if (method === "PIX") setLoadingPix(true);
    else setLoadingCard(true);

    try {
      const res = await createBillingFn({
        data: {
          plan,
          payerEmail: email,
          payerName: name,
          payerTaxId: taxId,
          payerPhone: phone,
          methods: method === "PIX" ? ["PIX"] : ["CREDIT_CARD"],
        },
      });

      if (method === "PIX") {
        setBillingId(res.billingId);
        setQrCode(res.pixQrCode);
        setCopyPaste(res.pixCopyPaste);
        setExpiresAt(res.expiresAt);
        setStep("payment");
      } else {
        if (res.checkoutUrl) {
          window.open(res.checkoutUrl, "_blank");
          toast.success("Redirecionando para o pagamento seguro...");
          onClose();
        } else {
          toast.error("Erro ao gerar link de pagamento.");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar cobrança";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingPix(false);
      setLoadingCard(false);
    }
  }

  function handleCopy() {
    if (copyPaste) {
      navigator.clipboard.writeText(copyPaste);
      toast.success("Código Pix copiado!");
    }
  }

  if (!plan) return null;

  const benefits = PLAN_BENEFITS[plan] || [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogTitle className="sr-only">Checkout {planLabel}</DialogTitle>
      
      <DialogContent className="max-w-[440px] p-0 overflow-hidden bg-white border-border shadow-2xl rounded-2xl [&>button]:absolute [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:w-8 [&>button]:h-8 [&>button]:rounded-lg [&>button]:bg-white/10 [&>button]:hover:bg-white/20 [&>button]:text-white/70 [&>button]:hover:text-white [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:transition-colors [&>button>kbd]:hidden [&>button>span]:hidden">
        
        {/* Header Premium do Agenday (Usando Brand-900) */}
        <div className="bg-brand-900 px-12 py-8 text-white relative text-center">
          <div className="absolute top-0 left-0 w-full h-full bg-black/10 mix-blend-overlay pointer-events-none"></div>
          {step === "payment" && (
            <button 
              onClick={() => setStep("review")}
              className="absolute left-4 top-4 z-20 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="relative z-0 flex flex-col items-center">
            <h2 className="text-xl font-display font-medium tracking-tight">
              Assinar {planLabel}
            </h2>
            <div className="mt-2 text-3xl font-semibold font-display">
              R$ {planAmount.toFixed(2).replace(".", ",")}
              <span className="text-sm font-medium opacity-80 ml-1">/mês</span>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[75vh] bg-background">
          
          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Card de Resumo com estilo Agenday */}
              <div className="bg-surface-warm/60 border border-brand-100/50 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-center text-sm font-semibold text-ink border-b border-brand-100/40 pb-2">
                  <span>Plano Selecionado</span>
                  <span>Mensalidade</span>
                </div>
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex justify-between items-center text-sm text-ink-soft">
                    <span>{benefit}</span>
                    <Check className="w-4 h-4 text-success shrink-0" />
                  </div>
                ))}
                <div className="pt-3 mt-1 border-t border-brand-100/40 flex justify-between items-center text-base font-bold text-ink">
                  <span>Total</span>
                  <span className="text-brand-900">R$ {planAmount.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>

              {/* Form de Dados de Faturamento */}
              <div className="space-y-4">
                <div className="text-xs font-bold tracking-widest text-ink-soft uppercase border-b border-border pb-1">
                  Dados de faturamento
                </div>
                
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="billing-name" className="text-xs font-semibold text-ink uppercase tracking-wider">Nome completo</Label>
                    <Input 
                      id="billing-name"
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      className="h-11 bg-white border-border text-ink focus-visible:ring-1 focus-visible:ring-brand-500 rounded-xl" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="billing-email" className="text-xs font-semibold text-ink uppercase tracking-wider">E-mail</Label>
                    <Input 
                      id="billing-email"
                      type="email"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      className="h-11 bg-white border-border text-ink focus-visible:ring-1 focus-visible:ring-brand-500 rounded-xl" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="billing-taxid" className="text-xs font-semibold text-ink uppercase tracking-wider">CPF</Label>
                      <Input 
                        id="billing-taxid"
                        inputMode="numeric" 
                        placeholder="000.000.000-00" 
                        value={taxId} 
                        onChange={(e) => setTaxId(maskCpf(e.target.value))} 
                        maxLength={14} 
                        className="h-11 bg-white border-border text-ink focus-visible:ring-1 focus-visible:ring-brand-500 rounded-xl font-mono text-sm" 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="billing-phone" className="text-xs font-semibold text-ink uppercase tracking-wider">WhatsApp</Label>
                      <Input 
                        id="billing-phone"
                        inputMode="numeric" 
                        placeholder="(11) 99999-9999" 
                        value={phone} 
                        onChange={(e) => setPhone(maskPhone(e.target.value))} 
                        maxLength={15} 
                        className="h-11 bg-white border-border text-ink focus-visible:ring-1 focus-visible:ring-brand-500 rounded-xl font-mono text-sm" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Selo de Segurança */}
              <div className="flex items-start gap-2 text-xs text-ink-soft bg-surface-rose/40 p-3 rounded-xl border border-brand-100/30">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-brand-600 shrink-0" />
                <p>Pagamento processado com segurança pelo Abacate Pay. O valor exibido já considera todos os custos aplicáveis.</p>
              </div>

              {/* Action Buttons com cores do Agenday */}
              <div className="space-y-3 pt-1">
                <button 
                  type="button"
                  onClick={() => handleGenerateCharge("PIX")}
                  disabled={loadingPix || loadingCard}
                  className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl flex items-center justify-center transition-colors shadow-sm shadow-brand-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPix ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pagar com Pix"}
                </button>
                
                <div className="relative flex items-center py-1.5">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="flex-shrink-0 mx-4 text-xs font-medium text-ink-soft">ou</span>
                  <div className="flex-grow border-t border-border"></div>
                </div>

                <button 
                  type="button"
                  onClick={() => handleGenerateCharge("CARD")}
                  disabled={loadingPix || loadingCard}
                  className="w-full h-12 bg-white border border-brand-200 hover:bg-brand-50 text-brand-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingCard ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <CreditCard className="w-4.5 h-4.5 text-brand-600" />
                      Pagar com cartão
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

          {step === "payment" && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              
              <div className="text-center">
                <div className="text-xs font-bold tracking-widest text-ink-soft uppercase mb-1">Copiar e Pagar</div>
                <div className="text-3xl font-bold text-brand-900 font-display">
                  R$ {planAmount.toFixed(2).replace(".", ",")}
                </div>
              </div>

              {qrCode ? (
                <div className="bg-white border border-brand-100 p-4 rounded-2xl mx-auto w-fit shadow-sm">
                  <img src={qrCode} alt="QR Code Pix" className="w-44 h-44" />
                </div>
              ) : null}

              {/* Expira Em formatado com o tempo restante */}
              <div className="bg-surface-warm/60 border border-brand-100/50 rounded-xl p-4 flex justify-between items-center text-sm text-ink font-medium">
                <span>Expira em</span>
                <span className="text-base font-bold text-brand-600 font-mono tabular-nums">{timeLeft}</span>
              </div>

              <div className="space-y-4">
                <div className="text-center text-sm text-ink-soft">Ou copie o código Pix abaixo</div>
                
                <button 
                  onClick={handleCopy}
                  className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm shadow-brand-600/25"
                >
                  <Copy className="w-4 h-4" />
                  Copiar código Pix
                </button>

                <div className="h-12 bg-brand-50 border border-brand-100 rounded-xl flex items-center justify-center gap-2 text-sm text-brand-700 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600"></span>
                  </span>
                  Aguardando confirmação do banco...
                </div>
              </div>

              <p className="text-xs text-center text-ink-soft leading-relaxed px-4">
                Mantenha esta página aberta até a confirmação. Se sair, volte e gere um novo QR Code antes de pagar.
              </p>

            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
