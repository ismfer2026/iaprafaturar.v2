# Invariantes Do Sistema

Invariantes vêm antes dos fluxos. Se uma implementação viola uma invariante, a implementação está errada, mesmo que compile.

## WhatsApp E IA

- Toda mensagem inbound válida deve ser registrada antes de classificação ou roteamento.
- Um webhook não deve disparar dois agentes concorrentes para a mesma mensagem.
- Um cliente não deve receber duas respostas da IA para a mesma mensagem.
- Nerissa nunca deve responder cliente de profissional como fallback.
- Mensagens de clientes/leads do profissional devem sair pela instância do profissional.
- Mensagens da plataforma, suporte e setup de profissional devem sair pela instância da Nerissa.

## Multi-Tenant

- Um profissional nunca deve ver dados de outra clínica/profissional.
- Um cliente nunca deve ser buscado globalmente para decidir contexto dentro da instância de um profissional.
- A instância WhatsApp do profissional define o contexto primário das mensagens recebidas nela.

## Fluxos Públicos

- Fluxo público pré-conta não pode exigir Auth.
- Fluxo público pré-conta não pode depender de créditos/billing.
- Cadastro de profissional e cadastro de cliente são fluxos diferentes e não podem ser misturados.
- Parâmetros públicos como `ref`, `lang`, slug, token e código devem sobreviver ao fluxo.

## Dados E Identidade

- `auth.users.id`, `professionals.id` e `professionals.user_id` precisam ter papéis explícitos.
- Telefone WhatsApp deve ser normalizado antes de persistir.
- Estado só deve mudar por transição válida documentada.

## Observabilidade

- Todo fluxo crítico deve ter logs estruturados consultáveis por identificadores reais, não por busca em JSON.
- Todo erro operacional deve ter status, causa e contexto mínimo.
- Toda decisão de silenciar IA deve ser registrada sem violar privacidade.
