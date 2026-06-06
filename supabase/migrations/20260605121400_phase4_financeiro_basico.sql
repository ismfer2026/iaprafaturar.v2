-- ============================================================
-- Phase 4: Financeiro Basico
--
-- Scope:
-- - financial_transactions
-- - manual income/expense records
-- - manual PIX/cash/card/transfer payment methods
-- - payment link to session/appointment
-- - dashboard financial pulse
--
-- Explicitly out of scope:
-- - gateway payments
-- - bank accounts / transfers between accounts
-- - reconciliation
-- - NFS-e
-- - PDV complete flow
-- - WhatsApp collection by Rosane
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'transaction_type_enum'
  ) THEN
    CREATE TYPE public.transaction_type_enum AS ENUM ('receita', 'despesa');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'transaction_status_enum'
  ) THEN
    CREATE TYPE public.transaction_status_enum AS ENUM ('pendente', 'pago', 'cancelado', 'estornado');
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pendente'
    CHECK (payment_status IN ('pendente','pago','parcial','isento')),
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN public.sessions.payment_status IS
  'Operational payment status for the session. Source of truth for amounts remains financial_transactions.';

COMMENT ON COLUMN public.sessions.payment_method IS
  'Last manual payment method linked to this session.';

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id       uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id             uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  session_id            uuid REFERENCES public.sessions(id) ON DELETE RESTRICT,
  appointment_id        uuid REFERENCES public.appointments(id) ON DELETE RESTRICT,
  client_package_id     uuid,

  type                  public.transaction_type_enum NOT NULL,
  category_id           uuid,
  cost_center_id        uuid,
  bank_account_id       uuid,

  amount                numeric(10,2) NOT NULL CHECK (amount > 0),
  discount_amount       numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  net_amount            numeric(10,2) GENERATED ALWAYS AS (amount - discount_amount) STORED,

  status                public.transaction_status_enum NOT NULL DEFAULT 'pendente',
  payment_method        text CHECK (
                          payment_method IS NULL OR
                          payment_method IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros')
                        ),
  payment_gateway       text NOT NULL DEFAULT 'manual',
  gateway_transaction_id text,
  installments          integer NOT NULL DEFAULT 1 CHECK (installments > 0),
  installment_number    integer NOT NULL DEFAULT 1 CHECK (installment_number > 0),
  parent_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,

  due_date              date,
  paid_at               timestamptz,

  description           text NOT NULL CHECK (length(trim(description)) > 0),
  source                text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual','pdv','pacote','assinatura','gateway')),
  notes                 text,

  conciliacao_item_id   uuid,

  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT financial_discount_not_greater_than_amount
    CHECK (discount_amount <= amount),
  CONSTRAINT financial_paid_requires_method_and_date
    CHECK (status <> 'pago' OR (payment_method IS NOT NULL AND paid_at IS NOT NULL)),
  CONSTRAINT financial_pending_has_no_paid_at
    CHECK (status <> 'pendente' OR paid_at IS NULL)
  -- NUNCA deleted_at: ciclo de vida financeiro usa status.
);

COMMENT ON TABLE public.financial_transactions IS
  'Manual operational finance ledger for professionals. No deleted_at: use status for lifecycle.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'financial_transactions_updated_at'
      AND tgrelid = 'public.financial_transactions'::regclass
  ) THEN
    CREATE TRIGGER financial_transactions_updated_at
      BEFORE UPDATE ON public.financial_transactions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_professional
  ON public.financial_transactions(professional_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_status
  ON public.financial_transactions(professional_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type
  ON public.financial_transactions(professional_id, type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_due_date
  ON public.financial_transactions(professional_id, due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_paid_at
  ON public.financial_transactions(professional_id, paid_at)
  WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_client
  ON public.financial_transactions(client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_session
  ON public.financial_transactions(session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_appointment
  ON public.financial_transactions(appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_transactions_isolation" ON public.financial_transactions;
CREATE POLICY "financial_transactions_isolation"
ON public.financial_transactions FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

REVOKE ALL ON public.financial_transactions FROM anon, authenticated;
GRANT SELECT ON public.financial_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.create_financial_transaction(
  p_type public.transaction_type_enum,
  p_amount numeric,
  p_discount_amount numeric DEFAULT 0,
  p_status public.transaction_status_enum DEFAULT 'pendente',
  p_payment_method text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_transaction public.financial_transactions%ROWTYPE;
  v_client_id uuid;
  v_appointment_client_id uuid;
  v_session_client_id uuid;
  v_payment_method text;
  v_paid_at timestamptz;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_type IS NULL THEN
    RAISE EXCEPTION 'type is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;

  IF COALESCE(p_discount_amount, 0) < 0 OR COALESCE(p_discount_amount, 0) > p_amount THEN
    RAISE EXCEPTION 'discount_amount is invalid';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'description is required';
  END IF;

  IF p_status NOT IN ('pendente','pago') THEN
    RAISE EXCEPTION 'create_financial_transaction only accepts pendente or pago';
  END IF;

  v_payment_method := NULLIF(trim(COALESCE(p_payment_method, '')), '');
  v_paid_at := CASE WHEN p_status = 'pago' THEN COALESCE(p_paid_at, now()) ELSE NULL END;

  IF p_status = 'pago' AND v_payment_method IS NULL THEN
    RAISE EXCEPTION 'payment_method is required for paid transactions';
  END IF;

  IF v_payment_method IS NOT NULL AND v_payment_method NOT IN (
    'pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros'
  ) THEN
    RAISE EXCEPTION 'Invalid payment_method';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT id
    INTO v_client_id
    FROM public.clients
    WHERE id = p_client_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Client not found';
    END IF;
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    SELECT client_id
    INTO v_appointment_client_id
    FROM public.appointments
    WHERE id = p_appointment_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Appointment not found';
    END IF;

    IF v_client_id IS NOT NULL AND v_appointment_client_id IS DISTINCT FROM v_client_id THEN
      RAISE EXCEPTION 'Appointment does not belong to client';
    END IF;

    v_client_id := COALESCE(v_client_id, v_appointment_client_id);
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT client_id
    INTO v_session_client_id
    FROM public.sessions
    WHERE id = p_session_id
      AND professional_id = v_professional_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Session not found';
    END IF;

    IF v_client_id IS NOT NULL AND v_session_client_id IS DISTINCT FROM v_client_id THEN
      RAISE EXCEPTION 'Session does not belong to client';
    END IF;

    v_client_id := COALESCE(v_client_id, v_session_client_id);
  END IF;

  INSERT INTO public.financial_transactions (
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
    notes,
    created_by
  )
  VALUES (
    v_professional_id,
    v_client_id,
    p_session_id,
    p_appointment_id,
    p_type,
    p_amount,
    COALESCE(p_discount_amount, 0),
    COALESCE(p_status, 'pendente'),
    v_payment_method,
    p_due_date,
    v_paid_at,
    trim(p_description),
    'manual',
    p_notes,
    auth.uid()
  )
  RETURNING * INTO v_transaction;

  IF v_transaction.status = 'pago' AND v_transaction.session_id IS NOT NULL THEN
    UPDATE public.sessions
    SET payment_status = 'pago',
        payment_method = v_transaction.payment_method
    WHERE id = v_transaction.session_id
      AND professional_id = v_professional_id;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'payment.created',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object(
      'transaction_id', v_transaction.id,
      'amount_cents', (v_transaction.net_amount * 100)::integer,
      'type', CASE WHEN v_transaction.type = 'receita' THEN 'income' ELSE 'expense' END,
      'status', CASE WHEN v_transaction.status = 'pago' THEN 'paid' ELSE 'pending' END,
      'linked_session_id', v_transaction.session_id,
      'linked_appointment_id', v_transaction.appointment_id
    )
  );

  IF v_transaction.status = 'pago' THEN
    PERFORM public.log_audit_event(
      v_professional_id,
      'professional',
      'payment.received',
      'financial_transaction',
      v_transaction.id,
      jsonb_build_object(
        'transaction_id', v_transaction.id,
        'amount_cents', (v_transaction.net_amount * 100)::integer,
        'payment_method', v_transaction.payment_method,
        'received_at', v_transaction.paid_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_transaction.id,
    'status', v_transaction.status,
    'transaction', to_jsonb(v_transaction)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_transaction_paid(
  p_transaction_id uuid,
  p_payment_method text,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_transaction public.financial_transactions%ROWTYPE;
  v_payment_method text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_payment_method := NULLIF(trim(COALESCE(p_payment_method, '')), '');

  IF v_payment_method IS NULL THEN
    RAISE EXCEPTION 'payment_method is required';
  END IF;

  IF v_payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros') THEN
    RAISE EXCEPTION 'Invalid payment_method';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.financial_transactions
  WHERE id = p_transaction_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_transaction.status = 'pago' THEN
    RETURN jsonb_build_object(
      'transaction_id', v_transaction.id,
      'status', v_transaction.status,
      'changed', false
    );
  END IF;

  IF v_transaction.status <> 'pendente' THEN
    RAISE EXCEPTION 'Cannot mark transaction with status % as paid', v_transaction.status;
  END IF;

  UPDATE public.financial_transactions
  SET status = 'pago',
      payment_method = v_payment_method,
      paid_at = COALESCE(p_paid_at, now())
  WHERE id = v_transaction.id
  RETURNING * INTO v_transaction;

  IF v_transaction.session_id IS NOT NULL THEN
    UPDATE public.sessions
    SET payment_status = 'pago',
        payment_method = v_transaction.payment_method
    WHERE id = v_transaction.session_id
      AND professional_id = v_professional_id;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'payment.received',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object(
      'transaction_id', v_transaction.id,
      'amount_cents', (v_transaction.net_amount * 100)::integer,
      'payment_method', v_transaction.payment_method,
      'received_at', v_transaction.paid_at
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction.id,
    'status', v_transaction.status,
    'changed', true,
    'transaction', to_jsonb(v_transaction)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_financial_transaction(
  p_transaction_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_transaction public.financial_transactions%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT *
  INTO v_transaction
  FROM public.financial_transactions
  WHERE id = p_transaction_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_transaction.status <> 'pendente' THEN
    RAISE EXCEPTION 'Only pending transactions can be cancelled in Phase 4';
  END IF;

  UPDATE public.financial_transactions
  SET status = 'cancelado',
      notes = trim(concat_ws(E'\n', notes, 'Cancelado: ' || trim(p_reason)))
  WHERE id = v_transaction.id
  RETURNING * INTO v_transaction;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'payment.cancelled',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object(
      'transaction_id', v_transaction.id,
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction.id,
    'status', v_transaction.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_date_from date;
  v_date_to date;
  v_summary jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_date_from := COALESCE(p_date_from, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_date_to := COALESCE(p_date_to, v_date_from);

  IF v_date_to < v_date_from THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT jsonb_build_object(
    'paidIncome', COALESCE(SUM(net_amount) FILTER (WHERE type = 'receita' AND status = 'pago'), 0),
    'pendingIncome', COALESCE(SUM(net_amount) FILTER (WHERE type = 'receita' AND status = 'pendente'), 0),
    'expenses', COALESCE(SUM(net_amount) FILTER (WHERE type = 'despesa' AND status = 'pago'), 0),
    'net', COALESCE(SUM(net_amount) FILTER (WHERE type = 'receita' AND status = 'pago'), 0)
           - COALESCE(SUM(net_amount) FILTER (WHERE type = 'despesa' AND status = 'pago'), 0),
    'transactionCount', COUNT(*)
  )
  INTO v_summary
  FROM public.financial_transactions
  WHERE professional_id = v_professional_id
    AND created_at >= v_date_from::timestamptz
    AND created_at < (v_date_to + 1)::timestamptz
    AND status <> 'cancelado';

  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_rpc()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_today jsonb;
  v_attention jsonb;
  v_pulse jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_today_start := ((now() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo');
  v_today_end := v_today_start + interval '1 day';
  v_month_start := (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
  v_month_end := v_month_start + interval '1 month';

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at), '[]'::jsonb)
  INTO v_today
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.service_id,
      s.name AS service_name,
      ap.scheduled_at,
      ap.duration_minutes,
      ap.status
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    LEFT JOIN public.services s ON s.id = ap.service_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at >= v_today_start
      AND ap.scheduled_at < v_today_end
      AND ap.status IN ('agendado','confirmado')
    ORDER BY ap.scheduled_at
    LIMIT 20
  ) a;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.scheduled_at), '[]'::jsonb)
  INTO v_attention
  FROM (
    SELECT
      ap.id,
      ap.client_id,
      c.full_name AS client_name,
      ap.scheduled_at,
      ap.status,
      'appointment_overdue' AS reason
    FROM public.appointments ap
    LEFT JOIN public.clients c ON c.id = ap.client_id
    WHERE ap.professional_id = v_professional_id
      AND ap.deleted_at IS NULL
      AND ap.scheduled_at < now()
      AND ap.status = 'agendado'
      AND NOT EXISTS (
        SELECT 1 FROM public.sessions se
        WHERE se.appointment_id = ap.id
          AND se.deleted_at IS NULL
      )
    ORDER BY ap.scheduled_at DESC
    LIMIT 20
  ) a;

  SELECT jsonb_build_object(
    'clientsInTreatmentCount', (
      SELECT COUNT(*)
      FROM public.clients c
      WHERE c.professional_id = v_professional_id
        AND c.journey_stage = 'em_tratamento'
        AND c.deleted_at IS NULL
    ),
    'activeClientsCount', (
      SELECT COUNT(*)
      FROM public.clients c
      WHERE c.professional_id = v_professional_id
        AND c.is_active = true
        AND c.deleted_at IS NULL
    ),
    'appointmentsTodayCount', (
      SELECT COUNT(*)
      FROM public.appointments ap
      WHERE ap.professional_id = v_professional_id
        AND ap.deleted_at IS NULL
        AND ap.scheduled_at >= v_today_start
        AND ap.scheduled_at < v_today_end
    ),
    'monthRevenuePaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_month_start
        AND ft.paid_at < v_month_end
    ),
    'monthRevenuePending', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'receita'
        AND ft.status = 'pendente'
        AND COALESCE(ft.due_date, ft.created_at::date) >= v_month_start::date
        AND COALESCE(ft.due_date, ft.created_at::date) < v_month_end::date
    ),
    'monthExpensesPaid', (
      SELECT COALESCE(SUM(ft.net_amount), 0)
      FROM public.financial_transactions ft
      WHERE ft.professional_id = v_professional_id
        AND ft.type = 'despesa'
        AND ft.status = 'pago'
        AND ft.paid_at >= v_month_start
        AND ft.paid_at < v_month_end
    )
  )
  INTO v_pulse;

  RETURN jsonb_build_object(
    'todayAppointments', v_today,
    'attentionItems', v_attention,
    'pulse', v_pulse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_financial_transaction(
  public.transaction_type_enum,
  numeric,
  numeric,
  public.transaction_status_enum,
  text,
  date,
  timestamptz,
  text,
  text,
  uuid,
  uuid,
  uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_transaction_paid(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_financial_transaction(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_financial_summary(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_dashboard_rpc() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_financial_transaction(
  public.transaction_type_enum,
  numeric,
  numeric,
  public.transaction_status_enum,
  text,
  date,
  timestamptz,
  text,
  text,
  uuid,
  uuid,
  uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_transaction_paid(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_financial_transaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_summary(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_rpc() TO authenticated;

-- Rollback note:
-- Reapply get_dashboard_rpc definition from 20260605121200_phase3_crm_core.sql.
-- DROP FUNCTION IF EXISTS public.get_financial_summary(date, date);
-- DROP FUNCTION IF EXISTS public.cancel_financial_transaction(uuid, text);
-- DROP FUNCTION IF EXISTS public.mark_transaction_paid(uuid, text, timestamptz);
-- DROP FUNCTION IF EXISTS public.create_financial_transaction(
--   public.transaction_type_enum,
--   numeric,
--   numeric,
--   public.transaction_status_enum,
--   text,
--   date,
--   timestamptz,
--   text,
--   text,
--   uuid,
--   uuid,
--   uuid
-- );
-- DROP TABLE IF EXISTS public.financial_transactions;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS payment_method;
-- ALTER TABLE public.sessions DROP COLUMN IF EXISTS payment_status;
-- DROP TYPE IF EXISTS public.transaction_status_enum;
-- DROP TYPE IF EXISTS public.transaction_type_enum;
