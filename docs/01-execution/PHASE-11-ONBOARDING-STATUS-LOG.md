# Phase 11 Onboarding Status Log

Date: 2026-06-09

## Verdict

Phase 11 is closed for its scoped implementation and QA checkpoint.

This does not mean every related product journey is `done`. J1, J2, J10, J14, J33, J51 and J60 remain `partial` at journey level because their full product-flow definitions include later capabilities outside the Phase 11 scope.

## Implemented

- Auth handoff foundation preserving `auth.users.id = professionals.id = professionals.user_id`.
- `handle_new_user` hardened for canonical identity and pre-account protection.
- Public professional pre-account and `/criar-conta` handoff via backend-controlled Edge Function.
- Public `/entrar` and `/criar-conta` routes.
- Authenticated `/onboarding` essentials for minimum operational setup.
- Admin manual onboarding completion.
- Admin bootstrap without creating a professional tenant.
- Client public app project/domain setup.
- Dedicated client PWA first-entry/onboarding route `/cliente/:slug`.
- Carry-over language switcher for the authenticated professional app.

## Not Marked Done

- J1, J2, J10, J14, J33, J51 and J60 are marked `partial`, not `done`.
- J1 remains partial because the full journey includes Nerissa completing setup asynchronously through WhatsApp and creating a live CRM context.
- J60 remains partial because the full product flow includes authenticated/magic-link client home, install prompt and push notifications, which are part of the broader client PWA roadmap.

## Product Flow Status Updates

- `01-onboarding-profissional.md`: J1 `partial`, `phase_11: partial`.
- `02-captacao-de-lead.md`: J2 `partial`, `phase_11: partial`.
- `10-gestao-equipe.md`: J10 `partial`, `phase_11: partial`.
- `14-especialidades-layout.md`: J14 `partial`, `phase_11: partial`; future `phase_12` remains pending.
- `33-38-admin-ismael.md`: J33 `partial`; J34-J38 remain pending.
- `51-53-admin-misc.md`: J51 `partial`; J52-J53 remain pending.
- `58-59-60-crm-misc.md`: J60 `partial`; J58-J59 remain pending.

## Guardrails Confirmed

- No journey was marked `done`.
- Public route params and protected public-flow contracts were not changed by this documentation cleanup.
- The carry-over language switcher log is separated from the Phase 11 status log to avoid implying closure.
- Phase 11 can be closed without marking any journey as `done`; journey completion remains stricter than phase scope.

## QA Executed

- `npm run typecheck --workspace=@iaprafaturar/professional`
- `npm run typecheck --workspace=@iaprafaturar/client`
- `npm run typecheck --workspace=@iaprafaturar/admin`
- `npm run build --workspace=@iaprafaturar/professional`
- `npm run build --workspace=@iaprafaturar/client`
- `npm run build --workspace=@iaprafaturar/admin`
- `npx supabase db lint --linked --schema public --fail-on error`
- Smoke `public-booking-handler/get_context`: 200, `ok=true`.
- Smoke `public-booking-handler/complete_client_onboarding`: 200, `ok=true`, `next_step=booking`.
- Smoke `public-create-account/get_status`: 200, registered principal account returned canonical professional id.
- Static mobile/layout audit of `/entrar`, `/criar-conta`, `/onboarding`, admin shell and `/cliente/:slug`: layouts use single-column mobile grids, bounded widths and no intentional horizontal overflow.

## Residual Roadmap Items

These are not Phase 11 blockers, but keep related journeys partial:

- J1: Nerissa-driven WhatsApp setup that creates/updates services, products and first real client over time.
- J60: full client PWA home, magic-link return flow, install prompt, push permission and second-entry skip behavior.
- J2/J33: full lead pipeline/Kanban and follow-up lifecycle.
- J10/J14/J51: expanded team, specialty layout and admin operating workflows.
