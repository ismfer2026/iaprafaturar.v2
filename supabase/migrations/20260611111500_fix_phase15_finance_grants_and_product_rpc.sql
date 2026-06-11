-- ============================================================
-- Fix Phase 15 finance hardening
--
-- - Enforce the Phase 4 privilege pattern on new finance tables:
--   authenticated users read through RLS, mutations go through RPCs.
-- - Make upsert_product fail closed when p_product_id belongs to
--   another professional or does not exist.
-- ============================================================

REVOKE ALL ON public.finance_bank_accounts FROM anon, authenticated;
REVOKE ALL ON public.finance_categories FROM anon, authenticated;
REVOKE ALL ON public.finance_cost_centers FROM anon, authenticated;
REVOKE ALL ON public.finance_gateway_settings FROM anon, authenticated;
REVOKE ALL ON public.products FROM anon, authenticated;
REVOKE ALL ON public.product_stock_movements FROM anon, authenticated;
REVOKE ALL ON public.pos_sales FROM anon, authenticated;
REVOKE ALL ON public.pos_sale_items FROM anon, authenticated;
REVOKE ALL ON public.finance_reconciliation_imports FROM anon, authenticated;
REVOKE ALL ON public.finance_reconciliation_items FROM anon, authenticated;

GRANT SELECT ON public.finance_bank_accounts TO authenticated;
GRANT SELECT ON public.finance_categories TO authenticated;
GRANT SELECT ON public.finance_cost_centers TO authenticated;
GRANT SELECT ON public.finance_gateway_settings TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.product_stock_movements TO authenticated;
GRANT SELECT ON public.pos_sales TO authenticated;
GRANT SELECT ON public.pos_sale_items TO authenticated;
GRANT SELECT ON public.finance_reconciliation_imports TO authenticated;
GRANT SELECT ON public.finance_reconciliation_items TO authenticated;

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

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT *
    INTO v_product
    FROM public.products
    WHERE id = p_product_id
      AND professional_id = v_professional_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  IF COALESCE(p_unit_price, 0) < 0 OR COALESCE(p_stock_quantity, 0) < 0 OR COALESCE(p_min_stock, 0) < 0 THEN
    RAISE EXCEPTION 'Invalid product values';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      professional_id,
      name,
      sku,
      unit_price,
      stock_quantity,
      min_stock,
      is_active
    )
    VALUES (
      v_professional_id,
      trim(p_name),
      NULLIF(trim(COALESCE(p_sku, '')), ''),
      COALESCE(p_unit_price, 0),
      COALESCE(p_stock_quantity, 0),
      COALESCE(p_min_stock, 0),
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_product;
  ELSE
    UPDATE public.products
    SET name = trim(p_name),
        sku = NULLIF(trim(COALESCE(p_sku, '')), ''),
        unit_price = COALESCE(p_unit_price, 0),
        stock_quantity = COALESCE(p_stock_quantity, 0),
        min_stock = COALESCE(p_min_stock, 0),
        is_active = COALESCE(p_is_active, true)
    WHERE id = p_product_id
      AND professional_id = v_professional_id
    RETURNING * INTO v_product;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'product.upserted',
    'product',
    v_product.id,
    jsonb_build_object(
      'stock_quantity',
      v_product.stock_quantity,
      'unit_price_cents',
      (v_product.unit_price * 100)::integer
    )
  );

  RETURN jsonb_build_object('product_id', v_product.id, 'product', to_jsonb(v_product));
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_product(uuid, text, text, numeric, numeric, numeric, boolean) TO authenticated;
