-- ============================================================
-- Phase 15: Financeiro Operacional Avancado
--
-- Scope:
-- - financial settings: bank accounts, categories, cost centers, gateways
-- - mobile-first POS for services/products/packages
-- - receipt sending through the professional WhatsApp instance
-- - CSV/OFX reconciliation with auditable suggested matches
-- - stock decrement when a POS product item is sold
--
-- Explicitly out of scope:
-- - automatic gateway capture/settlement
-- - automatic reconciliation without professional confirmation
-- - SaaS platform billing
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  bank_name       text,
  account_type    text NOT NULL DEFAULT 'corrente'
                  CHECK (account_type IN ('corrente','poupanca','caixa','gateway','outros')),
  pix_key         text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  type            public.transaction_type_enum NOT NULL,
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, type, name)
);

CREATE TABLE IF NOT EXISTS public.finance_cost_centers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  description     text,
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, name)
);

CREATE TABLE IF NOT EXISTS public.finance_gateway_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  provider        text NOT NULL CHECK (provider IN ('manual','asaas','mercadopago','efibank','stripe','outros')),
  display_name    text NOT NULL,
  is_active       boolean NOT NULL DEFAULT false,
  config          jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, provider)
);

CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  sku             text,
  unit_price      numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  stock_quantity  numeric(10,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock       numeric(10,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, sku)
);

CREATE TABLE IF NOT EXISTS public.product_stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_change numeric(10,3) NOT NULL CHECK (quantity_change <> 0),
  reason          text NOT NULL CHECK (reason IN ('pdv_sale','manual_adjustment','return')),
  related_entity_type text,
  related_entity_id uuid,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  financial_transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  subtotal_amount numeric(10,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount    numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  payment_method  text NOT NULL CHECK (payment_method IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros')),
  receipt_sent_at timestamptz,
  receipt_message_event_id uuid REFERENCES public.message_events(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  item_type       text NOT NULL CHECK (item_type IN ('service','product','package','custom')),
  service_id      uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  product_id      uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  service_package_id uuid REFERENCES public.service_packages(id) ON DELETE RESTRICT,
  description     text NOT NULL CHECK (length(trim(description)) > 0),
  quantity        numeric(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount     numeric(10,2) NOT NULL CHECK (unit_amount >= 0),
  total_amount    numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_reconciliation_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT,
  file_name       text NOT NULL,
  file_type       text NOT NULL CHECK (file_type IN ('csv','ofx')),
  status          text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported','reviewing','completed','cancelled')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_reconciliation_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES public.finance_reconciliation_imports(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  occurred_on     date NOT NULL,
  description     text NOT NULL,
  amount          numeric(10,2) NOT NULL CHECK (amount <> 0),
  external_id     text,
  suggested_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  suggestion_score numeric(4,3) CHECK (suggestion_score IS NULL OR (suggestion_score >= 0 AND suggestion_score <= 1)),
  status          text NOT NULL DEFAULT 'suggested'
                  CHECK (status IN ('suggested','confirmed','ignored','unmatched')),
  confirmed_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  confirmed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_bank_accounts_updated_at') THEN
    CREATE TRIGGER finance_bank_accounts_updated_at
      BEFORE UPDATE ON public.finance_bank_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_categories_updated_at') THEN
    CREATE TRIGGER finance_categories_updated_at
      BEFORE UPDATE ON public.finance_categories
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_cost_centers_updated_at') THEN
    CREATE TRIGGER finance_cost_centers_updated_at
      BEFORE UPDATE ON public.finance_cost_centers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'finance_gateway_settings_updated_at') THEN
    CREATE TRIGGER finance_gateway_settings_updated_at
      BEFORE UPDATE ON public.finance_gateway_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated_at') THEN
    CREATE TRIGGER products_updated_at
      BEFORE UPDATE ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_message_event_id uuid REFERENCES public.message_events(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_bank_account_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_bank_account_id_fkey
      FOREIGN KEY (bank_account_id) REFERENCES public.finance_bank_accounts(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_category_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_cost_center_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_cost_center_id_fkey
      FOREIGN KEY (cost_center_id) REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_transactions_conciliacao_item_id_fkey'
      AND conrelid = 'public.financial_transactions'::regclass
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_conciliacao_item_id_fkey
      FOREIGN KEY (conciliacao_item_id) REFERENCES public.finance_reconciliation_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_bank_accounts_professional ON public.finance_bank_accounts(professional_id, is_active);
CREATE INDEX IF NOT EXISTS idx_finance_categories_professional ON public.finance_categories(professional_id, type, is_active);
CREATE INDEX IF NOT EXISTS idx_finance_cost_centers_professional ON public.finance_cost_centers(professional_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_professional ON public.products(professional_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_sales_professional ON public.pos_sales(professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_professional ON public.finance_reconciliation_items(professional_id, status, occurred_on DESC);

ALTER TABLE public.finance_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reconciliation_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_bank_accounts_isolation" ON public.finance_bank_accounts;
CREATE POLICY "finance_bank_accounts_isolation" ON public.finance_bank_accounts FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "finance_categories_isolation" ON public.finance_categories;
CREATE POLICY "finance_categories_isolation" ON public.finance_categories FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "finance_cost_centers_isolation" ON public.finance_cost_centers;
CREATE POLICY "finance_cost_centers_isolation" ON public.finance_cost_centers FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "finance_gateway_settings_isolation" ON public.finance_gateway_settings;
CREATE POLICY "finance_gateway_settings_isolation" ON public.finance_gateway_settings FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "products_isolation" ON public.products;
CREATE POLICY "products_isolation" ON public.products FOR ALL TO authenticated
USING (professional_id = public.auth_professional_id())
WITH CHECK (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "product_stock_movements_isolation" ON public.product_stock_movements;
CREATE POLICY "product_stock_movements_isolation" ON public.product_stock_movements FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "pos_sales_isolation" ON public.pos_sales;
CREATE POLICY "pos_sales_isolation" ON public.pos_sales FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "pos_sale_items_isolation" ON public.pos_sale_items;
CREATE POLICY "pos_sale_items_isolation" ON public.pos_sale_items FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "finance_reconciliation_imports_isolation" ON public.finance_reconciliation_imports;
CREATE POLICY "finance_reconciliation_imports_isolation" ON public.finance_reconciliation_imports FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

DROP POLICY IF EXISTS "finance_reconciliation_items_isolation" ON public.finance_reconciliation_items;
CREATE POLICY "finance_reconciliation_items_isolation" ON public.finance_reconciliation_items FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

GRANT SELECT ON public.finance_bank_accounts, public.finance_categories, public.finance_cost_centers,
  public.finance_gateway_settings, public.products, public.product_stock_movements, public.pos_sales,
  public.pos_sale_items, public.finance_reconciliation_imports, public.finance_reconciliation_items TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_settings(
  p_bank_accounts jsonb DEFAULT '[]',
  p_categories jsonb DEFAULT '[]',
  p_cost_centers jsonb DEFAULT '[]',
  p_gateways jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_item jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_bank_accounts, '[]'::jsonb)) LOOP
    INSERT INTO public.finance_bank_accounts (id, professional_id, name, bank_name, account_type, pix_key, opening_balance, is_default, is_active)
    VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_professional_id,
      trim(v_item->>'name'),
      NULLIF(trim(COALESCE(v_item->>'bank_name', '')), ''),
      COALESCE(NULLIF(v_item->>'account_type', ''), 'corrente'),
      NULLIF(trim(COALESCE(v_item->>'pix_key', '')), ''),
      COALESCE(NULLIF(v_item->>'opening_balance', '')::numeric, 0),
      COALESCE((v_item->>'is_default')::boolean, false),
      COALESCE((v_item->>'is_active')::boolean, true)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      bank_name = EXCLUDED.bank_name,
      account_type = EXCLUDED.account_type,
      pix_key = EXCLUDED.pix_key,
      opening_balance = EXCLUDED.opening_balance,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active
    WHERE public.finance_bank_accounts.professional_id = v_professional_id;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_categories, '[]'::jsonb)) LOOP
    INSERT INTO public.finance_categories (id, professional_id, name, type, is_default, is_active)
    VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_professional_id,
      trim(v_item->>'name'),
      (v_item->>'type')::public.transaction_type_enum,
      COALESCE((v_item->>'is_default')::boolean, false),
      COALESCE((v_item->>'is_active')::boolean, true)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active
    WHERE public.finance_categories.professional_id = v_professional_id;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_cost_centers, '[]'::jsonb)) LOOP
    INSERT INTO public.finance_cost_centers (id, professional_id, name, description, is_default, is_active)
    VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_professional_id,
      trim(v_item->>'name'),
      NULLIF(trim(COALESCE(v_item->>'description', '')), ''),
      COALESCE((v_item->>'is_default')::boolean, false),
      COALESCE((v_item->>'is_active')::boolean, true)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_default = EXCLUDED.is_default,
      is_active = EXCLUDED.is_active
    WHERE public.finance_cost_centers.professional_id = v_professional_id;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_gateways, '[]'::jsonb)) LOOP
    INSERT INTO public.finance_gateway_settings (professional_id, provider, display_name, is_active, config)
    VALUES (
      v_professional_id,
      COALESCE(NULLIF(v_item->>'provider', ''), 'manual'),
      COALESCE(NULLIF(trim(v_item->>'display_name'), ''), v_item->>'provider'),
      COALESCE((v_item->>'is_active')::boolean, false),
      COALESCE(v_item->'config', '{}'::jsonb)
    )
    ON CONFLICT (professional_id, provider) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      is_active = EXCLUDED.is_active,
      config = EXCLUDED.config;
  END LOOP;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'finance.settings.updated',
    'finance_settings',
    v_professional_id,
    jsonb_build_object('applies_to', 'future_transactions_only')
  );

  RETURN public.get_finance_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN jsonb_build_object(
    'bankAccounts', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.is_default DESC, b.name) FROM public.finance_bank_accounts b WHERE b.professional_id = v_professional_id), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.type, c.name) FROM public.finance_categories c WHERE c.professional_id = v_professional_id), '[]'::jsonb),
    'costCenters', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY cc.is_default DESC, cc.name) FROM public.finance_cost_centers cc WHERE cc.professional_id = v_professional_id), '[]'::jsonb),
    'gateways', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'provider', g.provider, 'display_name', g.display_name, 'is_active', g.is_active, 'created_at', g.created_at, 'updated_at', g.updated_at) ORDER BY g.provider) FROM public.finance_gateway_settings g WHERE g.professional_id = v_professional_id), '[]'::jsonb),
    'products', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM public.products p WHERE p.professional_id = v_professional_id AND p.is_active = true), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_client_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_discount_amount numeric DEFAULT 0,
  p_bank_account_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_client_id uuid;
  v_item jsonb;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2);
  v_transaction public.financial_transactions%ROWTYPE;
  v_sale public.pos_sales%ROWTYPE;
  v_description text;
  v_item_description text;
  v_item_type text;
  v_service_id uuid;
  v_product_id uuid;
  v_package_id uuid;
  v_quantity numeric(10,3);
  v_unit_amount numeric(10,2);
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;
  IF p_payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros') THEN RAISE EXCEPTION 'Invalid payment_method'; END IF;
  IF COALESCE(p_discount_amount, 0) < 0 THEN RAISE EXCEPTION 'discount_amount is invalid'; END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT id INTO v_client_id FROM public.clients
    WHERE id = p_client_id AND professional_id = v_professional_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
    v_unit_amount := COALESCE(NULLIF(v_item->>'unit_amount', '')::numeric, 0);
    IF v_quantity <= 0 OR v_unit_amount < 0 THEN RAISE EXCEPTION 'Invalid item amount'; END IF;
    v_subtotal := v_subtotal + (v_quantity * v_unit_amount);
  END LOOP;

  IF p_discount_amount > v_subtotal THEN RAISE EXCEPTION 'discount_amount is invalid'; END IF;
  v_total := v_subtotal - COALESCE(p_discount_amount, 0);
  IF v_total <= 0 THEN RAISE EXCEPTION 'total must be greater than zero'; END IF;

  v_description := 'Venda PDV';

  INSERT INTO public.financial_transactions (
    professional_id, client_id, type, category_id, cost_center_id, bank_account_id,
    amount, discount_amount, status, payment_method, paid_at, description, source, notes, created_by
  )
  VALUES (
    v_professional_id, v_client_id, 'receita', p_category_id, p_cost_center_id, p_bank_account_id,
    v_subtotal, COALESCE(p_discount_amount, 0), 'pago', p_payment_method, now(), v_description, 'pdv', p_notes, auth.uid()
  )
  RETURNING * INTO v_transaction;

  INSERT INTO public.pos_sales (
    professional_id, client_id, financial_transaction_id, subtotal_amount, discount_amount, total_amount, payment_method, created_by
  )
  VALUES (
    v_professional_id, v_client_id, v_transaction.id, v_subtotal, COALESCE(p_discount_amount, 0), v_total, p_payment_method, auth.uid()
  )
  RETURNING * INTO v_sale;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_type := COALESCE(NULLIF(v_item->>'item_type', ''), 'custom');
    v_service_id := NULLIF(v_item->>'service_id', '')::uuid;
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_package_id := NULLIF(v_item->>'service_package_id', '')::uuid;
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
    v_unit_amount := COALESCE(NULLIF(v_item->>'unit_amount', '')::numeric, 0);
    v_item_description := COALESCE(NULLIF(trim(v_item->>'description'), ''), 'Item PDV');

    IF v_item_type = 'product' AND v_product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_quantity
      WHERE id = v_product_id
        AND professional_id = v_professional_id
        AND is_active = true
        AND stock_quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product stock unavailable'; END IF;

      INSERT INTO public.product_stock_movements (
        professional_id, product_id, quantity_change, reason, related_entity_type, related_entity_id, created_by
      )
      VALUES (v_professional_id, v_product_id, -v_quantity, 'pdv_sale', 'pos_sale', v_sale.id, auth.uid());
    END IF;

    INSERT INTO public.pos_sale_items (
      sale_id, professional_id, item_type, service_id, product_id, service_package_id,
      description, quantity, unit_amount, total_amount
    )
    VALUES (
      v_sale.id, v_professional_id, v_item_type, v_service_id, v_product_id, v_package_id,
      v_item_description, v_quantity, v_unit_amount, v_quantity * v_unit_amount
    );
  END LOOP;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'pdv.sale.created',
    'pos_sale',
    v_sale.id,
    jsonb_build_object(
      'financial_transaction_id', v_transaction.id,
      'amount_cents', (v_total * 100)::integer,
      'item_count', jsonb_array_length(p_items),
      'stock_decrement_applied', EXISTS (
        SELECT 1 FROM public.pos_sale_items psi WHERE psi.sale_id = v_sale.id AND psi.item_type = 'product'
      )
    )
  );

  RETURN jsonb_build_object(
    'sale_id', v_sale.id,
    'transaction_id', v_transaction.id,
    'sale', to_jsonb(v_sale),
    'transaction', to_jsonb(v_transaction)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_product(
  p_product_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_sku text DEFAULT NULL,
  p_unit_price numeric DEFAULT 0,
  p_stock_quantity numeric DEFAULT 0,
  p_min_stock numeric DEFAULT 0,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_product public.products%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name is required'; END IF;
  IF COALESCE(p_unit_price, 0) < 0 OR COALESCE(p_stock_quantity, 0) < 0 OR COALESCE(p_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Invalid product values';
  END IF;

  INSERT INTO public.products (
    id, professional_id, name, sku, unit_price, stock_quantity, min_stock, is_active
  )
  VALUES (
    COALESCE(p_product_id, gen_random_uuid()),
    v_professional_id,
    trim(p_name),
    NULLIF(trim(COALESCE(p_sku, '')), ''),
    COALESCE(p_unit_price, 0),
    COALESCE(p_stock_quantity, 0),
    COALESCE(p_min_stock, 0),
    COALESCE(p_is_active, true)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    sku = EXCLUDED.sku,
    unit_price = EXCLUDED.unit_price,
    stock_quantity = EXCLUDED.stock_quantity,
    min_stock = EXCLUDED.min_stock,
    is_active = EXCLUDED.is_active
  WHERE public.products.professional_id = v_professional_id
  RETURNING * INTO v_product;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'product.upserted',
    'product',
    v_product.id,
    jsonb_build_object('stock_quantity', v_product.stock_quantity, 'unit_price_cents', (v_product.unit_price * 100)::integer)
  );

  RETURN jsonb_build_object('product_id', v_product.id, 'product', to_jsonb(v_product));
END;
$$;

CREATE OR REPLACE FUNCTION public.import_reconciliation_items(
  p_bank_account_id uuid,
  p_file_name text,
  p_file_type text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_import public.finance_reconciliation_imports%ROWTYPE;
  v_item jsonb;
  v_amount numeric(10,2);
  v_date date;
  v_description text;
  v_suggested_id uuid;
  v_score numeric(4,3);
  v_count integer := 0;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_file_type NOT IN ('csv','ofx') THEN RAISE EXCEPTION 'Invalid file_type'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;

  IF p_bank_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_bank_accounts
    WHERE id = p_bank_account_id AND professional_id = v_professional_id
  ) THEN
    RAISE EXCEPTION 'Bank account not found';
  END IF;

  INSERT INTO public.finance_reconciliation_imports (
    professional_id, bank_account_id, file_name, file_type, status, created_by
  )
  VALUES (v_professional_id, p_bank_account_id, p_file_name, p_file_type, 'reviewing', auth.uid())
  RETURNING * INTO v_import;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_amount := (v_item->>'amount')::numeric;
    v_date := (v_item->>'occurred_on')::date;
    v_description := trim(v_item->>'description');
    v_suggested_id := NULL;
    v_score := NULL;

    SELECT ft.id,
      CASE
        WHEN ft.net_amount = abs(v_amount) AND COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) = v_date THEN 0.950
        WHEN ft.net_amount = abs(v_amount) THEN 0.800
        ELSE 0.650
      END
    INTO v_suggested_id, v_score
    FROM public.financial_transactions ft
    WHERE ft.professional_id = v_professional_id
      AND ft.status = 'pago'
      AND ft.conciliacao_item_id IS NULL
      AND ft.net_amount BETWEEN abs(v_amount) - 1 AND abs(v_amount) + 1
      AND (
        COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) BETWEEN v_date - 5 AND v_date + 5
        OR extensions.unaccent(lower(ft.description)) LIKE '%' || extensions.unaccent(lower(split_part(v_description, ' ', 1))) || '%'
      )
    ORDER BY
      abs(ft.net_amount - abs(v_amount)),
      abs(COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) - v_date)
    LIMIT 1;

    INSERT INTO public.finance_reconciliation_items (
      import_id, professional_id, occurred_on, description, amount, external_id,
      suggested_transaction_id, suggestion_score, status
    )
    VALUES (
      v_import.id, v_professional_id, v_date, v_description, v_amount, NULLIF(v_item->>'external_id', ''),
      v_suggested_id, v_score, CASE WHEN v_suggested_id IS NULL THEN 'unmatched' ELSE 'suggested' END
    );

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'finance.reconciliation.imported',
    'finance_reconciliation_import',
    v_import.id,
    jsonb_build_object('file_type', p_file_type, 'item_count', v_count, 'auto_applied', false)
  );

  RETURN jsonb_build_object('import_id', v_import.id, 'item_count', v_count, 'auto_applied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_reconciliation_match(
  p_reconciliation_item_id uuid,
  p_financial_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_item public.finance_reconciliation_items%ROWTYPE;
  v_transaction public.financial_transactions%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO v_item
  FROM public.finance_reconciliation_items
  WHERE id = p_reconciliation_item_id
    AND professional_id = v_professional_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation item not found'; END IF;
  IF v_item.status = 'confirmed' THEN RAISE EXCEPTION 'Reconciliation item already confirmed'; END IF;

  SELECT * INTO v_transaction
  FROM public.financial_transactions
  WHERE id = p_financial_transaction_id
    AND professional_id = v_professional_id
    AND status = 'pago'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  UPDATE public.finance_reconciliation_items
  SET status = 'confirmed',
      confirmed_transaction_id = v_transaction.id,
      confirmed_by = auth.uid(),
      confirmed_at = now()
  WHERE id = v_item.id
  RETURNING * INTO v_item;

  UPDATE public.financial_transactions
  SET conciliacao_item_id = v_item.id,
      bank_account_id = COALESCE(bank_account_id, (
        SELECT bank_account_id FROM public.finance_reconciliation_imports WHERE id = v_item.import_id
      ))
  WHERE id = v_transaction.id
  RETURNING * INTO v_transaction;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'finance.reconciliation.confirmed',
    'finance_reconciliation_item',
    v_item.id,
    jsonb_build_object('financial_transaction_id', v_transaction.id, 'suggested_transaction_id', v_item.suggested_transaction_id)
  );

  RETURN jsonb_build_object('reconciliation_item_id', v_item.id, 'transaction_id', v_transaction.id, 'status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_receipt_sent(
  p_financial_transaction_id uuid,
  p_message_event_id uuid DEFAULT NULL
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
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.financial_transactions
  SET receipt_sent_at = now(),
      receipt_message_event_id = p_message_event_id
  WHERE id = p_financial_transaction_id
    AND professional_id = v_professional_id
    AND status = 'pago'
  RETURNING * INTO v_transaction;

  IF NOT FOUND THEN RAISE EXCEPTION 'Paid transaction not found'; END IF;

  UPDATE public.pos_sales
  SET receipt_sent_at = v_transaction.receipt_sent_at,
      receipt_message_event_id = p_message_event_id
  WHERE financial_transaction_id = v_transaction.id
    AND professional_id = v_professional_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'payment.receipt.sent',
    'financial_transaction',
    v_transaction.id,
    jsonb_build_object('message_event_id', p_message_event_id, 'source', v_transaction.source)
  );

  RETURN jsonb_build_object('transaction_id', v_transaction.id, 'receipt_sent_at', v_transaction.receipt_sent_at);
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_finance_settings(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_pos_sale(uuid, jsonb, text, numeric, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_reconciliation_items(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_reconciliation_match(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_receipt_sent(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_finance_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_finance_settings(jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(uuid, jsonb, text, numeric, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_reconciliation_items(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reconciliation_match(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_receipt_sent(uuid, uuid) TO authenticated;
