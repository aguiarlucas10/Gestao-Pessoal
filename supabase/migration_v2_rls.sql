-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v2: Auth + RLS seguro
-- Rodar no SQL Editor APÓS a migration v1
-- ════════════════════════════════════════════════════════

-- 1. Remover políticas permissivas antigas (anon livre)
DROP POLICY IF EXISTS "allow_all_tasks"        ON tasks;
DROP POLICY IF EXISTS "allow_all_meetings"     ON meetings;
DROP POLICY IF EXISTS "allow_all_demands"      ON meeting_demands;
DROP POLICY IF EXISTS "allow_all_oneones"      ON one_on_ones;

-- 2. Adicionar coluna owner em cada tabela
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE meetings       ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE meeting_demands ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE one_on_ones    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Índices nos owner_ids
CREATE INDEX IF NOT EXISTS idx_tasks_owner       ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_meetings_owner    ON meetings(owner_id);
CREATE INDEX IF NOT EXISTS idx_oneones_owner     ON one_on_ones(owner_id);

-- 4. Novas políticas RLS — só o dono vê e edita seus dados
-- TASKS
CREATE POLICY "tasks_owner_select" ON tasks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "tasks_owner_insert" ON tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks_owner_update" ON tasks FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tasks_owner_delete" ON tasks FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- MEETINGS
CREATE POLICY "meetings_owner_select" ON meetings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "meetings_owner_insert" ON meetings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "meetings_owner_update" ON meetings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "meetings_owner_delete" ON meetings FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- MEETING_DEMANDS
CREATE POLICY "demands_owner_select" ON meeting_demands FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "demands_owner_insert" ON meeting_demands FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "demands_owner_update" ON meeting_demands FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "demands_owner_delete" ON meeting_demands FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ONE_ON_ONES
CREATE POLICY "oneones_owner_select" ON one_on_ones FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "oneones_owner_insert" ON one_on_ones FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "oneones_owner_update" ON one_on_ones FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "oneones_owner_delete" ON one_on_ones FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 5. Verificar
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('tasks','meetings','meeting_demands','one_on_ones')
ORDER BY tablename, cmd;
