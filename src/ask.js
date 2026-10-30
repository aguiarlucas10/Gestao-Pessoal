// ══════════════════════════════════════════════
// PERGUNTAR — agente que responde com base nas reuniões, tarefas e plano
// ══════════════════════════════════════════════
// Painel lateral (botão no topo ou Ctrl/⌘+K). A Edge Function cmd-ask roda em duas
// etapas: "select" escolhe as fontes, "answer" lê e responde citando [n].
// Conversas ficam em cmd_ask_threads / cmd_ask_messages (migration v11). Sem a
// migration, o painel funciona do mesmo jeito, só não salva.

let askThreads=[], askThreadId=null, askMessages=[];
let askBusy=false, askLoaded=false, askDbOk=true, askPending='';

const ASK_EXAMPLES=[
  'O que combinei com o Junior sobre a meta de faturamento dos quiosques?',
  'Quais decisões tomamos sobre criativos nas últimas reuniões?',
  'Quais tarefas delegadas ao time estão atrasadas?',
];

function askPanel(){ return document.getElementById('ask-panel'); }
function askIsOpen(){ return !askPanel()?.hidden; }

async function openAsk(){
  const p=askPanel(); if(!p) return;
  p.hidden=false;
  document.getElementById('ask-btn')?.setAttribute('aria-expanded','true');
  if(!askLoaded){ askLoaded=true; await loadAskThreads(); }
  renderAsk();
  document.getElementById('ask-input')?.focus();
}
function closeAsk(){
  const p=askPanel(); if(!p) return;
  p.hidden=true;
  const btn=document.getElementById('ask-btn');
  btn?.setAttribute('aria-expanded','false');
  btn?.focus();
}
function toggleAsk(){ askIsOpen() ? closeAsk() : openAsk(); }

// ── Conversas salvas ──
async function loadAskThreads(){
  const { data, error }=await sb.from('cmd_ask_threads').select('id,title,updated_at').order('updated_at',{ascending:false}).limit(50);
  if(error){ askDbOk=false; console.warn('cmd_ask_threads indisponível (migration v11?)',error.message); askThreads=[]; }
  else { askDbOk=true; askThreads=data||[]; }
  renderAskThreads();
}

function renderAskThreads(){
  const sel=document.getElementById('ask-threads'); if(!sel) return;
  sel.hidden=!askDbOk || !askThreads.length;
  sel.innerHTML=`<option value="">${askThreadId?'Conversas anteriores':'Nova conversa'}</option>`
    + askThreads.map(t=>`<option value="${t.id}" ${t.id===askThreadId?'selected':''}>${esc(t.title||'Sem título')} · ${esc(formatDate(String(t.updated_at).slice(0,10)))}</option>`).join('');
}

async function selectAskThread(id){
  if(askBusy) return;
  if(!id){ askNewThread(); return; }
  const { data, error }=await sb.from('cmd_ask_messages').select('role,content,sources,created_at').eq('thread_id',id).order('created_at');
  if(error){ toast('Erro ao abrir a conversa: '+esc(error.message),'error'); return; }
  askThreadId=id;
  askMessages=(data||[]).map(m=>({ role:m.role, content:m.content, sources:Array.isArray(m.sources)?m.sources:[] }));
  renderAskThreads(); renderAsk();
  document.getElementById('ask-input')?.focus();
}

function askNewThread(){
  if(askBusy) return;
  askThreadId=null; askMessages=[];
  renderAskThreads(); renderAsk();
  document.getElementById('ask-input')?.focus();
}

async function askSaveMessage(msg){
  if(!askDbOk || !_currentSession) return;
  if(!askThreadId){
    const row={ id:crypto.randomUUID(), owner_id:_currentSession.user.id, title:msg.content.slice(0,80) };
    const { error }=await track(sb.from('cmd_ask_threads').insert(row));
    if(error){ askDbOk=false; console.warn('não salvou a conversa',error.message); return; }
    askThreadId=row.id;
    askThreads.unshift({ ...row, updated_at:new Date().toISOString() });
  }
  const { error }=await track(sb.from('cmd_ask_messages').insert({
    thread_id:askThreadId, owner_id:_currentSession.user.id, role:msg.role, content:msg.content, sources:msg.sources||[]
  }));
  if(error){ console.warn('não salvou a mensagem',error.message); return; }
  // Sobe a conversa para o topo da lista (o trigger atualiza updated_at)
  const t=askThreads.find(x=>x.id===askThreadId);
  if(t){
    sb.from('cmd_ask_threads').update({ title:t.title }).eq('id',askThreadId).then(()=>{});
    t.updated_at=new Date().toISOString();
    askThreads=[t, ...askThreads.filter(x=>x!==t)];
  }
  renderAskThreads();
}

// ── Pergunta → resposta ──
async function callAsk(body){
  if(!_currentSession) throw new Error('Sessão expirada');
  const res=await fetch(`${SB_URL}/functions/v1/cmd-ask`,{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+_currentSession.access_token, 'Content-Type':'application/json' },
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok || data.error) throw new Error(data.error||('HTTP '+res.status));
  return data;
}

async function sendAsk(text){
  const input=document.getElementById('ask-input');
  const question=(text ?? input?.value ?? '').trim();
  if(!question || askBusy) return;
  if(input) input.value='';
  const userMsg={ role:'user', content:question };
  askMessages.push(userMsg);
  askSaveMessage(userMsg);
  await runAsk(question);
}

// Roda as duas etapas para a última pergunta da conversa (askMessages termina nela)
async function runAsk(question){
  const history=askMessages.slice(0,-1).filter(m=>!m.error).slice(-6).map(m=>({ role:m.role, content:m.content }));
  askBusy=true; askPending='Procurando nas reuniões, tarefas e no plano…';
  renderAsk();
  try {
    const selection=await callAsk({ step:'select', question, history });
    const n=selection.meetings?.length||0;
    askPending=n
      ? `Lendo ${plural(n,'reunião','reuniões')}: ${selection.meetings.slice(0,3).map(m=>`${m.title} (${formatDate(m.date)})`).join(', ')}${n>3?'…':''}`
      : 'Montando a resposta…';
    renderAsk();
    const r=await callAsk({ step:'answer', question, history, selection });
    const msg={ role:'assistant', content:r.resposta||'Não consegui montar uma resposta.', sources:r.fontes||[] };
    askMessages.push(msg);
    askSaveMessage(msg);
  } catch(e){
    askMessages.push({ role:'assistant', content:e.message, error:true, retry:question });
  } finally {
    askBusy=false; askPending='';
    renderAsk();
    document.getElementById('ask-input')?.focus();
  }
}

function retryAsk(i){
  const m=askMessages[i]; if(!m?.retry || askBusy) return;
  askMessages.splice(i,1);   // tira só o erro: a pergunta já está na conversa (e salva)
  runAsk(m.retry);
}

// ── Render ──
// Texto da IA: escapa tudo e só então transforma [n] em botão para a fonte
function askAnswerHTML(msg, mi){
  const nums=new Set((msg.sources||[]).map(s=>Number(s.n)));
  return esc(msg.content).split(/\n{2,}/).map(par=>`<p>${par.replace(/\n/g,'<br>').replace(/\[(\d+)\]/g,(all,n)=>
    nums.has(Number(n)) ? `<button type="button" class="ask-cite" onclick="openAskSource(${mi},${n})" aria-label="Abrir fonte ${n}">${n}</button>` : all
  )}</p>`).join('');
}

const ASK_SRC_LABEL={ meeting:'Reunião', task:'Tarefa', plan:'Plano' };
function askSourcesHTML(msg, mi){
  const src=[...(msg.sources||[])].sort((a,b)=>a.n-b.n);
  if(!src.length) return '';
  return `<div class="ask-sources"><div class="ask-sources-label">Fontes</div>${src.map(s=>`
    <button type="button" class="ask-src" onclick="openAskSource(${mi},${Number(s.n)})">
      <span class="ask-src-n">${Number(s.n)}</span>
      <span class="ask-src-body">
        <span class="ask-src-title"><span class="kind-tag">${ASK_SRC_LABEL[s.tipo]||'Fonte'}</span>${esc(s.titulo||'')}${s.data?` <span class="ask-src-date">${esc(formatDate(s.data))}</span>`:''}</span>
        ${s.trecho?`<span class="ask-src-quote">“${esc(s.trecho)}”</span>`:''}
      </span>
    </button>`).join('')}</div>`;
}

function renderAsk(){
  const log=document.getElementById('ask-log'); if(!log) return;
  const send=document.getElementById('ask-send');
  if(send){ send.disabled=askBusy; }
  if(!askMessages.length && !askBusy){
    log.innerHTML=`<div class="ask-empty">
      <p class="ask-empty-title">Pergunte sobre o que já foi conversado</p>
      <p class="mt-hint">Busco nas atas, anotações e transcrições das reuniões, nas tarefas e no Plano 90 dias, e respondo citando de onde veio cada informação.</p>
      <div class="ask-examples">${ASK_EXAMPLES.map(q=>`<button type="button" class="ask-example" onclick="sendAsk(this.textContent)">${esc(q)}</button>`).join('')}</div>
      ${askDbOk?'':'<p class="mt-hint ask-warn">As conversas não estão sendo salvas: falta rodar a migration v11 no Supabase.</p>'}
    </div>`;
    return;
  }
  log.innerHTML=askMessages.map((m,i)=>m.role==='user'
    ? `<div class="ask-msg user"><p>${esc(m.content).replace(/\n/g,'<br>')}</p></div>`
    : m.error
      ? `<div class="ask-msg error" role="alert"><p>Não consegui responder: ${esc(m.content)}</p><button type="button" class="btn-sm" onclick="retryAsk(${i})">Tentar de novo</button></div>`
      : `<div class="ask-msg answer">${askAnswerHTML(m,i)}${askSourcesHTML(m,i)}</div>`
  ).join('') + (askBusy?`<div class="ask-msg pending" role="status"><span class="spinner" aria-hidden="true"></span><span>${esc(askPending)}</span></div>`:'');
  log.scrollTop=log.scrollHeight;
}

function openAskSource(mi, n){
  const s=(askMessages[mi]?.sources||[]).find(x=>Number(x.n)===Number(n)); if(!s) return;
  if(window.matchMedia('(max-width: 768px)').matches) closeAsk();
  if(s.tipo==='meeting'){
    if(!meetingById(s.id)){ toast('Essa reunião não está mais na lista','error'); return; }
    openMeeting(s.id);
  } else if(s.tipo==='task'){
    if(!tasks.some(t=>t.id===s.id)){ toast('Essa tarefa não existe mais','error'); return; }
    openPanel(s.id);
  } else if(s.tipo==='plan'){
    navTo('plano');
  }
}

// ── Eventos ──
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey) && !e.altKey && e.key.toLowerCase()==='k'){
    if(document.getElementById('shell')?.style.display==='none') return;   // tela de login
    e.preventDefault();
    if(askIsOpen()) document.getElementById('ask-input')?.focus(); else openAsk();
  }
});
document.addEventListener('DOMContentLoaded',()=>{
  const input=document.getElementById('ask-input');
  input?.addEventListener('keydown',e=>{
    if(e.key==='Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); sendAsk(); }
  });
  document.getElementById('ask-form')?.addEventListener('submit',e=>{ e.preventDefault(); sendAsk(); });
  document.getElementById('ask-threads')?.addEventListener('change',e=>selectAskThread(e.target.value));
});
