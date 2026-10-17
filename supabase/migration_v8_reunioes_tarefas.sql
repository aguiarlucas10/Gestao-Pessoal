-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v8: Reuniões unificadas + tarefas com origem
-- Rodar no SQL Editor do Supabase. Só ADICIONA: o front antigo continua funcionando.
-- ════════════════════════════════════════════════════════
--
-- O que muda:
--   cmd_meetings         kind (meeting|oneone), person_id, status, attendees text[],
--                        started_at, duration_sec, demands_sent_at, updated_at
--   cmd_meeting_demands  due_date, included, sort_order (+ task_id passa a ser gravado)
--   cmd_tasks            origin_type/origin_id, completed_at (trigger), last_followup_at, followup_count
--   cmd_user_settings    prefs jsonb (flags e estado de notificações)
--   cmd_one_on_ones      removida (nunca foi usada; guarda aborta se tiver linhas)
-- ════════════════════════════════════════════════════════

-- ───── 0. Backup (schema fora da API: anon/authenticated sem acesso) ─────
CREATE SCHEMA IF NOT EXISTS cmd_backup;
REVOKE ALL ON SCHEMA cmd_backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS cmd_backup.user_settings_v8   AS TABLE cmd_user_settings;
CREATE TABLE IF NOT EXISTS cmd_backup.meetings_v8        AS TABLE cmd_meetings;
CREATE TABLE IF NOT EXISTS cmd_backup.meeting_demands_v8 AS TABLE cmd_meeting_demands;
CREATE TABLE IF NOT EXISTS cmd_backup.tasks_v8           AS TABLE cmd_tasks;
-- RLS sem policies = ninguém via API lê (só o SQL Editor, como postgres)
ALTER TABLE cmd_backup.user_settings_v8   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_backup.meetings_v8        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_backup.meeting_demands_v8 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_backup.tasks_v8           ENABLE ROW LEVEL SECURITY;

BEGIN;

-- Participantes eram TEXT: "Lucas, Junior" (Transcrição) ou '["Ana","João"]' (modal "+").
CREATE FUNCTION pg_temp.cmd_parse_participants(p TEXT) RETURNS TEXT[] LANGUAGE plpgsql AS $$
BEGIN
  IF p IS NULL OR btrim(p) IN ('', 'time') THEN RETURN '{}'; END IF;
  IF btrim(p) LIKE '[%' THEN
    BEGIN
      RETURN ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(p::jsonb) x WHERE btrim(x) <> '');
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN ARRAY(SELECT btrim(x) FROM unnest(regexp_split_to_array(p, '[,;]')) x WHERE btrim(x) <> '');
END $$;

-- ───── 1. cmd_meetings ─────
ALTER TABLE cmd_meetings
  ADD COLUMN IF NOT EXISTS kind            TEXT        NOT NULL DEFAULT 'meeting',
  ADD COLUMN IF NOT EXISTS person_id       TEXT,
  ADD COLUMN IF NOT EXISTS status          TEXT        NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS attendees       TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_sec    INTEGER,
  ADD COLUMN IF NOT EXISTS demands_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE cmd_meetings SET attendees = pg_temp.cmd_parse_participants(participants)
 WHERE attendees = '{}' AND coalesce(btrim(participants), '') <> '';

UPDATE cmd_meetings SET status = CASE
    WHEN coalesce(ata, '') <> ''        THEN 'processed'
    WHEN coalesce(transcript, '') <> '' THEN 'recorded'
    ELSE 'draft' END
 WHERE status = 'draft';

ALTER TABLE cmd_meetings DROP CONSTRAINT IF EXISTS cmd_meetings_kind_chk;
ALTER TABLE cmd_meetings ADD CONSTRAINT cmd_meetings_kind_chk
  CHECK (kind IN ('meeting', 'oneone') AND (kind = 'meeting' OR person_id IS NOT NULL));
ALTER TABLE cmd_meetings DROP CONSTRAINT IF EXISTS cmd_meetings_status_chk;
ALTER TABLE cmd_meetings ADD CONSTRAINT cmd_meetings_status_chk
  CHECK (status IN ('draft', 'recorded', 'processed'));

CREATE INDEX IF NOT EXISTS idx_cmd_meetings_owner_date ON cmd_meetings(owner_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_cmd_meetings_person     ON cmd_meetings(owner_id, person_id, meeting_date DESC) WHERE kind = 'oneone';

DROP TRIGGER IF EXISTS cmd_meetings_updated_at ON cmd_meetings;
CREATE TRIGGER cmd_meetings_updated_at BEFORE UPDATE ON cmd_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ───── 2. cmd_meeting_demands (FKs: meeting_id CASCADE, task_id SET NULL) ─────
-- added = "já foi enviada ao board alguma vez"; task_id = vínculo vivo com a tarefa.
ALTER TABLE cmd_meeting_demands
  ADD COLUMN IF NOT EXISTS due_date   DATE,
  ADD COLUMN IF NOT EXISTS included   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cmd_demands_meeting ON cmd_meeting_demands(meeting_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cmd_demands_task ON cmd_meeting_demands(task_id) WHERE task_id IS NOT NULL;

-- ───── 3. cmd_tasks ─────
ALTER TABLE cmd_tasks
  ADD COLUMN IF NOT EXISTS origin_type      TEXT,
  ADD COLUMN IF NOT EXISTS origin_id        UUID REFERENCES cmd_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cmd_tasks DROP CONSTRAINT IF EXISTS cmd_tasks_origin_type_chk;
ALTER TABLE cmd_tasks ADD CONSTRAINT cmd_tasks_origin_type_chk
  CHECK (origin_type IS NULL OR origin_type IN ('manual', 'meeting', 'oneone'));
CREATE INDEX IF NOT EXISTS idx_cmd_tasks_origin ON cmd_tasks(origin_id) WHERE origin_id IS NOT NULL;

UPDATE cmd_tasks SET completed_at = coalesce(updated_at, created_at) WHERE done AND completed_at IS NULL;

-- completed_at é do banco: o front nunca envia.
CREATE OR REPLACE FUNCTION cmd_tasks_set_completed_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.done THEN NEW.completed_at := coalesce(NEW.completed_at, now()); END IF;
  ELSIF NEW.done AND NOT coalesce(OLD.done, FALSE) THEN
    NEW.completed_at := now();
  ELSIF NOT coalesce(NEW.done, FALSE) THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cmd_tasks_completed_at ON cmd_tasks;
CREATE TRIGGER cmd_tasks_completed_at BEFORE INSERT OR UPDATE OF done ON cmd_tasks
  FOR EACH ROW EXECUTE FUNCTION cmd_tasks_set_completed_at();

-- ───── 4. Preferências ─────
ALTER TABLE cmd_user_settings ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ───── 5. Tabela morta da v1 ─────
DO $$ BEGIN
  IF to_regclass('public.cmd_one_on_ones') IS NOT NULL THEN
    IF (SELECT count(*) FROM cmd_one_on_ones) > 0 THEN
      RAISE EXCEPTION 'cmd_one_on_ones tem linhas — revisar antes de remover';
    END IF;
    DROP TABLE cmd_one_on_ones;
  END IF;
END $$;

-- ───── 6. Vínculos que já existiam por texto (idempotente) ─────
-- Tarefa cujo "Origem" é exatamente o título de UMA reunião → vira origin_id.
UPDATE cmd_tasks t SET origin_type = 'meeting', origin_id = m.id
  FROM cmd_meetings m
 WHERE t.origin_id IS NULL AND t.owner_id = m.owner_id
   AND coalesce(btrim(t.context), '') <> ''
   AND lower(btrim(t.context)) = lower(btrim(m.title))
   AND (SELECT count(*) FROM cmd_meetings m2
         WHERE m2.owner_id = m.owner_id AND lower(btrim(m2.title)) = lower(btrim(m.title))) = 1;

-- Demanda com o mesmo título de uma tarefa daquela reunião → grava task_id.
WITH pairs AS (
  SELECT DISTINCT ON (t.id) d.id AS demand_id, t.id AS task_id
    FROM cmd_meeting_demands d
    JOIN cmd_tasks t ON t.owner_id = d.owner_id AND t.origin_id = d.meeting_id
                    AND lower(btrim(t.title)) = lower(btrim(d.title))
   WHERE d.task_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM cmd_meeting_demands x WHERE x.task_id = t.id)
   ORDER BY t.id, d.created_at)
UPDATE cmd_meeting_demands d SET task_id = p.task_id, added = TRUE
  FROM pairs p WHERE d.id = p.demand_id;

UPDATE cmd_meetings m SET demands_sent_at = m.created_at
 WHERE demands_sent_at IS NULL
   AND EXISTS (SELECT 1 FROM cmd_meeting_demands d WHERE d.meeting_id = m.id AND d.added);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ───── Verificação ─────
SELECT
  (SELECT count(*) FROM cmd_meetings
     WHERE EXISTS (SELECT 1 FROM unnest(attendees) a WHERE a ~ '[\[\]"]')) AS attendees_suspeitos,   -- esperado 0
  (SELECT count(*) FROM cmd_meetings WHERE coalesce(btrim(participants),'') NOT IN ('','time')
                                     AND attendees = '{}')                AS attendees_vazios,      -- esperado 0
  (SELECT count(*) FROM cmd_tasks WHERE origin_id IS NOT NULL)            AS tarefas_vinculadas,
  (SELECT count(*) FROM cmd_meeting_demands WHERE task_id IS NOT NULL)    AS demandas_vinculadas,
  (SELECT count(*) FROM cmd_tasks WHERE done AND completed_at IS NULL)    AS concluidas_sem_data;   -- esperado 0
