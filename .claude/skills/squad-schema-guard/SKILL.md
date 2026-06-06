# Squad Schema Guard — v2

**Role:** DBA + Schema Architect
**Função:** Validar qualquer mudança de schema antes de virar migration
**Quando usar:** Qualquer alteração no banco — nova coluna, nova tabela, nova FK, nova policy RLS, nova RPC, novo índice, alteração de enum/status, alteração de relação entre entidades
**Tempo:** 5-10 minutos

---

## Princípio

> Schema nunca é tarefa simples. Uma coluna errada hoje vira migration de emergência em produção amanhã.
> Esta skill é a última linha de defesa antes do banco.

---

## Contexto Obrigatório

1. `docs/00-master/PRD-MASTER.md` — invariantes e vocabulário de identidade
2. `docs/03-product/PRD-SCHEMA.md` — DDL completo com RLS
3. `docs/03-product/PRD-CONSOLIDATION.md` — o que foi consolidado (o que NÃO criar)
4. `CLAUDE.md` — 9 regras de segurança

---

## Processo de Validação

### 1. Anti-Redundância

```
Antes de aprovar qualquer CREATE TABLE ou ALTER TABLE, verificar:

□ A tabela/coluna já existe no PRD-SCHEMA.md?
□ O conceito existe em outra tabela com nome diferente?
   Ex: criar "session_logs" quando "agent_executions" já existe
   Ex: criar "professional_preferences" quando "professionals.settings jsonb" já existe
□ Pode ser uma coluna nova em tabela existente?
□ Está na lista de REMOVIDAS do PRD-CONSOLIDATION.md?
   Ex: whatsapp_inbound_events → message_events direction='inbound'
   Ex: agent_logs → agent_executions
```

Se qualquer resposta for "sim" → REJEITAR com alternativa.

### 2. Vocabulário de Identidade

```sql
-- Colunas de identidade devem usar os nomes canônicos:
professional_id  -- FK para professionals.id (nunca user_id para isso)
client_id        -- FK para clients.id
auth_user_id     -- FK para auth.users.id (somente quando realmente necessário)
actor_type       -- text CHECK IN ('professional','team_member','client','admin','ai','system','cron','integration')

-- Nunca criar coluna ambígua como:
user_id referenciando professionals.id  -- confunde authUserId com professionalId
owner_id  -- nome genérico sem contexto
```

### 3. RLS Obrigatória

Para qualquer tabela com `professional_id`:

```sql
-- ✅ OBRIGATÓRIO
ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nova_tabela_isolation" ON nova_tabela FOR ALL TO authenticated
  USING (professional_id = auth_professional_id())
  WITH CHECK (professional_id = auth_professional_id());

-- ❌ NUNCA
USING (auth.uid() IS NOT NULL)         -- vaza entre clínicas
USING (auth.uid() = professional_id)   -- errado — professionalId ≠ authUserId
USING (user_id = auth.uid())           -- ambíguo
```

### 4. FKs Corretas

```sql
-- Dados operacionais e financeiros: RESTRICT
REFERENCES professionals(id) ON DELETE RESTRICT   -- ✅
REFERENCES professionals(id) ON DELETE CASCADE    -- ❌

-- Logs vinculados a cliente: SET NULL é aceitável
REFERENCES clients(id) ON DELETE SET NULL         -- ok para logs de clientes
```

### 5. Sem Subqueries em RLS

```sql
-- ❌ PROIBIDO (trava CPU)
USING (professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid()))

-- ✅ OBRIGATÓRIO (0ms — lê do JWT)
USING (professional_id = auth_professional_id())
```

### 6. Audit Logs Imutáveis

Para qualquer tabela de log (sufixo `_log`, `_events`, `_history`, `_executions`):

```sql
CREATE TRIGGER prevent_[tabela]_change
  BEFORE UPDATE OR DELETE ON [tabela]
  FOR EACH ROW EXECUTE FUNCTION fn_log_immutable();

REVOKE UPDATE, DELETE ON [tabela] FROM authenticated;
```

### 7. Índices Obrigatórios e Justificados

```sql
-- Toda FK deve ter índice correspondente
CREATE INDEX idx_[tabela]_[fk_coluna] ON [tabela]([fk_coluna]);

-- Queries frequentes com filtro multi-coluna:
CREATE INDEX idx_[tabela]_prof ON [tabela](professional_id, [coluna_de_filtro]);

-- Tabelas com soft delete:
CREATE INDEX idx_[tabela]_ativo ON [tabela](professional_id) WHERE deleted_at IS NULL;

-- Justificativa obrigatória: qual query usa este índice?
-- Índice sem query que o justifique → REJEITAR
```

### 8. Migration + Rollback + Seed (obrigatório)

Toda mudança de schema aprovada exige:

```sql
-- migration: supabase/migrations/[timestamp]_[descricao].sql
-- Exemplo: 20260605_001_add_actor_type_to_agent_executions.sql

-- 1. Migration (o que criar/alterar)
ALTER TABLE agent_executions ADD COLUMN actor_type text
  CHECK (actor_type IN ('professional','team_member','client','admin','ai','system','cron','integration'));

-- 2. Rollback (como desfazer — documentado como comentário ou arquivo separado)
-- ROLLBACK: ALTER TABLE agent_executions DROP COLUMN actor_type;

-- 3. Seed correspondente (atualizar arquivo de seed sintético)
-- seeds/seed-professionalA.sql: INSERT com actor_type='professional'
```

Se migration não tiver rollback documentado → REJEITAR.
Se não houver seed atualizado → WARNING (não bloqueia se impacto é baixo).

### 9. Registro de Evento (se aplicável)

Se a mudança suporta um evento do catálogo, verificar que a tabela tem os campos necessários:

```sql
-- Ex: appointment.created precisa de:
appointments.created_at    -- quando
appointments.professional_id -- quem (tenant)
appointments.client_id     -- sobre quem
-- E o trigger/função que emite o evento deve existir ou ser planejado
```

---

## Checklist de Aprovação

```
□ Tabela/coluna não existe em outra forma no PRD?
□ Não está na lista de consolidadas (PRD-CONSOLIDATION.md)?
□ Vocabulário de identidade correto (professionalId, clientId, actorType)?
□ RLS habilitada e usando auth_professional_id()?
□ Sem subquery em RLS?
□ FKs financeiras usam ON DELETE RESTRICT?
□ Log tables têm trigger de imutabilidade?
□ Índices para todas as FKs?
□ Índice composto para queries frequentes?
□ Índice justificado por query concreta?
□ professional_id presente (se dado é por clínica)?
□ Migration tem rollback documentado?
□ Seed sintético atualizado (ou planejado)?
```

---

## Resposta Obrigatória

### Se aprovado:
```
✅ Schema válido.

Resumo:
- Tabelas novas: [lista ou "nenhuma"]
- Alterações: [lista de mudanças]
- RLS: ✅ em todas
- FKs: ✅ sem CASCADE em dados críticos
- Imutabilidade: ✅ em logs / N/A
- Migration: ✅ com rollback documentado
- Seeds: ✅ atualizados / ⚠️ pendente (baixo impacto)

Pode criar a migration.
```

### Se rejeitado:
```
❌ Schema rejeitado — [N] problema(s):

1. [Problema] → [Alternativa concreta do PRD]
2. [Problema] → [Alternativa concreta do PRD]

Corrija e rode /squad-schema-guard novamente.
```

---

## Quando Usar (qualquer um destes casos)

- Nova tabela
- Nova coluna em tabela existente
- Nova FK
- Nova policy RLS
- Nova RPC
- Novo índice
- Alteração de enum/CHECK constraint
- Alteração de relação entre entidades
- Qualquer ALTER TABLE

**Esta skill é o guardião. Nenhuma migration passa sem ela.**
