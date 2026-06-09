# Phase 11 Onboarding Status Log

Date: 2026-06-09

## Verdict

Phase 11 is implemented as a functional checkpoint, but it is not marked `done` end-to-end.

The correct status is `partial` until the remaining visual/mobile QA and dedicated client PWA first-entry flow are completed and verified.

## Implemented

- Auth handoff foundation preserving `auth.users.id = professionals.id = professionals.user_id`.
- `handle_new_user` hardened for canonical identity and pre-account protection.
- Public professional pre-account and `/criar-conta` handoff via backend-controlled Edge Function.
- Public `/entrar` and `/criar-conta` routes.
- Authenticated `/onboarding` essentials for minimum operational setup.
- Admin manual onboarding completion.
- Admin bootstrap without creating a professional tenant.
- Client public app project/domain setup.
- Carry-over language switcher for the authenticated professional app.

## Not Marked Done

- J1, J2, J10, J14, J33, J51 and J60 are marked `partial`, not `done`.
- The client PWA first-entry/onboarding journey still needs a dedicated completion path beyond the existing booking/anamnese coverage.
- Mobile visual QA at 390px still needs a final manual pass across `/entrar`, `/criar-conta`, `/onboarding`, admin and client public entry.

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

## Remaining Exit Criteria

Phase 11 can only be closed as `done` after:

- QA confirms no mobile issues at 390px.
- Client PWA first-entry/onboarding is completed or explicitly deferred with a PRD update.
- Journey frontmatter is updated again only with evidence from successful end-to-end validation.
