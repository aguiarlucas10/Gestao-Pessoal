# CMD.CENTER — Deploy Guide

## Estrutura do Projeto
```
cmdcenter/
├── src/
│   └── index.html              ← App principal
├── supabase/
│   ├── functions/
│   │   ├── ai-meeting/index.ts ← GPT-4o gera ata + demandas
│   │   └── transcribe/index.ts ← Whisper transcrição
│   └── migration_v2_rls.sql    ← RLS com auth (executar agora)
└── vercel.json
```

## PASSO 1 — Migration v2 no Supabase
Acesse: https://supabase.com/dashboard/project/cvymqbjaxtricwimusld/sql
Execute: migration_v2_rls.sql

## PASSO 2 — Criar usuário
Authentication → Users → Add user → Create new user
(Email + senha + marcar "Auto Confirm User")

## PASSO 3 — Deploy Edge Functions
```bash
npm install -g supabase
supabase login
supabase link --project-ref cvymqbjaxtricwimusld
supabase secrets set OPENAI_API_KEY=sk-SUA_CHAVE_AQUI
supabase functions deploy ai-meeting
supabase functions deploy transcribe
```

## PASSO 4 — GitHub + Vercel
```bash
git init && git add . && git commit -m "CMD.CENTER v1"
gh repo create cmdcenter --private --push
```
Depois: vercel.com/new → import repo → Deploy

## Segurança
| Camada | Proteção |
|--------|----------|
| Banco | RLS: cada usuário só vê seus dados |
| OpenAI key | Secret no Supabase, nunca no browser |
| Acesso | Supabase Auth email/senha |
| HTTPS | Certificado automático via Vercel |
