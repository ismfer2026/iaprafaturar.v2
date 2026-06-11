-- ============================================================
-- Phase 16a: Funil RevOps
--
-- Scope:
-- - Sales funnels, stages, opportunities and immutable timeline
-- - RPC-only mutations with audit events
-- - Mobile/desktop frontend consumes get_funnel_board()
--
-- Explicitly out of scope:
-- - Phase 8 campaigns, referrals, RFM and health score objects
-- - Automatic sync from opportunity stage to clients.journey_stage
-- ============================================================

CREATE TABLE public.sales_funnels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.funnel_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       uuid NOT NULL REFERENCES public.sales_funnels(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  color           text NOT NULL DEFAULT '#71717a',
  position        integer NOT NULL CHECK (position > 0),
  is_won          boolean NOT NULL DEFAULT false,
  is_lost         boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE public.funnel_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  funnel_id           uuid NOT NULL REFERENCES public.sales_funnels(id) ON DELETE RESTRICT,
  stage_id            uuid NOT NULL REFERENCES public.funnel_stages(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  title               text NOT NULL CHECK (length(trim(title)) > 0),
  source              text NOT NULL DEFAULT 'manual'
                      CHECK (source IN (
                        'manual',
                        'web_chat',
                        'indicacao',
                        'campaign',
                        'public_package',
                        'public_quote',
                        'whatsapp',
                        'email',
                        'other'
                      )),
  value               numeric(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','archived')),
  expected_close_date date,
  last_activity_at    timestamptz,
  won_at              timestamptz,
  lost_at             timestamptz,
  closed_reason       text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.funnel_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  opportunity_id  uuid NOT NULL REFERENCES public.funnel_opportunities(id) ON DELETE RESTRICT,
  event_type      text NOT NULL CHECK (event_type IN ('created','stage_moved','activity','closed','reopened')),
  from_stage_id   uuid REFERENCES public.funnel_stages(id) ON DELETE RESTRICT,
  to_stage_id     uuid REFERENCES public.funnel_stages(id) ON DELETE RESTRICT,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_funnels IS
  'Commercial funnel definitions owned by a professional. Phase 16a creates the default CRM funnel.';
COMMENT ON TABLE public.funnel_stages IS
  'Ordered stages for a sales funnel. Won/lost are terminal flags for opportunity close actions.';
COMMENT ON TABLE public.funnel_opportunities IS
  'Commercial opportunities linked to clients. Stage does not automatically rewrite clients.journey_stage.';
COMMENT ON TABLE public.funnel_events IS
  'Immutable timeline for funnel opportunities.';

CREATE UNIQUE INDEX idx_sales_funnels_default
  ON public.sales_funnels(professional_id)
  WHERE is_default = true;
CREATE INDEX idx_sales_funnels_professional
  ON public.sales_funnels(professional_id, is_active);

CREATE UNIQUE INDEX idx_funnel_stages_slug
  ON public.funnel_stages(funnel_id, slug);
CREATE UNIQUE INDEX idx_funnel_stages_position
  ON public.funnel_stages(funnel_id, position);
CREATE INDEX idx_funnel_stages_professional
  ON public.funnel_stages(professional_id, funnel_id, position);

CREATE INDEX idx_funnel_opportunities_board
  ON public.funnel_opportunities(professional_id, status, stage_id, updated_at DESC);
CREATE INDEX idx_funnel_opportunities_client
  ON public.funnel_opportunities(professional_id, client_id, updated_at DESC);
CREATE INDEX idx_funnel_opportunities_source
  ON public.funnel_opportunities(professional_id, source, created_at DESC);

CREATE INDEX idx_funnel_events_opportunity
  ON public.funnel_events(professional_id, opportunity_id, created_at DESC);

CREATE TRIGGER sales_funnels_updated_at
  BEFORE UPDATE ON public.sales_funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER funnel_stages_updated_at
  BEFORE UPDATE ON public.funnel_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER funnel_opportunities_updated_at
  BEFORE UPDATE ON public.funnel_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER prevent_funnel_events_change
  BEFORE UPDATE OR DELETE ON public.funnel_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_immutable();

ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_funnels_select_isolation"
ON public.sales_funnels FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

CREATE POLICY "funnel_stages_select_isolation"
ON public.funnel_stages FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

CREATE POLICY "funnel_opportunities_select_isolation"
ON public.funnel_opportunities FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

CREATE POLICY "funnel_events_select_isolation"
ON public.funnel_events FOR SELECT TO authenticated
USING (professional_id = public.auth_professional_id());

REVOKE ALL ON public.sales_funnels FROM anon, authenticated;
REVOKE ALL ON public.funnel_stages FROM anon, authenticated;
REVOKE ALL ON public.funnel_opportunities FROM anon, authenticated;
REVOKE ALL ON public.funnel_events FROM anon, authenticated;

GRANT SELECT ON public.sales_funnels TO authenticated;
GRANT SELECT ON public.funnel_stages TO authenticated;
GRANT SELECT ON public.funnel_opportunities TO authenticated;
GRANT SELECT ON public.funnel_events TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_default_sales_funnel()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_funnel_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_funnel_id
  FROM public.sales_funnels
  WHERE professional_id = v_professional_id
    AND is_default = true
  LIMIT 1;

  IF v_funnel_id IS NULL THEN
    INSERT INTO public.sales_funnels (professional_id, name, is_default)
    VALUES (v_professional_id, 'Funil comercial', true)
    RETURNING id INTO v_funnel_id;
  END IF;

  INSERT INTO public.funnel_stages (funnel_id, professional_id, name, slug, color, position, is_won, is_lost)
  VALUES
    (v_funnel_id, v_professional_id, 'Novo', 'novo', '#0f766e', 10, false, false),
    (v_funnel_id, v_professional_id, 'Qualificado', 'qualificado', '#2563eb', 20, false, false),
    (v_funnel_id, v_professional_id, 'Proposta', 'proposta', '#7c3aed', 30, false, false),
    (v_funnel_id, v_professional_id, 'Ganhou', 'ganhou', '#16a34a', 40, true, false),
    (v_funnel_id, v_professional_id, 'Perdido', 'perdido', '#dc2626', 50, false, true)
  ON CONFLICT (funnel_id, slug) DO NOTHING;

  RETURN v_funnel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_funnel_board()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_funnel_id uuid;
  v_result jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_funnel_id := public.ensure_default_sales_funnel();

  SELECT jsonb_build_object(
    'funnel', to_jsonb(f),
    'stages', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.position)
      FROM public.funnel_stages s
      WHERE s.funnel_id = v_funnel_id
        AND s.professional_id = v_professional_id
        AND s.is_active = true
    ), '[]'::jsonb),
    'opportunities', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'professional_id', o.professional_id,
          'funnel_id', o.funnel_id,
          'stage_id', o.stage_id,
          'client_id', o.client_id,
          'client_name', c.full_name,
          'client_phone_whatsapp', c.phone_whatsapp,
          'title', o.title,
          'source', o.source,
          'value', o.value,
          'status', o.status,
          'expected_close_date', o.expected_close_date,
          'last_activity_at', o.last_activity_at,
          'won_at', o.won_at,
          'lost_at', o.lost_at,
          'closed_reason', o.closed_reason,
          'metadata', o.metadata,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        )
        ORDER BY o.updated_at DESC
      )
      FROM public.funnel_opportunities o
      JOIN public.clients c
        ON c.id = o.client_id
       AND c.professional_id = v_professional_id
       AND c.deleted_at IS NULL
      WHERE o.funnel_id = v_funnel_id
        AND o.professional_id = v_professional_id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'opportunity_id', e.opportunity_id,
          'event_type', e.event_type,
          'from_stage_id', e.from_stage_id,
          'to_stage_id', e.to_stage_id,
          'payload', e.payload,
          'created_at', e.created_at
        )
        ORDER BY e.created_at DESC
      )
      FROM public.funnel_events e
      JOIN public.funnel_opportunities o
        ON o.id = e.opportunity_id
       AND o.professional_id = v_professional_id
      WHERE e.professional_id = v_professional_id
        AND o.funnel_id = v_funnel_id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.sales_funnels f
  WHERE f.id = v_funnel_id
    AND f.professional_id = v_professional_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_funnel_opportunity(
  p_client_id uuid,
  p_title text,
  p_source text DEFAULT 'manual',
  p_value numeric DEFAULT 0,
  p_stage_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_funnel_id uuid;
  v_stage public.funnel_stages%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_opportunity public.funnel_opportunities%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  IF COALESCE(p_value, 0) < 0 THEN
    RAISE EXCEPTION 'value must be greater than or equal to zero';
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id
    AND professional_id = v_professional_id
    AND deleted_at IS NULL;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'client not found';
  END IF;

  v_funnel_id := public.ensure_default_sales_funnel();

  IF p_stage_id IS NULL THEN
    SELECT * INTO v_stage
    FROM public.funnel_stages
    WHERE funnel_id = v_funnel_id
      AND professional_id = v_professional_id
      AND is_active = true
      AND is_won = false
      AND is_lost = false
    ORDER BY position
    LIMIT 1;
  ELSE
    SELECT * INTO v_stage
    FROM public.funnel_stages
    WHERE id = p_stage_id
      AND funnel_id = v_funnel_id
      AND professional_id = v_professional_id
      AND is_active = true;
  END IF;

  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'stage not found';
  END IF;

  IF v_stage.is_won OR v_stage.is_lost THEN
    RAISE EXCEPTION 'terminal stages require close_funnel_opportunity';
  END IF;

  INSERT INTO public.funnel_opportunities (
    professional_id,
    funnel_id,
    stage_id,
    client_id,
    title,
    source,
    value,
    created_by,
    metadata,
    last_activity_at
  )
  VALUES (
    v_professional_id,
    v_funnel_id,
    v_stage.id,
    v_client.id,
    trim(p_title),
    COALESCE(NULLIF(p_source, ''), 'manual'),
    COALESCE(p_value, 0),
    auth.uid(),
    COALESCE(p_metadata, '{}'),
    now()
  )
  RETURNING * INTO v_opportunity;

  INSERT INTO public.funnel_events (
    professional_id,
    opportunity_id,
    event_type,
    to_stage_id,
    actor_id,
    payload
  )
  VALUES (
    v_professional_id,
    v_opportunity.id,
    'created',
    v_stage.id,
    auth.uid(),
    jsonb_build_object('title', v_opportunity.title, 'client_id', v_client.id, 'source', v_opportunity.source)
  );

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'funnel.opportunity.created',
    'funnel_opportunity',
    v_opportunity.id,
    jsonb_build_object('client_id', v_client.id, 'stage_id', v_stage.id, 'source', v_opportunity.source, 'value', v_opportunity.value)
  );

  RETURN jsonb_build_object('opportunity_id', v_opportunity.id, 'opportunity', to_jsonb(v_opportunity));
END;
$$;

CREATE OR REPLACE FUNCTION public.move_funnel_opportunity(
  p_opportunity_id uuid,
  p_stage_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_opportunity public.funnel_opportunities%ROWTYPE;
  v_stage public.funnel_stages%ROWTYPE;
  v_from_stage_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_opportunity
  FROM public.funnel_opportunities
  WHERE id = p_opportunity_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF v_opportunity.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;

  IF v_opportunity.status <> 'open' THEN
    RAISE EXCEPTION 'closed opportunities cannot be moved';
  END IF;

  SELECT * INTO v_stage
  FROM public.funnel_stages
  WHERE id = p_stage_id
    AND funnel_id = v_opportunity.funnel_id
    AND professional_id = v_professional_id
    AND is_active = true;

  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'stage not found';
  END IF;

  IF v_stage.is_won OR v_stage.is_lost THEN
    RAISE EXCEPTION 'terminal stages require close_funnel_opportunity';
  END IF;

  v_from_stage_id := v_opportunity.stage_id;

  IF v_from_stage_id = v_stage.id THEN
    RETURN jsonb_build_object(
      'opportunity_id', v_opportunity.id,
      'from_stage_id', v_from_stage_id,
      'to_stage_id', v_stage.id,
      'changed', false
    );
  END IF;

  UPDATE public.funnel_opportunities
  SET stage_id = v_stage.id,
      last_activity_at = now()
  WHERE id = v_opportunity.id
  RETURNING * INTO v_opportunity;

  INSERT INTO public.funnel_events (
    professional_id,
    opportunity_id,
    event_type,
    from_stage_id,
    to_stage_id,
    actor_id,
    payload
  )
  VALUES (
    v_professional_id,
    v_opportunity.id,
    'stage_moved',
    v_from_stage_id,
    v_stage.id,
    auth.uid(),
    jsonb_build_object('reason', p_reason)
  );

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'funnel.opportunity.moved',
    'funnel_opportunity',
    v_opportunity.id,
    jsonb_build_object('from_stage_id', v_from_stage_id, 'to_stage_id', v_stage.id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'opportunity_id', v_opportunity.id,
    'from_stage_id', v_from_stage_id,
    'to_stage_id', v_stage.id,
    'changed', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_funnel_opportunity(
  p_opportunity_id uuid,
  p_outcome text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_opportunity public.funnel_opportunities%ROWTYPE;
  v_stage public.funnel_stages%ROWTYPE;
  v_from_stage_id uuid;
  v_status text;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_outcome NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'outcome must be won or lost';
  END IF;

  SELECT * INTO v_opportunity
  FROM public.funnel_opportunities
  WHERE id = p_opportunity_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF v_opportunity.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;

  IF v_opportunity.status <> 'open' THEN
    RAISE EXCEPTION 'opportunity already closed';
  END IF;

  SELECT * INTO v_stage
  FROM public.funnel_stages
  WHERE funnel_id = v_opportunity.funnel_id
    AND professional_id = v_professional_id
    AND is_active = true
    AND ((p_outcome = 'won' AND is_won = true) OR (p_outcome = 'lost' AND is_lost = true))
  ORDER BY position
  LIMIT 1;

  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'terminal stage not found';
  END IF;

  v_from_stage_id := v_opportunity.stage_id;
  v_status := p_outcome;

  UPDATE public.funnel_opportunities
  SET stage_id = v_stage.id,
      status = v_status,
      won_at = CASE WHEN p_outcome = 'won' THEN now() ELSE won_at END,
      lost_at = CASE WHEN p_outcome = 'lost' THEN now() ELSE lost_at END,
      closed_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
      last_activity_at = now()
  WHERE id = v_opportunity.id
  RETURNING * INTO v_opportunity;

  INSERT INTO public.funnel_events (
    professional_id,
    opportunity_id,
    event_type,
    from_stage_id,
    to_stage_id,
    actor_id,
    payload
  )
  VALUES (
    v_professional_id,
    v_opportunity.id,
    'closed',
    v_from_stage_id,
    v_stage.id,
    auth.uid(),
    jsonb_build_object('outcome', p_outcome, 'reason', p_reason)
  );

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'funnel.opportunity.closed',
    'funnel_opportunity',
    v_opportunity.id,
    jsonb_build_object('from_stage_id', v_from_stage_id, 'to_stage_id', v_stage.id, 'outcome', p_outcome, 'reason', p_reason)
  );

  RETURN jsonb_build_object('opportunity_id', v_opportunity.id, 'status', v_opportunity.status, 'stage_id', v_opportunity.stage_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_funnel_activity(
  p_opportunity_id uuid,
  p_activity_type text,
  p_payload jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_opportunity public.funnel_opportunities%ROWTYPE;
  v_event_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_activity_type IS NULL OR length(trim(p_activity_type)) = 0 THEN
    RAISE EXCEPTION 'activity_type is required';
  END IF;

  SELECT * INTO v_opportunity
  FROM public.funnel_opportunities
  WHERE id = p_opportunity_id
    AND professional_id = v_professional_id
  FOR UPDATE;

  IF v_opportunity.id IS NULL THEN
    RAISE EXCEPTION 'opportunity not found';
  END IF;

  UPDATE public.funnel_opportunities
  SET last_activity_at = now()
  WHERE id = v_opportunity.id;

  INSERT INTO public.funnel_events (
    professional_id,
    opportunity_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    v_professional_id,
    v_opportunity.id,
    'activity',
    auth.uid(),
    jsonb_build_object('activity_type', trim(p_activity_type), 'payload', COALESCE(p_payload, '{}'))
  )
  RETURNING id INTO v_event_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'funnel.activity.logged',
    'funnel_opportunity',
    v_opportunity.id,
    jsonb_build_object('activity_type', trim(p_activity_type), 'event_id', v_event_id)
  );

  RETURN jsonb_build_object('event_id', v_event_id, 'opportunity_id', v_opportunity.id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_sales_funnel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_funnel_board() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_funnel_opportunity(uuid, text, text, numeric, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_funnel_opportunity(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_funnel_opportunity(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_funnel_activity(uuid, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_funnel_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_funnel_opportunity(uuid, text, text, numeric, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_funnel_opportunity(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_funnel_opportunity(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_funnel_activity(uuid, text, jsonb) TO authenticated;
