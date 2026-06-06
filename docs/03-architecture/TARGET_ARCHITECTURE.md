# Arquitetura Alvo

## 1. Visão Geral

A arquitetura alvo deve ser orientada por eventos, contratos e isolamento por contexto.

Toda mensagem entra, é registrada, classificada e roteada antes de qualquer ação.

## 2. Camadas

### Camada 0: Domain

`packages/domain` contém regras de negócio puras.

Não pode depender de:

- React;
- Supabase;
- Edge Functions;
- browser APIs;
- serviços externos.

Tudo que for regra de negócio testável deve nascer ou migrar para esta camada.

### Camada 1: Entrada

Responsável por receber eventos externos.

- `webhook-admin`: instância da Nerissa.
- `webhook-whatsapp`: instâncias dos profissionais.
- webhooks de billing.
- formulários públicos.

Responsabilidade:

- validar payload;
- extrair dados;
- registrar entrada;
- nunca executar lógica complexa de negócio.

### Camada 2: Classificação

Responsável por decidir o tipo de mensagem.

Entradas:

- texto;
- telefone;
- instância;
- profissional identificado;
- contexto ativo;
- histórico recente permitido.

Saídas:

- `platform_setup`;
- `platform_support`;
- `platform_sales`;
- `client_business`;
- `appointment_confirmation`;
- `private_ignore`;
- `unknown_process`;
- `human_review`.

### Camada 3: Roteamento

Responsável por escolher o agente/fila.

Exemplos:

- `nerissa-setup-agent`;
- `support-agent`;
- `sales-agent`;
- `message-processor`;
- `orchestrator-agent`;
- agentes de agenda;
- agentes de relacionamento;
- agentes de campanha.

### Camada 4: Execução

O agente executa a ação:

- responder;
- atualizar cadastro;
- criar lead;
- criar cliente;
- criar/remarcar/cancelar agenda;
- registrar contexto;
- silenciar.

### Camada 5: Saída

Responsável por enviar mensagem pela instância correta.

Regras:

- plataforma usa instância da Nerissa;
- profissional usa instância do profissional;
- sem fallback admin para cliente de profissional.

### Camada 6: Observabilidade

Toda etapa deve registrar:

- entrada;
- classificação;
- rota;
- agente;
- resposta;
- envio;
- erro.

Observabilidade é infraestrutura base, não etapa final. Nenhum fluxo novo deve existir sem log estruturado e consulta de validação.

## 3. Contratos Principais

### Inbound WhatsApp

Campos mínimos:

- `source_webhook`;
- `instance_name`;
- `phone`;
- `professional_id`;
- `message_preview`;
- `route`;
- `agent_slug`;
- `status`.

### Agentes

Todo agente deve retornar formato previsível:

```json
{
  "status": "ok | error | skipped",
  "reply": "texto opcional",
  "reason": "motivo opcional",
  "metadata": {}
}
```

## 4. Privacidade

Classificação privada deve registrar decisão, mas não salvar conteúdo completo além do mínimo necessário para auditoria.

## 5. Multi-Tenant

Toda query operacional de clientes, leads e agenda deve ser restrita por `professional_id` ou instância resolvida.

## 6. Monorepo

Estrutura alvo:

```txt
apps/
  professional/
  admin/
packages/
  domain/
  shared/
  ui/
supabase/
docs/
contracts/
```

O monorepo deve ser orquestrado por Turborepo conforme `../decisions/ADR-0001-monorepo-turborepo.md`.
