// supabase/functions/transcribe/index.ts
// Proxy de transcrição — recebe áudio do frontend, chama OpenAI server-side
//
// Campos aceitos (multipart):
//   file        → áudio (webm/opus)
//   context     → últimas frases já transcritas (dá continuidade entre trechos)
//   keywords[]  → nomes/termos extras (pessoas, participantes)
//
// Modelo: secret TRANSCRIBE_MODEL (padrão gpt-transcribe)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Vocabulário fixo da empresa — ajuda o modelo a acertar marca, canais e jargão.
// Edite aqui para incluir novos termos recorrentes.
const BASE_KEYWORDS = [
  "Saint Germain", "Nuvemshop", "Shopee", "TikTok", "Instagram", "Mercado Livre",
  "live", "lives", "faturamento", "semijoias", "relógios", "óculos de sol",
  "quiosques", "B2B", "lojistas", "influencers", "embaixadores", "cupom",
  "criativos", "branding", "best-seller", "ruptura", "estoque", "CRM",
];

const BASE_PROMPT =
  "Reunião interna da Saint Germain (marca brasileira de semijoias, relógios e óculos de sol), " +
  "em português do Brasil, com termos de e-commerce, marketing e varejo.";

const MAX_KEYWORDS = 60;
const MAX_CONTEXT_CHARS = 800;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A OpenAI rejeita a requisição inteira se um keyword tiver < > ou quebra de linha
function cleanKeyword(k: string) {
  return k.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ error: "Unauthorized" }, 401);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OpenAI key not configured" }, 500);

    const formData = await req.formData();
    const audioFile = formData.get("file");
    if (!audioFile) return json({ error: "No audio file" }, 400);

    const context = String(formData.get("context") || "").slice(-MAX_CONTEXT_CHARS);
    const extraKeywords = formData.getAll("keywords[]").map(String);

    const seen = new Set<string>();
    const keywords = [...BASE_KEYWORDS, ...extraKeywords]
      .map(cleanKeyword)
      .filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
      .slice(0, MAX_KEYWORDS);

    const prompt = context
      ? `${BASE_PROMPT}\n\nTrecho anterior da mesma reunião:\n${context}`
      : BASE_PROMPT;

    const model = Deno.env.get("TRANSCRIBE_MODEL") || "gpt-transcribe";
    const form = new FormData();
    form.append("file", audioFile, (audioFile as File).name || "audio.webm");
    form.append("model", model);
    form.append("prompt", prompt);
    if (model === "whisper-1" || model.startsWith("gpt-4o")) {
      form.append("language", "pt");
    } else {
      form.append("languages[]", "pt");
      keywords.forEach((k) => form.append("keywords[]", k));
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`transcribe ${model} ${res.status}: ${err}`);
      return json({ error: `OpenAI ${res.status}: ${err.slice(0, 300)}` }, 502);
    }

    const data = await res.json();
    return json({ text: data.text || "", model });

  } catch (e) {
    console.error("transcribe error:", e);
    return json({ error: e.message }, 500);
  }
});
