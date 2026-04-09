-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v6: Adicionar coluna notes em cmd_meetings
-- Rodar no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════

ALTER TABLE cmd_meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
