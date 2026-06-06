-- ============================================================
-- Local development seeds for Phase 2 smoke tests only.
-- Not applied by remote db push. Used by local supabase db reset.
-- ============================================================

INSERT INTO public.professionals (
  id,
  name,
  business_name,
  email,
  phone_whatsapp,
  slug,
  profession_type,
  whatsapp_connected,
  whatsapp_connected_at,
  plan_type,
  onboarding_completed,
  onboarding_essentials_completed
) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'Professional A',
    'Clinic A',
    'professional-a@example.test',
    '5511999990101',
    'professional-a',
    'clinica',
    true,
    now(),
    'trial',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'Professional B',
    'Clinic B',
    'professional-b@example.test',
    '5511999990102',
    'professional-b',
    'clinica',
    false,
    null,
    'trial',
    false,
    false
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.professional_whatsapp (
  professional_id,
  provider,
  instance_name,
  phone_number,
  status,
  is_connected,
  last_connected_at,
  connection_mode,
  number_kind
) VALUES (
  '00000000-0000-4000-8000-000000000101',
  'evolution_go',
  'professional-a-wa',
  '5511999990101',
  'connected',
  true,
  now(),
  'pairing_code',
  'business'
)
ON CONFLICT (professional_id, provider) DO NOTHING;

INSERT INTO public.nerissa_setup_sessions (
  professional_id,
  status,
  current_step,
  completed_steps,
  started_at,
  locale,
  source,
  completion_percent,
  last_contact_at
) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'in_progress',
    'connect_whatsapp',
    ARRAY['profile_basics'],
    now(),
    'pt-BR',
    'seed',
    75,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'pending',
    'profile_basics',
    ARRAY[]::text[],
    null,
    'pt-BR',
    'seed',
    0,
    null
  )
ON CONFLICT (professional_id) DO NOTHING;

WITH sessions AS (
  SELECT id, professional_id
  FROM public.nerissa_setup_sessions
  WHERE professional_id IN (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102'
  )
)
INSERT INTO public.nerissa_setup_items (
  session_id,
  professional_id,
  category,
  item_key,
  status,
  completed_at
)
SELECT
  id,
  professional_id,
  'perfil',
  'profile_basics',
  CASE
    WHEN professional_id = '00000000-0000-4000-8000-000000000101' THEN 'completed'
    ELSE 'pending'
  END,
  CASE
    WHEN professional_id = '00000000-0000-4000-8000-000000000101' THEN now()
    ELSE null
  END
FROM sessions
ON CONFLICT (session_id, item_key) DO NOTHING;

-- ============================================================
-- Phase 3 CRM Core synthetic seeds
-- ============================================================

INSERT INTO public.service_categories (
  id,
  professional_id,
  name,
  description,
  color,
  sort_order
) VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    'Atendimentos',
    'Servicos principais usados nos smokes da agenda.',
    '#0f766e',
    1
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000102',
    'Massoterapia',
    'Categoria isolada do professionalB para teste RLS.',
    '#7c3aed',
    1
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.services (
  id,
  professional_id,
  category_id,
  name,
  description,
  duration_minutes,
  price,
  is_active,
  is_public
) VALUES
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000301',
    'Sessao Sintetica',
    'Servico sintetico para validar agendamento e sessao.',
    60,
    120.00,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000302',
    'Servico Isolado B',
    'Servico do professionalB para validar isolamento.',
    45,
    90.00,
    true,
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (
  id,
  professional_id,
  full_name,
  phone_whatsapp,
  email,
  birth_date,
  city,
  neighborhood,
  journey_stage,
  source,
  internal_notes
) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'Cliente Sintetico',
    '5511999990201',
    'cliente-sintetico@example.test',
    '1990-01-15',
    'Sao Paulo',
    'Centro',
    'em_tratamento',
    'manual',
    'Seed principal de professionalA com historico.'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000101',
    'Lead Sintetico',
    '5511999990202',
    'lead-sintetico@example.test',
    null,
    'Sao Paulo',
    'Pinheiros',
    'lead',
    'manual',
    'Lead de professionalA para validar funil.'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000102',
    'Cliente Isolado B',
    '5511999990203',
    'cliente-b@example.test',
    null,
    'Campinas',
    'Cambuí',
    'lead',
    'manual',
    'Cliente do professionalB para teste RLS.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.appointments (
  id,
  professional_id,
  client_id,
  service_id,
  scheduled_at,
  duration_minutes,
  status,
  source,
  notes
) VALUES
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000401',
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 9 hours',
    60,
    'agendado',
    'crm',
    'agendamentoSintetico da Fase 3.'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000401',
    now() - interval '15 days',
    60,
    'realizado',
    'crm',
    'Sessao historica para validar perfil do cliente.'
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000402',
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 10 hours',
    45,
    'agendado',
    'crm',
    'Agendamento isolado de professionalB.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sessions (
  id,
  professional_id,
  client_id,
  appointment_id,
  service_id,
  session_date,
  session_time,
  clinical_evolution,
  notes,
  session_value,
  procedures_performed
) VALUES (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000401',
  now() - interval '15 days',
  '01:00',
  'Evolucao sintetica inicial para validar historico do cliente.',
  'Seed historico.',
  120.00,
  ARRAY['procedimento sintetico']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_log (
  id,
  professional_id,
  actor_type,
  event_type,
  entity_type,
  entity_id,
  payload
) VALUES
  (
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'client.created',
    'client',
    '00000000-0000-4000-8000-000000000201',
    '{"source":"seed","initial_stage":"em_tratamento"}'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'appointment.created',
    'appointment',
    '00000000-0000-4000-8000-000000000501',
    '{"source":"seed","initial_status":"agendado"}'
  ),
  (
    '00000000-0000-4000-8000-000000000703',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'session.registered',
    'session',
    '00000000-0000-4000-8000-000000000601',
    '{"source":"seed"}'
  )
ON CONFLICT (id) DO NOTHING;
