-- ============================================================
-- Hardening - internal admin helper grants
-- These helpers are called by SECURITY DEFINER RPCs and should not be
-- directly executable by PUBLIC, anon, or authenticated.
-- ============================================================

REVOKE ALL ON FUNCTION public.admin_is_master()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_assert_master()
  FROM PUBLIC, anon, authenticated;

-- Verification:
-- SELECT routine_name, grantee
-- FROM information_schema.role_routine_grants
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('admin_is_master', 'admin_assert_master')
-- ORDER BY routine_name, grantee;
