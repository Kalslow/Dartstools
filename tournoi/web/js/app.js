/* ===================== SYNCHRO AVEC LE SERVEUR ===================== */
const IS_TV = location.pathname.replace(/\/+$/,'').endsWith('/tv');
let state = emptyState(), ver = -1, online = false, lastOk = 0;
let saving = false, dirty = false, saveTimer = null, resetPending = false;

async function pull(){
  try{
    const r = await fetch('/api/state?v='+ver,{cache:'no-store'});
    const d = await r.json(); online = true; lastOk = Date.now();
    if(!d.same && d.v !== ver && !dirty && !saving){ ver = d.v; state = Object.assign(emptyState(), d.state||{}); state.scores = Object.assign(emptyState().scores, state.scores||{}); render(); }
    else renderStatus();
  }catch(e){ online = false; renderStatus(); }
}
function commit(){ dirty = true; render(); clearTimeout(saveTimer); saveTimer = setTimeout(push, 350); }
async function push(){
  if(saving){ saveTimer = setTimeout(push, 200); return; }
  saving = true; dirty = false;
  const reset = resetPending;   // « Nouveau tournoi » : le serveur efface aussi ses sauvegardes
  try{
    const r = await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base:ver,state,reset})});
    const d = await r.json();
    if(r.status===200){ ver = d.v; online = true; lastOk = Date.now(); if(reset) resetPending = false; }
    else if(r.status===409){ resetPending = false; ver = d.v; state = Object.assign(emptyState(), d.state||{}); toast("Modifié depuis un autre appareil : affichage mis à jour, vérifie ta dernière saisie"); }
    else toast("Enregistrement refusé ("+r.status+")");
  }catch(e){ online = false; dirty = true; toast("Pas de connexion au serveur — la saisie sera renvoyée"); saveTimer = setTimeout(push, 2000); }
  saving = false; render();
}

/* ===================== OUTILS D'AFFICHAGE ===================== */
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let T = null;
const nm = p => p===PEND ? '…' : (p===null||p===undefined ? '' : esc(T.P[p]));
function morph(el, html){
  const t = document.createElement(el.tagName); t.innerHTML = html; patch(el, t);
}
function patch(a,b){
  const ac=[...a.childNodes], bc=[...b.childNodes];
  for(let i=0;i<bc.length;i++){
    const x=ac[i], y=bc[i];
    if(!x){ a.appendChild(y.cloneNode(true)); continue; }
    if(x.nodeType!==y.nodeType || x.nodeName!==y.nodeName || (x.nodeType===1 && (x.id||'')!==(y.id||''))){ a.replaceChild(y.cloneNode(true),x); continue; }
    if(x.nodeType===3){ if(x.nodeValue!==y.nodeValue) x.nodeValue=y.nodeValue; continue; }
    if(x.nodeType!==1) continue;
    for(const at of [...x.attributes]) if(!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for(const at of [...y.attributes]) if(x.getAttribute(at.name)!==at.value) x.setAttribute(at.name,at.value);
    if(x.tagName==='INPUT'){ if(document.activeElement!==x){ const v=y.getAttribute('value')||''; if(x.value!==v) x.value=v; } continue; }
    if(x.tagName==='TEXTAREA'){ if(document.activeElement!==x && x.value!==y.textContent) x.value=y.textContent; continue; }
    patch(x,y);
  }
  for(let i=ac.length-1;i>=bc.length;i--) a.removeChild(ac[i]);
}
function toast(msg){
  const d=document.createElement('div'); d.className='toast'; d.textContent=msg; document.body.appendChild(d);
  setTimeout(()=>d.remove(), 4000);
}
function render(){ T = compute(state); IS_TV ? renderTV() : renderSaisie(); }
function renderStatus(){
  const s=document.getElementById('sync'); if(s){ const st=syncText(); s.className='sync '+st[0]; s.lastChild.textContent=st[1]; }
  const o=document.getElementById('offline'); if(o) o.hidden = online;
}
function syncText(){
  if(!online) return ['err','Serveur injoignable'];
  if(dirty||saving) return ['', 'Enregistrement…'];
  return ['ok','Enregistré'];
}

/* ===================== SAISIE (iPad) ===================== */
let tab = null;
function defaultTab(){
  if(!T.N) return 'joueurs';
  const f=T.prog.find(x=>x.n>=2&&!x.done);
  if(!f) return 'finale';
  return ({1:'t1',2:'t2',3:'el',4:'finale',5:'finale',6:'finale',7:'finale'})[f.phaseKey];
}
function count(blocks){ const r=blocks.filter(b=>b.n>=2); return r.filter(b=>b.done).length+'/'+r.length; }
function renderSaisie(){
  if(!tab && ver>=0) tab = defaultTab();
  const curTab = tab||'joueurs';
  const tabs = [['joueurs','Joueurs',T.N||''],['t1','Tour 1',T.N?count(T.tours[0]):''],['t2','Tour 2',T.N?count(T.tours[1]):''],
                ['el',T.elimCuts?'Éliminatoire':'Tour 3',T.N?count(T.elim):''],['finale','Phase finale',''],['cls','Classement','']];
  const st = syncText();
  let h = `<div class="top"><div class="top-row"><div class="brand">${esc(state.title||'Tournoi')}<small>${state.subtitle?esc(state.subtitle)+' · ':''}Saisie</small></div>
    <div class="sync ${st[0]}" id="sync"><span class="dot"></span><span>${st[1]}</span></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k,l,c])=>`<button class="tab" role="tab" data-tab="${k}" aria-selected="${curTab===k}">${l}${c!==''?`<small>${c}</small>`:''}</button>`).join('')}</div></div>`;
  h += ({joueurs:vJoueurs,t1:()=>vPoules(0),t2:()=>vPoules(1),el:vElim,finale:vFinale,cls:vCls})[curTab]();
  morph(document.getElementById('saisie'), h);
}
function scoreRow(b, x, extra){
  const id = `in-${b.key}-${b.m}-${x.s}`;
  const v = (state.scores[b.key]||{})[b.m+'-'+x.s];
  const shown = (v===undefined||v===null)?'':String(v);
  const bad = shown!=='' && (isNaN(Number(shown)) || Number(shown)<0 || Number(shown)>b.max);
  const cls = ['r', x.place===1?'first':'', extra.adv?'adv':''].join(' ');
  const dis = x.p===PEND ? 'disabled' : '';
  return `<div class="${cls}"><span class="seed">${extra.seed||''}</span>
    <span class="nm ${x.p===PEND?'pend':''}">${x.p===PEND?'en attente':nm(x.p)}</span>
    <input id="${id}" class="num ${bad?'bad':''}" inputmode="numeric" pattern="[0-9]*" placeholder="reste" value="${esc(shown)}" data-k="${b.key}" data-m="${b.m}" data-s="${x.s}" aria-label="Reste de ${nm(x.p)}" ${dis}>
    <button class="win" data-k="${b.key}" data-m="${b.m}" data-s="${x.s}" ${dis} aria-label="${nm(x.p)} a fini (reste 0)">Fini</button>
    <span class="res num">${extra.res||''}</span></div>`;
}
function cardHead(b, title){
  const st = b.n<2 ? '' : (b.done ? '<span class="st ok">Terminé</span>' : '<span class="st">À jouer</span>');
  return `<div class="card-h"><b>${title||b.label}</b><span class="meta">Machine ${b.machine} · vague ${b.vague}</span>${st}</div>`;
}
function vPoules(t){
  const bl = T.tours[t];
  if(!T.N) return `<p class="note">Ajoute d'abord les joueurs dans l'onglet Joueurs.</p>`;
  let h = `<h2>Poules · Tour ${t+1} · 301</h2><p class="note">Saisis le reste de chaque joueur en fin de manche. Le gagnant est à 0 (bouton « Fini »). Points : 1er 3 · 2e 2 · 3e 1 · dernier 0.</p><div class="grid">`;
  for(const b of bl){
    h += `<div class="card ${b.done&&b.n>1?'done':''}">${cardHead(b)}<div class="rows">`;
    for(const x of b.slots){
      if(x.exempt){ h += `<div class="r ex"><span></span><span class="nm">${nm(x.p)}</span><span class="meta">Exempt · 3 pts</span></div>`; continue; }
      h += scoreRow(b,x,{res: x.place!=null ? `<b>${x.place}${x.place===1?'er':'e'}</b>${x.pts} pt${x.pts>1?'s':''}` : ''});
    }
    h += `</div></div>`;
  }
  return h+`</div>`;
}
function vElim(){
  if(!T.N) return `<p class="note">Ajoute d'abord les joueurs.</p>`;
  let h = `<h2>${T.elimName} · 301</h2>`;
  if(!T.poulesDone) h += `<div class="warn">Les poules ne sont pas terminées : ces matchs sont provisoires et peuvent encore changer.</div>`;
  // Annoncé dès le début du tour, avant le premier score : l'organisateur peut l'expliquer aux joueurs
  h += T.elimCuts
    ? `<div class="announce"><b>${T.elimOut} éliminé${T.elimOut>1?'s':''}</b> à la fin de ce tour · ${T.Q} qualifiés sur ${T.N} joueurs</div>`
    : `<div class="announce ok"><b>Aucun éliminé</b> ${T.N} joueurs pour ${T.Q} places : ce tour fixe seulement l'ordre de la qualification</div>`;
  h += `<p class="note">Tout le monde joue. Saisis le reste de <b>tous</b> les joueurs : vainqueurs d'abord, puis 2e, puis 3e ; à place égale, le plus petit reste.</p><div class="grid">`;
  for(const b of T.elim){
    h += `<div class="card ${b.done?'done':''}">${cardHead(b)}<div class="rows">`;
    for(const x of b.slots){
      const res = x.erank ? `<b>#${x.erank}</b>${T.elimCuts?(x.qualified?'Qualifié':'Éliminé'):'Classé'}` : (x.place!=null?`<b>${x.place}${x.place===1?'er':'e'}</b>`:'');
      h += scoreRow(b,x,{seed:'#'+x.seed,res,adv:T.elimCuts&&x.qualified});
    }
    h += `</div></div>`;
  }
  return h+`</div>`;
}
function pfCard(b, resFn){
  let h = `<div class="card ${b.done&&b.n>1?'done':''}">${cardHead(b)}<div class="rows">`;
  if(!b.n) h += `<div class="r ex"><span></span><span class="nm pend">Pas de match</span></div>`;
  for(const x of b.slots) h += scoreRow(b,x,{seed:b.entries[x.s].tag.replace('Vainq. ','V.'),res:resFn(x),adv:x.adv||x.toFinal||x.toSemi});
  return h+`</div></div>`;
}
function duelCard(d, key){
  const btn = (k)=>{ const en=d.entries[k]; const p=en.p;
    return `<button data-duel="${key}" data-w="${k}" aria-pressed="${d.win===k}" ${p===null||p===PEND?'disabled':''}>
      <span>${p===null?'—':(p===PEND?'<i style="color:var(--muted);font-weight:400">en attente</i>':nm(p))}<br><small>${en.tag}</small></span>
      <small>${d.win===k?'Gagnant':'Toucher si gagnant'}</small></button>`; };
  return `<div class="card ${d.done&&d.n>1?'done':''}"><div class="card-h"><b>${d.label}</b><span class="meta">Machine ${d.machine} · cricket</span>${d.done&&d.n>1?'<span class="st ok">Terminé</span>':''}</div>
    <div class="pick">${btn(0)}${btn(1)}</div></div>`;
}
function vFinale(){
  if(!T.N) return `<p class="note">Ajoute d'abord les joueurs.</p>`;
  let h='';
  if(!T.poulesDone) h += `<div class="warn">Les poules ne sont pas terminées : tableau provisoire.</div>`;
  else if(!T.elimDone) h += `<div class="warn">${T.elimCuts?"Le tour éliminatoire n'est pas terminé":"Le tour 3 des poules n'est pas terminé"} : tableau provisoire.</div>`;
  h += `<h2>Qualification · 301</h2><p class="note">${T.mode4?'Les 2 premiers de chaque groupe passent au 501 : saisis tous les restes.':'Le vainqueur passe en demi-finale : le 0 du gagnant suffit.'}</p><div class="grid">`;
  for(const b of T.qualif) h += pfCard(b, x=> x.place!=null ? `<b>${x.place}${x.place===1?'er':'e'}</b>${x.adv?'→ 501':'Éliminé'}` : '');
  h += `</div><h2>${T.mode4?'Tour 501':'Demi-finales · 501'}</h2><div class="grid">`;
  const res = x=> x.toSemi ? `<b>${x.place===1?'1er':x.place+'e'}</b>→ Demi` : (x.toFinal ? `<b>1er</b>→ Finale`
    : (x.toPetite ? `<b>${x.place?x.place+'e':''}</b>→ P. finale` : (x.place!=null?`<b>${x.place}e</b>Éliminé`:'')));
  for(const b of T.s501) h += pfCard(b, res);
  if(T.mode4){
    h += `</div><h2>Demi-finales · 501</h2><p class="note">Les 2 premiers de chaque groupe, classés par place, puis plus petit reste : 1er contre 4e, 2e contre 3e. Le vainqueur va en finale, le perdant en petite finale.</p><div class="grid">`;
    for(const b of T.semis) h += pfCard(b, res);
  }
  h += `</div><h2>Finales · Cricket</h2><div class="grid">${duelCard(T.finale,'fin')}${duelCard(T.petite,'pet')}</div>`;
  const pd=T.podium;
  h += `<h2>Podium</h2><dl class="kv"><dt>Champion</dt><dd>${pd[1]!==null?nm(pd[1]):'—'}</dd><dt>2e</dt><dd>${pd[2]!==null?nm(pd[2]):'—'}</dd><dt>3e</dt><dd>${pd[3]!==null?nm(pd[3]):'—'}</dd><dt>4e</dt><dd>${pd[4]!==null?nm(pd[4]):'—'}</dd></dl>`;
  return h;
}
function vCls(){
  if(!T.N) return `<p class="note">Aucun joueur inscrit.</p>`;
  const er = {}; T.elimOrder.forEach(x=>er[x.p]=x);
  let h = '';
  if(T.poulesDone){
    const fin = r => r.rank===null ? 'À jouer' : (!T.elimDone ? 'Provisoire' : (!T.elimCuts ? 'Classé' : (r.qualified ? 'Qualifié' : 'Éliminé')));
    h += `<h2>${T.elimName}</h2><p class="note">Classement reparti de zéro : points selon la place dans le match (1er 3 · 2e 2 · 3e 1 · 4e 0), puis goal average du match (301 − reste). ${T.elimCuts?`Les ${T.Q} premiers sont qualifiés.`:'Tout le monde est qualifié : ce classement fixe l\'ordre de la qualification.'}</p><div class="tablewrap"><table><thead><tr><th class="c">#</th><th>Joueur</th><th class="c">Pts</th><th class="c">GA</th><th class="c">Tête de série</th><th>Résultat</th></tr></thead><tbody>`;
    for(const r of T.elimCls)
      h += `<tr class="${T.elimDone&&T.elimCuts&&r.qualified?'q':''}"><td class="c num">${r.rank||''}</td><td>${esc(r.name)}</td><td class="c num">${r.pts}</td><td class="c num">${r.ga}</td><td class="c num">#${r.seed}</td><td>${fin(r)}</td></tr>`;
    h += `</tbody></table></div>`;
  }
  h += `<h2>Classement des poules</h2><p class="note">Tri : points, puis goal average (total des points marqués sur les 2 tours).${T.poulesDone?' Il sert seulement à placer les joueurs (têtes de série) pour le tour suivant.':''}</p><div class="tablewrap"><table><thead><tr><th class="c">#</th><th>Joueur</th><th class="c">Pts</th><th class="c">GA</th><th class="c">Joués</th><th>${T.elimCuts?'Tour élim.':'Tour 3'}</th></tr></thead><tbody>`;
  for(const r of T.cls){ const x=er[r.p];
    h += `<tr class="${x&&x.qualified&&T.elimCuts?'q':''}"><td class="c num">${r.rank}</td><td>${esc(r.name)}</td><td class="c num">${r.pts}</td><td class="c num">${r.ga}</td><td class="c num">${r.played}/2</td><td>${!x?'':(!T.elimCuts?'#'+x.erank:(x.qualified?'Qualifié #'+x.erank:'Éliminé'))}</td></tr>`; }
  return h+`</tbody></table></div>`;
}
function hasScores(){ const s=state.scores; return Object.values(s).some(o=>Object.keys(o||{}).length) || state.fin!==null || state.pet!==null; }
function vJoueurs(){
  const names = (state.players||[]);
  const seen={}, dups=[]; names.map(s=>s.trim()).filter(Boolean).forEach(n=>{const k=n.toLowerCase(); if(seen[k]) dups.push(n); seen[k]=1;});
  const N=T.N;
  const host = location.host || 'localhost:8090';
  return `<h2>Joueurs</h2>
  ${hasScores()?`<div class="warn">Des scores sont déjà saisis. Modifier la liste change les matchs déjà joués : à éviter pendant le tournoi.</div>`:''}
  <div class="form">
    <div><label for="players">Un joueur par ligne · l'ordre sert de tirage au sort</label>
      <textarea id="players" spellcheck="false" autocapitalize="words" autocomplete="off">${esc(names.join('\n'))}</textarea>
      ${dups.length?`<p class="dup">Nom en double : ${esc([...new Set(dups)].join(', '))}. Ajoute une initiale pour les distinguer.</p>`:''}
      <div class="btns" style="margin-top:10px"><button class="btn" id="shuffle">Mélanger (tirage au sort)</button></div>
    </div>
    <div style="display:grid;gap:14px">
      <dl class="kv"><dt>Inscrits</dt><dd class="num">${N}</dd>
        <dt>Format</dt><dd>${N>=16?'4 joueurs par machine':'1 contre 1'}</dd>
        <dt>Matchs par tour</dt><dd class="num">${T.G}</dd>
        <dt>Qualifiés</dt><dd class="num">${T.Q}</dd>
        <dt>Éliminés au tour élim.</dt><dd class="num">${!N?'—':(T.elimCuts?T.elimOut:'aucun (devient le tour 3 des poules)')}</dd>
        ${N&&N<4?'<dt>Attention</dt><dd>Minimum 4 joueurs</dd>':''}</dl>
      <div><label for="title">Titre à l'écran</label><input class="field" id="title" value="${esc(state.title||'')}"></div>
      <div><label for="subtitle">Sous-titre</label><input class="field" id="subtitle" value="${esc(state.subtitle||'')}"></div>
      <p class="note">Écran projecteur : ouvre <code>http://${esc(host)}/tv</code> sur le PC, puis F11.</p>
      <div class="btns"><button class="btn danger" id="reset">Nouveau tournoi</button></div>
      <p class="note" id="resetHelp" hidden>Touche encore une fois « Nouveau tournoi » pour tout effacer : le tournoi actuel et ses sauvegardes seront supprimés.</p>
    </div>
  </div>`;
}
let resetArmed=false;
function bindSaisie(){
  const root=document.getElementById('saisie');
  root.addEventListener('click', ev=>{
    const t=ev.target.closest('button'); if(!t) return;
    if(t.dataset.tab){ tab=t.dataset.tab; window.scrollTo(0,0); render(); return; }
    if(t.classList.contains('win')){ setScore(t.dataset.k,t.dataset.m,t.dataset.s,'0'); return; }
    if(t.dataset.duel){ const k=t.dataset.duel, w=Number(t.dataset.w); state[k] = state[k]===w ? null : w; commit(); return; }
    if(t.id==='shuffle'){ const a=state.players.map(s=>s.trim()).filter(Boolean); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} state.players=a; commit(); return; }
    if(t.id==='reset'){
      if(!resetArmed){ resetArmed=true; document.getElementById('resetHelp').hidden=false; setTimeout(()=>{resetArmed=false; const r=document.getElementById('resetHelp'); if(r) r.hidden=true;},5000); return; }
      const keep={title:state.title,subtitle:state.subtitle}; state=Object.assign(emptyState(),keep); resetArmed=false; resetPending=true; tab='joueurs'; commit(); toast('Nouveau tournoi prêt'); return;
    }
  });
  root.addEventListener('input', ev=>{
    const t=ev.target;
    if(t.dataset.k){ setScore(t.dataset.k,t.dataset.m,t.dataset.s,t.value.replace(/[^0-9]/g,''),true); return; }
    if(t.id==='players'){ state.players=t.value.split('\n'); commit(); return; }
    if(t.id==='title'||t.id==='subtitle'){ state[t.id]=t.value; commit(); }
  });
  root.addEventListener('keydown', ev=>{
    if(ev.key==='Enter' && ev.target.dataset.k){ ev.preventDefault();
      const ins=[...root.querySelectorAll('input[data-k]:not([disabled])')]; const i=ins.indexOf(ev.target); if(ins[i+1]) ins[i+1].focus(); else ev.target.blur(); }
  });
}
function setScore(k,m,s,v){
  state.scores[k] = state.scores[k]||{};
  const key=m+'-'+s;
  if(v===''||v===null) delete state.scores[k][key];
  else state.scores[k][key]=Number(v);
  commit();
}

/* ===================== ÉCRAN TV ===================== */
function fit(){ const s=document.getElementById('stage'); if(!s) return; const k=Math.min(innerWidth/1920, innerHeight/1080); s.style.transform=`translate(-50%,-50%) scale(${k})`; }
function playersHTML(it){
  if(!it.ready) return `<div class="mach-msg">Adversaires connus<br>à la fin du tour en cours</div>`;
  const ps = it.players.map(p=>`<div class="p">${nm(p)}</div>`);
  if(it.n<=2) return `<div class="duo">${ps[0]}<div class="vs">VS</div>${ps[1]||''}</div>`;
  return `<div class="quad">${ps.join('')}</div>`;
}
function machineHTML(k){
  const {cur,next} = T.machines[k-1];
  let body, sub='';
  if(cur){ sub = esc(cur.phase) + (cur.phase.startsWith(cur.label) ? '' : ' · '+esc(cur.label)); body = playersHTML(cur); }
  else body = `<div class="mach-msg">${T.N?(T.finished?'Tournoi terminé':'Machine libre'):'En attente des inscriptions'}</div>`;
  const nx = next ? `<b>Ensuite</b>${next.ready ? `<span>${next.players.map(nm).join('  ·  ')}</span>` : 'joueurs connus à la fin du tour'}${next.phase!==(cur&&cur.phase)?` — ${esc(next.phase)}`:''}` : `<b>Ensuite</b>—`;
  return `<div class="mach"><div class="mach-h"><b>MACHINE ${k}</b><span>${sub}</span></div><div class="mach-body" id="mb${k}-${cur?cur.ord:'x'}">${body}</div><div class="mach-next">${nx}</div></div>`;
}
function clsHTML(){
  // Poules terminées : classement du tour éliminatoire, reparti de zéro. Celui des poules ne
  // sert plus qu'aux têtes de série et ne qualifie personne : l'afficher prête à confusion.
  const list = T.poulesDone ? T.elimCls : T.cls;
  const n=list.length;
  if(!n) return `<div class="mach-msg" style="align-self:center">Les inscriptions sont ouvertes</div>`;
  const cols = n<=8?1:n<=16?2:n<=30?3:4, rows=Math.ceil(n/cols);
  const rowH = Math.min(48, Math.floor(350/rows)), fs=Math.round(Math.min(30,rowH*0.6));
  const er={}; T.elimOrder.forEach(x=>er[x.p]=x);
  const showQ = T.elimDone && T.elimCuts;       // tout le monde qualifié : pas de « Q »
  return `<div class="cls num" style="grid-template-rows:repeat(${rows},${rowH}px);grid-template-columns:repeat(${cols},minmax(0,1fr));font-size:${fs}px">${
    list.map(r=>`<div class="cl ${showQ&&er[r.p]&&er[r.p].qualified?'q':''}"><span class="rk">${r.rank||''}</span><span class="nm">${esc(r.name)}</span><span class="pt">${r.pts}</span><span class="ga">${r.ga}</span></div>`).join('')}</div>`;
}
// Poules et tour éliminatoire : classement en grand. Dès la qualification : phase finale en grand.
function tvMode(){
  const live = T.prog.find(x=>x.n>=2&&!x.done);
  return T.N && (!live || live.phaseKey>=4) ? 'm-finale' : 'm-groupes';
}
// Déroulement : les étapes du tournoi, celle en cours avec son avancement (matchs joués)
function railHTML(){
  const live = T.prog.find(x=>x.n>=2&&!x.done), cur = live ? live.phaseKey : (T.N ? 99 : 0);
  const steps = [[1,'Poules · tour 1'],[2,'Poules · tour 2'],[3,T.elimCuts?'Tour éliminatoire':'Poules · tour 3'],[4,'Qualification'],
    ...(T.mode4 ? [[5,'Tour 501'],[6,'Demi-finales']] : [[5,'Demi-finales']]),[7,'Finales']];
  return `<div class="rail" style="--n:${steps.length}">${steps.map(([k,l])=>{
    const ms=T.prog.filter(x=>x.phaseKey===k&&x.n>=2), d=ms.filter(x=>x.done).length;
    const st = k<cur ? 'done' : (k===cur ? 'cur' : '');
    return `<div class="seg ${st}"><i>${st==='cur'&&ms.length?`<b style="width:${Math.round(d*100/ms.length)}%"></b>`:''}</i><span>${l}</span><em class="num">${ms.length?d+'/'+ms.length:''}</em></div>`;
  }).join('')}</div>`;
}
function finPreviewHTML(){
  const row=(t,s)=>`<div class="t">${t}</div><div class="l pend"><span>${s}</span></div>`;
  return `<div class="fin">${row('Qualification · 301', T.mode4?'4 matchs · les 2 premiers passent':'4 matchs · le vainqueur passe')}${
    T.mode4 ? row('Tour 501','2 groupes · les 2 premiers passent')+row('Demi-finales · 501','1er contre 4e, 2e contre 3e')
            : row('Demi-finales · 501','2 matchs')}${row('Finale et petite finale','Cricket')}${
    !T.N ? row('Qualifiés','connus à la fin du tour éliminatoire')
      : T.elimCuts ? row(`${T.Q} qualifiés · ${T.elimOut} éliminés`,'à la fin du tour éliminatoire')
                   : row(`${T.Q} qualifiés · aucun éliminé`,'le tour 3 des poules fixe l\'ordre')}</div>`;
}
// Annonce du tour éliminatoire, visible dès son début (avant le premier score)
function cutHTML(){
  return T.elimCuts ? `<span class="cut">${T.elimOut} éliminé${T.elimOut>1?'s':''} · ${T.Q} qualifiés</span>`
                    : `<span class="cut ok">Aucun éliminé · tous qualifiés</span>`;
}
function qualHTML(){
  return `<div class="qlist num">${T.elimOrder.filter(x=>x.qualified).map(x=>`<div><span class="rk">${x.erank}</span><span>${nm(x.p)}</span></div>`).join('')}</div>`;
}
// Un tour n'est révélé qu'une fois tous ses matchs joués : adversaires du tour suivant,
// puis qui passe (vert), va en petite finale (ocre) ou sort (gris). L'id change à la
// révélation pour relancer l'animation. Le match en cours sur une machine est marqué en rouge.
function bracketHTML(){
  const qd=T.qualifDone, sd=T.s501Done, dd=T.semisDone, fr=T.finalsReady;
  const enJeu = new Set(T.machines.map(m=>m.cur&&m.cur.ready?m.cur.label:null));
  const card=(b,title,body)=>{
    const etat = b.n<2 ? '' : (b.done ? 'ok' : (enJeu.has(b.label) ? 'live' : ''));
    const right = b.n<2 ? 'Exempt' : ({ok:'Terminé', live:'En jeu'}[etat] || 'Machine '+b.machine);
    return `<div class="bc ${etat}"><div class="bt"><span>${title}</span><span>${right}</span></div>${body}</div>`;
  };
  const names=(id,cls,list)=>`<div class="bn ${cls} rv" id="${id}">${list.map(([p,c])=>`<span class="${c}">${nm(p)}</span>`).join('')}</div>`;
  const duo=(id,list)=>`<div class="bn duo rv" id="${id}">${list.map(([p,c])=>`<span class="${c}">${nm(p)}</span>`).join('<i>vs</i>')}</div>`;
  const wait=(id,t)=>`<div class="bn" id="${id}"><span class="wait">${t}</span></div>`;
  // vert : passe au tour suivant (ou en finale) · ocre : petite finale · gris : éliminé
  const issue=x=> x.toSemi||x.toFinal ? 'up' : (x.toPetite ? 'mid' : 'out');
  const cols=[];
  cols.push(['Qualification · 301','q4', T.qualif.map((b,k)=>card(b, b.label,
    b.n ? names(`bq${k}${qd?'r':''}`, '', b.slots.map(x=>[x.p, qd?(x.adv?'up':'out'):''])) : wait('bq'+k,'—')))]);
  cols.push([T.mode4?'Tour 501':'Demi-finales · 501','', T.s501.map((b,k)=>card(b, b.label,
    !qd ? wait('bs'+k,'Connus à la fin des qualifications')
        : T.mode4 ? names(`bs${k}${sd?'r':''}`, 'big', b.slots.map(x=>[x.p, sd?issue(x):'']))
                  : duo(`bs${k}${sd?'r':''}`, b.slots.map(x=>[x.p, sd?issue(x):'']))))]);
  if(T.mode4) cols.push(['Demi-finales · 501','', T.semis.map((b,k)=>card(b, b.label,
    sd ? duo(`bd${k}${dd?'r':''}`, b.slots.map(x=>[x.p, dd?issue(x):''])) : wait('bd'+k,'Connues à la fin du tour 501')))]);
  cols.push(['Finales · cricket','', [T.finale,T.petite].map((d,k)=>card(d, d.label,
    fr ? duo('bf'+k, d.entries.filter(e=>e.p!==null).map(e=>[e.p,'']))
       : wait('bf'+k, T.mode4?'Connus à la fin des demi-finales':'Connus à la fin du tour 501')))]);
  return `<div class="br c${cols.length}">${cols.map(c=>`<h4>${c[0]}</h4>`).join('')}${
    cols.map(([,cls,cards])=>`<div class="bcol ${cls}">${cards.join('')}</div>`).join('')}</div>`;
}
function podiumHTML(){
  const pd=T.podium;
  return `<div class="podium"><div><div class="k">Champion</div><div class="champ">${nm(pd[1])}</div>
    <div class="steps"><div class="step s2"><span class="n">2e</span><span class="w">${pd[2]!==null?nm(pd[2]):'—'}</span></div>
    <div class="step s1"><span class="n">1er</span><span class="w">${nm(pd[1])}</span></div>
    <div class="step s3"><span class="n">3e</span><span class="w">${pd[3]!==null?nm(pd[3]):'—'}</span></div></div>
    ${pd[4]!==null&&pd[4]!==undefined?`<div class="fourth"><span class="n">4e</span><span class="w">${nm(pd[4])}</span></div>`:''}</div></div>`;
}
let clock='';
function renderTV(){
  const now=new Date(); clock=now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const mode=tvMode(), fin=mode==='m-finale';
  document.getElementById('stage').className=mode;     // les modules changent de taille en douceur (CSS)
  const h = `<div class="tv-h"><div class="tv-title"><small>${esc(state.subtitle||'')}</small>${esc(state.title||'Tournoi de fléchettes')}</div>
    <div class="tv-meta"><div class="clock num">${clock}</div>${T.N} joueurs · ${T.mode4?'4 par machine':'1 contre 1'}</div></div>
    ${railHTML()}
    <div class="tv-row">${machineHTML(1)}${machineHTML(2)}</div>
    <div class="tv-row2">
      <div class="box ${fin?'mini':'focus'}">${fin ? `<h3>Qualifiés</h3>${qualHTML()}`
        : `<h3>${T.poulesDone?`${T.elimCuts?'Tour éliminatoire':'Poules · tour 3'}<small>points · goal average du tour</small>${cutHTML()}`:'Classement des poules<small>points · goal average</small>'}</h3>${clsHTML()}`}</div>
      <div class="box ${fin?'focus':'mini'}"><h3>Phase finale${fin?'':'<small>à venir</small>'}</h3>${fin?bracketHTML():finPreviewHTML()}</div></div>
    <div class="offline" id="offline" ${online?'hidden':''}>● Connexion au serveur perdue</div>
    ${T.finished?podiumHTML():''}`;
  morph(document.getElementById('stage'), h);
}

/* ===================== DÉMARRAGE ===================== */
if(IS_TV){
  document.body.classList.add('tv');
  document.getElementById('app').innerHTML = `<div id="tv"><div id="stage"></div></div><button class="fsbtn" id="fs">Plein écran</button>`;
  fit(); addEventListener('resize', fit);
  const fs=document.getElementById('fs');
  fs.onclick=()=>{ (document.documentElement.requestFullscreen?document.documentElement.requestFullscreen():Promise.reject()).catch(()=>{fs.textContent='Appuie sur F11';}); };
  document.addEventListener('fullscreenchange',()=>{ fs.hidden=!!document.fullscreenElement; });
  let mt; const idle=()=>{ clearTimeout(mt); mt=setTimeout(()=>{document.body.classList.remove('mouse'); fs.hidden=true;},3000); };
  addEventListener('mousemove',()=>{ document.body.classList.add('mouse'); fs.hidden=!!document.fullscreenElement; idle(); }); idle();
  render(); pull(); setInterval(pull, 1000);
  setInterval(()=>{ const c=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); if(c!==clock) render(); }, 5000);
}else{
  document.getElementById('app').innerHTML = `<div id="saisie"></div>`;
  bindSaisie(); render(); pull(); setInterval(pull, 2000);
}
