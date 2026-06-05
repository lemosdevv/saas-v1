-- ============================================================
-- AGENDAY — Criação de todas as tabelas faltantes
-- Execute no Supabase Dashboard → SQL Editor → Run
-- Idempotente: usa IF NOT EXISTS em tudo
-- ============================================================

-- ─── ENUMS (idempotente) ──────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.agendamento_status AS ENUM (
    'pendente', 'confirmado', 'concluido', 'cancelado', 'faltou'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── FUNÇÕES AUXILIARES ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ─── UNIDADES ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.unidades (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome       text        NOT NULL,
  endereco   text,
  telefone   text,
  ativo      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unidades_tenant ON public.unidades(tenant_id);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_unidades_updated ON public.unidades;
CREATE TRIGGER trg_unidades_updated
  BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── SERVICOS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.servicos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  descricao   text,
  duracao_min integer     NOT NULL DEFAULT 60 CHECK (duracao_min > 0),
  preco       numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  cor         text        NOT NULL DEFAULT '#FF81AE',
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicos_tenant ON public.servicos(tenant_id);
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_servicos_updated ON public.servicos;
CREATE TRIGGER trg_servicos_updated
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── PROFISSIONAIS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profissionais (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  nome       text        NOT NULL,
  email      text,
  telefone   text,
  cor        text        NOT NULL DEFAULT '#FF81AE',
  ativo      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profissionais_tenant ON public.profissionais(tenant_id);
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_profissionais_updated ON public.profissionais;
CREATE TRIGGER trg_profissionais_updated
  BEFORE UPDATE ON public.profissionais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── CLIENTES ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clientes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome            text        NOT NULL,
  telefone        text,
  email           text,
  data_nascimento date,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nome   ON public.clientes(tenant_id, nome);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_clientes_updated ON public.clientes;
CREATE TRIGGER trg_clientes_updated
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── PROFISSIONAL_SERVICOS (N:N) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profissional_servicos (
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  servico_id      uuid NOT NULL REFERENCES public.servicos(id)      ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  PRIMARY KEY (profissional_id, servico_id)
);
ALTER TABLE public.profissional_servicos ENABLE ROW LEVEL SECURITY;

-- ─── PROFISSIONAL_UNIDADES (N:N) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profissional_unidades (
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  unidade_id      uuid NOT NULL REFERENCES public.unidades(id)      ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  PRIMARY KEY (profissional_id, unidade_id)
);
ALTER TABLE public.profissional_unidades ENABLE ROW LEVEL SECURITY;

-- ─── AGENDAMENTOS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agendamentos (
  id                uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid                       NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id        uuid                       NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  servico_id        uuid                       NOT NULL REFERENCES public.servicos(id) ON DELETE RESTRICT,
  profissional_id   uuid                       NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  unidade_id        uuid                       REFERENCES public.unidades(id) ON DELETE SET NULL,
  inicio            timestamptz                NOT NULL,
  fim               timestamptz                NOT NULL,
  status            public.agendamento_status  NOT NULL DEFAULT 'pendente',
  preco             numeric(10,2)              NOT NULL DEFAULT 0,
  observacoes       text,
  google_event_id   text,
  pagamento_status  text                       NOT NULL DEFAULT 'nao_solicitado',
  pagamento_id      text,
  pagamento_link    text,
  lembrete_enviado_em timestamptz,
  created_at        timestamptz                NOT NULL DEFAULT now(),
  updated_at        timestamptz                NOT NULL DEFAULT now(),
  CONSTRAINT agendamentos_horario_valido CHECK (fim > inicio)
);
CREATE INDEX IF NOT EXISTS idx_agendamentos_tenant_inicio ON public.agendamentos(tenant_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agendamentos_prof_inicio   ON public.agendamentos(profissional_id, inicio);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_agendamentos_updated ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_updated
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Anti-conflito de horários
CREATE OR REPLACE FUNCTION public.check_agendamento_conflito()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('cancelado','faltou') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.profissional_id = NEW.profissional_id
      AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND a.status NOT IN ('cancelado','faltou')
      AND tstzrange(a.inicio, a.fim, '[)') && tstzrange(NEW.inicio, NEW.fim, '[)')
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: o profissional já tem agendamento nesse intervalo.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_agendamento_conflito() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_agendamentos_conflito ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_conflito
  BEFORE INSERT OR UPDATE OF inicio, fim, profissional_id, status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.check_agendamento_conflito();

-- ─── GOOGLE CALENDAR TOKENS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  user_id       uuid        PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expiry        timestamptz NOT NULL,
  calendar_id   text        DEFAULT 'primary',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_gct_updated ON public.google_calendar_tokens;
CREATE TRIGGER set_gct_updated
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── PAYMENT EVENTS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  external_id    text NOT NULL,
  agendamento_id uuid,
  status         text NOT NULL,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_external_uidx
  ON public.payment_events (provider, external_id);

-- ─── ADMIN AUDIT LOG ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid       NOT NULL,
  action       text        NOT NULL,
  target_type  text        NOT NULL,
  target_id    text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at DESC);

-- ─── TENANT PLAN HISTORY ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_plan_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  previous_plan   text,
  new_plan        text        NOT NULL,
  previous_status text,
  new_status      text        NOT NULL,
  changed_by      uuid        NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_plan_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_plan_history_tenant ON public.tenant_plan_history(tenant_id, created_at DESC);

-- ─── TENANT SUBSCRIPTIONS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  plan                text        NOT NULL CHECK (plan = ANY (ARRAY['start','profissional','studio','trial'])),
  provider            text        NOT NULL DEFAULT 'mercadopago',
  mode                text        NOT NULL CHECK (mode IN ('recurring','one_time')),
  mp_preapproval_id   text,
  mp_preference_id    text,
  mp_payer_email      text,
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','paid','cancelled','failed')),
  amount              numeric     NOT NULL DEFAULT 0,
  current_period_end  timestamptz,
  idempotency_key     text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_tenant      ON public.tenant_subscriptions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_preapproval ON public.tenant_subscriptions(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_subs_preference  ON public.tenant_subscriptions(mp_preference_id)  WHERE mp_preference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_idempotency_uidx
  ON public.tenant_subscriptions (tenant_id, plan, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
CREATE TRIGGER trg_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── PLAN PAYMENT EVENTS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_payment_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text        NOT NULL DEFAULT 'mercadopago',
  external_id     text        NOT NULL,
  event_type      text        NOT NULL,
  tenant_id       uuid,
  subscription_id uuid        REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
  status          text        NOT NULL,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_payment_events_tenant
  ON public.plan_payment_events(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS plan_payment_events_provider_event_uidx
  ON public.plan_payment_events (provider, event_type, external_id);
ALTER TABLE public.plan_payment_events ENABLE ROW LEVEL SECURITY;

-- ─── TERMS ACCEPTANCES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL,
  terms_version   text        NOT NULL,
  privacy_version text        NOT NULL,
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user_id ON public.terms_acceptances(user_id);
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

-- ─── SECURITY LOGS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.security_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text        NOT NULL,
  severity   text        NOT NULL DEFAULT 'info',
  user_id    uuid,
  tenant_id  uuid,
  ip_address text,
  user_agent text,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_security_logs_user     ON public.security_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_tenant   ON public.security_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_event    ON public.security_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON public.security_logs(severity, created_at DESC)
  WHERE severity IN ('warn','error','critical');

-- ─── RLS POLICIES — TODAS AS TABELAS NOVAS ───────────────────────────────────

-- unidades
DROP POLICY IF EXISTS "select_tenant_unidades" ON public.unidades;
DROP POLICY IF EXISTS "manage_unidades"         ON public.unidades;
CREATE POLICY "select_tenant_unidades" ON public.unidades
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_unidades" ON public.unidades
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- servicos
DROP POLICY IF EXISTS "select_tenant_servicos" ON public.servicos;
DROP POLICY IF EXISTS "manage_servicos"         ON public.servicos;
CREATE POLICY "select_tenant_servicos" ON public.servicos
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_servicos" ON public.servicos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- profissionais
DROP POLICY IF EXISTS "select_tenant_profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "manage_profissionais"         ON public.profissionais;
CREATE POLICY "select_tenant_profissionais" ON public.profissionais
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_profissionais" ON public.profissionais
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- clientes
DROP POLICY IF EXISTS "select_tenant_clientes" ON public.clientes;
DROP POLICY IF EXISTS "manage_clientes"         ON public.clientes;
CREATE POLICY "select_tenant_clientes" ON public.clientes
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_clientes" ON public.clientes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- agendamentos
DROP POLICY IF EXISTS "select_tenant_agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "manage_agendamentos"         ON public.agendamentos;
CREATE POLICY "select_tenant_agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_agendamentos" ON public.agendamentos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- profissional_servicos
DROP POLICY IF EXISTS "select_tenant_prof_serv" ON public.profissional_servicos;
DROP POLICY IF EXISTS "manage_prof_serv"         ON public.profissional_servicos;
CREATE POLICY "select_tenant_prof_serv" ON public.profissional_servicos
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_prof_serv" ON public.profissional_servicos
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- profissional_unidades
DROP POLICY IF EXISTS "select_tenant_prof_unid" ON public.profissional_unidades;
DROP POLICY IF EXISTS "manage_prof_unid"         ON public.profissional_unidades;
CREATE POLICY "select_tenant_prof_unid" ON public.profissional_unidades
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "manage_prof_unid" ON public.profissional_unidades
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.can_manage(tenant_id)) WITH CHECK (public.can_manage(tenant_id));

-- google_calendar_tokens
DROP POLICY IF EXISTS "users manage own google tokens" ON public.google_calendar_tokens;
CREATE POLICY "users manage own google tokens" ON public.google_calendar_tokens
  AS PERMISSIVE FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- payment_events — somente service role escreve
DROP POLICY IF EXISTS "no_client_access_payment_events" ON public.payment_events;
CREATE POLICY "no_client_access_payment_events" ON public.payment_events
  FOR SELECT TO authenticated USING (false);

-- admin_audit_log
DROP POLICY IF EXISTS "super_admin read audit"   ON public.admin_audit_log;
DROP POLICY IF EXISTS "super_admin insert audit" ON public.admin_audit_log;
CREATE POLICY "super_admin read audit" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin insert audit" ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() AND actor_user_id = auth.uid());

-- tenant_plan_history
DROP POLICY IF EXISTS "super_admin read plan history"   ON public.tenant_plan_history;
DROP POLICY IF EXISTS "tenant member read own plan history" ON public.tenant_plan_history;
DROP POLICY IF EXISTS "super_admin insert plan history" ON public.tenant_plan_history;
CREATE POLICY "super_admin read plan history" ON public.tenant_plan_history
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "tenant member read own plan history" ON public.tenant_plan_history
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "super_admin insert plan history" ON public.tenant_plan_history
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() AND changed_by = auth.uid());

-- tenant_subscriptions
DROP POLICY IF EXISTS "tenant member read own subs" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "super_admin read all subs"   ON public.tenant_subscriptions;
CREATE POLICY "tenant member read own subs" ON public.tenant_subscriptions
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "super_admin read all subs" ON public.tenant_subscriptions
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- plan_payment_events
DROP POLICY IF EXISTS "no_client_access_plan_payment_events" ON public.plan_payment_events;
DROP POLICY IF EXISTS "super_admin read plan payment events"  ON public.plan_payment_events;
CREATE POLICY "no_client_access_plan_payment_events" ON public.plan_payment_events
  FOR SELECT TO authenticated USING (false);
CREATE POLICY "super_admin read plan payment events" ON public.plan_payment_events
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- terms_acceptances
DROP POLICY IF EXISTS "users read own acceptances"     ON public.terms_acceptances;
DROP POLICY IF EXISTS "super_admin read all acceptances" ON public.terms_acceptances;
CREATE POLICY "users read own acceptances" ON public.terms_acceptances
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "super_admin read all acceptances" ON public.terms_acceptances
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- security_logs
DROP POLICY IF EXISTS "super_admin read security logs" ON public.security_logs;
CREATE POLICY "super_admin read security logs" ON public.security_logs
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ─── SUPER ADMIN POLICIES EXTRAS (profiles, tenants, user_roles) ─────────────

DROP POLICY IF EXISTS "super_admin read all profiles"    ON public.profiles;
DROP POLICY IF EXISTS "super_admin update profiles"      ON public.profiles;
DROP POLICY IF EXISTS "super_admin read all tenants"     ON public.tenants;
DROP POLICY IF EXISTS "super_admin update tenants"       ON public.tenants;
DROP POLICY IF EXISTS "super_admin read all user_roles"  ON public.user_roles;
DROP POLICY IF EXISTS "super_admin manage user_roles"    ON public.user_roles;
DROP POLICY IF EXISTS "super_admin delete user_roles"    ON public.user_roles;

CREATE POLICY "super_admin read all profiles"   ON public.profiles
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin update profiles"     ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin read all tenants"    ON public.tenants
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin update tenants"      ON public.tenants
  FOR UPDATE TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin read all user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "super_admin manage user_roles"   ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin delete user_roles"   ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- ─── FUNÇÃO update_tenant_slug ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_tenant_slug(_new_slug text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant_id uuid;
  _normalized text;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  _normalized := lower(trim(_new_slug));
  _normalized := regexp_replace(_normalized, '\s+', '-', 'g');
  _normalized := regexp_replace(_normalized, '[^a-z0-9-]', '', 'g');
  _normalized := regexp_replace(_normalized, '-+', '-', 'g');
  _normalized := trim(both '-' from _normalized);
  IF length(_normalized) < 3 OR length(_normalized) > 40 THEN
    RAISE EXCEPTION 'O link precisa ter entre 3 e 40 caracteres';
  END IF;
  SELECT tenant_id INTO _tenant_id FROM public.user_roles
  WHERE user_id = _uid AND role::text = 'owner' LIMIT 1;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Apenas o dono do estabelecimento pode alterar o link';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE lower(slug) = _normalized AND id <> _tenant_id
  ) INTO _exists;
  IF _exists THEN RAISE EXCEPTION 'Esse link já está em uso. Tente outro.'; END IF;
  UPDATE public.tenants SET slug = _normalized, updated_at = now() WHERE id = _tenant_id;
  RETURN _normalized;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_tenant_slug(text) TO authenticated;

-- ─── RELOAD SCHEMA CACHE ─────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ─── FIM ─────────────────────────────────────────────────────────────────────
-- Tabelas criadas:
--   unidades, servicos, profissionais, clientes,
--   profissional_servicos, profissional_unidades,
--   agendamentos, google_calendar_tokens, payment_events,
--   admin_audit_log, tenant_plan_history, tenant_subscriptions,
--   plan_payment_events, terms_acceptances, security_logs
