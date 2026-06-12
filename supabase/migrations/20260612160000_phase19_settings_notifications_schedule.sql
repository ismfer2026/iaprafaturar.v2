-- Phase 19 (PR 19.7) - C19-03 (preferencias de notificacao) e C19-04 (horario
-- de funcionamento). Reaproveita professionals.settings.notifications/
-- business_hours (defaults da clinica) e team_members.notifications/
-- business_hours (preferencias/excecoes individuais). Nenhuma tabela ou
-- coluna nova.
-- Rollback: DROP das 6 RPCs e das 3 funcoes auxiliares phase19_validate_*.

-- 1. Validadores de schema JSONB (sem SECURITY DEFINER; chamadas internas
-- a partir de RPCs SECURITY DEFINER nao sofrem o REVOKE abaixo).

CREATE OR REPLACE FUNCTION public.phase19_validate_time_interval(p_interval jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_start text;
  v_end text;
BEGIN
  IF jsonb_typeof(p_interval) <> 'object' THEN
    RAISE EXCEPTION 'invalid_interval';
  END IF;

  v_start := p_interval->>'start';
  v_end := p_interval->>'end';

  IF v_start IS NULL OR v_start !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'invalid_interval_start';
  END IF;

  IF v_end IS NULL OR v_end !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'invalid_interval_end';
  END IF;

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_interval_order';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.phase19_validate_time_interval(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.phase19_validate_notification_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_settings jsonb;
  v_channels jsonb;
  v_events jsonb;
  v_quiet jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  v_settings := COALESCE(p_settings, '{}'::jsonb);

  IF jsonb_typeof(v_settings) <> 'object' THEN
    RAISE EXCEPTION 'invalid_notification_settings';
  END IF;

  IF v_settings ? 'schema_version' AND (v_settings->>'schema_version') <> '1' THEN
    RAISE EXCEPTION 'unsupported_schema_version';
  END IF;

  v_channels := COALESCE(v_settings->'channels', '{}'::jsonb);
  IF jsonb_typeof(v_channels) <> 'object' THEN
    RAISE EXCEPTION 'invalid_channels';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(v_channels) LOOP
    IF v_key NOT IN ('whatsapp', 'email', 'push') THEN
      RAISE EXCEPTION 'invalid_channel_key: %', v_key;
    END IF;
    IF jsonb_typeof(v_value) <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_channel_value: %', v_key;
    END IF;
  END LOOP;

  v_events := COALESCE(v_settings->'events', '{}'::jsonb);
  IF jsonb_typeof(v_events) <> 'object' THEN
    RAISE EXCEPTION 'invalid_events';
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(v_events) LOOP
    IF v_key NOT IN (
      'new_appointment', 'appointment_cancelled', 'appointment_reminder',
      'new_message', 'payment_received', 'anamnese_submitted'
    ) THEN
      RAISE EXCEPTION 'invalid_event_key: %', v_key;
    END IF;
    IF jsonb_typeof(v_value) <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_event_value: %', v_key;
    END IF;
  END LOOP;

  v_quiet := COALESCE(v_settings->'quiet_hours', '{}'::jsonb);
  IF jsonb_typeof(v_quiet) <> 'object' THEN
    RAISE EXCEPTION 'invalid_quiet_hours';
  END IF;

  IF v_quiet ? 'enabled' AND jsonb_typeof(v_quiet->'enabled') <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_quiet_hours_enabled';
  END IF;

  IF v_quiet ? 'start' AND (v_quiet->>'start') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'invalid_quiet_hours_start';
  END IF;

  IF v_quiet ? 'end' AND (v_quiet->>'end') !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'invalid_quiet_hours_end';
  END IF;

  RETURN jsonb_build_object(
    'schema_version', 1,
    'channels', v_channels,
    'events', v_events,
    'quiet_hours', v_quiet
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phase19_validate_notification_settings(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.phase19_validate_business_hours(p_business_hours jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_hours jsonb;
  v_weekly jsonb;
  v_exceptions jsonb;
  v_day text;
  v_intervals jsonb;
  v_exception jsonb;
  v_idx integer;
  v_idx2 integer;
BEGIN
  v_hours := COALESCE(p_business_hours, '{}'::jsonb);

  IF jsonb_typeof(v_hours) <> 'object' THEN
    RAISE EXCEPTION 'invalid_business_hours';
  END IF;

  -- '{}' significa "sem excecao" (fallback para horario da clinica),
  -- valido apenas para team_members.business_hours.
  IF v_hours = '{}'::jsonb THEN
    RETURN v_hours;
  END IF;

  IF v_hours ? 'schema_version' AND (v_hours->>'schema_version') <> '1' THEN
    RAISE EXCEPTION 'unsupported_schema_version';
  END IF;

  IF v_hours ? 'timezone' AND jsonb_typeof(v_hours->'timezone') <> 'string' THEN
    RAISE EXCEPTION 'invalid_timezone';
  END IF;

  v_weekly := COALESCE(v_hours->'weekly', '{}'::jsonb);
  IF jsonb_typeof(v_weekly) <> 'object' THEN
    RAISE EXCEPTION 'invalid_weekly';
  END IF;

  FOR v_day, v_intervals IN SELECT * FROM jsonb_each(v_weekly) LOOP
    IF v_day NOT IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') THEN
      RAISE EXCEPTION 'invalid_weekday: %', v_day;
    END IF;
    IF jsonb_typeof(v_intervals) <> 'array' THEN
      RAISE EXCEPTION 'invalid_intervals: %', v_day;
    END IF;
    FOR v_idx IN 0 .. jsonb_array_length(v_intervals) - 1 LOOP
      PERFORM public.phase19_validate_time_interval(v_intervals -> v_idx);
    END LOOP;
  END LOOP;

  v_exceptions := COALESCE(v_hours->'exceptions', '[]'::jsonb);
  IF jsonb_typeof(v_exceptions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_exceptions';
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_exceptions) - 1 LOOP
    v_exception := v_exceptions -> v_idx;
    IF jsonb_typeof(v_exception) <> 'object' THEN
      RAISE EXCEPTION 'invalid_exception_entry';
    END IF;
    IF NOT (v_exception ? 'date') OR (v_exception->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'invalid_exception_date';
    END IF;
    IF v_exception ? 'closed' AND jsonb_typeof(v_exception->'closed') <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_exception_closed';
    END IF;
    IF v_exception ? 'intervals' THEN
      IF jsonb_typeof(v_exception->'intervals') <> 'array' THEN
        RAISE EXCEPTION 'invalid_exception_intervals';
      END IF;
      FOR v_idx2 IN 0 .. jsonb_array_length(v_exception->'intervals') - 1 LOOP
        PERFORM public.phase19_validate_time_interval(v_exception->'intervals' -> v_idx2);
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'schema_version', 1,
    'timezone', COALESCE(v_hours->'timezone', to_jsonb('America/Sao_Paulo'::text)),
    'weekly', v_weekly,
    'exceptions', v_exceptions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phase19_validate_business_hours(jsonb) FROM PUBLIC, anon, authenticated;

-- 2. C19-03: preferencias de notificacao.

CREATE OR REPLACE FUNCTION public.get_professional_notification_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_role text;
  v_clinic_defaults jsonb;
  v_team_member_id uuid;
  v_member_preferences jsonb;
  v_my_preferences jsonb;
  v_source text;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_role := public.auth_professional_role();

  SELECT COALESCE(settings->'notifications', '{}'::jsonb)
  INTO v_clinic_defaults
  FROM public.professionals
  WHERE id = v_professional_id;

  SELECT id, notifications INTO v_team_member_id, v_member_preferences
  FROM public.team_members
  WHERE professional_id = v_professional_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  IF v_team_member_id IS NOT NULL AND COALESCE(v_member_preferences, '{}'::jsonb) <> '{}'::jsonb THEN
    v_my_preferences := v_member_preferences;
    v_source := 'individual';
  ELSE
    v_my_preferences := v_clinic_defaults;
    v_source := 'clinic';
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'clinicDefaults', v_clinic_defaults,
    'myPreferences', v_my_preferences,
    'myPreferencesSource', v_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_notification_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_notification_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_professional_notification_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_validated jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  v_validated := public.phase19_validate_notification_settings(p_settings);

  UPDATE public.professionals
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{notifications}', v_validated, true),
      updated_at = now()
  WHERE id = v_professional_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'notification_settings.clinic_updated',
    'professional',
    v_professional_id,
    jsonb_build_object('notifications', v_validated)
  );

  RETURN jsonb_build_object('ok', true, 'notifications', v_validated);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_professional_notification_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_professional_notification_settings(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_my_notification_preferences(p_preferences jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_validated jsonb;
  v_team_member_id uuid;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_validated := public.phase19_validate_notification_settings(p_preferences);

  SELECT id INTO v_team_member_id
  FROM public.team_members
  WHERE professional_id = v_professional_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  IF v_team_member_id IS NOT NULL THEN
    UPDATE public.team_members
    SET notifications = v_validated
    WHERE id = v_team_member_id;

    PERFORM public.log_audit_event(
      v_professional_id,
      'professional',
      'notification_settings.member_updated',
      'team_member',
      v_team_member_id,
      jsonb_build_object('notifications', v_validated)
    );
  ELSE
    -- Dono da clinica nao possui registro em team_members: as proprias
    -- preferencias sao os defaults da clinica.
    UPDATE public.professionals
    SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{notifications}', v_validated, true),
        updated_at = now()
    WHERE id = v_professional_id;

    PERFORM public.log_audit_event(
      v_professional_id,
      'professional',
      'notification_settings.clinic_updated',
      'professional',
      v_professional_id,
      jsonb_build_object('notifications', v_validated)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'preferences', v_validated);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_notification_preferences(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_notification_preferences(jsonb) TO authenticated;

-- 3. C19-04: horario de funcionamento.

CREATE OR REPLACE FUNCTION public.get_professional_schedule_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_role text;
  v_clinic_hours jsonb;
  v_team_member_id uuid;
  v_member_hours jsonb;
  v_my_hours jsonb;
  v_source text;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_role := public.auth_professional_role();

  SELECT COALESCE(settings->'business_hours', '{}'::jsonb)
  INTO v_clinic_hours
  FROM public.professionals
  WHERE id = v_professional_id;

  SELECT id, business_hours INTO v_team_member_id, v_member_hours
  FROM public.team_members
  WHERE professional_id = v_professional_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  IF v_team_member_id IS NOT NULL AND COALESCE(v_member_hours, '{}'::jsonb) <> '{}'::jsonb THEN
    v_my_hours := v_member_hours;
    v_source := 'individual';
  ELSE
    v_my_hours := v_clinic_hours;
    v_source := 'clinic';
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'clinicHours', v_clinic_hours,
    'myHours', v_my_hours,
    'myHoursSource', v_source,
    'teamMembers', (
      CASE WHEN v_role = 'gestor' THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', tm.id,
          'name', tm.name,
          'business_hours', tm.business_hours
        ) ORDER BY tm.name), '[]'::jsonb)
        FROM public.team_members tm
        WHERE tm.professional_id = v_professional_id
          AND tm.is_active = true
      ) ELSE '[]'::jsonb END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_schedule_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_schedule_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_professional_business_hours(p_business_hours jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_validated jsonb;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  v_validated := public.phase19_validate_business_hours(p_business_hours);

  IF v_validated = '{}'::jsonb THEN
    RAISE EXCEPTION 'business_hours_required';
  END IF;

  UPDATE public.professionals
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{business_hours}', v_validated, true),
      updated_at = now()
  WHERE id = v_professional_id;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'business_hours.clinic_updated',
    'professional',
    v_professional_id,
    jsonb_build_object('business_hours', v_validated)
  );

  RETURN jsonb_build_object('ok', true, 'business_hours', v_validated);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_professional_business_hours(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_professional_business_hours(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_team_member_business_hours(
  p_team_member_id uuid,
  p_business_hours jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_validated jsonb;
  v_member public.team_members%ROWTYPE;
BEGIN
  v_professional_id := public.auth_professional_id();
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.auth_professional_role() <> 'gestor' THEN
    RAISE EXCEPTION 'Unauthorized: gestor role required';
  END IF;

  v_validated := public.phase19_validate_business_hours(p_business_hours);

  UPDATE public.team_members
  SET business_hours = v_validated
  WHERE id = p_team_member_id
    AND professional_id = v_professional_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_member_not_found';
  END IF;

  PERFORM public.log_audit_event(
    v_professional_id,
    'professional',
    'business_hours.member_updated',
    'team_member',
    v_member.id,
    jsonb_build_object('business_hours', v_validated)
  );

  RETURN jsonb_build_object('ok', true, 'team_member_id', v_member.id, 'business_hours', v_validated);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_team_member_business_hours(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_team_member_business_hours(uuid, jsonb) TO authenticated;
