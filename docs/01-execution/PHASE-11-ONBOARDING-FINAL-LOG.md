# Phase 11 Onboarding Final Log

Date: 2026-06-09

## Correction: authenticated professional language switcher

Problem observed:
- The public flows and client PWA already supported `lang`/locale switching, but the authenticated professional app did not expose a visible language switcher.
- This left the main app dependent on the stored/browser locale without a user-facing control.

Technical cause:
- `apps/professional` already had `I18nProvider`, `useI18n()`, `setLocale()` and `localStorage` persistence through `iap_locale`.
- The missing piece was UI access inside the authenticated shell.

Files changed:
- `apps/professional/src/components/layout/LanguageSwitcher.tsx`
- `apps/professional/src/components/layout/AppShell.tsx`
- `apps/professional/src/pages/MorePage.tsx`
- `apps/professional/src/i18n/index.tsx`

Implementation:
- Added a reusable PT/EN/ES switcher.
- Added the switcher to the desktop sidebar.
- Added the switcher to `/mais` for mobile discovery.
- Added `language.label` in `pt-BR`, `en-US` and `es-419`.
- No public route, public parameter, Edge Function mode, Auth handoff or billing behavior was changed.

Tests executed:
- `npm run typecheck --workspace=@iaprafaturar/professional`
- `npm run build --workspace=@iaprafaturar/professional`

Deploy:
- Professional app deployed to Vercel production.
- Production alias updated: `https://app.iaprafaturar.com.br`.

Status:
- Phase 11 carry-over for authenticated app language switching is implemented, validated by typecheck/build and deployed.
