// supabase/functions/ai-meeting/index.ts
// Edge Function — processa transcript e gera ata + demandas via OpenAI
// A OPENAI_API_KEY fica como secret no Supabase, NUNCA exposta no frontend
//
// Modelo: secret AI_MEETING_MODEL (padrão gpt-6-sol)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Usado só se o frontend não mandar a lista de pessoas
const DEFAULT_PEOPLE = [
  { id: "lucas", name: "Lucas" }, { id: "rafa", name: "Rafa" }, { id: "edu", name: "Edu" },
  { id: "gustavo", name: "Gustavo" }, { id: "catarina", name: "Catarina" }, { id: "junior", name: "Junior" },
];

const PRIORIDADES = ["alta", "media", "baixa"];
const TIPOS = ["minha", "delegada"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar auth — só usuário autenticado pode chamar
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { transcript, title, participants, people, meeting_date, kind, person_id } = await req.json();
    if (!transcript) return json({ error: "transcript required" }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OpenAI key not configured" }, 500);

    const team: { id: string; name: string; role?: string }[] =
      Array.isArray(people) && people.length ? [...people] : [...DEFAULT_PEOPLE];
    // "lucas" é o próprio usuário: precisa estar na lista mesmo quando o time não o inclui
    if (!team.some((p) => p.id === "lucas")) team.unshift({ id: "lucas", name: "Lucas", role: "o usuário" });
    const teamIds = team.map((p) => p.id);

    // Data da reunião é a âncora de "até sexta", "semana que vem" etc.
    const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(meeting_date || "") ? meeting_date : new Date().toISOString().slice(0, 10);
    const weekday = new Date(meetingDate + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
    const isOneOnOne = kind === "oneone";
    const oneOnOneName = isOneOnOne ? (team.find((p) => p.id === person_id)?.name || "a pessoa") : "";
    const teamList = team
      .map((p) => `- ${p.id}: ${p.name}${p.role ? ` (${p.role})` : ""}`)
      .join("\n");

    const system = `Você é o assistente executivo do Lucas (Diretor Comercial da Saint Germain, marca brasileira de semijoias, relógios e óculos de sol que vende em site próprio/Nuvemshop, Instagram, TikTok, Shopee, quiosques e B2B).

Você recebe a transcrição automática de uma reunião e produz a ata e a lista de demandas.

Sobre a transcrição:
- Foi gerada automaticamente a partir do áudio e contém erros: palavras trocadas por outras de som parecido, frases cortadas e trechos sem sentido.
- Interprete pelo contexto. Exemplos de erros já vistos: "Sérgio Irmão" ou "Sangemã" = Saint Germain; "coturamento" = faturamento.
- Ignore frases que não pertencem à reunião, como "Obrigado por assistir" ou "Legendas pela comunidade".
- Não invente fatos, números ou decisões que não estejam na conversa. Se algo ficou ambíguo, diga que ficou ambíguo.

Pessoas do time (use o id em "responsavel"):
${teamList}

Data da reunião: ${meetingDate} (${weekday}).

Responda APENAS com JSON válido neste formato:
{
  "ata": "texto da ata",
  "demandas": [
    {
      "titulo": "verbo no infinitivo + o quê + detalhe necessário para executar",
      "responsavel": "${teamIds.join("|")}",
      "prioridade": "alta|media|baixa",
      "tipo": "minha|delegada",
      "prazo": "AAAA-MM-DD ou null"
    }
  ]
}

${isOneOnOne ? `Esta conversa é um 1:1 do Lucas com ${oneOnOneName}.

Formato da "ata" (texto puro, sem markdown, seções separadas por linha em branco, itens começando com "• "):
RESUMO
2 a 4 frases com os temas centrais da conversa.

COMO ${oneOnOneName.toUpperCase()} ESTÁ
• energia, carga de trabalho, bloqueios e preocupações que apareceram. Omita a seção se nada disso apareceu.

PONTOS DISCUTIDOS
• cada tema, com contexto e números citados.

COMBINADOS
• o que cada um vai fazer, com prazo quando houver.

FEEDBACK
• feedbacks dados ou recebidos. Omita a seção se não houver.` : `Formato da "ata" (texto puro, sem markdown, seções separadas por linha em branco, itens começando com "• "):
RESUMO
2 a 4 frases com o objetivo da reunião e o principal resultado.

DECISÕES
• cada decisão tomada, com o responsável quando houver.

PONTOS DISCUTIDOS
• cada tema relevante, com contexto, argumentos e números citados (valores, percentuais, datas, metas).

PENDÊNCIAS E RISCOS
• o que ficou em aberto ou sem dono. Omita a seção se não houver.`}

O tamanho da ata deve acompanhar a reunião: reuniões longas pedem mais itens em PONTOS DISCUTIDOS.

Regras das demandas:
- "minha" = Lucas executa pessoalmente; "delegada" = outra pessoa executa.
- Extraia apenas tarefas concretas combinadas na reunião. Não transforme ideias soltas em tarefas.
- Se o responsável não estiver claro, use "lucas" e tipo "minha".
- Prioridade alta = urgente, bloqueante ou com prazo nos próximos dias.
- "prazo": só quando um prazo foi dito ("até sexta", "semana que vem", "dia 30", "amanhã"). Calcule a data a partir da data da reunião. Se nenhum prazo foi dito, use null — não invente.`;

    const userMsg = `Reunião: ${title || "Reunião"}
Participantes: ${participants || "time"}

Transcrição:
${transcript}`;

    const model = Deno.env.get("AI_MEETING_MODEL") || "gpt-6-sol";
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: 16000,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error(`ai-meeting ${model} ${openaiRes.status}: ${err}`);
      return json({ error: `OpenAI ${openaiRes.status}: ${err.slice(0, 300)}` }, 502);
    }

    const aiData = await openaiRes.json();
    const result = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

    // Prazo só passa se for data real entre a véspera da reunião e um ano depois
    const minDue = new Date(meetingDate + "T12:00:00Z"); minDue.setUTCDate(minDue.getUTCDate() - 1);
    const maxDue = new Date(meetingDate + "T12:00:00Z"); maxDue.setUTCDate(maxDue.getUTCDate() + 365);
    const validDue = (v: unknown) => {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(v + "T12:00:00Z");
      if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
      return d >= minDue && d <= maxDue ? v : null;
    };

    // Normaliza a saída para o frontend nunca receber campos fora do esperado
    const demandas = (Array.isArray(result.demandas) ? result.demandas : [])
      .filter((d: any) => d && d.titulo)
      .map((d: any) => ({
        titulo: String(d.titulo),
        responsavel: teamIds.includes(d.responsavel) ? d.responsavel : "lucas",
        prioridade: PRIORIDADES.includes(d.prioridade) ? d.prioridade : "media",
        tipo: TIPOS.includes(d.tipo) ? d.tipo : "delegada",
        prazo: validDue(d.prazo),
      }));

    return json({ ata: String(result.ata || ""), demandas, model });

  } catch (e) {
    console.error("ai-meeting error:", e);
    return json({ error: e.message }, 500);
  }
});
