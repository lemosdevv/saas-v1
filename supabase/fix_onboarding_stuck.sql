-- =====================================================
-- CORREÇÃO: marcar onboarding como concluído
-- para usuário que já tem tenant mas ficou travado
-- Execute no Supabase Dashboard → SQL Editor → Run
-- =====================================================

-- Verificar o estado atual do usuário (só para conferir)
SELECT
  p.id AS user_id,
  p.full_name,
  p.email,
  p.tenant_id,
  p.onboarded,
  t.name AS tenant_name,
  t.slug
FROM public.profiles p
LEFT JOIN public.tenants t ON t.id = p.tenant_id
WHERE p.id = 'd6c90e57-35d8-4e26-a156-c7e9a16f629a';

-- Marcar como onboarded
UPDATE public.profiles
SET onboarded = true
WHERE id = 'd6c90e57-35d8-4e26-a156-c7e9a16f629a'
  AND tenant_id IS NOT NULL;

-- Confirmar resultado
SELECT id, onboarded, tenant_id FROM public.profiles
WHERE id = 'd6c90e57-35d8-4e26-a156-c7e9a16f629a';
