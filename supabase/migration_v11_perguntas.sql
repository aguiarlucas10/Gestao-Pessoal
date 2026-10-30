-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v11: Perguntar (agente que responde com base no banco)
-- Rodar no SQL Editor do Supabase. Só ADICIONA: o front atual continua funcionando.
-- ════════════════════════════════════════════════════════
--
-- O que muda:
--   cmd_ask_threads    uma conversa com o agente (título = primeira pergunta)
--   cmd_ask_messages   perguntas e respostas da conversa, com as fontes citadas
-- ════════════════════════════════════════════════════════

BEGIN;

-- ───── 1. cmd_ask_threads ─────
CREATE TABLE IF NOT EXISTS cmd_ask_threads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmd_ask_threads_owner ON cmd_ask_threads(owner_id, updated_at DESC);

ALTER TABLE cmd_ask_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmd_ask_threads_owner_select" ON cmd_ask_threads;
DROP POLICY IF EXISTS "cmd_ask_threads_owner_insert" ON cmd_ask_threads;
DROP POLICY IF EXISTS "cmd_ask_threads_owner_update" ON cmd_ask_threads;
DROP POLICY IF EXISTS "cmd_ask_threads_owner_delete" ON cmd_ask_threads;
CREATE POLICY "cmd_ask_threads_owner_select" ON cmd_ask_threads FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_ask_threads_owner_insert" ON cmd_ask_threads FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_ask_threads_owner_update" ON cmd_ask_threads FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_ask_threads_owner_delete" ON cmd_ask_threads FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP TRIGGER IF EXISTS cmd_ask_threads_updated_at ON cmd_ask_threads;
CREATE TRIGGER cmd_ask_threads_updated_at BEFORE UPDATE ON cmd_ask_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ───── 2. cmd_ask_messages ─────
CREATE TABLE IF NOT EXISTS cmd_ask_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID        NOT NULL REFERENCES cmd_ask_threads(id) ON DELETE CASCADE,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  sources     JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{n, tipo, id, titulo, data, trecho}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmd_ask_messages_role_chk    CHECK (role IN ('user', 'assistant')),
  CONSTRAINT cmd_ask_messages_sources_chk CHECK (jsonb_typeof(sources) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_cmd_ask_messages_thread ON cmd_ask_messages(thread_id, created_at);

ALTER TABLE cmd_ask_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cmd_ask_messages_owner_select" ON cmd_ask_messages;
DROP POLICY IF EXISTS "cmd_ask_messages_owner_insert" ON cmd_ask_messages;
DROP POLICY IF EXISTS "cmd_ask_messages_owner_update" ON cmd_ask_messages;
DROP POLICY IF EXISTS "cmd_ask_messages_owner_delete" ON cmd_ask_messages;
CREATE POLICY "cmd_ask_messages_owner_select" ON cmd_ask_messages FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "cmd_ask_messages_owner_insert" ON cmd_ask_messages FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_ask_messages_owner_update" ON cmd_ask_messages FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "cmd_ask_messages_owner_delete" ON cmd_ask_messages FOR DELETE TO authenticated USING (owner_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ───── Verificação ─────
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('cmd_ask_threads', 'cmd_ask_messages')) AS tabelas,   -- esperado 2
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('cmd_ask_threads', 'cmd_ask_messages')) AS policies;  -- esperado 8
