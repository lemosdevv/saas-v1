import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { completeOnboarding } from "@/lib/onboarding.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  onlyDigits,
  maskPhoneBR,
  maskCNPJ,
  maskCPF,
  isValidPhoneBR,
  isValidCNPJ,
  isValidCPF,
} from "@/lib/br-validators";
import logoSrc from "@/assets/logo.png";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Configurar negócio — Agenday" }] }),
  component: OnboardingPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { value: "lash_designer", label: "Lash Designer" },
  { value: "nail_designer", label: "Nail Designer" },
  { value: "manicure", label: "Manicure" },
  { value: "sobrancelhas", label: "Design de Sobrancelhas" },
  { value: "estetica", label: "Estética" },
  { value: "salao_beleza", label: "Salão de Beleza" },
  { value: "studio_beleza", label: "Studio de Beleza" },
  { value: "cabeleireiro", label: "Cabeleireiro(a)" },
  { value: "outro", label: "Outro segmento" },
] as const;

type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

const PROFESSIONALS_OPTIONS = [
  "Somente eu",
  "2 a 3 profissionais",
  "4 a 6 profissionais",
  "7 ou mais profissionais",
];

const WEEK_DAYS = [
  { value: "seg", label: "Seg" },
  { value: "ter", label: "Ter" },
  { value: "qua", label: "Qua" },
  { value: "qui", label: "Qui" },
  { value: "sex", label: "Sex" },
  { value: "sab", label: "Sáb" },
  { value: "dom", label: "Dom" },
] as const;

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
  "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
  "RS","RO","RR","SC","SP","SE","TO",
];

const STEPS = [
  { id: 1, label: "Seu negócio" },
  { id: 2, label: "Atendimento" },
  { id: 3, label: "Sobre você" },
];

// ─── Form State ───────────────────────────────────────────────────────────────

type FormState = {
  // Step 1
  businessType: BusinessType;
  name: string;
  whatsapp: string;
  professionalsCount: string;
  cnpj: string;
  instagram: string;
  logoUrl: string;
  // Step 2
  address: string;
  city: string;
  state: string;
  workingDays: string[];
  workingHours: string;
  // Step 3
  fullName: string;
  ownerWhatsapp: string;
  email: string;
  cpf: string;
  // Notifications
  reminder24h: boolean;
  notifyNew: boolean;
};

type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateField(key: FieldKey, value: unknown): string | undefined {
  const req = "Campo obrigatório";
  switch (key) {
    case "name":
      return !String(value ?? "").trim() ? req : undefined;
    case "whatsapp":
    case "ownerWhatsapp": {
      const v = String(value ?? "").trim();
      if (!v) return req;
      return isValidPhoneBR(v) ? undefined : "Informe um número válido com DDD";
    }
    case "cnpj": {
      const v = String(value ?? "").trim();
      if (!v) return undefined;
      return isValidCNPJ(v) ? undefined : "CNPJ inválido";
    }
    case "professionalsCount":
      return !String(value ?? "").trim() ? req : undefined;
    case "address":
    case "city":
    case "state":
    case "workingHours":
    case "fullName":
      return !String(value ?? "").trim() ? req : undefined;
    case "workingDays":
      return Array.isArray(value) && value.length > 0
        ? undefined
        : "Selecione ao menos um dia";
    case "email": {
      const v = String(value ?? "").trim();
      if (!v) return req;
      return EMAIL_RE.test(v) ? undefined : "E-mail inválido";
    }
    case "cpf": {
      const v = String(value ?? "").trim();
      if (!v) return req;
      return isValidCPF(v) ? undefined : "CPF inválido";
    }
    default:
      return undefined;
  }
}

const STEP_FIELDS: Record<number, FieldKey[]> = {
  1: ["name", "whatsapp", "professionalsCount"],
  2: ["address", "city", "state", "workingDays", "workingHours"],
  3: ["fullName", "ownerWhatsapp", "email", "cpf"],
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const [form, setForm] = useState<FormState>({
    businessType: "lash_designer",
    name: "",
    whatsapp: "",
    professionalsCount: PROFESSIONALS_OPTIONS[0],
    cnpj: "",
    instagram: "",
    logoUrl: "",
    address: "",
    city: "",
    state: "SP",
    workingDays: ["seg", "ter", "qua", "qui", "sex"],
    workingHours: "",
    fullName: "",
    ownerWhatsapp: "",
    email: user?.email ?? "",
    cpf: "",
    reminder24h: true,
    notifyNew: true,
  });

  useEffect(() => {
    if (profile?.onboarded) navigate({ to: "/app" });
  }, [profile, navigate]);

  useEffect(() => {
    if (user?.email && !form.email) {
      setForm((f) => ({ ...f, email: user.email ?? "" }));
    }
  }, [user, form.email]);

  const set = <K extends FieldKey>(key: K, val: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      const msg = validateField(key, val);
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
  };

  const onBlur = (key: FieldKey) => {
    const msg = validateField(key, (form as Record<FieldKey, unknown>)[key]);
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg;
      else delete next[key];
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day],
    }));
  };

  const validateStep = (): boolean => {
    const fields = STEP_FIELDS[step] ?? [];
    const newErrors: Errors = {};
    let ok = true;
    for (const k of fields) {
      const msg = validateField(k, (form as Record<FieldKey, unknown>)[k]);
      if (msg) { newErrors[k] = msg; ok = false; }
    }
    setErrors(newErrors);
    if (!ok) toast.error("Preencha os campos obrigatórios para continuar.");
    return ok;
  };

  const next = () => {
    if (validateStep()) setStep((s) => Math.min(3, s + 1));
  };

  const prev = () => setStep((s) => Math.max(1, s - 1));

  const handleFinish = async () => {
    if (!validateStep() || !user) return;
    setSubmitting(true);
    const baseSlug = slugify(form.name) || `negocio-${user.id.slice(0, 6)}`;
    try {
      await completeOnboarding({
        data: {
          name: form.name,
          slug: baseSlug,
          businessType: form.businessType,
          whatsapp: onlyDigits(form.whatsapp),
          professionalsCount: form.professionalsCount,
          cnpj: form.cnpj ? onlyDigits(form.cnpj) : null,
          instagram: form.instagram || null,
          address: form.address,
          city: form.city,
          state: form.state,
          workingDays: form.workingDays,
          workingHours: form.workingHours,
          logoUrl: form.logoUrl || null,
          whatsappSettings: {
            reminder24h: form.reminder24h,
            reminder1h: false,
            followup30d: false,
            followup60d: false,
            followup90d: false,
            notifyNew: form.notifyNew,
            notifyCancel: false,
          },
          fullName: form.fullName,
          ownerWhatsapp: onlyDigits(form.ownerWhatsapp),
          email: form.email,
          cpf: onlyDigits(form.cpf),
        },
      });
      await refreshProfile();
      setDone(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return <SuccessScreen onContinue={() => navigate({ to: "/app" })} />;
  }

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-surface-warm flex flex-col">
      {/* ── Topbar ── */}
      <header className="flex items-center justify-between px-6 pt-6 pb-2 max-w-2xl mx-auto w-full">
        <img src={logoSrc} alt="Agenday" className="h-12 w-auto" />
        <span className="text-xs text-ink-soft font-medium tabular-nums">
          Etapa {step} de 3
        </span>
      </header>

      {/* ── Progress Bar ── */}
      <div className="px-6 max-w-2xl mx-auto w-full mt-2">
        <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={cn(
                "text-[11px] font-medium transition-colors",
                s.id === step ? "text-brand-700" : "text-ink-soft"
              )}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Form Container ── */}
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-xl">
          {step === 1 && (
            <Step1
              form={form}
              set={set}
              errors={errors}
              onBlur={onBlur}
            />
          )}
          {step === 2 && (
            <Step2
              form={form}
              set={set}
              errors={errors}
              onBlur={onBlur}
              toggleDay={toggleDay}
            />
          )}
          {step === 3 && (
            <Step3
              form={form}
              set={set}
              errors={errors}
              onBlur={onBlur}
            />
          )}

          {/* ── Navigation ── */}
          <div
            className={cn(
              "mt-8 flex gap-3",
              step === 1 ? "justify-end" : "justify-between"
            )}
          >
            {step > 1 && (
              <button
                type="button"
                onClick={prev}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-white text-ink text-sm font-medium hover:bg-surface-warm transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Anterior
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 active:scale-[0.98] transition-all shadow-sm"
              >
                Continuar
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm shadow-brand-600/25 disabled:opacity-60 disabled:cursor-not-allowed min-w-[180px] justify-center"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Finalizar configuração
                  </>
                )}
              </button>
            )}
          </div>

          {/* ── Legal ── */}
          <p className="text-center text-xs text-ink-soft mt-6">
            Ao continuar você concorda com os{" "}
            <a href="#" className="underline hover:text-brand-700">Termos de Uso</a>
            {" "}e a{" "}
            <a href="#" className="underline hover:text-brand-700">Política de Privacidade</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Shared Field Wrapper ──────────────────────────────────────────────────────

function Field({
  label,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium text-ink">{label}</Label>
        {optional && (
          <span className="text-[11px] text-ink-soft font-normal">(Opcional)</span>
        )}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive font-medium flex items-center gap-1">
          <X className="w-3 h-3 shrink-0" />{error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-soft">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls = (error?: string) =>
  cn(
    "w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink outline-none transition-all",
    "placeholder:text-ink-soft/60",
    "focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
    error
      ? "border-destructive focus:ring-destructive/20 focus:border-destructive"
      : "border-border"
  );

type StepProps = {
  form: FormState;
  set: <K extends FieldKey>(key: K, val: FormState[K]) => void;
  errors: Errors;
  onBlur: (key: FieldKey) => void;
};

// ─── Step 1: Seu Negócio ──────────────────────────────────────────────────────

function Step1({ form, set, errors, onBlur }: StepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>(form.logoUrl);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setPreview(url);
      set("logoUrl", url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink leading-tight">
          Perfil do seu negócio
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Conte-nos um pouco sobre a sua marca para personalizarmos a sua agenda.
        </p>
      </div>

      {/* Logo Upload — Avatar style */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative w-24 h-24 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 hover:border-brand-400 hover:bg-brand-100 transition-all overflow-hidden flex items-center justify-center"
        >
          {preview ? (
            <img
              src={preview}
              alt="Logo"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-brand-500 group-hover:text-brand-700 transition-colors">
              <Upload className="w-6 h-6" />
              <span className="text-[10px] font-medium">Logo</span>
            </div>
          )}
          {preview && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="text-xs text-ink-soft">
          {preview ? "Clique para trocar a logo" : "Envie a logo do negócio"}{" "}
          <span className="text-ink-soft/60">(Opcional)</span>
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Nome do negócio" error={errors.name}>
            <Input
              data-field="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => onBlur("name")}
              placeholder="Ex: Studio Aurora"
              className={inputCls(errors.name)}
            />
          </Field>

          <Field label="Segmento">
            <Select
              value={form.businessType}
              onValueChange={(v) => set("businessType", v as BusinessType)}
            >
              <SelectTrigger className={inputCls()}>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="WhatsApp do negócio" error={errors.whatsapp}>
            <Input
              data-field="whatsapp"
              inputMode="numeric"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", maskPhoneBR(e.target.value))}
              onBlur={() => onBlur("whatsapp")}
              placeholder="(00) 90000-0000"
              maxLength={16}
              className={inputCls(errors.whatsapp)}
            />
          </Field>

          <Field label="Tamanho da equipe">
            <Select
              value={form.professionalsCount}
              onValueChange={(v) => set("professionalsCount", v)}
            >
              <SelectTrigger className={inputCls()}>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {PROFESSIONALS_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="CNPJ" optional error={errors.cnpj}>
            <Input
              data-field="cnpj"
              inputMode="numeric"
              value={form.cnpj}
              onChange={(e) => set("cnpj", maskCNPJ(e.target.value))}
              onBlur={() => onBlur("cnpj")}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              className={inputCls(errors.cnpj)}
            />
          </Field>

          <Field label="Instagram" optional>
            <Input
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
              placeholder="@seuestudio"
              className={inputCls()}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Atendimento ──────────────────────────────────────────────────────

function Step2({
  form,
  set,
  errors,
  onBlur,
  toggleDay,
}: StepProps & { toggleDay: (d: string) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink leading-tight">
          Onde e quando você atende?
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Essas informações aparecem na sua página de agendamento.
        </p>
      </div>

      <div className="space-y-5">
        {/* Address */}
        <Field label="Endereço" error={errors.address}>
          <Input
            data-field="address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            onBlur={() => onBlur("address")}
            placeholder="Rua, número e complemento"
            className={inputCls(errors.address)}
          />
        </Field>

        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Cidade" error={errors.city}>
            <Input
              data-field="city"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              onBlur={() => onBlur("city")}
              placeholder="São Paulo"
              className={inputCls(errors.city)}
            />
          </Field>

          <Field label="Estado" error={errors.state}>
            <Select
              value={form.state}
              onValueChange={(v) => set("state", v)}
            >
              <SelectTrigger className={inputCls(errors.state)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BR_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Working Days — pill style */}
        <Field label="Dias de atendimento" error={errors.workingDays}>
          <div className="flex flex-wrap gap-2 pt-1">
            {WEEK_DAYS.map((d) => {
              const active = form.workingDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium border transition-all select-none",
                    active
                      ? "bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-600/20"
                      : "bg-white border-border text-ink-soft hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50"
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Working Hours */}
        <Field
          label="Horário de atendimento"
          error={errors.workingHours}
          hint="Ex: 8h às 12h e 13h às 18h. Você pode informar mais de um turno."
        >
          <Textarea
            data-field="workingHours"
            value={form.workingHours}
            onChange={(e) => set("workingHours", e.target.value)}
            onBlur={() => onBlur("workingHours")}
            placeholder="Ex: segunda a sexta das 9h às 18h, sábado das 9h às 13h"
            rows={3}
            className={inputCls(errors.workingHours)}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 3: Sobre Você ───────────────────────────────────────────────────────

function Step3({ form, set, errors, onBlur }: StepProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink leading-tight">
          Quase lá!
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Precisamos de alguns dados seus para finalizar o cadastro com segurança.
        </p>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Seu nome completo" error={errors.fullName}>
            <Input
              data-field="fullName"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              onBlur={() => onBlur("fullName")}
              placeholder="Nome completo"
              className={inputCls(errors.fullName)}
            />
          </Field>

          <Field label="Seu WhatsApp" error={errors.ownerWhatsapp}>
            <Input
              data-field="ownerWhatsapp"
              inputMode="numeric"
              value={form.ownerWhatsapp}
              onChange={(e) =>
                set("ownerWhatsapp", maskPhoneBR(e.target.value))
              }
              onBlur={() => onBlur("ownerWhatsapp")}
              placeholder="(00) 90000-0000"
              maxLength={16}
              className={inputCls(errors.ownerWhatsapp)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="E-mail" error={errors.email}>
            <Input
              data-field="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => onBlur("email")}
              placeholder="voce@email.com"
              className={inputCls(errors.email)}
            />
          </Field>

          <Field label="CPF" error={errors.cpf}>
            <Input
              data-field="cpf"
              inputMode="numeric"
              value={form.cpf}
              onChange={(e) => set("cpf", maskCPF(e.target.value))}
              onBlur={() => onBlur("cpf")}
              placeholder="000.000.000-00"
              maxLength={14}
              className={inputCls(errors.cpf)}
            />
          </Field>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-ink">Notificações automáticas</p>
            <p className="text-xs text-ink-soft mt-0.5">
              Você pode ajustar isso depois nas configurações.
            </p>
          </div>
          <div className="space-y-3">
            <ToggleRow
              checked={form.reminder24h}
              onChange={(v) => set("reminder24h", v)}
              label="Lembrete 24h antes para clientes"
              hint="Via WhatsApp automático"
            />
            <ToggleRow
              checked={form.notifyNew}
              onChange={(v) => set("notifyNew", v)}
              label="Me avisar sobre novos agendamentos"
              hint="Notificação no seu WhatsApp"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      {/* Custom toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 w-10 h-5.5 rounded-full transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-brand-500 outline-none",
          checked ? "bg-brand-600" : "bg-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0"
          )}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-ink group-hover:text-brand-700 transition-colors">
          {label}
        </p>
        {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      </div>
    </label>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="min-h-screen bg-surface-warm flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Logo */}
        <img src={logoSrc} alt="Agenday" className="h-12 w-auto mx-auto" />

        {/* Check Animation */}
        <div className="mx-auto w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/25 animate-in zoom-in-50 duration-500">
          <Check className="w-10 h-10 text-white" strokeWidth={2.5} />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Tudo configurado!
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed">
            Seu negócio está pronto. Agora você pode receber agendamentos,
            gerenciar clientes e muito mais.
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm shadow-brand-600/25"
        >
          Acessar meu painel
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-ink-soft">
          Dúvidas? Fale conosco pelo{" "}
          <a href="#" className="text-brand-700 underline hover:text-brand-600">
            suporte
          </a>
          .
        </p>
      </div>
    </div>
  );
}
