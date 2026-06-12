# Mapa de Contratos Oficiais do Backend v2

Data: 2026-06-12

## Regra soberana

A v1 serve somente para identificar telas, comportamentos e jornadas desejadas. Functions, tabelas, RPCs, policies, filas, crons e nomes de contratos da v1 não são referência técnica e não devem ser consultados para desenhar ou implementar backend.

A única fonte de verdade contratual é o banco da v2:

- migrations e schema efetivamente aplicados na v2;
- tabelas, colunas, constraints, índices, triggers e enums da v2;
- RPCs e grants da v2;
- policies RLS e funções de tenancy da v2;
- storage e permissões definidos pela v2.

As Edge Functions consolidadas da v2 devem reutilizar e respeitar esses contratos. A existência de uma Function não autoriza criar schema paralelo.

## Regras de implementação

- Leitura simples isolada por RLS pode usar acesso direto.
- Escrita multi-tabela, financeira, administrativa, de billing, mensagem ou IA usa RPC/Edge Function aprovada.
- Nenhuma migration nasce de nome ou comportamento backend encontrado na v1.
- Antes de criar tabela, RPC, policy, trigger ou índice, buscar equivalente no DB v2.
- Se faltar contrato, registrar a lacuna no preflight e atualizar PRD-SCHEMA antes da implementação.
- Se houver contrato equivalente, ampliar ou reutilizar; não criar versão paralela.

## Contratos v2 já identificados

### Base, auth e onboarding

- Tabelas: `professionals`, `professional_whatsapp`, `nerissa_setup_sessions`, `nerissa_setup_items`, `professional_agents`.
- Regra de tenancy: `auth_professional_id()`.
- RPCs/contratos: `update_professional_onboarding_essentials` e contratos v2 de criação de conta profissional.

### CRM, agenda e serviços

- Tabelas: `clients`, `appointments`, `sessions`, `services`, `service_categories`.
- RPCs: `create_client_manual`, `move_client_stage`, `create_appointment`, `cancel_appointment`, `create_appointment_series`, `cancel_appointment_series`, `register_appointment_outcome`, `register_session`, `create_service`, `update_service`, `deactivate_service`.

### Conversas e agentes

- Tabelas: `conversations`, `message_events`, `shadow_suggestions`, `professional_agents`, `agent_executions`.
- RPCs/ações: `reject_shadow_suggestion`, `take_over_conversation`, `release_conversation`, `update_operational_rules`.
- Regra: configuração profissional não altera prompts globais/admin.

### Financeiro, PDV e conciliação

- Tabelas: `financial_transactions`, `finance_reconciliation_items`.
- RPCs: `create_financial_transaction`, `mark_transaction_paid`, `cancel_financial_transaction`, `approve_billing_collection`, `create_pos_sale`, `get_financial_summary`, `get_finance_settings`, `upsert_finance_settings`, `upsert_product`, `import_reconciliation_items`, `confirm_reconciliation_match`.
- Regra: matching nunca é confirmado automaticamente.

### Documentos, pacotes e anamnese

- Tabelas: `service_packages`, `client_packages`, `quotes`, `modelos`, `contracts`, `anamnese_templates`, `anamnese_fichas`.
- RPCs: `create_service_package`, `sell_client_package`, `use_client_package_session`, `create_quote`, `send_quote_dry_run`, `send_quote_for_approval`, `convert_approved_quote`, `create_modelo`, `create_contract_from_modelo`, `mark_contract_signed_manual`, `update_anamnese_template`, `review_anamnese_ficha`.
- Storage aprovado identificado: `anamnese-assets`.

### Funil e growth profissional

- Tabelas: `rfm_scores`, `client_health_scores`, `campaigns`, `referral_events`.
- RPCs: `get_funnel_board`, `create_funnel_opportunity`, `move_funnel_opportunity`, `close_funnel_opportunity`, `log_funnel_activity`, `get_growth_commercial_dashboard`, `calculate_rfm_for_professional`, `calculate_client_health_for_professional`, `create_campaign`, `run_segmented_campaign`, `queue_email_to_client`, `upsert_public_chat_config`, `redeem_loyalty_reward`.
- Regra: campanhas profissionais e broadcast admin são domínios separados.

### Billing e admin

- RPCs admin identificadas: `is_master_admin`, `get_admin_dashboard_rpc`, `get_admin_professionals_rpc`, `admin_complete_professional_onboarding`, `get_admin_phase17_dashboard`, `admin_grant_free_internal`, `admin_add_ai_credits`, `admin_review_ambassador_request`, `admin_register_agent_prompt_version`, `admin_update_feature_request_status`, `nexus_create_action_proposal`, `nexus_confirm_action`, `nexus_execute_confirmed_action`.
- RPCs profissionais de billing: `get_platform_plans`, `get_my_subscription_state`.
- Regra: ações sensíveis admin exigem contrato auditável; nunca CRUD direto improvisado.

### Client e fluxos públicos

- O app client usa somente handlers públicos v2 aprovados por token/slug.
- É proibido acesso direto amplo às tabelas.
- Toda resposta pública deve ser mínima, validada em runtime e testada contra vazamento.

## Lacunas que exigem prova no DB v2

Estas capacidades não podem gerar implementação antes de confirmar contratos no banco/migrations da v2:

1. estoque além de produtos/PDV: saldos, movimentações, vencimentos, reservas e manutenção;
2. NFSe/fiscal;
3. configurações globais sensíveis da plataforma;
4. CRUD/calculadora de planos;
5. histórico/canais completos de broadcast admin;
6. contrato profissional de `/parceiros`;
7. destino de personas/RLHF;
8. métricas detalhadas de `/analytics`;
9. leads comerciais da plataforma/Nerissa.

## Checklist contratual obrigatório

Antes de implementar qualquer tarefa:

1. identificar app, ator, domínio e rota canônica;
2. localizar evidência no banco/migrations da v2;
3. declarar tabelas, colunas, RPCs, grants, RLS, storage e triggers utilizados;
4. conferir migrations e contratos equivalentes para impedir duplicação;
5. validar isolamento, IDOR, auditoria e idempotência;
6. registrar qualquer lacuna no `PHASE-PREFLIGHT-CONTRACT.md`;
7. atualizar PRD-SCHEMA antes de criar contrato novo;
8. nunca usar backend da v1 como justificativa técnica.
