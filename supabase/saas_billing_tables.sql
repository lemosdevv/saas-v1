-- ================================================================
-- Migration: Tabela de webhook_events do Abacate Pay (SaaS billings)
-- e coluna pix_copy_paste na tenant_subscriptions
-- Execute no Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- 1. Tabela de eventos de webhook do SaaS (idempotência)
CREATE TABLE IF NOT EXISTS public.saas_webhook_events (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway        text         NOT NULL DEFAULT 'abacatepay',
  event_type     text         NOT NULL,
  event_id       text         NOT NULL,
  payload        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  processed_at   timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (gateway, event_id)
);
ALTER TABLE public.saas_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS saas_webhook_events_dedup_uidx
  ON public.saas_webhook_events (gateway, event_id);

-- 2. Tabela de cobranças SaaS (cada billing mensal gerado)
CREATE TABLE IF NOT EXISTS public.saas_billings (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid         NOT NULL,
  plan                 text         NOT NULL,
  provider             text         NOT NULL DEFAULT 'abacatepay',
  abacate_billing_id   text,
  abacate_customer_id  text,
  pix_qr_code          text,
  pix_copy_paste       text,
  checkout_url         text,
  amount               numeric      NOT NULL,
  status               text         NOT NULL DEFAULT 'pending',
  expires_at           timestamptz,
  paid_at              timestamptz,
  created_by           uuid,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saas_billings_tenant ON public.saas_billings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_billings_abacate_id ON public.saas_billings(abacate_billing_id) WHERE abacate_billing_id IS NOT NULL;
ALTER TABLE public.saas_billings ENABLE ROW LEVEL SECURITY;

-- 3. RLS na saas_billings: tenant vê suas próprias cobranças
DROP POLICY IF EXISTS saas_billings_tenant_select ON public.saas_billings;
CREATE POLICY saas_billings_tenant_select
  ON public.saas_billings FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_saas_billings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_saas_billings_updated ON public.saas_billings;
CREATE TRIGGER trg_saas_billings_updated
  BEFORE UPDATE ON public.saas_billings
  FOR EACH ROW EXECUTE FUNCTION public.set_saas_billings_updated_at();

-- 5. RLS na saas_webhook_events: apenas service_role acessa
-- (nenhuma policy pública — acesso somente via supabaseAdmin)

-- 6. Reload schema
NOTIFY pgrst, 'reload schema';
