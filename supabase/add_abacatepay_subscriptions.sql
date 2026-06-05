-- ================================================================
-- Migration: Adicionar suporte ao Abacate Pay nas assinaturas
-- Execute no Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- 1. Adicionar colunas do Abacate Pay na tenant_subscriptions
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS abacate_subscription_id text,
  ADD COLUMN IF NOT EXISTS abacate_customer_id     text;

-- 2. Criar índice para busca rápida por ID da assinatura
CREATE INDEX IF NOT EXISTS idx_tenant_subs_abacate
  ON public.tenant_subscriptions(abacate_subscription_id)
  WHERE abacate_subscription_id IS NOT NULL;

-- 3. Remover constraint de provider (agora aceita 'abacatepay' também)
-- A coluna já aceita qualquer texto por padrão, só garantir que não há check
-- (caso haja alguma constraint antiga, removê-la)
DO $$ BEGIN
  ALTER TABLE public.tenant_subscriptions
    DROP CONSTRAINT IF EXISTS tenant_subscriptions_provider_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
