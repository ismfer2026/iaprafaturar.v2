# Regras Invioláveis

## 1. Isolamento Por Instância

Mensagens recebidas na instância de um profissional pertencem ao contexto daquele profissional.

O sistema não deve procurar globalmente se aquele telefone é cliente ou profissional em outro lugar para decidir o atendimento naquele contexto.

## 2. Nerissa Não Substitui Profissional

A Nerissa é a IA da plataforma.

Ela pode falar com:

- profissionais;
- leads da plataforma;
- afiliados;
- usuários em setup;
- usuários em risco de churn da plataforma.

Ela não deve falar com clientes de profissionais como fallback da instância do profissional.

## 3. Instância Do Profissional Para Clientes

Mensagens para clientes, leads, pacientes, indicados ou contatos comerciais do profissional devem sair pela instância WhatsApp do próprio profissional.

Se o profissional não tiver instância conectada, a automação não deve enviar como se fosse ele. A Nerissa pode avisar o profissional sobre a falta de conexão.

## 4. Toda Mensagem Inbound Deve Ser Registrada

Antes de classificar ou rotear, toda mensagem válida recebida por webhook deve ser registrada em log estruturado.

O log deve permitir consultar por:

- telefone;
- instância;
- profissional;
- webhook de origem;
- rota;
- agente;
- status;
- data.

Não usar busca operacional em JSON grande como fonte primária de diagnóstico.

## 5. Classificação Antes Da Ação

A IA deve ler a mensagem e, quando existir, o histórico/contexto ativo antes de decidir se deve responder, silenciar ou encaminhar.

## 6. Privacidade

Conversas estritamente privadas do profissional não devem ser processadas como atendimento do CRM.

Se houver contexto ativo iniciado pela IA, a resposta deve considerar esse contexto antes de silenciar.

## 7. Cadastro De Profissional Não É Cadastro De Cliente

Onboarding, convite e criação de conta de profissional/clinica são fluxos diferentes do cadastro de cliente dentro do CRM do profissional.

Esses fluxos não podem compartilhar assumptions de auth, billing ou `professional_id`.

## 8. Fluxos Públicos São Contratos

Rotas públicas, parâmetros públicos e respostas esperadas pelo frontend são contratos de produto.

Não alterar sem mapear:

- rota inicial;
- parâmetros;
- estado do usuário;
- payload;
- resposta;
- auth;
- billing/créditos;
- próximo passo.

## 9. Evolution Go É O Único Transporte WhatsApp

Não reintroduzir Evolution API legada.

Variáveis, comentários e funções devem apontar para Evolution Go.

## 10. Correções Estruturais Exigem Plano

Antes de alterar webhooks, agentes, onboarding, billing, Auth ou dados sensíveis:

1. mapear;
2. planejar;
3. identificar risco;
4. executar correção mínima;
5. validar;
6. registrar.
