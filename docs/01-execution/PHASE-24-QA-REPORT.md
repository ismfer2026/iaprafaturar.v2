# FASE 24 — Relatório de QA

**Data:** 2026-06-14  
**Status:** aprovado para revisão funcional autenticada

## Build e Banco

- `npm run typecheck --workspace @iaprafaturar/admin`: passou;
- `npm run lint --workspace @iaprafaturar/admin`: passou;
- `npm run build --workspace @iaprafaturar/admin`: passou;
- `git diff --check`: passou;
- `supabase db lint --linked --level error`: passou sem erros;
- migrations `20260614110000` e `20260614111000`: local e remoto alinhados;
- migration `20260614112000`: aplicada para fechar o C24-05;
- Edge Functions `admin-broadcast` e `admin-broadcast-worker`: publicadas no projeto vinculado.
- ambas as funções aparecem `ACTIVE` no remoto;
- `admin-broadcast` sem autenticação retorna `401`;
- `admin-broadcast-worker` sem token interno retorna `401`;
- secrets `QSTASH_TOKEN`, `FUNCTIONS_BASE_URL`, `INTERNAL_FUNCTION_TOKEN` e `ADMIN_WHATSAPP_INSTANCE_NAME` confirmados no remoto.

## Contratos e Segurança

- tabelas novas sem grants diretos para `authenticated`;
- RPCs `phase24_*` usam `admin_assert_master()`, `SECURITY DEFINER`, `SET search_path = ''`, revoke e grant específico;
- broadcast admin não usa campanhas profissionais;
- `/leads` não consulta `funnel_opportunities`;
- `/embaixadores` não depende mais de `get_admin_phase17_dashboard`;
- confirmação PIX rejeita pagamento já pago e exige referência/motivo;
- broadcast persiste audiência, destinatários, estados, falhas parciais e auditoria;
- orquestrador não percorre destinatários e retorna após publicar o job;
- worker usa claim atômico com `SKIP LOCKED`, lotes de até 10 e intervalo de 350 ms;
- falhas usam retry com backoff exponencial e estado terminal `dead_letter`;
- locks em processamento por mais de cinco minutos podem ser retomados;
- `idempotency_key` única permite replay seguro sem criar novo broadcast;
- telemetria de publicação/consumo usa `qstash_job_log`;
- WhatsApp é o único canal habilitado; entrega/leitura não são simuladas.

## Frontend

- `/broadcast`, `/embaixadores` e `/leads` responderam HTTP 200 no servidor local;
- aliases existentes continuam redirecionando para rotas canônicas;
- loading/error/empty e bloqueio de double-submit foram implementados;
- chaves novas existem em pt-BR, en-US e es-419;
- rotas usam layouts responsivos sem tabela como estrutura principal.

## Pendências Externas

- QA manual autenticado em dispositivo físico de 390px;
- envio WhatsApp real para audiência controlada;
- eventos de entrega/leitura permanecem indisponíveis até existir contrato confiável do provedor;
- aviso Vite do chunk principal acima de 500 kB permanece para a Fase 26.
