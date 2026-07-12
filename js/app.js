/* ===================== STATE / STORAGE ===================== */
const STORE_KEY = 'apparatus:data:v2';
let DATA = { dayLogs:{}, exerciseLogs:{}, profileWeight:63.5, xp:0, badges:[], prCount:0, measurements:[], weeklyGoal:6 };
let state = { view:'overview', activeDay:null, checks:{}, calMonth:new Date(), calSelected:null, modal:null, sidebarOpen:false,
  timerMode:'rest', restRemaining:0, restTotal:0, restRunning:false, restInterval:null,
  swElapsed:0, swRunning:false, swInterval:null,
  cdRemaining:0, cdTotal:300, cdRunning:false, cdInterval:null };

async function loadData(){
  try{ const r = await window.storage.get(STORE_KEY); if(r && r.value){ DATA = Object.assign(DATA, JSON.parse(r.value)); } }catch(e){}
  if (DATA.customProgram) {
    DAYS = DATA.customProgram.DAYS || DAYS;
    WARMUP = DATA.customProgram.WARMUP || WARMUP;
    YOGA_DAY = DATA.customProgram.YOGA_DAY || YOGA_DAY;
    PRANAYAMA_SHORT = DATA.customProgram.PRANAYAMA_SHORT || PRANAYAMA_SHORT;
  } else {
    DATA.customProgram = { DAYS, WARMUP, YOGA_DAY, PRANAYAMA_SHORT };
  }
}
async function saveData(){ try{ await window.storage.set(STORE_KEY, JSON.stringify(DATA)); }catch(e){} }

function computeStreak(){
  let d = new Date();
  if(!DATA.dayLogs[todayKey(d)]) d.setDate(d.getDate()-1);
  let streak = 0;
  while(DATA.dayLogs[todayKey(d)]){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function weekStartKey(){
  const d = new Date();
  const dow = d.getDay();
  const diff = (dow===0? -6 : 1-dow);
  d.setDate(d.getDate()+diff);
  return todayKey(d);
}
function computeWeekProgress(){
  const start = weekStartKey();
  const end = todayKey();
  const done = Object.keys(DATA.dayLogs).filter(k=>k>=start && k<=end).length;
  return {done, goal: DATA.weeklyGoal||6};
}
function addXP(amount){
  const before = getLevelInfo(DATA.xp||0).level;
  DATA.xp = (DATA.xp||0) + amount;
  const after = getLevelInfo(DATA.xp).level;
  return after>before;
}
function computeLongestStreak(){
  const keys = Object.keys(DATA.dayLogs).sort();
  if(!keys.length) return 0;
  let longest = 1, run = 1;
  for(let i=1;i<keys.length;i++){
    const prev = new Date(keys[i-1]+'T00:00:00'), cur = new Date(keys[i]+'T00:00:00');
    const diff = Math.round((cur-prev)/86400000);
    if(diff===1){ run++; } else { run = 1; }
    if(run>longest) longest = run;
  }
  return Math.max(longest, computeStreak());
}
function buildBadgeContext(){
  let totalSessions=0, totalVolume=0, bestHold=0;
  Object.values(DATA.exerciseLogs).forEach(arr=>{
    totalSessions += arr.length;
    arr.forEach(e=>{
      if(e.mode==='reps') totalVolume += sessionScore(e);
      if(e.mode==='hold') e.sets.forEach(s=>{ if((+s.seconds||0)>bestHold) bestHold=+s.seconds; });
    });
  });
  const dayLogVals = Object.values(DATA.dayLogs);
  return {
    totalSessions, totalVolume, bestHold,
    currentStreak: computeStreak(), longestStreak: computeLongestStreak(),
    prCount: DATA.prCount||0,
    daysCompleted: dayLogVals.length,
    uniqueDaysCompleted: new Set(dayLogVals.map(l=>l.dayId)).size,
    yogaCount: dayLogVals.filter(l=>l.dayId===7).length,
    measurementsCount: (DATA.measurements||[]).length,
    weekGoalHit: computeWeekProgress().done >= computeWeekProgress().goal
  };
}
function checkAndAwardBadges(){
  const ctx = buildBadgeContext();
  const newly = [];
  BADGES.forEach(b=>{
    if(!DATA.badges.includes(b.id) && b.cond(ctx)){ DATA.badges.push(b.id); DATA.xp += XP_RULES.badgeBonus; newly.push(b); }
  });
  return newly;
}
function showToast(msg){
  const el = document.createElement('div');
  el.className = 'app-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 300); }, 3200);
}
function confettiPiecesHTML(n){
  const colors = ['#4F9E8D','#C6862F','#B5504A','#EDE9E0','#3A756A'];
  let html = '';
  for(let i=0;i<n;i++){
    const left = Math.random()*100;
    const delay = (Math.random()*0.35).toFixed(2);
    const dur = (1.1+Math.random()*0.8).toFixed(2);
    const rot = Math.round(Math.random()*360);
    html += `<div class="confetti-piece" style="left:${left}%;background:${colors[i%colors.length]};animation-delay:${delay}s;animation-duration:${dur}s;transform:rotate(${rot}deg)"></div>`;
  }
  return html;
}
function showCelebration({heading, sub, xpBreakdown, newBadges, leveledUp}){
  const totalXP = xpBreakdown.reduce((a,r)=>a+r.val,0);
  const li = getLevelInfo(DATA.xp||0);
  const html = `
  <div class="modal-overlay" id="celebOverlay">
    <div class="modal celeb-modal">
      <div class="confetti-wrap">${confettiPiecesHTML(34)}</div>
      <div style="font-size:44px;margin-top:4px;">🎉</div>
      <h2>${heading}</h2>
      <div class="sub">${sub}</div>
      <div class="xp-earn-list">
        ${xpBreakdown.map(r=>`<div class="row"><span>${r.label}</span><span>+${r.val} XP</span></div>`).join('')}
        <div class="row"><span>Total</span><span>+${totalXP} XP</span></div>
      </div>
      ${leveledUp? `<div class="quote-banner" style="border-color:var(--teal);">⭐ Level up! You're now Level ${li.level} — ${li.title}.</div>` : ''}
      ${newBadges.length? `<div style="margin-top:12px;">${newBadges.map(b=>`<div class="new-badge-row"><span class="bicon">${b.icon}</span><div><div class="bname">${b.name}</div><div class="bdesc">${b.desc}</div></div></div>`).join('')}</div>` : ''}
      <button class="tbtn" id="celebCloseBtn" style="width:100%;margin-top:16px;">Nice — back to it</button>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = html;
  document.getElementById('celebOverlay').addEventListener('click', (ev)=>{ if(ev.target.id==='celebOverlay') closeCelebration(); });
  document.getElementById('celebCloseBtn').addEventListener('click', closeCelebration);
}
function closeCelebration(){ document.getElementById('modal-root').innerHTML=''; }

function todayKey(d){
  d = d || new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDate(key){ const d = new Date(key+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
function daysAgo(key){
  const d1 = new Date(key+'T00:00:00'), d2 = new Date(todayKey()+'T00:00:00');
  const diff = Math.round((d2-d1)/86400000);
  if(diff===0) return 'today'; if(diff===1) return 'yesterday'; return diff+' days ago';
}

/* ===================== EXERCISE MODE / PARSING ===================== */
function exMode(setsStr){
  const m = setsStr.match(/^(\d+)\s*x\s*(.+)$/i);
  if(!m) return {mode:'freeform', count:0};
  const count = parseInt(m[1]);
  const rest = m[2];
  if(/sec|min/i.test(rest)) return {mode:'hold', count};
  return {mode:'reps', count};
}
function beep(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0,0.35,0.7].forEach(t=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type='sine';
      g.gain.setValueAtTime(0.25, ctx.currentTime+t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+t+0.3);
      o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.3);
    });
  }catch(e){}
  if(navigator.vibrate) navigator.vibrate([300,100,300,100,300]);
}

function getHistory(name){ return DATA.exerciseLogs[name] || []; }
function getLast(name){ const h = getHistory(name); return h.length? h[h.length-1] : null; }
function lastSummary(name){
  const last = getLast(name);
  if(!last) return 'No previous data yet — this will be your first logged session.';
  let body = '';
  if(last.mode==='reps'){
    body = last.sets.map(s=>`${s.reps||0}${s.weight? '@'+s.weight+'kg':''}`).join(', ')+' reps';
  } else if(last.mode==='hold'){
    body = last.sets.map(s=>`${s.seconds||0}s`).join(', ')+' hold';
  } else {
    body = Math.round((last.durationSec||0)/60)+' min logged';
  }
  return `Last time (${daysAgo(last.date)}, ${fmtDate(last.date)}): ${body}`;
}
function sessionScore(entry){
  if(entry.mode==='reps') return entry.sets.reduce((a,s)=>a+((DATA.profileWeight+(+s.weight||0))*(+s.reps||0)),0);
  if(entry.mode==='hold') return Math.max(0,...entry.sets.map(s=>+s.seconds||0));
  return entry.durationSec||0;
}

/* ===================== CHART HELPER ===================== */
function sparklineSVG(values, labels, opts){
  opts = opts || {};
  const width=opts.width||600, height=opts.height||150, color=opts.color||'#4F9E8D', type=opts.type||'line';
  if(!values.length) return '<div class="chart-empty">Not enough data yet — log a few sessions to see this chart.</div>';
  const max = Math.max(...values, 1);
  const padL=34, padR=10, padT=14, padB=22;
  const innerW = width-padL-padR, innerH = height-padT-padB;
  const stepX = values.length>1 ? innerW/(values.length-1) : 0;
  function xAt(i){ return padL + (values.length>1? i*stepX : innerW/2); }
  function yAt(v){ return padT + innerH - (v/max)*innerH; }
  let inner='';
  if(type==='bar'){
    const bw = Math.min(28, innerW/values.length*0.55);
    inner = values.map((v,i)=>{
      const x = xAt(i)-bw/2, y = yAt(v), h = innerH-(y-padT);
      return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,1)}" rx="2" fill="${color}"/>`;
    }).join('');
  } else {
    const pts = values.map((v,i)=>`${xAt(i)},${yAt(v)}`).join(' ');
    inner = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      values.map((v,i)=>`<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3.5" fill="${color}"/>`).join('');
  }
  inner += `<line x1="${padL}" y1="${padT+innerH}" x2="${width-padR}" y2="${padT+innerH}" stroke="#2A2C33" stroke-width="1"/>`;
  inner += `<text x="${padL-6}" y="${padT+4}" font-size="10" fill="#A9A69D" text-anchor="end" font-family="JetBrains Mono, monospace">${Math.round(max)}</text>`;
  if(labels && labels.length){
    const idxs = labels.length<=4 ? labels.map((_,i)=>i) : [0, Math.floor(labels.length/2), labels.length-1];
    idxs.forEach(i=>{ inner += `<text x="${xAt(i)}" y="${height-6}" font-size="9.5" fill="#A9A69D" text-anchor="middle" font-family="JetBrains Mono, monospace">${labels[i]}</text>`; });
  }
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">${inner}</svg>`;
}

function ytUrl(q){ return `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' correct form calisthenics')}`; }

/* ===================== METRICS ===================== */
function allExNames(day){ return [...day.skillWork, ...day.strength].map(e=>e.name); }
function computeDayMetrics(day, dateKey){
  dateKey = dateKey || todayKey();
  const names = day.type==='yoga' ? [...YOGA_DAY.flow, ...YOGA_DAY.pranayama, ...YOGA_DAY.meditation].map(f=>f.name) : allExNames(day);
  let durationSec = 0, volume = 0;
  names.forEach(n=>{
    (getHistory(n)||[]).forEach(entry=>{
      if(entry.date===dateKey){ durationSec += (entry.durationSec||0); if(entry.mode==='reps') volume += sessionScore(entry); }
    });
  });
  if(durationSec===0){ const m = (day.time||'').match(/(\d+)/); durationSec = m? parseInt(m[1])*60 : 3600; }
  const met = MET[day.type] || 6;
  const calories = Math.round(met * DATA.profileWeight * (durationSec/3600));
  return {durationMin: Math.round(durationSec/60), volume: Math.round(volume), calories};
}

/* ===================== SIDEBAR NAV ===================== */
const NAV_ITEMS = [
  {id:'overview', label:'Week', icon:'🏋️', section:'TRAIN'},
  {id:'calendar', label:'Calendar', icon:'📅', section:'TRAIN'},
  {id:'progress', label:'Progress', icon:'📈', section:'TRAIN'},
  {id:'skills', label:'Skill Tracker', icon:'🤸', section:'TRAIN'},
  {id:'measurements', label:'Body Log', icon:'📏', section:'TRAIN'},
  {id:'achievements', label:'Trophy Room', icon:'🏆', section:'TRAIN'},
  {id:'info-warmup', label:'Warm-up + Breath', icon:'🌬️', section:'GUIDE'},
  {id:'info-nutrition', label:'Nutrition', icon:'🍽️', section:'GUIDE'},
  {id:'info-roadmap', label:'Skill Roadmap', icon:'🪜', section:'GUIDE'},
  {id:'info-rules', label:'Progression Rules', icon:'📐', section:'GUIDE'}
];
function activeNavId(){
  if(state.view==='overview'||state.view==='day') return 'overview';
  if(state.view==='calendar') return 'calendar';
  if(state.view==='progress') return 'progress';
  if(state.view==='skills') return 'skills';
  if(state.view==='measurements') return 'measurements';
  if(state.view==='achievements') return 'achievements';
  if(state.view==='info') return state.infoTab;
  return 'overview';
}
function renderSidebar(){
  const active = activeNavId();
  let sections = '';
  let lastSection = null;
  NAV_ITEMS.forEach(it=>{
    if(it.section!==lastSection){ sections += `<div class="sidebar-section">${it.section}</div>`; lastSection = it.section; }
    sections += `<button class="sidebar-link ${active===it.id?'active':''}" data-nav="${it.id}"><span class="ic">${it.icon}</span><span>${it.label}</span></button>`;
  });
  document.getElementById('sidebar-root').innerHTML = `
    <div class="sidebar-overlay ${state.sidebarOpen?'show':''}" id="sidebarOverlay"></div>
    <div class="sidebar ${state.sidebarOpen?'open':''}" id="sidebar">
      <div class="sidebar-header">
        <div class="brand"><div class="mark"></div><div class="brand-text" style="font-size:15px;">APPARATUS</div></div>
        <button class="sidebar-close" id="sidebarClose">✕</button>
      </div>
      <div class="sidebar-nav">${sections}</div>
      <div class="sidebar-foot">6-day calisthenics + skills + breath protocol</div>
    </div>`;
  document.getElementById('sidebarOverlay').addEventListener('click', ()=>{ state.sidebarOpen=false; renderSidebar(); });
  document.getElementById('sidebarClose').addEventListener('click', ()=>{ state.sidebarOpen=false; renderSidebar(); });
  document.querySelectorAll('.sidebar-link').forEach(b=>b.addEventListener('click', ()=>{
    const id = b.dataset.nav;
    if(id==='overview'){ state.view='overview'; state.activeDay=null; }
    else if(id==='calendar'){ state.view='calendar'; }
    else if(id==='progress'){ state.view='progress'; }
    else if(id==='skills'){ state.view='skills'; }
    else if(id==='measurements'){ state.view='measurements'; }
    else if(id==='achievements'){ state.view='achievements'; }
    else { state.view='info'; state.infoTab=id; }
    state.sidebarOpen=false;
    render();
  }));
}

/* ===================== OVERVIEW ===================== */
function progressForDay(day){
  const names = allExNames(day);
  let done = 0;
  names.forEach(n=>{ if(getHistory(n).some(e=>e.date===todayKey())) done++; });
  return {done, total: names.length, pct: names.length? Math.round(done/names.length*100):0};
}
function renderOverview(){
  const streakDays = [];
  const now = new Date();
  for(let i=6;i>=0;i--){ const d = new Date(now); d.setDate(now.getDate()-i); const key = todayKey(d);
    streakDays.push({label:d.toLocaleDateString(undefined,{weekday:'short'})[0], done: !!DATA.dayLogs[key]}); }

  const li = getLevelInfo(DATA.xp||0);
  const streak = computeStreak();
  const wk = computeWeekProgress();
  const wkPct = Math.min(100, Math.round((wk.done/wk.goal)*100));

  let html = `
  <div class="hero">
    <div class="eyebrow">80% MUSCLE · 20% SKILLS</div>
    <h1>Six days on the bar.<br/>One day on the mat.</h1>
    <p>Compound calisthenics for hypertrophy, a skill focus every training day, and breathwork bookending every session. Tap a day to open it, tap any exercise to log sets, weight, and time.</p>
    <div class="streak-strip">${streakDays.map(s=>`<div class="streak-day ${s.done?'done':''}">${s.label}</div>`).join('')}</div>
    <div class="level-card">
      <div class="level-badge">${li.level}</div>
      <div class="level-info">
        <div class="title-row"><h4>${li.title}</h4><span class="xp-txt">${li.xp} XP${li.nextXp? ' · '+li.nextXp+' to next level' : ' · MAX LEVEL'}</span></div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${li.pct}%"></div></div>
      </div>
      <div class="streak-box"><div class="flame">🔥</div><div class="num">${streak}</div><div class="lbl">DAY STREAK</div></div>
    </div>
    <div class="quote-banner">${todayQuote()}</div>
    <div class="modal-section" style="margin:16px 0 0;">
      <div class="lbl">This week — ${wk.done} / ${wk.goal} training days</div>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${wkPct}%;background:var(--teal);"></div></div>
    </div>
  </div>
  <div class="day-grid">`;
  DAYS.forEach(day=>{
    const p = progressForDay(day);
    const logged = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===day.id);
    html += `<div class="day-card" data-day="${day.id}">
      <div class="time mono">${day.time}</div>
      <div class="num">DAY ${String(day.id).padStart(2,'0')} / 07</div>
      <h3>${day.title}</h3>
      <div class="skill">SKILL — ${day.skill.toUpperCase()}</div>
      <div class="prog"><div class="prog-fill" style="width:${p.pct}%"></div></div>
      ${logged? '<div class="done-tag">✓ LOGGED TODAY</div>':''}
    </div>`;
  });
  const yogaLogged = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===7);
  html += `<div class="day-card" data-day="7">
      <div class="time mono">${YOGA_DAY.time}</div>
      <div class="num">DAY 07 / 07</div>
      <h3>Yoga + Breath + Meditation</h3>
      <div class="skill" style="color:var(--teal)">RECOVERY — MOBILITY</div>
      <div class="prog"><div class="prog-fill" style="width:0%"></div></div>
      ${yogaLogged? '<div class="done-tag">✓ LOGGED TODAY</div>':''}
    </div></div>
  <div class="footnote">Profile weight used for calorie/volume math: <b class="mono">${DATA.profileWeight} kg</b> (editable in the Nutrition tab). Philosophy: 6–15 rep range, 1–2 reps in reserve on hypertrophy sets — not to failure every set.</div>`;
  document.getElementById('app').innerHTML = html;
  document.querySelectorAll('.day-card').forEach(card=>{
    card.addEventListener('click', ()=>{ state.view='day'; state.activeDay = parseInt(card.dataset.day); render(); window.scrollTo({top:0,behavior:'smooth'}); });
  });
}

/* ===================== DAY VIEW ===================== */
function exCardHtml(e, sectionType, idx){
  const done = getHistory(e.name).some(x=>x.date===todayKey());
  const last = getLast(e.name);
  let lastTxt = 'No history yet';
  if(last){
    if(last.mode==='reps') lastTxt = `Last: ${last.sets.map(s=>`${s.reps||0}${s.weight?'@'+s.weight+'kg':''}`).join(', ')} · ${daysAgo(last.date)}`;
    else if(last.mode==='hold') lastTxt = `Last: ${last.sets.map(s=>(s.seconds||0)+'s').join(', ')} · ${daysAgo(last.date)}`;
    else lastTxt = `Last: ${Math.round((last.durationSec||0)/60)} min · ${daysAgo(last.date)}`;
  }
  return `<div class="ex-card" data-exname="${encodeURIComponent(e.name)}" data-section="${sectionType || ''}" data-idx="${idx != null ? idx : ''}">
    <div class="ex-top">
      <div class="ex-check ${done?'checked':''}" data-checkname="${encodeURIComponent(e.name)}">${done?'✓':''}</div>
      <div class="ex-title">
        <div class="name ${done?'checked-txt':''}">${e.name}</div>
        <div class="sub">${e.sets || ''}${e.tempo?' · tempo '+e.tempo:''}${e.rest?' · rest '+e.rest:''}</div>
        <div class="last">${lastTxt}</div>
      </div>
      <div class="ex-caret">›</div>
    </div>
  </div>`;
}
function renderDay(){
  const day = DAYS.find(d=>d.id===state.activeDay);
  if(state.activeDay===7){ renderYogaDay(); return; }
  const p = progressForDay(day);
  const loggedToday = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===day.id);
  const m = computeDayMetrics(day);
  const html = `
  <button class="back-btn" id="backBtn">← All days</button>
  <div class="day-head">
    <div class="num">DAY ${String(day.id).padStart(2,'0')} / 07 · ${day.time}</div>
    <h2>${day.title}</h2>
    <div class="meta"><span>SKILL: <b>${day.skill}</b></span><span>PROGRESS: <b>${p.done}/${p.total}</b></span></div>
    <div class="stat-strip">
      <div class="stat-pill"><div class="k">DURATION (TODAY)</div><div class="v">${m.durationMin} min</div></div>
      <div class="stat-pill"><div class="k">VOLUME LIFTED</div><div class="v">${m.volume} kg·reps</div></div>
      <div class="stat-pill"><div class="k">EST. CALORIES</div><div class="v">${m.calories} kcal</div></div>
    </div>
  </div>
  <div class="section-label">
    <div class="tag amber">BREATH</div>
    <h4>Before training</h4>
    <button class="add-ex-btn" data-section="pranayama_before" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${PRANAYAMA_SHORT.before.map((e, idx)=>exCardHtml(e, 'pranayama_before', idx)).join('')}
  
  <div class="section-label">
    <div class="tag">WARM-UP</div>
    <h4>${WARMUP.time}</h4>
    <button class="add-ex-btn" data-section="warmup" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${WARMUP.items.map((e, idx)=>exCardHtml(e, 'warmup', idx)).join('')}
  
  <div class="section-label">
    <div class="tag amber">SKILL — ${day.skill.toUpperCase()}</div>
    <h4>~15 min</h4>
    <button class="add-ex-btn" data-section="skill" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${day.skillWork.map((e, idx)=>exCardHtml(e, 'skill', idx)).join('')}
  
  <div class="section-label">
    <div class="tag">STRENGTH</div>
    <h4>Main sets</h4>
    <button class="add-ex-btn" data-section="strength" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${day.strength.map((e, idx)=>exCardHtml(e, 'strength', idx)).join('')}
  
  <div class="section-label">
    <div class="tag amber">BREATH</div>
    <h4>After training</h4>
    <button class="add-ex-btn" data-section="pranayama_after" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${PRANAYAMA_SHORT.after.map((e, idx)=>exCardHtml(e, 'pranayama_after', idx)).join('')}
  
  <button class="log-btn ${loggedToday?'logged':''}" id="logBtn">${loggedToday? '✓ Day Logged — tap to refresh totals' : 'Log This Day Complete'}</button>
  `;
  document.getElementById('app').innerHTML = html;
  wireDayInteractions(day);
}
function renderYogaDay(){
  const loggedToday = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===7);
  const fakeDay = {id:7, type:'yoga', time:YOGA_DAY.time};
  const m = computeDayMetrics(fakeDay);
  const html = `
  <button class="back-btn" id="backBtn">← All days</button>
  <div class="day-head">
    <div class="num">DAY 07 / 07 · ${YOGA_DAY.time}</div>
    <h2>Yoga + Stretching + Breath + Meditation</h2>
    <div class="meta"><span>Full rest day from strength — real recovery work, not "just another light workout."</span></div>
    <div class="stat-strip">
      <div class="stat-pill"><div class="k">DURATION (TODAY)</div><div class="v">${m.durationMin} min</div></div>
      <div class="stat-pill"><div class="k">EST. CALORIES</div><div class="v">${m.calories} kcal</div></div>
    </div>
  </div>
  
  <div class="section-label">
    <div class="tag">YOGA FLOW</div>
    <h4>15–20 min</h4>
    <button class="add-ex-btn" data-section="yoga_flow" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${YOGA_DAY.flow.map((f, idx)=>exCardHtml(f, 'yoga_flow', idx)).join('')}
  
  <div class="section-label">
    <div class="tag amber">PRANAYAMA</div>
    <h4>10 min</h4>
    <button class="add-ex-btn" data-section="yoga_pranayama" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${YOGA_DAY.pranayama.map((f, idx)=>exCardHtml(f, 'yoga_pranayama', idx)).join('')}
  
  <div class="section-label">
    <div class="tag">MEDITATION</div>
    <h4>15–20 min</h4>
    <button class="add-ex-btn" data-section="yoga_meditation" style="margin-left:auto; background:none; border:1px dashed var(--teal); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">+ Add</button>
  </div>
  ${YOGA_DAY.meditation.map((e, idx)=>exCardHtml(e, 'yoga_meditation', idx)).join('')}
  
  <button class="log-btn ${loggedToday?'logged':''}" id="logBtn">${loggedToday? '✓ Day Logged — tap to refresh totals' : 'Log This Day Complete'}</button>
  `;
  document.getElementById('app').innerHTML = html;
  document.getElementById('backBtn').addEventListener('click', ()=>{ state.view='overview'; render(); });
  wireCommon(fakeDay);
  document.getElementById('logBtn').addEventListener('click', async ()=>{
    const alreadyLoggedToday = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===7);
    const mm = computeDayMetrics(fakeDay);
    DATA.dayLogs[todayKey()] = {dayId:7, ts:Date.now(), durationMin:mm.durationMin, calories:mm.calories, volume:0};
    let xpBreakdown=[], leveledUp=false, newBadges=[];
    if(!alreadyLoggedToday){
      const streak = computeStreak();
      const streakBonus = Math.min(streak, XP_RULES.streakCap)*XP_RULES.streakPerDay;
      xpBreakdown = [{label:'Day complete', val:XP_RULES.dayComplete}, {label:`Streak bonus (${streak}d)`, val:streakBonus}];
      leveledUp = addXP(XP_RULES.dayComplete + streakBonus);
      newBadges = checkAndAwardBadges();
    }
    await saveData(); render();
    if(!alreadyLoggedToday) showCelebration({heading:'Day Complete', sub:`Yoga + Breath + Meditation — ${fmtDate(todayKey())}`, xpBreakdown, newBadges, leveledUp});
  });
}
function wireCommon(day){
  document.querySelectorAll('.ex-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const sectionType = card.dataset.section;
      const idx = parseInt(card.dataset.idx);
      openModal(sectionType, idx, day);
    });
  });
  document.querySelectorAll('.add-ex-btn').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const sectionType = btn.dataset.section;
      openAddModal(sectionType, day);
    });
  });
  document.querySelectorAll('.ex-check').forEach(chk=>{
    chk.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      const name = decodeURIComponent(chk.dataset.checkname);
      const already = getHistory(name).some(x=>x.date===todayKey());
      if(already){
        DATA.exerciseLogs[name] = DATA.exerciseLogs[name].filter(x=>x.date!==todayKey());
      } else {
        DATA.exerciseLogs[name] = DATA.exerciseLogs[name] || [];
        DATA.exerciseLogs[name].push({date:todayKey(), mode:'freeform', sets:[], durationSec:0, notes:''});
      }
      saveData().then(render);
    });
  });
}
function wireDayInteractions(day){
  document.getElementById('backBtn').addEventListener('click', ()=>{ state.view='overview'; render(); });
  wireCommon(day);
  document.getElementById('logBtn').addEventListener('click', async ()=>{
    const alreadyLoggedToday = !!(DATA.dayLogs[todayKey()] && DATA.dayLogs[todayKey()].dayId===day.id);
    const m = computeDayMetrics(day);
    DATA.dayLogs[todayKey()] = {dayId:day.id, ts:Date.now(), durationMin:m.durationMin, calories:m.calories, volume:m.volume};
    let xpBreakdown=[], leveledUp=false, newBadges=[];
    if(!alreadyLoggedToday){
      const streak = computeStreak();
      const streakBonus = Math.min(streak, XP_RULES.streakCap)*XP_RULES.streakPerDay;
      xpBreakdown = [{label:'Day complete', val:XP_RULES.dayComplete}, {label:`Streak bonus (${streak}d)`, val:streakBonus}];
      leveledUp = addXP(XP_RULES.dayComplete + streakBonus);
      newBadges = checkAndAwardBadges();
    }
    await saveData(); render();
    if(!alreadyLoggedToday) showCelebration({heading:'Day Complete', sub:`${day.title} — ${fmtDate(todayKey())}`, xpBreakdown, newBadges, leveledUp});
  });
}
function findExByName(name, day){
  const pools = [
    PRANAYAMA_SHORT.before.map(e=>({name:e.name, sets:e.sets||'1 x 3 min', cues:e.cues, yt:e.yt||e.name})),
    WARMUP.items, day && day.skillWork || [], day && day.strength || [],
    PRANAYAMA_SHORT.after.map(e=>({name:e.name, sets:e.sets||'1 x '+e.time, cues:e.cues, yt:e.name})),
    YOGA_DAY.flow, YOGA_DAY.pranayama, YOGA_DAY.meditation
  ];
  for(const p of pools){ const f = p.find(x=>x.name===name); if(f) return f.yt? f : {...f, yt:f.name}; }
  return null;
}

function getExerciseFromProgram(dayId, sectionType, idx) {
  const day = DAYS.find(d=>d.id===dayId);
  if (sectionType === 'warmup') return WARMUP.items[idx];
  if (sectionType === 'pranayama_before') return PRANAYAMA_SHORT.before[idx];
  if (sectionType === 'pranayama_after') return PRANAYAMA_SHORT.after[idx];
  if (sectionType === 'skill' && day) return day.skillWork[idx];
  if (sectionType === 'strength' && day) return day.strength[idx];
  if (sectionType === 'yoga_flow') return YOGA_DAY.flow[idx];
  if (sectionType === 'yoga_pranayama') return YOGA_DAY.pranayama[idx];
  if (sectionType === 'yoga_meditation') return YOGA_DAY.meditation[idx];
  return null;
}

function openAddModal(sectionType, day) {
  state.modal = {
    isAdding: true,
    day: day,
    sectionType: sectionType,
    ex: { name: '', sets: '', tempo: '', rest: '', cues: [], yt: '' }
  };
  renderModal();
}

async function createExercise() {
  const {sectionType, day} = state.modal;
  const name = document.getElementById('addExName').value.trim();
  const sets = document.getElementById('addExSets').value.trim();
  const tempo = document.getElementById('addExTempo').value.trim();
  const rest = document.getElementById('addExRest').value.trim();
  const cues = document.getElementById('addExCues').value.split('\n').map(c => c.trim()).filter(Boolean);
  const yt = document.getElementById('addExYt').value.trim();

  if (!name) { showToast('Exercise Name is required'); return; }

  const newEx = { name, sets, tempo, rest, cues, yt };
  const targetDayId = day ? day.id : 7;
  const programDay = DAYS.find(d => d.id === targetDayId);

  if (sectionType === 'warmup') WARMUP.items.push(newEx);
  else if (sectionType === 'pranayama_before') PRANAYAMA_SHORT.before.push(newEx);
  else if (sectionType === 'pranayama_after') PRANAYAMA_SHORT.after.push(newEx);
  else if (sectionType === 'skill' && programDay) programDay.skillWork.push(newEx);
  else if (sectionType === 'strength' && programDay) programDay.strength.push(newEx);
  else if (sectionType === 'yoga_flow') YOGA_DAY.flow.push(newEx);
  else if (sectionType === 'yoga_pranayama') YOGA_DAY.pranayama.push(newEx);
  else if (sectionType === 'yoga_meditation') YOGA_DAY.meditation.push(newEx);

  DATA.customProgram = { DAYS, WARMUP, YOGA_DAY, PRANAYAMA_SHORT };
  await saveData();
  showToast('New exercise added');
  closeModal();
  render();
}

async function saveExerciseChanges() {
  const {sectionType, idx, day} = state.modal;
  const name = document.getElementById('editExName').value.trim();
  const sets = document.getElementById('editExSets').value.trim();
  const tempo = document.getElementById('editExTempo').value.trim();
  const rest = document.getElementById('editExRest').value.trim();
  const cues = document.getElementById('editExCues').value.split('\n').map(c => c.trim()).filter(Boolean);
  const yt = document.getElementById('editExYt').value.trim();

  if (!name) { showToast('Exercise Name is required'); return; }

  const targetDayId = day ? day.id : 7;
  const programDay = DAYS.find(d => d.id === targetDayId);
  let targetEx = getExerciseFromProgram(targetDayId, sectionType, idx);

  if (targetEx) {
    const oldName = targetEx.name;
    if (oldName !== name) {
      if (DATA.exerciseLogs[oldName]) {
        DATA.exerciseLogs[name] = DATA.exerciseLogs[oldName];
        delete DATA.exerciseLogs[oldName];
      }
    }

    targetEx.name = name;
    targetEx.sets = sets;
    targetEx.tempo = tempo;
    targetEx.rest = rest;
    targetEx.cues = cues;
    targetEx.yt = yt;

    DATA.customProgram = { DAYS, WARMUP, YOGA_DAY, PRANAYAMA_SHORT };
    await saveData();
    showToast('Exercise updated');
    closeModal();
    render();
  }
}

async function deleteExercise() {
  const {sectionType, idx, day, ex: e} = state.modal;
  if (!confirm(`Are you sure you want to delete "${e.name}"?`)) return;

  const targetDayId = day ? day.id : 7;
  const programDay = DAYS.find(d => d.id === targetDayId);

  if (sectionType === 'warmup') WARMUP.items.splice(idx, 1);
  else if (sectionType === 'pranayama_before') PRANAYAMA_SHORT.before.splice(idx, 1);
  else if (sectionType === 'pranayama_after') PRANAYAMA_SHORT.after.splice(idx, 1);
  else if (sectionType === 'skill' && programDay) programDay.skillWork.splice(idx, 1);
  else if (sectionType === 'strength' && programDay) programDay.strength.splice(idx, 1);
  else if (sectionType === 'yoga_flow') YOGA_DAY.flow.splice(idx, 1);
  else if (sectionType === 'yoga_pranayama') YOGA_DAY.pranayama.splice(idx, 1);
  else if (sectionType === 'yoga_meditation') YOGA_DAY.meditation.splice(idx, 1);

  DATA.customProgram = { DAYS, WARMUP, YOGA_DAY, PRANAYAMA_SHORT };
  await saveData();
  showToast('Exercise deleted');
  closeModal();
  render();
}

/* ===================== MODAL ===================== */
function openModal(sectionType, idx, day){
  const e = getExerciseFromProgram(day ? day.id : 7, sectionType, idx);
  if (!e) return;
  state.modal = {ex:e, day:day, sectionType: sectionType, idx: idx, mode: exMode(e.sets || '')};
  state.timerMode = 'rest';
  state.restTotal = e.rest ? (parseInt((e.rest.match(/\d+/)||['60'])[0]) * (/min/i.test(e.rest)?60:1)) : 60;
  state.restRemaining = state.restTotal; state.restRunning = false;
  state.swElapsed = 0; state.swRunning = false;
  state.cdTotal = 300; state.cdRemaining = 300; state.cdRunning = false;
  clearAllTimerIntervals();
  renderModal();
}
function closeModal(){ clearAllTimerIntervals(); state.modal = null; document.getElementById('modal-root').innerHTML=''; }
function clearAllTimerIntervals(){
  if(state.restInterval) clearInterval(state.restInterval);
  if(state.swInterval) clearInterval(state.swInterval);
  if(state.cdInterval) clearInterval(state.cdInterval);
}
function fmtMMSS(sec){ sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec/60), s = sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

function setRowHtml(mode, i, val){
  if(mode==='hold'){
    return `<div class="set-row hold"><div class="set-idx">#${i+1}</div>
      <div><input type="number" min="0" class="setval" data-i="${i}" data-field="seconds" placeholder="sec held" value="${val && val.seconds!=null?val.seconds:''}"></div>
      <button class="rm" data-rm="${i}">✕</button></div>`;
  }
  return `<div class="set-row"><div class="set-idx">#${i+1}</div>
    <input type="number" min="0" class="setval" data-i="${i}" data-field="reps" placeholder="reps" value="${val && val.reps!=null?val.reps:''}">
    <input type="number" min="0" class="setval" data-i="${i}" data-field="weight" placeholder="+kg" value="${val && val.weight!=null?val.weight:''}">
    <button class="rm" data-rm="${i}">✕</button></div>`;
}

function renderModal(){
  const {ex:e, day, mode} = state.modal;

  if (state.modal.isAdding) {
    const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modalBox">
        <div class="modal-head">
          <h3>Add New Exercise</h3>
          <button class="modal-close" id="modalCloseBtn">✕</button>
        </div>
        <div class="modal-sub">Create a new exercise for this section</div>
        
        <div class="modal-section">
          <div class="lbl">Exercise Name</div>
          <input type="text" id="addExName" style="width:100%;" placeholder="e.g., Archer Push-ups">
        </div>

        <div class="modal-section" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <div class="lbl">Sets (e.g., 4 x 10 or 3 x 20 sec)</div>
            <input type="text" id="addExSets" style="width:100%;" placeholder="e.g., 3 x 10">
          </div>
          <div>
            <div class="lbl">Tempo (e.g., 2-1-2)</div>
            <input type="text" id="addExTempo" style="width:100%;" placeholder="e.g., 2-1-2">
          </div>
        </div>

        <div class="modal-section" style="display:grid; grid-template-columns:1fr; gap:10px;">
          <div>
            <div class="lbl">Rest (e.g., 90s or 2 min)</div>
            <input type="text" id="addExRest" style="width:100%;" placeholder="e.g., 90s">
          </div>
        </div>

        <div class="modal-section">
          <div class="lbl">Form Cues (one per line)</div>
          <textarea id="addExCues" style="width:100%; min-height:80px; font-size:13px; line-height:1.5;" class="notes" placeholder="Keep arms locked..."></textarea>
        </div>

        <div class="modal-section">
          <div class="lbl">YouTube Search or Link</div>
          <input type="text" id="addExYt" style="width:100%;" placeholder="Leave blank to search by name">
        </div>

        <button class="save-btn" id="createExBtn" style="margin-top:20px;">Add Exercise</button>
      </div>
    </div>`;
    document.getElementById('modal-root').innerHTML = html;
    
    // Wire up events
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (ev)=>{ if(ev.target.id==='modalOverlay') closeModal(); });
    document.getElementById('createExBtn').addEventListener('click', createExercise);
    return;
  }

  if (state.modal.editMode) {
    const cuesText = (e.cues || []).join('\n');
    const html = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modalBox">
        <div class="modal-head">
          <h3>Edit Exercise Details</h3>
          <button class="modal-close" id="modalCloseBtn">✕</button>
        </div>
        <div class="modal-sub">Modify details for: ${e.name}</div>
        
        <div class="modal-section">
          <div class="lbl">Exercise Name</div>
          <input type="text" id="editExName" style="width:100%;" value="${e.name || ''}">
        </div>

        <div class="modal-section" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <div class="lbl">Sets (e.g., 4 x 10 or 3 x 20 sec)</div>
            <input type="text" id="editExSets" style="width:100%;" value="${e.sets || ''}">
          </div>
          <div>
            <div class="lbl">Tempo (e.g., 2-1-2)</div>
            <input type="text" id="editExTempo" style="width:100%;" value="${e.tempo || ''}">
          </div>
        </div>

        <div class="modal-section" style="display:grid; grid-template-columns:1fr; gap:10px;">
          <div>
            <div class="lbl">Rest (e.g., 90s or 2 min)</div>
            <input type="text" id="editExRest" style="width:100%;" value="${e.rest || ''}">
          </div>
        </div>

        <div class="modal-section">
          <div class="lbl">Form Cues (one per line)</div>
          <textarea id="editExCues" style="width:100%; min-height:80px; font-size:13px; line-height:1.5;" class="notes">${cuesText}</textarea>
        </div>

        <div class="modal-section">
          <div class="lbl">YouTube Search or Link</div>
          <input type="text" id="editExYt" style="width:100%;" value="${e.yt || ''}">
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
          <button class="save-btn" id="saveEditBtn" style="margin-top:0; flex:1;">Save Changes</button>
          <button class="tbtn secondary" id="cancelEditBtn" style="flex:1;">Cancel</button>
        </div>
      </div>
    </div>`;
    document.getElementById('modal-root').innerHTML = html;
    
    // Wire up events
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (ev)=>{ if(ev.target.id==='modalOverlay') closeModal(); });
    document.getElementById('cancelEditBtn').addEventListener('click', () => {
      state.modal.editMode = false;
      renderModal();
    });
    document.getElementById('saveEditBtn').addEventListener('click', saveExerciseChanges);
    return;
  }

  const last = getLast(e.name);
  let rowsData = [];
  if(mode.mode!=='freeform'){
    for(let i=0;i<mode.count;i++) rowsData.push(last && last.sets[i] ? last.sets[i] : {});
  }
  const history = getHistory(e.name).slice(-8);
  const chartValues = history.map(h=>sessionScore(h));
  const chartLabels = history.map(h=>fmtDate(h.date));

  const html = `
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal" id="modalBox">
      <div class="modal-head" style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <h3 style="margin:0; word-break:break-word;">${e.name}</h3>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-left:12px; flex-shrink:0;">
          <button class="modal-close" id="modalCloseBtn" style="margin:0;">✕</button>
        </div>
      </div>
      <div class="modal-sub" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        <div style="color:var(--teal);">${e.sets || ''}${e.tempo?' · tempo '+e.tempo:''}${e.rest?' · rest '+e.rest:''}</div>
        <div style="display:flex; gap:6px;">
          <button id="editExBtn" style="background:none; border:1px solid var(--line); color:var(--teal); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">Edit</button>
          <button id="deleteExBtn" style="background:none; border:1px solid var(--line); color:var(--red); font-size:11px; padding:3px 8px; border-radius:3px; font-family:'JetBrains Mono',monospace;">Delete</button>
        </div>
      </div>
      <ul class="cues">${(e.cues || []).map(c=>`<li>${c}</li>`).join('')}</ul>
      <a class="yt-link" href="${ytUrl(e.yt||e.name)}" target="_blank" rel="noopener">▶ Watch form demo</a>

      <div class="modal-section">
        <div class="lbl">Last session</div>
        <div class="last-box">${lastSummary(e.name)}</div>
      </div>

      ${mode.mode!=='freeform' ? `
      <div class="modal-section">
        <div class="lbl">Log this session — ${mode.mode==='hold'?'seconds held per set':'reps / added weight per set'}</div>
        <div id="setRows">${rowsData.map((v,i)=>setRowHtml(mode.mode,i,v)).join('')}</div>
        <button class="set-add" id="addSetBtn">+ Add set</button>
      </div>` : `<div class="modal-section"><div class="lbl">This exercise is time-based — use the stopwatch below and save your total time.</div></div>`}

      <div class="modal-section">
        <div class="lbl">Notes</div>
        <textarea class="notes" id="notesBox" placeholder="e.g. left shoulder felt tight, form breaking down on last set...">${(last && last.notes) || ''}</textarea>
      </div>

      <div class="modal-section">
        <div class="lbl">Timers</div>
        <div class="timer-tabs">
          <button class="timer-tab ${state.timerMode==='rest'?'active':''}" data-tmode="rest">Rest</button>
          <button class="timer-tab ${state.timerMode==='stopwatch'?'active':''}" data-tmode="stopwatch">Stopwatch</button>
          <button class="timer-tab ${state.timerMode==='countdown'?'active':''}" data-tmode="countdown">Countdown</button>
        </div>
        <div id="timerPanel"></div>
      </div>

      <button class="save-btn" id="saveSessionBtn">Save Session</button>
    </div>
  </div>`;
  document.getElementById('modal-root').innerHTML = html;
  renderTimerPanel();
  wireModal();
}

function renderTimerPanel(){
  const panel = document.getElementById('timerPanel');
  if(state.timerMode==='rest'){
    panel.innerHTML = `
      <div class="timer-panel">
        <div class="rest-presets">
          ${[30,45,60,75,90,120].map(s=>`<button data-preset="${s}" class="${state.restTotal===s?'sel':''}">${s}s</button>`).join('')}
        </div>
        <div class="timer-big ${state.restRunning && state.restRemaining<=5?'alert':''}">${fmtMMSS(state.restRemaining)}</div>
        <div class="timer-controls">
          <button class="tbtn" id="restStart">${state.restRunning?'Pause':'Start'}</button>
          <button class="tbtn secondary" id="restReset">Reset</button>
        </div>
      </div>`;
    panel.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
      state.restTotal = parseInt(b.dataset.preset); state.restRemaining = state.restTotal; state.restRunning=false;
      clearInterval(state.restInterval); renderTimerPanel();
    }));
    document.getElementById('restStart').addEventListener('click', ()=>{
      if(state.restRunning){ state.restRunning=false; clearInterval(state.restInterval); renderTimerPanel(); return; }
      state.restRunning = true; renderTimerPanel();
      state.restInterval = setInterval(()=>{
        state.restRemaining--;
        if(state.restRemaining<=0){ clearInterval(state.restInterval); state.restRunning=false; beep(); }
        renderTimerPanel();
      },1000);
    });
    document.getElementById('restReset').addEventListener('click', ()=>{
      clearInterval(state.restInterval); state.restRunning=false; state.restRemaining=state.restTotal; renderTimerPanel();
    });
  } else if(state.timerMode==='stopwatch'){
    panel.innerHTML = `
      <div class="timer-panel">
        <div class="field-hint">Counts up — use this to time how long the exercise actually takes you.</div>
        <div class="timer-big">${fmtMMSS(state.swElapsed)}</div>
        <div class="timer-controls">
          <button class="tbtn" id="swStart">${state.swRunning?'Pause':'Start'}</button>
          <button class="tbtn secondary" id="swReset">Reset</button>
        </div>
      </div>`;
    document.getElementById('swStart').addEventListener('click', ()=>{
      if(state.swRunning){ state.swRunning=false; clearInterval(state.swInterval); renderTimerPanel(); return; }
      state.swRunning = true; renderTimerPanel();
      state.swInterval = setInterval(()=>{ state.swElapsed++; renderTimerPanel(); },1000);
    });
    document.getElementById('swReset').addEventListener('click', ()=>{
      clearInterval(state.swInterval); state.swRunning=false; state.swElapsed=0; renderTimerPanel();
    });
  } else {
    panel.innerHTML = `
      <div class="timer-panel">
        <div class="field-hint">Set a target time for this exercise — you'll get an alert when it's up.</div>
        <div class="countdown-set">
          <input type="number" min="0" max="59" id="cdMin" value="${Math.floor(state.cdTotal/60)}"> min
          <input type="number" min="0" max="59" id="cdSec" value="${state.cdTotal%60}"> sec
        </div>
        <div class="timer-big ${state.cdRunning && state.cdRemaining<=5?'alert':''}">${fmtMMSS(state.cdRemaining)}</div>
        <div class="timer-controls">
          <button class="tbtn" id="cdStart">${state.cdRunning?'Pause':'Start'}</button>
          <button class="tbtn secondary" id="cdReset">Reset</button>
        </div>
      </div>`;
    document.getElementById('cdStart').addEventListener('click', ()=>{
      if(state.cdRunning){ state.cdRunning=false; clearInterval(state.cdInterval); renderTimerPanel(); return; }
      const mn = parseInt(document.getElementById('cdMin').value)||0, sc = parseInt(document.getElementById('cdSec').value)||0;
      if(state.cdRemaining<=0 || state.cdTotal !== mn*60+sc){ state.cdTotal = mn*60+sc; state.cdRemaining = state.cdTotal; }
      if(state.cdRemaining<=0) return;
      state.cdRunning = true; renderTimerPanel();
      state.cdInterval = setInterval(()=>{
        state.cdRemaining--;
        if(state.cdRemaining<=0){ clearInterval(state.cdInterval); state.cdRunning=false; beep(); }
        renderTimerPanel();
      },1000);
    });
    document.getElementById('cdReset').addEventListener('click', ()=>{
      clearInterval(state.cdInterval); state.cdRunning=false;
      const mn = parseInt(document.getElementById('cdMin').value)||0, sc = parseInt(document.getElementById('cdSec').value)||0;
      state.cdTotal = mn*60+sc; state.cdRemaining = state.cdTotal; renderTimerPanel();
    });
  }
}

function wireModal(){
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (ev)=>{ if(ev.target.id==='modalOverlay') closeModal(); });
  document.querySelectorAll('.timer-tab').forEach(b=>b.addEventListener('click', ()=>{ state.timerMode = b.dataset.tmode; renderModal(); }));
  
  const editBtn = document.getElementById('editExBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      state.modal.editMode = true;
      renderModal();
    });
  }

  const deleteBtn = document.getElementById('deleteExBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteExercise);
  }

  const addBtn = document.getElementById('addSetBtn');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    const container = document.getElementById('setRows');
    const i = container.querySelectorAll('.set-row').length;
    container.insertAdjacentHTML('beforeend', setRowHtml(state.modal.mode.mode, i, {}));
    wireSetRows();
  });
  wireSetRows();
  const saveSessionBtn = document.getElementById('saveSessionBtn');
  if (saveSessionBtn) saveSessionBtn.addEventListener('click', saveSession);
}
function wireSetRows(){
  document.querySelectorAll('.rm').forEach(b=>b.addEventListener('click', (ev)=>{
    ev.target.closest('.set-row').remove();
    document.querySelectorAll('#setRows .set-row').forEach((row,i)=>{ row.querySelector('.set-idx').textContent = '#'+(i+1); row.querySelectorAll('input').forEach(inp=>inp.dataset.i=i); row.querySelector('.rm').dataset.rm=i; });
  }));
}

async function saveSession(){
  const {ex:e, day, mode} = state.modal;
  const notes = document.getElementById('notesBox').value;
  let sets = [];
  if(mode.mode!=='freeform'){
    document.querySelectorAll('#setRows .set-row').forEach(row=>{
      const obj = {};
      row.querySelectorAll('.setval').forEach(inp=>{ obj[inp.dataset.field] = inp.value===''? 0 : parseFloat(inp.value); });
      sets.push(obj);
    });
  }
  const durationSec = mode.mode==='freeform' ? state.swElapsed : state.swElapsed;
  const entry = {date: todayKey(), mode: mode.mode, sets, durationSec, notes};
  const priorEntries = (DATA.exerciseLogs[e.name]||[]).filter(x=>x.date!==todayKey());
  const hadHistory = priorEntries.length>0;
  const prevBest = hadHistory ? Math.max(...priorEntries.map(x=>sessionScore(x))) : 0;
  DATA.exerciseLogs[e.name] = DATA.exerciseLogs[e.name] || [];
  const idx = DATA.exerciseLogs[e.name].findIndex(x=>x.date===todayKey());
  if(idx>=0) DATA.exerciseLogs[e.name][idx] = entry; else DATA.exerciseLogs[e.name].push(entry);
  if(DATA.exerciseLogs[e.name].length>30) DATA.exerciseLogs[e.name] = DATA.exerciseLogs[e.name].slice(-30);

  let xpGain = XP_RULES.exerciseLog;
  let isPR = false;
  if(mode.mode!=='freeform' && hadHistory){
    const newScore = sessionScore(entry);
    if(newScore>prevBest){ isPR = true; DATA.prCount = (DATA.prCount||0)+1; xpGain += XP_RULES.prBonus; }
  }
  const leveledUp = addXP(xpGain);
  const newBadges = checkAndAwardBadges();
  await saveData();
  closeModal();
  render();
  showToast(isPR? `🚀 New PR on ${e.name}! +${xpGain} XP` : `+${xpGain} XP logged`);
  newBadges.forEach((b,i)=> setTimeout(()=>showToast(`${b.icon} Badge unlocked: ${b.name}`), 700+i*700));
  if(leveledUp) setTimeout(()=>showToast(`⭐ Level up! Now: ${getLevelInfo(DATA.xp).title}`), 700+newBadges.length*700+300);
}

/* ===================== CALENDAR ===================== */
function renderCalendar(){
  const monthDate = state.calMonth;
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthLabel = monthDate.toLocaleDateString(undefined,{month:'long', year:'numeric'});

  let cells = '';
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const key = todayKey(new Date(year, month, d));
    const log = DATA.dayLogs[key];
    const isToday = key===todayKey();
    const isSel = key===state.calSelected;
    let cls = 'cal-cell'+(isToday?' today':'')+(isSel?' selected':'');
    if(log) cls += log.dayId===7 ? ' yoga-day' : ' trained';
    cells += `<div class="${cls}" data-key="${key}">${d}</div>`;
  }
  const dows = ['S','M','T','W','T','F','S'];
  let detail = '';
  if(state.calSelected && DATA.dayLogs[state.calSelected]){
    const log = DATA.dayLogs[state.calSelected];
    const dayInfo = log.dayId===7 ? {title:'Yoga + Breath + Meditation', skill:'Recovery'} : (DAYS.find(d=>d.id===log.dayId)||{});
    detail = `<div class="cal-detail">
      <div class="mono" style="color:var(--amber);font-size:12px;margin-bottom:4px;">${fmtDate(state.calSelected)}</div>
      <h4 style="margin:0 0 10px;">${dayInfo.title||''}${dayInfo.skill?' · '+dayInfo.skill:''}</h4>
      <div class="stat-strip">
        <div class="stat-pill"><div class="k">DURATION</div><div class="v">${log.durationMin||0} min</div></div>
        <div class="stat-pill"><div class="k">VOLUME</div><div class="v">${log.volume||0} kg·reps</div></div>
        <div class="stat-pill"><div class="k">CALORIES</div><div class="v">${log.calories||0} kcal</div></div>
      </div>
    </div>`;
  } else if(state.calSelected){
    detail = `<div class="cal-detail" style="color:var(--bone-dim);font-size:13px;">No session logged on ${fmtDate(state.calSelected)}.</div>`;
  }

  const html = `
  <div class="hero" style="border-bottom:none;padding-bottom:0;">
    <div class="eyebrow">TRAINING HISTORY</div>
    <h1>Calendar</h1>
    <p>Days you've logged complete are highlighted. Tap any date to see what you did.</p>
  </div>
  <div class="cal-nav">
    <button id="calPrev">← Prev</button>
    <h3 style="margin:0;font-size:17px;">${monthLabel}</h3>
    <button id="calNext">Next →</button>
  </div>
  <div class="cal-grid">
    ${dows.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
    ${cells}
  </div>
  ${detail}
  `;
  document.getElementById('app').innerHTML = html;
  document.getElementById('calPrev').addEventListener('click', ()=>{ state.calMonth = new Date(year, month-1, 1); render(); });
  document.getElementById('calNext').addEventListener('click', ()=>{ state.calMonth = new Date(year, month+1, 1); render(); });
  document.querySelectorAll('.cal-cell[data-key]').forEach(c=>c.addEventListener('click', ()=>{ state.calSelected = c.dataset.key; render(); }));
}

/* ===================== PROGRESS / CHARTS ===================== */
function allExerciseNamesGlobal(){
  const names = new Set();
  DAYS.forEach(d=>{ d.skillWork.forEach(e=>names.add(e.name)); d.strength.forEach(e=>names.add(e.name)); });
  WARMUP.items.forEach(e=>names.add(e.name));
  YOGA_DAY.flow.forEach(e=>names.add(e.name)); YOGA_DAY.pranayama.forEach(e=>names.add(e.name)); YOGA_DAY.meditation.forEach(e=>names.add(e.name));
  return Array.from(names).sort();
}
function lastNDayLogs(n){
  const arr = [];
  for(let i=n-1;i>=0;i--){ const d = new Date(); d.setDate(d.getDate()-i); const key = todayKey(d); arr.push({key, log: DATA.dayLogs[key]}); }
  return arr;
}
function renderProgress(){
  const recent = lastNDayLogs(14);
  const calVals = recent.map(r=>r.log? r.log.calories||0 : 0);
  const calLabels = recent.map(r=>fmtDate(r.key));
  const volVals = recent.map(r=>r.log? r.log.volume||0 : 0);

  const names = allExerciseNamesGlobal();
  const selected = state.progressEx || names.find(n=>getHistory(n).length>0) || names[0];
  const hist = getHistory(selected).slice(-10);
  const exVals = hist.map(h=>sessionScore(h));
  const exLabels = hist.map(h=>fmtDate(h.date));
  const mode = hist.length? hist[hist.length-1].mode : 'reps';
  const exUnit = mode==='reps' ? 'volume score (kg·reps)' : mode==='hold' ? 'best hold (sec)' : 'duration (sec)';

  const html = `
  <div class="hero" style="border-bottom:none;padding-bottom:0;">
    <div class="eyebrow">SEE HOW FAR YOU'VE COME</div>
    <h1>Progress</h1>
    <p>A quick map of the last two weeks, plus a closer look at any single exercise.</p>
  </div>
  <div class="chart-card"><h4>Calories burned — last 14 days</h4>${sparklineSVG(calVals, calLabels, {type:'bar', color:'#C6862F'})}</div>
  <div class="chart-card"><h4>Training volume (kg·reps) — last 14 days</h4>${sparklineSVG(volVals, calLabels, {type:'bar', color:'#4F9E8D'})}</div>
  <div class="chart-card">
    <h4>Exercise deep-dive</h4>
    <select id="exSelect" style="width:100%;margin-bottom:12px;">
      ${names.map(n=>`<option value="${n}" ${n===selected?'selected':''}>${n}${getHistory(n).length? ' ('+getHistory(n).length+' sessions)':''}</option>`).join('')}
    </select>
    ${exVals.length? sparklineSVG(exVals, exLabels, {color:'#4F9E8D'}) : '<div class="chart-empty">No sessions logged for this exercise yet — open it from a day and hit Save Session.</div>'}
    ${exVals.length? `<div class="field-hint" style="margin-top:8px;">Y axis: ${exUnit}</div>`:''}
  </div>
  `;
  document.getElementById('app').innerHTML = html;
  document.getElementById('exSelect').addEventListener('change', (ev)=>{ state.progressEx = ev.target.value; render(); });
}

/* ===================== SKILL TRACKER ===================== */
function skillTargetSec(setsStr){
  const m = (setsStr||'').match(/(\d+)\s*sec/i);
  return m ? parseInt(m[1]) : null;
}
function renderSkills(){
  let cards = '';
  const seen = new Set();
  DAYS.forEach(day=>{
    day.skillWork.forEach(e=>{
      if(seen.has(e.name)) return; seen.add(e.name);
      const target = skillTargetSec(e.sets);
      if(!target) return;
      const holds = getHistory(e.name).filter(h=>h.mode==='hold');
      const best = holds.length ? Math.max(...holds.flatMap(h=>h.sets.map(s=>+s.seconds||0))) : 0;
      const pct = Math.min(100, Math.round((best/target)*100));
      const hint = pct>=100 ? 'Target hit with room to spare — time to progress to the next variation.'
        : best===0 ? `Not logged yet — open it from Day ${day.id} to start tracking.`
        : `${(target-best)}s to go to hit this phase's target.`;
      cards += `<div class="skill-card">
        <div class="head"><h4>${e.name}</h4><span class="best">${best}s / ${target}s target</span></div>
        <div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
        <div class="hint">${day.skill} · Day ${String(day.id).padStart(2,'0')} — ${hint}</div>
      </div>`;
    });
  });
  const html = `
  <div class="hero" style="border-bottom:none;padding-bottom:0;">
    <div class="eyebrow">SKILL WORK, MEASURED</div>
    <h1>Skill tracker</h1>
    <p>Every hold-based skill exercise, tracked against this phase's target time. Hit the top of the range with clean form, then move to the next progression.</p>
  </div>
  ${cards || '<div class="chart-empty">No skill holds logged yet — open any day and log a skill hold to start tracking.</div>'}
  <div class="footnote">Full progression order lives under Guide → <span class="mono" style="color:var(--teal);cursor:pointer;" id="goRoadmap">Skill Roadmap</span>.</div>
  `;
  document.getElementById('app').innerHTML = html;
  document.getElementById('goRoadmap').addEventListener('click', ()=>{ state.view='info'; state.infoTab='info-roadmap'; render(); });
}

/* ===================== BODY LOG ===================== */
const MEASURE_FIELDS = [
  {k:'weight', l:'Weight (kg)'}, {k:'chest', l:'Chest (cm)'}, {k:'waist', l:'Waist (cm)'},
  {k:'arms', l:'Arms (cm)'}, {k:'shoulders', l:'Shoulders (cm)'}, {k:'thighs', l:'Thighs (cm)'}, {k:'bodyfat', l:'Body fat (%)'}
];
function renderMeasurements(){
  const list = (DATA.measurements||[]).slice().sort((a,b)=> a.date<b.date?1:-1);
  const metricKeys = MEASURE_FIELDS.map(f=>f.k);
  const selected = metricKeys.includes(state.measureMetric) ? state.measureMetric : 'weight';
  const withMetric = list.filter(m=>m[selected]!=null && m[selected]!=='').slice().reverse();
  const chartVals = withMetric.map(m=>+m[selected]);
  const chartLabels = withMetric.map(m=>fmtDate(m.date));
  const html = `
  <div class="hero" style="border-bottom:none;padding-bottom:0;">
    <div class="eyebrow">SEE THE PHYSIQUE CHANGE, NOT JUST FEEL IT</div>
    <h1>Body log</h1>
    <p>Log measurements every week or two — the tape and the scale tell a truer story than the mirror on a bad-lighting day.</p>
  </div>
  <div class="modal-section" style="margin-top:0;">
    <div class="lbl">Log today's measurements (leave a field blank to skip it)</div>
    <div class="measure-form">
      ${MEASURE_FIELDS.map(f=>`<div><label>${f.l}</label><input type="number" step="0.1" id="mf_${f.k}"></div>`).join('')}
    </div>
    <button class="save-btn" id="measureSaveBtn">Save today's measurements</button>
  </div>
  <div class="chart-card">
    <h4>Trend</h4>
    <select id="metricSelect" style="width:100%;margin-bottom:12px;">
      ${MEASURE_FIELDS.map(f=>`<option value="${f.k}" ${f.k===selected?'selected':''}>${f.l}</option>`).join('')}
    </select>
    ${chartVals.length? sparklineSVG(chartVals, chartLabels, {color:'#C6862F'}) : '<div class="chart-empty">No entries for this metric yet.</div>'}
  </div>
  <div class="chart-card">
    <h4>History</h4>
    ${list.length? `<table class="measure-table"><thead><tr><th>Date</th>${MEASURE_FIELDS.map(f=>`<th>${f.l.split(' ')[0]}</th>`).join('')}</tr></thead><tbody>
      ${list.map(m=>`<tr><td>${fmtDate(m.date)}</td>${MEASURE_FIELDS.map(f=>`<td>${(m[f.k]!=null && m[f.k]!=='')? m[f.k] : '—'}</td>`).join('')}</tr>`).join('')}
    </tbody></table>` : '<div class="chart-empty">No measurements logged yet.</div>'}
  </div>`;
  document.getElementById('app').innerHTML = html;
  document.getElementById('metricSelect').addEventListener('change', (ev)=>{ state.measureMetric = ev.target.value; render(); });
  document.getElementById('measureSaveBtn').addEventListener('click', async ()=>{
    const entry = {date: todayKey()};
    let any = false;
    MEASURE_FIELDS.forEach(f=>{ const v = document.getElementById('mf_'+f.k).value; if(v!==''){ entry[f.k] = parseFloat(v); any = true; } });
    if(!any){ showToast('Enter at least one measurement first'); return; }
    DATA.measurements = DATA.measurements || [];
    const idx = DATA.measurements.findIndex(m=>m.date===todayKey());
    if(idx>=0) DATA.measurements[idx] = Object.assign(DATA.measurements[idx], entry); else DATA.measurements.push(entry);
    const leveledUp = addXP(XP_RULES.measureLog);
    const newBadges = checkAndAwardBadges();
    await saveData();
    render();
    showToast(`📏 Measurements logged — +${XP_RULES.measureLog} XP`);
    newBadges.forEach((b,i)=> setTimeout(()=>showToast(`${b.icon} Badge unlocked: ${b.name}`), 700+i*700));
    if(leveledUp) setTimeout(()=>showToast(`⭐ Level up! Now: ${getLevelInfo(DATA.xp).title}`), 700+newBadges.length*700+300);
  });
}

/* ===================== TROPHY ROOM ===================== */
function renderAchievements(){
  const ctx = buildBadgeContext();
  const li = getLevelInfo(DATA.xp||0);
  const wk = computeWeekProgress();
  const html = `
  <div class="hero" style="border-bottom:none;padding-bottom:0;">
    <div class="eyebrow">EVERY REP COUNTS</div>
    <h1>Trophy room</h1>
    <p>Your level, streaks, and every badge earned so far — plus the ones still waiting to be unlocked.</p>
    <div class="level-card">
      <div class="level-badge">${li.level}</div>
      <div class="level-info">
        <div class="title-row"><h4>${li.title}</h4><span class="xp-txt">${li.xp} XP${li.nextXp? ' · '+li.nextXp+' to next level' : ' · MAX LEVEL'}</span></div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${li.pct}%"></div></div>
      </div>
      <div class="streak-box"><div class="flame">🔥</div><div class="num">${ctx.currentStreak}</div><div class="lbl">CURRENT</div></div>
      <div class="streak-box"><div class="flame">🏔️</div><div class="num">${ctx.longestStreak}</div><div class="lbl">LONGEST</div></div>
    </div>
  </div>
  <div class="stat-strip">
    <div class="stat-pill"><div class="k">SESSIONS LOGGED</div><div class="v">${ctx.totalSessions}</div></div>
    <div class="stat-pill"><div class="k">PERSONAL RECORDS</div><div class="v">${ctx.prCount}</div></div>
    <div class="stat-pill"><div class="k">DAYS COMPLETED</div><div class="v">${ctx.daysCompleted}</div></div>
    <div class="stat-pill"><div class="k">BADGES</div><div class="v">${DATA.badges.length}/${BADGES.length}</div></div>
  </div>
  <div class="modal-section">
    <div class="lbl">Weekly training goal — currently ${wk.done}/${wk.goal} this week</div>
    <div class="weight-field"><input type="number" min="1" max="7" id="goalInput" value="${DATA.weeklyGoal||6}"><span class="mono" style="color:var(--bone-dim);">days / week</span><button class="tbtn" id="goalSave">Save</button></div>
  </div>
  <div class="section-label"><div class="tag amber">BADGES</div><h4>${DATA.badges.length} of ${BADGES.length} unlocked</h4></div>
  <div class="badge-grid">
    ${BADGES.map(b=>{
      const earned = DATA.badges.includes(b.id);
      return `<div class="badge-card ${earned?'earned':''}"><div class="bicon">${earned? b.icon : '🔒'}</div><div class="bname">${b.name}</div><div class="bdesc">${b.desc}</div></div>`;
    }).join('')}
  </div>`;
  document.getElementById('app').innerHTML = html;
  document.getElementById('goalSave').addEventListener('click', async ()=>{
    const v = parseInt(document.getElementById('goalInput').value);
    if(v>=1 && v<=7){ DATA.weeklyGoal = v; await saveData(); render(); }
  });
}

/* ===================== INFO PAGES ===================== */
function renderInfo(){
  let html = '';
  if(state.infoTab==='info-warmup'){
    html = `<div class="hero" style="border-bottom:none;padding-bottom:0;"><div class="eyebrow">EVERY TRAINING DAY, MON–SAT</div><h1>Warm-up + breath protocol</h1><p>Adds about 8–10 minutes total to each day, already factored into the time budgets shown per day.</p></div>
    <div class="section-label"><div class="tag">WARM-UP</div><h4>${WARMUP.time}</h4></div>
    ${WARMUP.items.map(e=>`<div class="ex-card"><div style="padding:14px 16px;"><div class="ex-title" style="margin-bottom:8px;"><div class="name">${e.name}</div><div class="sub">${e.sets}</div></div><ul class="cues">${e.cues.map(c=>`<li>${c}</li>`).join('')}</ul><a class="yt-link" href="${ytUrl(e.name)}" target="_blank" rel="noopener">▶ Watch form demo</a></div></div>`).join('')}
    <div class="section-label"><div class="tag amber">BEFORE TRAINING</div><h4>Energizing breath — 3 min</h4></div>
    <div class="ex-card"><div style="padding:14px 16px;"><div class="ex-title" style="margin-bottom:8px;"><div class="name">${PRANAYAMA_SHORT.before[0].name}</div></div><ul class="cues">${PRANAYAMA_SHORT.before[0].cues.map(c=>`<li>${c}</li>`).join('')}</ul></div></div>
    <div class="section-label"><div class="tag amber">AFTER TRAINING</div><h4>Calming breath + meditation — 5–7 min</h4></div>
    ${PRANAYAMA_SHORT.after.map(e=>`<div class="ex-card"><div style="padding:14px 16px;"><div class="ex-title" style="margin-bottom:8px;"><div class="name">${e.name}</div><div class="sub">${e.sets || ''}</div></div><ul class="cues">${e.cues.map(c=>`<li>${c}</li>`).join('')}</ul></div></div>`).join('')}`;
  } else if(state.infoTab==='info-nutrition'){
    html = `<div class="hero" style="border-bottom:none;padding-bottom:0;"><div class="eyebrow">FUEL FOR A SLOW LEAN BULK</div><h1>Nutrition + recovery</h1><p>Body composition context: skinny-fat with a solid beginner strength base — targets below are scaled to your bodyweight.</p></div>
    <div class="modal-section" style="margin-top:0;">
      <div class="lbl">Your bodyweight (used for calorie + volume math)</div>
      <div class="weight-field"><input type="number" step="0.1" id="bwInput" value="${DATA.profileWeight}"><span class="mono" style="color:var(--bone-dim);">kg</span><button class="tbtn" id="bwSave">Save</button></div>
    </div>
    <div class="grid-2">
      <div class="stat-box"><div class="k">SURPLUS</div><div class="v">+250–350 kcal/day</div></div>
      <div class="stat-box"><div class="k">PROTEIN</div><div class="v">1.6–2.2 g/kg ≈ ${Math.round(DATA.profileWeight*1.6)}–${Math.round(DATA.profileWeight*2.2)} g/day</div></div>
      <div class="stat-box"><div class="k">FAT</div><div class="v">0.8–1 g/kg ≈ ${Math.round(DATA.profileWeight*0.8)}–${Math.round(DATA.profileWeight*1)} g/day</div></div>
      <div class="stat-box"><div class="k">CARBS</div><div class="v">Fill the rest to fuel training</div></div>
    </div>
    <div class="info-block" style="margin-top:24px;"><h3>Recovery</h3><ul class="cues"><li>Sleep 7.5–9 hours.</li><li>Take Day 7 seriously as recovery, not "just another light workout."</li><li>Deload every 6–8 weeks: one week at ~50% volume to protect tendons.</li></ul></div>
    <div class="info-block"><h3>On the gynecomastia question</h3><p style="font-size:13.5px;color:#D9D6CE;line-height:1.6;">Building chest, shoulders, and back adds visible size and firmness over the chest area and genuinely changes how it looks and fits in clothes. If it's true glandular tissue rather than fat, training won't remove the tissue itself — if it bothers you significantly, a doctor's evaluation is worth it at some point, independent of this training.</p></div>
    <div class="info-block"><h3>Optional add-ons</h3><p class="lede">If you ever have an extra 10–15 min on a given day.</p>${OPTIONAL_ADDONS.map(a=>`<div class="flow-item"><div class="dot"></div><div class="txt"><b>${a.day}</b><span>${a.items}</span></div></div>`).join('')}</div>`;
  } else if(state.infoTab==='info-roadmap'){
    html = `<div class="hero" style="border-bottom:none;padding-bottom:0;"><div class="eyebrow">LEARN IN THIS ORDER, NOT ALL AT ONCE</div><h1>Skill roadmap</h1><p>Rough order, not a deadline — consistency matters more than speed.</p></div>
    ${PHASES.map(p=>`<div class="phase-card"><div class="p-label">${p.label}</div><p>${p.skills}</p></div>`).join('')}`;
  } else if(state.infoTab==='info-rules'){
    html = `<div class="hero" style="border-bottom:none;padding-bottom:0;"><div class="eyebrow">PROGRESSIVE OVERLOAD</div><h1>How to get harder over time</h1><p>Apply these in order — try #1 first, then move down the list once it stops working.</p></div>
    <ol class="rule-list">${OVERLOAD_RULES.map(r=>`<li>${r}</li>`).join('')}</ol>
    <div class="info-block" style="margin-top:24px;"><h3>For skills</h3><p style="font-size:13.5px;color:#D9D6CE;">Once a hold is clean for the top of its time range, move to the next progression.</p></div>`;
  }
  document.getElementById('app').innerHTML = html;
  const bwSave = document.getElementById('bwSave');
  if(bwSave) bwSave.addEventListener('click', async ()=>{
    const v = parseFloat(document.getElementById('bwInput').value);
    if(v>0){ DATA.profileWeight = v; await saveData(); render(); }
  });
}

/* ===================== MAIN RENDER ===================== */
function render(){
  renderSidebar();
  if(state.view==='overview') renderOverview();
  else if(state.view==='day') renderDay();
  else if(state.view==='calendar') renderCalendar();
  else if(state.view==='progress') renderProgress();
  else if(state.view==='skills') renderSkills();
  else if(state.view==='measurements') renderMeasurements();
  else if(state.view==='achievements') renderAchievements();
  else if(state.view==='info') renderInfo();
}

document.getElementById('today-label').textContent = new Date().toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
document.getElementById('sidebarToggle').addEventListener('click', ()=>{ state.sidebarOpen = !state.sidebarOpen; renderSidebar(); });
loadData().then(render);
