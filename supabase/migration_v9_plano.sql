-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v9: Plano 90 dias (alinhamento trimestral)
-- Rodar no SQL Editor do Supabase. Só ADICIONA: o front atual continua funcionando.
-- ════════════════════════════════════════════════════════
--
-- O que muda:
--   cmd_plans        um alinhamento por trimestre (quem passou, período, doc original)
--   cmd_plan_goals   seções do doc: Metas atrasadas, Meta 01..03, Gaps
--   cmd_plan_items   entregáveis de cada seção (prazo, status, done_at por trigger)
--   cmd_tasks        plan_item_id: a tarefa pertence a um entregável (independe de origin_id)
-- ════════════════════════════════════════════════════════

BEGIN;

-- ───── 1. cmd_plans ─────
CREATE TABLE IF NOT EXISTS cmd_plans (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  assigned_by  TEXT        NOT NULL DEFAULT '',
  role         TEXT        NOT NULL DEFAULT '',
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  source_url   TEXT        NOT NULL DEFAULT '',
  archived     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmd_plans_period_chk CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_cmd_plans_owner ON cmd_plans(owner_id, period_start DESC);

-- ───── 2. cmd_plan_goals (seções) ─────
CREATE TABLE IF NOT EXISTS cmd_plan_goals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id     UUID        NOT NULL REFERENCES cmd_plans(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL DEFAULT '',
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  kind        TEXT        NOT NULL DEFAULT 'goal',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmd_plan_goals_kind_chk CHECK (kind IN ('goal', 'gaps'))
);
CREATE INDEX IF NOT EXISTS idx_cmd_plan_goals_plan ON cmd_plan_goals(plan_id, sort_order);

-- ───── 3. cmd_plan_items (entregáveis) ─────
CREATE TABLE IF NOT EXISTS cmd_plan_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id     UUID        NOT NULL REFERENCES cmd_plan_goals(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  details     TEXT        NOT NULL DEFAULT '',
  link_url    TEXT        NOT NULL DEFAULT '',
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'open',
  done_at     TIMESTAMPTZ,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmd_plan_items_status_chk CHECK (status IN ('open', 'done'))
);
CREATE INDEX IF NOT EXISTS idx_cmd_plan_items_goal ON cmd_plan_items(goal_id, sort_order);

-- ───── 4. RLS: só o dono vê e edita ─────
ALTER TABLE cmd_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_plan_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmd_plans_owner_select" ON cmd_plans;
DROP POLICY IF EXISTS "cmd_plans_owner_insert" ON cmd_plans;
DROP POLICY IF EXISTS "cmd_plans_owner_update" ON cmd_plans;
DROP POLICY IF EXISTS "cmd_plans_owner_delete" ON cmd_plans;
CREATE POLICY "cmd_plans_owner_select" ON cmd_plans FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_plans_owner_insert" ON cmd_plans FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plans_owner_update" ON cmd_plans FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plans_owner_delete" ON cmd_plans FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "cmd_plan_goals_owner_select" ON cmd_plan_goals;
DROP POLICY IF EXISTS "cmd_plan_goals_owner_insert" ON cmd_plan_goals;
DROP POLICY IF EXISTS "cmd_plan_goals_owner_update" ON cmd_plan_goals;
DROP POLICY IF EXISTS "cmd_plan_goals_owner_delete" ON cmd_plan_goals;
CREATE POLICY "cmd_plan_goals_owner_select" ON cmd_plan_goals FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_plan_goals_owner_insert" ON cmd_plan_goals FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plan_goals_owner_update" ON cmd_plan_goals FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plan_goals_owner_delete" ON cmd_plan_goals FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "cmd_plan_items_owner_select" ON cmd_plan_items;
DROP POLICY IF EXISTS "cmd_plan_items_owner_insert" ON cmd_plan_items;
DROP POLICY IF EXISTS "cmd_plan_items_owner_update" ON cmd_plan_items;
DROP POLICY IF EXISTS "cmd_plan_items_owner_delete" ON cmd_plan_items;
CREATE POLICY "cmd_plan_items_owner_select" ON cmd_plan_items FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_plan_items_owner_insert" ON cmd_plan_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plan_items_owner_update" ON cmd_plan_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_plan_items_owner_delete" ON cmd_plan_items FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ───── 5. updated_at + done_at ─────
DROP TRIGGER IF EXISTS cmd_plans_updated_at ON cmd_plans;
CREATE TRIGGER cmd_plans_updated_at BEFORE UPDATE ON cmd_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS cmd_plan_goals_updated_at ON cmd_plan_goals;
CREATE TRIGGER cmd_plan_goals_updated_at BEFORE UPDATE ON cmd_plan_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS cmd_plan_items_updated_at ON cmd_plan_items;
CREATE TRIGGER cmd_plan_items_updated_at BEFORE UPDATE ON cmd_plan_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- done_at é do banco: o front nunca envia.
CREATE OR REPLACE FUNCTION cmd_plan_items_set_done_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.done_at := CASE WHEN NEW.status = 'done' THEN coalesce(NEW.done_at, now()) END;
  ELSIF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.done_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.done_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cmd_plan_items_done_at ON cmd_plan_items;
CREATE TRIGGER cmd_plan_items_done_at BEFORE INSERT OR UPDATE OF status ON cmd_plan_items
  FOR EACH ROW EXECUTE FUNCTION cmd_plan_items_set_done_at();

-- ───── 6. cmd_tasks → entregável ─────
ALTER TABLE cmd_tasks
  ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES cmd_plan_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cmd_tasks_plan_item ON cmd_tasks(plan_item_id) WHERE plan_item_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ───── Verificação ─────
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('cmd_plans','cmd_plan_goals','cmd_plan_items')) AS tabelas,          -- esperado 3
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cmd_plans')                                      AS policies_plans,   -- esperado 4
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cmd_plan_goals')                                 AS policies_goals,   -- esperado 4
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cmd_plan_items')                                 AS policies_items,   -- esperado 4
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'cmd_tasks' AND column_name = 'plan_item_id')                                   AS coluna_tarefas;   -- esperado 1
