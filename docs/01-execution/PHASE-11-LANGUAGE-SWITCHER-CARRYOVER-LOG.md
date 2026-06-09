# Phase 11 Carry-over: Authenticated Language Switcher

Date: 2026-06-09

## Scope

This is a carry-over correction for the authenticated professional app. It is not the Phase 11 closure log.

## Problem Observed

- Public flows and the client PWA already exposed locale switching.
- The authenticated professional app had `I18nProvider`, `useI18n()`, `setLocale()` and `iap_locale` persistence, but no visible language control.

## Technical Cause

The language state existed, but the authenticated shell did not expose it to the user.

## Files Changed

- `apps/professional/src/components/layout/LanguageSwitcher.tsx`
- `apps/professional/src/components/layout/AppShell.tsx`
- `apps/professional/src/pages/MorePage.tsx`
- `apps/professional/src/i18n/index.tsx`

## Implementation

- Added a reusable PT/EN/ES switcher.
- Added compact switcher to the desktop sidebar.
- Added full switcher to `/mais` for mobile discovery.
- Added `language.label` in `pt-BR`, `en-US` and `es-419`.
- Did not change public routes, public params, Edge Function modes, Auth handoff, billing or credits.

## Tests Executed

- `npm run typecheck --workspace=@iaprafaturar/professional`
- `npm run build --workspace=@iaprafaturar/professional`

## Deploy

- Committed and pushed through GitHub.
- Professional production deployment was created by Vercel from GitHub.
- Production alias: `https://app.iaprafaturar.com.br`.

## Status

Done for this carry-over only.
