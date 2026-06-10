-- ============================================================
-- Phase 13 - Revenue Packages & Documents
-- ============================================================
-- Scope:
-- - Public package interest and public quote approval foundation.
-- - Commercial quote conversion.
-- - Package balance/expiry alert markers.
-- - Manual collection approval markers.
-- - Commercial settings stored in existing JSONB namespaces.
--
-- Explicitly out of scope:
-- - Payment gateway, PIX automation, NFS-e, bank accounts.
-- - New package/document tables already delivered in Phase 7.
-- - Public Auth/account creation.
-- ============================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS public_token uuid,
  ADD COLUMN IF NOT EXISTS public_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS decision_ip text,
  ADD COLUMN IF NOT EXISTS decision_user_agent text;

COMMENT ON COLUMN public.quotes.public_token IS
  'Opaque token used by public quote approval routes. Nullable until quote is sent.';
COMMENT ON COLUMN public.quotes.metadata IS
  'Also stores public_snapshot, signature and decision payloads for Phase 13 public quote approval.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token
  ON public.quotes(public_token)
  WHERE public_token IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_public_expiry
  ON public.quotes(public_token_expires_at)
  WHERE status = 'enviado' AND public_token IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_followup_due
  ON public.quotes(professional_id, sent_at)
  WHERE status = 'enviado'
    AND followup_sent_at IS NULL
    AND deleted_at IS NULL;

ALTER TABLE public.client_packages
  ADD COLUMN IF NOT EXISTS low_balance_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_renewal_prompt_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_client_packages_low_balance_alert
  ON public.client_packages(professional_id, sessions_remaining, low_balance_alert_sent_at)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_client_packages_expiry_alert
  ON public.client_packages(professional_id, expires_at, expiry_alert_sent_at)
  WHERE status = 'ativo' AND expires_at IS NOT NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS collection_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS collection_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS collection_message_event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_transactions_collection_message_event_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_collection_message_event_id_fkey
      FOREIGN KEY (collection_message_event_id)
      REFERENCES public.message_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_collection_due
  ON public.financial_transactions(professional_id, due_date, collection_approved_at, collection_sent_at)
  WHERE type = 'receita' AND status = 'pendente';

DROP FUNCTION IF EXISTS public.get_public_package_context(text);
DROP FUNCTION IF EXISTS public.register_public_package_interest(text, jsonb);
DROP FUNCTION IF EXISTS public.send_quote_for_approval(uuid, integer);
DROP FUNCTION IF EXISTS public.get_public_quote_context(uuid);
DROP FUNCTION IF EXISTS public.decide_public_quote(uuid, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.convert_approved_quote(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.approve_billing_collection(uuid, text);
DROP FUNCTION IF EXISTS public.mark_collection_message_sent(uuid, uuid);
DROP FUNCTION IF EXISTS public.update_commercial_settings(jsonb);
DROP FUNCTION IF EXISTS public.update_upsell_config(jsonb);
DROP FUNCTION IF EXISTS public.expire_quotes_batch(integer);
DROP FUNCTION IF EXISTS public.mark_quote_followup_sent(uuid);
DROP FUNCTION IF EXISTS public.mark_package_alert_sent(uuid, text);
DROP FUNCTION IF EXISTS public.mark_upsell_attempt(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.get_public_package_context(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package public.service_packages%ROWTYPE;
  v_professional public.professionals%ROWTYPE;
  v_service public.services%ROWTYPE;
BEGIN
  IF NULLIF(trim(COALESCE(p_slug, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT *
  INTO v_package
  FROM public.service_packages
  WHERE slug = trim(p_slug)
    AND is_public = true
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE id = v_package.professional_id
    AND deleted_at IS NULL
    AND onboarding_completed = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_package.service_id IS NOT NULL THEN
    SELECT *
    INTO v_service
    FROM public.services
    WHERE id = v_package.service_id
      AND professional_id = v_package.professional_id
      AND deleted_at IS NULL
      AND is_active = true
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'package', jsonb_build_object(
      'slug', v_package.slug,
      'name', v_package.name,
      'type', v_package.type,
      'total_sessions', v_package.total_sessions,
      'price', v_package.price,
      'validity_days', v_package.validity_days,
      'description', v_package.description
    ),
    'service', CASE WHEN v_service.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', v_service.name,
      'duration_minutes', v_service.duration_minutes,
      'description', v_service.description
    ) END,
    'professional', jsonb_build_object(
      'name', v_professional.name,
      'slug', v_professional.slug
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_public_package_interest(
  p_slug text,
  p_contact jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package public.service_packages%ROWTYPE;
  v_professional public.professionals%ROWTYPE;
  v_client_id uuid;
  v_phone text;
  v_full_name text;
  v_email text;
  v_locale text;
  v_ref text;
  v_lock_key bigint;
  v_new_client boolean := false;
BEGIN
  IF p_contact IS NULL OR jsonb_typeof(p_contact) <> 'object' THEN
    RAISE EXCEPTION 'invalid_contact';
  END IF;

  v_full_name := NULLIF(trim(COALESCE(p_contact->>'full_name', p_contact->>'name', '')), '');
  v_phone := NULLIF(public.normalize_phone_digits(COALESCE(p_contact->>'phone_whatsapp', p_contact->>'phone', '')), '');
  v_email := NULLIF(trim(COALESCE(p_contact->>'email', '')), '');
  v_locale := COALESCE(NULLIF(trim(COALESCE(p_contact->>'lang', '')), ''), 'pt-BR');
  v_ref := NULLIF(trim(COALESCE(p_contact->>'ref', '')), '');

  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  SELECT *
  INTO v_package
  FROM public.service_packages
  WHERE slug = trim(COALESCE(p_slug, ''))
    AND is_public = true
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_not_found';
  END IF;

  SELECT *
  INTO v_professional
  FROM public.professionals
  WHERE id = v_package.professional_id
    AND deleted_at IS NULL
    AND onboarding_completed = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found';
  END IF;

  v_lock_key := hashtextextended(v_professional.id::text || ':' || v_phone, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id
  INTO v_client_id
  FROM public.clients
  WHERE professional_id = v_professional.id
    AND phone_whatsapp = v_phone
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.clients (
      professional_id,
      full_name,
      phone_whatsapp,
      email,
      journey_stage,
      source,
      lgpd_consent_at,
      lgpd_consent_source,
      metadata
    )
    VALUES (
      v_professional.id,
      v_full_name,
      v_phone,
      v_email,
      'lead',
      'public_link',
      now(),
      'public_package_interest',
      jsonb_build_object(
        'lang', v_locale,
        'ref', v_ref,
        'last_public_package_slug', v_package.slug,
        'last_public_package_id', v_package.id
      )
    )
    RETURNING id INTO v_client_id;

    v_new_client := true;

    PERFORM public.log_audit_event(
      v_professional.id,
      'client',
      'client.lead.created',
      'client',
      v_client_id,
      jsonb_build_object('source', 'public_package_interest', 'lang', v_locale, 'ref', v_ref)
    );
  ELSE
    UPDATE public.clients
    SET full_name = COALESCE(v_full_name, full_name),
        email = COALESCE(v_email, email),
        lgpd_consent_at = COALESCE(lgpd_consent_at, now()),
        lgpd_consent_source = COALESCE(lgpd_consent_source, 'public_package_interest'),
        metadata = metadata || jsonb_build_object(
          'last_public_package_slug', v_package.slug,
          'last_public_package_id', v_package.id,
          'last_public_package_ref', v_ref,
          'last_public_package_lang', v_locale
        )
    WHERE id = v_client_id;
  END IF;

  PERFORM public.log_audit_event(
    v_professional.id,
    'client',
    'package.interest.started',
    'service_package',
    v_package.id,
    jsonb_build_object(
      'client_id', v_client_id,
      'service_package_id', v_package.id,
      'slug', v_package.slug,
      'new_client', v_new_client,
      'lang', v_locale,
      'ref', v_ref
    )
  );

  RETURN jsonb_build_object('ok', true, 'status', 'registered');
END;
$$;

CREATE OR REPLACE FUNCTION public.send_quote_for_approval(
  p_quote_id uuid,
  p_token_valid_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_quote public.quotes%ROWTYPE;
  v_token uuid;
  v_token_expires_at timestamptz;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF v_quote.status NOT IN ('rascunho','enviado') THEN
    RAISE EXCEPTION 'quote_not_sendable';
  END IF;

  v_token := COALESCE(v_quote.public_token, gen_random_uuid());
  v_token_expires_at := COALESCE(
    v_quote.public_token_expires_at,
    now() + make_interval(days => GREATEST(COALESCE(p_token_valid_days, 14), 1))
  );

  UPDATE public.quotes
  SET status = 'enviado',
      sent_at = COALESCE(sent_at, now()),
      public_token = v_token,
      public_token_expires_at = v_token_expires_at,
      metadata = metadata || jsonb_build_object(
        'public_snapshot',
        jsonb_build_object(
          'title', title,
          'items', items,
          'subtotal', subtotal,
          'discount_amount', discount_amount,
          'total_amount', total_amount,
          'expires_at', expires_at,
          'created_at', created_at
        )
      )
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'quote.sent',
    'quote',
    v_quote.id,
    jsonb_build_object('quote_id', v_quote.id, 'public_token_expires_at', v_quote.public_token_expires_at)
  );

  RETURN jsonb_build_object(
    'quote_id', v_quote.id,
    'status', v_quote.status,
    'public_token', v_quote.public_token,
    'public_token_expires_at', v_quote.public_token_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_quote_context(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_professional public.professionals%ROWTYPE;
  v_client public.clients%ROWTYPE;
BEGIN
  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE public_token = p_token
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_quote.status = 'convertido' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_converted');
  END IF;

  IF v_quote.status = 'aprovado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_approved');
  END IF;

  IF v_quote.status = 'rejeitado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_rejected');
  END IF;

  IF v_quote.status = 'expirado'
     OR (v_quote.public_token_expires_at IS NOT NULL AND v_quote.public_token_expires_at < now())
     OR (v_quote.expires_at IS NOT NULL AND v_quote.expires_at < CURRENT_DATE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT * INTO v_professional
  FROM public.professionals
  WHERE id = v_quote.professional_id
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = v_quote.client_id
    AND professional_id = v_quote.professional_id
    AND deleted_at IS NULL
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'quote', jsonb_build_object(
      'title', v_quote.title,
      'items', v_quote.items,
      'subtotal', v_quote.subtotal,
      'discount_amount', v_quote.discount_amount,
      'total_amount', v_quote.total_amount,
      'expires_at', v_quote.expires_at,
      'notes', v_quote.notes,
      'public_snapshot', v_quote.metadata->'public_snapshot'
    ),
    'professional', jsonb_build_object('name', v_professional.name, 'slug', v_professional.slug),
    'client', jsonb_build_object('full_name', v_client.full_name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_public_quote(
  p_token uuid,
  p_decision text,
  p_signature jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_decision text;
  v_typed_name text;
  v_accepted_terms boolean;
BEGIN
  v_decision := lower(trim(COALESCE(p_decision, '')));

  IF v_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE public_token = p_token
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF v_quote.status <> 'enviado' THEN
    RAISE EXCEPTION 'quote_not_open';
  END IF;

  IF (v_quote.public_token_expires_at IS NOT NULL AND v_quote.public_token_expires_at < now())
     OR (v_quote.expires_at IS NOT NULL AND v_quote.expires_at < CURRENT_DATE) THEN
    UPDATE public.quotes
    SET status = 'expirado',
        expired_at = COALESCE(expired_at, now())
    WHERE id = v_quote.id;
    RAISE EXCEPTION 'expired';
  END IF;

  v_typed_name := NULLIF(trim(COALESCE(p_signature->>'typedName', p_signature->>'typed_name', '')), '');
  v_accepted_terms := COALESCE((p_signature->>'acceptedTerms')::boolean, (p_signature->>'accepted_terms')::boolean, false);

  IF v_decision = 'approved' AND (v_typed_name IS NULL OR NOT v_accepted_terms) THEN
    RAISE EXCEPTION 'signature_required';
  END IF;

  UPDATE public.quotes
  SET status = CASE WHEN v_decision = 'approved' THEN 'aprovado' ELSE 'rejeitado' END,
      approved_at = CASE WHEN v_decision = 'approved' THEN now() ELSE approved_at END,
      rejected_at = CASE WHEN v_decision = 'rejected' THEN now() ELSE rejected_at END,
      decision_ip = NULLIF(trim(COALESCE(p_ip, '')), ''),
      decision_user_agent = NULLIF(trim(COALESCE(p_user_agent, '')), ''),
      metadata = metadata || jsonb_build_object(
        'signature', COALESCE(p_signature, '{}'::jsonb),
        'decision', jsonb_build_object(
          'value', v_decision,
          'decided_at', now(),
          'ip_present', NULLIF(trim(COALESCE(p_ip, '')), '') IS NOT NULL,
          'user_agent_present', NULLIF(trim(COALESCE(p_user_agent, '')), '') IS NOT NULL
        )
      )
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  PERFORM public.log_audit_event(
    v_quote.professional_id,
    'client',
    CASE WHEN v_decision = 'approved' THEN 'quote.approved' ELSE 'quote.rejected' END,
    'quote',
    v_quote.id,
    jsonb_build_object('quote_id', v_quote.id, 'decision', v_decision, 'has_signature', v_typed_name IS NOT NULL)
  );

  RETURN jsonb_build_object('ok', true, 'status', v_quote.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_approved_quote(
  p_quote_id uuid,
  p_target text,
  p_service_package_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_quote public.quotes%ROWTYPE;
  v_target text;
  v_contract public.contracts%ROWTYPE;
  v_package public.service_packages%ROWTYPE;
  v_client_package public.client_packages%ROWTYPE;
  v_transaction public.financial_transactions%ROWTYPE;
  v_package_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_target := lower(trim(COALESCE(p_target, '')));
  IF v_target NOT IN ('contract','package') THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  SELECT *
  INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF v_quote.status <> 'aprovado' THEN
    RAISE EXCEPTION 'quote_not_approved';
  END IF;

  IF v_target = 'contract' THEN
    INSERT INTO public.contracts (
      professional_id,
      client_id,
      quote_id,
      type,
      status,
      content_snapshot,
      expires_at,
      metadata
    )
    VALUES (
      v_professional_id,
      v_quote.client_id,
      v_quote.id,
      'orcamento',
      'rascunho',
      'Orcamento aprovado: ' || v_quote.title || E'\n\nTotal: ' || v_quote.total_amount::text,
      v_quote.expires_at,
      jsonb_build_object(
        'source', 'quote_public_approval',
        'quote_signature', v_quote.metadata->'signature',
        'quote_decision', v_quote.metadata->'decision',
        'quote_public_snapshot', v_quote.metadata->'public_snapshot'
      )
    )
    RETURNING * INTO v_contract;

    UPDATE public.quotes
    SET status = 'convertido',
        metadata = metadata || jsonb_build_object('converted_to', 'contract', 'contract_id', v_contract.id)
    WHERE id = v_quote.id;

    PERFORM public.log_audit_event(
      v_professional_id,
      'professional',
      'quote.converted_to_contract',
      'contract',
      v_contract.id,
      jsonb_build_object('quote_id', v_quote.id, 'contract_id', v_contract.id)
    );

    RETURN jsonb_build_object('ok', true, 'target', 'contract', 'contract_id', v_contract.id);
  END IF;

  v_package_id := COALESCE(
    p_service_package_id,
    NULLIF(v_quote.metadata #>> '{conversion,service_package_id}', '')::uuid,
    NULLIF(v_quote.items #>> '{0,service_package_id}', '')::uuid
  );

  IF v_package_id IS NULL THEN
    RAISE EXCEPTION 'service_package_id_required';
  END IF;

  SELECT *
  INTO v_package
  FROM public.service_packages
  WHERE id = v_package_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_package_not_found';
  END IF;

  INSERT INTO public.client_packages (
    professional_id,
    client_id,
    service_package_id,
    sessions_total,
    expires_at,
    status,
    notes
  )
  VALUES (
    v_professional_id,
    v_quote.client_id,
    v_package.id,
    v_package.total_sessions,
    CASE WHEN v_package.validity_days IS NOT NULL THEN now() + make_interval(days => v_package.validity_days) ELSE NULL END,
    'ativo',
    'Criado a partir de orcamento aprovado.'
  )
  RETURNING * INTO v_client_package;

  INSERT INTO public.financial_transactions (
    professional_id,
    client_id,
    client_package_id,
    type,
    amount,
    status,
    payment_gateway,
    due_date,
    description,
    source,
    notes,
    created_by
  )
  VALUES (
    v_professional_id,
    v_quote.client_id,
    v_client_package.id,
    'receita',
    v_quote.total_amount,
    'pendente',
    'manual',
    v_quote.expires_at,
    'Pacote aprovado por orcamento: ' || v_package.name,
    'pacote',
    'Criado por convert_approved_quote. Cobranca pendente.',
    auth.uid()
  )
  RETURNING * INTO v_transaction;

  UPDATE public.client_packages
  SET financial_transaction_id = v_transaction.id
  WHERE id = v_client_package.id
  RETURNING * INTO v_client_package;

  UPDATE public.quotes
  SET status = 'convertido',
      metadata = metadata || jsonb_build_object(
        'converted_to', 'package',
        'client_package_id', v_client_package.id,
        'financial_transaction_id', v_transaction.id
      )
  WHERE id = v_quote.id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'quote.converted_to_package',
    'client_package',
    v_client_package.id,
    jsonb_build_object(
      'quote_id', v_quote.id,
      'client_package_id', v_client_package.id,
      'financial_transaction_id', v_transaction.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'target', 'package',
    'client_package_id', v_client_package.id,
    'financial_transaction_id', v_transaction.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_billing_collection(
  p_financial_transaction_id uuid,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_transaction public.financial_transactions%ROWTYPE;
  v_client public.clients%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.financial_transactions
  WHERE id = p_financial_transaction_id
    AND professional_id = v_professional_id
    AND type = 'receita'
    AND status = 'pendente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found_or_not_pending';
  END IF;

  IF v_transaction.client_id IS NULL THEN
    RAISE EXCEPTION 'client_required';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = v_transaction.client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  UPDATE public.financial_transactions
  SET collection_approved_at = now(),
      notes = concat_ws(E'\n', notes, NULLIF(trim(COALESCE(p_message, '')), ''))
  WHERE id = v_transaction.id
  RETURNING * INTO v_transaction;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'payment.collection.approved',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object('transaction_id', v_transaction.id, 'client_id', v_client.id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', v_transaction.id,
    'client_id', v_client.id,
    'phone_whatsapp', v_client.phone_whatsapp,
    'amount', v_transaction.net_amount,
    'description', v_transaction.description,
    'message', p_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_collection_message_sent(
  p_financial_transaction_id uuid,
  p_message_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction public.financial_transactions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_transaction
  FROM public.financial_transactions
  WHERE id = p_financial_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF p_message_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.message_events
    WHERE id = p_message_event_id
      AND professional_id = v_transaction.professional_id
  ) THEN
    RAISE EXCEPTION 'message_event_not_found';
  END IF;

  UPDATE public.financial_transactions
  SET collection_sent_at = now(),
      collection_message_event_id = p_message_event_id
  WHERE id = v_transaction.id
  RETURNING * INTO v_transaction;

  PERFORM public.log_audit_event(
    v_transaction.professional_id,
    'integration',
    'payment.collection.sent',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object('message_event_id', p_message_event_id)
  );

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_transaction.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_commercial_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_settings jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'invalid_settings';
  END IF;

  UPDATE public.professionals
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
      'pix_info', COALESCE(p_settings->'pix_info', settings->'pix_info'),
      'billing_info', COALESCE(p_settings->'billing_info', settings->'billing_info')
    )
  WHERE id = v_professional_id
  RETURNING settings INTO v_settings;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'commercial.settings.updated',
    'professional',
    v_professional_id,
    jsonb_build_object('updated_keys', jsonb_object_keys(p_settings))
  );

  RETURN jsonb_build_object('ok', true, 'settings', v_settings);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_upsell_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_config jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'invalid_config';
  END IF;

  UPDATE public.professional_agents
  SET agent_configs = COALESCE(agent_configs, '{}'::jsonb) || jsonb_build_object(
      'upsell', COALESCE(p_config, '{}'::jsonb)
    )
  WHERE professional_id = v_professional_id
    AND agent_slug = 'rosane'
  RETURNING agent_configs->'upsell' INTO v_config;

  IF NOT FOUND THEN
    INSERT INTO public.professional_agents (professional_id, agent_slug, agent_name, agent_configs)
    VALUES (v_professional_id, 'rosane', 'Rosane', jsonb_build_object('upsell', p_config))
    RETURNING agent_configs->'upsell' INTO v_config;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'upsell.config.updated',
    'professional_agent',
    v_professional_id,
    jsonb_build_object('mode', COALESCE(p_config->>'mode', 'approval'))
  );

  RETURN jsonb_build_object('ok', true, 'config', v_config);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_quotes_batch(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    SELECT id
    FROM public.quotes
    WHERE status = 'enviado'
      AND deleted_at IS NULL
      AND (
        (public_token_expires_at IS NOT NULL AND public_token_expires_at < now())
        OR (expires_at IS NOT NULL AND expires_at < CURRENT_DATE)
      )
    ORDER BY COALESCE(public_token_expires_at, expires_at::timestamptz) ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.quotes q
    SET status = 'expirado',
        expired_at = COALESCE(expired_at, now())
    FROM expired e
    WHERE q.id = e.id
    RETURNING q.id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN jsonb_build_object('ok', true, 'expired_count', COALESCE(v_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_quote_followup_sent(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
BEGIN
  UPDATE public.quotes
  SET followup_sent_at = now()
  WHERE id = p_quote_id
    AND status = 'enviado'
    AND deleted_at IS NULL
  RETURNING * INTO v_quote;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_quote.professional_id,
    'ai',
    'quote.followup.sent',
    'quote',
    v_quote.id,
    jsonb_build_object('quote_id', v_quote.id)
  );

  RETURN jsonb_build_object('ok', true, 'quote_id', v_quote.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_package_alert_sent(
  p_client_package_id uuid,
  p_alert_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_package public.client_packages%ROWTYPE;
  v_alert_type text;
BEGIN
  v_alert_type := lower(trim(COALESCE(p_alert_type, '')));
  IF v_alert_type NOT IN ('low_balance','expiry','renewal') THEN
    RAISE EXCEPTION 'invalid_alert_type';
  END IF;

  UPDATE public.client_packages
  SET low_balance_alert_sent_at = CASE WHEN v_alert_type = 'low_balance' THEN now() ELSE low_balance_alert_sent_at END,
      expiry_alert_sent_at = CASE WHEN v_alert_type = 'expiry' THEN now() ELSE expiry_alert_sent_at END,
      last_renewal_prompt_sent_at = CASE WHEN v_alert_type = 'renewal' THEN now() ELSE last_renewal_prompt_sent_at END
  WHERE id = p_client_package_id
  RETURNING * INTO v_package;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_package_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_package.professional_id,
    'ai',
    'package.alert.sent',
    'client_package',
    v_package.id,
    jsonb_build_object('alert_type', v_alert_type)
  );

  RETURN jsonb_build_object('ok', true, 'client_package_id', v_package.id, 'alert_type', v_alert_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_upsell_attempt(
  p_client_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
BEGIN
  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  UPDATE public.clients
  SET metadata = metadata || jsonb_build_object(
      'last_upsell_attempt_at', now(),
      'last_upsell_attempt', COALESCE(p_payload, '{}'::jsonb)
    )
  WHERE id = v_client.id;

  PERFORM public.log_audit_event(
    v_client.professional_id,
    'ai',
    'upsell.attempted',
    'client',
    v_client.id,
    COALESCE(p_payload, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'client_id', v_client.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_package_context(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_public_package_interest(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_quote_for_approval(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_quote_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_public_quote(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_approved_quote(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_billing_collection(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_collection_message_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_commercial_settings(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_upsell_config(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_quotes_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_quote_followup_sent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_package_alert_sent(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_upsell_attempt(uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_package_context(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_public_package_interest(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_quote_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_public_quote(uuid, text, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_collection_message_sent(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_quotes_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_quote_followup_sent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_package_alert_sent(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_upsell_attempt(uuid, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.send_quote_for_approval(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_approved_quote(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_billing_collection(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_commercial_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_upsell_config(jsonb) TO authenticated;

-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS public.mark_upsell_attempt(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.mark_package_alert_sent(uuid, text);
-- DROP FUNCTION IF EXISTS public.mark_quote_followup_sent(uuid);
-- DROP FUNCTION IF EXISTS public.expire_quotes_batch(integer);
-- DROP FUNCTION IF EXISTS public.update_upsell_config(jsonb);
-- DROP FUNCTION IF EXISTS public.update_commercial_settings(jsonb);
-- DROP FUNCTION IF EXISTS public.mark_collection_message_sent(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.approve_billing_collection(uuid, text);
-- DROP FUNCTION IF EXISTS public.convert_approved_quote(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.decide_public_quote(uuid, text, jsonb, text, text);
-- DROP FUNCTION IF EXISTS public.get_public_quote_context(uuid);
-- DROP FUNCTION IF EXISTS public.send_quote_for_approval(uuid, integer);
-- DROP FUNCTION IF EXISTS public.register_public_package_interest(text, jsonb);
-- DROP FUNCTION IF EXISTS public.get_public_package_context(text);
-- DROP INDEX IF EXISTS public.idx_financial_transactions_collection_due;
-- ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_collection_message_event_id_fkey;
-- ALTER TABLE public.financial_transactions DROP COLUMN IF EXISTS collection_message_event_id;
-- ALTER TABLE public.financial_transactions DROP COLUMN IF EXISTS collection_sent_at;
-- ALTER TABLE public.financial_transactions DROP COLUMN IF EXISTS collection_approved_at;
-- DROP INDEX IF EXISTS public.idx_client_packages_expiry_alert;
-- DROP INDEX IF EXISTS public.idx_client_packages_low_balance_alert;
-- ALTER TABLE public.client_packages DROP COLUMN IF EXISTS last_renewal_prompt_sent_at;
-- ALTER TABLE public.client_packages DROP COLUMN IF EXISTS expiry_alert_sent_at;
-- ALTER TABLE public.client_packages DROP COLUMN IF EXISTS low_balance_alert_sent_at;
-- DROP INDEX IF EXISTS public.idx_quotes_followup_due;
-- DROP INDEX IF EXISTS public.idx_quotes_public_expiry;
-- DROP INDEX IF EXISTS public.idx_quotes_public_token;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS decision_user_agent;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS decision_ip;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS pdf_url;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS followup_sent_at;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS expired_at;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS rejected_at;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS approved_at;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS public_token_expires_at;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS public_token;
