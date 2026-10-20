// ══════════════════════════════════════════════
// PLANO 90 DIAS — alinhamento trimestral: metas → entregáveis → tarefas
// ══════════════════════════════════════════════
// O doc do Junior vira seções (cmd_plan_goals) com entregáveis (cmd_plan_items).
// A tarefa entra num entregável por plan_item_id. "Entregue" é marcado à mão:
// as tarefas mostram o andamento, mas não fecham o entregável sozinhas.

let plan=null, planGoals=[], planItems=[];
let _planLoaded=false, planLoadError='';
let planView=lsGet('plan_view')==='meses'?'meses':'metas';
let planHideDone=lsGet('plan_hide_done')==='1';
const planOpen=new Set();   // entregáveis expandidos na visão Metas

// Preferências de visão ficam no navegador (podem não existir em aba privada)
function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(_){} }

const PLAN_ICON={
  target:'<svg class="empty-icon" width="32" height="32" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="0.75" fill="currentColor"/></svg>',
  edit:'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  chev:'<svg class="plan-chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// ── Helpers ──
const bySort=(a,b)=>(a.sort_order-b.sort_order)||String(a.created_at||'').localeCompare(String(b.created_at||''));
function planGoalById(id){ return planGoals.find(g=>g.id===id); }
function planItemById(id){ return planItems.find(i=>i.id===id); }
function isGapGoal(g){ return g?.kind==='gaps'; }
function goalItems(gid){ return planItems.filter(i=>i.goal_id===gid).sort(bySort); }
function goalLabel(g){ return /^\d+$/.test(g.code||'') ? `Meta ${g.code.padStart(2,'0')} · ${g.title}` : g.title; }
// Código pela posição: A.3, 1.2, G.1
function planItemCode(it){
  const g=planGoalById(it.goal_id); if(!g) return '';
  return `${g.code||'?'}.${goalItems(g.id).indexOf(it)+1}`;
}
function planItemTasks(id){ return tasks.filter(t=>t.planItemId===id); }
// Entregáveis contam para a %; gaps não
function deliverables(){ return planGoals.filter(g=>!isGapGoal(g)).flatMap(g=>goalItems(g.id)); }
function itemState(it){
  if(it.status==='done') return 'done';
  if(!it.due_date) return 'nodate';
  if(it.due_date<isoToday) return 'overdue';
  if(it.due_date===isoToday) return 'today';
  return 'open';
}
function needsNextStep(it){ return it.status!=='done' && !planItemTasks(it.id).some(t=>!t.done); }
function localDay(ts){ return ts ? isoDate(new Date(ts)) : ''; }
function dayMonth(iso){ return iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}` : ''; }
function clip(s,n){ s=String(s||''); return s.length>n ? s.slice(0,n-1)+'…' : s; }
// Só http(s) vira link (nada de javascript: vindo do banco)
function safeUrl(u){ u=String(u||'').trim(); return /^https?:\/\//i.test(u) ? u : ''; }

function planStats(){
  const all=deliverables();
  const done=all.filter(i=>i.status==='done').length, total=all.length;
  const totalDays=daysBetween(plan.period_start,plan.period_end)+1;
  const day=Math.min(totalDays,Math.max(0,daysBetween(plan.period_start,isoToday)+1));
  const pctDone=total?Math.round(done/total*100):0;
  const pctTime=Math.round(day/totalDays*100);
  return {
    done, total, day, totalDays, pctDone, pctTime,
    onPace: pctDone>=pctTime-10,
    overdue: all.filter(i=>itemState(i)==='overdue'),
    noStep:  all.filter(needsNextStep),
    noDate:  all.filter(i=>i.status!=='done' && !i.due_date)
  };
}

// Meses do período (out, nov, dez), com quantos dias de cada caem dentro dele
function planMonths(){
  const out=[], endKey=plan.period_end.slice(0,7);
  const d=new Date(plan.period_start.slice(0,7)+'-01T12:00:00');
  for(let i=0;i<24;i++){
    const key=isoDate(d).slice(0,7);
    const first=key+'-01'>plan.period_start ? key+'-01' : plan.period_start;
    const monthEnd=isoDate(new Date(d.getFullYear(),d.getMonth()+1,0));
    const last=monthEnd<plan.period_end ? monthEnd : plan.period_end;
    const name=d.toLocaleDateString('pt-BR',{month:'long'});
    out.push({ key, label:name.charAt(0).toUpperCase()+name.slice(1), short:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''), days:daysBetween(first,last)+1 });
    if(key>=endKey) break;
    d.setMonth(d.getMonth()+1);
  }
  return out;
}

// ── Carga ──
async function loadPlan(){
  const [pRes,gRes,iRes]=await Promise.all([
    sb.from('cmd_plans').select('*').eq('archived',false).order('period_start',{ascending:false}).limit(1),
    sb.from('cmd_plan_goals').select('*'),
    sb.from('cmd_plan_items').select('*')
  ]);
  _planLoaded=true;
  const err=pRes.error||gRes.error||iRes.error;
  if(err){ planLoadError=err.message||'erro desconhecido'; console.error('loadPlan',err); renderPlan(); return; }
  planLoadError='';
  plan=pRes.data?.[0]||null;
  planGoals=plan ? (gRes.data||[]).filter(g=>g.plan_id===plan.id).sort(bySort) : [];
  const gids=new Set(planGoals.map(g=>g.id));
  planItems=(iRes.data||[]).filter(i=>gids.has(i.goal_id));
  renderPlan();
  renderBoard();   // tags de plano nos cartões
}

// ── Salvamento ──
async function savePlanItem(id, patch){
  const it=planItemById(id); if(!it) return false;
  Object.assign(it, patch);
  const { error }=await track(sb.from('cmd_plan_items').update(patch).eq('id',id));
  if(error){ toast('Erro ao salvar entregável: '+esc(error.message),'error'); return false; }
  return true;
}
async function savePlanGoal(id, patch){
  const g=planGoalById(id); if(!g) return false;
  Object.assign(g, patch);
  const { error }=await track(sb.from('cmd_plan_goals').update(patch).eq('id',id));
  if(error){ toast('Erro ao salvar meta: '+esc(error.message),'error'); return false; }
  return true;
}

// Campos de texto salvam sem redesenhar a tela inteira (o clique seguinte não se perde)
function planFieldChanged(id, field, el){
  const it=planItemById(id); if(!it) return;
  let v=el.value;
  if(field==='title'){ v=v.trim(); if(!v){ el.value=it.title; return; } }
  if(field==='due_date') v=v||null;
  if(field==='link_url'){ v=v.trim(); if(v && !/^https?:\/\//i.test(v)) v='https://'+v; el.value=v; }
  if((it[field]??'')===(v??'')) return;
  savePlanItem(id,{[field]:v});
  refreshPlanItem(id);
}

// Redesenha só a linha do entregável, o resumo e o contador da meta
function refreshPlanItem(id){
  const it=planItemById(id); if(!it) return;
  const g=planGoalById(it.goal_id);
  const row=document.getElementById('plan-row-'+id);
  if(row) row.outerHTML=planItemRowHTML(it,g);
  const a=document.getElementById('plan-link-'+id);
  if(a){ const u=safeUrl(it.link_url); a.href=u||'#'; a.hidden=!u; }
  const ct=document.querySelector(`#plan-goal-${it.goal_id} .plan-goal-count`);
  if(ct && g) ct.textContent=goalCountText(g);
  renderPlanHead();
}

async function togglePlanItemDone(id){
  const it=planItemById(id); if(!it) return;
  const done=it.status!=='done';
  it.status=done?'done':'open';
  it.done_at=done?new Date().toISOString():null;   // só para exibir; o banco grava o oficial
  renderPlan();
  document.querySelector(`#plan-row-${id} .card-check`)?.focus();
  const ok=await savePlanItem(id,{status:it.status});
  if(ok && done) toast(`${esc(planItemCode(it))} entregue ✓`);
}

async function createPlanItem(gid, title, due){
  if(!_currentSession){ toast('Sessão expirada','error'); return false; }
  const items=goalItems(gid);
  const row={ id:crypto.randomUUID(), owner_id:_currentSession.user.id, goal_id:gid, title, details:'', link_url:'',
              due_date:due||null, status:'open', sort_order:items.length?Math.max(...items.map(i=>i.sort_order))+1:0 };
  planItems.push({ ...row, done_at:null, created_at:new Date().toISOString() });
  const { error }=await track(sb.from('cmd_plan_items').insert(row));
  if(error){
    planItems=planItems.filter(i=>i.id!==row.id); renderPlan();
    toast('Erro ao criar entregável: '+esc(error.message),'error'); return false;
  }
  return true;
}

// Excluir com Desfazer: some na hora, o banco só apaga depois da janela de 5s
function deletePlanItem(id){
  const it=planItemById(id); if(!it) return;
  const linked=planItemTasks(id);
  planItems=planItems.filter(i=>i.id!==id);
  planOpen.delete(id);
  linked.forEach(t=>t.planItemId=null);
  renderPlan(); if(linked.length) renderBoard();
  toast('Entregável excluído','info',{label:'Desfazer',cb:()=>{
    planItems.push(it);
    linked.forEach(t=>t.planItemId=id);
    renderPlan(); if(linked.length) renderBoard();
  }});
  setTimeout(async()=>{
    if(planItemById(id)) return;
    const { error }=await track(sb.from('cmd_plan_items').delete().eq('id',id));
    if(error) toast('Erro ao excluir entregável: '+esc(error.message),'error');
  },5000);
}

async function linkTaskToPlanItem(taskId, itemId){
  const t=tasks.find(x=>x.id===taskId); if(!t) return;
  const prev=t.planItemId;
  t.planItemId=itemId||null;
  onTasksChanged();
  if(!itemId && prev) toast('Tarefa desvinculada','info',{label:'Desfazer',cb:()=>linkTaskToPlanItem(taskId,prev)});
  await sbUpsert(t);
}

// ── Metas (seções) ──
async function createPlanGoal(title){
  if(!_currentSession||!plan) return false;
  const goals=planGoals.filter(g=>!isGapGoal(g));
  const nums=goals.map(g=>parseInt(g.code,10)).filter(n=>!isNaN(n));
  const sort=goals.length?Math.max(...goals.map(g=>g.sort_order))+1:0;
  const row={ id:crypto.randomUUID(), owner_id:_currentSession.user.id, plan_id:plan.id, code:String((nums.length?Math.max(...nums):0)+1),
              title, description:'', kind:'goal', sort_order:sort };
  // Gaps continuam por último
  const bumped=planGoals.filter(g=>isGapGoal(g) && g.sort_order<=sort);
  bumped.forEach((g,i)=>{ g.sort_order=sort+1+i; });
  planGoals.push({ ...row, created_at:new Date().toISOString() });
  planGoals.sort(bySort);
  const res=await Promise.all([
    track(sb.from('cmd_plan_goals').insert(row)),
    ...bumped.map(g=>track(sb.from('cmd_plan_goals').update({sort_order:g.sort_order}).eq('id',g.id)))
  ]);
  const err=res.find(r=>r?.error)?.error;
  if(err){ toast('Erro ao criar meta: '+esc(err.message),'error'); return false; }
  return true;
}

async function deletePlanGoal(gid){
  const g=planGoalById(gid); if(!g || goalItems(gid).length) return;
  planGoals=planGoals.filter(x=>x.id!==gid);
  renderPlan();
  const { error }=await track(sb.from('cmd_plan_goals').delete().eq('id',gid));
  if(error){ planGoals.push(g); planGoals.sort(bySort); renderPlan(); toast('Erro ao excluir meta: '+esc(error.message),'error'); return; }
  toast('Meta excluída');
}

// Renomear no lugar (Enter salva, Esc cancela)
function renamePlanGoal(gid){
  const el=document.getElementById('plan-goal-t-'+gid), g=planGoalById(gid);
  if(!el||!g) return;
  el.contentEditable='true'; el.classList.add('editing'); el.focus();
  const range=document.createRange(); range.selectNodeContents(el);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  let finished=false;
  const finish=save=>{
    if(finished) return; finished=true;
    el.contentEditable='false'; el.classList.remove('editing');
    const txt=el.textContent.trim();
    if(save && txt && txt!==g.title) savePlanGoal(gid,{title:txt});
    else el.textContent=g.title;
  };
  el.addEventListener('blur',()=>finish(true),{once:true});
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); el.blur(); }
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); el.blur(); }
  });
}

// Formulário inline (mesmo padrão do 1:1): segue aberto para lançar o próximo
function addPlanItem(gid){
  const btn=document.getElementById('plan-add-'+gid); if(!btn) return;
  const sec=btn.parentElement;
  const existing=sec.querySelector('.oo-inline-form');
  if(existing){ existing.querySelector('.oo-inline-input').focus(); return; }
  const gap=isGapGoal(planGoalById(gid));
  const form=document.createElement('form');
  form.className='oo-inline-form';
  form.innerHTML=`<input type="text" class="oo-inline-input" placeholder="${gap?'Novo gap…':'Novo entregável…'}" aria-label="${gap?'Novo gap':'Novo entregável'}" required>
    ${gap?'':'<input type="date" class="plan-input mono plan-inline-date" aria-label="Prazo (opcional)">'}
    <button type="submit" class="oo-inline-save">Adicionar</button>
    <button type="button" class="oo-inline-cancel">Cancelar</button>`;
  sec.insertBefore(form,btn);
  btn.hidden=true;
  const input=form.querySelector('.oo-inline-input');
  input.focus();
  const close=()=>{ form.remove(); btn.hidden=false; btn.focus(); };
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const title=input.value.trim(); if(!title) return;
    const due=form.querySelector('.plan-inline-date')?.value||null;
    createPlanItem(gid,title,due);
    renderPlan();
    addPlanItem(gid);
  });
  form.querySelector('.oo-inline-cancel').addEventListener('click',close);
  form.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); } });
}

function addPlanGoal(){
  if(!plan) return;
  if(planView!=='metas') setPlanView('metas');
  const host=document.getElementById('plan-goal-new'); if(!host) return;
  const existing=host.querySelector('form');
  if(existing){ existing.querySelector('input').focus(); return; }
  const form=document.createElement('form');
  form.className='oo-inline-form';
  form.innerHTML=`<input type="text" class="oo-inline-input" placeholder="Nome da nova meta…" aria-label="Nome da nova meta" required>
    <button type="submit" class="oo-inline-save">Criar meta</button>
    <button type="button" class="oo-inline-cancel">Cancelar</button>`;
  host.appendChild(form);
  const input=form.querySelector('input');
  input.focus();
  host.scrollIntoView({block:'center',behavior:'smooth'});
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const title=input.value.trim(); if(!title) return;
    createPlanGoal(title);
    renderPlan();
    const g=planGoals.filter(x=>!isGapGoal(x)).at(-1);
    if(g){ document.getElementById('plan-goal-'+g.id)?.scrollIntoView({block:'center'}); addPlanItem(g.id); }
  });
  form.querySelector('.oo-inline-cancel').addEventListener('click',()=>form.remove());
  form.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); form.remove(); } });
}

// ── Navegação dentro da aba ──
function setPlanView(v){
  planView=v==='meses'?'meses':'metas';
  lsSet('plan_view',planView);
  renderPlan();
}
function setPlanHideDone(on){
  planHideDone=!!on;
  lsSet('plan_hide_done',planHideDone?'1':'0');
  renderPlan();
}
function togglePlanItemOpen(id){
  planOpen.has(id) ? planOpen.delete(id) : planOpen.add(id);
  renderPlan();
  document.querySelector(`#plan-row-${id} .plan-item-main`)?.focus();
}
// Da linha do tempo ou da visão Meses: abre o entregável na visão Metas
function planFocusItem(id){
  const it=planItemById(id); if(!it) return;
  if(currentView!=='plano') navTo('plano');
  if(planHideDone && it.status==='done') setPlanHideDone(false);
  planOpen.add(id);
  setPlanView('metas');
  const row=document.getElementById('plan-row-'+id);
  row?.scrollIntoView({block:'center',behavior:'smooth'});
  row?.querySelector('.plan-item-main')?.focus({preventScroll:true});
}

// ── Render ──
function updatePlanBadge(){
  const b=document.getElementById('nav-badge-plano'); if(!b) return;
  if(!plan){ b.hidden=true; return; }
  const all=deliverables();
  b.hidden=false;
  b.textContent=`${all.filter(i=>i.status==='done').length}/${all.length}`;
}

function syncPlanToolbar(){
  document.querySelectorAll('#plan-toolbar [data-plan-view]').forEach(b=>{
    const on=b.dataset.planView===planView;
    b.classList.toggle('on',on); b.setAttribute('aria-pressed',on);
  });
  const cb=document.getElementById('plan-hide-done'); if(cb) cb.checked=planHideDone;
  const st=document.getElementById('plan-status-btn'); if(st) st.textContent=`Status p/ ${plan.assigned_by||'gestor'}`;
}

function renderPlan(){
  updatePlanBadge();
  const root=document.getElementById('plan-root'), bar=document.getElementById('plan-toolbar');
  if(!root) return;
  if(!_planLoaded){ bar.hidden=true; root.innerHTML='<p class="list-empty">Carregando…</p>'; return; }
  if(planLoadError || !plan){ bar.hidden=true; root.innerHTML=planEmptyHTML(); return; }
  bar.hidden=false;
  syncPlanToolbar();
  root.innerHTML=`<div id="plan-head">${planHeadHTML(planStats())}</div>
    <div id="plan-body">${planView==='meses'?planMonthsHTML():planGoalsHTML()}</div>`;
}
function renderPlanHead(){
  const el=document.getElementById('plan-head');
  if(el && plan) el.innerHTML=planHeadHTML(planStats());
  updatePlanBadge();
}

function planEmptyHTML(){
  const noTables=/cmd_plan|relation|does not exist|schema cache/i.test(planLoadError);
  const text=planLoadError
    ? (noTables
        ? 'As tabelas do plano ainda não existem. Rode <strong>supabase/migration_v9_plano.sql</strong> e depois <strong>seed_plano_4tri_2026.sql</strong> no SQL Editor do Supabase.'
        : 'Não consegui carregar o plano: '+esc(planLoadError))
    : 'Nenhum plano ativo. Rode <strong>supabase/seed_plano_4tri_2026.sql</strong> no SQL Editor do Supabase para carregar o alinhamento do 4º tri.';
  return `<div class="reun-empty"><div class="empty-state">${PLAN_ICON.target}<p class="empty-title">Plano 90 dias</p><p class="empty-text">${text}</p></div></div>`;
}

function planHeadHTML(s){
  const who=[plan.assigned_by&&`Passado por ${plan.assigned_by}`, plan.role].filter(Boolean).join(' · ');
  const src=safeUrl(plan.source_url);
  const late=s.overdue.length, nostep=s.noStep.length, nodate=s.noDate.length;
  const notes=[late&&`${late} atrasado${late>1?'s':''}`, nostep&&`${nostep} sem próximo passo`, nodate&&`${nodate} sem prazo`].filter(Boolean).join(' · ')
    || 'Tudo com prazo e próximo passo';
  return `<section class="plan-head" aria-label="Resumo do plano">
    <div class="plan-head-top">
      <div class="plan-head-titles">${who?`<p class="plan-eyebrow">${esc(who)}</p>`:''}<h2 class="plan-title">${esc(plan.title)}</h2></div>
      ${src?`<a class="btn-sm plan-src" href="${esc(src)}" target="_blank" rel="noopener noreferrer">Doc original ↗</a>`:''}
    </div>
    <div class="plan-kpis">
      <div class="plan-kpi"><span class="plan-kpi-val">${s.done}<small>/${s.total}</small></span><span class="plan-kpi-lbl">entregues · ${s.pctDone}%</span></div>
      <div class="plan-kpi"><span class="plan-kpi-val">Dia ${s.day}<small>/${s.totalDays}</small></span><span class="plan-kpi-lbl">${s.pctTime}% do trimestre</span></div>
      <div class="plan-kpi"><span class="plan-pace ${s.onPace?'on':'off'}" title="${s.pctDone}% entregue com ${s.pctTime}% do trimestre decorrido">${s.onPace?'No ritmo':'Atrás do ritmo'}</span><span class="plan-kpi-lbl">${esc(notes)}</span></div>
    </div>
    ${planTimelineHTML(s)}
  </section>`;
}

// Linha do tempo out | nov | dez: um ponto por data de entrega, marcador de hoje
function planTimelineHTML(s){
  const start=plan.period_start, end=plan.period_end, total=s.totalDays;
  const pos=d=>Math.min(100,Math.max(0,(daysBetween(start,d)+0.5)/total*100));
  const months=planMonths();
  const seps=months.slice(1).map(m=>`<span class="plan-tl-sep" style="left:${daysBetween(start,m.key+'-01')/total*100}%"></span>`).join('');
  const byDate={};
  deliverables().filter(i=>i.due_date).forEach(i=>{ (byDate[i.due_date]=byDate[i.due_date]||[]).push(i); });
  const dots=Object.entries(byDate).map(([d,items])=>{
    const sts=items.map(itemState);
    const cls=sts.includes('overdue')?'overdue':sts.every(x=>x==='done')?'done':'open';
    const label=`${formatDate(d)}: `+items.map(i=>`${planItemCode(i)} ${i.title}${i.status==='done'?' (entregue)':itemState(i)==='overdue'?' (atrasado)':''}`).join('; ');
    return `<button type="button" class="plan-tl-dot ${cls} ${items.length>1?'multi':''}" style="left:${pos(d)}%" title="${esc(label)}" aria-label="${esc(label)}" onclick="planFocusItem('${items[0].id}')">${items.length>1?items.length:''}</button>`;
  }).join('');
  const inRange=isoToday>=start && isoToday<=end;
  const elapsed=inRange?pos(isoToday):(isoToday>end?100:0);
  return `<div class="plan-tl">
    <div class="plan-tl-track">
      <span class="plan-tl-elapsed" style="width:${elapsed}%"></span>
      ${seps}
      ${inRange?`<span class="plan-tl-today" style="left:${pos(isoToday)}%"><span class="plan-tl-today-lbl">hoje</span></span>`:''}
      ${dots}
    </div>
    <div class="plan-tl-months" aria-hidden="true">${months.map(m=>`<span style="width:${m.days/total*100}%">${esc(m.short)}</span>`).join('')}</div>
  </div>`;
}

function goalCountText(g){
  const items=goalItems(g.id);
  return isGapGoal(g) ? String(items.length) : `${items.filter(i=>i.status==='done').length}/${items.length}`;
}

function planGoalsHTML(){
  return planGoals.map(g=>{
    const items=goalItems(g.id), gap=isGapGoal(g);
    const shown=planHideDone ? items.filter(i=>i.status!=='done') : items;
    const eyebrow=/^\d+$/.test(g.code||'') ? `<span class="plan-goal-code">Meta ${esc(g.code.padStart(2,'0'))}</span>` : '';
    return `<section class="plan-goal ${gap?'gaps':''}" id="plan-goal-${g.id}" aria-labelledby="plan-goal-t-${g.id}">
      <div class="plan-goal-head">
        ${eyebrow}
        <h3 class="plan-goal-title" id="plan-goal-t-${g.id}">${esc(g.title)}</h3>
        <div class="oo-item-actions">
          <button type="button" class="oo-item-btn" onclick="renamePlanGoal('${g.id}')" aria-label="Renomear ${esc(g.title)}" title="Renomear">${PLAN_ICON.edit}</button>
          ${items.length?'':`<button type="button" class="oo-item-btn del" onclick="deletePlanGoal('${g.id}')" aria-label="Excluir ${esc(g.title)}" title="Excluir">${ICON.x}</button>`}
        </div>
        <span class="plan-goal-count" title="${gap?'Gaps':'Entregues / total'}">${goalCountText(g)}</span>
      </div>
      ${g.description?`<p class="plan-goal-desc">${esc(g.description)}</p>`:''}
      ${shown.length ? `<div class="plan-items">${shown.map(it=>planItemHTML(it,g)).join('')}</div>`
        : items.length ? `<p class="mt-empty">Tudo entregue nesta meta.</p>` : ''}
      <button type="button" class="plan-add" id="plan-add-${g.id}" onclick="addPlanItem('${g.id}')">+ ${gap?'Gap':'Entregável'}</button>
    </section>`;
  }).join('') + `<div id="plan-goal-new"></div>`;
}

function planItemHTML(it,g){
  const open=planOpen.has(it.id);
  return `<div class="plan-item ${it.status==='done'?'done':''} ${open?'is-open':''}">${planItemRowHTML(it,g)}${open?planItemBodyHTML(it,g):''}</div>`;
}

function planDueTagHTML(it){
  const st=itemState(it);
  if(st==='done') return `<span class="tag done">entregue${it.done_at?' '+formatDate(localDay(it.done_at)):''}</span>`;
  if(st==='nodate') return `<span class="tag dt">sem prazo</span>`;
  if(st==='overdue') return `<span class="tag overdue">${formatDate(it.due_date)} · atrasado</span>`;
  if(st==='today') return `<span class="tag hoje">vence hoje</span>`;
  return `<span class="tag dt">${formatDate(it.due_date)}</span>`;
}

function planProgHTML(dn,n){
  return `<span class="plan-prog" title="${dn} de ${n} tarefas concluídas"><span class="plan-prog-bar" aria-hidden="true"><span style="width:${Math.round(dn/n*100)}%"></span></span>${dn}/${n} tarefas</span>`;
}

function planItemRowHTML(it,g){
  const gap=isGapGoal(g), open=planOpen.has(it.id), done=it.status==='done';
  const ts=planItemTasks(it.id), dn=ts.filter(t=>t.done).length;
  const check=gap ? '<span class="plan-check-sp" aria-hidden="true"></span>'
    : `<button type="button" class="card-check ${done?'done':''}" aria-pressed="${done}" aria-label="${done?'Reabrir':'Marcar como entregue'}: ${esc(it.title)}" onclick="togglePlanItemDone('${it.id}')">${done?ICON.checkSm:''}</button>`;
  return `<div class="plan-item-row" id="plan-row-${it.id}">
    ${check}
    <button type="button" class="plan-item-main" aria-expanded="${open}" aria-controls="plan-body-${it.id}" onclick="togglePlanItemOpen('${it.id}')">
      ${PLAN_ICON.chev}<span class="plan-item-code">${esc(planItemCode(it))}</span><span class="plan-item-title">${esc(it.title)}</span>
    </button>
    <span class="plan-item-meta">
      ${gap?'':planDueTagHTML(it)}
      ${ts.length?planProgHTML(dn,ts.length):''}
      ${!gap && needsNextStep(it)?'<span class="tag nostep">sem próximo passo</span>':''}
    </span>
  </div>`;
}

function planTaskRowHTML(t){
  const p=person(t.person);
  return `<div class="mt-task ${t.done?'done':''}">
    <button type="button" class="card-check ${t.done?'done':''}" aria-label="${t.done?'Marcar como não feita':'Marcar como concluída'}: ${esc(t.title)}" onclick="toggleDone('${t.id}')">${t.done?ICON.checkSm:''}</button>
    <button type="button" class="mt-task-title" onclick="openPanel('${t.id}')">${esc(t.title)}</button>
    <span class="mt-task-meta">${av(p,16)}<span>${esc(p.name)}</span><span class="tag dt ${!t.done&&isOverdue(t.dueDate)?'overdue':''}">${formatDate(t.dueDate)}</span></span>
    <button type="button" class="oo-item-btn del" title="Desvincular do entregável" aria-label="Desvincular do entregável: ${esc(t.title)}" onclick="linkTaskToPlanItem('${t.id}',null)">${ICON.x}</button>
  </div>`;
}

function planLinkSelectHTML(itemId){
  const free=tasks.filter(t=>!t.done && !t.planItemId).sort(sortByDateThenPri);
  if(!free.length) return '';
  return `<select class="plan-input plan-link-sel" aria-label="Vincular tarefa existente" onchange="if(this.value)linkTaskToPlanItem(this.value,'${itemId}')">
    <option value="">Vincular tarefa existente…</option>
    ${free.map(t=>`<option value="${esc(t.id)}">${esc(clip(t.title,60))} · ${esc(person(t.person).name)}${t.dueDate?' · '+esc(formatDate(t.dueDate)):''}</option>`).join('')}
  </select>`;
}

function planItemBodyHTML(it,g){
  const gap=isGapGoal(g), done=it.status==='done';
  const ts=planItemTasks(it.id).sort(sortByDateThenPri);
  const open=ts.filter(t=>!t.done), closed=ts.filter(t=>t.done);
  const link=safeUrl(it.link_url);
  const emptyMsg=(ts.length?'Todas as tarefas concluídas.':'Nenhuma tarefa ainda.')+(gap||done?'':' Qual é o próximo passo?');
  return `<div class="plan-item-body" id="plan-body-${it.id}">
    <div class="plan-fields">
      <label class="sp-field ${gap?'wide':''}"><span class="sp-label">${gap?'Gap':'Entregável'}</span>
        <input class="plan-input" value="${esc(it.title)}" onblur="planFieldChanged('${it.id}','title',this)" onkeydown="if(event.key==='Enter')this.blur()"></label>
      ${gap?'':`<label class="sp-field"><span class="sp-label">Prazo</span>
        <input type="date" class="plan-input mono" value="${it.due_date||''}" onchange="planFieldChanged('${it.id}','due_date',this)"></label>`}
      <label class="sp-field wide"><span class="sp-label">${gap?'Anotações':'Critério de pronto / detalhes'}</span>
        <textarea class="plan-input" rows="2" placeholder="${gap?'O que observar, exemplos, combinados…':'O que precisa estar pronto para contar como entregue?'}" onblur="planFieldChanged('${it.id}','details',this)">${esc(it.details)}</textarea></label>
      <div class="sp-field wide"><label class="sp-label" for="plan-url-${it.id}">Link</label>
        <div class="plan-link-row">
          <input id="plan-url-${it.id}" type="url" class="plan-input" value="${esc(it.link_url)}" placeholder="https://… (doc, planilha)" onblur="planFieldChanged('${it.id}','link_url',this)">
          <a class="btn-sm plan-link-open" id="plan-link-${it.id}" href="${esc(link||'#')}" target="_blank" rel="noopener noreferrer" ${link?'':'hidden'}>Abrir ↗</a>
        </div>
      </div>
    </div>
    <div class="plan-tasks">
      <div class="mt-sec-head"><span class="mt-sec-title">Tarefas</span>${ts.length?`<span class="mt-count">${closed.length}/${ts.length} concluídas</span>`:''}</div>
      ${open.length ? `<div class="mt-task-list">${open.map(planTaskRowHTML).join('')}</div>` : `<p class="mt-empty">${emptyMsg}</p>`}
      ${closed.length ? `<details class="plan-done"><summary>Concluídas (${closed.length})</summary><div class="mt-task-list">${closed.map(planTaskRowHTML).join('')}</div></details>` : ''}
      <div class="plan-actions">
        <button type="button" class="btn-sm primary" onclick="openTaskModal(null,null,null,'${it.id}')">+ Tarefa</button>
        ${planLinkSelectHTML(it.id)}
      </div>
    </div>
    <div class="plan-foot">
      ${gap?'':`<button type="button" class="btn-sm" onclick="togglePlanItemDone('${it.id}')">${done?'Reabrir':'Marcar como entregue'}</button>`}
      <button type="button" class="plan-del" onclick="deletePlanItem('${it.id}')">Excluir ${gap?'gap':'entregável'}</button>
    </div>
  </div>`;
}

// Visão Meses: entregáveis distribuídos por mês do prazo
function planMonthsHTML(){
  const months=planMonths(), first=months[0].key, last=months[months.length-1].key, now=isoToday.slice(0,7);
  const buckets=Object.fromEntries(months.map(m=>[m.key,[]])), nodate=[];
  deliverables().forEach(i=>{
    if(!i.due_date){ nodate.push(i); return; }
    let k=i.due_date.slice(0,7);
    if(k<first) k=first;
    if(k>last) k=last;
    buckets[k].push(i);
  });
  const byDue=(a,b)=>a.due_date<b.due_date?-1:a.due_date>b.due_date?1:0;
  const col=(title,list,{isNow=false,hint=''}={})=>{
    const shown=planHideDone ? list.filter(i=>i.status!=='done') : list;
    const dn=list.filter(i=>i.status==='done').length;
    return `<section class="plan-month">
      <header class="plan-month-head"><h3 class="plan-month-name">${esc(title)}</h3>${isNow?'<span class="plan-month-now">agora</span>':''}<span class="plan-goal-count">${dn}/${list.length}</span></header>
      <div class="plan-month-list">
        ${hint?`<p class="plan-month-hint">${hint}</p>`:''}
        ${shown.length ? shown.map(planMonthCardHTML).join('') : `<p class="col-empty">${list.length?'Tudo entregue.':'Nada com prazo neste mês.'}</p>`}
      </div>
    </section>`;
  };
  return `<div class="plan-months">
    ${months.map(m=>col(m.label,buckets[m.key].sort(byDue),{isNow:m.key===now})).join('')}
    ${nodate.length?col('Sem prazo',nodate,{hint:'Defina um prazo para cada um e distribua no trimestre.'}):''}
  </div>`;
}

function planMonthCardHTML(it){
  const g=planGoalById(it.goal_id), st=itemState(it);
  const ts=planItemTasks(it.id), dn=ts.filter(t=>t.done).length;
  const next=ts.filter(t=>!t.done).sort(sortByDateThenPri)[0];
  const foot=it.status==='done' ? ''
    : next ? `<span class="plan-mcard-next">Próximo: ${esc(clip(next.title,48))}${next.dueDate?' · '+esc(formatDate(next.dueDate)):''}</span>`
    : '<span class="tag nostep">sem próximo passo</span>';
  return `<button type="button" class="plan-mcard ${st}" onclick="planFocusItem('${it.id}')">
    <span class="plan-mcard-top"><span class="plan-item-code">${esc(planItemCode(it))}</span>${planDueTagHTML(it)}</span>
    <span class="plan-mcard-title">${esc(it.title)}</span>
    <span class="plan-mcard-goal">${esc(g?goalLabel(g):'')}</span>
    ${ts.length||foot?`<span class="plan-mcard-foot">${ts.length?planProgHTML(dn,ts.length):''}${foot}</span>`:''}
  </button>`;
}

// ── Status para o Junior (texto puro para WhatsApp/doc) ──
function planStatusText(){
  const s=planStats();
  const L=[plan.title.toUpperCase(), `Status em ${dayMonth(isoToday)} · dia ${s.day} de ${s.totalDays}`, `${s.done} de ${s.total} entregues (${s.pctDone}%)`];
  planGoals.filter(g=>!isGapGoal(g)).forEach(g=>{
    const items=goalItems(g.id); if(!items.length) return;
    L.push('', goalLabel(g).toUpperCase());
    items.forEach(i=>{
      const ts=planItemTasks(i.id), dn=ts.filter(t=>t.done).length, st=itemState(i);
      const head=`${planItemCode(i)} ${i.title}`;
      let line;
      if(st==='done') line=`✅ ${head} — entregue${i.done_at?' '+dayMonth(localDay(i.done_at)):''}`;
      else if(st==='overdue') line=`🔴 ${head} — atrasado (prazo ${dayMonth(i.due_date)})`;
      else if(st==='nodate') line=`⚪ ${head} — sem prazo`;
      else line=`🟡 ${head} — até ${dayMonth(i.due_date)}`;
      if(st!=='done' && ts.length) line+=` · ${dn}/${ts.length} tarefas`;
      L.push(line);
    });
  });
  return L.join('\n');
}

async function copyPlanStatus(){
  if(!plan) return;
  const text=planStatusText();
  try {
    await navigator.clipboard.writeText(text);
    toast(`Status copiado. Cole no WhatsApp ou no doc do ${esc(plan.assigned_by||'gestor')}`);
  } catch(_){ openPlanStatusDialog(text); }
}

function openPlanStatusDialog(text){
  document.getElementById('plan-status-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`
    <div class="oo-modal-overlay" id="plan-status-modal" onclick="if(event.target===this)this.remove()">
      <div class="oo-modal plan-status-modal" role="dialog" aria-modal="true" aria-labelledby="plan-status-title">
        <h3 id="plan-status-title">Status do plano</h3>
        <p class="mt-hint">Não consegui copiar sozinho. O texto já está selecionado: use Ctrl+C ou ⌘C.</p>
        <textarea class="plan-input plan-status-text" readonly rows="14" aria-label="Texto do status">${esc(text)}</textarea>
        <div class="oo-modal-btns"><button type="button" class="btn-sm" onclick="document.getElementById('plan-status-modal').remove()">Fechar</button></div>
      </div>
    </div>`);
  const ta=document.querySelector('#plan-status-modal textarea');
  ta.focus(); ta.select();
}

// ── Integrações com tarefas e briefing ──
// Select do modal/painel de tarefa: entregáveis abertos agrupados por meta (+ o atual)
function planItemOptionsHTML(selected){
  let html='<option value="">Nenhum</option>';
  if(selected && !planItemById(selected)) html+=`<option value="${esc(selected)}" selected>Entregável de outro plano</option>`;
  planGoals.forEach(g=>{
    const items=goalItems(g.id).filter(i=>i.status!=='done' || i.id===selected);
    if(!items.length) return;
    html+=`<optgroup label="${esc(goalLabel(g))}">${items.map(i=>`<option value="${i.id}" ${i.id===selected?'selected':''}>${esc(planItemCode(i)+' '+clip(i.title,70))}</option>`).join('')}</optgroup>`;
  });
  return html;
}

function planTagHTML(t){
  const it=t.planItemId && planItemById(t.planItemId);
  return it ? `<span class="tag plano" title="Plano 90 dias · ${esc(it.title)}">${esc(planItemCode(it))}</span>` : '';
}

function planBriefingHTML(){
  if(!plan) return '';
  const s=planStats();
  const due=deliverables()
    .filter(i=>i.status!=='done' && i.due_date && daysBetween(isoToday,i.due_date)<=7)
    .sort((a,b)=>a.due_date<b.due_date?-1:a.due_date>b.due_date?1:0);
  let html=`<div class="briefing-section"><div class="briefing-section-title"><span class="dot" style="background:var(--t3)"></span>Plano 90 dias <span class="briefing-count">${s.done}/${s.total}</span></div>
    <div class="briefing-plan-sum">Dia ${s.day} de ${s.totalDays} · ${s.pctDone}% entregue · <strong>${s.onPace?'no ritmo':'atrás do ritmo'}</strong></div>`;
  due.slice(0,5).forEach(i=>{
    const late=i.due_date<isoToday;
    const open=planItemTasks(i.id).filter(t=>!t.done).length;
    const when=late?`Atrasado desde ${formatDate(i.due_date)}`:i.due_date===isoToday?'Vence hoje':`Vence ${formatDate(i.due_date)}`;
    html+=`<div class="briefing-item ${late?'overdue':'upcoming'}"><div style="flex:1"><div>${esc(planItemCode(i))} · ${esc(i.title)}</div><div class="briefing-item-meta">${when} · ${open?`${open} tarefa${open>1?'s':''} aberta${open>1?'s':''}`:'sem próximo passo'}</div></div></div>`;
  });
  if(!due.length) html+=`<div class="briefing-empty">Nenhum entregável vencendo nos próximos 7 dias</div>`;
  if(s.noStep.length) html+=`<div class="briefing-empty">${s.noStep.length} entregáve${s.noStep.length>1?'is':'l'} sem próximo passo</div>`;
  html+=`<button type="button" class="link-btn briefing-plan-go" onclick="closeBriefing();navTo('plano')">Abrir o plano</button></div>`;
  return html;
}
