// supabase/functions/cmd-ask/index.ts
// Agente "Perguntar" — responde perguntas com base nas reuniões, tarefas e plano do usuário
//
// Duas etapas (o front chama uma depois da outra para mostrar o progresso):
//   step "select" → a IA lê o catálogo (atas, notas, tarefas, plano) e escolhe as fontes
//   step "answer" → a IA lê as fontes escolhidas por completo e responde citando [n]
//
// Lê o banco com o JWT do próprio usuário: o RLS garante que só os dados dele entram.
// Modelo: secret ASK_MODEL (padrão gpt-6-sol)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MEETINGS = 8;
const MAX_TASKS = 40;
const PER_MEETING_CHARS = 80000;
const TOTAL_CHARS = 200000;
const CATALOG_ATA_CHARS = 1500;
const CATALOG_NOTES_CHARS = 1500;
const CATALOG_TRANSCRIPT_CHARS = 600;
const HISTORY_MESSAGES = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Atas e notas são HTML do editor de texto rico: vira texto puro com quebras de linha
function plain(html: unknown) {
  return String(html || "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + " […]" : s);
const todaySP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

type Data = Awaited<ReturnType<typeof loadData>>;

async function loadData(sb: SupabaseClient) {
  const [meetings, series, tasks, plans, goals, items, settings] = await Promise.all([
    sb.from("cmd_meetings").select("id,title,kind,meeting_date,attendees,participants,series_id,ata,notes,transcript").order("meeting_date"),
    sb.from("cmd_meeting_series").select("id,title"),
    sb.from("cmd_tasks").select("id,title,person,due_date,priority,tipo,context,done,notes,origin_id,plan_item_id,completed_at").order("created_at"),
    sb.from("cmd_plans").select("id,title,assigned_by,role,period_start,period_end,archived").order("period_start"),
    sb.from("cmd_plan_goals").select("id,plan_id,code,title,description,sort_order").order("sort_order"),
    sb.from("cmd_plan_items").select("id,goal_id,title,details,due_date,status,sort_order").order("sort_order"),
    sb.from("cmd_user_settings").select("people").limit(1),
  ]);
  const firstError = [meetings, series, tasks, plans, goals, items].find((r) => r.error)?.error;
  if (firstError) throw new Error("Erro ao ler o banco: " + firstError.message);

  const people: { id: string; name: string }[] = Array.isArray(settings.data?.[0]?.people) ? settings.data![0].people : [];
  const personName = (id: string) => people.find((p) => p.id === id)?.name || id || "—";
  const seriesName = new Map((series.data || []).map((s: any) => [s.id, s.title]));
  return {
    meetings: (meetings.data || []) as any[],
    tasks: (tasks.data || []) as any[],
    plans: ((plans.data || []) as any[]).filter((p) => !p.archived),
    goals: (goals.data || []) as any[],
    items: (items.data || []) as any[],
    personName, seriesName,
  };
}

function meetingHeader(d: Data, m: any) {
  const who = (m.attendees?.length ? m.attendees.join(", ") : m.participants) || "—";
  const serie = m.series_id && d.seriesName.get(m.series_id);
  return `${m.meeting_date || "sem data"} · ${m.kind === "oneone" ? "1:1" : "reunião"} · "${m.title || "Reunião"}" · participantes: ${who}${serie ? ` · série: ${serie}` : ""}`;
}

function taskLine(d: Data, t: any) {
  const status = t.done ? `concluída${t.completed_at ? " em " + String(t.completed_at).slice(0, 10) : ""}` : "aberta";
  const origem = t.origin_id ? ` · origem: reunião ${t.origin_id}` : t.context ? ` · origem: ${t.context}` : "";
  return `[tarefa ${t.id}] ${t.title} · resp: ${d.personName(t.person)} · prazo: ${t.due_date || "—"} · ${status}${origem}`;
}

function planText(d: Data, detailed: boolean) {
  if (!d.plans.length) return "";
  return d.plans.map((p) => {
    const goals = d.goals.filter((g) => g.plan_id === p.id).map((g) => {
      const items = d.items.filter((i) => i.goal_id === g.id).map((i) =>
        `    - [entregável ${i.id}] ${i.title} · prazo: ${i.due_date || "—"} · status: ${i.status}${detailed && i.details ? `\n      ${plain(i.details)}` : ""}`
      ).join("\n");
      return `  ${g.code ? g.code + " · " : ""}${g.title}${detailed && g.description ? `\n    ${plain(g.description)}` : ""}${items ? "\n" + items : ""}`;
    }).join("\n");
    return `[plano ${p.id}] ${p.title} · passado por: ${p.assigned_by || "—"} · ${p.period_start || "?"} a ${p.period_end || "?"}\n${goals}`;
  }).join("\n\n");
}

function catalog(d: Data) {
  const meetings = d.meetings.map((m) => {
    const ata = plain(m.ata), notes = plain(m.notes);
    const body = [
      ata ? `  ATA: ${cut(ata, CATALOG_ATA_CHARS)}` : "",
      notes ? `  NOTAS: ${cut(notes, CATALOG_NOTES_CHARS)}` : "",
      !ata && m.transcript ? `  INÍCIO DA TRANSCRIÇÃO: ${cut(String(m.transcript), CATALOG_TRANSCRIPT_CHARS)}` : "",
    ].filter(Boolean).join("\n");
    return `[reunião ${m.id}] ${meetingHeader(d, m)}\n${body || "  (sem ata, notas ou transcrição)"}`;
  }).join("\n\n");
  const tasks = d.tasks.map((t) => taskLine(d, t)).join("\n");
  const plan = planText(d, false);
  return `REUNIÕES (${d.meetings.length})\n${meetings}\n\nTAREFAS (${d.tasks.length})\n${tasks}${plan ? `\n\nPLANO\n${plan}` : ""}`;
}

function historyBlock(history: unknown) {
  const h = (Array.isArray(history) ? history : []).slice(-HISTORY_MESSAGES)
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m: any) => `${m.role === "user" ? "Lucas" : "Agente"}: ${cut(String(m.content), 2000)}`);
  return h.length ? `Conversa até agora:\n${h.join("\n")}\n\n` : "";
}

async function callModel(system: string, user: string, maxTokens: number) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OpenAI key not configured");
  const model = Deno.env.get("ASK_MODEL") || "gpt-6-sol";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_completion_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`cmd-ask ${model} ${res.status}: ${err}`);
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

const CONTEXT = `Você é o agente de consulta do CMD.CENTER, o painel de gestão do Lucas (Diretor Comercial da Saint Germain, marca brasileira de semijoias, relógios e óculos de sol, com vendas em site próprio, marketplaces, lives, quiosques e B2B).
Os dados vêm das reuniões dele (ata gerada por IA, anotações e transcrição automática), das tarefas e do plano trimestral.
As transcrições têm erros de reconhecimento de voz (palavras trocadas por outras de som parecido, ex.: "Sérgio Irmão" = Saint Germain, "coturamento" = faturamento). Interprete pelo contexto.`;

async function stepSelect(d: Data, question: string, history: unknown) {
  const system = `${CONTEXT}

Sua tarefa agora é só ESCOLHER as fontes que precisam ser lidas por completo para responder à pergunta. Não responda a pergunta.

Como escolher:
- Considere pessoas, temas, números e período citados. Se a pergunta fala de uma pessoa, priorize reuniões e 1:1 com ela, mas inclua outras reuniões em que o tema aparece.
- Prefira incluir uma reunião a mais do que deixar de fora a que tem a resposta. Máximo de ${MAX_MEETINGS} reuniões, das mais relevantes para as menos.
- Inclua tarefas relacionadas (máximo ${MAX_TASKS}) e marque usar_plano se metas ou entregáveis do plano ajudam a responder.
- Hoje é ${todaySP()}.

CATÁLOGO
${catalog(d)}

Responda APENAS com JSON:
{ "meeting_ids": ["..."], "task_ids": ["..."], "usar_plano": true|false, "busca": "o que você vai procurar nas fontes, em uma frase" }`;

  const r = await callModel(system, `${historyBlock(history)}Pergunta: ${question}`, 8000);
  const mIds = new Set(d.meetings.map((m) => m.id));
  const tIds = new Set(d.tasks.map((t) => String(t.id)));
  const ids = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x)))];
  const meeting_ids = ids(r.meeting_ids).filter((id) => mIds.has(id)).slice(0, MAX_MEETINGS);
  const task_ids = ids(r.task_ids).filter((id) => tIds.has(id)).slice(0, MAX_TASKS);
  return {
    meeting_ids, task_ids, usar_plano: !!r.usar_plano && d.plans.length > 0,
    busca: String(r.busca || ""),
    meetings: meeting_ids.map((id) => { const m = d.meetings.find((x) => x.id === id); return { id, title: m.title, date: m.meeting_date }; }),
  };
}

async function stepAnswer(d: Data, question: string, history: unknown, sel: any) {
  const mIds = new Set((Array.isArray(sel?.meeting_ids) ? sel.meeting_ids : []).map(String).slice(0, MAX_MEETINGS));
  const tIds = new Set((Array.isArray(sel?.task_ids) ? sel.task_ids : []).map(String).slice(0, MAX_TASKS));
  const usePlan = !!sel?.usar_plano;

  const chosen = d.meetings.filter((m) => mIds.has(m.id));   // já em ordem de data
  let budget = TOTAL_CHARS;
  const meetingsText = chosen.map((m) => {
    const parts = [
      plain(m.ata) && `ATA:\n${plain(m.ata)}`,
      plain(m.notes) && `ANOTAÇÕES DO LUCAS:\n${plain(m.notes)}`,
      m.transcript && `TRANSCRIÇÃO AUTOMÁTICA:\n${m.transcript}`,
    ].filter(Boolean).join("\n\n");
    const room = Math.max(0, Math.min(PER_MEETING_CHARS, budget));
    budget -= Math.min(parts.length, room);
    return `═══ [reunião ${m.id}] ${meetingHeader(d, m)}\n${room ? cut(parts, room) : "(conteúdo omitido por limite de tamanho)"}`;
  }).join("\n\n");
  const tasksText = d.tasks.filter((t) => tIds.has(String(t.id)))
    .map((t) => taskLine(d, t) + (t.notes ? `\n  notas: ${cut(plain(t.notes), 800)}` : "")).join("\n");
  const plan = usePlan ? planText(d, true) : "";
  const index = d.meetings.map((m) => `[reunião ${m.id}] ${meetingHeader(d, m)}`).join("\n");

  const system = `${CONTEXT}

Responda à pergunta do Lucas usando SOMENTE as fontes abaixo. Hoje é ${todaySP()}.

Como responder:
- Português do Brasil, direto, começando pela resposta. Use parágrafos curtos ou itens com "• ". Sem markdown (nada de **, #).
- Diga o que foi combinado, por quem, quando e com quais números (valores, percentuais, prazos).
- Separe o que foi DECIDIDO do que só foi discutido ou sugerido.
- Se o assunto mudou ao longo das reuniões, mostre a evolução por data.
- Cite cada afirmação com [n], onde n é o número da fonte na lista "fontes".
- Se as fontes não respondem, diga claramente que não encontrou e o que encontrou de mais próximo. Nunca invente.
- Para perguntas sobre as reuniões em si (quantas, quando, com quem), use o ÍNDICE.

ÍNDICE DE TODAS AS REUNIÕES
${index}

REUNIÕES SELECIONADAS
${meetingsText || "(nenhuma)"}
${tasksText ? `\nTAREFAS SELECIONADAS\n${tasksText}\n` : ""}${plan ? `\nPLANO\n${plan}\n` : ""}
Responda APENAS com JSON:
{
  "resposta": "texto com citações [1], [2]...",
  "fontes": [
    { "n": 1, "tipo": "reuniao|tarefa|plano", "id": "id entre colchetes na fonte", "trecho": "citação curta e literal (até 200 caracteres) que sustenta a resposta" }
  ]
}`;

  const r = await callModel(system, `${historyBlock(history)}Pergunta: ${question}`, 16000);

  // Só passam fontes que existem nos dados do usuário
  const fontes = (Array.isArray(r.fontes) ? r.fontes : []).map((f: any) => {
    const id = String(f?.id || ""), n = Number(f?.n);
    if (!Number.isFinite(n)) return null;
    const trecho = cut(String(f?.trecho || ""), 300);
    const m = d.meetings.find((x) => x.id === id);
    if (m) return { n, tipo: "meeting", id, titulo: m.title || "Reunião", data: m.meeting_date || "", trecho };
    const t = d.tasks.find((x) => String(x.id) === id);
    if (t) return { n, tipo: "task", id, titulo: t.title, data: t.due_date || "", trecho };
    const i = d.items.find((x) => x.id === id);
    if (i) return { n, tipo: "plan", id, titulo: i.title, data: i.due_date || "", trecho };
    const g = d.goals.find((x) => x.id === id) || d.plans.find((x) => x.id === id);
    if (g) return { n, tipo: "plan", id, titulo: g.title, data: "", trecho };
    return null;
  }).filter(Boolean);

  return { resposta: String(r.resposta || ""), fontes, consultadas: chosen.length };
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { step, question, history, selection } = await req.json();
    const q = String(question || "").trim().slice(0, 2000);
    if (!q) return json({ error: "question required" }, 400);

    const data = await loadData(supabase);
    if (step === "select") return json(await stepSelect(data, q, history));
    if (step === "answer") return json(await stepAnswer(data, q, history, selection));
    return json({ error: "step must be select or answer" }, 400);

  } catch (e) {
    console.error("cmd-ask error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, msg.startsWith("OpenAI") ? 502 : 500);
  }
});
