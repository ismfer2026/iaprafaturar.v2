# 17a Collision Map

## Sem Colisao Local

Buscas em `supabase/migrations` nao encontraram os objetos novos com nomes `platform_*`, `ai_credit_*`, `nexus_*`, `agent_registry`, `agent_prompt_versions` ou `feature_requests`.

## Divergencias Tratadas

- Inventarios v1 citam `plans`, `billing_products`, `credit_wallets` e `affiliate_partners`; a v2 usara prefixos `platform_*` e `ai_credit_*` para evitar colisao semantica com legado.
- `admin-ai-gateway` existe no repo, apesar de o plano inicial tratar como ausente. A Fase 17 deve estender a function existente.
- `professionals.plan_type` nao aceitava `free_internal`; a migration 17 amplia o `CHECK`.
- J49 nao ganha nova tabela; usa `professional_platform_health_scores`.
