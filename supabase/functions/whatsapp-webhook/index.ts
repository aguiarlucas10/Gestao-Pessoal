// supabase/functions/whatsapp-webhook/index.ts
// Webhook público da Meta Cloud API → rollup diário em cmd_wa_daily.
//
// Deploy: supabase functions deploy whatsapp-webhook --no-verify-jwt
// Secrets necessários:
//   WA_VERIFY_TOKEN          — handshake GET com a Meta
//   WA_APP_SECRET            — assinatura HMAC do POST
//   SUPABASE_URL             — automático em Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY — automático em Edge Functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_CATEGORIES = new Set(["utility", "marketing", "authentication", "service"]);

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// HMAC-SHA256(secret, body) → hex string
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparação em tempo constante (defesa contra timing attack)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Converte timestamp Unix (segundos, string ou number) para data YYYY-MM-DD em America/Sao_Paulo.
// Meta entrega timestamps em UTC; a fatura/relatório operacional faz mais sentido em horário local.
function tsToSaoPauloDate(ts: string | number): string {
  const ms = (typeof ts === "string" ? parseInt(ts, 10) : ts) * 1000;
  // Intl com pt-BR + timeZone resolve TZ + DST corretamente
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produz YYYY-MM-DD diretamente
  return fmt.format(new Date(ms));
}

serve(async (req) => {
  const url = new URL(req.url);

  // ───── GET: handshake da Meta ─────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WA_VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && timingSafeEqual(token, expected)) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // ───── POST: payload de eventos ─────
  // Ler raw body ANTES de parsear — assinatura é sobre o byte stream literal.
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
  const appSecret = Deno.env.get("WA_APP_SECRET");

  if (!appSecret) {
    return new Response("not configured", { status: 500 });
  }
  if (!sigHeader.startsWith("sha256=")) {
    return new Response("missing signature", { status: 403 });
  }
  const expectedSig = "sha256=" + await hmacSha256Hex(appSecret, rawBody);
  if (!timingSafeEqual(sigHeader, expectedSig)) {
    return new Response("bad signature", { status: 403 });
  }

  // Assinatura ok — parsear payload.
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Cache em memória dentro desta invocação: phone_number_id → {owner_id, wa_number_id}.
  // Um batch da Meta vem com vários statuses do mesmo número → evita refazer o lookup.
  const numberCache = new Map<string, { owner_id: string; wa_number_id: string }>();

  async function resolveNumber(phone_number_id: string) {
    if (numberCache.has(phone_number_id)) return numberCache.get(phone_number_id)!;
    const { data, error } = await sb
      .from("cmd_wa_numbers")
      .select("id, owner_id, active")
      .eq("phone_number_id", phone_number_id)
      .maybeSingle();
    if (error || !data || !data.active) {
      numberCache.set(phone_number_id, null as any);
      return null;
    }
    const rec = { owner_id: data.owner_id, wa_number_id: data.id };
    numberCache.set(phone_number_id, rec);
    return rec;
  }

  // Iterar todos os statuses billable do payload.
  // Estrutura Meta: entry[].changes[].value.{metadata, statuses[]}
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;
      const phone_number_id: string | undefined = value?.metadata?.phone_number_id;
      if (!phone_number_id) continue;
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      if (statuses.length === 0) continue;

      const resolved = await resolveNumber(phone_number_id);
      if (!resolved) continue; // número não cadastrado — descarta silenciosamente

      for (const st of statuses) {
        // Conta apenas statuses que carregam metadata de billing.
        // 'sent' é o primeiro evento da conversation e sempre traz pricing+conversation.
        const conv = st?.conversation;
        const pricing = st?.pricing;
        if (!conv?.id || !pricing) continue;
        // Só billable importa para custo. Alguns service conversations vêm como billable=false.
        if (pricing.billable === false) continue;
        const category: string | undefined =
          conv?.origin?.type ?? pricing?.category;
        if (!category || !VALID_CATEGORIES.has(category)) continue;

        const occurred_date = tsToSaoPauloDate(st.timestamp ?? Date.now() / 1000);

        const { error } = await sb.rpc("wa_record", {
          p_conversation_id: conv.id as string,
          p_owner_id: resolved.owner_id,
          p_wa_number_id: resolved.wa_number_id,
          p_occurred_date: occurred_date,
          p_category: category,
        });
        if (error) {
          // Log, mas não rejeita o batch — devolve 200 pra Meta.
          console.error("wa_record failed", error, conv.id);
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
});
