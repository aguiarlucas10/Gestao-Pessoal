// ══════════════════════════════════════════════
// REUNIÕES — lista, detalhe, gravação, ata e demandas → tarefas
// ══════════════════════════════════════════════
// Uma reunião é o objeto único da conversa: gravar, transcrever, gerar ata,
// revisar demandas e criar tarefas acontecem dentro dela. 1:1 = kind 'oneone'.
const MEETING_LIST_COLS='id,title,kind,person_id,meeting_date,status,attendees,demands_sent_at,started_at,duration_sec,created_at';
const DEFAULT_MEETING_TITLE='Nova reunião';

let allMeetings=[], reunSelected=null, reunKind='all';
let _meetingsLoaded=false;
const meetingDemands={};     // meetingId → demandas
let mtEditors=[];            // editores ricos da reunião aberta (flush ao sair)
let mtTranscriptTimer=null;
let aiBusy=null, creatingTasks=false;

function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
function stripHTML(h){ const d=document.createElement('div'); d.innerHTML=h||''; return (d.textContent||'').trim(); }
function initialsOf(name){ const w=String(name||'?').trim().split(/\s+/); return (w.length>1?w[0][0]+w[w.length-1][0]:w[0].slice(0,2)).toUpperCase(); }
function wordCount(t){ t=(t||'').trim(); return t?t.split(/\s+/).length:0; }

function meetingById(id){ return allMeetings.find(m=>m.id===id); }
function normMeeting(r){
  return { ...r, attendees:Array.isArray(r.attendees)?r.attendees:[], kind:r.kind||'meeting', status:r.status||'draft', _full:false };
}
function meetingTasks(id){ return tasks.filter(t=>t.originId===id); }
// Etiqueta "1:1" só quando o título ainda não diz isso
function showKindTag(m){ return m.kind==='oneone' && !/^\s*1:1\b/i.test(m.title||''); }
function originLabel(t){
  const m=t.originId && meetingById(t.originId);
  return m ? (m.title||'Reunião') : (t.context||'');
}
// Prazo padrão de uma demanda: uma semana depois da reunião, nunca no passado
function defaultDue(m){
  const d=isoDate(addDays(new Date((m.meeting_date||isoToday)+'T12:00:00'),7));
  return d<isoToday?isoToday:d;
}

// ── Carga ──
async function loadMeetingsIndex(){
  const { data, error }=await sb.from('cmd_meetings').select(MEETING_LIST_COLS)
    .order('meeting_date',{ascending:false}).order('created_at',{ascending:false});
  if(error){ toast('Erro ao carregar reuniões: '+esc(error.message),'error'); return; }
  allMeetings=(data||[]).map(normMeeting);
  _meetingsLoaded=true;
  renderMeetingsList();
  renderBoard();   // tags de origem usam o título vivo da reunião
}

async function fetchMeeting(id){
  const [mRes, dRes]=await Promise.all([
    sb.from('cmd_meetings').select('*').eq('id',id).single(),
    sb.from('cmd_meeting_demands').select('*').eq('meeting_id',id).order('sort_order').order('created_at')
  ]);
  if(mRes.error){ toast('Erro ao abrir reunião: '+esc(mRes.error.message),'error'); return false; }
  const m=meetingById(id);
  Object.assign(m, normMeeting(mRes.data), {_full:true});
  meetingDemands[id]=dRes.data||[];
  return true;
}

// ── Salvamento ──
async function saveMeetingField(id, patch){
  const m=meetingById(id); if(!m) return false;
  Object.assign(m, patch);
  m._pristine=false;
  if('attendees' in patch) patch={...patch, participants:patch.attendees.join(', ')};  // coluna antiga, mantida até a v10
  const { error }=await track(sb.from('cmd_meetings').update(patch).eq('id',id));
  if(error){ toast('Erro ao salvar reunião: '+esc(error.message),'error'); return false; }
  return true;
}

// Rascunho local da transcrição: sobrevive a recarregar/fechar a aba
const draftKey=id=>'cmd.transcript.'+id;
function saveTranscriptDraft(id, text){
  if(!id) return;
  try { localStorage.setItem(draftKey(id), JSON.stringify({text, at:Date.now()})); } catch(_){}
}
function readTranscriptDraft(id){
  try { return JSON.parse(localStorage.getItem(draftKey(id))||'null'); } catch(_){ return null; }
}
function clearTranscriptDraft(id){ try { localStorage.removeItem(draftKey(id)); } catch(_){} }

function currentTranscript(id){
  const ta=document.getElementById('mt-transcript');
  if(ta && ta.dataset.meeting===id) return ta.value;
  if(recActive(id)) return REC.text;
  return meetingById(id)?.transcript||'';
}
async function persistTranscript(id, text){
  const m=meetingById(id); if(!m) return;
  if(m.transcript===text){ clearTranscriptDraft(id); return; }
  const status=m.status==='processed'?'processed':(text.trim()?'recorded':'draft');
  const ok=await saveMeetingField(id,{transcript:text, status});
  if(ok && currentTranscript(id)===text) clearTranscriptDraft(id);
}
function setMeetingTranscript(id, text){
  const ta=document.getElementById('mt-transcript');
  if(ta && ta.dataset.meeting===id && ta.value!==text) ta.value=text;
  onTranscriptChanged(id, text);
}
function onTranscriptChanged(id, text){
  if(reunSelected!==id) return;
  const w=document.getElementById('mt-words');
  if(w){ const n=wordCount(text); w.textContent=n?`${n} palavra${n===1?'':'s'}`:''; }
  renderMeetingRecControls();
  renderAIState(meetingById(id));
}

async function flushMeetingEditors(){
  clearTimeout(mtTranscriptTimer); mtTranscriptTimer=null;
  const ta=document.getElementById('mt-transcript');
  const jobs=mtEditors.map(e=>e.flush());
  if(ta && !recActive(ta.dataset.meeting)) jobs.push(persistTranscript(ta.dataset.meeting, ta.value));
  await Promise.all(jobs);
}

// Ao sair: salva o que está aberto e apaga rascunho criado e nunca tocado
async function leaveMeeting(id){
  await flushMeetingEditors();
  const m=meetingById(id);
  if(!m || !m._pristine || recActive(id)) return;
  if((meetingDemands[id]||[]).length || meetingTasks(id).length) return;
  allMeetings=allMeetings.filter(x=>x.id!==id);
  if(reunSelected===id){ reunSelected=null; renderMeetingEmpty(); }
  renderMeetingsList();
  await track(sb.from('cmd_meetings').delete().eq('id',id));
}

// ── Criação ──
async function createMeeting({kind='meeting', person_id=null, title=DEFAULT_MEETING_TITLE, attendees=[]}={}){
  if(!_currentSession){ toast('Sessão expirada','error'); return null; }
  const row={ title, kind, person_id, attendees, participants:attendees.join(', '), meeting_date:isoToday,
              status:'draft', transcript:'', ata:'', notes:'', owner_id:_currentSession.user.id };
  const { data, error }=await track(sb.from('cmd_meetings').insert(row).select('*').single());
  if(error){ toast('Erro ao criar reunião: '+esc(error.message),'error'); return null; }
  const m={ ...normMeeting(data), _full:true, _pristine:true };
  meetingDemands[m.id]=[];
  allMeetings.unshift(m);
  return m;
}

async function newMeeting(){
  const m=await createMeeting();
  if(!m) return;
  if(currentView!=='reunioes') navTo('reunioes');
  await selectMeeting(m.id,{focusTitle:true});
}

// "Gravar agora": cria a reunião e já começa a gravar
async function recordNow(){
  if(REC.state!=='idle'){ openRecordingMeeting(); toast('Já existe uma gravação em andamento','info'); return; }
  const ctx=recPrimeAudio();
  const m=await createMeeting({title:`Reunião de ${formatDate(isoToday)}`});
  if(!m){ ctx?.close?.().catch(()=>{}); return; }
  if(currentView!=='reunioes') navTo('reunioes');
  await selectMeeting(m.id);
  await startRecording(m.id, ctx);
}

// Gravar a partir do 1:1 (até as sessões de 1:1 ganharem tela própria)
async function recordOneOnOne(pid){
  if(REC.state!=='idle'){ openRecordingMeeting(); toast('Já existe uma gravação em andamento','info'); return; }
  const ctx=recPrimeAudio();
  const p=person(pid);
  const m=await createMeeting({kind:'oneone', person_id:pid, title:'1:1 '+p.name, attendees:[p.name]});
  if(!m){ ctx?.close?.().catch(()=>{}); return; }
  navTo('reunioes');
  await selectMeeting(m.id);
  await startRecording(m.id, ctx);
}

function openMeeting(id){
  closePanel();
  if(currentView!=='reunioes') navTo('reunioes');
  selectMeeting(id);
}

// ── Lista ──
function setReunKind(k, el){
  reunKind=k;
  document.querySelectorAll('#reun-kind .seg-btn').forEach(b=>{ const on=b===el; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
  renderMeetingsList();
}

function meetingStatusLabel(m){
  if(recActive(m.id)) return REC.state==='recording'?'gravando agora':'finalizando transcrição';
  const n=meetingTasks(m.id).length;
  if(n) return `${n} tarefa${n===1?'':'s'}`;
  return {processed:'ata pronta', recorded:'transcrita', draft:'rascunho'}[m.status]||'';
}

function meetingCardHTML(m){
  const d=new Date((m.meeting_date||isoToday)+'T12:00:00');
  const day=String(d.getDate()).padStart(2,'0');
  const mon=d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
  const who=m.kind==='oneone' ? person(m.person_id).name : (m.attendees.join(', ')||'Sem participantes');
  const st=meetingStatusLabel(m);
  const sel=reunSelected===m.id;
  return `<button class="reun-card ${sel?'active':''}" aria-current="${sel?'true':'false'}" onclick="selectMeeting('${m.id}')">
    <span class="reun-card-date"><span class="reun-card-day">${day}</span><span class="reun-card-mon">${esc(mon)}</span></span>
    <span class="reun-card-info">
      <span class="reun-card-title">${showKindTag(m)?'<span class="kind-tag">1:1</span>':''}${esc(m.title||'Reunião')}</span>
      <span class="reun-card-sub">${esc(who)}</span>
      ${st?`<span class="reun-card-status ${recActive(m.id)?'live':''}">${esc(st)}</span>`:''}
    </span>
  </button>`;
}

function renderMeetingsList(){
  const el=document.getElementById('reun-items');
  if(!el) return;
  if(!_meetingsLoaded){ el.innerHTML='<p class="list-empty">Carregando…</p>'; return; }
  const list=allMeetings.filter(m=>reunKind==='all'||m.kind===reunKind);
  if(!list.length){
    el.innerHTML=`<p class="list-empty">${reunKind==='oneone'?'Nenhum 1:1 gravado ainda.':'Nenhuma reunião ainda.'}<br>Use <strong>Gravar agora</strong> durante a conversa ou <strong>+</strong> para registrar depois.</p>`;
    return;
  }
  el.innerHTML=list.map(meetingCardHTML).join('');
}

function renderMeetingEmpty(){
  const root=document.getElementById('reun-main');
  if(!root) return;
  mtEditors=[];
  root.innerHTML=`<div class="reun-empty"><div class="empty-state">
    ${ICON.meeting}
    <p class="empty-title">Reuniões</p>
    <p class="empty-text">Escolha uma reunião à esquerda, ou comece agora: <strong>Gravar agora</strong> cria a reunião e já liga o microfone.</p>
  </div></div>`;
}

// ── Detalhe ──
async function selectMeeting(id,{focusTitle=false}={}){
  if(reunSelected && reunSelected!==id) await leaveMeeting(reunSelected);
  reunSelected=id;
  renderMeetingsList();
  const m=meetingById(id);
  if(!m){ renderMeetingEmpty(); return; }
  const root=document.getElementById('reun-main');
  if(!m._full){
    root.innerHTML='<div class="reun-empty"><p class="list-empty">Carregando…</p></div>';
    const ok=await fetchMeeting(id);
    if(!ok || reunSelected!==id) return;
  }
  renderMeetingDetail(root, m);
  renderRecUI();
  if(focusTitle){ const t=root.querySelector('#mt-title'); t?.focus(); t?.select(); }
}

function renderMeetingDetail(root, m){
  mtEditors.forEach(e=>e.flush());
  mtEditors=[];
  const transcript=recActive(m.id)?REC.text:(m.transcript||'');
  root.innerHTML=`
    <div class="mt-head">
      <div class="mt-head-main">
        ${showKindTag(m)?`<span class="kind-tag lg">1:1</span>`:''}
        <input class="mt-title" id="mt-title" value="${esc(m.title||'')}" placeholder="Título da reunião" aria-label="Título da reunião" maxlength="160">
      </div>
      <div class="mt-head-meta">
        <input type="date" class="mt-date" id="mt-date" value="${esc(m.meeting_date||isoToday)}" aria-label="Data da reunião">
        <div class="menu-wrap">
          <button class="icon-btn" id="mt-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="mt-menu" aria-label="Mais ações da reunião">${ICON.more}</button>
          <div class="menu" id="mt-menu" role="menu" hidden>
            <button role="menuitem" data-act="refine">Refazer transcrição do áudio</button>
            <button role="menuitem" data-act="clear">Limpar transcrição</button>
            <button role="menuitem" class="danger" data-act="delete">Excluir reunião…</button>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-body">
      <section class="mt-section" aria-labelledby="mt-h-people">
        <h2 class="mt-sec-title" id="mt-h-people">Participantes</h2>
        <div class="chips" id="mt-chips"></div>
      </section>

      <section class="mt-section" aria-labelledby="mt-h-trans">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="mt-h-trans">Transcrição</h2><span class="mt-count" id="mt-words"></span></div>
        <div id="mt-recover"></div>
        <div class="mt-rec" id="mt-rec"></div>
        <textarea class="mt-transcript" id="mt-transcript" data-meeting="${m.id}" placeholder="Grave a conversa ou cole aqui a transcrição…" aria-labelledby="mt-h-trans">${esc(transcript)}</textarea>
        <div class="mt-ai-row" id="mt-ai-row"></div>
      </section>

      <section class="mt-section" aria-labelledby="mt-h-ata">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="mt-h-ata">Ata</h2></div>
        <div id="mt-ata"></div>
      </section>

      <section class="mt-section" aria-labelledby="mt-h-dem">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="mt-h-dem">Demandas</h2><span class="mt-count" id="mt-dem-count"></span></div>
        <div id="mt-demands"></div>
      </section>

      <section class="mt-section" aria-labelledby="mt-h-tasks">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="mt-h-tasks">Tarefas desta reunião</h2></div>
        <div id="mt-tasks"></div>
      </section>

      <section class="mt-section" aria-labelledby="mt-h-notes">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="mt-h-notes">Anotações</h2></div>
        <div id="mt-notes"></div>
      </section>
    </div>`;

  wireMeetingHead(m);
  renderChips(m);
  wireTranscript(m);
  renderRecoverBanner(m);
  onTranscriptChanged(m.id, transcript);
  mtEditors.push(mountRTE(document.getElementById('mt-ata'),{
    html:m.ata, label:'Ata', minHeight:180,
    placeholder:'A ata aparece aqui depois de gerar com IA — ou escreva direto.',
    onSave:html=>saveMeetingField(m.id,{ata:html})
  }));
  mtEditors.push(mountRTE(document.getElementById('mt-notes'),{
    html:m.notes, label:'Anotações', minHeight:140,
    placeholder:'Anotações livres: contexto, impressões, o que não entrou na ata…',
    onSave:html=>saveMeetingField(m.id,{notes:html})
  }));
  renderDemands(m);
  renderMeetingTasks(m);
}

function wireMeetingHead(m){
  const title=document.getElementById('mt-title');
  const saveTitle=()=>{
    const v=title.value.trim();
    if(!v){ title.value=m.title||''; return; }
    if(v===m.title) return;
    saveMeetingField(m.id,{title:v}).then(()=>{ renderMeetingsList(); onTasksChanged(); });
    if(REC.meetingId===m.id){ REC.title=v; renderRecUI(); }
  };
  title.addEventListener('blur',saveTitle);
  title.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); title.blur(); } if(e.key==='Escape'){ e.stopPropagation(); title.value=m.title||''; title.blur(); } });

  const date=document.getElementById('mt-date');
  date.addEventListener('change',()=>{
    if(!date.value) return;
    saveMeetingField(m.id,{meeting_date:date.value}).then(()=>{
      allMeetings.sort((a,b)=>(b.meeting_date||'').localeCompare(a.meeting_date||''));
      renderMeetingsList(); renderDemands(m);
    });
  });

  const btn=document.getElementById('mt-menu-btn'), menu=document.getElementById('mt-menu');
  const close=()=>{ menu.hidden=true; btn.setAttribute('aria-expanded','false'); };
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    const open=menu.hidden;
    menu.hidden=!open; btn.setAttribute('aria-expanded',String(open));
    if(open) menu.querySelector('button')?.focus();
  });
  menu.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); close(); btn.focus(); } });
  menu.addEventListener('click',e=>{
    const act=e.target.closest('[data-act]')?.dataset.act; if(!act) return;
    close();
    if(act==='refine') refineTranscript(m.id);
    if(act==='clear') clearMeetingTranscript(m.id);
    if(act==='delete') deleteMeeting(m.id);
  });
}
document.addEventListener('click',e=>{
  const menu=document.getElementById('mt-menu');
  if(menu && !menu.hidden && !e.target.closest('.menu-wrap')){ menu.hidden=true; document.getElementById('mt-menu-btn')?.setAttribute('aria-expanded','false'); }
});

// ── Participantes ──
function renderChips(m){
  const el=document.getElementById('mt-chips'); if(!el) return;
  const chips=(m.attendees||[]).map((name,i)=>{
    const p=PEOPLE.find(x=>norm(x.name)===norm(name)) || {init:initialsOf(name), bg:'var(--s3)', color:'var(--t2)'};
    return `<span class="chip">${av(p,20)}<span class="chip-name">${esc(name)}</span><button type="button" class="chip-x" data-i="${i}" aria-label="Remover ${esc(name)}">${ICON.x}</button></span>`;
  }).join('');
  const suggestions=PEOPLE.filter(p=>!(m.attendees||[]).some(a=>norm(a)===norm(p.name)));
  el.innerHTML=chips+`<input class="chip-input" id="mt-chip-input" list="mt-people-list" autocomplete="off"
      placeholder="${m.attendees?.length?'Adicionar…':'Quem participou? Enter para adicionar'}" aria-label="Adicionar participante">
    <datalist id="mt-people-list">${suggestions.map(p=>`<option value="${esc(p.name)}"></option>`).join('')}</datalist>`;
  const input=el.querySelector('#mt-chip-input');
  const add=()=>{
    const names=input.value.split(/[,;]/).map(s=>s.trim()).filter(Boolean);
    if(!names.length) return;
    const next=[...(m.attendees||[])];
    names.forEach(n=>{ if(!next.some(a=>norm(a)===norm(n))) next.push(n); });
    saveMeetingField(m.id,{attendees:next}).then(renderMeetingsList);
    renderChips(m);
    document.getElementById('mt-chip-input')?.focus();
  };
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===','){ e.preventDefault(); add(); }
    else if(e.key==='Backspace' && !input.value && m.attendees?.length){
      saveMeetingField(m.id,{attendees:m.attendees.slice(0,-1)}).then(renderMeetingsList);
      renderChips(m); document.getElementById('mt-chip-input')?.focus();
    }
  });
  input.addEventListener('change',()=>{ if(suggestions.some(p=>p.name===input.value)) add(); });
  el.querySelectorAll('.chip-x').forEach(b=>b.addEventListener('click',()=>{
    const next=m.attendees.filter((_,i)=>i!==+b.dataset.i);
    saveMeetingField(m.id,{attendees:next}).then(renderMeetingsList);
    renderChips(m);
  }));
}

// ── Transcrição ──
function wireTranscript(m){
  const ta=document.getElementById('mt-transcript');
  ta.addEventListener('input',()=>{
    m._pristine=false;
    if(recActive(m.id)){ recUserEdit(ta.value); }
    else {
      saveTranscriptDraft(m.id, ta.value);
      clearTimeout(mtTranscriptTimer);
      mtTranscriptTimer=setTimeout(()=>persistTranscript(m.id, ta.value),1000);
    }
    onTranscriptChanged(m.id, ta.value);
  });
  ta.addEventListener('blur',()=>{ if(!recActive(m.id)){ clearTimeout(mtTranscriptTimer); persistTranscript(m.id, ta.value); } });
}

function renderRecoverBanner(m){
  const el=document.getElementById('mt-recover'); if(!el) return;
  const d=readTranscriptDraft(m.id);
  if(!d || recActive(m.id) || !d.text || d.text===(m.transcript||'') || wordCount(d.text)<=wordCount(m.transcript)){ el.innerHTML=''; return; }
  const at=new Date(d.at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  el.innerHTML=`<div class="banner" role="status">
    <span>Há um rascunho desta transcrição salvo neste navegador (${wordCount(d.text)} palavras, ${esc(at)}) com mais texto do que o salvo na nuvem.</span>
    <button type="button" class="btn-sm primary" id="mt-recover-yes">Recuperar</button>
    <button type="button" class="btn-sm" id="mt-recover-no">Descartar</button>
  </div>`;
  el.querySelector('#mt-recover-yes').addEventListener('click',()=>{ setMeetingTranscript(m.id, d.text); persistTranscript(m.id, d.text); el.innerHTML=''; });
  el.querySelector('#mt-recover-no').addEventListener('click',()=>{ clearTranscriptDraft(m.id); el.innerHTML=''; });
}

function clearMeetingTranscript(id){
  if(recActive(id)){ toast('Pare a gravação antes de limpar','error'); return; }
  const prev=currentTranscript(id);
  if(!prev.trim()){ toast('A transcrição já está vazia','info'); return; }
  setMeetingTranscript(id,'');
  persistTranscript(id,'');
  toast('Transcrição limpa','info',{label:'Desfazer',cb:()=>{ setMeetingTranscript(id,prev); persistTranscript(id,prev); }});
}

// Controles de gravação dentro da reunião aberta (o gravador chama a cada segundo:
// só reconstrói quando o modo muda; no resto, atualiza o relógio e o status)
function renderMeetingRecControls(){
  const el=document.getElementById('mt-rec'); if(!el) return;
  const id=reunSelected, mine=REC.meetingId===id;
  const ta=document.getElementById('mt-transcript');
  const mode=REC.state==='idle'?'idle':(mine?REC.state:'other');
  const sig=mode+(mode==='idle'?'|'+(ta&&ta.value.trim()?1:0):'');
  if(el.dataset.sig!==sig){
    el.dataset.sig=sig;
    if(mode==='recording'){
      el.innerHTML=`<button type="button" class="rec-btn recording" onclick="stopRecording()"><span class="rec-dot" aria-hidden="true"></span>Parar gravação</button>
        <span class="rec-timer" id="mt-rec-timer"></span><span class="mt-rec-status" id="mt-rec-status" aria-live="polite"></span>`;
    } else if(mode==='finalizing'){
      el.innerHTML=`<span class="spinner" aria-hidden="true"></span><span class="mt-rec-status" id="mt-rec-status" aria-live="polite"></span>`;
    } else if(mode==='other'){
      el.innerHTML=`<button type="button" class="rec-btn idle" disabled>${ICON.mic}Gravar</button>
        <span class="mt-hint">Outra reunião está sendo gravada — <button type="button" class="link-btn" onclick="openRecordingMeeting()">abrir</button></span>`;
    } else {
      el.innerHTML=`<button type="button" class="rec-btn idle" id="mt-rec-start">${ICON.mic}${ta&&ta.value.trim()?'Continuar gravando':'Gravar'}</button>
        <span class="mt-hint">O texto aparece a cada pausa de fala. Ao parar, o áudio inteiro é transcrito de novo com mais precisão.</span>`;
      el.querySelector('#mt-rec-start').addEventListener('click',()=>{ const ctx=recPrimeAudio(); startRecording(id, ctx); });
    }
    if(ta) ta.classList.toggle('live', mode==='recording');
    if(id) renderAIState(meetingById(id));
  }
  if(mode==='recording') document.getElementById('mt-rec-timer').textContent=fmtClock(REC.seconds);
  if(mode==='recording'||mode==='finalizing') document.getElementById('mt-rec-status').textContent=REC.status;
}

// ── Ata com IA ──
function renderAIState(m){
  const row=document.getElementById('mt-ai-row'); if(!row || !m) return;
  const busy=aiBusy===m.id;
  const hasText=!!currentTranscript(m.id).trim();
  const blocked=recActive(m.id);
  const sig=[busy,hasText,blocked,!!m.ata].join('|');
  if(row.dataset.sig===sig) return;
  row.dataset.sig=sig;
  const label=busy?'Gerando ata…':(m.ata?'Gerar ata de novo':'Gerar ata com IA');
  const hint=busy?'Lendo a transcrição e separando decisões e demandas — leva alguns segundos.'
    : blocked?'Disponível quando a gravação terminar.'
    : !hasText?'Precisa de transcrição: grave ou cole o texto acima.'
    : m.ata?'Substitui a ata atual (dá para desfazer). Demandas já enviadas ao board não mudam.'
    : 'Gera a ata e uma lista de demandas para você revisar antes de virar tarefa.';
  row.innerHTML=`<button type="button" class="btn-primary" id="mt-ai-btn" ${busy||blocked||!hasText?'disabled':''}>${busy?'<span class="spinner on-acc" aria-hidden="true"></span>':''}${label}</button><span class="mt-hint">${hint}</span>`;
  row.querySelector('#mt-ai-btn').addEventListener('click',()=>generateAI(m.id));
}

async function generateAI(mid){
  const m=meetingById(mid); if(!m || aiBusy) return;
  if(recActive(mid)){ toast('Pare a gravação antes de gerar a ata','error'); return; }
  const transcript=currentTranscript(mid).trim();
  if(!transcript){ toast('Grave ou cole a transcrição antes de gerar a ata','error'); return; }
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  if(currentView!=='reunioes'||reunSelected!==mid) openMeeting(mid);
  await flushMeetingEditors();
  aiBusy=mid; renderAIState(m);
  try {
    const res=await fetch(`${SB_URL}/functions/v1/ai-meeting`,{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+_currentSession.access_token, 'Content-Type':'application/json' },
      body:JSON.stringify({
        transcript, title:m.title||'Reunião', participants:(m.attendees||[]).join(', '),
        people:PEOPLE.map(p=>({ id:p.id, name:p.name, role:p.role||'' })),
        meeting_date:m.meeting_date||isoToday, kind:m.kind, person_id:m.person_id
      })
    });
    const result=await res.json().catch(()=>({}));
    if(!res.ok || result.error) throw new Error(result.error||('HTTP '+res.status));

    // Salva o que foi digitado durante a geração e solta os editores antigos:
    // um auto-save atrasado da ata velha não pode sobrescrever a nova
    await flushMeetingEditors();
    if(reunSelected===mid) mtEditors=[];
    const prevAta=m.ata||'';
    if(!await saveMeetingField(mid,{ata:String(result.ata||''), status:'processed'})) throw new Error('não foi possível salvar a ata');

    // Substitui só as demandas que ainda não viraram tarefa
    const existing=meetingDemands[mid]||[];
    const sent=existing.filter(d=>d.added);
    const sentTitles=new Set(sent.map(d=>norm(d.title)));
    const stale=existing.filter(d=>!d.added).map(d=>d.id);
    if(stale.length) await track(sb.from('cmd_meeting_demands').delete().in('id',stale));
    const fresh=(result.demandas||[]).filter(d=>d && d.titulo && !sentTitles.has(norm(d.titulo))).map((d,i)=>{
      const who=d.responsavel||ME_ID;
      return { meeting_id:mid, title:String(d.titulo), person:who, tipo:who===ME_ID?'minha':'delegada',
               priority:d.prioridade||'media', due_date:d.prazo||null, included:true, added:false,
               sort_order:i, owner_id:_currentSession.user.id };
    });
    let inserted=[];
    if(fresh.length){
      const { data, error }=await track(sb.from('cmd_meeting_demands').insert(fresh).select('*'));
      if(error) throw new Error(error.message);
      inserted=data||[];
    }
    meetingDemands[mid]=[...sent, ...inserted];
    aiBusy=null;
    if(reunSelected===mid) renderMeetingDetail(document.getElementById('reun-main'), m);
    renderMeetingsList();
    const n=inserted.length;
    toast(`Ata gerada · ${n?`${n} demanda${n===1?'':'s'} para revisar`:'nenhuma demanda nova'}`,'success',
      prevAta?{label:'Desfazer ata',cb:()=>restoreAta(mid,prevAta)}:null);
    if(n) document.getElementById('mt-demands')?.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e){
    aiBusy=null; renderAIState(m);
    toast('Erro ao gerar a ata: '+esc(e.message),'error');
  }
}

async function restoreAta(mid, html){
  const m=meetingById(mid); if(!m) return;
  await flushMeetingEditors();
  if(reunSelected===mid) mtEditors=[];
  await saveMeetingField(mid,{ata:html});
  if(reunSelected===mid) renderMeetingDetail(document.getElementById('reun-main'), m);
}

// ── Demandas: revisar e criar tarefas ──
function demandPeopleOptions(sel){
  return assignablePeople().map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('')
    + (sel && !assignablePeople().some(p=>p.id===sel) ? `<option value="${esc(sel)}" selected>Sem pessoa</option>` : '');
}

function renderDemands(m){
  const wrap=document.getElementById('mt-demands'); if(!wrap) return;
  const ds=meetingDemands[m.id]||[];
  const pending=ds.filter(d=>!d.added), sent=ds.filter(d=>d.added);
  const toCreate=pending.filter(d=>d.included && (d.title||'').trim());
  const cnt=document.getElementById('mt-dem-count');
  if(cnt) cnt.textContent=ds.length?`${sent.length} de ${ds.length} no board`:'';
  if(!ds.length){
    wrap.innerHTML=`<p class="mt-empty">${m.status==='processed'?'A IA não encontrou tarefas combinadas nesta conversa.':'Depois de gerar a ata, as tarefas combinadas aparecem aqui para você revisar antes de irem para o board.'}</p>`;
    return;
  }
  const prio=(v)=>['alta','media','baixa'].map(p=>`<option value="${p}" ${v===p?'selected':''}>${p==='media'?'Média':p[0].toUpperCase()+p.slice(1)}</option>`).join('');
  const rows=pending.map(d=>`
    <div class="dem-row ${d.included?'':'off'}" data-id="${d.id}">
      <input type="checkbox" class="dem-inc" data-f="included" ${d.included?'checked':''} aria-label="Criar tarefa: ${esc(d.title)}">
      <input class="dem-title" data-f="title" value="${esc(d.title)}" aria-label="Título da tarefa">
      <select class="dem-sel" data-f="person" aria-label="Quem faz">${demandPeopleOptions(d.person)}</select>
      <select class="dem-sel" data-f="priority" aria-label="Prioridade">${prio(d.priority||'media')}</select>
      <input type="date" class="dem-date" data-f="due_date" value="${esc(d.due_date||defaultDue(m))}" aria-label="Prazo">
    </div>`).join('');
  const sentRows=sent.map(d=>{
    const t=d.task_id && tasks.find(x=>x.id===d.task_id);
    const p=person(t?t.person:d.person);
    return `<div class="dem-row sent">
      <span class="dem-ok" aria-hidden="true">${ICON.check}</span>
      ${t?`<button type="button" class="dem-title-static" onclick="openPanel('${t.id}')">${esc(t.title)}</button>`:`<span class="dem-title-static">${esc(d.title)}</span>`}
      <span class="dem-meta">${esc(p.name)}${t?` · ${formatDate(t.dueDate)}`:''}</span>
      <span class="tag ${t?(t.done?'done':'dt'):'dt'}">${t?(t.done?'concluída':'no board'):'tarefa excluída'}</span>
    </div>`;
  }).join('');
  wrap.innerHTML=`
    ${pending.length?`<div class="dem-list">${rows}</div>
    <div class="dem-foot">
      <button type="button" class="btn-primary" id="dem-create" ${toCreate.length&&!creatingTasks?'':'disabled'}>${creatingTasks?'Criando…':`Criar ${toCreate.length} tarefa${toCreate.length===1?'':'s'}`}</button>
      <span class="mt-hint">Desmarque o que não vira tarefa e ajuste quem faz e o prazo.</span>
    </div>`:''}
    ${sent.length?`<div class="dem-list sent">${sentRows}</div>`:''}`;

  const timers={};
  wrap.querySelectorAll('.dem-row[data-id]').forEach(row=>{
    const id=row.dataset.id;
    row.querySelectorAll('[data-f]').forEach(inp=>{
      const f=inp.dataset.f;
      const handler=()=>{
        const v=f==='included'?inp.checked:inp.value;
        setDemandField(m.id,id,f,v,timers);
        if(f==='included'){ row.classList.toggle('off',!v); updateCreateButton(m); }
        if(f==='title') updateCreateButton(m);
      };
      inp.addEventListener(f==='title'?'input':'change',handler);
    });
  });
  wrap.querySelector('#dem-create')?.addEventListener('click',()=>createTasksFromDemands(m.id));
}

function updateCreateButton(m){
  const btn=document.getElementById('dem-create'); if(!btn) return;
  const n=(meetingDemands[m.id]||[]).filter(d=>!d.added && d.included && (d.title||'').trim()).length;
  btn.disabled=!n||creatingTasks;
  btn.textContent=`Criar ${n} tarefa${n===1?'':'s'}`;
}

function setDemandField(mid, did, field, value, timers){
  const d=(meetingDemands[mid]||[]).find(x=>x.id===did);
  if(!d || d.added) return;
  d[field]=value;
  const patch={[field]:value};
  if(field==='person'){ d.tipo=value===ME_ID?'minha':'delegada'; patch.tipo=d.tipo; }
  const m=meetingById(mid); if(m) m._pristine=false;
  const key=did+field;
  clearTimeout(timers[key]);
  timers[key]=setTimeout(async()=>{
    const { error }=await track(sb.from('cmd_meeting_demands').update(patch).eq('id',did));
    if(error) toast('Erro ao salvar demanda: '+esc(error.message),'error');
  }, field==='title'?600:0);
}

async function createTasksFromDemands(mid){
  if(creatingTasks) return;
  const m=meetingById(mid); if(!m || !_currentSession) return;
  const ds=(meetingDemands[mid]||[]).filter(d=>!d.added && d.included && (d.title||'').trim());
  if(!ds.length) return;
  creatingTasks=true; renderDemands(m);
  // id da tarefa = id da demanda: clique duplo ou repetição nunca duplicam
  const rows=ds.map(d=>({
    id:d.id, title:d.title.trim(), person:d.person||ME_ID, due_date:d.due_date||defaultDue(m),
    priority:d.priority||'media', tipo:d.tipo||(d.person===ME_ID?'minha':'delegada'),
    context:m.title||'Reunião', done:false, notes:'', recurrence:null,
    origin_type:m.kind==='oneone'?'oneone':'meeting', origin_id:m.id, owner_id:_currentSession.user.id
  }));
  const { error }=await track(sb.from('cmd_tasks').upsert(rows,{onConflict:'id',ignoreDuplicates:true}));
  if(error){ creatingTasks=false; renderDemands(m); toast('Erro ao criar tarefas: '+esc(error.message),'error'); return; }
  const ids=ds.map(d=>d.id);
  await Promise.all(ds.map(d=>track(sb.from('cmd_meeting_demands').update({added:true, task_id:d.id}).eq('id',d.id))));
  ds.forEach(d=>{ d.added=true; d.task_id=d.id; });
  await saveMeetingField(mid,{demands_sent_at:new Date().toISOString()});
  rows.forEach(r=>{ if(!tasks.some(t=>t.id===r.id)) tasks.unshift(dbToTask(r)); });
  creatingTasks=false;
  onTasksChanged();
  checkNotifications();
  renderMeetingsList();
  const n=ids.length;
  toast(`${n} tarefa${n===1?'':'s'} no board`,'success',{label:'Desfazer',cb:()=>undoCreateTasks(mid,ids)});
}

async function undoCreateTasks(mid, ids){
  const m=meetingById(mid);
  tasks=tasks.filter(t=>!ids.includes(t.id));
  (meetingDemands[mid]||[]).forEach(d=>{ if(ids.includes(d.id)){ d.added=false; d.task_id=null; } });
  onTasksChanged();
  await track(sb.from('cmd_tasks').delete().in('id',ids));   // FK zera task_id nas demandas
  await track(sb.from('cmd_meeting_demands').update({added:false, task_id:null}).in('id',ids));
  if(m && !(meetingDemands[mid]||[]).some(d=>d.added)) saveMeetingField(mid,{demands_sent_at:null});
  renderMeetingsList();
}

// ── Tarefas vinculadas ──
function renderMeetingTasks(m){
  const el=document.getElementById('mt-tasks'); if(!el) return;
  const ts=meetingTasks(m.id).sort((a,b)=>(a.done-b.done)||sortByDateThenPri(a,b));
  el.innerHTML=ts.length ? `<div class="mt-task-list">${ts.map(t=>{
    const p=person(t.person);
    return `<div class="mt-task ${t.done?'done':''}">
      <button type="button" class="card-check ${t.done?'done':''}" aria-label="${t.done?'Marcar como não feita':'Marcar como concluída'}: ${esc(t.title)}" onclick="toggleDone('${t.id}')">${t.done?ICON.checkSm:''}</button>
      <button type="button" class="mt-task-title" onclick="openPanel('${t.id}')">${esc(t.title)}</button>
      <span class="mt-task-meta">${av(p,16)}<span>${esc(p.name)}</span><span class="tag dt ${!t.done&&isOverdue(t.dueDate)?'overdue':''}">${formatDate(t.dueDate)}</span></span>
    </div>`;
  }).join('')}</div>` : `<p class="mt-empty">Nenhuma tarefa ainda. As demandas que você criar aparecem aqui, e seguem ligadas a esta reunião mesmo se ela mudar de nome.</p>`;
}

function refreshOpenMeeting(){
  if(currentView!=='reunioes' || !reunSelected) return;
  const m=meetingById(reunSelected); if(!m || !m._full) return;
  renderMeetingTasks(m);
  renderDemands(m);
}

// ── Excluir (irreversível no banco → alertdialog) ──
function deleteMeeting(id){
  const m=meetingById(id);
  if(!m) return;
  if(recActive(id)){ toast('Pare a gravação antes de excluir','error'); return; }
  const linked=meetingTasks(id).length;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="del-meeting-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" role="alertdialog" aria-modal="true" aria-labelledby="del-meeting-title" aria-describedby="del-meeting-msg">
        <h3 id="del-meeting-title">Excluir reunião?</h3>
        <p id="del-meeting-msg" class="modal-msg">A reunião <strong>${esc(m.title||'sem título')}</strong>, a transcrição, a ata e as demandas serão apagadas. ${linked?`As ${linked} tarefa${linked===1?'':'s'} criada${linked===1?'':'s'} a partir dela continua${linked===1?'':'m'} no board.`:''} Não dá para desfazer.</p>
        <div class="oo-modal-btns">
          <button class="btn-sm" type="button" id="del-meeting-cancel">Cancelar</button>
          <button class="btn-sm danger" type="button" id="del-meeting-confirm">Excluir</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('del-meeting-modal');
  const cancel=modal.querySelector('#del-meeting-cancel');
  cancel.addEventListener('click',()=>modal.remove());
  cancel.focus();
  modal.querySelector('#del-meeting-confirm').addEventListener('click',async()=>{
    modal.remove();
    mtEditors=[];   // não salvar por cima de algo que está sendo apagado
    const { error }=await track(sb.from('cmd_meetings').delete().eq('id',id));   // demandas vão junto (CASCADE)
    if(error){ toast('Erro ao excluir: '+esc(error.message),'error'); return; }
    allMeetings=allMeetings.filter(x=>x.id!==id);
    delete meetingDemands[id];
    clearTranscriptDraft(id);
    if(reunSelected===id){ reunSelected=null; renderMeetingEmpty(); }
    renderMeetingsList();
    onTasksChanged();
    toast('Reunião excluída');
  });
}
