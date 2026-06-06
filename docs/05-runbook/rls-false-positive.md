# Runbook — RLS Bloqueou Usuário Legítimo

## Sintoma

Profissional autenticado não consegue acessar seus próprios dados. O frontend mostra erro, lista vazia ou "Você não tem permissão". O Supabase retorna `[]` ou erro de `RLS policy` em queries legítimas. O usuário tem conta ativa e deveria ter acesso.

## Impacto

- Profissional bloqueado do próprio CRM = perda de produtividade imediata
- Pode afetar agendamentos em andamento, atendimentos do dia

## Primeiras Perguntas

1. O erro começou após alguma atualização de migration ou mudança de plano?
2. O usuário consegue fazer login normalmente (token gerado)?
3. O `professionalId` retornado pelo AuthContext no frontend é o mesmo do banco? (`professionalId` = `professionals.id`, não `authUserId`)
4. O erro é em TODAS as tabelas ou apenas em uma?
5. Outro profissional com conta similar está com o mesmo problema?

## Vocabulário de Identidade (referência rápida)

| Nome canônico | O que é | SQL | TypeScript |
|---|---|---|---|
| `professionalId` | `professionals.id` — identidade da clínica | `auth_professional_id()` | `professionalId` do AuthContext |
| `authUserId` | `auth.users.id` — identidade de autenticação | `auth.uid()` | `authUserId` do AuthContext |

Jamais usar `user.id` de forma ambígua neste contexto — sempre identificar qual dos dois.

## Diagnóstico — Passo a Passo

### Passo 1: Verificar se o usuário existe como professional

```sql
-- Executar como service_role no Supabase Dashboard
-- authUserId = auth.uid() do usuário que está bloqueado
-- professionalId = professionals.id (o que o AuthContext deve retornar)
SELECT p.id as professionalId, p.user_id as authUserId, p.full_name, p.plan_type
FROM professionals p
WHERE p.user_id = '<authUserId do usuário>'   -- auth.uid()
   OR p.id     = '<professionalId do app>';   -- professionals.id
```

Se não retornar nada: o usuário não tem registro em `professionals`. Possível criação incompleta.

### Passo 2: Verificar a função `auth_professional_id()`

```sql
-- Simular como se fosse o usuário afetado (requer acesso ao Supabase Dashboard)
SELECT auth_professional_id();
-- Deve retornar professionals.id (= professionalId)
-- Se retornar NULL: a função não está resolvendo o profissional pelo JWT
-- Causa mais comum: professionals.user_id não bate com o auth.uid() atual
```

### Passo 3: Verificar a política RLS da tabela afetada

```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE tablename = '<tabela_afetada>';
-- Verificar se usa: professional_id = auth_professional_id()
-- Se usar: auth.uid() IS NOT NULL → PROBLEMA (permite acesso cruzado)
```

### Passo 4: Testar a query manualmente

```sql
-- No Supabase SQL Editor, logado como service_role:
SELECT *
FROM <tabela_afetada>
WHERE professional_id = '<professional_id>';
-- Se retornar dados, o problema é na RLS, não nos dados
```

## Interpretação

- **`auth_professional_id()` retorna NULL:** A função busca em `professionals` pelo `auth.uid()` (= `authUserId`). Se `professionals.user_id` não bate com o `authUserId` do JWT atual, retorna NULL → tudo bloqueado.
  - Causa comum: migration alterou a coluna `user_id` ou o usuário foi recriado no Supabase Auth com novo `authUserId`.

- **Política usa `auth.uid() IS NOT NULL` em vez de `auth_professional_id()`:** Usuário tem acesso a TODOS os dados de todas as clínicas. Não causa bloqueio, mas é vulnerabilidade crítica — deve ser corrigida imediatamente.

- **Tabela nova sem política RLS:** Supabase bloqueia por padrão se RLS está habilitado sem nenhuma política. Criar a política correta.

## Correção Imediata

Se `professionals.user_id` (= coluna que guarda o `authUserId`) está desatualizado:
```sql
-- Atualizar o authUserId para o auth.uid() correto (executar como service_role)
-- authUserId = o novo UUID de auth.users para este profissional
UPDATE professionals
SET user_id = '<novo_authUserId>'   -- auth.uid() atual do usuário
WHERE id    = '<professionalId>';   -- professionals.id
```

Se a política está faltando na tabela nova:
```sql
ALTER TABLE <tabela_nova> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabela>_professional_isolation" ON <tabela_nova>
  FOR ALL
  USING (professional_id = auth_professional_id());
```

## Correção Definitiva

- Toda nova migration que cria tabela deve incluir RLS + política `auth_professional_id()` no mesmo arquivo.
- squad-schema-guard deve validar que toda nova tabela com `professional_id` tem RLS ativo.
- Teste de isolamento (professionalB não vê dados de professionalA) é DoD obrigatório de toda fase.

## Prevenção

```sql
-- Query de auditoria: tabelas com professional_id mas sem RLS ou com política errada
SELECT c.table_name
FROM information_schema.columns c
LEFT JOIN pg_class pc ON pc.relname = c.table_name
WHERE c.column_name = 'professional_id'
  AND c.table_schema = 'public'
  AND pc.relrowsecurity = false;  -- RLS desabilitado = problema
```
