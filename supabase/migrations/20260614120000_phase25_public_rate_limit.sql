-- Fase 25: rate limit canônico para handlers públicos.
-- A chave é sempre um SHA-256 criado na Edge Function; nenhum token ou PII bruto é persistido.
-- ROLLBACK: DROP FUNCTION public.claim_public_request_rate_limit(text,text,integer,integer);
-- ROLLBACK: DROP TABLE public.public_request_rate_limits;

CREATE TABLE public.public_request_rate_limits (
  action text NOT NULL,
  fingerprint text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action, fingerprint, window_started_at)
);

ALTER TABLE public.public_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_request_rate_limits FROM PUBLIC, anon, authenticated;

CREATE INDEX idx_public_request_rate_limits_cleanup
  ON public.public_request_rate_limits (window_started_at);

CREATE OR REPLACE FUNCTION public.claim_public_request_rate_limit(
  p_action text,
  p_fingerprint text,
  p_limit integer DEFAULT 30,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  IF length(trim(coalesce(p_action, ''))) < 3
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds < 10 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.public_request_rate_limits (
    action, fingerprint, window_started_at, request_count, updated_at
  )
  VALUES (left(trim(p_action), 120), p_fingerprint, v_window, 1, now())
  ON CONFLICT (action, fingerprint, window_started_at)
  DO UPDATE SET
    request_count = public.public_request_rate_limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  IF random() < 0.01 THEN
    DELETE FROM public.public_request_rate_limits
    WHERE window_started_at < now() - interval '2 days';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_public_request_rate_limit(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_request_rate_limit(text,text,integer,integer) TO service_role;
