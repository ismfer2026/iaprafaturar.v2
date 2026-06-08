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

-- ============================================================
-- Phase 4 Financeiro Basico synthetic seeds
-- ============================================================

UPDATE public.sessions
SET payment_status = 'pago',
    payment_method = 'pix'
WHERE id = '00000000-0000-4000-8000-000000000601';

INSERT INTO public.financial_transactions (
  id,
  professional_id,
  client_id,
  session_id,
  appointment_id,
  type,
  amount,
  discount_amount,
  status,
  payment_method,
  due_date,
  paid_at,
  description,
  source,
  notes
) VALUES
  (
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000502',
    'receita',
    120.00,
    0,
    'pago',
    'pix',
    null,
    now() - interval '15 days',
    'Pagamento da Sessao Sintetica',
    'manual',
    'Seed financeiro pago vinculado a sessao.'
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    null,
    '00000000-0000-4000-8000-000000000501',
    'receita',
    120.00,
    0,
    'pendente',
    null,
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 3),
    null,
    'Pagamento pendente do agendamento sintetico',
    'manual',
    'Seed financeiro pendente para validar contas a receber.'
  ),
  (
    '00000000-0000-4000-8000-000000000803',
    '00000000-0000-4000-8000-000000000101',
    null,
    null,
    null,
    'despesa',
    45.00,
    0,
    'pago',
    'dinheiro',
    null,
    now(),
    'Material de atendimento',
    'manual',
    'Seed de despesa manual.'
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
  ),
  (
    '00000000-0000-4000-8000-000000000704',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'payment.created',
    'financial_transaction',
    '00000000-0000-4000-8000-000000000801',
    '{"source":"seed","status":"paid"}'
  ),
  (
    '00000000-0000-4000-8000-000000000705',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'payment.received',
    'financial_transaction',
    '00000000-0000-4000-8000-000000000801',
    '{"source":"seed","payment_method":"pix"}'
  ),
  (
    '00000000-0000-4000-8000-000000000706',
    '00000000-0000-4000-8000-000000000101',
    'system',
    'payment.created',
    'financial_transaction',
    '00000000-0000-4000-8000-000000000802',
    '{"source":"seed","status":"pending"}'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Phase 5 Rosane Agents synthetic seeds
-- ============================================================

INSERT INTO public.clients (
  id,
  professional_id,
  full_name,
  phone_whatsapp,
  email,
  journey_stage,
  source,
  internal_notes
) VALUES
  (
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000101',
    'Cliente Confirmacao',
    '5511999990901',
    'cliente-confirmacao@example.test',
    'agendado',
    'manual',
    'Seed Fase 5 para confirmacao por WhatsApp.'
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000101',
    'Cliente Sem Telefone',
    null,
    'cliente-sem-telefone@example.test',
    'agendado',
    'manual',
    'Seed Fase 5 para skipped sem telefone.'
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
    '00000000-0000-4000-8000-000000000911',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000401',
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 11 hours',
    60,
    'agendado',
    'crm',
    'Seed Fase 5 aguardando confirmacao.'
  ),
  (
    '00000000-0000-4000-8000-000000000912',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000401',
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 14 hours',
    60,
    'confirmado',
    'crm',
    'Seed Fase 5 para lembrete D-1.'
  ),
  (
    '00000000-0000-4000-8000-000000000913',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000401',
    (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 15 hours',
    60,
    'agendado',
    'crm',
    'Seed Fase 5 sem telefone do cliente.'
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
  notes,
  completed_at
) VALUES (
  '00000000-0000-4000-8000-000000000914',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000401',
  now() - interval '1 day',
  60,
  'realizado',
  'crm',
  'Seed Fase 5 para pos-atendimento D+1.',
  now() - interval '1 day'
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
  '00000000-0000-4000-8000-000000000921',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000914',
  '00000000-0000-4000-8000-000000000401',
  now() - interval '1 day',
  '01:00',
  'Sessao sintetica para followup/NPS.',
  'Seed Fase 5 pos-atendimento.',
  120.00,
  ARRAY['procedimento fase 5']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conversations (
  id,
  professional_id,
  client_id,
  channel,
  phone,
  rosane_status,
  last_message_at,
  last_message_preview,
  unread_count
) VALUES (
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000901',
  'whatsapp',
  '5511999990901',
  'active',
  now(),
  'sim',
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conversation_contexts (
  id,
  professional_id,
  conversation_id,
  client_id,
  context_type,
  status,
  source_function,
  ref_type,
  ref_id,
  privacy_classification,
  expires_at,
  metadata
) VALUES (
  '00000000-0000-4000-8000-000000000932',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000901',
  'appointment_confirmation',
  'active',
  'appointment-confirmation-agent',
  'appointment',
  '00000000-0000-4000-8000-000000000911',
  'business',
  now() + interval '2 days',
  '{"source":"seed","phase":5}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.message_events (
  id,
  professional_id,
  conversation_id,
  client_id,
  direction,
  channel,
  message_type,
  source_webhook,
  instance_name,
  content,
  context_type,
  external_message_id,
  status,
  metadata
) VALUES (
  '00000000-0000-4000-8000-000000000933',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000901',
  'inbound',
  'whatsapp',
  'text',
  'professional',
  'professional-a-wa',
  'sim',
  'confirmation',
  'seed-phase5-confirmation-yes',
  'processed',
  '{"source":"seed","phase":5}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shadow_suggestions (
  id,
  professional_id,
  conversation_id,
  message_event_id,
  suggested_text,
  status,
  expires_at,
  metadata
) VALUES (
  '00000000-0000-4000-8000-000000000941',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000931',
  '00000000-0000-4000-8000-000000000933',
  'Perfeito, seu horario esta confirmado. Te esperamos no horario combinado.',
  'pending',
  now() + interval '1 day',
  '{"source":"seed","phase":5}'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Phase 6 Client Public PWA synthetic seeds
-- ============================================================

UPDATE public.professionals
SET onboarding_completed = true,
    onboarding_essentials_completed = true,
    settings = settings || jsonb_build_object(
      'brand_color', '#0f766e',
      'public_booking', jsonb_build_object('enabled', true)
    )
WHERE id = '00000000-0000-4000-8000-000000000101';

UPDATE public.professionals
SET settings = settings || jsonb_build_object(
      'brand_color', '#7c3aed',
      'public_booking', jsonb_build_object('enabled', true)
    )
WHERE id = '00000000-0000-4000-8000-000000000102';

INSERT INTO public.registration_links (
  id,
  professional_id,
  code,
  is_active,
  expires_at,
  uses_count,
  max_uses
) VALUES
  (
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000000101',
    'PROFA-PUBLIC',
    true,
    now() + interval '90 days',
    0,
    null
  ),
  (
    '00000000-0000-4000-8000-000000001002',
    '00000000-0000-4000-8000-000000000101',
    'PROFA-EXPIRED',
    true,
    now() - interval '1 day',
    0,
    null
  ),
  (
    '00000000-0000-4000-8000-000000001003',
    '00000000-0000-4000-8000-000000000102',
    'PROFB-PUBLIC',
    true,
    now() + interval '90 days',
    0,
    null
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (
  id,
  professional_id,
  full_name,
  phone_whatsapp,
  email,
  journey_stage,
  source,
  lgpd_consent_at,
  lgpd_consent_source,
  lgpd_consent_channel,
  internal_notes
) VALUES
  (
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000000101',
    'Lead Publico Fase 6',
    '5511999991101',
    'lead-publico-fase6@example.test',
    'lead',
    'public_link',
    now(),
    'public_booking',
    'public_booking',
    'Seed Fase 6 para agendamento publico.'
  ),
  (
    '00000000-0000-4000-8000-000000001102',
    '00000000-0000-4000-8000-000000000102',
    'Mesmo Telefone Prof B',
    '5511999991101',
    'mesmo-telefone-b@example.test',
    'lead',
    'manual',
    null,
    null,
    null,
    'Seed Fase 6 para validar que telefone igual em outro profissional nao mistura tenant.'
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
  notes,
  booked_by_client,
  booked_at,
  metadata
) VALUES (
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001101',
  '00000000-0000-4000-8000-000000000401',
  (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') + interval '2 days 9 hours',
  60,
  'agendado',
  'public_link',
  'Seed Fase 6 criado por fluxo publico.',
  true,
  now(),
  '{"source":"seed","phase":6,"lang":"pt-BR","ref":"seed"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.registration_sessions (
  id,
  link_id,
  professional_id,
  session_token,
  data,
  completed_at,
  client_id
) VALUES (
  '00000000-0000-4000-8000-000000001301',
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000101',
  'seed-phase6-public-booking-session',
  '{"kind":"public_booking","slug":"professional-a","lang":"pt-BR","ref":"seed"}',
  now(),
  '00000000-0000-4000-8000-000000001101'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.anamnese_templates (
  id,
  professional_id,
  name,
  fields,
  is_default
) VALUES (
  '00000000-0000-4000-8000-000000001401',
  '00000000-0000-4000-8000-000000000101',
  'Anamnese Padrao Fase 6',
  '{
    "dados_pessoais": [{"key":"idade","label":"Idade","type":"number"}],
    "queixas": [{"key":"principal","label":"Queixa principal","type":"textarea"}],
    "historico": [{"key":"tratamentos_previos","label":"Tratamentos previos","type":"textarea"}],
    "alergias": [{"key":"possui","label":"Possui alergias?","type":"textarea"}],
    "habitos": [{"key":"rotina","label":"Rotina e habitos relevantes","type":"textarea"}],
    "custom_data": []
  }',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.anamnese_fichas (
  id,
  professional_id,
  client_id,
  template_id,
  appointment_id,
  public_token,
  status,
  token_expires_at,
  dados_pessoais,
  queixas,
  historico,
  alergias,
  habitos,
  custom_data,
  lgpd_aceito,
  lgpd_aceito_em,
  lgpd_ip,
  preenchido_em
) VALUES
  (
    '00000000-0000-4000-8000-000000001501',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000001401',
    '00000000-0000-4000-8000-000000001201',
    '00000000-0000-4000-8000-000000001551',
    'aguardando',
    now() + interval '14 days',
    '{}',
    '{}',
    '{}',
    '{}',
    '{}',
    '{}',
    false,
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000001502',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000001401',
    null,
    '00000000-0000-4000-8000-000000001552',
    'expirado',
    now() - interval '1 day',
    '{}',
    '{}',
    '{}',
    '{}',
    '{}',
    '{}',
    false,
    null,
    null,
    null
  ),
  (
    '00000000-0000-4000-8000-000000001503',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000001401',
    null,
    '00000000-0000-4000-8000-000000001553',
    'preenchido',
    now() + interval '14 days',
    '{"idade":35}',
    '{"principal":"Queixa sintetica preenchida."}',
    '{"tratamentos_previos":"Sem tratamentos previos relevantes."}',
    '{"possui":"Nao informado."}',
    '{"rotina":"Rotina sintetica."}',
    '{}',
    true,
    now(),
    '127.0.0.1',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000001504',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000001401',
    null,
    '00000000-0000-4000-8000-000000001554',
    'revisado',
    now() + interval '14 days',
    '{"idade":35}',
    '{"principal":"Queixa revisada sintetica."}',
    '{"tratamentos_previos":"Sem tratamentos previos relevantes."}',
    '{"possui":"Nao informado."}',
    '{"rotina":"Rotina sintetica."}',
    '{}',
    true,
    now(),
    '127.0.0.1',
    now()
  )
ON CONFLICT (id) DO NOTHING;

UPDATE public.clients
SET has_anamnese = true,
    last_anamnese_at = now()
WHERE id = '00000000-0000-4000-8000-000000001101';

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
    '00000000-0000-4000-8000-000000001601',
    '00000000-0000-4000-8000-000000000101',
    'client',
    'appointment.created',
    'appointment',
    '00000000-0000-4000-8000-000000001201',
    '{"source":"seed","phase":6,"booked_by_client":true}'
  ),
  (
    '00000000-0000-4000-8000-000000001602',
    '00000000-0000-4000-8000-000000000101',
    'client',
    'anamnese.completed',
    'anamnese_ficha',
    '00000000-0000-4000-8000-000000001503',
    '{"source":"seed","phase":6,"lgpd_aceito":true}'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Phase 9 Admin Analytics synthetic seeds
-- ============================================================

UPDATE public.professionals
SET plan_type = 'individual',
    onboarding_completed = true,
    settings = jsonb_set(settings, '{billing_info,monthly_amount}', '"99.90"', true),
    updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000101';

UPDATE public.professionals
SET plan_type = 'trial',
    trial_ends_at = now() + interval '2 days',
    onboarding_completed = false,
    updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000102';

INSERT INTO public.master_admins (user_id, email, name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', 'Admin User')
FROM auth.users u
WHERE u.email = 'admin@example.test'
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin_master'
FROM auth.users u
WHERE u.email = 'admin@example.test'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.professional_platform_health_scores (
  professional_id,
  whatsapp_connected,
  clients_active,
  appointments_monthly,
  rosane_active,
  financial_registered,
  nps_collected,
  health_level,
  components,
  calculated_at
) VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    20,
    10,
    10,
    20,
    10,
    0,
    'medio',
    '{"source":"seed","phase":9,"profile":"active_paid"}',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    0,
    0,
    0,
    0,
    0,
    0,
    'critico',
    '{"source":"seed","phase":9,"profile":"trial_risk"}',
    now()
  )
ON CONFLICT (professional_id) DO UPDATE SET
  whatsapp_connected = EXCLUDED.whatsapp_connected,
  clients_active = EXCLUDED.clients_active,
  appointments_monthly = EXCLUDED.appointments_monthly,
  rosane_active = EXCLUDED.rosane_active,
  financial_registered = EXCLUDED.financial_registered,
  nps_collected = EXCLUDED.nps_collected,
  health_level = EXCLUDED.health_level,
  components = EXCLUDED.components,
  calculated_at = EXCLUDED.calculated_at;

INSERT INTO public.platform_metrics_daily (
  date,
  total_professionals,
  new_professionals,
  active_professionals,
  churned_professionals,
  mrr,
  new_mrr,
  churned_mrr,
  total_revenue_day,
  total_sessions,
  total_messages_sent,
  total_ai_credits_used,
  total_appointments,
  plan_breakdown
) VALUES (
  CURRENT_DATE,
  2,
  0,
  1,
  1,
  99.90,
  0,
  0,
  450.00,
  1,
  0,
  0,
  1,
  '{"trial":1,"individual":1}'
)
ON CONFLICT (date) DO UPDATE SET
  total_professionals = EXCLUDED.total_professionals,
  new_professionals = EXCLUDED.new_professionals,
  active_professionals = EXCLUDED.active_professionals,
  churned_professionals = EXCLUDED.churned_professionals,
  mrr = EXCLUDED.mrr,
  new_mrr = EXCLUDED.new_mrr,
  churned_mrr = EXCLUDED.churned_mrr,
  total_revenue_day = EXCLUDED.total_revenue_day,
  total_sessions = EXCLUDED.total_sessions,
  total_messages_sent = EXCLUDED.total_messages_sent,
  total_ai_credits_used = EXCLUDED.total_ai_credits_used,
  total_appointments = EXCLUDED.total_appointments,
  plan_breakdown = EXCLUDED.plan_breakdown;

-- ============================================================
-- Phase 7 Documentos & Pacotes synthetic seeds
-- ============================================================

INSERT INTO public.service_packages (
  id, professional_id, service_id, name, slug, total_sessions, price,
  validity_days, description, is_active, is_public
) VALUES
  (
    '00000000-0000-4000-8000-000000001701',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    'Pacote Sintetico A',
    'pacote-sintetico-a',
    5,
    450.00,
    90,
    'Pacote sintetico para validacao da Fase 7.',
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000001702',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000402',
    'Pacote Sintetico B',
    'pacote-sintetico-b',
    3,
    300.00,
    60,
    'Pacote sintetico do profissional B para validar isolamento.',
    true,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  total_sessions = EXCLUDED.total_sessions,
  price = EXCLUDED.price,
  validity_days = EXCLUDED.validity_days,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  updated_at = now();

INSERT INTO public.client_packages (
  id, professional_id, client_id, service_package_id, sessions_total,
  sessions_used, purchased_at, expires_at, status
) VALUES
  (
    '00000000-0000-4000-8000-000000001711',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000001701',
    5,
    1,
    now() - interval '3 days',
    now() + interval '87 days',
    'ativo'
  ),
  (
    '00000000-0000-4000-8000-000000001712',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000001702',
    3,
    0,
    now() - interval '1 day',
    now() + interval '59 days',
    'ativo'
  )
ON CONFLICT (id) DO UPDATE SET
  sessions_total = EXCLUDED.sessions_total,
  sessions_used = EXCLUDED.sessions_used,
  purchased_at = EXCLUDED.purchased_at,
  expires_at = EXCLUDED.expires_at,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.financial_transactions (
  id, professional_id, client_id, client_package_id, type, amount, status,
  payment_method, payment_gateway, paid_at, description, source, notes
) VALUES (
  '00000000-0000-4000-8000-000000001721',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000001711',
  'receita',
  450.00,
  'pago',
  'pix',
  'manual',
  now() - interval '3 days',
  'Venda de pacote sintetico A',
  'pacote',
  'Seed Fase 7'
)
ON CONFLICT (id) DO UPDATE SET
  client_package_id = EXCLUDED.client_package_id,
  amount = EXCLUDED.amount,
  status = EXCLUDED.status,
  payment_method = EXCLUDED.payment_method,
  paid_at = EXCLUDED.paid_at,
  description = EXCLUDED.description,
  source = EXCLUDED.source,
  notes = EXCLUDED.notes,
  updated_at = now();

UPDATE public.client_packages
SET financial_transaction_id = '00000000-0000-4000-8000-000000001721',
    updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000001711';

UPDATE public.sessions
SET client_package_id = '00000000-0000-4000-8000-000000001711'
WHERE id = '00000000-0000-4000-8000-000000000601';

UPDATE public.appointments
SET client_package_id = '00000000-0000-4000-8000-000000001711'
WHERE id = '00000000-0000-4000-8000-000000000502';

INSERT INTO public.package_session_usage (
  id, professional_id, client_package_id, session_id, appointment_id, used_at
) VALUES (
  '00000000-0000-4000-8000-000000001731',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000001711',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000502',
  now() - interval '1 day'
)
ON CONFLICT (session_id) DO NOTHING;

INSERT INTO public.quotes (
  id, professional_id, client_id, quote_number, title, items, subtotal,
  discount_amount, total_amount, status, expires_at, notes, sent_at
) VALUES
  (
    '00000000-0000-4000-8000-000000001741',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    'ORC-SEED-001',
    'Orcamento sintetico rascunho',
    '[{"description":"Sessao sintetica","quantity":1,"unit_price":120}]',
    120.00,
    0,
    120.00,
    'rascunho',
    CURRENT_DATE + 7,
    'Seed Fase 7',
    null
  ),
  (
    '00000000-0000-4000-8000-000000001742',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    'ORC-SEED-002',
    'Orcamento sintetico enviado',
    '[{"description":"Pacote sintetico","quantity":1,"unit_price":450}]',
    450.00,
    50.00,
    400.00,
    'enviado',
    CURRENT_DATE + 10,
    'Seed Fase 7 enviado',
    now() - interval '2 hours'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  items = EXCLUDED.items,
  subtotal = EXCLUDED.subtotal,
  discount_amount = EXCLUDED.discount_amount,
  total_amount = EXCLUDED.total_amount,
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  notes = EXCLUDED.notes,
  sent_at = EXCLUDED.sent_at,
  updated_at = now();

INSERT INTO public.modelos (
  id, professional_id, name, type, content, variables, is_active
) VALUES (
  '00000000-0000-4000-8000-000000001751',
  '00000000-0000-4000-8000-000000000101',
  'Contrato sintetico de atendimento',
  'contrato',
  'Contrato entre {{professional_name}} e {{client_name}} para {{service_name}}.',
  '["professional_name","client_name","service_name"]',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.contracts (
  id, professional_id, client_id, modelo_id, title, type, content, status,
  signed_at, signature_method, notes
) VALUES (
  '00000000-0000-4000-8000-000000001761',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000001751',
  'Contrato sintetico assinado',
  'contrato',
  'Contrato sintetico assinado manualmente para validacao.',
  'assinado',
  now() - interval '1 hour',
  'manual',
  'Seed Fase 7'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  type = EXCLUDED.type,
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  signed_at = EXCLUDED.signed_at,
  signature_method = EXCLUDED.signature_method,
  notes = EXCLUDED.notes,
  updated_at = now();

UPDATE public.anamnese_templates
SET fields = '{
  "sections": [
    {
      "id": "dados_pessoais",
      "title": "Dados pessoais",
      "fields": [
        {"id": "idade", "type": "number", "label": "Idade", "required": true}
      ]
    },
    {
      "id": "queixas",
      "title": "Queixas",
      "fields": [
        {"id": "principal", "type": "textarea", "label": "Queixa principal", "required": true}
      ]
    }
  ]
}'::jsonb,
    updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000001401';

INSERT INTO public.audit_log (
  id, professional_id, actor_type, event_type, entity_type, entity_id, payload
) VALUES
  (
    '00000000-0000-4000-8000-000000001771',
    '00000000-0000-4000-8000-000000000101',
    'professional',
    'client_package.created',
    'client_package',
    '00000000-0000-4000-8000-000000001711',
    '{"source":"seed","phase":7}'
  ),
  (
    '00000000-0000-4000-8000-000000001772',
    '00000000-0000-4000-8000-000000000101',
    'professional',
    'quote.sent',
    'quote',
    '00000000-0000-4000-8000-000000001742',
    '{"source":"seed","phase":7,"dry_run":true}'
  ),
  (
    '00000000-0000-4000-8000-000000001773',
    '00000000-0000-4000-8000-000000000101',
    'professional',
    'contract.signed',
    'contract',
    '00000000-0000-4000-8000-000000001761',
    '{"source":"seed","phase":7,"signature_method":"manual"}'
  )
ON CONFLICT (id) DO NOTHING;
