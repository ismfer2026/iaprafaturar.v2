-- Phase 19 validation follow-up:
-- 1. Team members must not read the complete professionals row.
-- 2. Operational users may sell an existing package, but cannot override its price.
-- 3. Operational users may send quotes and mark contracts signed, without gaining
--    permission to create/edit document definitions or convert approved quotes.

DROP POLICY IF EXISTS "professionals_self_access" ON public.professionals;
CREATE POLICY "professionals_self_access"
ON public.professionals FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

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
  v_role text;
  v_package public.service_packages%ROWTYPE;
  v_client_package public.client_packages%ROWTYPE;
  v_transaction public.financial_transactions%ROWTYPE;
  v_amount numeric;
  v_payment_method text;
  v_expires_at timestamptz;
BEGIN
  v_professional_id := public.auth_professional_id();
  v_role := public.auth_professional_role();
  IF v_professional_id IS NULL OR v_role NOT IN ('gestor', 'operacional') THEN
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

  IF v_role = 'operacional' AND p_amount IS NOT NULL AND p_amount IS DISTINCT FROM v_package.price THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required to override package price';
  END IF;

  v_amount := CASE
    WHEN v_role = 'operacional' THEN v_package.price
    ELSE COALESCE(p_amount, v_package.price)
  END;
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
      'financial_transaction_id', v_transaction.id,
      'amount', v_amount,
      'actor_role', v_role
    )
  );

  RETURN jsonb_build_object(
    'client_package_id', v_client_package.id,
    'financial_transaction_id', v_transaction.id,
    'client_package', to_jsonb(v_client_package)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sell_client_package(uuid, uuid, text, numeric, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_client_package(uuid, uuid, text, numeric, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.phase19_require_gestor_document_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.auth_professional_role();
  v_changed_keys text[];
BEGIN
  IF auth.uid() IS NULL OR v_role = 'gestor' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_role = 'operacional' AND TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key)
    INTO v_changed_keys
    FROM jsonb_each(to_jsonb(NEW)) entry
    WHERE (to_jsonb(OLD) -> entry.key) IS DISTINCT FROM entry.value;

    IF TG_TABLE_NAME = 'quotes'
       AND OLD.status IN ('rascunho', 'enviado')
       AND NEW.status = 'enviado'
       AND v_changed_keys <@ ARRAY[
         'status', 'sent_at', 'public_token', 'public_token_expires_at',
         'metadata', 'updated_at'
       ]::text[] THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'contracts'
       AND OLD.status IN ('rascunho', 'enviado')
       AND NEW.status = 'assinado_manual'
       AND v_changed_keys <@ ARRAY['status', 'signed_at', 'updated_at']::text[] THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Unauthorized: gestor role required';
END;
$$;

REVOKE ALL ON FUNCTION public.phase19_require_gestor_document_write() FROM PUBLIC, anon, authenticated;

