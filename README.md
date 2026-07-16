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

## PASSO 5 — WhatsApp Monitor (migration v7 + webhook Meta)

### 5.1 — Rodar migration v7
SQL Editor → executar `supabase/migration_v7_whatsapp.sql`. Cria tabelas `cmd_wa_numbers`, `cmd_wa_daily`, `cmd_wa_tariffs`, `cmd_wa_seen`, função `wa_record` e job `pg_cron` que poda dedup a cada hora. Se a extensão `pg_cron` não estiver habilitada, vá em Database → Extensions → pg_cron → Enable, e re-rode o trecho final da migration.

### 5.2 — Configurar secrets do webhook
Escolha um `WA_VERIFY_TOKEN` arbitrário (string segura) e obtenha o `App Secret` em Meta Developer Console → App Settings → Basic.

```bash
supabase secrets set WA_VERIFY_TOKEN=cole_seu_token_aqui
supabase secrets set WA_APP_SECRET=cole_app_secret_da_meta
```

### 5.3 — Deploy do webhook
```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```
URL pública resultante:
`https://cvymqbjaxtricwimusld.functions.supabase.co/whatsapp-webhook`

### 5.4 — Registrar webhook no Meta
Meta Developer Console → WhatsApp → Configuration → Webhook:
- **Callback URL**: URL acima
- **Verify token**: o mesmo `WA_VERIFY_TOKEN`
- **Subscribe**: campo `messages`

### 5.5 — Cadastrar os números no CMD.CENTER
Operação → WhatsApp → "Gerenciar números". Cadastrar `display_phone_number` (ex: +55 11 99999-0000) + `phone_number_id` (Meta) + apelido. Conversations de números **não cadastrados são descartadas silenciosamente** pelo webhook.

### 5.6 — Validar
- Disparar 1 template utility e 1 marketing para um destinatário de teste.
- KPIs e gráfico devem refletir em segundos.
- Hover na barra mostra gasto por número.
