# Mapa Da Arquitetura Atual

> **Documento histórico — inventário da v1.**
> Descreve o estado da arquitetura em produção antes da v2.
> Tabelas como `whatsapp_inbound_events` citadas aqui foram consolidadas em `message_events` na v2.
> **Não usar como contrato de implementação.** Schema autoritativo: `docs/03-product/PRD-SCHEMA.md`.

## 1. Frontends

### CRM

Aplicação usada pelos profissionais para:

- clientes;
- agenda;
- serviços;
- produtos;
- financeiro;
- campanhas;
- WhatsApp;
- agentes de IA;
- configurações.

### Admin

Aplicação separada usada pela plataforma para:

- profissionais;
- planos;
- campanhas;
- notificações;
- agentes de sistema;
- métricas;
- configurações globais.

## 2. Supabase

### Auth

Responsável por autenticação de usuários.

Ponto crítico: diferenciar claramente:

- `auth.users.id`;
- `professionals.id`;
- `professionals.user_id`.

### Database

Tabelas críticas:

- `professionals`;
- `clients`;
- `appointments`;
- `agent_logs`;
- `conversation_contexts`;
- `nerissa_setup_sessions`;
- `nerissa_setup_events`;
- `sales_leads`;
- `webhook_events`;
- `whatsapp_inbound_events`.

## 3. WhatsApp

### Nerissa / Plataforma

Entrada: `webhook-admin`.

Rotas atuais:

- admin/Ismael -> `admin-ai-gateway`;
- lead plataforma -> `sales-agent`;
- profissional com setup ativo/incompleto -> `nerissa-setup-agent`;
- profissional pedindo suporte -> `support-agent`.

### Instâncias Dos Profissionais

Entrada: `webhook-whatsapp`.

Fluxo geral:

1. recebe webhook Evolution Go;
2. extrai telefone/texto/instância;
3. resolve contexto por instância;
4. roteia onboarding/setup ou empilha para `message-processor`;
5. `message-processor` classifica e chama orquestrador/agentes.

## 4. Gargalos Identificados

- Parser de payload WhatsApp precisava reconhecer o formato real `data.Info.Chat`.
- Logs antigos em `webhook_events` eram úteis para erros, mas ruins para diagnóstico operacional por telefone.
- Falta de matriz completa de roteamento por tipo de mensagem.
- Falta de contrato formal para quando a IA deve silenciar.
- Algumas funções têm histórico de fallback perigoso para instância admin/default.

## 5. Estado Atual Da Observabilidade

Foi criada a tabela `whatsapp_inbound_events` para diagnóstico estruturado.

Ainda falta padronizar todos os agentes para registrar:

- decisão de classificação;
- resposta gerada;
- tentativa de envio;
- resultado do envio.
