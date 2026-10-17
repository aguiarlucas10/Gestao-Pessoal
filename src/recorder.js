// ══════════════════════════════════════════════
// GRAVADOR — áudio → texto (Edge Function transcribe, sem key exposta)
// ══════════════════════════════════════════════
// Dois gravadores em paralelo sobre o mesmo microfone:
//  · live  → trechos curtos (20–40s) só para o texto aparecer durante a reunião
//  · final → trechos longos (4–6min) retranscritos ao parar, com contexto do trecho anterior
// Os cortes acontecem numa pausa de fala (detectada pelo volume), não no meio de palavra.
// Uma gravação pertence a UMA reunião (REC.meetingId) e continua viva ao trocar de tela.
const LIVE_SEG={ min:20000, max:40000 };
const FINAL_SEG={ min:240000, max:360000 };
const SILENCE_RMS=0.015, SILENCE_MS=350;

const REC={
  meetingId:null, title:'',
  state:'idle',            // idle | recording | finalizing
  seconds:0, status:'',
  text:'', baseText:'', lastLiveText:'',
  liveFailures:0, keywords:[],
  finalSegments:[], finalParts:[]   // blobs do gravador final e seus textos (null = falhou)
};
let recStream=null, recMimeType='audio/webm';
let liveSeg=null, finalSeg=null;
let finalQueue=Promise.resolve(), finalLastErr='';
let liveQueue=Promise.resolve();   // garante ordem e contexto das transcrições ao vivo
let audioCtx=null, vadTimer=null, silentMs=0;
let recTimer=null, recSaveTimer=null, wakeLock=null;

function recActive(id){ return REC.state!=='idle' && (!id || REC.meetingId===id); }

// Safari cria o AudioContext suspenso se ele nascer depois de um await: chamar SÍNCRONO no clique.
function recPrimeAudio(){
  try { const C=window.AudioContext||window.webkitAudioContext; const ctx=new C(); ctx.resume?.(); return ctx; }
  catch(_){ return null; }
}

function pickMimeType(){
  return ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t))||'';
}
function audioFileName(){ return recMimeType.startsWith('audio/mp4')?'audio.m4a':'audio.webm'; }

// Nomes que o modelo de transcrição deve reconhecer: time + participantes da reunião
function transcribeKeywords(m){
  return [...PEOPLE.map(p=>p.name), ...((m&&m.attendees)||[])].map(s=>String(s).trim()).filter(Boolean);
}

async function transcribeBlob(blob, context){
  if(!_currentSession) throw new Error('Sessão expirada');
  const fd=new FormData();
  fd.append('file',blob,audioFileName());
  if(context) fd.append('context',context.slice(-800));
  REC.keywords.forEach(k=>fd.append('keywords[]',k));
  const res=await fetch(`${SB_URL}/functions/v1/transcribe`,{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+_currentSession.access_token },
    body:fd
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||('HTTP '+res.status));
  return (data.text||'').trim();
}

// Gravador segmentado: corta em pausa de fala entre min e max ms; força o corte em max
function createSegmenter(cfg, onBlob){
  let rec=null, startedAt=0, pending=0, idle=null;
  const begin=()=>{
    const chunks=[];
    const r=new MediaRecorder(recStream,{mimeType:recMimeType,audioBitsPerSecond:48000});
    r.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
    pending++;
    r.onstop=()=>{
      if(chunks.length) onBlob(new Blob(chunks,{type:recMimeType}));
      pending--;
      if(!pending && idle) idle();
    };
    r.start();
    rec=r; startedAt=Date.now();
  };
  const cut=()=>{ const old=rec; begin(); if(old.state!=='inactive') old.stop(); };
  return {
    start:begin,
    tick(){
      const age=Date.now()-startedAt;
      if(age>=cfg.max || (age>=cfg.min && silentMs>=SILENCE_MS)) cut();
    },
    stop(){
      return new Promise(resolve=>{
        idle=resolve;
        if(rec && rec.state!=='inactive') rec.stop();
        if(!pending) resolve();
      });
    }
  };
}

function startVAD(ctx){
  audioCtx=ctx||recPrimeAudio();
  if(!audioCtx) return;
  audioCtx.resume?.();
  const analyser=audioCtx.createAnalyser();
  analyser.fftSize=2048;
  audioCtx.createMediaStreamSource(recStream).connect(analyser);
  const buf=new Float32Array(analyser.fftSize);
  silentMs=0;
  vadTimer=setInterval(()=>{
    analyser.getFloatTimeDomainData(buf);
    let sum=0; for(const v of buf) sum+=v*v;
    silentMs=Math.sqrt(sum/buf.length)<SILENCE_RMS ? silentMs+100 : 0;
    liveSeg?.tick(); finalSeg?.tick();
  },100);
}

function stopVAD(){
  if(vadTimer){ clearInterval(vadTimer); vadTimer=null; }
  if(audioCtx){ audioCtx.close().catch(()=>{}); audioCtx=null; }
}

// ── Texto da gravação ── A caixa de transcrição da reunião aberta espelha REC.text.
function recTextarea(){
  const ta=document.getElementById('mt-transcript');
  return ta && ta.dataset.meeting===REC.meetingId ? ta : null;
}
function recSetText(v){
  REC.text=v;
  const ta=recTextarea();
  if(ta && ta.value!==v){ ta.value=v; ta.scrollTop=ta.scrollHeight; }
  saveTranscriptDraft(REC.meetingId, v);
  onTranscriptChanged(REC.meetingId, v);
}
// Digitação do usuário na caixa enquanto grava
function recUserEdit(v){ REC.text=v; saveTranscriptDraft(REC.meetingId, v); }

function recStatus(s){ REC.status=s; renderRecUI(); }

function onLiveBlob(blob){
  if(blob.size<1000) return;
  liveQueue=liveQueue.then(async()=>{
    if(REC.state==='recording') recStatus('Transcrevendo…');
    try {
      const text=await transcribeBlob(blob, REC.text);
      if(text){
        const cur=REC.text;
        const sep=cur && !/\s$/.test(cur)?' ':'';
        recSetText(cur+sep+text);
        REC.lastLiveText=REC.text;
      }
    } catch(e){
      REC.liveFailures++;
      if(REC.liveFailures===1) toast('Falha na transcrição ao vivo: '+esc(e.message)+'. O áudio continua sendo gravado e será transcrito ao parar.','error');
    } finally {
      if(REC.state==='recording') recStatus(REC.liveFailures?`Ouvindo… (${REC.liveFailures} trecho(s) com falha ao vivo)`:'Ouvindo…');
    }
  });
}

// Transcrição definitiva: cada trecho longo entra na fila assim que fecha (ainda durante a
// reunião), em ordem, com o final do trecho anterior como contexto
function queueFinalSegment(i){
  finalQueue=finalQueue.then(async()=>{
    try { REC.finalParts[i]=await transcribeBlob(REC.finalSegments[i], REC.finalParts.slice(0,i).filter(Boolean).join(' ')); }
    catch(e){ REC.finalParts[i]=null; finalLastErr=e.message; }
  });
}
function onFinalBlob(blob){
  if(blob.size<1000) return;
  REC.finalSegments.push(blob);
  queueFinalSegment(REC.finalSegments.length-1);
}

async function startRecording(meetingId, ctx){
  if(REC.state!=='idle'){
    ctx?.close?.().catch(()=>{});
    toast(REC.meetingId===meetingId?'Esta reunião já está sendo gravada':'Já existe uma gravação em andamento — pare antes de começar outra','error');
    return false;
  }
  const m=meetingById(meetingId);
  if(!m){ ctx?.close?.().catch(()=>{}); return false; }
  try {
    // Sem cancelamento de eco: em reunião online ele apagaria as vozes que saem do alto-falante
    recStream=await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:false, noiseSuppression:false, autoGainControl:true, channelCount:1
    }});
  } catch(e){
    ctx?.close?.().catch(()=>{});
    toast('Microfone bloqueado: '+esc(e.message),'error');
    return false;
  }
  recMimeType=pickMimeType();
  const base=currentTranscript(meetingId);
  Object.assign(REC,{
    meetingId, title:m.title||'Reunião', state:'recording', seconds:0, status:'Ouvindo…',
    text:base, baseText:base.trim(), lastLiveText:base, liveFailures:0,
    keywords:transcribeKeywords(m), finalSegments:[], finalParts:[]
  });
  finalQueue=Promise.resolve(); finalLastErr=''; liveQueue=Promise.resolve();
  liveSeg=createSegmenter(LIVE_SEG, onLiveBlob);
  finalSeg=createSegmenter(FINAL_SEG, onFinalBlob);
  liveSeg.start(); finalSeg.start();
  startVAD(ctx);
  recTimer=setInterval(()=>{ REC.seconds++; renderRecUI(); },1000);
  // Rede de segurança: texto vai para o banco a cada 15s (e para o navegador a cada trecho)
  recSaveTimer=setInterval(()=>persistTranscript(REC.meetingId, REC.text),15000);
  requestWakeLock();
  m._pristine=false;
  if(!m.started_at) saveMeetingField(meetingId,{started_at:new Date().toISOString()});
  renderRecUI();
  toast('Gravando — o texto aparece a cada pausa de fala');
  return true;
}

async function stopRecording(){
  if(REC.state!=='recording') return;
  REC.state='finalizing';
  clearInterval(recTimer); recTimer=null;
  recStatus('Finalizando gravação…');
  stopVAD();
  const pending=[liveSeg?.stop(), finalSeg?.stop()];
  liveSeg=null; finalSeg=null;
  await Promise.all(pending);   // último trecho de cada gravador já entregue
  if(recStream){ recStream.getTracks().forEach(t=>t.stop()); recStream=null; }
  await liveQueue;
  clearInterval(recSaveTimer); recSaveTimer=null;
  releaseWakeLock();
  const id=REC.meetingId, m=meetingById(id);
  await persistTranscript(id, REC.text);
  if(m) saveMeetingField(id,{duration_sec:(m.duration_sec||0)+REC.seconds});
  await finalizeTranscript({auto:true});
}

async function finalizeTranscript({auto=false}={}){
  const id=REC.meetingId;
  if(!REC.finalSegments.length){
    REC.state='idle'; recStatus('');
    if(!auto) toast('Nenhum áudio desta sessão para transcrever de novo','error');
    return;
  }
  REC.state='finalizing';
  const before=REC.text;
  const userEdited=auto && before!==REC.lastLiveText;
  if(!auto){ REC.finalParts=[]; finalLastErr=''; REC.finalSegments.forEach((_,i)=>queueFinalSegment(i)); }
  const total=REC.finalSegments.length;
  const progress=()=>recStatus(`Finalizando a transcrição completa · ${REC.finalParts.filter(p=>p!==undefined).length}/${total} trechos`);
  progress();
  const progTimer=setInterval(progress,500);
  try { await finalQueue; }
  finally { clearInterval(progTimer); }
  REC.state='idle'; recStatus('');

  const failed=REC.finalParts.filter(p=>p===null).length;
  const parts=REC.finalParts.filter(Boolean).join(' ');
  if(failed || !parts){
    toast(`A transcrição final falhou em ${failed||total} de ${total} trecho(s)${finalLastErr?': '+esc(finalLastErr):''}. Mantive o texto ao vivo — use "Refazer transcrição do áudio" no menu da reunião.`,'error');
    return;
  }
  const finalText=[REC.baseText, parts].filter(Boolean).join('\n\n');
  // Não usa REC.meetingId: até o clique em "Substituir" outra gravação pode ter começado
  const apply=async()=>{
    if(REC.meetingId===id){ REC.text=finalText; REC.lastLiveText=finalText; }
    setMeetingTranscript(id, finalText);
    await persistTranscript(id, finalText);
  };
  if(userEdited){
    toast('Transcrição final pronta, mas você editou o texto ao vivo. Substituir pelo texto final?','info',{label:'Substituir',cb:apply});
    return;
  }
  await apply();
  toast(auto?'Transcrição pronta':'Transcrição refeita','success',{label:'Gerar ata',cb:()=>generateAI(id)});
}

function refineTranscript(meetingId){
  if(REC.state!=='idle'){ toast('Aguarde a gravação terminar','error'); return; }
  if(REC.meetingId!==meetingId || !REC.finalSegments.length){
    toast('O áudio só fica disponível até recarregar a página — não há áudio desta reunião para transcrever de novo','error');
    return;
  }
  return finalizeTranscript({auto:false});
}

// ── Tela acordada e aviso ao sair ──
async function requestWakeLock(){
  try { wakeLock=await navigator.wakeLock?.request('screen'); } catch(_){ wakeLock=null; }
}
function releaseWakeLock(){ try { wakeLock?.release(); } catch(_){} wakeLock=null; }

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible' || REC.state!=='recording') return;
  requestWakeLock();
  if(recStream && recStream.getAudioTracks().some(t=>t.readyState==='ended')){
    toast('O sistema interrompeu o microfone (tela bloqueada ou outro app). O texto até aqui está salvo — pare e grave de novo para continuar.','error');
  }
});

window.addEventListener('beforeunload',e=>{
  if(REC.state!=='idle' || syncPending>0){ e.preventDefault(); e.returnValue=''; }
});

// ── Indicador global (topbar) + controles da reunião aberta ──
function fmtClock(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

function renderRecUI(){
  const pill=document.getElementById('rec-pill');
  if(pill){
    pill.hidden=REC.state==='idle';
    if(REC.state!=='idle'){
      pill.classList.toggle('finalizing',REC.state==='finalizing');
      document.getElementById('rec-pill-text').textContent=REC.state==='recording'
        ? `Gravando · ${REC.title} · ${fmtClock(REC.seconds)}`
        : `Finalizando · ${REC.title}`;
      document.getElementById('rec-pill-stop').hidden=REC.state!=='recording';
      document.getElementById('rec-pill-open').hidden=currentView==='reunioes' && reunSelected===REC.meetingId;
    }
  }
  renderMeetingRecControls();
}

function openRecordingMeeting(){ if(REC.meetingId) openMeeting(REC.meetingId); }
