-- Trigger de updated_at reutilizado por todas as tabelas.
-- Fica em migration própria pois professionals (120200) já o referencia.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
