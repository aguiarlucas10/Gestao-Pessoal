-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v4: Prefixo cmd_ em todas as tabelas
-- Rodar no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════

-- 1. Renomear tabelas
ALTER TABLE IF EXISTS tasks           RENAME TO cmd_tasks;
ALTER TABLE IF EXISTS meetings        RENAME TO cmd_meetings;
ALTER TABLE IF EXISTS meeting_demands RENAME TO cmd_meeting_demands;
ALTER TABLE IF EXISTS one_on_ones     RENAME TO cmd_one_on_ones;
ALTER TABLE IF EXISTS user_settings   RENAME TO cmd_user_settings;

-- 2. Renomear índices
ALTER INDEX IF EXISTS idx_tasks_owner          RENAME TO idx_cmd_tasks_owner;
ALTER INDEX IF EXISTS idx_meetings_owner       RENAME TO idx_cmd_meetings_owner;
ALTER INDEX IF EXISTS idx_oneones_owner        RENAME TO idx_cmd_oneones_owner;
ALTER INDEX IF EXISTS idx_user_settings_owner  RENAME TO idx_cmd_user_settings_owner;

-- 3. Dropar políticas antigas e recriar com nomes novos

-- CMD_TASKS
DROP POLICY IF EXISTS "tasks_owner_select" ON cmd_tasks;
DROP POLICY IF EXISTS "tasks_owner_insert" ON cmd_tasks;
DROP POLICY IF EXISTS "tasks_owner_update" ON cmd_tasks;
DROP POLICY IF EXISTS "tasks_owner_delete" ON cmd_tasks;
CREATE POLICY "cmd_tasks_owner_select" ON cmd_tasks FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_tasks_owner_insert" ON cmd_tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_tasks_owner_update" ON cmd_tasks FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_tasks_owner_delete" ON cmd_tasks FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- CMD_MEETINGS
DROP POLICY IF EXISTS "meetings_owner_select" ON cmd_meetings;
DROP POLICY IF EXISTS "meetings_owner_insert" ON cmd_meetings;
DROP POLICY IF EXISTS "meetings_owner_update" ON cmd_meetings;
DROP POLICY IF EXISTS "meetings_owner_delete" ON cmd_meetings;
CREATE POLICY "cmd_meetings_owner_select" ON cmd_meetings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_meetings_owner_insert" ON cmd_meetings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_meetings_owner_update" ON cmd_meetings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_meetings_owner_delete" ON cmd_meetings FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- CMD_MEETING_DEMANDS
DROP POLICY IF EXISTS "demands_owner_select" ON cmd_meeting_demands;
DROP POLICY IF EXISTS "demands_owner_insert" ON cmd_meeting_demands;
DROP POLICY IF EXISTS "demands_owner_update" ON cmd_meeting_demands;
DROP POLICY IF EXISTS "demands_owner_delete" ON cmd_meeting_demands;
CREATE POLICY "cmd_demands_owner_select" ON cmd_meeting_demands FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_demands_owner_insert" ON cmd_meeting_demands FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_demands_owner_update" ON cmd_meeting_demands FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_demands_owner_delete" ON cmd_meeting_demands FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- CMD_ONE_ON_ONES
DROP POLICY IF EXISTS "oneones_owner_select" ON cmd_one_on_ones;
DROP POLICY IF EXISTS "oneones_owner_insert" ON cmd_one_on_ones;
DROP POLICY IF EXISTS "oneones_owner_update" ON cmd_one_on_ones;
DROP POLICY IF EXISTS "oneones_owner_delete" ON cmd_one_on_ones;
CREATE POLICY "cmd_oneones_owner_select" ON cmd_one_on_ones FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_oneones_owner_insert" ON cmd_one_on_ones FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_oneones_owner_update" ON cmd_one_on_ones FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_oneones_owner_delete" ON cmd_one_on_ones FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- CMD_USER_SETTINGS
DROP POLICY IF EXISTS "settings_owner_select" ON cmd_user_settings;
DROP POLICY IF EXISTS "settings_owner_insert" ON cmd_user_settings;
DROP POLICY IF EXISTS "settings_owner_update" ON cmd_user_settings;
DROP POLICY IF EXISTS "settings_owner_delete" ON cmd_user_settings;
CREATE POLICY "cmd_settings_owner_select" ON cmd_user_settings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_settings_owner_insert" ON cmd_user_settings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_settings_owner_update" ON cmd_user_settings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_settings_owner_delete" ON cmd_user_settings FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 4. Verificar
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename LIKE 'cmd_%'
ORDER BY tablename, cmd;
