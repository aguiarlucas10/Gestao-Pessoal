-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v10: Séries de reuniões (recorrentes)
-- Rodar no SQL Editor do Supabase. Só ADICIONA: o front atual continua funcionando.
-- ════════════════════════════════════════════════════════
--
-- O que muda:
--   cmd_meeting_series   reunião recorrente (nome, cadência, participantes padrão,
--                        tópicos da pauta da próxima)
--   cmd_meetings         series_id: a reunião é uma ocorrência da série
--                        (excluir a série não apaga reuniões: o vínculo vira NULL)
-- ════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS cmd_meeting_series (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  cadence     TEXT        NOT NULL DEFAULT 'weekly',
  attendees   TEXT[]      NOT NULL DEFAULT '{}',
  agenda      JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- tópicos manuais: [{id, text}]
  archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmd_meeting_series_cadence_chk CHECK (cadence IN ('weekly', 'biweekly', 'monthly', 'none')),
  CONSTRAINT cmd_meeting_series_agenda_chk  CHECK (jsonb_typeof(agenda) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_cmd_meeting_series_owner ON cmd_meeting_series(owner_id);

ALTER TABLE cmd_meeting_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmd_meeting_series_owner_select" ON cmd_meeting_series;
DROP POLICY IF EXISTS "cmd_meeting_series_owner_insert" ON cmd_meeting_series;
DROP POLICY IF EXISTS "cmd_meeting_series_owner_update" ON cmd_meeting_series;
DROP POLICY IF EXISTS "cmd_meeting_series_owner_delete" ON cmd_meeting_series;
CREATE POLICY "cmd_meeting_series_owner_select" ON cmd_meeting_series FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_meeting_series_owner_insert" ON cmd_meeting_series FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_meeting_series_owner_update" ON cmd_meeting_series FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_meeting_series_owner_delete" ON cmd_meeting_series FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP TRIGGER IF EXISTS cmd_meeting_series_updated_at ON cmd_meeting_series;
CREATE TRIGGER cmd_meeting_series_updated_at BEFORE UPDATE ON cmd_meeting_series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cmd_meetings
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES cmd_meeting_series(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cmd_meetings_series ON cmd_meetings(series_id, meeting_date DESC) WHERE series_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ───── Verificação ─────
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'cmd_meeting_series')            AS tabela,          -- esperado 1
  (SELECT count(*) FROM pg_policies WHERE tablename = 'cmd_meeting_series')         AS policies,        -- esperado 4
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'cmd_meetings' AND column_name = 'series_id')               AS coluna_reunioes; -- esperado 1
