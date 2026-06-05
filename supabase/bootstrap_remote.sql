-- ============================================================
-- AGENDAY — Bootstrap completo para o banco remoto
-- Projeto: vkfslfyqdnlajqvobexa.supabase.co
-- Execute este arquivo no Supabase Dashboard → SQL Editor → Run
-- Todos os comandos são idempotentes (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ─── 1. ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin', 'owner', 'manager', 'professional', 'client'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_type AS ENUM (
    'lash_designer', 'nail_designer', 'manicure', 'sobrancelhas',
    'estetica', 'salao_beleza', 'studio_beleza', 'cabeleireiro', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agendamento_status AS ENUM (
    'pendente', 'confirmado', 'concluido', 'cancelado', 'faltou'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. FUNÇÕES AUXILIARES ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ─── 3. TABELA: tenants ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  slug              text        UNIQUE NOT NULL,
  business_type     public.business_type NOT NULL DEFAULT 'outro',
  whatsapp          text,
  instagram         text,
  cnpj              text,
  professionals_count text,
  address           text,
  city              text,
  state             text,
  working_days      text[],
  working_hours     text,
  logo_url          text,
  whatsapp_settings jsonb       NOT NULL DEFAULT '{}'::jsonb,
  plan              text        NOT NULL DEFAULT 'trial',
  plan_status       text        NOT NULL DEFAULT 'active',
  trial_start_date  timestamptz NOT NULL DEFAULT now(),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Colunas adicionais — seguro rodar mesmo se já existirem
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp          text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS instagram         text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS cnpj              text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS professionals_count text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address           text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS city              text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS state             text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS working_days      text[];
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS working_hours     text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url          text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan              text NOT NULL DEFAULT 'trial';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_status       text NOT NULL DEFAULT 'active';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_start_date  timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique_idx ON public.tenants (lower(slug));

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ─── 4. TABELA: profiles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
  full_name  text,
  email      text,
  phone      text,
  cpf        text,
  onboarded  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id  uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name  text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf        text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded  boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─── 5. TABELA: user_roles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid,
  role       text           NOT NULL,
  created_at timestamptz    NOT NULL DEFAULT now()
);

-- Garantir que a coluna tenant_id existe (caso a tabela já existia sem ela)
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Adicionar constraint de unicidade se ainda não existir
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_tenant_role_key UNIQUE (user_id, tenant_id, role);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ─── 6. FUNÇÕES RLS HELPERS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND tenant_id = _tenant_id
      AND role::text IN ('owner', 'manager')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND tenant_id = _tenant_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_tenant_id()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_tenant_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()      TO authenticated;

-- ─── 7. RLS POLICIES — tenants ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Members view their tenant"   ON public.tenants;
DROP POLICY IF EXISTS "Authenticated create tenant" ON public.tenants;
DROP POLICY IF EXISTS "Owner updates tenant"        ON public.tenants;
DROP POLICY IF EXISTS "super_admin read all tenants" ON public.tenants;
DROP POLICY IF EXISTS "super_admin update tenants"  ON public.tenants;

CREATE POLICY "Members view their tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY "Authenticated create tenant" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owner updates tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND tenant_id = public.tenants.id AND role::text = 'owner'
    )
  );

-- ─── 8. RLS POLICIES — profiles ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Users view own profile"       ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile"     ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile"     ON public.profiles;
DROP POLICY IF EXISTS "super_admin read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "super_admin update profiles"  ON public.profiles;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_super_admin());

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ─── 9. RLS POLICIES — user_roles ────────────────────────────────────────────

DROP POLICY IF EXISTS "Users view own roles"           ON public.user_roles;
DROP POLICY IF EXISTS "Users insert own role on signup" ON public.user_roles;
DROP POLICY IF EXISTS "super_admin read all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "super_admin manage user_roles"  ON public.user_roles;
DROP POLICY IF EXISTS "super_admin delete user_roles"  ON public.user_roles;

-- Usuário autenticado pode ver seus próprios papéis
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- Usuário pode inserir seu próprio papel (necessário para o onboarding via server fn)
CREATE POLICY "Users insert own role on signup" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ─── 10. TRIGGER: criar profile ao cadastrar ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 11. TRIGGERS updated_at ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS tenants_updated  ON public.tenants;
DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;

CREATE TRIGGER tenants_updated
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 12. Garantir que o profile do usuário atual existe ──────────────────────
-- (caso o trigger não tenha rodado quando o usuário se cadastrou)
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ─── 13. RELOAD SCHEMA CACHE do PostgREST ────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─── FIM ──────────────────────────────────────────────────────────────────────
-- Após executar, aguarde ~2 segundos e teste o onboarding novamente.
