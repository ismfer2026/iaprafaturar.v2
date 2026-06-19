-- Backfill: regenera affiliate_code para parceiros criados antes da correção
-- de tamanho (20260617210000). Códigos antigos podiam ter mais de 12 caracteres
-- (ex: "BARBEARIASAPPCODEf44b"). Idempotente — só toca códigos com mais de 12 chars,
-- então rodar de novo não faz nada se já estiver tudo corrigido.
-- ROLLBACK: não há — códigos antigos não ficam registrados em nenhuma outra
-- tabela, então a regeneração não é reversível. Risco baixo: o código só é
-- usado em links de divulgação, não é credential nem é referenciado por FK.

DO $$
DECLARE
  v_partner record;
  v_new_code text;
  v_attempts integer;
BEGIN
  FOR v_partner IN
    SELECT ap.id, p.name, p.business_name
    FROM public.platform_affiliate_partners ap
    JOIN public.professionals p ON p.id = ap.professional_id
    WHERE length(ap.affiliate_code) > 12
  LOOP
    v_attempts := 0;

    LOOP
      v_new_code :=
        UPPER(SUBSTRING(regexp_replace(COALESCE(v_partner.business_name, v_partner.name, 'PRO'), '[^A-Za-z0-9]+', '', 'g'), 1, 6))
        || LOWER(SUBSTRING(replace(gen_random_uuid()::text, '-', ''), 1, 6));

      BEGIN
        UPDATE public.platform_affiliate_partners
        SET affiliate_code = v_new_code, updated_at = now()
        WHERE id = v_partner.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_attempts := v_attempts + 1;
        IF v_attempts > 5 THEN
          RAISE EXCEPTION 'Could not generate unique affiliate_code for partner %', v_partner.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END;
$$;
