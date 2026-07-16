// ══════════════════════════════════════════════
// SUPABASE — credenciais públicas (anon key)
// A anon key é segura para o frontend pois o RLS
// garante que cada usuário só acessa seus dados.
// Chaves sensíveis (OpenAI) ficam nas Edge Functions.
// ══════════════════════════════════════════════
const SB_URL = 'https://cvymqbjaxtricwimusld.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2eW1xYmpheHRyaWN3aW11c2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODA3ODUsImV4cCI6MjA4ODU1Njc4NX0.GpIfMCxzb9bY3oHVQE7l6O9DBJQuoe1tose_71rwYww';

const { createClient } = supabase;
const sb = createClient(SB_URL, SB_ANON);

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let PEOPLE = [];
let ooShowHidden=false, ooDragIdx=null;

const today = new Date();
const isoToday = isoDate(today);

let tasks = [];
let boardFilter='all', searchQ='', peopleFilter='all', peopleQ='';
let peopleSort = (typeof localStorage!=='undefined' && localStorage.getItem('tasks_people_sort')) || 'prazo';
let calView='month', calDate=new Date(today.getFullYear(),today.getMonth(),1);
let mPrio='media', mTipo='delegada';
let ooSelected=null;
let notifications=[], notifOpen=false;
let currentView='board';

// Recording
let mediaRecorder=null, recStream=null, recInterval=null, recSeconds=0;
let transcriptLines=[], aiDemands=[];

// 1:1 local state (populated from Supabase on login)
let oo11={};

// WhatsApp monitor state
let waNumbers=[], waDaily=[];
let waTariffs={ utility:0.0315, marketing:0.1761, authentication:0.0315, service:0 };
let waPeriod='30d', waCategoryFilter='all', waNumberFilter='all';

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
function isoDate(d){ return d.toISOString().split('T')[0]; }
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function person(id){ return PEOPLE.find(p=>p.id===id)||PEOPLE[0]||{id:'?',name:'?',init:'?',role:'',color:'var(--t3)',bg:'var(--s2)',hidden:false}; }
// Escape HTML-significant chars in user/AI content before innerHTML interpolation.
// Used as defense against accidental markup injection (task titles, Whisper transcripts, GPT-4o output, person names).
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// Keyboard activation for container elements with role="button" (containers that hold nested buttons,
// so they can't be actual <button> due to HTML nesting rules). Triggers the same click handler on Enter/Space.
function kbd(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.click()} }
// Debounce — adia execução até N ms sem nova chamada. Evita rerender a cada keystroke do search.
function debounce(fn,ms=150){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); } }
// Debounced renderers para search inputs (renderBoard/renderPeople são hoisted, então OK referenciar aqui)
const debouncedRenderBoard=debounce(()=>renderBoard(),150);
const debouncedRenderPeople=debounce(()=>renderPeople(),150);
function av(p,size=18){ return `<div class="av" style="width:${size}px;height:${size}px;background:${p.bg};color:${p.color};font-size:${Math.round(size*0.42)}px">${esc(p.init)}</div>`; }
function formatDate(s){ if(!s) return '—'; const d=new Date(s+'T12:00:00'); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}); }
function isOverdue(s){ return s && new Date(s+'T23:59:59')<today && s!==isoToday; }
function isToday(s){ return s===isoToday; }

// Toast with optional action button (e.g. undo). action: {label, cb} or null.
// Internal callers control markup; external/AI text always passes through esc() at call site.
function toast(msg,type='success',action=null){
  const w=document.getElementById('toast-wrap');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.setAttribute('role','status');
  const icon=type==='success'?'✓':type==='error'?'⚠':'ℹ';
  const ttl=action?5000:3000, fade=ttl-300;
  let actionHtml='';
  if(action){
    actionHtml=`<button class="toast-action" type="button">${esc(action.label)}</button>`;
  }
  t.innerHTML=`<span aria-hidden="true">${icon}</span><span class="toast-msg">${msg}</span>${actionHtml}`;
  if(action){
    t.querySelector('.toast-action').addEventListener('click',()=>{
      try{ action.cb() } finally { t.remove(); }
    });
  }
  w.appendChild(t);
  setTimeout(()=>t.style.opacity='0',fade);
  setTimeout(()=>t.remove(),ttl);
}

// Close topmost open modal on Escape (a11y: dialogs must be dismissable via keyboard)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // Dynamic modals first (most recently opened)
  const dyn = document.getElementById('del-meeting-modal')
           || document.getElementById('paste-modal')
           || document.getElementById('edit-title-modal')
           || document.getElementById('edit-ata-modal')
           || document.getElementById('cal-day-popup')
           || document.getElementById('oo-person-modal')
           || document.getElementById('new-meeting-modal');
  if (dyn) { dyn.remove(); return; }
  if (document.getElementById('detail-overlay')?.classList.contains('open')) { closePanel(); return; }
  if (document.getElementById('task-modal')?.classList.contains('open')) { closeModal('task-modal'); return; }
  if (document.getElementById('wa-numbers-modal')?.classList.contains('open')) { closeModal('wa-numbers-modal'); return; }
  if (document.getElementById('wa-tariffs-modal')?.classList.contains('open')) { closeModal('wa-tariffs-modal'); return; }
  if (document.getElementById('briefing-overlay')?.classList.contains('open')) { closeBriefing(); return; }
  if (document.getElementById('notif-panel')?.classList.contains('open')) { toggleNotifPanel(); return; }
});

// ══════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════
async function doLogin(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-pass').value;
  const btn=document.getElementById('auth-btn');
  const err=document.getElementById('auth-err');
  if(!email||!pass){ err.textContent='Preencha email e senha.'; return; }
  btn.disabled=true; btn.textContent='Entrando...'; err.textContent='';
  const { error }=await sb.auth.signInWithPassword({ email, password:pass });
  if(error){ err.textContent=error.message; btn.disabled=false; btn.textContent='Entrar'; return; }
  // onAuthStateChange will handle the rest
}

async function doLogout(){
  localStorage.removeItem('oo_ver');
  localStorage.removeItem('oo_people');
  localStorage.removeItem('oo_data');
  try { await sb.auth.signOut(); } catch(e){}
  window.location.reload();
}
window.doLogout=doLogout;

let _authLoaded=false;
let _currentSession=null;
sb.auth.onAuthStateChange((event, session)=>{
  _currentSession=session;
  if(session){
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('shell').style.display='flex';
    const email=session.user.email;
    document.getElementById('user-email').textContent=email;
    document.getElementById('user-av').textContent=email[0].toUpperCase();
    // Reset login button
    const lb=document.getElementById('auth-btn');
    if(lb){ lb.disabled=false; lb.textContent='Entrar'; }
    if(!_authLoaded){
      _authLoaded=true;
      // Load data outside onAuthStateChange to avoid deadlock with Supabase internal auth lock
      setTimeout(async()=>{
        await loadOOState();
        await loadTasks();
        await loadWA();
        scheduleNotifCheck();
        showBriefing();
      },0);
    }
  } else {
    _authLoaded=false;
    document.getElementById('auth-screen').style.display='flex';
    document.getElementById('shell').style.display='none';
    tasks=[];
  }
});

// ══════════════════════════════════════════════
// SUPABASE CRUD
// ══════════════════════════════════════════════
async function loadTasks(){
  for(let attempt=0; attempt<2; attempt++){
    try {
      const { data, error }=await sb.from('cmd_tasks').select('*').order('created_at',{ascending:false});
      if(error){ if(attempt===0){ await new Promise(r=>setTimeout(r,500)); continue; } toast('Erro ao carregar tarefas: '+error.message,'error'); return; }
      tasks=(data||[]).map(dbToTask);
      renderBoard(); renderCal(); renderPeople();
      checkNotifications();
      updateBadge();
      return;
    } catch(e){ if(attempt===0) await new Promise(r=>setTimeout(r,500)); }
  }
  toast('Falha ao carregar tarefas. Verifique sua conexão.','error');
}

function dbToTask(r){
  return { id:r.id, title:r.title, person:r.person, dueDate:r.due_date, priority:r.priority, tipo:r.tipo, context:r.context||'', done:r.done, notes:r.notes||'', recurrence:r.recurrence||null };
}

async function sbUpsert(t){
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const row={ id:String(t.id), title:t.title, person:t.person, due_date:t.dueDate||null, priority:t.priority, tipo:t.tipo, context:t.context||'', done:t.done, notes:t.notes||'', recurrence:t.recurrence||null, owner_id:_currentSession.user.id };
  const { error }=await sb.from('cmd_tasks').upsert(row,{onConflict:'id'});
  if(error) toast('Erro ao salvar: '+error.message,'error');
}

function nextRecurrenceDate(dueDate, recurrence){
  const d=new Date(dueDate+'T12:00:00');
  if(recurrence==='daily') d.setDate(d.getDate()+1);
  else if(recurrence==='weekly') d.setDate(d.getDate()+7);
  else if(recurrence==='monthly') d.setMonth(d.getMonth()+1);
  return isoDate(d);
}

async function sbDelete(id){
  const { error }=await sb.from('cmd_tasks').delete().eq('id',String(id));
  if(error) toast('Erro ao excluir: '+error.message,'error');
}

async function saveMeeting(title, participants, date, transcript, ata, demands){
  if(!_currentSession){ toast('Sessão expirada','error'); return null; }
  const { data: meeting, error }=await sb.from('cmd_meetings').insert({
    title, participants, meeting_date:date||isoToday, transcript, ata, owner_id:_currentSession.user.id
  }).select().single();
  if(error){ toast('Erro ao salvar reunião','error'); return null; }
  if(demands?.length && meeting){
    const rows=demands.map(d=>({ meeting_id:meeting.id, task_id:null, title:d.titulo, person:d.responsavel||'lucas', priority:d.prioridade||'media', tipo:d.tipo||'delegada', owner_id:_currentSession.user.id }));
    await sb.from('cmd_meeting_demands').insert(rows);
  }
  return meeting;
}

// ══════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════
function checkNotifications(){
  const newNotifs=[];
  tasks.filter(t=>!t.done).forEach(t=>{
    // Due date notifications
    if(isOverdue(t.dueDate)){
      newNotifs.push({ id:'ov-'+t.id, type:'alta', text:`<strong>${esc(t.title)}</strong> está atrasada — prazo era ${formatDate(t.dueDate)}`, time:'Agora', taskId:t.id, read:false });
    } else if(isToday(t.dueDate)){
      newNotifs.push({ id:'td-'+t.id, type:'media', text:`<strong>${esc(t.title)}</strong> vence <strong>hoje</strong>`, time:'Hoje', taskId:t.id, read:false });
    } else if(t.dueDate===isoDate(addDays(today,1))){
      newNotifs.push({ id:'tm-'+t.id, type:'info', text:`<strong>${esc(t.title)}</strong> vence <strong>amanhã</strong>`, time:'Amanhã', taskId:t.id, read:false });
    }
    // Follow-up cadence (2→5→7 days) for delegated tasks
    if(t.tipo==='delegada'){
      const ref=t.dueDate||isoToday;
      const days=Math.floor((today-new Date(ref+'T12:00:00'))/(1000*60*60*24));
      const p=person(t.person);
      if(days>=7){
        newNotifs.push({ id:'fu7-'+t.id, type:'alta', text:`⚠️ <strong>${esc(t.title)}</strong> — 7+ dias sem retorno de ${esc(p.name)}. Cobrar ou reavaliar.`, time:'Dia '+days, taskId:t.id, read:false });
      } else if(days>=5){
        newNotifs.push({ id:'fu5-'+t.id, type:'media', text:`📋 <strong>${esc(t.title)}</strong> — 5 dias delegada a ${esc(p.name)}. Follow-up direto recomendado.`, time:'Dia '+days, taskId:t.id, read:false });
      } else if(days>=2){
        newNotifs.push({ id:'fu2-'+t.id, type:'info', text:`💬 <strong>${esc(t.title)}</strong> — 2+ dias com ${esc(p.name)}. Verificar andamento.`, time:'Dia '+days, taskId:t.id, read:false });
      }
    }
  });
  // Merge — não duplicar
  newNotifs.forEach(n=>{
    if(!notifications.find(x=>x.id===n.id)) notifications.unshift(n);
  });
  renderNotifs();
}

function scheduleNotifCheck(){
  checkNotifications();
  setInterval(checkNotifications, 5*60*1000);
}

// ══════════════════════════════════════════════
// MORNING BRIEFING
// ══════════════════════════════════════════════
function showBriefing(){
  const overdue=tasks.filter(t=>!t.done && isOverdue(t.dueDate));
  const todayTasks=tasks.filter(t=>!t.done && isToday(t.dueDate));
  const upcoming=tasks.filter(t=>{
    if(!t.dueDate||t.done) return false;
    const d=new Date(t.dueDate+'T12:00:00');
    const diff=(d-today)/(1000*60*60*24);
    return diff>0 && diff<=3;
  });
  const followups=tasks.filter(t=>{
    if(t.done||t.tipo!=='delegada') return false;
    // tasks without due date or old ones
    return true;
  }).filter(t=>{
    const created=t._created||t.dueDate||isoToday;
    const days=Math.floor((today-new Date(created+'T12:00:00'))/(1000*60*60*24));
    return days>=2;
  });

  document.getElementById('briefing-date').textContent=today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();

  let html='';

  // Overdue
  html+=`<div class="briefing-section"><div class="briefing-section-title"><span class="dot" style="background:var(--rust)"></span>Atrasadas <span class="briefing-count">${overdue.length}</span></div>`;
  if(overdue.length) overdue.slice(0,5).forEach(t=>{
    const p=person(t.person);
    html+=`<div class="briefing-item overdue"><div style="flex:1"><div>${esc(t.title)}</div><div class="briefing-item-meta">${esc(p.name)} · ${formatDate(t.dueDate)} · <span class="tag ${t.priority}" style="font-size:9px">${t.priority.toUpperCase()}</span></div></div></div>`;
  });
  else html+=`<div class="briefing-empty">Nenhuma tarefa atrasada</div>`;
  html+=`</div>`;

  // Today
  html+=`<div class="briefing-section"><div class="briefing-section-title"><span class="dot" style="background:var(--saff)"></span>Hoje <span class="briefing-count">${todayTasks.length}</span></div>`;
  if(todayTasks.length) todayTasks.forEach(t=>{
    const p=person(t.person);
    html+=`<div class="briefing-item today"><div style="flex:1"><div>${esc(t.title)}</div><div class="briefing-item-meta">${esc(p.name)} · <span class="tag ${t.priority}" style="font-size:9px">${t.priority.toUpperCase()}</span> · ${t.tipo==='minha'?'Eu faço':'Delegada'}</div></div></div>`;
  });
  else html+=`<div class="briefing-empty">Nenhuma tarefa para hoje</div>`;
  html+=`</div>`;

  // Upcoming
  html+=`<div class="briefing-section"><div class="briefing-section-title"><span class="dot" style="background:var(--acc)"></span>Próximos 3 dias <span class="briefing-count">${upcoming.length}</span></div>`;
  if(upcoming.length) upcoming.slice(0,5).forEach(t=>{
    const p=person(t.person);
    html+=`<div class="briefing-item upcoming"><div style="flex:1"><div>${esc(t.title)}</div><div class="briefing-item-meta">${esc(p.name)} · ${formatDate(t.dueDate)}</div></div></div>`;
  });
  else html+=`<div class="briefing-empty">Nada nos próximos 3 dias</div>`;
  html+=`</div>`;

  // Follow-ups
  if(followups.length){
    html+=`<div class="briefing-section"><div class="briefing-section-title"><span class="dot" style="background:var(--bronze)"></span>Follow-ups pendentes <span class="briefing-count">${followups.length}</span></div>`;
    followups.slice(0,5).forEach(t=>{
      const p=person(t.person);
      const created=t._created||t.dueDate||isoToday;
      const days=Math.floor((today-new Date(created+'T12:00:00'))/(1000*60*60*24));
      html+=`<div class="briefing-item followup"><div style="flex:1"><div>${esc(t.title)}</div><div class="briefing-item-meta">Delegada a ${esc(p.name)} · ${days} dias sem update</div></div></div>`;
    });
    html+=`</div>`;
  }

  document.getElementById('briefing-body').innerHTML=html;
  document.getElementById('briefing-overlay').classList.add('open');
}

function closeBriefing(){
  document.getElementById('briefing-overlay').classList.remove('open');
}

function renderNotifs(){
  const unread=notifications.filter(n=>!n.read).length;
  const cnt=document.getElementById('notif-count');
  if(unread>0){ cnt.textContent=unread>9?'9+':unread; cnt.classList.add('show'); }
  else { cnt.classList.remove('show'); }

  const list=document.getElementById('notif-list');
  if(!notifications.length){ list.innerHTML='<div class="notif-empty">Nenhuma notificação</div>'; return; }
  list.innerHTML=notifications.slice(0,20).map(n=>`
    <button class="notif-item ${n.read?'':'unread'}" onclick="clickNotif('${n.id}',${n.taskId?`'${n.taskId}'`:'null'})">
      <span class="notif-dot ${n.type}" aria-hidden="true"></span>
      <span style="flex:1">
        <span class="notif-text">${n.text}</span>
        <span class="notif-time">${n.time}</span>
      </span>
    </button>`).join('');
}

function clickNotif(nid, taskId){
  const n=notifications.find(x=>x.id===nid);
  if(n) n.read=true;
  renderNotifs();
  if(taskId){ switchNav('board', document.querySelector('.nav-item')); openPanel(taskId); }
  toggleNotifPanel();
}

function toggleNotifPanel(){
  notifOpen=!notifOpen;
  document.getElementById('notif-panel').classList.toggle('open', notifOpen);
}

function clearNotifs(){
  notifications=[];
  renderNotifs();
}

// Close notif panel on outside click
document.addEventListener('click', e=>{
  const panel=document.getElementById('notif-panel');
  const bell=document.getElementById('notif-bell');
  if(notifOpen && !panel.contains(e.target) && !bell.contains(e.target)){
    notifOpen=false;
    panel.classList.remove('open');
  }
});

// ══════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════
const NAV_TITLES={ board:'Tarefas', calendar:'Calendário', people:'Por Pessoa', transcription:'Transcrição', '11':'1:1s com o Time', reunioes:'Reuniões', whatsapp:'WhatsApp · Disparos Oficiais' };

function switchNav(view, el){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.getElementById('topbar-title').textContent=NAV_TITLES[view];
  currentView=view;
  if(view==='calendar') renderCal();
  if(view==='people') renderPeople();
  if(view==='11') renderOneOne();
  if(view==='reunioes') renderMeetingsList();
  if(view==='whatsapp') renderWhatsApp();
  // Close mobile nav
  if(window.innerWidth<=768){ document.getElementById('main-nav').classList.remove('open'); document.getElementById('nav-overlay').classList.remove('open'); }
}

function toggleNav(){
  document.getElementById('main-nav').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('open');
}

function updateBadge(){
  document.getElementById('nav-badge-board').textContent=tasks.filter(t=>!t.done).length;
}

// ══════════════════════════════════════════════
// BOARD
// ══════════════════════════════════════════════
// Column dot colors — semantic, using Officio tokens
const COL_CONFIG=[
  { id:'atrasadas', label:'Atrasadas',         color:'var(--rust)'   },
  { id:'hoje',      label:'Hoje',              color:'var(--saff)'   },
  { id:'proximos',  label:'Próximos 2 dias',   color:'var(--bronze)' },
  { id:'semana',    label:'Esta semana',       color:'var(--acc)'    },
  { id:'depois',    label:'Depois',            color:'var(--t3)'     },
];

function getCol(dueDate){
  if(!dueDate) return 'depois';
  const diff=Math.ceil((new Date(dueDate+'T12:00:00')-today)/86400000);
  if(diff<0) return 'atrasadas';
  if(diff===0) return 'hoje';
  if(diff<=2) return 'proximos';
  if(diff<=7) return 'semana';
  return 'depois';
}

function filterTask(t){
  if(boardFilter==='alta' && t.priority!=='alta') return false;
  if(boardFilter==='media' && t.priority!=='media') return false;
  if(boardFilter==='baixa' && t.priority!=='baixa') return false;
  if(boardFilter==='minha' && t.tipo!=='minha') return false;
  if(boardFilter==='delegada' && t.tipo!=='delegada') return false;
  if(searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase())) return false;
  return true;
}

function renderBoard(){
  const wrap=document.getElementById('board-columns');
  wrap.innerHTML='';
  updateBadge();
  COL_CONFIG.forEach(cc=>{
    const open=tasks.filter(t=>!t.done && getCol(t.dueDate)===cc.id && filterTask(t)).sort((a,b)=>{
      const da=a.dueDate||'9999-99-99', db=b.dueDate||'9999-99-99';
      if(da!==db) return da<db?-1:1;
      const pw={alta:3,media:2,baixa:1};
      return (pw[b.priority]||0)-(pw[a.priority]||0);
    });
    const done=tasks.filter(t=>t.done && getCol(t.dueDate)===cc.id);
    const col=document.createElement('div');
    col.className='col';
    col.innerHTML=`
      <div class="col-head"><div class="col-head-left"><div class="col-dot" style="background:${cc.color}"></div><span class="col-name">${cc.label}</span></div><span class="col-ct">${open.length}</span></div>
      <button class="col-add" onclick="openTaskModal()" aria-label="Adicionar tarefa">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Adicionar
      </button>
      <div class="col-body">
        ${open.map(cardHTML).join('')}
        ${done.length?`<div class="done-sep">✓ Concluídas (${done.length})</div>${done.map(cardDoneHTML).join('')}`:''}
      </div>`;
    wrap.appendChild(col);
  });
}

function followupBadge(t){
  if(t.tipo!=='delegada'||t.done) return '';
  const ref=t.dueDate||isoToday;
  const days=Math.floor((today-new Date(ref+'T12:00:00'))/(1000*60*60*24));
  if(days>=7) return `<span class="tag" style="background:var(--rust-bg);color:var(--rust);font-size:9px;font-weight:600">Dia ${days}</span>`;
  if(days>=5) return `<span class="tag" style="background:var(--org2);color:var(--org);font-size:9px">Dia ${days}</span>`;
  if(days>=2) return `<span class="tag" style="background:var(--acc2);color:var(--acc);font-size:9px">Dia ${days}</span>`;
  return '';
}

function cardHTML(t){
  const p=person(t.person);
  const over=isOverdue(t.dueDate), tod=isToday(t.dueDate);
  const fub=followupBadge(t);
  return `
    <div class="card p-${t.priority} t-${t.tipo}" role="button" tabindex="0" aria-label="Tarefa: ${esc(t.title)}" onclick="openPanel('${t.id}')" onkeydown="kbd(event)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:7px">
        <div class="card-title">${esc(t.title)}</div>
        <button class="card-check" aria-label="${t.done?'Marcar como não feito':'Marcar como concluído'}" onclick="event.stopPropagation();toggleDone('${t.id}')"></button>
      </div>
      <div class="card-tags">
        <span class="tag ${t.priority}">${t.priority==='alta'?'▲':t.priority==='media'?'●':'▼'} ${t.priority.toUpperCase()}</span>
        ${t.context?`<span class="tag origem">${esc(t.context)}</span>`:''}
        <span class="tag dt ${over?'overdue':tod?'overdue':''}">${formatDate(t.dueDate)}</span>
        ${fub}
        ${t.recurrence?`<span class="tag" style="background:var(--moss-bg);color:var(--moss);font-size:9px">↻ ${t.recurrence==='daily'?'Diária':t.recurrence==='weekly'?'Semanal':'Mensal'}</span>`:''}
      </div>
      <div class="card-foot"><div class="card-person">${av(p,18)} ${esc(p.name)}</div></div>
    </div>`;
}

function cardDoneHTML(t){
  return `
    <div class="card" style="opacity:.4">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div class="card-title" style="text-decoration:line-through;color:var(--t3)">${esc(t.title)}</div>
        <button class="card-check done" aria-label="Marcar como não feito" onclick="event.stopPropagation();toggleDone('${t.id}')">
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 5l2.5 2.5L8 3" stroke="var(--acc-on)" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
}

async function toggleDone(id){
  const t=tasks.find(t=>t.id===id); if(!t) return;
  t.done=!t.done;
  renderBoard(); if(currentView==='calendar') renderCal(); if(currentView==='people') renderPeople();
  await sbUpsert(t);
  if(t.done){
    toast('Tarefa concluída ✓');
    // Create next occurrence for recurring tasks
    if(t.recurrence && t.dueDate){
      const next={ id:crypto.randomUUID(), title:t.title, person:t.person, dueDate:nextRecurrenceDate(t.dueDate,t.recurrence), priority:t.priority, tipo:t.tipo, context:t.context, done:false, notes:'', recurrence:t.recurrence };
      tasks.unshift(next);
      await sbUpsert(next);
      renderBoard(); if(currentView==='calendar') renderCal();
      toast(`Próxima ocorrência: ${formatDate(next.dueDate)}`);
    }
  }
}

// ══════════════════════════════════════════════
// PANEL
// ══════════════════════════════════════════════
function openPanel(id){
  const t=tasks.find(t=>t.id===id); if(!t) return;
  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('sp-body').innerHTML=`
    <div class="sp-field"><span class="sp-label" id="sp-title-label-${id}">Título</span><div class="sp-val" contenteditable="true" role="textbox" aria-labelledby="sp-title-label-${id}" onblur="updateField('${id}','title',this.textContent.trim())">${esc(t.title)}</div></div>
    <div class="sp-field"><span class="sp-label" id="sp-prio-label-${id}">Prioridade</span>
      <div class="prio-row" role="group" aria-labelledby="sp-prio-label-${id}">
        <button class="pbtn alta ${t.priority==='alta'?'sel':''}" aria-pressed="${t.priority==='alta'}" onclick="updateField('${id}','priority','alta')">Alta</button>
        <button class="pbtn media ${t.priority==='media'?'sel':''}" aria-pressed="${t.priority==='media'}" onclick="updateField('${id}','priority','media')">Média</button>
        <button class="pbtn baixa ${t.priority==='baixa'?'sel':''}" aria-pressed="${t.priority==='baixa'}" onclick="updateField('${id}','priority','baixa')">Baixa</button>
      </div>
    </div>
    <div class="sp-field"><span class="sp-label" id="sp-tipo-label-${id}">Tipo</span>
      <div class="tipo-row" role="group" aria-labelledby="sp-tipo-label-${id}">
        <button class="tbtn minha ${t.tipo==='minha'?'sel':''}" aria-pressed="${t.tipo==='minha'}" onclick="updateField('${id}','tipo','minha')">Eu faço</button>
        <button class="tbtn delegada ${t.tipo==='delegada'?'sel':''}" aria-pressed="${t.tipo==='delegada'}" onclick="updateField('${id}','tipo','delegada')">Delegada</button>
      </div>
    </div>
    <div class="sp-field"><span class="sp-label" id="sp-resp-label-${id}">Responsável</span>
      <div class="assign-wrap" role="group" aria-labelledby="sp-resp-label-${id}">${PEOPLE.map(p=>`<button class="asbtn ${t.person===p.id?'sel':''}" aria-pressed="${t.person===p.id}" onclick="updateField('${id}','person','${p.id}')">${av(p,14)} ${esc(p.name)}</button>`).join('')}</div>
    </div>
    <label class="sp-field"><span class="sp-label">Data do Prazo</span><input type="date" class="date-input" value="${t.dueDate||''}" onchange="updateField('${id}','dueDate',this.value)"></label>
    <label class="sp-field"><span class="sp-label">Origem / Reunião</span><input class="date-input" value="${esc(t.context||'')}" placeholder="Ex: 1:1 Junior" onblur="updateField('${id}','context',this.value)" style="font-family:var(--font-body)"></label>
    ${t.recurrence?`<label class="sp-field"><span class="sp-label">Recorrência</span><select class="date-input" onchange="updateField('${id}','recurrence',this.value||null)"><option value="">Nenhuma</option><option value="daily" ${t.recurrence==='daily'?'selected':''}>Diária</option><option value="weekly" ${t.recurrence==='weekly'?'selected':''}>Semanal</option><option value="monthly" ${t.recurrence==='monthly'?'selected':''}>Mensal</option></select></label>`:''}
    <label class="sp-field"><span class="sp-label">Notas</span><textarea class="sp-notes" placeholder="Próximos passos..." onblur="updateField('${id}','notes',this.value)">${esc(t.notes||'')}</textarea></label>
    <button class="sp-del" onclick="deleteTask('${id}')">Excluir tarefa</button>
  `;
}

function closePanel(){ document.getElementById('detail-overlay').classList.remove('open'); }

async function updateField(id, field, val){
  const t=tasks.find(t=>t.id===id); if(!t) return;
  t[field]=val;
  renderBoard(); if(currentView==='calendar') renderCal(); if(currentView==='people') renderPeople();
  openPanel(id);
  await sbUpsert(t);
}

async function deleteTask(id){
  tasks=tasks.filter(t=>t.id!==id);
  closePanel(); renderBoard(); updateBadge();
  await sbDelete(id);
  toast('Tarefa excluída');
}

// ══════════════════════════════════════════════
// FILTERS
// ══════════════════════════════════════════════
function setFilter(f,el){ boardFilter=f; document.querySelectorAll('#view-board .fchip').forEach(c=>c.classList.remove('on')); el.classList.add('on'); renderBoard(); }
function setPeopleFilter(f,el){ peopleFilter=f; document.querySelectorAll('#view-people .fchip').forEach(c=>c.classList.remove('on')); el.classList.add('on'); renderPeople(); }
function setPeopleSort(s,el){
  peopleSort=s;
  try{ localStorage.setItem('tasks_people_sort', s); }catch(_){}
  document.querySelectorAll('#view-people .seg-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  renderPeople();
}

// ══════════════════════════════════════════════
// PEOPLE VIEW
// ══════════════════════════════════════════════
let peopleDragIdx=null;
const PRI_W={alta:3,media:2,baixa:1};
function sortByDateThenPri(a,b){
  const da=a.dueDate||'9999-99-99', db=b.dueDate||'9999-99-99';
  if(da!==db) return da<db?-1:1;
  return (PRI_W[b.priority]||0)-(PRI_W[a.priority]||0);
}
function sortByPriThenDate(a,b){
  const pri=(PRI_W[b.priority]||0)-(PRI_W[a.priority]||0);
  if(pri!==0) return pri;
  const da=a.dueDate||'9999-99-99', db=b.dueDate||'9999-99-99';
  return da<db?-1:(da>db?1:0);
}
function groupPersonTasks(pt){
  const sevenOut=isoDate(addDays(today,7));
  const g={atrasadas:[],hoje:[],semana:[],breve:[]};
  for(const t of pt){
    const d=t.dueDate;
    if(isOverdue(d)) g.atrasadas.push(t);
    else if(isToday(d)) g.hoje.push(t);
    else if(d && d<=sevenOut) g.semana.push(t);
    else g.breve.push(t);
  }
  g.atrasadas.sort(sortByDateThenPri);
  g.hoje.sort((a,b)=>(PRI_W[b.priority]||0)-(PRI_W[a.priority]||0));
  g.semana.sort(sortByDateThenPri);
  g.breve.sort(sortByDateThenPri);
  return g;
}
function personGroupHTML(label,kind,items){
  if(!items.length) return '';
  return `<div class="group-sep ${kind}"><span class="lbl">${label}</span><span class="ct">${items.length}</span></div>`+items.map(t=>personCardHTML(t)).join('');
}
function renderPeople(){
  const wrap=document.getElementById('people-board'); wrap.innerHTML='';
  PEOPLE.forEach((p,idx)=>{
    let pt=tasks.filter(t=>t.person===p.id&&!t.done);
    if(peopleFilter==='alta') pt=pt.filter(t=>t.priority==='alta');
    if(peopleFilter==='media') pt=pt.filter(t=>t.priority==='media');
    if(peopleFilter==='baixa') pt=pt.filter(t=>t.priority==='baixa');
    if(peopleQ) pt=pt.filter(t=>t.title.toLowerCase().includes(peopleQ.toLowerCase()));
    let bodyHTML='';
    if(peopleSort==='prioridade'){
      bodyHTML=[...pt].sort(sortByPriThenDate).map(t=>personCardHTML(t)).join('');
    } else {
      const g=groupPersonTasks(pt);
      bodyHTML+=personGroupHTML('Atrasadas','atrasadas',g.atrasadas);
      bodyHTML+=personGroupHTML('Hoje','hoje',g.hoje);
      bodyHTML+=personGroupHTML('Esta semana','semana',g.semana);
      bodyHTML+=personGroupHTML('Em breve','breve',g.breve);
    }
    const done=tasks.filter(t=>t.person===p.id&&t.done);
    const col=document.createElement('div'); col.className='person-col';
    col.draggable=true;
    col.dataset.idx=idx;
    col.addEventListener('dragstart',e=>{ peopleDragIdx=idx; col.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    col.addEventListener('dragend',()=>{ col.classList.remove('dragging'); document.querySelectorAll('.drag-over-col').forEach(el=>el.classList.remove('drag-over-col')); });
    col.addEventListener('dragover',e=>{ e.preventDefault(); col.classList.add('drag-over-col'); });
    col.addEventListener('dragleave',()=>col.classList.remove('drag-over-col'));
    col.addEventListener('drop',e=>{
      e.preventDefault(); col.classList.remove('drag-over-col');
      if(peopleDragIdx===null||peopleDragIdx===idx) return;
      const [moved]=PEOPLE.splice(peopleDragIdx,1);
      PEOPLE.splice(idx,0,moved);
      peopleDragIdx=null;
      saveOOState();
      renderPeople();
    });
    col.innerHTML=`
      <div class="person-col-head" style="cursor:grab"><div class="big-av" style="background:${p.bg};color:${p.color}">${p.init}</div>
        <div style="flex:1;min-width:0"><div class="person-col-name">${esc(p.name)}</div><div class="person-col-sub">${esc(p.role)}</div></div>
        <div class="col-ct">${pt.length}</div>
      </div>
      <button class="col-add" onclick="openTaskModal(null,'${p.id}')" aria-label="Adicionar tarefa para ${esc(p.name)}">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Adicionar
      </button>
      <div class="person-col-body">
        ${bodyHTML || `<div class="col-empty">Nada por aqui ainda.</div>`}
        ${done.length?`<div class="done-sep">✓ Concluídas (${done.length})</div>${done.slice(0,2).map(cardDoneHTML).join('')}`:''}
      </div>`;
    wrap.appendChild(col);
  });
}

function personCardHTML(t){
  const over=isOverdue(t.dueDate), tod=isToday(t.dueDate);
  return `
    <div class="card p-${t.priority} t-${t.tipo}" role="button" tabindex="0" aria-label="Tarefa: ${esc(t.title)}" onclick="openPanel('${t.id}')" onkeydown="kbd(event)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:7px">
        <div class="card-title">${esc(t.title)}</div>
        <button class="card-check" aria-label="${t.done?'Marcar como não feito':'Marcar como concluído'}" onclick="event.stopPropagation();toggleDone('${t.id}')"></button>
      </div>
      <div class="card-tags">
        <span class="tag ${t.priority}">${t.priority.toUpperCase()}</span>
        <span class="tag dt ${over||tod?'overdue':''}">${formatDate(t.dueDate)}</span>
        ${t.context?`<span class="tag origem">${esc(t.context)}</span>`:''}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════
function setCalView(v){ calView=v; document.getElementById('cvbtn-month').classList.toggle('active',v==='month'); document.getElementById('cvbtn-week').classList.toggle('active',v==='week'); renderCal(); }
function calNav(dir){ if(calView==='month') calDate=new Date(calDate.getFullYear(),calDate.getMonth()+dir,1); else calDate=addDays(calDate,dir*7); renderCal(); }
function calToday(){ calDate=new Date(today.getFullYear(),today.getMonth(),1); renderCal(); }

function renderCal(){
  const body=document.getElementById('cal-body');
  const per=document.getElementById('cal-period');
  if(calView==='month'){
    const yr=calDate.getFullYear(), mo=calDate.getMonth();
    per.textContent=new Date(yr,mo,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    const startDow=new Date(yr,mo,1).getDay();
    const dim=new Date(yr,mo+1,0).getDate();
    const DAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    let html=`<div class="cal-month"><div class="cal-month-head">${DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join('')}</div><div class="cal-grid">`;
    for(let i=0;i<startDow;i++){ const pd=new Date(yr,mo,-(startDow-1-i)); html+=`<div class="cal-cell other-month"><span class="cal-day-num">${pd.getDate()}</span></div>`; }
    for(let d=1;d<=dim;d++){
      const cd=isoDate(new Date(yr,mo,d)), isT=cd===isoToday;
      const dt=tasks.filter(t=>t.dueDate===cd&&!t.done).sort((a,b)=>a.priority==='alta'?-1:1);
      html+=`<div class="cal-cell ${isT?'today':''}" role="button" tabindex="0" aria-label="Tarefas de ${d}" onclick="openCalDayPopup('${cd}',${d})" onkeydown="kbd(event)"><span class="cal-day-num">${d}</span>`;
      dt.slice(0,3).forEach(t=>{ html+=`<button class="cal-task-pill ${t.priority}" onclick="event.stopPropagation();openPanel('${t.id}')">${esc(t.title)}</button>`; });
      if(dt.length>3) html+=`<div class="cal-more">+${dt.length-3} mais</div>`;
      html+=`</div>`;
    }
    const rem=(7-(startDow+dim)%7)%7;
    for(let i=1;i<=rem;i++) html+=`<div class="cal-cell other-month"><span class="cal-day-num">${i}</span></div>`;
    html+=`</div></div>`; body.innerHTML=html;
  } else {
    const dow=calDate.getDay(), ws=addDays(calDate,-dow);
    per.textContent=`${ws.toLocaleDateString('pt-BR',{day:'numeric',month:'short'})} — ${addDays(ws,6).toLocaleDateString('pt-BR',{day:'numeric',month:'short',year:'numeric'})}`;
    const DAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    let html=`<div class="cal-month"><div class="cal-month-head" style="grid-template-columns:50px repeat(7,1fr)"><div></div>`;
    for(let d=0;d<7;d++){ const wd=addDays(ws,d); html+=`<div class="cal-dow ${isoDate(wd)===isoToday?'':''}">` +DAYS[d]+' '+wd.getDate()+'</div>'; }
    html+=`</div><div class="cal-grid" style="grid-template-columns:50px repeat(7,1fr)">`;
    // All-day tasks row
    html+=`<div style="font-family:var(--font-mono);font-size:9px;color:var(--t4);padding:6px;text-align:right;border-right:1px solid var(--b1);border-bottom:1px solid var(--b2);background:var(--s1)">Tarefas</div>`;
    for(let d=0;d<7;d++){
      const wd=addDays(ws,d), cd=isoDate(wd);
      const dt=tasks.filter(t=>t.dueDate===cd&&!t.done);
      html+=`<div style="border-right:1px solid var(--b1);border-bottom:1px solid var(--b2);padding:4px;background:var(--s1);${isoDate(wd)===isoToday?'background:var(--acc3)':''}">`;
      dt.forEach(t=>{ html+=`<button class="cal-task-pill ${t.priority}" onclick="openPanel('${t.id}')" style="margin-bottom:3px;width:100%">${esc(t.title)}</button>`; });
      if(!dt.length) html+=`<div style="font-size:10px;color:var(--t4);padding:2px">—</div>`;
      html+=`</div>`;
    }
    // Hour rows
    for(let h=8;h<=19;h++){
      html+=`<div style="font-family:var(--font-mono);font-size:9px;color:var(--t4);padding:4px 6px;text-align:right;border-right:1px solid var(--b1);border-bottom:1px solid var(--b1)">${h}h</div>`;
      for(let d=0;d<7;d++){
        const wd=addDays(ws,d);
        html+=`<div style="border-right:1px solid var(--b1);border-bottom:1px solid var(--b1);min-height:48px;padding:3px;${isoDate(wd)===isoToday?'background:var(--acc3)':''}"></div>`;
      }
    }
    html+=`</div></div>`; body.innerHTML=html;
  }
}

function openCalDayPopup(dateStr, dayNum){
  const dt=tasks.filter(t=>t.dueDate===dateStr&&!t.done).sort((a,b)=>a.priority==='alta'?-1:1);
  const done=tasks.filter(t=>t.dueDate===dateStr&&t.done);
  const dateLabel=new Date(dateStr+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});

  let html=dt.map(t=>{
    const p=person(t.person);
    return `<div class="card p-${t.priority} t-${t.tipo}" role="button" tabindex="0" aria-label="Tarefa: ${esc(t.title)}" onclick="event.stopPropagation();document.getElementById('cal-day-popup').remove();openPanel('${t.id}')" onkeydown="kbd(event)" style="margin-bottom:6px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:7px">
        <div class="card-title">${esc(t.title)}</div>
        <button class="card-check" aria-label="Marcar como concluído" onclick="event.stopPropagation();toggleDone('${t.id}');document.getElementById('cal-day-popup')?.remove()"></button>
      </div>
      <div class="card-tags">
        <span class="tag ${t.priority}">${t.priority==='alta'?'▲':t.priority==='media'?'●':'▼'} ${t.priority.toUpperCase()}</span>
        ${t.context?`<span class="tag origem">${esc(t.context)}</span>`:''}
      </div>
      <div class="card-foot"><div class="card-person">${av(p,16)} ${esc(p.name)}</div></div>
    </div>`;
  }).join('');

  if(done.length){
    html+=`<div class="done-sep" style="margin:6px 0">✓ Concluídas (${done.length})</div>`;
    done.forEach(t=>{
      html+=`<div class="card" style="opacity:.4;margin-bottom:4px"><div style="display:flex;align-items:center;gap:6px"><div class="card-title" style="text-decoration:line-through;color:var(--t3)">${esc(t.title)}</div></div></div>`;
    });
  }

  if(!dt.length && !done.length){
    html=`<div style="text-align:center;color:var(--t4);padding:16px 0;font-size:12px">Nenhuma tarefa neste dia</div>`;
  }

  document.body.insertAdjacentHTML('beforeend',`
    <div class="detail-overlay open" id="cal-day-popup" onclick="if(event.target===this)this.remove()">
      <div class="side-panel" style="width:380px" role="dialog" aria-modal="true" aria-labelledby="cal-day-popup-title">
        <div class="sp-head">
          <span class="sp-title" id="cal-day-popup-title" style="text-transform:capitalize">${esc(dateLabel)}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="oo-manage-btn" onclick="event.stopPropagation();document.getElementById('cal-day-popup').remove();openTaskModal(null,null,'${dateStr}')" aria-label="Nova tarefa" title="Nova tarefa">+</button>
            <button class="sp-close" onclick="document.getElementById('cal-day-popup').remove()" aria-label="Fechar">✕</button>
          </div>
        </div>
        <div class="sp-body">${html}</div>
      </div>
    </div>`);
}

// ══════════════════════════════════════════════
// TASK MODAL
// ══════════════════════════════════════════════
function openTaskModal(_, personHint, dateHint){
  // Reset form state
  document.getElementById('m-title').value='';
  document.getElementById('m-context').value='';
  mPrio='media'; mTipo='delegada';
  document.querySelectorAll('#task-modal .pbtn').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-pressed','false')});
  const mediaBtn=document.querySelector('#task-modal .pbtn.media'); mediaBtn.classList.add('sel'); mediaBtn.setAttribute('aria-pressed','true');
  document.querySelectorAll('#task-modal .tbtn').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-pressed','false')});
  const delBtn=document.querySelector('#task-modal .tbtn.delegada'); delBtn.classList.add('sel'); delBtn.setAttribute('aria-pressed','true');
  // Update person select from PEOPLE
  const sel=document.getElementById('m-person');
  sel.innerHTML=PEOPLE.map(p=>`<option value="${p.id}">${esc(p.name)}${p.id==='lucas'?' (você)':''}</option>`).join('');
  document.getElementById('m-recurrence').value='';
  if(personHint) sel.value=personHint;
  if(dateHint) document.getElementById('m-date').value=dateHint;
  else document.getElementById('m-date').value=isoToday;
  openModal('task-modal');
  setTimeout(()=>document.getElementById('m-title').focus(),50);
}
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function closeModalOut(e,id){ if(e.target.id===id) closeModal(id); }
function mSelPrio(p,el){ mPrio=p; document.querySelectorAll('#task-modal .pbtn').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-pressed','false')}); el.classList.add('sel'); el.setAttribute('aria-pressed','true'); }
function mSelTipo(t,el){ mTipo=t; document.querySelectorAll('#task-modal .tbtn').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-pressed','false')}); el.classList.add('sel'); el.setAttribute('aria-pressed','true'); }

async function addTask(){
  const title=document.getElementById('m-title').value.trim();
  if(!title){ toast('Preencha o título','error'); return; }
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const newId=crypto.randomUUID();
  const rec=document.getElementById('m-recurrence').value||null;
  const t={ id:newId, title, person:document.getElementById('m-person').value, dueDate:document.getElementById('m-date').value, priority:mPrio, tipo:mTipo, context:document.getElementById('m-context').value, done:false, notes:'', recurrence:rec };
  tasks.unshift(t);
  closeModal('task-modal');
  document.getElementById('m-title').value=''; document.getElementById('m-context').value='';
  renderBoard(); if(currentView==='calendar') renderCal(); if(currentView==='people') renderPeople();
  toast('Tarefa criada');
  await sbUpsert(t);
  checkNotifications();
}

// ══════════════════════════════════════════════
// TRANSCRIPTION (via Edge Function — sem key exposta)
// ══════════════════════════════════════════════
let recStream2=null, isRecording=false, whisperProcessing=false;
let audioChunks=[];
let recMimeType='audio/webm';
let whisperInterval=null;

function getTransText(){ return document.getElementById('trans-text'); }
function getTranscriptContent(){ return getTransText().value.trim(); }
function updateWordCount(){
  const text=getTranscriptContent();
  const words=text?text.split(/\s+/).length:0;
  const el=document.getElementById('trans-word-count');
  if(el) el.textContent=words+' palavras';
}

function showTransTextarea(){
  document.getElementById('transcript-empty').style.display='none';
  const ta=getTransText();
  ta.style.display='block';
}

async function sendBlobToWhisper(blob){
  if(!_currentSession||blob.size<1000) return;
  const liveEl=document.getElementById('trans-live-text');
  try {
    whisperProcessing=true;
    if(liveEl) liveEl.textContent='Transcrevendo...';
    const fd=new FormData();
    fd.append('file',blob,'audio.webm');
    const res=await fetch(`${SB_URL}/functions/v1/transcribe`,{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+_currentSession.access_token },
      body:fd
    });
    if(!res.ok) return;
    const data=await res.json();
    if(data.text?.trim()){
      const ta=getTransText();
      const sep=ta.value && !ta.value.endsWith('\n') && !ta.value.endsWith(' ')?' ':'';
      ta.value+=sep+data.text.trim();
      ta.scrollTop=ta.scrollHeight;
      updateWordCount();
      transcriptLines=[{id:'full',time:'',text:ta.value}];
    }
  } catch(e){ /* Whisper falhou — silencioso, transcrição apenas não avança */ }
  finally {
    whisperProcessing=false;
    if(liveEl && isRecording) liveEl.textContent='Ouvindo...';
  }
}

function startNewRecorder(){
  if(!recStream2||!isRecording) return;
  const chunks=[];
  recMimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
  mediaRecorder=new MediaRecorder(recStream2,{mimeType:recMimeType});
  mediaRecorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
  mediaRecorder.onstop=()=>{
    if(chunks.length){
      const blob=new Blob(chunks,{type:recMimeType});
      audioChunks.push(blob);
      sendBlobToWhisper(blob);
    }
  };
  mediaRecorder.start();
}

async function toggleRecording(){
  const btn=document.getElementById('rec-btn');
  if(!isRecording){
    try {
      recStream2=await navigator.mediaDevices.getUserMedia({audio:true});
      audioChunks=[];
      isRecording=true;

      // Start first recorder
      startNewRecorder();

      // Every 30s: stop current recorder (triggers onstop → send to Whisper) and start a new one
      whisperInterval=setInterval(()=>{
        if(!isRecording) return;
        if(mediaRecorder&&mediaRecorder.state==='recording') mediaRecorder.stop();
        startNewRecorder();
      },30000);

      showTransTextarea();
      getTransText().value='';
      btn.className='rec-btn recording';
      document.getElementById('rec-label').textContent='Parar Gravação';
      document.getElementById('rec-timer').style.display='block';
      document.getElementById('trans-live-bar').style.display='flex';
      const liveEl=document.getElementById('trans-live-text');
      if(liveEl) liveEl.textContent='Ouvindo...';
      startTimer();
      toast('Gravando — Whisper transcreve a cada 30s');
    } catch(e){ toast('Microfone bloqueado: '+e.message,'error'); }
  } else {
    stopRec();
    btn.className='rec-btn idle';
    document.getElementById('rec-label').textContent='Iniciar Gravação';
    document.getElementById('rec-timer').style.display='none';
    document.getElementById('trans-live-bar').style.display='none';
    clearInterval(recInterval);
    updateWordCount();
    toast('Gravação finalizada — edite o texto e clique em Gerar com IA');
  }
}

function startTimer(){
  recSeconds=0;
  recInterval=setInterval(()=>{
    recSeconds++;
    const m=Math.floor(recSeconds/60).toString().padStart(2,'0');
    const s=(recSeconds%60).toString().padStart(2,'0');
    document.getElementById('rec-timer').textContent=`${m}:${s}`;
  },1000);
}

function stopRec(){
  isRecording=false;
  if(whisperInterval){ clearInterval(whisperInterval); whisperInterval=null; }
  if(mediaRecorder&&mediaRecorder.state!=='inactive') mediaRecorder.stop(); // triggers onstop → sends final chunk
  if(recStream2){ recStream2.getTracks().forEach(t=>t.stop()); recStream2=null; }
  mediaRecorder=null;
}

async function refineWithWhisper(){
  if(!audioChunks.length){ toast('Nenhum áudio gravado para refinar','error'); return; }
  const ta=getTransText();
  const oldText=ta.value;
  ta.value='Refinando transcrição com Whisper (0/'+audioChunks.length+')...';
  ta.disabled=true;
  try {
    if(!_currentSession){ toast('Sessão expirada','error'); return; }
    let fullText='';
    for(let i=0;i<audioChunks.length;i++){
      ta.value='Refinando transcrição com Whisper ('+(i+1)+'/'+audioChunks.length+')...';
      const blob=audioChunks[i];
      if(blob.size<1000) continue;
      const fd=new FormData(); fd.append('file',blob,'audio.webm');
      const res=await fetch(`${SB_URL}/functions/v1/transcribe`,{
        method:'POST',
        headers:{ 'Authorization':'Bearer '+_currentSession.access_token },
        body:fd
      });
      if(!res.ok) continue;
      const data=await res.json();
      if(data.text?.trim()) fullText+=(fullText?' ':'')+data.text.trim();
    }
    if(fullText){
      ta.value=fullText;
      transcriptLines=[{id:'full',time:'',text:ta.value}];
      updateWordCount();
      toast('Transcrição refinada com Whisper');
    } else { ta.value=oldText; toast('Whisper não retornou texto','error'); }
  } catch(e){ ta.value=oldText; toast('Erro: '+e.message,'error'); }
  ta.disabled=false;
}

function clearTranscript(){
  const ta=getTransText();
  ta.value=''; ta.style.display='none';
  document.getElementById('transcript-empty').style.display='flex';
  document.getElementById('trans-live-bar').style.display='none';
  transcriptLines=[]; aiDemands=[]; audioChunks=[];
  updateWordCount();
  document.getElementById('trans-ai-area').innerHTML=`<div style="color:var(--t4);font-size:12px;line-height:1.7">Após gravar ou colar o transcript, clique em <strong style="color:var(--t2)">Gerar com IA</strong>.</div>`;
}

function pasteMode(){
  // Modal com textarea (substitui prompt nativo)
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="paste-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" onclick="event.stopPropagation()" style="width:560px;max-width:92vw" role="dialog" aria-modal="true" aria-labelledby="paste-modal-title">
        <h3 id="paste-modal-title">Colar transcrição</h3>
        <label for="paste-area" style="font-size:11px;color:var(--t3);font-family:var(--font-mono);letter-spacing:.05em;text-transform:uppercase">Texto da reunião</label>
        <textarea id="paste-area" class="oo-note-area" style="min-height:240px;font-size:13px" placeholder="Cole aqui o texto…" autofocus></textarea>
        <div class="oo-modal-btns">
          <button class="btn-sm" type="button" onclick="document.getElementById('paste-modal').remove()">Cancelar</button>
          <button class="btn-sm primary" type="button" id="paste-confirm">Importar</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('paste-modal');
  const ta=modal.querySelector('#paste-area');
  setTimeout(()=>ta.focus(),50);
  modal.querySelector('#paste-confirm').addEventListener('click',()=>{
    const txt=ta.value.trim();
    if(!txt){ modal.remove(); return; }
    modal.remove();
    showTransTextarea();
    const transTa=getTransText();
    transTa.value=txt;
    transcriptLines=[{id:'full',time:'',text:txt}];
    updateWordCount();
    toast('Transcrição importada');
  });
}

async function generateAI(){
  const fullText=getTranscriptContent();
  if(!fullText){ toast('Nenhum transcript disponível','error'); return; }
  const title=document.getElementById('meeting-title').value||'Reunião';
  const participants=document.getElementById('meeting-people').value||'time';
  const aiArea=document.getElementById('trans-ai-area');
  aiArea.innerHTML=`<div class="ai-loading"><div class="spinner"></div> Gerando ata e demandas com GPT-4o...</div>`;
  try {
    if(!_currentSession){ toast('Sessão expirada','error'); return; }
    const res=await fetch(`${SB_URL}/functions/v1/ai-meeting`,{
      method:'POST',
      headers:{ 'Authorization':'Bearer '+_currentSession.access_token, 'Content-Type':'application/json' },
      body:JSON.stringify({ transcript:fullText, title, participants })
    });
    const result=await res.json();
    if(result.error) throw new Error(result.error);
    aiDemands=result.demandas||[];
    renderAIResults(result.ata||'', aiDemands);
    toast('IA gerou ata e '+aiDemands.length+' demandas');
    // Salvar reunião no Supabase
    const date=document.getElementById('meeting-date').value;
    await saveMeeting(title, participants, date, fullText, result.ata||'', aiDemands);
  } catch(e){ aiArea.innerHTML=`<div style="color:var(--red);font-size:12px;padding:8px">Erro: ${e.message}</div>`; toast('Erro ao gerar IA','error'); }
}

function renderAIResults(ata, demands){
  let html=`<div class="ai-section-label">ATA EXECUTIVA</div><div class="ai-ata">${ata}</div><div class="ai-section-label" style="margin-top:10px">DEMANDAS (${demands.length})</div>`;
  demands.forEach((d,i)=>{
    const p=person(d.responsavel||'lucas');
    html+=`<div class="demand-item ${d.prioridade}" id="dem-${i}">
      <div style="flex:1"><div class="demand-text">${esc(d.titulo)}</div><div class="demand-meta"><span class="tag ${d.prioridade}">${d.prioridade.toUpperCase()}</span><span class="tag ${d.tipo}">${d.tipo==='minha'?'Eu faço':'Delegada'}</span>${av(p,14)}<span style="font-size:11px;color:var(--t2)">${esc(p.name)}</span></div></div>
      <button class="demand-check" id="dchk-${i}" aria-label="Marcar demanda" onclick="toggleDemand(${i})"></button>
    </div>`;
  });
  document.getElementById('trans-ai-area').innerHTML=html;
}

function toggleDemand(i){ const c=document.getElementById('dchk-'+i); c.classList.toggle('checked'); const on=c.classList.contains('checked'); c.innerHTML=on?`<svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="var(--acc-on)" stroke-width="1.5" stroke-linecap="round"/></svg>`:''; aiDemands[i]._skip=!on; }

async function addDemandsToBoard(){
  if(!aiDemands.length){ toast('Nenhuma demanda gerada','error'); return; }
  const meeting=document.getElementById('meeting-title').value||'Reunião';
  const date=document.getElementById('meeting-date').value||isoToday;
  let added=0;
  for(const d of aiDemands){
    if(d._skip) continue;
    const t={ id:crypto.randomUUID(), title:d.titulo, person:d.responsavel||'lucas', dueDate:date, priority:d.prioridade||'media', tipo:d.tipo||'delegada', context:meeting, done:false, notes:'' };
    tasks.unshift(t); added++;
    await sbUpsert(t);
  }
  renderBoard(); toast(added+' demandas enviadas ao board ✓'); checkNotifications();
}

// ══════════════════════════════════════════════
// 1:1
// ══════════════════════════════════════════════
// ── Persistence (Supabase + localStorage cache) ──
const OO_VERSION='v5';

function saveOOLocal(){
  localStorage.setItem('oo_ver',OO_VERSION);
  localStorage.setItem('oo_people',JSON.stringify(PEOPLE));
  localStorage.setItem('oo_data',JSON.stringify(oo11));
}

async function saveOOState(){
  saveOOLocal();
  try {
    const session=_currentSession;
    if(!session){ console.error('saveOO: NO SESSION'); toast('Sessão expirada — faça login novamente','error'); return; }
    const payload={ people:PEOPLE, oo_data:oo11, updated_at:new Date().toISOString() };
    const headers={ 'Content-Type':'application/json', 'apikey':SB_ANON, 'Authorization':'Bearer '+session.access_token, 'Prefer':'return=minimal' };
    // Try PATCH (update existing row) first
    let res=await fetch(`${SB_URL}/rest/v1/cmd_user_settings?owner_id=eq.${session.user.id}`,{
      method:'PATCH', headers, body:JSON.stringify(payload)
    });
    // If no row matched (204 with no rows affected), INSERT instead
    if(res.ok){
      const txt=await res.text();
      // Check if PATCH actually updated something by trying a GET
      const check=await fetch(`${SB_URL}/rest/v1/cmd_user_settings?owner_id=eq.${session.user.id}&select=id`,{
        headers:{ 'apikey':SB_ANON, 'Authorization':'Bearer '+session.access_token }
      });
      const rows=await check.json();
      if(!rows.length){
        // No existing row — INSERT
        res=await fetch(`${SB_URL}/rest/v1/cmd_user_settings`,{
          method:'POST', headers, body:JSON.stringify({...payload, owner_id:session.user.id})
        });
      }
    }
    if(!res.ok){
      const err=await res.text();
      console.error('saveOO HTTP',res.status,err);
      toast('Erro ao salvar: '+res.status,'error');
    } else {
      toast('Salvo no Supabase');
    }
  } catch(e){ console.error('saveOO catch:',e); toast('Erro ao salvar','error'); }
}

function loadOOFromLocal(){
  if(localStorage.getItem('oo_ver')!==OO_VERSION) return false;
  try {
    const sp=localStorage.getItem('oo_people');
    const sd=localStorage.getItem('oo_data');
    if(!sp) return false;
    const pp=JSON.parse(sp);
    if(!Array.isArray(pp)||!pp.length) return false;
    PEOPLE=pp;
    if(sd){ const dd=JSON.parse(sd); if(typeof dd==='object') oo11=dd; }
    return true;
  } catch(e){ return false; }
}

async function loadOOFromSupabase(){
  for(let attempt=0; attempt<3; attempt++){
    try {
      if(!_currentSession){ await new Promise(r=>setTimeout(r,600)); continue; }
      const { data,error }=await sb.from('cmd_user_settings').select('people,oo_data').maybeSingle();
      if(error){ await new Promise(r=>setTimeout(r,600)); continue; }
      if(data){
        if(data.people && Array.isArray(data.people) && data.people.length) PEOPLE=data.people;
        if(data.oo_data && typeof data.oo_data==='object' && Object.keys(data.oo_data).length) oo11=data.oo_data;
        return true;
      }
      return false;
    } catch(e){ /* retry */ }
    await new Promise(r=>setTimeout(r,600));
  }
  return false;
}

async function loadOOState(){
  // 1. localStorage cache first (instant UI)
  const localLoaded=loadOOFromLocal();
  if(localLoaded){
    PEOPLE.forEach(p=>{ if(!oo11[p.id]) oo11[p.id]={topics:[],actions:[],notes:''}; });
    renderOneOne();
  }

  // 2. Supabase (source of truth)
  const sbLoaded=await loadOOFromSupabase();
  if(sbLoaded){
    PEOPLE.forEach(p=>{ if(!oo11[p.id]) oo11[p.id]={topics:[],actions:[],notes:''}; });
    saveOOLocal();
    renderOneOne();
    return;
  }

  // 3. If localStorage had data, keep it
  if(localLoaded) return;

  // 4. First time — empty, user adds people via +
  PEOPLE=[];
  oo11={};
  renderOneOne();
}

// ── People management ──
// Person palette — Officio identity, warm-light harmonized (see DESIGN.md)
const OO_COLORS=[
  {hex:'#4D5B96', bg:'oklch(94% 0.025 270)'}, // indigo
  {hex:'#5E7F3F', bg:'oklch(94% 0.025 130)'}, // moss
  {hex:'#B66A3D', bg:'oklch(95% 0.035 45)'},  // terra
  {hex:'#6E4761', bg:'oklch(94% 0.025 340)'}, // plum
  {hex:'#A93B27', bg:'oklch(94% 0.030 30)'},  // rust
  {hex:'#B89028', bg:'oklch(95% 0.035 90)'},  // mustard
  {hex:'#3B6B74', bg:'oklch(94% 0.020 195)'}, // teal
  {hex:'#A06064', bg:'oklch(94% 0.025 0)'},   // rose-dust
];

function toggleOOHidden(){ ooShowHidden=!ooShowHidden; renderOneOne(); }

function openPersonModal(editId){
  const existing=editId?PEOPLE.find(p=>p.id===editId):null;
  const t=existing?'Editar Pessoa':'Adicionar Pessoa';
  const nm=existing?existing.name:'';
  const rl=existing?existing.role:'';
  const selColor=existing?existing.color:OO_COLORS[0].hex;
  const eid=editId||'';
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="oo-person-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="oo-person-modal-title">
        <h3 id="oo-person-modal-title">${esc(t)}</h3>
        <div><label for="opm-name">Nome</label><input id="opm-name" value="${esc(nm)}" placeholder="Nome da pessoa"></div>
        <div><label for="opm-role">Cargo / Papel</label><input id="opm-role" value="${esc(rl)}" placeholder="Ex: Diretor Comercial"></div>
        <div><span id="opm-color-label">Cor</span><div class="oo-color-grid" id="opm-colors" role="group" aria-labelledby="opm-color-label">
          ${OO_COLORS.map(c=>`<button class="oo-color-opt ${c.hex===selColor?'sel':''}" aria-label="Cor ${c.hex}" style="background:${c.hex}" data-hex="${c.hex}" data-bg="${c.bg}" onclick="event.stopPropagation();document.querySelectorAll('.oo-color-opt').forEach(e=>e.classList.remove('sel'));this.classList.add('sel')"></button>`).join('')}
        </div></div>
        <div class="oo-modal-btns">
          <button class="btn-sm" onclick="document.getElementById('oo-person-modal').remove()">Cancelar</button>
          <button class="btn-sm primary" onclick="savePersonModal('${eid}')">Salvar</button>
        </div>
      </div>
    </div>`);
  document.getElementById('opm-name').focus();
}

async function savePersonModal(editId){
  const name=document.getElementById('opm-name').value.trim();
  const role=document.getElementById('opm-role').value.trim();
  const selEl=document.querySelector('.oo-color-opt.sel');
  if(!name){ toast('Preencha o nome','error'); return; }
  const color=selEl?selEl.dataset.hex:OO_COLORS[0].hex;
  const bg=selEl?selEl.dataset.bg:OO_COLORS[0].bg;
  const init=name.length<=2?name.toUpperCase():name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  if(editId){
    const p=PEOPLE.find(x=>x.id===editId);
    if(p){ p.name=name; p.role=role; p.color=color; p.bg=bg; p.init=init; }
  } else {
    const id=name.toLowerCase().replace(/[^a-z0-9]/g,'')+'_'+Date.now();
    PEOPLE.push({id,name,init,role,color,bg,hidden:false});
    oo11[id]={topics:[],actions:[],notes:''};
  }
  document.getElementById('oo-person-modal').remove();
  renderOneOne();
  // Await save and show result
  try {
    await saveOOState();
  } catch(e){ toast('Erro no save: '+e.message,'error'); }
  if(ooSelected===editId) selectOO(editId);
  toast(editId?'Pessoa atualizada':'Pessoa adicionada');
}
window.savePersonModal=savePersonModal;

function toggleHidePerson(pid){
  const p=PEOPLE.find(x=>x.id===pid);
  if(p){ p.hidden=!p.hidden; saveOOState(); renderOneOne(); toast(p.hidden?`${esc(p.name)} oculto(a)`:`${esc(p.name)} visível`); }
}

function renderOneOne(){
  const wrap=document.getElementById('oo-items');
  const visible=PEOPLE.filter(p=>p.id!=='lucas'&&(!p.hidden||ooShowHidden));
  wrap.innerHTML=visible.map((pp,idx)=>{
    const pid=pp.id, data=oo11[pid];
    const pend=data?data.actions.filter(a=>!a.done).length:0;
    return `<div class="oo-person ${ooSelected===pid?'active':''} ${pp.hidden?'hidden-person':''}"
      role="button" tabindex="0" aria-label="Abrir 1:1 com ${esc(pp.name)}"
      draggable="true" data-oo-idx="${idx}"
      ondragstart="ooDragStart(event,${idx})" ondragover="ooDragOver(event,${idx})" ondragleave="ooDragLeave(event)" ondrop="ooDrop(event,${idx})" ondragend="ooDragEnd(event)"
      onclick="selectOO('${pid}')" onkeydown="kbd(event)">
      ${av(pp,32)}<div style="flex:1;min-width:0"><div class="oo-person-name">${esc(pp.name)}</div><div class="oo-person-last">${esc(pp.role)}</div></div>
      <div class="oo-item-actions" onclick="event.stopPropagation()">
        <button class="oo-item-btn" onclick="event.stopPropagation();openPersonModal('${pid}')" aria-label="Editar" title="Editar">✎</button>
        <button class="oo-item-btn" onclick="event.stopPropagation();toggleHidePerson('${pid}')" aria-label="${pp.hidden?'Mostrar pessoa':'Ocultar pessoa'}" title="${pp.hidden?'Mostrar':'Ocultar'}">${pp.hidden?'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 8c1.5-3 4-5 6.5-5s5 2 6.5 5c-1.5 3-4 5-6.5 5S3 11 1.5 8z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/></svg>':'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.5 5.5C3.5 6.5 2 8 1.5 8c1.5 3 4 5 6.5 5 1.3 0 2.4-.4 3.5-1M9 4.2c2.5.5 4.5 2.5 5.5 3.8-.5 1-1.2 2-2.2 2.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'}</button>
      </div>
      <div class="oo-badge">${pend}</div>
    </div>`;
  }).join('');
}

// ── Drag & drop people ──
function ooDragStart(e,idx){ ooDragIdx=idx; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function ooDragOver(e,idx){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function ooDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function ooDragEnd(e){ e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); }
function ooDrop(e,toIdx){
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(ooDragIdx===null||ooDragIdx===toIdx) return;
  const visible=PEOPLE.filter(p=>p.id!=='lucas'&&(!p.hidden||ooShowHidden));
  const fromPid=visible[ooDragIdx]?.id, toPid=visible[toIdx]?.id;
  if(!fromPid||!toPid) return;
  const fi=PEOPLE.findIndex(p=>p.id===fromPid), ti=PEOPLE.findIndex(p=>p.id===toPid);
  const [moved]=PEOPLE.splice(fi,1);
  PEOPLE.splice(ti,0,moved);
  ooDragIdx=null;
  saveOOState();
  renderOneOne();
}

function selectOO(pid){
  ooSelected=pid; renderOneOne();
  const p=person(pid), data=oo11[pid]; if(!data) return;
  document.getElementById('oo-main').innerHTML=`
    <div class="oo-head">
      <div style="display:flex;align-items:center;gap:12px">${av(p,40)}<div><div class="oo-head-name">1:1 com ${esc(p.name)}</div><div class="oo-head-role">${esc(p.role)}</div></div></div>
      <div class="oo-head-btns">
        <button class="btn-sm" onclick="switchNav('transcription',document.querySelectorAll('.nav-item')[3])">Transcrever reunião</button>
        <button class="btn-sm primary" onclick="addOOAction('${pid}')">+ Action Item</button>
      </div>
    </div>
    <div class="oo-body">
      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Pauta</div><button class="oo-section-add" onclick="addOOTopic('${pid}')">+ Tópico</button></div>
        ${data.topics.map((t,i)=>`<div class="oo-topic">
          <div class="oo-topic-num">${i+1}</div><div class="oo-topic-text">${t}</div>
          <div class="oo-item-actions">
            <button class="oo-item-btn" onclick="editOOTopic('${pid}',${i})" aria-label="Editar" title="Editar">✎</button>
            <button class="oo-item-btn del" onclick="delOOTopic('${pid}',${i})" aria-label="Excluir" title="Excluir">✕</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="oo-section" id="oo-act-${pid}">
        <div class="oo-section-head"><div class="oo-section-title">Action items</div></div>
        ${renderOOActions(pid)}
      </div>
      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Notas</div></div>
        <textarea class="oo-note-area" placeholder="Anotações da conversa..." onblur="oo11['${pid}'].notes=this.value;saveOOState()">${data.notes||''}</textarea>
      </div>
      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Demandas em aberto</div></div>
        ${tasks.filter(t=>t.person===pid&&!t.done).slice(0,6).map(t=>`
          <div class="oo-action">
            <div style="flex:1"><div class="oo-action-text">${esc(t.title)}</div><div class="oo-action-meta"><span class="tag ${t.priority}">${t.priority.toUpperCase()}</span><span class="tag dt">${formatDate(t.dueDate)}</span></div></div>
            <div class="oo-item-actions">
              <button class="oo-item-btn" onclick="openPanel('${t.id}')" aria-label="Editar" title="Editar">✎</button>
              <button class="oo-item-btn del" onclick="delOODemand('${t.id}','${pid}')" aria-label="Excluir demanda" title="Excluir">✕</button>
            </div>
            <button class="oo-action-chk ${t.done?'done':''}" aria-label="${t.done?'Marcar como não feito':'Marcar como concluído'}" onclick="toggleDone('${t.id}');selectOO('${pid}')"></button>
          </div>`).join('') || '<div style="font-size:12px;color:var(--t3);padding:6px 0">Nenhuma demanda em aberto.</div>'}
      </div>
      <div class="oo-section" id="oo-meetings-${pid}">
        <div class="oo-section-head"><div class="oo-section-title">Reuniões anteriores</div></div>
        <div style="font-size:12px;color:var(--t4);padding:4px 0">Carregando...</div>
      </div>
    </div>`;
  loadOOMeetings(pid);
}

async function loadOOMeetings(pid){
  const el=document.getElementById('oo-meetings-'+pid);
  if(!el) return;
  try {
    const p=person(pid);
    const { data,error }=await sb.from('cmd_meetings').select('id,title,meeting_date,ata').order('meeting_date',{ascending:false}).limit(5);
    if(error||!data){ el.innerHTML=`<div class="oo-section-head"><div class="oo-section-title">Reuniões anteriores</div></div><div style="font-size:12px;color:var(--t4);padding:4px 0">Nenhuma reunião encontrada.</div>`; return; }
    // Filter meetings that mention this person's name
    const relevant=data.filter(m=>(m.title||'').toLowerCase().includes(p.name.toLowerCase())||(m.ata||'').toLowerCase().includes(p.name.toLowerCase()));
    let html=`<div class="oo-section-head"><div class="oo-section-title">Reuniões anteriores</div></div>`;
    if(relevant.length){
      relevant.forEach(m=>{
        const preview=(m.ata||'').substring(0,120).replace(/\n/g,' ');
        html+=`<button class="oo-topic" style="cursor:pointer;width:100%;text-align:left" aria-expanded="false" onclick="const f=this.querySelector('.oo-ata-full');const open=f.style.display==='block';f.style.display=open?'none':'block';this.setAttribute('aria-expanded',!open)">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="tag dt" style="font-size:10px">${formatDate(m.meeting_date)}</span>
              <span class="oo-topic-text" style="font-weight:500">${esc(m.title||'Reunião')}</span>
            </div>
            <div style="font-size:11px;color:var(--t3)">${esc(preview)}${preview.length>=120?'...':''}</div>
            <div class="oo-ata-full" style="display:none;margin-top:8px;font-size:12px;color:var(--t2);line-height:1.7;white-space:pre-line;border-top:1px solid var(--b1);padding-top:8px">${esc(m.ata||'Sem ata disponível.')}</div>
          </div>
        </button>`;
      });
    } else {
      html+=`<div style="font-size:12px;color:var(--t4);padding:4px 0">Nenhuma reunião com ${esc(p.name)} encontrada.</div>`;
    }
    el.innerHTML=html;
  } catch(e){ console.error('loadOOMeetings:',e); }
}

function renderOOActions(pid){
  const data=oo11[pid]; if(!data) return '';
  return data.actions.map((a,i)=>`
    <div class="oo-action">
      <div style="flex:1"><div class="oo-action-text">${a.done?`<s style="color:var(--t3)">${esc(a.text)}</s>`:esc(a.text)}</div><div class="oo-action-meta"><span class="tag ${a.prio}">${a.prio.toUpperCase()}</span></div></div>
      <div class="oo-item-actions">
        <button class="oo-item-btn" onclick="editOOAction('${pid}',${i})" aria-label="Editar" title="Editar">✎</button>
        <button class="oo-item-btn del" onclick="delOOAction('${pid}',${i})" aria-label="Excluir" title="Excluir">✕</button>
      </div>
      <button class="oo-action-chk ${a.done?'done':''}" aria-label="${a.done?'Marcar como não feito':'Marcar como concluído'}" onclick="toggleOOAct('${pid}',${i})">
        ${a.done?`<svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 5l2.5 2.5L8 3" stroke="var(--acc-on)" stroke-width="1.5" stroke-linecap="round"/></svg>`:''}
      </button>
    </div>`).join('');
}

function ooData(pid){ if(!oo11[pid]) oo11[pid]={topics:[],actions:[],notes:''}; return oo11[pid]; }

function toggleOOAct(pid,i){ const d=ooData(pid); d.actions[i].done=!d.actions[i].done; saveOOState(); const el=document.getElementById(`oo-act-${pid}`); if(el){ el.innerHTML=`<div class="oo-section-head"><div class="oo-section-title">Action items</div></div>${renderOOActions(pid)}`; } renderOneOne(); }
// ── Inline add: render input row, focus, save on Enter ──
function addOOTopic(pid){
  const sec=document.querySelector(`#oo-main .oo-section`); // pauta section is the first
  if(!sec) return;
  if(sec.querySelector('.oo-inline-form')) return; // already open
  const form=document.createElement('form');
  form.className='oo-inline-form';
  form.innerHTML=`<input type="text" class="oo-inline-input" placeholder="Novo tópico…" aria-label="Novo tópico de pauta" required>
    <button type="submit" class="oo-inline-save" aria-label="Salvar">Adicionar</button>
    <button type="button" class="oo-inline-cancel" aria-label="Cancelar">Cancelar</button>`;
  sec.appendChild(form);
  const input=form.querySelector('input');
  input.focus();
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const txt=input.value.trim(); if(!txt) return;
    ooData(pid).topics.push(txt); saveOOState(); selectOO(pid);
  });
  form.querySelector('.oo-inline-cancel').addEventListener('click',()=>form.remove());
  input.addEventListener('keydown',e=>{ if(e.key==='Escape') form.remove(); });
}

function addOOAction(pid){
  const sec=document.getElementById(`oo-act-${pid}`);
  if(!sec) return;
  if(sec.querySelector('.oo-inline-form')) return;
  const form=document.createElement('form');
  form.className='oo-inline-form';
  form.innerHTML=`<input type="text" class="oo-inline-input" placeholder="Novo action item…" aria-label="Texto do action item" required>
    <div class="oo-inline-prio" role="group" aria-label="Prioridade">
      <button type="button" data-prio="alta" class="oo-prio-btn alta" aria-pressed="false">Alta</button>
      <button type="button" data-prio="media" class="oo-prio-btn media sel" aria-pressed="true">Média</button>
      <button type="button" data-prio="baixa" class="oo-prio-btn baixa" aria-pressed="false">Baixa</button>
    </div>
    <button type="submit" class="oo-inline-save" aria-label="Salvar">Adicionar</button>
    <button type="button" class="oo-inline-cancel" aria-label="Cancelar">Cancelar</button>`;
  sec.appendChild(form);
  const input=form.querySelector('input');
  let prio='media';
  form.querySelectorAll('.oo-prio-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      prio=b.dataset.prio;
      form.querySelectorAll('.oo-prio-btn').forEach(x=>{x.classList.remove('sel');x.setAttribute('aria-pressed','false')});
      b.classList.add('sel'); b.setAttribute('aria-pressed','true');
    });
  });
  input.focus();
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const txt=input.value.trim(); if(!txt) return;
    ooData(pid).actions.push({text:txt,done:false,prio}); saveOOState(); selectOO(pid);
  });
  form.querySelector('.oo-inline-cancel').addEventListener('click',()=>form.remove());
  input.addEventListener('keydown',e=>{ if(e.key==='Escape') form.remove(); });
}

// ── Inline edit via contentEditable (triggered by ✎ button) ──
function editOOTopic(pid,i){
  const sec=document.querySelector(`#oo-main .oo-section`);
  if(!sec) return;
  const topicEl=sec.querySelectorAll('.oo-topic-text')[i];
  if(!topicEl) return;
  topicEl.contentEditable='true';
  topicEl.classList.add('editing');
  topicEl.focus();
  // select all
  const range=document.createRange(); range.selectNodeContents(topicEl);
  const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const finish=save=>{
    topicEl.contentEditable='false'; topicEl.classList.remove('editing');
    if(save){
      const txt=topicEl.textContent.trim();
      if(txt){ ooData(pid).topics[i]=txt; saveOOState(); }
      else selectOO(pid); // re-render to restore original
    } else selectOO(pid);
  };
  topicEl.addEventListener('blur',()=>finish(true),{once:true});
  topicEl.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); topicEl.blur(); }
    if(e.key==='Escape'){ e.preventDefault(); topicEl.removeEventListener('blur',finish); finish(false); }
  });
}

function editOOAction(pid,i){
  const sec=document.getElementById(`oo-act-${pid}`);
  if(!sec) return;
  const actionEl=sec.querySelectorAll('.oo-action-text')[i];
  if(!actionEl) return;
  actionEl.contentEditable='true';
  actionEl.classList.add('editing');
  actionEl.focus();
  const range=document.createRange(); range.selectNodeContents(actionEl);
  const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const a=ooData(pid).actions[i];
  const finish=save=>{
    actionEl.contentEditable='false'; actionEl.classList.remove('editing');
    if(save){
      const txt=actionEl.textContent.trim();
      if(txt){ a.text=txt; saveOOState(); }
      else selectOO(pid);
    } else selectOO(pid);
  };
  actionEl.addEventListener('blur',()=>finish(true),{once:true});
  actionEl.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); actionEl.blur(); }
    if(e.key==='Escape'){ e.preventDefault(); actionEl.removeEventListener('blur',finish); finish(false); }
  });
}

// Delete demanda (tarefa) na vista 1:1 — optimistic + undo via toast
async function delOODemand(taskId, pid){
  const t=tasks.find(x=>x.id===taskId); if(!t) return;
  const idx=tasks.indexOf(t);
  tasks.splice(idx,1);
  selectOO(pid); renderBoard(); updateBadge();
  toast('Demanda excluída','info',{label:'Desfazer',cb:async()=>{
    tasks.splice(idx,0,t); selectOO(pid); renderBoard(); updateBadge();
    await sbUpsert(t); // restaura no Supabase
  }});
  // Aguarda janela de undo (~5s) antes de propagar para Supabase
  setTimeout(async()=>{
    if(!tasks.find(x=>x.id===taskId)) await sbDelete(taskId);
  },5000);
}

// ── Delete with undo (replaces native confirm) ──
function delOOTopic(pid,i){
  const removed=ooData(pid).topics.splice(i,1)[0];
  saveOOState(); selectOO(pid);
  toast('Tópico excluído','info',{label:'Desfazer',cb:()=>{
    ooData(pid).topics.splice(i,0,removed); saveOOState(); selectOO(pid);
  }});
}

function delOOAction(pid,i){
  const removed=ooData(pid).actions.splice(i,1)[0];
  saveOOState(); selectOO(pid); renderOneOne();
  toast('Action item excluído','info',{label:'Desfazer',cb:()=>{
    ooData(pid).actions.splice(i,0,removed); saveOOState(); selectOO(pid); renderOneOne();
  }});
}

// ══════════════════════════════════════════════
// REUNIÕES VIEW
// ══════════════════════════════════════════════
let allMeetings=[];
let reunSelected=null;

async function loadAllMeetings(){
  const { data, error }=await sb.from('cmd_meetings').select('*').order('meeting_date',{ascending:false});
  if(error){ toast('Erro ao carregar reuniões','error'); return; }
  allMeetings=data||[];
}

let _meetingsLoaded=false;
function renderMeetingsList(){
  const el=document.getElementById('reun-items');
  if(!el) return;
  if(!_meetingsLoaded){
    _meetingsLoaded=true;
    el.innerHTML='<div style="padding:16px;color:var(--t4);font-size:12px;text-align:center">Carregando...</div>';
    loadAllMeetings().then(()=>renderMeetingsList());
    return;
  }
  if(!allMeetings.length){
    el.innerHTML='<div style="padding:16px;color:var(--t4);font-size:12px;text-align:center">Nenhuma reunião ainda. Clique + para criar.</div>';
    return;
  }
  el.innerHTML=allMeetings.map(m=>{
    const d=m.meeting_date?new Date(m.meeting_date+'T12:00:00'):new Date();
    const day=String(d.getDate()).padStart(2,'0');
    const mon=d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
    const pArr=Array.isArray(m.participants)?m.participants:typeof m.participants==='string'?m.participants.split(',').map(s=>s.trim()).filter(Boolean):[];
    const parts=pArr.join(', ')||'Sem participantes';
    return `<div class="reun-card ${reunSelected===m.id?'active':''}" role="button" tabindex="0" aria-pressed="${reunSelected===m.id}" onclick="selectMeeting('${m.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectMeeting('${m.id}')}">
      <div class="reun-card-date"><div class="reun-card-day">${day}</div><div class="reun-card-mon">${mon}</div></div>
      <div class="reun-card-info"><div class="reun-card-title">${esc(m.title||'Reunião')}</div><div class="reun-card-sub">${esc(parts)}</div></div>
      <button class="reun-card-edit" type="button" aria-label="Editar nome da reunião" title="Editar nome" onclick="event.stopPropagation();editMeetingTitle('${m.id}')"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></button>
    </div>`;
  }).join('');
}

async function selectMeeting(id){
  reunSelected=id;
  renderMeetingsList();
  const m=allMeetings.find(x=>x.id===id);
  if(!m) return;
  const el=document.getElementById('reun-main');

  // Load demands for this meeting
  const { data:demands }=await sb.from('cmd_meeting_demands').select('*').eq('meeting_id',id);
  const demandList=demands||[];

  // Find related tasks from main board
  const relatedTasks=tasks.filter(t=> demandList.some(d=>d.task_id===t.id) || (t.context||'').toLowerCase().includes((m.title||'').toLowerCase()));

  const mParts=Array.isArray(m.participants)?m.participants:typeof m.participants==='string'?m.participants.split(',').map(s=>s.trim()).filter(Boolean):[];
  const partsHtml=mParts.map((p,i)=>{
    const colors=OO_COLORS.map(c=>c.hex);
    const c=colors[i%colors.length];
    const init=p.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<div class="reun-participant"><div class="reun-participant-av" style="background:${c}">${init}</div>${p}</div>`;
  }).join('');

  const demandsHtml=demandList.length? demandList.map(d=>`
    <div class="oo-action">
      <div style="flex:1">
        <div class="oo-action-text">${d.title}</div>
        <div class="oo-action-meta">
          <span class="tag ${d.priority||'media'}">${(d.priority||'media').toUpperCase()}</span>
          <span style="font-size:10px;color:var(--t3)">${d.person||''}</span>
        </div>
      </div>
    </div>`).join('')
    :'<div style="font-size:12px;color:var(--t4)">Nenhuma demanda registrada.</div>';

  const tasksHtml=relatedTasks.length? relatedTasks.map(t=>`
    <div class="oo-action">
      <div style="flex:1">
        <div class="oo-action-text">${t.done?`<s style="color:var(--t3)">${esc(t.title)}</s>`:esc(t.title)}</div>
        <div class="oo-action-meta">
          <span class="tag ${t.priority}">${t.priority.toUpperCase()}</span>
          <span style="font-size:10px;color:var(--t3)">${esc(t.person||'')} · ${formatDate(t.dueDate)}</span>
        </div>
      </div>
      <div class="oo-action-chk ${t.done?'done':''}" aria-hidden="true">
        ${t.done?'<svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="var(--acc-on)" stroke-width="1.5" stroke-linecap="round"/></svg>':''}
      </div>
    </div>`).join('')
    :'<div style="font-size:12px;color:var(--t4)">Nenhuma tarefa vinculada.</div>';

  el.innerHTML=`
    <div class="reun-head">
      <div>
        <div class="reun-head-title">${esc(m.title||'Reunião')}</div>
        <div class="reun-head-date">${formatDate(m.meeting_date)}</div>
      </div>
      <div class="reun-head-btns">
        <button class="oo-section-add" onclick="editMeetingNotes('${m.id}')">Editar Notas</button>
        <button class="oo-section-add" onclick="deleteMeeting('${m.id}')">Excluir</button>
      </div>
    </div>
    <div class="reun-body">
      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Participantes</div></div>
        <div class="reun-participants">${partsHtml||'<span style="font-size:12px;color:var(--t4)">Sem participantes</span>'}</div>
      </div>

      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Ata</div></div>
        <div class="reun-ata" style="white-space:normal">${ataToHTML(m.ata)||'Sem ata disponível.'}</div>
      </div>

      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Demandas</div></div>
        ${demandsHtml}
      </div>

      <div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Tarefas vinculadas</div></div>
        ${tasksHtml}
      </div>

      ${m.transcript?`<div class="oo-section">
        <div class="oo-section-head"><div class="oo-section-title">Transcrição</div></div>
        <div class="reun-ata" style="max-height:200px;overflow-y:auto;font-size:11.5px">${esc(m.transcript)}</div>
      </div>`:''}

      <div class="oo-section">
        <div class="oo-section-head">
          <div class="oo-section-title">Anotações</div>
        </div>
        <textarea class="oo-note-area" style="min-height:400px" placeholder="Anotações livres sobre esta reunião..." onblur="saveMeetingNotes('${m.id}',this.value)">${esc(m.notes||'')}</textarea>
      </div>
    </div>`;
}

function openNewMeetingModal(){
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="new-meeting-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" onclick="event.stopPropagation()" style="width:420px" role="dialog" aria-modal="true" aria-labelledby="new-meeting-modal-title">
        <h3 id="new-meeting-modal-title">Nova Reunião</h3>
        <div><label for="nm-title">Título</label><input id="nm-title" placeholder="Ex: Alinhamento semanal"></div>
        <div><label for="nm-date">Data</label><input type="date" id="nm-date" value="${isoToday}"></div>
        <div><label for="nm-parts">Participantes (separados por vírgula)</label><input id="nm-parts" placeholder="Ex: Ana, João, Pedro"></div>
        <div><label for="nm-notes">Anotações iniciais</label><textarea id="nm-notes" class="oo-note-area" style="min-height:60px" placeholder="Pauta, observações..."></textarea></div>
        <div class="oo-modal-btns">
          <button class="btn-sm" onclick="document.getElementById('new-meeting-modal').remove()">Cancelar</button>
          <button class="btn-sm primary" onclick="saveNewMeeting()">Criar</button>
        </div>
      </div>
    </div>`);
  document.getElementById('nm-title').focus();
}

async function saveNewMeeting(){
  const title=document.getElementById('nm-title').value.trim();
  const date=document.getElementById('nm-date').value;
  const partsRaw=document.getElementById('nm-parts').value.trim();
  const notes=document.getElementById('nm-notes').value.trim();
  if(!title){ toast('Preencha o título','error'); return; }
  const participants=partsRaw?partsRaw.split(',').map(s=>s.trim()).filter(Boolean):[];

  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const { data:meeting, error }=await sb.from('cmd_meetings').insert({
    title, participants, meeting_date:date||isoToday, transcript:'', ata:'', notes:notes, owner_id:_currentSession.user.id
  }).select().single();
  if(error){ toast('Erro ao criar reunião: '+error.message,'error'); return; }

  document.getElementById('new-meeting-modal').remove();
  allMeetings.unshift(meeting);
  renderMeetingsList();
  selectMeeting(meeting.id);
  toast('Reunião criada');
}

async function saveMeetingNotes(id, notes){
  const { error }=await sb.from('cmd_meetings').update({notes}).eq('id',id);
  if(error){ toast('Erro ao salvar notas','error'); return; }
  const m=allMeetings.find(x=>x.id===id);
  if(m) m.notes=notes;
}

// ── Helpers da ata (texto rico armazenado como HTML) ──
function ataIsHTML(raw){ return /<(div|br|b|i|u|font|span|strong|em|p)[\s/>]/i.test(raw||''); }
function ataToHTML(raw){
  if(!raw) return '';
  if(ataIsHTML(raw)) return raw;              // já é HTML (formato novo)
  return esc(raw).replace(/\n/g,'<br>');      // legado em texto puro → preserva quebras
}
function sanitizeAtaHTML(html){
  const tmp=document.createElement('div');
  tmp.innerHTML=html;
  tmp.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(n=>n.remove());
  tmp.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      const n=a.name.toLowerCase();
      if(n.startsWith('on')) el.removeAttribute(a.name);
      else if((n==='href'||n==='src')&&/^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  return tmp.innerHTML;
}
function loadAtaIntoEditor(editor, raw){
  editor.innerHTML=ataToHTML(raw);
  editor.style.lineHeight='1.7';
  if(editor.children.length===1){
    const only=editor.firstElementChild;
    const st=(only.getAttribute('style')||'').replace(/\s+/g,'');
    const mm=st.match(/^line-height:([\d.]+);?$/i);
    if(only.tagName==='DIV'&&mm){ editor.style.lineHeight=mm[1]; editor.innerHTML=only.innerHTML; }
  }
}
function serializeAta(editor){
  const inner=sanitizeAtaHTML(editor.innerHTML).trim();
  if(!inner||inner==='<br>'||inner==='<div><br></div>') return '';
  const lh=editor.style.lineHeight||'1.7';
  return `<div style="line-height:${lh}">${inner}</div>`;
}

function editMeetingNotes(id){
  const m=allMeetings.find(x=>x.id===id);
  if(!m) return;
  const COLORS=[['Padrão','#2b2622'],['Oxblood','#7a1f24'],['Vermelho','#b23a26'],['Âmbar','#b8791f'],['Verde','#4d6b34'],['Teal','#2f6b6b'],['Plum','#6a3a58']];
  const swatches=COLORS.map(([n,c])=>`<button type="button" class="rte-color" data-color="${c}" style="--sw:${c}" title="${n}" aria-label="Cor: ${n}"></button>`).join('');
  // Editor de ata com formatação rica + auto-save (substitui prompt nativo)
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="edit-ata-modal">
      <div class="oo-modal" style="width:1100px;max-width:94vw;height:90vh;max-height:90vh" role="dialog" aria-modal="true" aria-labelledby="edit-ata-title">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <h3 id="edit-ata-title">Editar ata</h3>
          <span id="edit-ata-status" class="rte-status ok" aria-live="polite">Salvo</span>
        </div>
        <label style="font-size:11px;color:var(--t3);font-family:var(--font-mono);letter-spacing:.05em;text-transform:uppercase">${esc(m.title||'Reunião')}</label>
        <div class="rte-toolbar" role="toolbar" aria-label="Formatação">
          <button type="button" class="rte-btn" data-cmd="bold" title="Negrito (Ctrl+B)"><b>B</b></button>
          <button type="button" class="rte-btn" data-cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
          <button type="button" class="rte-btn" data-cmd="underline" title="Sublinhado (Ctrl+U)"><span style="text-decoration:underline">U</span></button>
          <span class="rte-sep"></span>
          ${swatches}
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn rte-space" data-space="1.3" title="Espaçamento compacto">≡</button>
          <button type="button" class="rte-btn rte-space" data-space="1.7" title="Espaçamento normal">☰</button>
          <button type="button" class="rte-btn rte-space" data-space="2.3" title="Espaçamento amplo">≣</button>
          <span class="rte-sep"></span>
          <button type="button" class="rte-btn" data-cmd="removeFormat" title="Limpar formatação">A̶</button>
        </div>
        <div id="edit-ata-area" class="oo-note-area rte-editor" contenteditable="true" data-ph="Escreva a ata da reunião…" style="flex:1;min-height:0;font-size:13px"></div>
        <div class="oo-modal-btns">
          <button class="btn-sm primary" type="button" id="edit-ata-close">Concluído</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('edit-ata-modal');
  const editor=modal.querySelector('#edit-ata-area');
  const statusEl=modal.querySelector('#edit-ata-status');
  try{ document.execCommand('styleWithCSS',false,true); }catch(_){}
  loadAtaIntoEditor(editor, m.ata);
  const markSpace=()=>{ const lh=editor.style.lineHeight||'1.7'; modal.querySelectorAll('.rte-space').forEach(b=>b.classList.toggle('on', b.dataset.space===lh)); };
  markSpace();

  let saveTimer=null;
  const doSave=async()=>{
    clearTimeout(saveTimer); saveTimer=null;
    const html=serializeAta(editor);
    if(html===(m.ata||'')){ statusEl.textContent='Salvo'; statusEl.className='rte-status ok'; return; }
    statusEl.textContent='Salvando…'; statusEl.className='rte-status';
    m.ata=html;
    const { error }=await sb.from('cmd_meetings').update({ata:html}).eq('id',id);
    if(error){ statusEl.textContent='Erro ao salvar'; statusEl.className='rte-status err'; }
    else { statusEl.textContent='Salvo ✓'; statusEl.className='rte-status ok'; }
  };
  const scheduleSave=()=>{ statusEl.textContent='Editando…'; statusEl.className='rte-status'; clearTimeout(saveTimer); saveTimer=setTimeout(doSave,700); };
  const updateBtnStates=()=>{ ['bold','italic','underline'].forEach(c=>{ let on=false; try{ on=document.queryCommandState(c); }catch(_){} const b=modal.querySelector(`.rte-btn[data-cmd="${c}"]`); if(b) b.classList.toggle('on',on); }); };

  modal.querySelectorAll('.rte-btn[data-cmd]').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{ document.execCommand(b.dataset.cmd,false,null); editor.focus(); updateBtnStates(); scheduleSave(); });
  });
  modal.querySelectorAll('.rte-color').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{ document.execCommand('foreColor',false,b.dataset.color); editor.focus(); scheduleSave(); });
  });
  modal.querySelectorAll('.rte-space').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{ editor.style.lineHeight=b.dataset.space; markSpace(); editor.focus(); scheduleSave(); });
  });

  editor.addEventListener('input',scheduleSave);
  editor.addEventListener('keyup',updateBtnStates);
  editor.addEventListener('mouseup',updateBtnStates);
  setTimeout(()=>editor.focus(),50);

  const close=async()=>{ await doSave(); modal.remove(); selectMeeting(id); };
  modal.querySelector('#edit-ata-close').addEventListener('click',close);
  modal.addEventListener('click',e=>{ if(e.target===modal) close(); });
  modal.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); e.preventDefault(); close(); } });
}

function editMeetingTitle(id){
  const m=allMeetings.find(x=>x.id===id);
  if(!m) return;
  // Modal de edição do nome (substitui prompt nativo)
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="edit-title-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" onclick="event.stopPropagation()" style="width:420px" role="dialog" aria-modal="true" aria-labelledby="edit-title-modal-title">
        <h3 id="edit-title-modal-title">Editar nome</h3>
        <div><label for="edit-title-input">Título da reunião</label><input id="edit-title-input" value="${esc(m.title||'')}" placeholder="Ex: Alinhamento semanal"></div>
        <div class="oo-modal-btns">
          <button class="btn-sm" type="button" onclick="document.getElementById('edit-title-modal').remove()">Cancelar</button>
          <button class="btn-sm primary" type="button" id="edit-title-save">Salvar</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('edit-title-modal');
  const input=modal.querySelector('#edit-title-input');
  setTimeout(()=>{ input.focus(); input.select(); },50);
  const save=async()=>{
    const newTitle=input.value.trim();
    if(!newTitle){ toast('Preencha o título','error'); return; }
    if(newTitle===m.title){ modal.remove(); return; }
    modal.remove();
    m.title=newTitle;
    renderMeetingsList();
    const { error }=await sb.from('cmd_meetings').update({title:newTitle}).eq('id',id);
    if(error){ toast('Erro ao salvar nome','error'); return; }
    if(reunSelected===id) selectMeeting(id);
    toast('Nome atualizado');
  };
  modal.querySelector('#edit-title-save').addEventListener('click',save);
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } });
}

async function deleteMeeting(id){
  const m=allMeetings.find(x=>x.id===id);
  if(!m) return;
  // Mini modal de confirmação (substitui native confirm)
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="del-meeting-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal" onclick="event.stopPropagation()" style="width:380px" role="alertdialog" aria-modal="true" aria-labelledby="del-meeting-title" aria-describedby="del-meeting-msg">
        <h3 id="del-meeting-title">Excluir reunião?</h3>
        <p id="del-meeting-msg" style="font-size:13px;color:var(--t2);line-height:1.5">Você está prestes a excluir <strong>${esc(m.title||'esta reunião')}</strong> e todas as demandas vinculadas. Esta ação não pode ser desfeita.</p>
        <div class="oo-modal-btns">
          <button class="btn-sm" type="button" onclick="document.getElementById('del-meeting-modal').remove()" autofocus>Cancelar</button>
          <button class="btn-sm" type="button" id="del-meeting-confirm" style="background:var(--rust);color:var(--acc-on);border:none">Excluir</button>
        </div>
      </div>
    </div>`);
  const modal=document.getElementById('del-meeting-modal');
  modal.querySelector('#del-meeting-confirm').addEventListener('click',async()=>{
    modal.remove();
    await sb.from('cmd_meeting_demands').delete().eq('meeting_id',id);
    const { error }=await sb.from('cmd_meetings').delete().eq('id',id);
    if(error){ toast('Erro ao excluir: '+error.message,'error'); return; }
    allMeetings=allMeetings.filter(x=>x.id!==id);
    reunSelected=null;
    renderMeetingsList();
    document.getElementById('reun-main').innerHTML='<div class="reun-empty"><div style="text-align:center"><svg width="32" height="32" viewBox="0 0 16 16" fill="none" style="margin-bottom:12px;opacity:.3" aria-hidden="true"><rect x="3" y="3" width="10" height="11.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><rect x="5.5" y="1.5" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8.5h5M5.5 11h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><div>Selecione ou crie uma reunião</div></div></div>';
    toast('Reunião excluída');
  });
}

// ══════════════════════════════════════════════
// WHATSAPP — monitor de disparos via API Oficial
// ══════════════════════════════════════════════

const WA_CAT_LABEL = { utility:'Utility', marketing:'Marketing', authentication:'Authentication', service:'Service' };

async function loadWA(){
  if(!_currentSession) return;
  const uid = _currentSession.user.id;

  // Seed tarifas default na primeira vez (idempotente do lado do banco).
  try { await sb.rpc('seed_wa_tariffs', { p_owner: uid }); } catch(e){ console.warn('seed_wa_tariffs', e); }

  const since = isoDate(addDays(today, -90));
  const [numsRes, tarRes, dailyRes] = await Promise.all([
    sb.from('cmd_wa_numbers').select('*').order('created_at',{ascending:true}),
    sb.from('cmd_wa_tariffs').select('category, price_brl'),
    sb.from('cmd_wa_daily').select('wa_number_id, occurred_date, category, conversation_count').gte('occurred_date', since),
  ]);

  if(numsRes.error){ toast('Erro ao carregar números WA: '+numsRes.error.message,'error'); return; }
  if(tarRes.error){ toast('Erro ao carregar tarifas WA: '+tarRes.error.message,'error'); return; }
  if(dailyRes.error){ toast('Erro ao carregar disparos WA: '+dailyRes.error.message,'error'); return; }

  waNumbers = numsRes.data || [];
  waDaily   = dailyRes.data || [];
  if(tarRes.data){
    for(const r of tarRes.data) waTariffs[r.category] = Number(r.price_brl);
  }
  refreshWANumberSelect();
}

function refreshWANumberSelect(){
  const sel = document.getElementById('wa-num-select');
  if(!sel) return;
  const current = sel.value || 'all';
  sel.innerHTML = `<option value="all">Todos os números</option>` +
    waNumbers.map(n=>`<option value="${esc(n.id)}">${esc(n.label||n.display_phone_number)} · ${esc(n.display_phone_number)}</option>`).join('');
  // Preserva seleção se ainda existir
  if([...sel.options].some(o=>o.value===current)) sel.value = current;
  else waNumberFilter = 'all';
}

// ─── Period helpers ───────────────────────────
function waPeriodRange(){
  // Retorna {start, end} como strings ISO (inclusive ambos).
  const t = new Date(today);
  if(waPeriod==='7d')  return { start: isoDate(addDays(t,-6)),  end: isoDate(t) };
  if(waPeriod==='30d') return { start: isoDate(addDays(t,-29)), end: isoDate(t) };
  if(waPeriod==='this'){
    const s = new Date(t.getFullYear(), t.getMonth(), 1);
    return { start: isoDate(s), end: isoDate(t) };
  }
  if(waPeriod==='prev'){
    const s = new Date(t.getFullYear(), t.getMonth()-1, 1);
    const e = new Date(t.getFullYear(), t.getMonth(), 0);
    return { start: isoDate(s), end: isoDate(e) };
  }
  return { start: isoDate(addDays(t,-29)), end: isoDate(t) };
}

function waDateList(start, end){
  // Itera entre start e end inclusivos como YYYY-MM-DD strings.
  const out = [];
  let d = new Date(start+'T12:00:00');
  const last = new Date(end+'T12:00:00');
  while(d <= last){ out.push(isoDate(d)); d.setDate(d.getDate()+1); }
  return out;
}

function getWAFilteredRows(){
  const { start, end } = waPeriodRange();
  return waDaily.filter(r =>
    r.occurred_date >= start && r.occurred_date <= end &&
    (waCategoryFilter==='all' || (waCategoryFilter==='utility' ? (r.category==='utility'||r.category==='authentication') : r.category===waCategoryFilter)) &&
    (waNumberFilter==='all' || r.wa_number_id===waNumberFilter)
  );
}

// Agrupa categorias internamente: utility e authentication contam juntas (barra bronze).
function bucketCategory(cat){ return (cat==='utility' || cat==='authentication') ? 'utility' : cat; }

function aggregateByDayCategory(rows, dates){
  // Retorna mapa: date → { utility:count, marketing:count }
  const map = {};
  for(const d of dates) map[d] = { utility:0, marketing:0 };
  for(const r of rows){
    if(!map[r.occurred_date]) continue;
    const b = bucketCategory(r.category);
    if(b!=='utility' && b!=='marketing') continue;
    map[r.occurred_date][b] += r.conversation_count;
  }
  return map;
}

function aggregateByNumber(rows, date, bucket){
  // Retorna [{wa_number_id, count, raw:[{category,count}]}] para tooltip.
  const map = new Map();
  for(const r of rows){
    if(r.occurred_date !== date) continue;
    if(bucketCategory(r.category) !== bucket) continue;
    const cur = map.get(r.wa_number_id) || { count:0, byCat:{} };
    cur.count += r.conversation_count;
    cur.byCat[r.category] = (cur.byCat[r.category]||0) + r.conversation_count;
    map.set(r.wa_number_id, cur);
  }
  return [...map.entries()].map(([id,v])=>({wa_number_id:id, ...v}));
}

function costForRow(category, count){
  return (waTariffs[category] || 0) * count;
}

function brl(v){
  return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ─── Render orquestra ─────────────────────────
function renderWhatsApp(){
  refreshWANumberSelect();
  const rows = getWAFilteredRows();
  renderWAKpis(rows);
  renderWAChart(rows);
}

function renderWAKpis(rows){
  let total=0, util=0, mkt=0, cost=0;
  for(const r of rows){
    total += r.conversation_count;
    const b = bucketCategory(r.category);
    if(b==='utility')   util += r.conversation_count;
    if(b==='marketing') mkt  += r.conversation_count;
    cost += costForRow(r.category, r.conversation_count);
  }
  const fmt = n => n.toLocaleString('pt-BR');
  document.getElementById('wa-kpi-total').textContent = fmt(total);
  document.getElementById('wa-kpi-util').textContent  = fmt(util);
  document.getElementById('wa-kpi-mkt').textContent   = fmt(mkt);
  document.getElementById('wa-kpi-cost').textContent  = brl(cost);

  const utilCost = rows.filter(r=>bucketCategory(r.category)==='utility').reduce((s,r)=>s+costForRow(r.category,r.conversation_count),0);
  const mktCost  = rows.filter(r=>r.category==='marketing').reduce((s,r)=>s+costForRow(r.category,r.conversation_count),0);
  document.getElementById('wa-kpi-util-sub').textContent = brl(utilCost);
  document.getElementById('wa-kpi-mkt-sub').textContent  = brl(mktCost);
  const { start, end } = waPeriodRange();
  document.getElementById('wa-kpi-total-sub').textContent = `${formatDate(start)} – ${formatDate(end)}`;
}

function renderWAChart(rows){
  const wrap = document.getElementById('wa-chart');
  if(!wrap) return;
  const { start, end } = waPeriodRange();
  const dates = waDateList(start, end);

  if(waNumbers.length===0){
    wrap.innerHTML = `<div class="wa-empty">Nenhum número WhatsApp cadastrado.<br><br>Use <strong>Gerenciar números</strong> para cadastrar o primeiro — o webhook só registra conversations de números registrados aqui.</div>`;
    return;
  }
  if(rows.length===0){
    wrap.innerHTML = `<div class="wa-empty">Nenhuma conversation registrada no período.<br><br>Confirme que o webhook está configurado no Meta Developer Console e que houve disparos billable nesta janela.</div>`;
    return;
  }

  const agg = aggregateByDayCategory(rows, dates);
  const showUtil = waCategoryFilter==='all' || waCategoryFilter==='utility';
  const showMkt  = waCategoryFilter==='all' || waCategoryFilter==='marketing';

  // Escala Y
  let maxY = 0;
  for(const d of dates){
    if(showUtil) maxY = Math.max(maxY, agg[d].utility);
    if(showMkt)  maxY = Math.max(maxY, agg[d].marketing);
  }
  if(maxY === 0) maxY = 1;
  // Arredonda para cima até um "nice number"
  const niceTop = niceCeil(maxY);

  // Layout SVG
  const W = 1000, H = 260;
  const padL = 48, padR = 16, padT = 12, padB = dates.length>14 ? 56 : 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slotW = plotW / dates.length;
  const groupedShown = (showUtil && showMkt) ? 2 : 1;
  const gap = Math.max(1, slotW * 0.12);
  const barW = Math.max(2, (slotW - gap*3) / groupedShown);

  // Grid Y (4 linhas)
  const yTicks = 4;
  let grid = '';
  for(let i=0; i<=yTicks; i++){
    const v = Math.round(niceTop * (i/yTicks));
    const y = padT + plotH - (v/niceTop)*plotH;
    grid += `<line class="wa-axis-grid" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>`;
    grid += `<text class="wa-axis-label" x="${padL-8}" y="${y+3}" text-anchor="end">${v.toLocaleString('pt-BR')}</text>`;
  }

  // Bars + labels X
  const rotated = dates.length > 14;
  let bars = '', xlabels = '';
  dates.forEach((d, i) => {
    const x0 = padL + i*slotW + gap;
    let bx = x0;
    if(showUtil){
      const v = agg[d].utility;
      const h = (v/niceTop) * plotH;
      const y = padT + plotH - h;
      bars += `<rect class="wa-bar-utility" x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" data-date="${d}" data-bucket="utility"/>`;
      bx += barW + gap;
    }
    if(showMkt){
      const v = agg[d].marketing;
      const h = (v/niceTop) * plotH;
      const y = padT + plotH - h;
      bars += `<rect class="wa-bar-marketing" x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" data-date="${d}" data-bucket="marketing"/>`;
    }
    // X label
    const lblX = padL + i*slotW + slotW/2;
    const showEvery = dates.length > 30 ? 5 : dates.length > 14 ? 2 : 1;
    if(i % showEvery === 0){
      const dd = new Date(d+'T12:00:00');
      const lbl = dd.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      if(rotated){
        xlabels += `<text class="wa-axis-label" x="${lblX}" y="${padT+plotH+18}" text-anchor="end" transform="rotate(-45 ${lblX} ${padT+plotH+18})">${lbl}</text>`;
      } else {
        xlabels += `<text class="wa-axis-label" x="${lblX}" y="${padT+plotH+18}" text-anchor="middle">${lbl}</text>`;
      }
    }
  });

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}${bars}${xlabels}</svg>`;

  // Listeners para tooltip
  wrap.querySelectorAll('rect[data-date]').forEach(r => {
    r.addEventListener('mouseenter', e => showWATooltip(e, r.dataset.date, r.dataset.bucket));
    r.addEventListener('mouseleave', hideWATooltip);
    r.addEventListener('click', e => showWATooltip(e, r.dataset.date, r.dataset.bucket, true));
  });
}

// Arredondamento "nice" para o topo do eixo Y
function niceCeil(v){
  if(v <= 10) return Math.max(5, Math.ceil(v));
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  let nice;
  if(norm <= 1)      nice = 1;
  else if(norm <= 2) nice = 2;
  else if(norm <= 5) nice = 5;
  else               nice = 10;
  return nice * pow;
}

let _waTooltipPinned = false;
function showWATooltip(evt, date, bucket, pin=false){
  const tip = document.getElementById('wa-tooltip');
  if(!tip) return;
  if(pin) _waTooltipPinned = !_waTooltipPinned;
  if(!pin && _waTooltipPinned) return;

  const rows = getWAFilteredRows();
  const byNumber = aggregateByNumber(rows, date, bucket);
  // Ordena por count desc
  byNumber.sort((a,b)=>b.count-a.count);

  const dd = new Date(date+'T12:00:00');
  const dateLbl = dd.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  const bucketLbl = bucket==='utility' ? 'Utility (inclui auth)' : 'Marketing';
  const dotCls = bucket==='utility' ? 'wa-dot-util' : 'wa-dot-mkt';

  let total = 0;
  let body = '';
  if(byNumber.length === 0){
    body = `<div style="font-size:12px;color:var(--t3);padding:4px 0">Sem conversations neste dia.</div>`;
  } else {
    for(const item of byNumber){
      const num = waNumbers.find(n=>n.id===item.wa_number_id);
      const label = num ? (num.label || num.display_phone_number) : 'Número removido';
      const phone = num ? num.display_phone_number : '—';
      let lineCost = 0;
      const tariffNote = [];
      for(const [cat, cnt] of Object.entries(item.byCat)){
        const c = (waTariffs[cat]||0) * cnt;
        lineCost += c;
        tariffNote.push(`${cnt} × R$ ${(waTariffs[cat]||0).toFixed(4)}${cat==='authentication'?' (auth)':''}`);
      }
      total += lineCost;
      body += `<div class="wa-tooltip-row">
        <div class="wa-tooltip-num">${esc(label)}<small>${esc(phone)} · ${tariffNote.join(' + ')}</small></div>
        <div class="wa-tooltip-val"><strong>${brl(lineCost)}</strong>${item.count} conv.</div>
      </div>`;
    }
  }

  tip.innerHTML = `
    <div class="wa-tooltip-head"><span class="wa-dot ${dotCls}"></span>${bucketLbl} · ${dateLbl}</div>
    ${body}
    ${byNumber.length ? `<div class="wa-tooltip-total"><span>Total</span><span>${brl(total)}</span></div>` : ''}
  `;

  // Posicionamento: relativo ao wa-chart-card (container do tooltip)
  const card = tip.parentElement;
  const cardRect = card.getBoundingClientRect();
  const barRect = evt.currentTarget.getBoundingClientRect();
  // Mostrar primeiro para medir
  tip.classList.add('on');
  const tipW = tip.offsetWidth, tipH = tip.offsetHeight;
  let x = barRect.left + barRect.width/2 - cardRect.left - tipW/2;
  let y = barRect.top - cardRect.top - tipH - 8;
  // Clamp horizontal dentro do card
  x = Math.max(8, Math.min(x, cardRect.width - tipW - 8));
  // Se não cabe acima, mostra abaixo
  if(y < 8){ y = barRect.bottom - cardRect.top + 8; }
  tip.style.left = `${x}px`;
  tip.style.top  = `${y}px`;
  tip.setAttribute('aria-hidden','false');
}

function hideWATooltip(){
  if(_waTooltipPinned) return;
  const tip = document.getElementById('wa-tooltip');
  if(!tip) return;
  tip.classList.remove('on');
  tip.setAttribute('aria-hidden','true');
}

// Fechar tooltip pinned ao clicar fora
document.addEventListener('click', e => {
  if(!_waTooltipPinned) return;
  if(e.target.closest('#wa-tooltip')) return;
  if(e.target.closest('rect[data-date]')) return;
  _waTooltipPinned = false;
  hideWATooltip();
});

// ─── Toolbar handlers ─────────────────────────
function setWAPeriod(p, el){
  waPeriod = p;
  document.querySelectorAll('#view-whatsapp .seg-btn').forEach(b=>b.classList.toggle('on', b===el));
  renderWhatsApp();
}
function setWACategory(c, el){
  waCategoryFilter = c;
  document.querySelectorAll('#view-whatsapp .fchip').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
  renderWhatsApp();
}
function setWANumber(id){
  waNumberFilter = id;
  renderWhatsApp();
}

// ─── CRUD números ─────────────────────────────
function openWANumbersModal(){
  renderWANumbersModal();
  openModal('wa-numbers-modal');
  setTimeout(()=>document.getElementById('wa-num-display')?.focus(), 50);
}

function renderWANumbersModal(){
  const wrap = document.getElementById('wa-numbers-list');
  if(!wrap) return;
  if(waNumbers.length===0){
    wrap.innerHTML = `<div class="wa-empty-numbers">Nenhum número cadastrado.<br>Adicione abaixo o display number e o Phone Number ID que aparecem no Meta Developer Console.</div>`;
    return;
  }
  wrap.innerHTML = waNumbers.map(n=>`
    <div class="wa-num-row ${n.active?'':'inactive'}">
      <div class="wa-num-info">
        <div class="wa-num-label-row">
          <span class="wa-num-label">${esc(n.label || 'Sem apelido')}</span>
          ${n.active?'':'<span class="tag" style="background:var(--s3);color:var(--t3);font-size:9px;padding:2px 6px;border-radius:4px">INATIVO</span>'}
        </div>
        <div class="wa-num-display">${esc(n.display_phone_number)}</div>
        <div class="wa-num-pid">ID Meta: ${esc(n.phone_number_id)}</div>
      </div>
      <div class="wa-num-actions">
        <button onclick="editWANumber('${n.id}')">Editar</button>
        <button onclick="toggleWANumberActive('${n.id}')">${n.active?'Desativar':'Ativar'}</button>
        <button class="danger" onclick="deleteWANumber('${n.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

async function addWANumber(){
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const display = document.getElementById('wa-num-display').value.trim();
  const pid     = document.getElementById('wa-num-pid').value.trim();
  const label   = document.getElementById('wa-num-label').value.trim();
  const country = (document.getElementById('wa-num-country').value.trim() || 'BR').toUpperCase().slice(0,2);
  if(!display || !pid){ toast('Preencha display number e Phone Number ID','error'); return; }
  const { error } = await sb.from('cmd_wa_numbers').insert({
    owner_id: _currentSession.user.id,
    display_phone_number: display,
    phone_number_id: pid,
    label: label,
    country_code: country,
    active: true,
  });
  if(error){
    toast('Erro ao adicionar: ' + error.message, 'error');
    return;
  }
  document.getElementById('wa-num-display').value = '';
  document.getElementById('wa-num-pid').value = '';
  document.getElementById('wa-num-label').value = '';
  document.getElementById('wa-num-country').value = 'BR';
  await loadWA();
  renderWANumbersModal();
  if(currentView==='whatsapp') renderWhatsApp();
  toast('Número adicionado','success');
}

async function editWANumber(id){
  const n = waNumbers.find(x=>x.id===id);
  if(!n) return;
  // Inline edit simples: prompt seria anti-pattern → reusa o form de baixo
  document.getElementById('wa-num-display').value = n.display_phone_number;
  document.getElementById('wa-num-pid').value = n.phone_number_id;
  document.getElementById('wa-num-label').value = n.label || '';
  document.getElementById('wa-num-country').value = n.country_code || 'BR';
  // Troca o botão "Adicionar" por "Salvar" temporariamente
  const btn = document.querySelector('#wa-numbers-modal .wa-numbers-add .btn-primary');
  if(!btn) return;
  btn.textContent = 'Salvar alterações';
  btn.setAttribute('data-editing', id);
  btn.onclick = ()=>saveWANumberEdit(id);
  document.getElementById('wa-num-display').focus();
}

async function saveWANumberEdit(id){
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const display = document.getElementById('wa-num-display').value.trim();
  const pid     = document.getElementById('wa-num-pid').value.trim();
  const label   = document.getElementById('wa-num-label').value.trim();
  const country = (document.getElementById('wa-num-country').value.trim() || 'BR').toUpperCase().slice(0,2);
  if(!display || !pid){ toast('Preencha display number e Phone Number ID','error'); return; }
  const { error } = await sb.from('cmd_wa_numbers').update({
    display_phone_number: display, phone_number_id: pid, label, country_code: country
  }).eq('id', id);
  if(error){ toast('Erro: '+error.message,'error'); return; }
  // Restaura o botão
  const btn = document.querySelector('#wa-numbers-modal .wa-numbers-add .btn-primary');
  if(btn){ btn.textContent='Adicionar número'; btn.removeAttribute('data-editing'); btn.onclick = addWANumber; }
  document.getElementById('wa-num-display').value = '';
  document.getElementById('wa-num-pid').value = '';
  document.getElementById('wa-num-label').value = '';
  document.getElementById('wa-num-country').value = 'BR';
  await loadWA();
  renderWANumbersModal();
  if(currentView==='whatsapp') renderWhatsApp();
  toast('Número atualizado','success');
}

async function toggleWANumberActive(id){
  const n = waNumbers.find(x=>x.id===id);
  if(!n) return;
  const { error } = await sb.from('cmd_wa_numbers').update({ active: !n.active }).eq('id', id);
  if(error){ toast('Erro: '+error.message,'error'); return; }
  n.active = !n.active;
  renderWANumbersModal();
  if(currentView==='whatsapp') renderWhatsApp();
}

async function deleteWANumber(id){
  // Remoção optimistic com toast undo (padrão do projeto, sem confirm() nativo)
  const idx = waNumbers.findIndex(x=>x.id===id);
  if(idx<0) return;
  const removed = waNumbers[idx];
  waNumbers.splice(idx,1);
  renderWANumbersModal();
  if(currentView==='whatsapp') renderWhatsApp();
  toast(`Número "${removed.label||removed.display_phone_number}" será excluído`, 'info', {
    label:'Desfazer',
    cb: ()=>{
      waNumbers.splice(idx,0,removed);
      renderWANumbersModal();
      if(currentView==='whatsapp') renderWhatsApp();
    }
  });
  // Aguarda 5s (TTL do toast com action) antes de confirmar exclusão no banco
  setTimeout(async ()=>{
    if(waNumbers.find(x=>x.id===id)) return; // usuário desfez
    const { error } = await sb.from('cmd_wa_numbers').delete().eq('id', id);
    if(error){
      toast('Erro ao excluir: '+error.message,'error');
      waNumbers.splice(idx,0,removed);
      renderWANumbersModal();
      if(currentView==='whatsapp') renderWhatsApp();
    }
  }, 5200);
}

// ─── Tarifas ──────────────────────────────────
function openWATariffsModal(){
  document.getElementById('wa-tar-utility').value   = (waTariffs.utility||0).toFixed(4);
  document.getElementById('wa-tar-marketing').value = (waTariffs.marketing||0).toFixed(4);
  document.getElementById('wa-tar-auth').value      = (waTariffs.authentication||0).toFixed(4);
  document.getElementById('wa-tar-service').value   = (waTariffs.service||0).toFixed(4);
  openModal('wa-tariffs-modal');
  setTimeout(()=>document.getElementById('wa-tar-utility')?.focus(), 50);
}

async function saveWATariffs(){
  if(!_currentSession){ toast('Sessão expirada','error'); return; }
  const uid = _currentSession.user.id;
  const newVals = {
    utility:        parseFloat(document.getElementById('wa-tar-utility').value)   || 0,
    marketing:      parseFloat(document.getElementById('wa-tar-marketing').value) || 0,
    authentication: parseFloat(document.getElementById('wa-tar-auth').value)      || 0,
    service:        parseFloat(document.getElementById('wa-tar-service').value)   || 0,
  };
  const rows = Object.entries(newVals).map(([category, price_brl])=>({
    owner_id: uid, category, price_brl, updated_at: new Date().toISOString()
  }));
  const { error } = await sb.from('cmd_wa_tariffs').upsert(rows, { onConflict:'owner_id,category' });
  if(error){ toast('Erro ao salvar tarifas: '+error.message,'error'); return; }
  waTariffs = newVals;
  closeModal('wa-tariffs-modal');
  if(currentView==='whatsapp') renderWhatsApp();
  toast('Tarifas atualizadas','success');
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
function init(){
  document.getElementById('topbar-date').textContent=today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
  document.getElementById('m-date').value=isoToday;
  document.getElementById('meeting-date').value=isoToday;
  // Sync segmented control com peopleSort persistido
  document.querySelectorAll('#view-people .seg-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.sort===peopleSort);
  });
  // Check existing session
  sb.auth.getSession().then(({data:{session}})=>{
    if(!session){
      document.getElementById('auth-screen').style.display='flex';
    }
  });
}
init();