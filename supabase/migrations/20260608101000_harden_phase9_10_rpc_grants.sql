-- ============================================================
-- Hardening - explicit RPC grants for Phase 9 and Phase 10
-- Fixes residual PUBLIC/anon EXECUTE privileges created by default grants.
-- ============================================================

REVOKE ALL ON FUNCTION public.get_professional_reports_rpc(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_reports_rpc(date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.is_master_admin()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin()
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_rpc()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_rpc()
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_professionals_rpc(integer, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_professionals_rpc(integer, uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_platform_metrics_daily(date, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_platform_metrics_daily(date, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.calculate_platform_health_scores_batch(integer, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_platform_health_scores_batch(integer, uuid, boolean, uuid)
  TO service_role;

-- Verification:
-- SELECT routine_name, grantee
-- FROM information_schema.role_routine_grants
-- WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'get_professional_reports_rpc',
--     'is_master_admin',
--     'get_admin_dashboard_rpc',
--     'get_admin_professionals_rpc',
--     'refresh_platform_metrics_daily',
--     'calculate_platform_health_scores_batch'
--   )
-- ORDER BY routine_name, grantee;
