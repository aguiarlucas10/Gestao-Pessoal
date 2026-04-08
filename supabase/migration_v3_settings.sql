-- ════════════════════════════════════════════════════════
-- CMD.CENTER — Migration v3: User Settings (people + 1:1 state)
-- Rodar no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════

-- Tabela para guardar configurações do usuário (pessoas, 1:1, preferências)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  people JSONB DEFAULT '[]'::jsonb,
  oo_data JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_user_settings_owner ON user_settings(owner_id);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_owner_select" ON user_settings FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "settings_owner_insert" ON user_settings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "settings_owner_update" ON user_settings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "settings_owner_delete" ON user_settings FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Verificar
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'user_settings';
