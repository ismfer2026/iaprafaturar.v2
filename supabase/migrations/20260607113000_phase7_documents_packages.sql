-- ============================================================
-- Phase 7 - Documentos & Pacotes
-- ============================================================
-- Scope:
-- - service_packages, client_packages, package_session_usage
-- - quotes, modelos, contracts
-- - package/session/document/quote/anamnese-template RPCs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  service_id       uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  name             text NOT NULL CHECK (length(trim(name)) > 0),
  slug             text NOT NULL CHECK (length(trim(slug)) > 0),
  type             text NOT NULL DEFAULT 'session_pack'
                   CHECK (type IN ('session_pack','subscription','product_bundle')),
  total_sessions   integer NOT NULL CHECK (total_sessions > 0),
  price            numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  validity_days    integer CHECK (validity_days IS NULL OR validity_days > 0),
  is_active        boolean NOT NULL DEFAULT true,
  is_public        boolean NOT NULL DEFAULT false,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

COMMENT ON TABLE public.service_packages IS
  'Catalogo de pacotes de servicos por profissional. Substitui packages.';

DROP TRIGGER IF EXISTS service_packages_updated_at ON public.service_packages;
CREATE TRIGGER service_packages_updated_at
  BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_packages_slug
  ON public.service_packages(professional_id, slug)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_packages_professional
  ON public.service_packages(professional_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_packages_service
  ON public.service_packages(professional_id, service_id)
  WHERE service_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_packages_public
  ON public.service_packages(slug)
  WHERE is_active = true AND is_public = true AND deleted_at IS NULL;

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_packages_isolation" ON public.service_packages;
CREATE POLICY "service_packages_isolation"
ON public.service_packages FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "service_packages_public_read" ON public.service_packages;
CREATE POLICY "service_packages_public_read"
ON public.service_packages FOR SELECT TO anon
USING (is_active = true AND is_public = true AND deleted_at IS NULL);

REVOKE ALL ON public.service_packages FROM anon, authenticated;
GRANT SELECT ON public.service_packages TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.client_packages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id          uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id                uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  service_package_id       uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE RESTRICT,
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  sessions_total           integer NOT NULL CHECK (sessions_total > 0),
  sessions_used            integer NOT NULL DEFAULT 0 CHECK (sessions_used >= 0),
  sessions_remaining       integer GENERATED ALWAYS AS (sessions_total - sessions_used) STORED,
  purchased_at             timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz,
  status                   text NOT NULL DEFAULT 'ativo'
                           CHECK (status IN ('ativo','esgotado','expirado','cancelado')),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_packages_usage_bounds CHECK (sessions_used <= sessions_total)
);

COMMENT ON TABLE public.client_packages IS
  'Pacotes vendidos/ativados para clientes. Saldo alterado somente por RPC.';

DROP TRIGGER IF EXISTS client_packages_updated_at ON public.client_packages;
CREATE TRIGGER client_packages_updated_at
  BEFORE UPDATE ON public.client_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_client_packages_professional
  ON public.client_packages(professional_id, status);
CREATE INDEX IF NOT EXISTS idx_client_packages_client
  ON public.client_packages(professional_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_packages_package
  ON public.client_packages(service_package_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_expiring
  ON public.client_packages(professional_id, expires_at)
  WHERE status = 'ativo' AND expires_at IS NOT NULL;

ALTER TABLE public.client_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_packages_isolation" ON public.client_packages;
CREATE POLICY "client_packages_isolation"
ON public.client_packages FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.client_packages FROM anon, authenticated;
GRANT SELECT ON public.client_packages TO authenticated;

CREATE TABLE IF NOT EXISTS public.package_session_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_package_id uuid NOT NULL REFERENCES public.client_packages(id) ON DELETE RESTRICT,
  session_id        uuid NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  appointment_id    uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  used_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.package_session_usage IS
  'Log imutavel de consumo de sessoes de pacote.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_package_session_usage_session
  ON public.package_session_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_package_session_usage_package
  ON public.package_session_usage(client_package_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_session_usage_professional
  ON public.package_session_usage(professional_id, used_at DESC);

DROP TRIGGER IF EXISTS prevent_package_session_usage_change ON public.package_session_usage;
CREATE TRIGGER prevent_package_session_usage_change
  BEFORE UPDATE OR DELETE ON public.package_session_usage
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

ALTER TABLE public.package_session_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_session_usage_isolation" ON public.package_session_usage;
CREATE POLICY "package_session_usage_isolation"
ON public.package_session_usage FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.package_session_usage FROM anon, authenticated;
GRANT SELECT ON public.package_session_usage TO authenticated;

CREATE TABLE IF NOT EXISTS public.quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  title           text NOT NULL CHECK (length(trim(title)) > 0),
  items           jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array'),
  subtotal        numeric(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount    numeric(10,2) GENERATED ALWAYS AS (GREATEST(subtotal - discount_amount, 0)) STORED,
  status          text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','enviado','aprovado','rejeitado','expirado','convertido')),
  expires_at      date,
  sent_at         timestamptz,
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

DROP TRIGGER IF EXISTS quotes_updated_at ON public.quotes;
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_quotes_professional_status
  ON public.quotes(professional_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_client
  ON public.quotes(professional_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_expiring
  ON public.quotes(professional_id, expires_at)
  WHERE status = 'enviado' AND expires_at IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_isolation" ON public.quotes;
CREATE POLICY "quotes_isolation"
ON public.quotes FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.quotes FROM anon, authenticated;
GRANT SELECT ON public.quotes TO authenticated;

CREATE TABLE IF NOT EXISTS public.modelos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  type            text NOT NULL
                  CHECK (type IN ('contrato','termo_lgpd','consentimento_clinico','responsabilidade','contrato_pacote','orcamento')),
  content         text NOT NULL CHECK (length(trim(content)) > 0),
  variables       jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(variables) = 'array'),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

DROP TRIGGER IF EXISTS modelos_updated_at ON public.modelos;
CREATE TRIGGER modelos_updated_at
  BEFORE UPDATE ON public.modelos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_modelos_professional_type
  ON public.modelos(professional_id, type, name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modelos_isolation" ON public.modelos;
CREATE POLICY "modelos_isolation"
ON public.modelos FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.modelos FROM anon, authenticated;
GRANT SELECT ON public.modelos TO authenticated;

CREATE TABLE IF NOT EXISTS public.contracts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  quote_id          uuid REFERENCES public.quotes(id) ON DELETE RESTRICT,
  client_package_id uuid REFERENCES public.client_packages(id) ON DELETE RESTRICT,
  modelo_id         uuid REFERENCES public.modelos(id) ON DELETE RESTRICT,
  type              text NOT NULL
                    CHECK (type IN ('contrato','termo_lgpd','consentimento_clinico','responsabilidade','contrato_pacote','orcamento')),
  status            text NOT NULL DEFAULT 'rascunho'
                    CHECK (status IN ('rascunho','enviado','assinado_manual','cancelado','expirado')),
  content_snapshot  text,
  external_url      text,
  sent_at           timestamptz,
  signed_at         timestamptz,
  expires_at        date,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

DROP TRIGGER IF EXISTS contracts_updated_at ON public.contracts;
CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_contracts_professional_status
  ON public.contracts(professional_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_client
  ON public.contracts(professional_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_quote
  ON public.contracts(quote_id)
  WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_client_package
  ON public.contracts(client_package_id)
  WHERE client_package_id IS NOT NULL;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_isolation" ON public.contracts;
CREATE POLICY "contracts_isolation"
ON public.contracts FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.contracts FROM anon, authenticated;
GRANT SELECT ON public.contracts TO authenticated;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS client_package_id uuid REFERENCES public.client_packages(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_sessions_client_package
  ON public.sessions(client_package_id)
  WHERE client_package_id IS NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_package_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_client_package_id_fkey'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_client_package_id_fkey
      FOREIGN KEY (client_package_id) REFERENCES public.client_packages(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_client_package
  ON public.appointments(client_package_id)
  WHERE client_package_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_client_package_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_client_package_id_fkey
      FOREIGN KEY (client_package_id) REFERENCES public.client_packages(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_client_package
  ON public.financial_transactions(client_package_id)
  WHERE client_package_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.phase7_slugify(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim(both '-' FROM lower(regexp_replace(COALESCE(p_value, ''), '[^a-zA-Z0-9]+', '-', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.create_service_package(
  p_service_id uuid,
  p_name text,
  p_total_sessions integer,
  p_price numeric,
  p_validity_days integer DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_public boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_slug_base text;
  v_slug text;
  v_suffix integer := 1;
  v_package public.service_packages%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'package_name_required';
  END IF;

  IF p_total_sessions IS NULL OR p_total_sessions <= 0 THEN
    RAISE EXCEPTION 'invalid_total_sessions';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'invalid_price';
  END IF;

  IF p_validity_days IS NOT NULL AND p_validity_days <= 0 THEN
    RAISE EXCEPTION 'invalid_validity_days';
  END IF;

  IF p_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = p_service_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  v_slug_base := public.phase7_slugify(p_name);
  IF v_slug_base = '' THEN
    v_slug_base := 'pacote';
  END IF;
  v_slug := v_slug_base;

  WHILE EXISTS (
    SELECT 1 FROM public.service_packages
    WHERE professional_id = v_professional_id
      AND slug = v_slug
      AND deleted_at IS NULL
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.service_packages (
    professional_id, service_id, name, slug, total_sessions, price,
    validity_days, description, is_public
  )
  VALUES (
    v_professional_id, p_service_id, trim(p_name), v_slug, p_total_sessions, p_price,
    p_validity_days, NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_is_public, false)
  )
  RETURNING * INTO v_package;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'package.created',
    'service_package',
    v_package.id,
    jsonb_build_object('service_package_id', v_package.id, 'slug', v_package.slug)
  );

  RETURN jsonb_build_object('service_package_id', v_package.id, 'slug', v_package.slug, 'package', to_jsonb(v_package));
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_client_package(
  p_client_id uuid,
  p_service_package_id uuid,
  p_payment_method text,
  p_amount numeric DEFAULT NULL,
  p_purchased_at timestamptz DEFAULT now(),
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_package public.service_packages%ROWTYPE;
  v_client_package public.client_packages%ROWTYPE;
  v_transaction public.financial_transactions%ROWTYPE;
  v_amount numeric;
  v_payment_method text;
  v_expires_at timestamptz;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT * INTO v_package
  FROM public.service_packages
  WHERE id = p_service_package_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_package_not_found';
  END IF;

  v_payment_method := NULLIF(trim(COALESCE(p_payment_method, '')), '');
  IF v_payment_method IS NULL OR v_payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  v_amount := COALESCE(p_amount, v_package.price);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_expires_at := COALESCE(
    p_expires_at,
    CASE
      WHEN v_package.validity_days IS NOT NULL
      THEN COALESCE(p_purchased_at, now()) + make_interval(days => v_package.validity_days)
      ELSE NULL
    END
  );

  INSERT INTO public.client_packages (
    professional_id, client_id, service_package_id, sessions_total,
    purchased_at, expires_at, status
  )
  VALUES (
    v_professional_id, p_client_id, v_package.id, v_package.total_sessions,
    COALESCE(p_purchased_at, now()), v_expires_at, 'ativo'
  )
  RETURNING * INTO v_client_package;

  INSERT INTO public.financial_transactions (
    professional_id, client_id, client_package_id, type, amount, status,
    payment_method, payment_gateway, paid_at, description, notes, created_by
  )
  VALUES (
    v_professional_id, p_client_id, v_client_package.id, 'receita', v_amount, 'pago',
    v_payment_method, 'manual', COALESCE(p_purchased_at, now()),
    'Venda de pacote: ' || v_package.name,
    'Criado por sell_client_package',
    auth.uid()
  )
  RETURNING * INTO v_transaction;

  UPDATE public.client_packages
  SET financial_transaction_id = v_transaction.id
  WHERE id = v_client_package.id
  RETURNING * INTO v_client_package;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'client_package.created',
    'client_package',
    v_client_package.id,
    jsonb_build_object(
      'client_package_id', v_client_package.id,
      'service_package_id', v_package.id,
      'financial_transaction_id', v_transaction.id
    )
  );

  RETURN jsonb_build_object(
    'client_package_id', v_client_package.id,
    'financial_transaction_id', v_transaction.id,
    'client_package', to_jsonb(v_client_package)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.use_client_package_session(
  p_client_package_id uuid,
  p_session_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client_package public.client_packages%ROWTYPE;
  v_service_package public.service_packages%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_usage public.package_session_usage%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_client_package
  FROM public.client_packages
  WHERE id = p_client_package_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_package_not_found';
  END IF;

  IF v_client_package.status <> 'ativo' THEN
    RAISE EXCEPTION 'client_package_not_active';
  END IF;

  IF v_client_package.expires_at IS NOT NULL AND v_client_package.expires_at < now() THEN
    UPDATE public.client_packages SET status = 'expirado' WHERE id = v_client_package.id;
    RAISE EXCEPTION 'client_package_expired';
  END IF;

  IF v_client_package.sessions_remaining <= 0 THEN
    UPDATE public.client_packages SET status = 'esgotado' WHERE id = v_client_package.id;
    RAISE EXCEPTION 'client_package_empty';
  END IF;

  SELECT * INTO v_service_package
  FROM public.service_packages
  WHERE id = v_client_package.service_package_id
    AND professional_id = v_professional_id;

  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND professional_id = v_professional_id
    AND client_id = v_client_package.client_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_service_package.service_id IS NOT NULL AND v_session.service_id IS DISTINCT FROM v_service_package.service_id THEN
    RAISE EXCEPTION 'session_service_not_covered';
  END IF;

  IF p_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = p_appointment_id
      AND professional_id = v_professional_id
      AND client_id = v_client_package.client_id
  ) THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.package_session_usage
    WHERE session_id = v_session.id
  ) THEN
    RAISE EXCEPTION 'session_package_already_used';
  END IF;

  UPDATE public.client_packages
  SET sessions_used = sessions_used + 1,
      status = CASE WHEN sessions_used + 1 >= sessions_total THEN 'esgotado' ELSE status END
  WHERE id = v_client_package.id
  RETURNING * INTO v_client_package;

  UPDATE public.sessions
  SET client_package_id = v_client_package.id
  WHERE id = v_session.id;

  IF p_appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET client_package_id = v_client_package.id
    WHERE id = p_appointment_id;
  END IF;

  INSERT INTO public.package_session_usage (
    professional_id, client_package_id, session_id, appointment_id, used_by
  )
  VALUES (
    v_professional_id, v_client_package.id, v_session.id, p_appointment_id, auth.uid()
  )
  RETURNING * INTO v_usage;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'package.session_used',
    'package_session_usage',
    v_usage.id,
    jsonb_build_object(
      'client_package_id', v_client_package.id,
      'session_id', v_session.id,
      'sessions_remaining', v_client_package.sessions_remaining
    )
  );

  RETURN jsonb_build_object('usage_id', v_usage.id, 'client_package', to_jsonb(v_client_package));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_quote(
  p_client_id uuid,
  p_title text,
  p_items jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_expires_at date DEFAULT (CURRENT_DATE + 7),
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_subtotal numeric(10,2);
  v_quote public.quotes%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  IF NULLIF(trim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'quote_title_required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'quote_items_required';
  END IF;

  SELECT COALESCE(SUM(
    COALESCE((item->>'quantity')::numeric, 1) * COALESCE((item->>'unit_price')::numeric, 0)
  ), 0)::numeric(10,2)
  INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS item;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'invalid_quote_total';
  END IF;

  IF COALESCE(p_discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_discount';
  END IF;

  INSERT INTO public.quotes (
    professional_id, client_id, title, items, subtotal, discount_amount, expires_at, notes
  )
  VALUES (
    v_professional_id, p_client_id, trim(p_title), p_items, v_subtotal,
    COALESCE(p_discount_amount, 0), p_expires_at, NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING * INTO v_quote;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'quote.created',
    'quote',
    v_quote.id,
    jsonb_build_object('quote_id', v_quote.id, 'total_amount', v_quote.total_amount)
  );

  RETURN jsonb_build_object('quote_id', v_quote.id, 'quote', to_jsonb(v_quote));
END;
$$;

CREATE OR REPLACE FUNCTION public.send_quote_dry_run(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_quote public.quotes%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF v_quote.status <> 'rascunho' THEN
    RAISE EXCEPTION 'quote_not_draft';
  END IF;

  UPDATE public.quotes
  SET status = 'enviado',
      sent_at = now(),
      metadata = metadata || jsonb_build_object('dry_run', true, 'sent_by', auth.uid())
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'quote.sent',
    'quote',
    v_quote.id,
    jsonb_build_object('quote_id', v_quote.id, 'dry_run', true)
  );

  RETURN jsonb_build_object('quote_id', v_quote.id, 'status', v_quote.status, 'dry_run', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_modelo(
  p_name text,
  p_type text,
  p_content text,
  p_variables jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_modelo public.modelos%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.modelos (professional_id, name, type, content, variables)
  VALUES (
    v_professional_id,
    trim(p_name),
    p_type,
    trim(p_content),
    COALESCE(p_variables, '[]'::jsonb)
  )
  RETURNING * INTO v_modelo;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'document.template.created',
    'modelo',
    v_modelo.id,
    jsonb_build_object('modelo_id', v_modelo.id, 'type', v_modelo.type)
  );

  RETURN jsonb_build_object('modelo_id', v_modelo.id, 'modelo', to_jsonb(v_modelo));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_contract_from_modelo(
  p_client_id uuid,
  p_modelo_id uuid,
  p_type text,
  p_quote_id uuid DEFAULT NULL,
  p_client_package_id uuid DEFAULT NULL,
  p_expires_at date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_modelo public.modelos%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  SELECT * INTO v_modelo
  FROM public.modelos
  WHERE id = p_modelo_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'modelo_not_found';
  END IF;

  IF p_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE id = p_quote_id
      AND professional_id = v_professional_id
      AND client_id = p_client_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF p_client_package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_packages
    WHERE id = p_client_package_id
      AND professional_id = v_professional_id
      AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'client_package_not_found';
  END IF;

  INSERT INTO public.contracts (
    professional_id, client_id, quote_id, client_package_id, modelo_id,
    type, content_snapshot, expires_at
  )
  VALUES (
    v_professional_id, p_client_id, p_quote_id, p_client_package_id, v_modelo.id,
    COALESCE(NULLIF(trim(COALESCE(p_type, '')), ''), v_modelo.type),
    v_modelo.content,
    p_expires_at
  )
  RETURNING * INTO v_contract;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'document.created',
    'contract',
    v_contract.id,
    jsonb_build_object('contract_id', v_contract.id, 'modelo_id', v_modelo.id)
  );

  RETURN jsonb_build_object('contract_id', v_contract.id, 'contract', to_jsonb(v_contract));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_contract_signed_manual(
  p_contract_id uuid,
  p_signed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_contract public.contracts%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.contracts
  SET status = 'assinado_manual',
      signed_at = COALESCE(p_signed_at, now())
  WHERE id = p_contract_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL
    AND status IN ('rascunho','enviado')
  RETURNING * INTO v_contract;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found_or_invalid_status';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'document.status_changed',
    'contract',
    v_contract.id,
    jsonb_build_object('contract_id', v_contract.id, 'status', v_contract.status)
  );

  RETURN jsonb_build_object('contract_id', v_contract.id, 'status', v_contract.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_anamnese_template(
  p_template_id uuid,
  p_name text,
  p_fields jsonb,
  p_is_default boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_template public.anamnese_templates%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.anamnese_templates (professional_id, name, fields, is_default)
    VALUES (
      v_professional_id,
      trim(p_name),
      COALESCE(p_fields, '{}'::jsonb),
      COALESCE(p_is_default, false)
    )
    RETURNING * INTO v_template;
  ELSE
    UPDATE public.anamnese_templates
    SET name = trim(p_name),
        fields = COALESCE(p_fields, '{}'::jsonb),
        is_default = COALESCE(p_is_default, false)
    WHERE id = p_template_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL
    RETURNING * INTO v_template;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anamnese_template_not_found';
    END IF;
  END IF;

  IF COALESCE(p_is_default, false) THEN
    UPDATE public.anamnese_templates
    SET is_default = false
    WHERE professional_id = v_professional_id
      AND id <> v_template.id
      AND deleted_at IS NULL;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'anamnese_template.updated',
    'anamnese_template',
    v_template.id,
    jsonb_build_object('template_id', v_template.id, 'is_default', v_template.is_default)
  );

  RETURN jsonb_build_object('template_id', v_template.id, 'template', to_jsonb(v_template));
END;
$$;

REVOKE ALL ON FUNCTION public.phase7_slugify(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_service_package(uuid, text, integer, numeric, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sell_client_package(uuid, uuid, text, numeric, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.use_client_package_session(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_quote(uuid, text, jsonb, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_quote_dry_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_modelo(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_contract_from_modelo(uuid, uuid, text, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_contract_signed_manual(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_anamnese_template(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_service_package(uuid, text, integer, numeric, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_client_package(uuid, uuid, text, numeric, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_client_package_session(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quote(uuid, text, jsonb, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_quote_dry_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modelo(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_from_modelo(uuid, uuid, text, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_contract_signed_manual(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_anamnese_template(uuid, text, jsonb, boolean) TO authenticated;

-- ROLLBACK (manual):
-- DROP FUNCTION IF EXISTS public.update_anamnese_template(uuid, text, jsonb, boolean);
-- DROP FUNCTION IF EXISTS public.mark_contract_signed_manual(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS public.create_contract_from_modelo(uuid, uuid, text, uuid, uuid, date);
-- DROP FUNCTION IF EXISTS public.create_modelo(text, text, text, jsonb);
-- DROP FUNCTION IF EXISTS public.send_quote_dry_run(uuid);
-- DROP FUNCTION IF EXISTS public.create_quote(uuid, text, jsonb, numeric, date, text);
-- DROP FUNCTION IF EXISTS public.use_client_package_session(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.sell_client_package(uuid, uuid, text, numeric, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS public.create_service_package(uuid, text, integer, numeric, integer, text, boolean);
-- DROP FUNCTION IF EXISTS public.phase7_slugify(text);
-- ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_client_package_id_fkey;
-- ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_client_package_id_fkey;
-- ALTER TABLE public.appointments DROP COLUMN IF EXISTS client_package_id;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS client_package_id;
-- DROP TABLE IF EXISTS public.contracts;
-- DROP TABLE IF EXISTS public.modelos;
-- DROP TABLE IF EXISTS public.quotes;
-- DROP TABLE IF EXISTS public.package_session_usage;
-- DROP TABLE IF EXISTS public.client_packages;
-- DROP TABLE IF EXISTS public.service_packages;
