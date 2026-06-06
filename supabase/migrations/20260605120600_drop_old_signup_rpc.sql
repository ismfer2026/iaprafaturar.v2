-- Remove a assinatura antiga create_professional_from_signup(text, text, text)
-- que aceitava p_email vindo do cliente.
-- A assinatura correta (text, text) foi criada em 20260605120500.
-- IF EXISTS: no-op em instalações limpas (função nunca foi criada lá).
DROP FUNCTION IF EXISTS public.create_professional_from_signup(text, text, text);
