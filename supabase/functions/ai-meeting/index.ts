// supabase/functions/ai-meeting/index.ts
// Edge Function — processa transcript e gera ata + demandas via OpenAI
// A OPENAI_API_KEY fica como secret no Supabase, NUNCA exposta no frontend

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar auth — só usuário autenticado pode chamar
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transcript, title, participants } = await req.json();
    if (!transcript) {
      return new Response(JSON.stringify({ error: "transcript required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OpenAI key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é o assistente executivo do Lucas (Diretor Comercial, Saint Germain Brand).

Reunião: ${title || "Reunião"}
Participantes: ${participants || "time"}

Transcript:
${transcript}

Retorne APENAS JSON válido neste formato:
{
  "ata": "resumo executivo em 3-5 parágrafos, destacando decisões tomadas e contexto",
  "demandas": [
    {
      "titulo": "descrição clara e acionável da tarefa",
      "responsavel": "lucas|rafa|edu|gustavo|catarina|junior",
      "prioridade": "alta|media|baixa",
      "tipo": "minha|delegada"
    }
  ]
}

Regras:
- "minha" = Lucas executa pessoalmente
- "delegada" = Lucas delegou para outro
- Extraia APENAS tarefas concretas com responsável claro
- Prioridade alta = prazo urgente ou bloqueante
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const aiData = await openaiRes.json();
    const result = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
