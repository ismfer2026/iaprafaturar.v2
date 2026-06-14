-- Phase 20: canonical inventory, lot expiration, reconciliation lifecycle and finance role hardening.

CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_code text NOT NULL CHECK (length(trim(lot_code)) > 0),
  quantity numeric(10,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expires_at date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, product_id, lot_code)
);

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_batches_isolation" ON public.product_batches;
CREATE POLICY "product_batches_isolation" ON public.product_batches FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());
GRANT SELECT ON public.product_batches TO authenticated;

CREATE INDEX IF NOT EXISTS idx_product_batches_product
  ON public.product_batches(professional_id, product_id, expires_at) WHERE is_active = true;

DROP TRIGGER IF EXISTS product_batches_updated_at ON public.product_batches;
CREATE TRIGGER product_batches_updated_at
BEFORE UPDATE ON public.product_batches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_stock_movements
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.pos_sale_items
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.product_batches(id) ON DELETE RESTRICT;

ALTER TABLE public.finance_reconciliation_imports
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_import_fingerprint
  ON public.finance_reconciliation_imports(professional_id, fingerprint)
  WHERE fingerprint IS NOT NULL AND status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_confirmed_transaction
  ON public.finance_reconciliation_items(professional_id, confirmed_transaction_id)
  WHERE confirmed_transaction_id IS NOT NULL AND status = 'confirmed';

CREATE OR REPLACE FUNCTION public.phase20_require_gestor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.phase20_require_gestor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS finance_bank_accounts_require_gestor ON public.finance_bank_accounts;
CREATE TRIGGER finance_bank_accounts_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();
DROP TRIGGER IF EXISTS finance_categories_require_gestor ON public.finance_categories;
CREATE TRIGGER finance_categories_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_categories
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();
DROP TRIGGER IF EXISTS finance_cost_centers_require_gestor ON public.finance_cost_centers;
CREATE TRIGGER finance_cost_centers_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_cost_centers
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();
DROP TRIGGER IF EXISTS finance_gateway_settings_require_gestor ON public.finance_gateway_settings;
CREATE TRIGGER finance_gateway_settings_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_gateway_settings
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();
DROP TRIGGER IF EXISTS reconciliation_imports_require_gestor ON public.finance_reconciliation_imports;
CREATE TRIGGER reconciliation_imports_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_reconciliation_imports
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();
DROP TRIGGER IF EXISTS reconciliation_items_require_gestor ON public.finance_reconciliation_items;
CREATE TRIGGER reconciliation_items_require_gestor BEFORE INSERT OR UPDATE OR DELETE ON public.finance_reconciliation_items
FOR EACH ROW EXECUTE FUNCTION public.phase20_require_gestor();

REVOKE SELECT ON public.finance_gateway_settings FROM authenticated;

CREATE OR REPLACE FUNCTION public.phase20_validate_tracked_stock(p_product_id uuid, p_stock_quantity numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tracked numeric(10,3);
BEGIN
  SELECT COALESCE(sum(quantity), 0) INTO v_tracked
  FROM public.product_batches
  WHERE product_id = p_product_id AND is_active = true;
  IF v_tracked > p_stock_quantity THEN
    RAISE EXCEPTION 'insufficient_untracked_stock';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.phase20_validate_tracked_stock(uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.phase20_products_validate_tracked_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.phase20_validate_tracked_stock(NEW.id, NEW.stock_quantity);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.phase20_products_validate_tracked_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS products_validate_tracked_stock ON public.products;
CREATE TRIGGER products_validate_tracked_stock AFTER UPDATE OF stock_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.phase20_products_validate_tracked_stock();

CREATE OR REPLACE FUNCTION public.upsert_product(
  p_product_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_sku text DEFAULT NULL,
  p_unit_price numeric DEFAULT 0,
  p_stock_quantity numeric DEFAULT 0,
  p_min_stock numeric DEFAULT 0,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_product public.products%ROWTYPE;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;
  IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN RAISE EXCEPTION 'name_required'; END IF;
  IF COALESCE(p_unit_price, 0) < 0 OR COALESCE(p_stock_quantity, 0) < 0 OR COALESCE(p_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_product_values';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (professional_id, name, sku, unit_price, stock_quantity, min_stock, is_active)
    VALUES (v_professional_id, trim(p_name), NULLIF(trim(COALESCE(p_sku, '')), ''), p_unit_price, p_stock_quantity, p_min_stock, p_is_active)
    RETURNING * INTO v_product;
    IF v_product.stock_quantity > 0 THEN
      INSERT INTO public.product_stock_movements(professional_id, product_id, quantity_change, reason, note, created_by)
      VALUES (v_professional_id, v_product.id, v_product.stock_quantity, 'manual_adjustment', 'initial_balance', auth.uid());
    END IF;
  ELSE
    UPDATE public.products SET
      name = trim(p_name), sku = NULLIF(trim(COALESCE(p_sku, '')), ''),
      unit_price = p_unit_price, min_stock = p_min_stock, is_active = p_is_active
    WHERE id = p_product_id AND professional_id = v_professional_id
    RETURNING * INTO v_product;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  END IF;

  PERFORM public.log_audit_event(v_professional_id, 'professional', 'product.upserted', 'product', v_product.id,
    jsonb_build_object('stock_quantity', v_product.stock_quantity, 'metadata_only_update', p_product_id IS NOT NULL));
  RETURN jsonb_build_object('product_id', v_product.id, 'product', to_jsonb(v_product));
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id uuid,
  p_quantity_change numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_product public.products%ROWTYPE;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN RAISE EXCEPTION 'quantity_change_required'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND professional_id = v_professional_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  UPDATE public.products SET stock_quantity = stock_quantity + p_quantity_change
  WHERE id = v_product.id AND stock_quantity + p_quantity_change >= 0 RETURNING * INTO v_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
  INSERT INTO public.product_stock_movements(professional_id, product_id, quantity_change, reason, note, created_by)
  VALUES (v_professional_id, v_product.id, p_quantity_change, 'manual_adjustment', NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid());
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'inventory.adjusted', 'product', v_product.id,
    jsonb_build_object('quantity_change', p_quantity_change, 'stock_quantity', v_product.stock_quantity));
  RETURN jsonb_build_object('product', to_jsonb(v_product));
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_product_batch(
  p_batch_id uuid,
  p_product_id uuid,
  p_lot_code text,
  p_quantity numeric,
  p_expires_at date DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_product public.products%ROWTYPE;
  v_batch public.product_batches%ROWTYPE;
  v_other_tracked numeric(10,3);
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  IF NULLIF(trim(COALESCE(p_lot_code, '')), '') IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'invalid_batch'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND professional_id = v_professional_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  SELECT COALESCE(sum(quantity), 0) INTO v_other_tracked FROM public.product_batches
  WHERE product_id = p_product_id AND is_active = true AND id IS DISTINCT FROM p_batch_id;
  IF p_is_active AND v_other_tracked + p_quantity > v_product.stock_quantity THEN RAISE EXCEPTION 'insufficient_untracked_stock'; END IF;
  INSERT INTO public.product_batches(id, professional_id, product_id, lot_code, quantity, expires_at, is_active, created_by)
  VALUES (COALESCE(p_batch_id, gen_random_uuid()), v_professional_id, p_product_id, trim(p_lot_code), p_quantity, p_expires_at, p_is_active, auth.uid())
  ON CONFLICT (id) DO UPDATE SET lot_code = EXCLUDED.lot_code, quantity = EXCLUDED.quantity, expires_at = EXCLUDED.expires_at, is_active = EXCLUDED.is_active
  WHERE public.product_batches.professional_id = v_professional_id
  RETURNING * INTO v_batch;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'inventory.batch.upserted', 'product_batch', v_batch.id, to_jsonb(v_batch));
  RETURN jsonb_build_object('batch', to_jsonb(v_batch));
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_product_batch(uuid, uuid, text, numeric, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_product_batch(uuid, uuid, text, numeric, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inventory_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professional_id uuid := public.auth_professional_id();
BEGIN
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN jsonb_build_object(
    'products', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.low_stock DESC, x.name) FROM (
      SELECT p.*, COALESCE(sum(b.quantity) FILTER (WHERE b.is_active), 0) AS tracked_quantity,
        p.stock_quantity - COALESCE(sum(b.quantity) FILTER (WHERE b.is_active), 0) AS untracked_quantity,
        p.stock_quantity <= p.min_stock AS low_stock
      FROM public.products p LEFT JOIN public.product_batches b ON b.product_id = p.id
      WHERE p.professional_id = v_professional_id GROUP BY p.id
    ) x), '[]'::jsonb),
    'batches', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.expires_at NULLS LAST) FROM public.product_batches b
      WHERE b.professional_id = v_professional_id AND b.is_active = true), '[]'::jsonb),
    'movements', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM (
      SELECT * FROM public.product_stock_movements WHERE professional_id = v_professional_id ORDER BY created_at DESC LIMIT 100
    ) m), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_inventory_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.import_reconciliation_items(
  p_bank_account_id uuid, p_file_name text, p_file_type text, p_items jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id();
  v_import public.finance_reconciliation_imports%ROWTYPE;
  v_item jsonb; v_amount numeric(10,2); v_date date; v_description text;
  v_suggested_id uuid; v_score numeric(4,3); v_count integer := 0; v_fingerprint text;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  IF p_file_type NOT IN ('csv','ofx') OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'invalid_import'; END IF;
  IF p_bank_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.finance_bank_accounts WHERE id = p_bank_account_id AND professional_id = v_professional_id) THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
  v_fingerprint := md5(COALESCE(p_bank_account_id::text, '') || ':' || p_file_type || ':' || p_items::text);
  IF EXISTS (SELECT 1 FROM public.finance_reconciliation_imports WHERE professional_id = v_professional_id AND fingerprint = v_fingerprint AND status <> 'cancelled') THEN RAISE EXCEPTION 'reconciliation_import_duplicate'; END IF;
  INSERT INTO public.finance_reconciliation_imports(professional_id, bank_account_id, file_name, file_type, status, fingerprint, created_by)
  VALUES (v_professional_id, p_bank_account_id, p_file_name, p_file_type, 'reviewing', v_fingerprint, auth.uid()) RETURNING * INTO v_import;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_amount := (v_item->>'amount')::numeric; v_date := (v_item->>'occurred_on')::date; v_description := trim(v_item->>'description');
    IF v_amount = 0 OR v_description = '' THEN RAISE EXCEPTION 'invalid_reconciliation_item'; END IF;
    v_suggested_id := NULL; v_score := NULL;
    SELECT ft.id, CASE WHEN ft.net_amount = abs(v_amount) AND COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) = v_date THEN 0.950 WHEN ft.net_amount = abs(v_amount) THEN 0.800 ELSE 0.650 END
    INTO v_suggested_id, v_score FROM public.financial_transactions ft
    WHERE ft.professional_id = v_professional_id AND ft.status = 'pago' AND ft.conciliacao_item_id IS NULL
      AND ft.net_amount BETWEEN abs(v_amount) - 1 AND abs(v_amount) + 1
      AND COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) BETWEEN v_date - 5 AND v_date + 5
    ORDER BY abs(ft.net_amount - abs(v_amount)), abs(COALESCE(ft.paid_at::date, ft.due_date, ft.created_at::date) - v_date) LIMIT 1;
    INSERT INTO public.finance_reconciliation_items(import_id, professional_id, occurred_on, description, amount, external_id, suggested_transaction_id, suggestion_score, status)
    VALUES (v_import.id, v_professional_id, v_date, v_description, v_amount, NULLIF(v_item->>'external_id', ''), v_suggested_id, v_score, CASE WHEN v_suggested_id IS NULL THEN 'unmatched' ELSE 'suggested' END);
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'finance.reconciliation.imported', 'finance_reconciliation_import', v_import.id,
    jsonb_build_object('file_type', p_file_type, 'item_count', v_count, 'auto_applied', false, 'fingerprint', v_fingerprint));
  RETURN jsonb_build_object('import_id', v_import.id, 'item_count', v_count, 'auto_applied', false);
END;
$$;
REVOKE ALL ON FUNCTION public.import_reconciliation_items(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_reconciliation_items(uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_client_id uuid, p_items jsonb, p_payment_method text, p_discount_amount numeric DEFAULT 0,
  p_bank_account_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_professional_id uuid := public.auth_professional_id(); v_client_id uuid; v_item jsonb;
  v_subtotal numeric(10,2) := 0; v_total numeric(10,2); v_transaction public.financial_transactions%ROWTYPE; v_sale public.pos_sales%ROWTYPE;
  v_item_description text; v_item_type text; v_service_id uuid; v_product_id uuid; v_package_id uuid; v_batch_id uuid;
  v_quantity numeric(10,3); v_unit_amount numeric(10,2); v_untracked numeric(10,3);
BEGIN
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'items_required'; END IF;
  IF p_payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','outros') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  IF COALESCE(p_discount_amount, 0) < 0 THEN RAISE EXCEPTION 'invalid_discount'; END IF;
  IF p_client_id IS NOT NULL THEN SELECT id INTO v_client_id FROM public.clients WHERE id = p_client_id AND professional_id = v_professional_id AND deleted_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'client_not_found'; END IF; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1); v_unit_amount := COALESCE(NULLIF(v_item->>'unit_amount', '')::numeric, 0);
    IF v_quantity <= 0 OR v_unit_amount < 0 THEN RAISE EXCEPTION 'invalid_item_amount'; END IF; v_subtotal := v_subtotal + v_quantity * v_unit_amount;
  END LOOP;
  IF p_discount_amount > v_subtotal THEN RAISE EXCEPTION 'invalid_discount'; END IF; v_total := v_subtotal - COALESCE(p_discount_amount, 0); IF v_total <= 0 THEN RAISE EXCEPTION 'invalid_total'; END IF;
  INSERT INTO public.financial_transactions(professional_id, client_id, type, category_id, cost_center_id, bank_account_id, amount, discount_amount, status, payment_method, paid_at, description, source, notes, created_by)
  VALUES (v_professional_id, v_client_id, 'receita', p_category_id, p_cost_center_id, p_bank_account_id, v_subtotal, COALESCE(p_discount_amount, 0), 'pago', p_payment_method, now(), 'Venda PDV', 'pdv', p_notes, auth.uid()) RETURNING * INTO v_transaction;
  INSERT INTO public.pos_sales(professional_id, client_id, financial_transaction_id, subtotal_amount, discount_amount, total_amount, payment_method, created_by)
  VALUES (v_professional_id, v_client_id, v_transaction.id, v_subtotal, COALESCE(p_discount_amount, 0), v_total, p_payment_method, auth.uid()) RETURNING * INTO v_sale;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_type := COALESCE(NULLIF(v_item->>'item_type', ''), 'custom'); v_service_id := NULLIF(v_item->>'service_id', '')::uuid;
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid; v_package_id := NULLIF(v_item->>'service_package_id', '')::uuid; v_batch_id := NULLIF(v_item->>'batch_id', '')::uuid;
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1); v_unit_amount := COALESCE(NULLIF(v_item->>'unit_amount', '')::numeric, 0); v_item_description := COALESCE(NULLIF(trim(v_item->>'description'), ''), 'Item PDV');
    IF v_item_type = 'product' AND v_product_id IS NOT NULL THEN
      PERFORM 1 FROM public.products p WHERE p.id = v_product_id AND p.professional_id = v_professional_id AND p.is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
      SELECT p.stock_quantity - COALESCE((SELECT sum(b.quantity) FROM public.product_batches b WHERE b.product_id = p.id AND b.is_active), 0)
      INTO v_untracked FROM public.products p WHERE p.id = v_product_id;
      IF v_batch_id IS NULL AND v_untracked < v_quantity THEN RAISE EXCEPTION 'product_batch_required'; END IF;
      IF v_batch_id IS NOT NULL THEN
        UPDATE public.product_batches SET quantity = quantity - v_quantity WHERE id = v_batch_id AND product_id = v_product_id AND professional_id = v_professional_id AND is_active AND quantity >= v_quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'batch_stock_unavailable'; END IF;
      END IF;
      UPDATE public.products SET stock_quantity = stock_quantity - v_quantity WHERE id = v_product_id AND professional_id = v_professional_id AND stock_quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'product_stock_unavailable'; END IF;
      INSERT INTO public.product_stock_movements(professional_id, product_id, batch_id, quantity_change, reason, related_entity_type, related_entity_id, created_by)
      VALUES (v_professional_id, v_product_id, v_batch_id, -v_quantity, 'pdv_sale', 'pos_sale', v_sale.id, auth.uid());
    END IF;
    INSERT INTO public.pos_sale_items(sale_id, professional_id, item_type, service_id, product_id, batch_id, service_package_id, description, quantity, unit_amount, total_amount)
    VALUES (v_sale.id, v_professional_id, v_item_type, v_service_id, v_product_id, v_batch_id, v_package_id, v_item_description, v_quantity, v_unit_amount, v_quantity * v_unit_amount);
  END LOOP;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'pdv.sale.created', 'pos_sale', v_sale.id, jsonb_build_object('financial_transaction_id', v_transaction.id, 'amount_cents', (v_total * 100)::integer, 'item_count', jsonb_array_length(p_items)));
  RETURN jsonb_build_object('sale_id', v_sale.id, 'transaction_id', v_transaction.id, 'sale', to_jsonb(v_sale), 'transaction', to_jsonb(v_transaction));
END;
$$;
REVOKE ALL ON FUNCTION public.create_pos_sale(uuid, jsonb, text, numeric, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(uuid, jsonb, text, numeric, uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ignore_reconciliation_item(p_reconciliation_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professional_id uuid := public.auth_professional_id();
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  UPDATE public.finance_reconciliation_items SET status = 'ignored', confirmed_transaction_id = NULL, confirmed_by = NULL, confirmed_at = NULL
  WHERE id = p_reconciliation_item_id AND professional_id = v_professional_id AND status <> 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_item_not_found_or_confirmed'; END IF;
  RETURN jsonb_build_object('reconciliation_item_id', p_reconciliation_item_id, 'status', 'ignored');
END;
$$;
REVOKE ALL ON FUNCTION public.ignore_reconciliation_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ignore_reconciliation_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_reconciliation_import(p_import_id uuid, p_cancel boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professional_id uuid := public.auth_professional_id(); v_status text;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  v_status := CASE WHEN p_cancel THEN 'cancelled' ELSE 'completed' END;
  IF NOT p_cancel AND EXISTS (SELECT 1 FROM public.finance_reconciliation_items WHERE import_id = p_import_id AND professional_id = v_professional_id AND status IN ('suggested','unmatched')) THEN
    RAISE EXCEPTION 'reconciliation_items_pending';
  END IF;
  UPDATE public.finance_reconciliation_imports SET status = v_status,
    completed_at = CASE WHEN NOT p_cancel THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN p_cancel THEN now() ELSE cancelled_at END
  WHERE id = p_import_id AND professional_id = v_professional_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation_import_not_found'; END IF;
  RETURN jsonb_build_object('import_id', p_import_id, 'status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_reconciliation_import(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_reconciliation_import(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_receipt_settings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professional_id uuid := public.auth_professional_id();
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  RETURN COALESCE((SELECT settings->'finance_receipts' FROM public.professionals WHERE id = v_professional_id), '{"enabled":true,"auto_send":false,"include_notes":true}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_finance_receipt_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_receipt_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_finance_receipt_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professional_id uuid := public.auth_professional_id(); v_validated jsonb;
BEGIN
  IF v_professional_id IS NULL OR public.auth_professional_role() <> 'gestor' THEN RAISE EXCEPTION 'Unauthorized: gestor role required'; END IF;
  v_validated := jsonb_build_object(
    'enabled', COALESCE((p_settings->>'enabled')::boolean, true),
    'auto_send', COALESCE((p_settings->>'auto_send')::boolean, false),
    'include_notes', COALESCE((p_settings->>'include_notes')::boolean, true),
    'footer', left(COALESCE(p_settings->>'footer', ''), 300)
  );
  UPDATE public.professionals SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{finance_receipts}', v_validated, true) WHERE id = v_professional_id;
  PERFORM public.log_audit_event(v_professional_id, 'professional', 'finance.receipt_settings.updated', 'professional', v_professional_id, v_validated);
  RETURN v_validated;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_finance_receipt_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_finance_receipt_settings(jsonb) TO authenticated;
