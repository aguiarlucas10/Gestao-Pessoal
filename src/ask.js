// ══════════════════════════════════════════════
// PERGUNTAR — agente que responde com base nas reuniões, tarefas e plano
// ══════════════════════════════════════════════
// Painel lateral (botão no topo ou Ctrl/⌘+K). A Edge Function cmd-ask roda em duas
// etapas: "select" escolhe as fontes, "answer" lê e responde citando [n].
// Conversas ficam em cmd_ask_threads / cmd_ask_messages (migration v11). Sem a
// migration, o painel funciona do mesmo jeito, só não salva.

let askThreads=[], askThreadId=null, askMessages=[];
let askBusy=false, askLoaded=false, askDbOk=true, askPending='';
let askHistOpen=false, askDelPending=null;   // lista de conversas aberta / conversa aguardando confirmação

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
  closeAskHist();
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

// "hoje 14:32", "ontem 09:10" ou "28 out."
function askWhen(iso){
  const d=new Date(iso); if(isNaN(d)) return '';
  const day=isoDate(d), hm=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if(day===isoDate(new Date())) return 'hoje '+hm;
  if(day===isoDate(addDays(new Date(),-1))) return 'ontem '+hm;
  return formatDate(day);
}

const ASK_TRASH='<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderAskThreads(){
  const btn=document.getElementById('ask-hist-btn'); if(!btn) return;
  const has=askDbOk && askThreads.length>0;
  btn.hidden=!has;
  document.getElementById('ask-hist-count').textContent=askThreads.length||'';
  if(!has) closeAskHist();
  const list=document.getElementById('ask-hist-list'); if(!list) return;
  list.innerHTML=askThreads.map(t=>{
    const title=esc(t.title||'Sem título');
    if(askDelPending===t.id) return `<li class="ask-hist-row confirm" role="group" aria-label="Confirmar exclusão">
      <span class="ask-hist-q">Apagar “${title}”?</span>
      <span class="ask-hist-actions">
        <button type="button" class="btn-sm" onclick="askCancelDelete()">Cancelar</button>
        <button type="button" class="btn-sm danger" id="ask-del-confirm" onclick="askDeleteThread('${t.id}')">Apagar</button>
      </span>
    </li>`;
    return `<li class="ask-hist-row ${t.id===askThreadId?'active':''}">
      <button type="button" class="ask-hist-open" onclick="selectAskThread('${t.id}')" ${t.id===askThreadId?'aria-current="true"':''}>
        <span class="ask-hist-title">${title}</span>
        <span class="ask-hist-date">${esc(askWhen(t.updated_at))}</span>
      </button>
      <button type="button" class="ask-hist-del" onclick="askConfirmDelete('${t.id}')" aria-label="Apagar conversa: ${title}" title="Apagar conversa">${ASK_TRASH}</button>
    </li>`;
  }).join('');
}

function toggleAskHist(){ askHistOpen ? closeAskHist() : openAskHist(); }
function openAskHist(){
  askHistOpen=true; askDelPending=null;
  renderAskThreads();
  document.getElementById('ask-hist').hidden=false;
  document.getElementById('ask-hist-btn').setAttribute('aria-expanded','true');
  document.querySelector('#ask-hist-list .ask-hist-open')?.focus();
}
function closeAskHist(){
  if(!askHistOpen) return;
  askHistOpen=false; askDelPending=null;
  const pop=document.getElementById('ask-hist'); if(pop) pop.hidden=true;
  document.getElementById('ask-hist-btn')?.setAttribute('aria-expanded','false');
}

function askConfirmDelete(id){
  askDelPending=id; renderAskThreads();
  document.getElementById('ask-del-confirm')?.focus();
}
function askCancelDelete(){
  const id=askDelPending; askDelPending=null; renderAskThreads();
  document.querySelector(`#ask-hist-list .ask-hist-del[onclick*="${id}"]`)?.focus();
}
async function askDeleteThread(id){
  if(askBusy && id===askThreadId){ toast('Aguarde a resposta terminar','error'); return; }
  const { error }=await track(sb.from('cmd_ask_threads').delete().eq('id',id));   // mensagens vão junto (cascade)
  if(error){ toast('Erro ao apagar a conversa: '+esc(error.message),'error'); return; }
  askThreads=askThreads.filter(t=>t.id!==id);
  askDelPending=null;
  if(askThreadId===id){ askThreadId=null; askMessages=[]; renderAsk(); }
  renderAskThreads();
  if(askThreads.length) document.querySelector('#ask-hist-list .ask-hist-open')?.focus();
  else document.getElementById('ask-input')?.focus();
  toast('Conversa apagada');
}

async function selectAskThread(id){
  if(askBusy) return;
  closeAskHist();
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
  closeAskHist();
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
  // Lista de conversas: Esc fecha só a lista (não o painel); clique fora também fecha
  document.getElementById('ask-hist')?.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    e.stopPropagation();
    if(askDelPending){ askCancelDelete(); return; }
    closeAskHist(); document.getElementById('ask-hist-btn')?.focus();
  });
});
document.addEventListener('click',e=>{
  // composedPath: a lixeira/confirmação redesenham a lista, então o alvo pode já ter saído do DOM
  if(askHistOpen && !e.composedPath().some(el=>el.id==='ask-hist' || el.id==='ask-hist-btn')) closeAskHist();
});
