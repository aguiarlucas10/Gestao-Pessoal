-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v7: Monitor de Disparos WhatsApp
-- Rodar no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════
--
-- Arquitetura agregada para suportar ~300k conversations/mês:
--   cmd_wa_numbers   — cadastro de números Business (CRUD)
--   cmd_wa_daily     — rollup diário (owner, número, dia, categoria, count)
--   cmd_wa_tariffs   — tarifas por categoria (configuráveis pelo usuário)
--   cmd_wa_seen      — dedup curto (TTL 48h, podado por pg_cron)
--
-- Webhook nunca grava evento individual perene — só incrementa contador.
-- ════════════════════════════════════════════════════════

-- ───── 1. Tabela de números (CRUD) ─────
CREATE TABLE IF NOT EXISTS cmd_wa_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_phone_number TEXT NOT NULL,
  phone_number_id TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'BR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_numbers_owner ON cmd_wa_numbers(owner_id);

ALTER TABLE cmd_wa_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_numbers_owner_select" ON cmd_wa_numbers;
DROP POLICY IF EXISTS "wa_numbers_owner_insert" ON cmd_wa_numbers;
DROP POLICY IF EXISTS "wa_numbers_owner_update" ON cmd_wa_numbers;
DROP POLICY IF EXISTS "wa_numbers_owner_delete" ON cmd_wa_numbers;
CREATE POLICY "wa_numbers_owner_select" ON cmd_wa_numbers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "wa_numbers_owner_insert" ON cmd_wa_numbers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wa_numbers_owner_update" ON cmd_wa_numbers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wa_numbers_owner_delete" ON cmd_wa_numbers FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ───── 2. Rollup diário (uma linha por owner × número × dia × categoria) ─────
CREATE TABLE IF NOT EXISTS cmd_wa_daily (
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wa_number_id UUID REFERENCES cmd_wa_numbers(id) ON DELETE CASCADE NOT NULL,
  occurred_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('utility','marketing','authentication','service')),
  conversation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, wa_number_id, occurred_date, category)
);
CREATE INDEX IF NOT EXISTS idx_wa_daily_owner_date ON cmd_wa_daily(owner_id, occurred_date);

ALTER TABLE cmd_wa_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_daily_owner_select" ON cmd_wa_daily;
DROP POLICY IF EXISTS "wa_daily_owner_insert" ON cmd_wa_daily;
DROP POLICY IF EXISTS "wa_daily_owner_update" ON cmd_wa_daily;
DROP POLICY IF EXISTS "wa_daily_owner_delete" ON cmd_wa_daily;
CREATE POLICY "wa_daily_owner_select" ON cmd_wa_daily FOR SELECT TO authenticated USING (owner_id = auth.uid());
-- INSERT/UPDATE só via service-role (webhook). Frontend não escreve aqui.

-- ───── 3. Tarifas por categoria (configuráveis) ─────
CREATE TABLE IF NOT EXISTS cmd_wa_tariffs (
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('utility','marketing','authentication','service')),
  price_brl NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (owner_id, category)
);

ALTER TABLE cmd_wa_tariffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_tariffs_owner_select" ON cmd_wa_tariffs;
DROP POLICY IF EXISTS "wa_tariffs_owner_insert" ON cmd_wa_tariffs;
DROP POLICY IF EXISTS "wa_tariffs_owner_update" ON cmd_wa_tariffs;
DROP POLICY IF EXISTS "wa_tariffs_owner_delete" ON cmd_wa_tariffs;
CREATE POLICY "wa_tariffs_owner_select" ON cmd_wa_tariffs FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "wa_tariffs_owner_insert" ON cmd_wa_tariffs FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wa_tariffs_owner_update" ON cmd_wa_tariffs FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "wa_tariffs_owner_delete" ON cmd_wa_tariffs FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ───── 4. Dedup curto (TTL 48h) ─────
-- Sem RLS para authenticated — só service-role do webhook escreve/lê.
CREATE TABLE IF NOT EXISTS cmd_wa_seen (
  conversation_id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_seen_at ON cmd_wa_seen(seen_at);

ALTER TABLE cmd_wa_seen ENABLE ROW LEVEL SECURITY;
-- Sem policies = ninguém com role authenticated/anon consegue acessar.
-- service_role bypassa RLS.

-- ───── 5. Função seed das tarifas default BR ─────
-- Chamada pelo frontend (RPC) no primeiro load. Idempotente.
CREATE OR REPLACE FUNCTION seed_wa_tariffs(p_owner UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só semeia se for o próprio usuário (defesa em profundidade)
  IF auth.uid() IS NULL OR auth.uid() <> p_owner THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO cmd_wa_tariffs(owner_id, category, price_brl) VALUES
    (p_owner, 'utility',        0.0315),
    (p_owner, 'marketing',      0.1761),
    (p_owner, 'authentication', 0.0315),
    (p_owner, 'service',        0.0000)
  ON CONFLICT (owner_id, category) DO NOTHING;
END;
$$;

-- ───── 6. Função wa_record (chamada pelo webhook via RPC) ─────
-- Atomicamente: dedup em cmd_wa_seen → se novo, incrementa cmd_wa_daily.
-- SECURITY DEFINER porque é chamada com service_role e precisa bypassar RLS de cmd_wa_daily.
CREATE OR REPLACE FUNCTION wa_record(
  p_conversation_id TEXT,
  p_owner_id UUID,
  p_wa_number_id UUID,
  p_occurred_date DATE,
  p_category TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  -- Tenta marcar como visto. Se já visto, retorna false sem tocar no daily.
  INSERT INTO cmd_wa_seen(conversation_id, owner_id)
  VALUES (p_conversation_id, p_owner_id)
  ON CONFLICT (conversation_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  -- Conversation nova: incrementa o bucket diário.
  INSERT INTO cmd_wa_daily(owner_id, wa_number_id, occurred_date, category, conversation_count)
  VALUES (p_owner_id, p_wa_number_id, p_occurred_date, p_category, 1)
  ON CONFLICT (owner_id, wa_number_id, occurred_date, category)
  DO UPDATE SET conversation_count = cmd_wa_daily.conversation_count + 1;

  RETURN TRUE;
END;
$$;

-- Permite que service_role chame a função via RPC.
GRANT EXECUTE ON FUNCTION wa_record(TEXT, UUID, UUID, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION seed_wa_tariffs(UUID) TO authenticated;

-- ───── 7. pg_cron job de poda (TTL 48h) ─────
-- Requer extensão pg_cron habilitada. Em Supabase: Database → Extensions → pg_cron → Enable.
-- Se a extensão não estiver disponível, comente esta seção e use poda oportunística no webhook.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job antigo se existir (idempotência da migration)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'wa_seen_prune';

-- Roda a cada hora, no minuto 0.
SELECT cron.schedule(
  'wa_seen_prune',
  '0 * * * *',
  $$DELETE FROM cmd_wa_seen WHERE seen_at < now() - interval '48 hours'$$
);

-- ───── 8. Verificação ─────
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename LIKE 'cmd_wa%' ORDER BY tablename, policyname;
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'wa_seen_prune';
