-- ================================================================
-- Migration: Adicionar colunas de controle de envio de e-mails (Deduplicação)
-- Execute no Supabase Dashboard → SQL Editor → Run
-- ================================================================

-- 1. Colunas de controle de e-mail na tabela de Tenants (período de teste / boas-vindas)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS welcome_email_sent timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ending_email_sent timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expired_email_sent timestamptz;

-- 2. Coluna de controle de e-mail na tabela de Cobranças SaaS (alertas de atraso)
ALTER TABLE public.saas_billings
  ADD COLUMN IF NOT EXISTS overdue_email_sent timestamptz;

-- Recarregar schema do PostgREST
NOTIFY pgrst, 'reload schema';
