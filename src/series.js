// ══════════════════════════════════════════════
// SÉRIES — reuniões recorrentes numa página só
// ══════════════════════════════════════════════
// Cada ocorrência continua sendo uma reunião normal (gravar, ata, demandas).
// A série junta as ocorrências: pauta da próxima, tarefas de todas elas e o
// histórico de resumos e decisões, lido das seções que a IA já escreve na ata.

let allSeries=[], seriesSelected=null, seriesSuggOpen=false, seriesHistQ='';
let seriesSuggCache=[];
const seriesAtas={};   // meetingId → ata (a lista de reuniões não traz a ata)

const CADENCES={ weekly:'Semanal', biweekly:'Quinzenal', monthly:'Mensal', none:'Sem cadência' };
const SERIES_ICON='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 6.5A5 5 0 0 0 4 4.5L2.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2.5 3v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 9.5a5 5 0 0 0 9 2l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13.5 13v-3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function normSeries(r){ return { ...r, attendees:Array.isArray(r.attendees)?r.attendees:[], agenda:Array.isArray(r.agenda)?r.agenda:[] }; }
function seriesById(id){ return allSeries.find(s=>s.id===id); }
function liveSeries(){ return allSeries.filter(s=>!s.archived); }
const byMeetingDateDesc=(a,b)=>(b.meeting_date||'').localeCompare(a.meeting_date||'')||String(b.created_at||'').localeCompare(String(a.created_at||''));
function seriesMeetings(sid){ return allMeetings.filter(m=>m.series_id===sid).sort(byMeetingDateDesc); }
function seriesTasks(sid){ const ids=new Set(seriesMeetings(sid).map(m=>m.id)); return tasks.filter(t=>t.originId && ids.has(t.originId)); }
// A reunião sai da lista quando a série dela aparece lá
function meetingInListedSeries(m){ return !!m.series_id && liveSeries().some(s=>s.id===m.series_id); }
function cadenceOptions(sel){ return Object.entries(CADENCES).map(([k,v])=>`<option value="${k}" ${sel===k?'selected':''}>${v}</option>`).join(''); }
function plural(n,one,many){ return `${n} ${n===1?one:many}`; }

async function loadSeries(){
  const { data, error }=await sb.from('cmd_meeting_series').select('*').order('created_at');
  if(error){ console.error('loadSeries',error); allSeries=[]; return; }
  allSeries=(data||[]).map(normSeries);
}

// Próxima data pela cadência, a partir da última ocorrência (nunca no passado)
function seriesNextDate(s){
  if(s.cadence==='none') return null;
  const last=seriesMeetings(s.id)[0]?.meeting_date;
  if(!last) return isoToday;
  const d=new Date(last+'T12:00:00');
  const step=()=>{
    if(s.cadence!=='monthly'){ d.setDate(d.getDate()+(s.cadence==='biweekly'?14:7)); return; }
    const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+1);
    d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
  };
  step();
  for(let i=0;i<400 && isoDate(d)<isoToday;i++) step();
  return isoDate(d);
}

// ── Ata → seções (RESUMO, DECISÕES, PENDÊNCIAS E RISCOS…) ──
// A ata vem como texto da IA ou como HTML depois de editada no editor rico.
function ataLines(raw){
  if(!raw) return [];
  let txt=raw;
  if(ataIsHTML(raw)){
    const tpl=document.createElement('template');
    tpl.innerHTML=sanitizeRichHTML(raw).replace(/<br\s*\/?>/gi,'\n').replace(/<(div|p|li|ul|ol)[\s>]/gi,'\n$&').replace(/<\/(div|p|li)>/gi,'\n');
    txt=tpl.content.textContent||'';
  }
  return txt.split('\n').map(l=>l.trim()).filter(Boolean);
}
function ataSections(raw){
  const out={}; let cur='_';
  ataLines(raw).forEach(l=>{
    const isHead=!/^[•\-–*]/.test(l) && l.length<=60 && l===l.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(l);
    if(isHead){ cur=norm(l).replace(/\s+/g,' '); out[cur]=out[cur]||[]; return; }
    (out[cur]=out[cur]||[]).push(l.replace(/^[•\-–*]\s*/,''));
  });
  return out;
}
function meetingAta(m){ return m._full ? (m.ata||'') : (seriesAtas[m.id]??''); }
function ataLoaded(m){ return m._full || (m.id in seriesAtas); }

async function ensureSeriesAtas(sid){
  const need=seriesMeetings(sid).filter(m=>!ataLoaded(m)).map(m=>m.id);
  if(!need.length) return true;
  const { data, error }=await sb.from('cmd_meetings').select('id,ata').in('id',need);
  if(error){ toast('Erro ao carregar o histórico da série: '+esc(error.message),'error'); return false; }
  (data||[]).forEach(r=>{ seriesAtas[r.id]=r.ata||''; });
  need.forEach(id=>{ if(!(id in seriesAtas)) seriesAtas[id]=''; });
  return true;
}

// ── Pauta da próxima: tarefas que vencem até lá + pendências da última ata + tópicos ──
function seriesAgenda(s){
  const next=seriesNextDate(s);
  const cobrar=seriesTasks(s.id).filter(t=>!t.done && (!next || !t.dueDate || t.dueDate<=next)).sort(sortByDateThenPri);
  const last=seriesMeetings(s.id).find(m=>meetingAta(m).trim());
  const pend=last ? (ataSections(meetingAta(last))['pendencias e riscos']||[]) : [];
  return { next, cobrar, pend, last, topics:s.agenda||[] };
}
function agendaNotesHTML(a){
  const li=[
    ...a.cobrar.map(t=>`<li><b>Cobrar:</b> ${esc(t.title)} — ${esc(person(t.person).name)}${t.dueDate?` (${esc(formatDate(t.dueDate))})`:''}</li>`),
    ...a.pend.map(p=>`<li><b>Pendência:</b> ${esc(p)}</li>`),
    ...a.topics.map(tp=>`<li>${esc(tp.text)}</li>`)
  ];
  return li.length ? `<div><b>Pauta</b></div><ul>${li.join('')}</ul>` : '';
}

// ── Salvamento ──
async function saveSeries(id, patch){
  const s=seriesById(id); if(!s) return false;
  Object.assign(s, patch);
  const { error }=await track(sb.from('cmd_meeting_series').update(patch).eq('id',id));
  if(error){ toast('Erro ao salvar a série: '+esc(error.message),'error'); return false; }
  return true;
}

async function createSeries({title, cadence='weekly', attendees=[], meetingIds=[]}){
  if(!_currentSession){ toast('Sessão expirada','error'); return null; }
  const row={ id:crypto.randomUUID(), owner_id:_currentSession.user.id, title, cadence, attendees, agenda:[] };
  const { error }=await track(sb.from('cmd_meeting_series').insert(row));
  if(error){ toast('Erro ao criar a série: '+esc(error.message),'error'); return null; }
  const s=normSeries({ ...row, archived:false, created_at:new Date().toISOString() });
  allSeries.push(s);
  if(meetingIds.length){
    const { error:linkErr }=await track(sb.from('cmd_meetings').update({series_id:s.id}).in('id',meetingIds));
    if(linkErr) toast('Série criada, mas as reuniões não foram vinculadas: '+esc(linkErr.message),'error');
    else meetingIds.forEach(id=>{ const m=meetingById(id); if(m) m.series_id=s.id; });
  }
  return s;
}

async function newSeries(){
  const s=await createSeries({ title:'Nova série' });
  if(!s) return;
  await selectSeries(s.id);
  const t=document.getElementById('ser-title'); t?.focus(); t?.select();
}

// Campo "Série" dentro da reunião
async function setMeetingSeries(mid, val){
  const m=meetingById(mid); if(!m) return;
  if(val==='__new'){
    const s=await createSeries({ title:serSuggestName([m]), cadence:serGuessCadence([m]), attendees:[...(m.attendees||[])], meetingIds:[mid] });
    renderMeetingsList(); renderMeetingSeriesField(m);
    if(s) toast(`Série “${esc(s.title)}” criada`,'success',{label:'Abrir',cb:()=>selectSeries(s.id)});
    return;
  }
  await saveMeetingField(mid,{series_id:val||null});
  renderMeetingsList(); renderMeetingSeriesField(m);
}

function renderMeetingSeriesField(m){
  const el=document.getElementById('mt-series'); if(!el || !m) return;
  const s=m.series_id && seriesById(m.series_id);
  el.innerHTML=`<label class="mt-series-lbl" for="mt-series-sel">Série</label>
    <select class="mt-date mt-series-sel" id="mt-series-sel" onchange="setMeetingSeries('${m.id}',this.value)">
      <option value="">Nenhuma (reunião avulsa)</option>
      ${liveSeries().map(x=>`<option value="${x.id}" ${x.id===m.series_id?'selected':''}>${esc(x.title)}</option>`).join('')}
      <option value="__new">+ Nova série a partir desta</option>
    </select>
    ${s?`<button type="button" class="link-btn" onclick="selectSeries('${s.id}')">Abrir série</button>`:''}`;
}

// ── Ocorrências ──
async function createSeriesOccurrence(sid){
  const s=seriesById(sid); if(!s) return null;
  await ensureSeriesAtas(sid);
  const a=seriesAgenda(s);
  const notes=agendaNotesHTML(a);
  const m=await createMeeting({ title:s.title, attendees:[...s.attendees], series_id:sid, notes });
  if(!m) return null;
  if(notes){
    m._pristine=false;   // tem pauta: não é rascunho vazio para descartar ao sair
    if(a.topics.length) saveSeries(sid,{agenda:[]});
  }
  return m;
}
async function newSeriesOccurrence(sid){
  const m=await createSeriesOccurrence(sid); if(!m) return;
  await selectMeeting(m.id);
  toast(m.notes?'Reunião criada com a pauta nas anotações':'Reunião criada');
}
async function recordSeriesNow(sid){
  if(REC.state!=='idle'){ openRecordingMeeting(); toast('Já existe uma gravação em andamento','info'); return; }
  const ctx=recPrimeAudio();
  const m=await createSeriesOccurrence(sid);
  if(!m){ ctx?.close?.().catch(()=>{}); return; }
  await selectMeeting(m.id);
  await startRecording(m.id, ctx);
}

// O que a IA recebe para escrever "Andamento desde a última"
async function seriesContextFor(m){
  try {
    if(!m?.series_id) return null;
    const s=seriesById(m.series_id); if(!s) return null;
    const others=seriesMeetings(s.id).filter(x=>x.id!==m.id && (x.meeting_date||'')<=(m.meeting_date||isoToday));
    if(!others.length) return null;
    await ensureSeriesAtas(s.id);
    const prev=others[0];
    const prevAta=others.find(x=>meetingAta(x).trim());
    const ids=new Set(others.map(x=>x.id));
    const fromSeries=tasks.filter(t=>t.originId && ids.has(t.originId));
    // Para a IA o usuário é "Lucas" (no app ele aparece como "Eu")
    const out=t=>({ titulo:t.title, responsavel:t.person===ME_ID?'Lucas':person(t.person).name, prazo:t.dueDate||null, de:meetingById(t.originId)?.meeting_date||null });
    return {
      serie:s.title, anterior:prev.meeting_date,
      tarefas_abertas:fromSeries.filter(t=>!t.done).sort(sortByDateThenPri).slice(0,40).map(out),
      concluidas_desde:fromSeries.filter(t=>t.done && t.completedAt && isoDate(new Date(t.completedAt))>=prev.meeting_date).slice(0,40).map(out),
      pendencias:prevAta ? (ataSections(meetingAta(prevAta))['pendencias e riscos']||[]).slice(0,20) : []
    };
  } catch(e){ console.error('seriesContextFor',e); return null; }
}

// ── Lista (topo da aba Reuniões) ──
function seriesListHTML(){
  if(reunKind==='oneone') return '';
  const sugg=seriesSuggestions();
  const banner=sugg.length ? `<button type="button" class="ser-banner ${seriesSuggOpen?'active':''}" onclick="openSeriesSuggestions()">${SERIES_ICON}<span>Encontrei ${plural(sugg.length,'possível série','possíveis séries')} nas suas reuniões</span><span class="sp-origin-go">Revisar</span></button>` : '';
  const ss=liveSeries().sort((a,b)=>byMeetingDateDesc(seriesMeetings(a.id)[0]||a, seriesMeetings(b.id)[0]||b));
  return banner
    + `<div class="reun-sec"><span>Séries</span><button type="button" class="reun-sec-add" onclick="newSeries()">+ Série</button></div>`
    + (ss.length ? ss.map(seriesCardHTML).join('') : `<p class="list-empty ser-empty">Reuniões que se repetem viram uma série, com pauta, tarefas e histórico numa página só.</p>`)
    + `<div class="reun-sec"><span>Reuniões</span></div>`;
}

function seriesCardHTML(s){
  const occ=seriesMeetings(s.id), last=occ[0];
  const open=seriesTasks(s.id).filter(t=>!t.done).length;
  const active=seriesSelected===s.id || (!!reunSelected && meetingById(reunSelected)?.series_id===s.id);
  const d=last ? new Date((last.meeting_date||isoToday)+'T12:00:00') : null;
  const date=d ? `<span class="reun-card-day">${String(d.getDate()).padStart(2,'0')}</span><span class="reun-card-mon">${esc(d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''))}</span>` : SERIES_ICON;
  return `<button class="reun-card series ${active?'active':''}" aria-current="${active?'true':'false'}" onclick="selectSeries('${s.id}')">
    <span class="reun-card-date">${date}</span>
    <span class="reun-card-info">
      <span class="reun-card-title"><span class="kind-tag">série</span>${esc(s.title)}</span>
      <span class="reun-card-sub">${esc(CADENCES[s.cadence]||'')} · ${plural(occ.length,'reunião','reuniões')}</span>
      ${open?`<span class="reun-card-status">${plural(open,'tarefa aberta','tarefas abertas')}</span>`:''}
    </span>
  </button>`;
}

// ── Página da série ──
async function selectSeries(sid){
  if(reunSelected){ const prev=reunSelected; await leaveMeeting(prev); if(reunSelected===prev) reunSelected=null; }
  seriesSelected=sid; seriesSuggOpen=false; seriesHistQ='';
  if(currentView!=='reunioes') navTo('reunioes');
  renderMeetingsList();
  const s=seriesById(sid);
  if(!s){ seriesSelected=null; renderMeetingEmpty(); return; }
  renderSeriesPage(s);
  await ensureSeriesAtas(sid);
  if(seriesSelected===sid){ renderSeriesAgenda(s); renderSeriesHistory(s); }
}

function renderSeriesPage(s){
  const root=document.getElementById('reun-main'); if(!root) return;
  mtEditors=[];
  root.innerHTML=`
    <div class="mt-head">
      <div class="mt-head-main">
        <span class="kind-tag lg">Série</span>
        <input class="mt-title" id="ser-title" value="${esc(s.title)}" placeholder="Nome da série" aria-label="Nome da série" maxlength="120">
      </div>
      <div class="mt-head-meta">
        <select class="mt-date" id="ser-cadence" aria-label="Cadência">${cadenceOptions(s.cadence)}</select>
        <div class="menu-wrap">
          <button class="icon-btn" id="ser-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="ser-menu" aria-label="Mais ações da série">${ICON.more}</button>
          <div class="menu" id="ser-menu" role="menu" hidden>
            <button role="menuitem" class="danger" data-act="delete">Excluir série…</button>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-body">
      <section class="mt-section ser-top" aria-label="Próxima reunião">
        <p class="ser-next" id="ser-next"></p>
        <div class="ser-btns">
          <button type="button" class="rec-now-btn" onclick="recordSeriesNow('${s.id}')"><span class="rec-dot" aria-hidden="true"></span>Gravar agora</button>
          <button type="button" class="btn-sm" onclick="newSeriesOccurrence('${s.id}')">+ Reunião sem gravar</button>
        </div>
      </section>
      <section class="mt-section" aria-labelledby="ser-h-people">
        <h2 class="mt-sec-title" id="ser-h-people">Participantes padrão</h2>
        <div class="chips" id="ser-chips"></div>
      </section>
      <section class="mt-section" aria-labelledby="ser-h-agenda">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="ser-h-agenda">Pauta da próxima</h2><span class="mt-count" id="ser-agenda-count"></span></div>
        <div id="ser-agenda"></div>
      </section>
      <section class="mt-section" aria-labelledby="ser-h-tasks">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="ser-h-tasks">Tarefas da série</h2><span class="mt-count" id="ser-tasks-count"></span></div>
        <div id="ser-tasks"></div>
      </section>
      <section class="mt-section" aria-labelledby="ser-h-hist">
        <div class="mt-sec-head"><h2 class="mt-sec-title" id="ser-h-hist">Histórico</h2><span class="mt-count" id="ser-hist-count"></span></div>
        <input type="search" class="plan-input ser-search" id="ser-search" value="${esc(seriesHistQ)}" placeholder="Buscar tema nas atas da série…" aria-label="Buscar tema nas atas da série">
        <div id="ser-history"></div>
      </section>
    </div>`;
  wireSeriesHead(s);
  renderSeriesChips(s);
  renderSeriesNext(s);
  renderSeriesAgenda(s);
  renderSeriesTasks(s);
  renderSeriesHistory(s);
}

function wireSeriesHead(s){
  const title=document.getElementById('ser-title');
  title.addEventListener('blur',()=>{
    const v=title.value.trim();
    if(!v){ title.value=s.title; return; }
    if(v!==s.title) saveSeries(s.id,{title:v}).then(renderMeetingsList);
  });
  title.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); title.blur(); } if(e.key==='Escape'){ e.stopPropagation(); title.value=s.title; title.blur(); } });

  document.getElementById('ser-cadence').addEventListener('change',e=>{
    saveSeries(s.id,{cadence:e.target.value});
    renderSeriesNext(s); renderSeriesAgenda(s); renderMeetingsList();
  });

  const search=document.getElementById('ser-search');
  const run=debounce(()=>{ seriesHistQ=search.value.trim(); renderSeriesHistory(s); },200);
  search.addEventListener('input',run);

  const btn=document.getElementById('ser-menu-btn'), menu=document.getElementById('ser-menu');
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
    if(act==='delete') deleteSeries(s.id);
  });
}
document.addEventListener('click',e=>{
  const menu=document.getElementById('ser-menu');
  if(menu && !menu.hidden && !e.target.closest('.menu-wrap')){ menu.hidden=true; document.getElementById('ser-menu-btn')?.setAttribute('aria-expanded','false'); }
});

function renderSeriesChips(s){
  const el=document.getElementById('ser-chips'); if(!el) return;
  mountChipEditor(el,{ list:s.attendees, inputId:'ser-chip-input', emptyPlaceholder:'Quem participa? Enter para adicionar',
    onChange:next=>{ saveSeries(s.id,{attendees:next}); renderSeriesChips(s); } });
}

function renderSeriesNext(s){
  const el=document.getElementById('ser-next'); if(!el) return;
  const occ=seriesMeetings(s.id), next=seriesNextDate(s);
  const nextTxt=next ? new Date(next+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}) : '';
  const parts=[
    next ? `Próxima prevista: <strong>${esc(next===isoToday?'hoje':nextTxt)}</strong>` : `<strong>${esc(CADENCES.none)}</strong>`,
    plural(occ.length,'reunião','reuniões'),
    occ[0] ? `última em ${esc(formatDate(occ[0].meeting_date))}` : ''
  ].filter(Boolean);
  el.innerHTML=parts.join(' · ');
}

function renderSeriesAgenda(s){
  const el=document.getElementById('ser-agenda'); if(!el) return;
  const a=seriesAgenda(s);
  const loading=seriesMeetings(s.id).some(m=>!ataLoaded(m));
  const n=a.cobrar.length+a.pend.length+a.topics.length;
  const cnt=document.getElementById('ser-agenda-count'); if(cnt) cnt.textContent=n?plural(n,'item','itens'):'';
  const rows=[
    ...a.cobrar.map(t=>{
      const p=person(t.person);
      return `<div class="mt-task">
        <span class="tag ser-kind">cobrar</span>
        <button type="button" class="mt-task-title" onclick="openPanel('${t.id}')">${esc(t.title)}</button>
        <span class="mt-task-meta">${av(p,16)}<span>${esc(p.name)}</span><span class="tag dt ${isOverdue(t.dueDate)?'overdue':''}">${formatDate(t.dueDate)}</span></span>
      </div>`;
    }),
    ...a.pend.map(p=>`<div class="mt-task">
        <span class="tag ser-kind">pendência</span>
        <span class="ser-ag-text">${esc(p)}</span>
        <span class="mt-task-meta">ata de ${esc(formatDate(a.last.meeting_date))}</span>
      </div>`),
    ...a.topics.map(tp=>`<div class="mt-task">
        <span class="tag ser-kind">tópico</span>
        <span class="ser-ag-text">${esc(tp.text)}</span>
        <button type="button" class="oo-item-btn del" aria-label="Remover tópico: ${esc(tp.text)}" title="Remover" onclick="removeSeriesTopic('${s.id}','${esc(tp.id)}')">${ICON.x}</button>
      </div>`)
  ];
  el.innerHTML=(rows.length ? `<div class="mt-task-list">${rows.join('')}</div>`
      : `<p class="mt-empty">${loading?'Carregando…':'Nada para cobrar até a próxima. Anote abaixo o que você quer levar.'}</p>`)
    + `<form class="ser-topic-form" id="ser-topic-form"><input class="chip-input" id="ser-topic-input" placeholder="Adicionar tópico para a próxima…" aria-label="Novo tópico da pauta" autocomplete="off"></form>
       <p class="mt-hint">Junta as tarefas da série que vencem até a próxima reunião, as pendências da última ata e os seus tópicos. Ao criar a próxima reunião, a pauta vai para as anotações dela.</p>`;
  document.getElementById('ser-topic-form').addEventListener('submit',e=>{
    e.preventDefault();
    const input=document.getElementById('ser-topic-input');
    const text=input.value.trim(); if(!text) return;
    saveSeries(s.id,{agenda:[...(s.agenda||[]), { id:crypto.randomUUID().slice(0,8), text }]});
    renderSeriesAgenda(s);
    document.getElementById('ser-topic-input')?.focus();
  });
}

function removeSeriesTopic(sid, tid){
  const s=seriesById(sid); if(!s) return;
  const prev=[...(s.agenda||[])];
  saveSeries(sid,{agenda:prev.filter(t=>t.id!==tid)});
  renderSeriesAgenda(s);
  toast('Tópico removido','info',{label:'Desfazer',cb:()=>{ saveSeries(sid,{agenda:prev}); if(seriesSelected===sid) renderSeriesAgenda(s); }});
}

function seriesTaskRowHTML(t){
  const p=person(t.person), src=meetingById(t.originId);
  return `<div class="mt-task ${t.done?'done':''}">
    <button type="button" class="card-check ${t.done?'done':''}" aria-label="${t.done?'Marcar como não feita':'Marcar como concluída'}: ${esc(t.title)}" onclick="toggleDone('${t.id}')">${t.done?ICON.checkSm:''}</button>
    <button type="button" class="mt-task-title" onclick="openPanel('${t.id}')">${esc(t.title)}</button>
    <span class="mt-task-meta">${src?`<span class="ser-origin">de ${esc(formatDate(src.meeting_date))}</span>`:''}${t.done?'':`<span class="tag dt ${isOverdue(t.dueDate)?'overdue':''}">${formatDate(t.dueDate)}</span>`}${t.done?`<span>${esc(p.name)}</span>`:''}</span>
  </div>`;
}

function renderSeriesTasks(s){
  const el=document.getElementById('ser-tasks'); if(!el) return;
  const ts=seriesTasks(s.id);
  const open=ts.filter(t=>!t.done), done=ts.filter(t=>t.done).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')));
  const cnt=document.getElementById('ser-tasks-count');
  if(cnt) cnt.textContent=ts.length?`${open.length} abertas · ${done.length} concluídas`:'';
  if(!ts.length){ el.innerHTML='<p class="mt-empty">Nenhuma tarefa saiu destas reuniões ainda. As demandas que você criar em qualquer reunião da série aparecem aqui.</p>'; return; }
  const groups=new Map();
  open.forEach(t=>{ if(!groups.has(t.person)) groups.set(t.person,[]); groups.get(t.person).push(t); });
  const openHTML=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length).map(([pid,list])=>{
    const p=person(pid);
    return `<div class="ser-group">${av(p,18)}<span>${esc(p.name)}</span><span class="mt-count">${list.length}</span></div>
      <div class="mt-task-list">${list.sort(sortByDateThenPri).map(seriesTaskRowHTML).join('')}</div>`;
  }).join('');
  el.innerHTML=(openHTML || '<p class="mt-empty">Todas as tarefas da série estão concluídas.</p>')
    + (done.length ? `<details class="plan-done"><summary>Concluídas (${done.length})</summary><div class="mt-task-list">${done.map(seriesTaskRowHTML).join('')}</div></details>` : '');
}

// Destaca o termo buscado sem depender de acento ou maiúscula
function highlightTerm(line, q){
  const i=norm(line).indexOf(norm(q));
  if(i<0 || !q) return esc(line);
  return esc(line.slice(0,i))+'<mark>'+esc(line.slice(i,i+q.length))+'</mark>'+esc(line.slice(i+q.length));
}

function renderSeriesHistory(s){
  const el=document.getElementById('ser-history'); if(!el) return;
  const occ=seriesMeetings(s.id);
  const cnt=document.getElementById('ser-hist-count'); if(cnt) cnt.textContent=occ.length?plural(occ.length,'reunião','reuniões'):'';
  if(!occ.length){ el.innerHTML='<p class="mt-empty">Nenhuma reunião nesta série ainda. Use <strong>Gravar agora</strong> na próxima, ou vincule reuniões antigas pelo campo “Série” de cada uma.</p>'; return; }
  const q=seriesHistQ, nq=norm(q);
  const html=occ.map(m=>{
    const ata=meetingAta(m), loaded=ataLoaded(m);
    let body;
    if(!loaded) body='<p class="mt-empty">Carregando…</p>';
    else if(nq){
      const hits=ataLines(ata).filter(l=>norm(l).includes(nq));
      if(!hits.length && !norm(m.title).includes(nq)) return '';
      body=hits.length ? `<ul class="ser-hist-list">${hits.slice(0,4).map(l=>`<li>${highlightTerm(l.replace(/^[•\-–*]\s*/,''),q)}</li>`).join('')}</ul>` : '';
    } else {
      const sec=ataSections(ata);
      const resumo=(sec['resumo']||sec['_']||[]).slice(0,2).join(' ');
      const dec=(sec['decisoes']||sec['combinados']||[]).slice(0,4);
      body=(resumo||dec.length)
        ? `${resumo?`<p class="ser-hist-sum">${esc(clip(resumo,360))}</p>`:''}${dec.length?`<p class="ser-hist-lbl">${sec['decisoes']?'Decisões':'Combinados'}</p><ul class="ser-hist-list">${dec.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`
        : `<p class="mt-empty">${m.status==='draft'?'Rascunho, sem ata.':'Sem ata.'}</p>`;
    }
    const ts=meetingTasks(m.id), dn=ts.filter(t=>t.done).length;
    const d=new Date((m.meeting_date||isoToday)+'T12:00:00');
    const status={processed:'ata pronta', recorded:'transcrita', draft:'rascunho'}[m.status]||'';
    return `<article class="ser-hist">
      <button type="button" class="ser-hist-head" onclick="openMeeting('${m.id}')">
        <span class="reun-card-date"><span class="reun-card-day">${String(d.getDate()).padStart(2,'0')}</span><span class="reun-card-mon">${esc(d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''))}</span></span>
        <span class="ser-hist-info"><span class="ser-hist-title">${esc(m.title||'Reunião')}</span><span class="reun-card-status">${esc(status)}${ts.length?` · ${dn}/${ts.length} tarefas concluídas`:''}</span></span>
        <span class="sp-origin-go">Abrir</span>
      </button>
      ${body}
    </article>`;
  }).join('');
  el.innerHTML=html || `<p class="mt-empty">Nenhuma ata desta série menciona “${esc(q)}”.</p>`;
}

function refreshOpenSeries(){
  const s=seriesSelected && seriesById(seriesSelected); if(!s) return;
  renderSeriesNext(s); renderSeriesAgenda(s); renderSeriesTasks(s); renderSeriesHistory(s);
}

function deleteSeries(sid){
  const s=seriesById(sid); if(!s) return;
  const n=seriesMeetings(sid).length;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="del-series-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" role="alertdialog" aria-modal="true" aria-labelledby="del-series-title" aria-describedby="del-series-msg">
        <h3 id="del-series-title">Excluir série?</h3>
        <p id="del-series-msg" class="modal-msg">A série <strong>${esc(s.title)}</strong> e a pauta dela serão apagadas. ${n?`As ${plural(n,'reunião continua','reuniões continuam')} na lista como avulsas, com ata e tarefas.`:''}</p>
        <div class="oo-modal-btns">
          <button class="btn-sm" type="button" id="del-series-cancel">Cancelar</button>
          <button class="btn-sm danger" type="button" id="del-series-confirm">Excluir série</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('del-series-modal');
  const cancel=modal.querySelector('#del-series-cancel');
  cancel.addEventListener('click',()=>modal.remove());
  cancel.focus();
  modal.querySelector('#del-series-confirm').addEventListener('click',async()=>{
    modal.remove();
    const { error }=await track(sb.from('cmd_meeting_series').delete().eq('id',sid));   // reuniões: series_id vira NULL
    if(error){ toast('Erro ao excluir a série: '+esc(error.message),'error'); return; }
    allSeries=allSeries.filter(x=>x.id!==sid);
    allMeetings.forEach(m=>{ if(m.series_id===sid) m.series_id=null; });
    if(seriesSelected===sid){ seriesSelected=null; renderMeetingEmpty(); }
    renderMeetingsList();
    toast('Série excluída. As reuniões continuam na lista');
  });
}

// ── Sugestões: reuniões avulsas que parecem a mesma série ──
// Junta por palavra do título ou por participantes idênticos (uma reunião de título
// genérico, como "Reunião de 19 de out.", entra pelo grupo de pessoas).
const SER_STOP=new Set(('reuniao reunioes semanal quinzenal mensal diaria encontro call alinhamento de da do das dos e com para pra em no na nos nas sobre ate lucas tri dias plano anotacoes teste '
  +'jan fev mar abr mai jun jul ago set out nov dez janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro').split(' '));
function serTitleTokens(t){
  const s=norm(t).replace(/\b1\s*[:x]\s*1\b/g,' umaum ');
  return [...new Set(s.split(/[^a-z0-9]+/).filter(w=>w.length>=3 && !/^\d+$/.test(w) && !SER_STOP.has(w)))];
}
function firstToken(name){ return norm(name).split(/[^a-z0-9]+/).find(Boolean)||''; }
function serAttendeeSig(m){
  const set=[...new Set((m.attendees||[]).map(firstToken).filter(Boolean))].sort();
  return set.length>=2 ? set.join(',') : '';
}
function serGuessCadence(members){
  const c={weekly:0,biweekly:0,monthly:0};
  members.forEach(m=>{ const t=norm(m.title); if(/semanal/.test(t)) c.weekly++; if(/quinzenal/.test(t)) c.biweekly++; if(/mensal/.test(t)) c.monthly++; });
  const best=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
  return best[1] ? best[0] : 'weekly';
}
function serSuggestName(members){
  const sorted=[...members].sort(byMeetingDateDesc);
  const stripCadence=t=>String(t||'').replace(/^\s*(semanal|quinzenal|mensal|reuni[aã]o)\b\s*[-–:]?\s*/i,'').trim();
  if(sorted.length===1) return stripCadence(sorted[0].title)||sorted[0].title||'Nova série';
  const shared=sorted.map(m=>serTitleTokens(m.title)).reduce((acc,t)=>acc.filter(x=>t.includes(x)));
  if(shared.length){
    const latest=sorted[0].title||'', words=latest.split(/\s+/), nl=norm(latest);
    const pretty=t=>{
      if(t==='umaum') return '1:1';
      const w=(words.find(x=>norm(x).replace(/[^a-z0-9]/g,'')===t)||t).replace(/[^\p{L}\p{N}]/gu,'');
      return w===w.toUpperCase() ? w.charAt(0)+w.slice(1).toLowerCase() : w.charAt(0).toUpperCase()+w.slice(1);
    };
    const pos=t=>{ const i=nl.indexOf(t==='umaum'?'1:1':t); return i<0?999:i; };
    return shared.sort((a,b)=>pos(a)-pos(b)).map(pretty).join(' ');
  }
  const best=[...sorted].sort((a,b)=>serTitleTokens(b.title).length-serTitleTokens(a.title).length)[0];
  return stripCadence(best.title)||best.title||'Nova série';
}

function serDismissed(){ try{ return new Set(JSON.parse(localStorage.getItem('series_sugg_dismissed')||'[]')); }catch(_){ return new Set(); } }

function seriesSuggestions(){
  const pool=allMeetings.filter(m=>!m.series_id || !seriesById(m.series_id));
  if(pool.length<2) return [];
  const people=new Set([...PEOPLE.map(p=>firstToken(p.name)), ...pool.flatMap(m=>(m.attendees||[]).map(firstToken))].filter(Boolean));
  const toks=new Map(pool.map(m=>[m.id,serTitleTokens(m.title)]));
  const sigs=new Map(pool.map(m=>[m.id,serAttendeeSig(m)]));
  const pair=(a,b)=>{
    const tb=toks.get(b.id);
    let sc=toks.get(a.id).filter(t=>tb.includes(t)).reduce((n,t)=>n+(people.has(t)?0.5:1),0);
    if(sigs.get(a.id) && sigs.get(a.id)===sigs.get(b.id)) sc+=1;
    return sc;
  };
  // Grupos candidatos: mesma palavra do título (que não seja nome de pessoa) ou mesmos participantes
  const cand=new Map();
  const add=(key,m)=>{ if(!cand.has(key)) cand.set(key,[]); cand.get(key).push(m); };
  pool.forEach(m=>{
    toks.get(m.id).forEach(t=>{ if(!people.has(t)) add('tok:'+t,m); });
    if(sigs.get(m.id)) add('att:'+sigs.get(m.id),m);
  });
  // Cada reunião fica no grupo com que mais se parece (evita "Estrutura Live/Criativos e Financeiro" em dois)
  const choice=new Map();
  pool.forEach(m=>{
    let best=null;
    cand.forEach((members,key)=>{
      if(members.length<2 || !members.includes(m)) return;
      const others=members.filter(o=>o!==m);
      const avg=others.reduce((n,o)=>n+pair(m,o),0)/others.length;
      if(avg<1) return;
      if(!best || avg>best.avg || (avg===best.avg && (members.length>best.size || (members.length===best.size && key<best.key)))) best={key,avg,size:members.length};
    });
    if(best) choice.set(m.id,best.key);
  });
  const groups=new Map();
  pool.forEach(m=>{ const k=choice.get(m.id); if(!k) return; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(m); });
  const dismissed=serDismissed();
  return [...groups.values()].filter(g=>g.length>=2).map(g=>{
    const members=[...g].sort(byMeetingDateDesc);
    const key=members.map(m=>m.id).sort().join('|');
    return { key, members, name:serSuggestName(members), cadence:serGuessCadence(members),
             attendees:[...((members.find(m=>(m.attendees||[]).length)||{}).attendees||[])] };
  }).filter(g=>!dismissed.has(g.key)).sort((a,b)=>b.members.length-a.members.length||byMeetingDateDesc(a.members[0],b.members[0]));
}

async function openSeriesSuggestions(){
  if(reunSelected){ const prev=reunSelected; await leaveMeeting(prev); if(reunSelected===prev) reunSelected=null; }
  seriesSelected=null; seriesSuggOpen=true;
  renderMeetingsList();
  renderSeriesSuggestions();
}

function renderSeriesSuggestions(){
  const root=document.getElementById('reun-main'); if(!root) return;
  mtEditors=[];
  seriesSuggCache=seriesSuggestions();
  if(!seriesSuggCache.length){ seriesSuggOpen=false; renderMeetingEmpty(); renderMeetingsList(); return; }
  root.innerHTML=`
    <div class="mt-head"><div class="mt-head-main"><h2 class="ser-page-title">Possíveis séries</h2></div></div>
    <div class="mt-body">
      <p class="mt-hint ser-sugg-intro">Agrupei reuniões avulsas pelo título e pelos participantes. Marque as que entram, ajuste o nome e a cadência e crie a série. Depois dá para mudar pelo campo “Série” de cada reunião.</p>
      ${seriesSuggCache.map((g,i)=>`
      <section class="mt-section ser-sugg" id="ser-sugg-${i}" aria-label="Sugestão: ${esc(g.name)}">
        <div class="ser-sugg-head">
          <input class="plan-input ser-sugg-name" value="${esc(g.name)}" aria-label="Nome da série">
          <select class="plan-input ser-sugg-cad" aria-label="Cadência">${cadenceOptions(g.cadence)}</select>
        </div>
        <div class="dem-list">${g.members.map(m=>`
          <label class="ser-sugg-row">
            <input type="checkbox" class="dem-inc" value="${m.id}" checked>
            <span class="tag dt">${esc(formatDate(m.meeting_date))}</span>
            <span class="ser-sugg-title">${esc(m.title||'Reunião')}</span>
            <span class="dem-meta">${esc((m.attendees||[]).join(', ')||'sem participantes')}</span>
          </label>`).join('')}</div>
        <div class="dem-foot">
          <button type="button" class="btn-primary" onclick="acceptSeriesSuggestion(${i})">Criar série</button>
          <button type="button" class="btn-sm ser-sugg-skip" onclick="dismissSeriesSuggestion(${i})">Ignorar</button>
        </div>
      </section>`).join('')}
    </div>`;
}

async function acceptSeriesSuggestion(i){
  const g=seriesSuggCache[i], sec=document.getElementById('ser-sugg-'+i);
  if(!g || !sec) return;
  const ids=[...sec.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
  if(!ids.length){ toast('Marque pelo menos uma reunião','error'); return; }
  const title=sec.querySelector('.ser-sugg-name').value.trim()||g.name;
  const s=await createSeries({ title, cadence:sec.querySelector('.ser-sugg-cad').value, attendees:g.attendees, meetingIds:ids });
  if(!s) return;
  renderMeetingsList();
  renderSeriesSuggestions();
  toast(`Série “${esc(s.title)}” criada com ${plural(ids.length,'reunião','reuniões')}`,'success',{label:'Abrir',cb:()=>selectSeries(s.id)});
}

function dismissSeriesSuggestion(i){
  const g=seriesSuggCache[i]; if(!g) return;
  const set=serDismissed(); set.add(g.key);
  try{ localStorage.setItem('series_sugg_dismissed',JSON.stringify([...set])); }catch(_){}
  renderMeetingsList();
  renderSeriesSuggestions();
}
