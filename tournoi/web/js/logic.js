/* ===================== LOGIQUE DU TOURNOI (mêmes règles que l'Excel) =====================
   Fonctions pures, sans DOM : chargées par le navigateur (variables globales) et par
   les tests Node (module.exports en bas de fichier). */
//LOGIC-START
const PEND = -1; // joueur pas encore connu (vainqueur d'un match non terminé)
const SEEDS4 = [[1,8,9,16],[2,7,10,15],[3,6,11,14],[4,5,12,13]];
const SEEDS2 = [[1,8],[4,5],[2,7],[3,6]];

function emptyState(){
  return {title:"Tournoi de fléchettes", subtitle:"", players:[],
          scores:{p1:{},p2:{},el:{},q:{},f5:{}}, fin:null, pet:null};
}

function compute(st){
  const P = (st.players||[]).map(s=>String(s).trim()).filter(Boolean);
  const N = P.length, mode4 = N>=16;
  const G = N ? (mode4 ? Math.ceil(N/4) : Math.ceil(N/2)) : 0;
  const Q = mode4 ? 16 : Math.min(8,N);
  const S = st.scores||{};
  const val = (k,m,s)=>{ const v=(S[k]||{})[m+'-'+s]; return (v===undefined||v===null||v===''||isNaN(Number(v)))?null:Number(v); };
  const mod = (a,b)=>((a%b)+b)%b;

  // ---- Poules : 2 tours en 301 ----
  const tours = [1,2].map(t=>{
    const blocks=[];
    for(let m=0;m<G;m++){
      const sl=[];
      for(let s=0;s<4;s++){
        let i=null;
        if(t===1){ if(mode4){ if(s*G+m<N) i=s*G+m; } else if(s<2 && 2*m+s<N) i=2*m+s; }
        else { if(mode4){ const v=s*G+mod(m-s,G); if(v<N) i=v; }
               else if(s<2){ const v=2*m+1+s; if(v===N) i=0; else if(v<N) i=v; } }
        if(i!==null) sl.push({s,p:i});
      }
      const key='p'+t, n=sl.length;
      sl.forEach(x=>{ x.rest = n>1 ? val(key,m,x.s) : null; });
      const nin = sl.filter(x=>x.rest!==null).length;
      for(const x of sl){
        if(n===1){ Object.assign(x,{place:1,pts:3,pm:301,exempt:true}); continue; }
        x.pm = x.rest===null ? null : 301-x.rest;
        if(nin===n){ x.place = 1+sl.filter(y=>y.rest<x.rest).length; x.pts = x.place===n ? 0 : [3,2,1][Math.min(x.place,3)-1]; }
        else { x.place=null; x.pts=null; }
      }
      blocks.push({key, m, label:'Match '+(m+1), machine:m%2+1, vague:Math.floor(m/2)+1, slots:sl, n, max:301, done:n<2||nin===n});
    }
    return blocks;
  });

  // ---- Classement des poules : points, puis goal average (points marqués) ----
  const stats = P.map((name,p)=>({p,name,pts:0,ga:0,played:0}));
  for(const bl of tours) for(const b of bl) for(const x of b.slots){
    const r=stats[x.p]; if(x.pts!==null && x.pts!==undefined){ r.pts+=x.pts; r.played++; } if(x.pm!==null && x.pm!==undefined) r.ga+=x.pm;
  }
  const cls = [...stats].sort((a,b)=>(b.pts*1000+b.ga)-(a.pts*1000+a.ga) || a.p-b.p);
  cls.forEach((r,k)=>r.rank=k+1);
  const poulesDone = N>0 && tours.every(bl=>bl.every(b=>b.done));

  // ---- Tour éliminatoire (tout le monde joue) ----
  // Avec 16 joueurs (4 par machine) ou 8 au plus (1 contre 1), tout le monde est qualifié :
  // ce tour ne fait que fixer l'ordre de la qualification et s'appelle alors « Poules · Tour 3 ».
  const elimCuts = !N || N > Q;
  const elimName = elimCuts ? 'Tour éliminatoire' : 'Poules · Tour 3';
  const elimOut = Math.max(0, N - Q);       // connu dès les inscriptions, avant tout score
  const MC = N ? (mode4 ? Math.ceil(N/4) : Math.floor(N/2)) : 0;
  const elim=[];
  for(let m=0;m<MC;m++){
    const seeds = mode4 ? [m+1, 2*G-m, 2*G+m+1, 4*G-m].map(x=>x<=N?x:null)
                        : [m+1, N-m, (N%2===1 && m===Math.floor(N/2)-1) ? (N+1)/2 : null, null];
    const sl=[];
    seeds.forEach((seed,s)=>{ if(seed) sl.push({s, seed, p:cls[seed-1].p}); });
    const n=sl.length;
    sl.forEach(x=>{ x.rest=val('el',m,x.s); });
    placeSlots(sl,false);
    sl.forEach(x=>{ x.key = (x.place!=null && (x.rest!==null || n===1)) ? x.place*100000+(x.rest||0)*100+x.seed : null; });
    elim.push({key:'el', m, label:'Match '+(m+1), machine:m%2+1, vague:Math.floor(m/2)+1, slots:sl, n, max:301,
               done: sl.every(x=>x.key!==null)});
  }
  const elimOrder = elim.flatMap(b=>b.slots).filter(x=>x.key!==null).sort((a,b)=>a.key-b.key);
  elimOrder.forEach((x,k)=>{ x.erank=k+1; x.qualified=k+1<=Q; });
  const elimDone = MC>0 && elim.every(b=>b.done);
  // Classement du tour éliminatoire, reparti de zéro : points selon la place dans le match
  // (1er 3 · 2e 2 · 3e 1 · 4e 0), puis goal average du match (301 − reste). Même ordre que la
  // qualification ; les joueurs sans résultat suivent, par tête de série.
  const elimCls = [...elimOrder, ...elim.flatMap(b=>b.slots).filter(x=>x.key===null).sort((a,b)=>a.seed-b.seed)]
    .map(x=>({p:x.p, name:P[x.p], seed:x.seed, rank:x.erank||null, qualified:!!x.qualified,
              pts: x.key!==null ? [3,2,1,0][x.place-1] : 0,
              ga: x.key!==null && x.rest!==null ? 301-x.rest : 0}));

  // ---- Phase finale ----
  function pf(key,k,entries,label,machine,max){
    const sl=[]; entries.forEach((e,s)=>{ if(e.p!==null && e.p!==undefined) sl.push({s,p:e.p,tag:e.tag,rest:e.p===PEND?null:val(key,k,s)}); });
    const pend = sl.some(x=>x.p===PEND), n=sl.length;
    if(!pend) placeSlots(sl,false); else sl.forEach(x=>x.place=null);
    const f = sl.find(x=>x.place===1), sc = sl.find(x=>x.place===2);
    const first = n===0 ? null : (f ? f.p : PEND);
    let second = n<2 ? null : (sc ? sc.p : PEND);
    if(second===PEND && n===2 && !pend && f) second = sl.find(x=>x!==f).p;
    return {key, m:k, label, machine, vague:1, slots:sl, entries, n, max, pend, first, second,
            done: n<2 ? !pend : (first!==PEND && (n<3 || second!==PEND))};
  }
  const qualif = [0,1,2,3].map(k=>{
    const seeds = (mode4?SEEDS4:SEEDS2)[k];
    const entries = seeds.map(seed=>({p: seed<=N ? (elimOrder[seed-1] ? elimOrder[seed-1].p : null) : null, tag:'#'+seed}));
    const b = pf('q',k,entries,'Qualif '+(k+1),k%2+1,301);
    b.vague = Math.floor(k/2)+1;
    b.slots.forEach(x=>{ x.adv = x.place!=null && x.place <= (mode4?2:1); });
    return b;
  });
  const [Q1,Q2,Q3,Q4] = qualif;
  const e = (p,tag)=>({p,tag});
  const f5entries = mode4
    ? [[e(Q1.first,'1er Q1'),e(Q2.second,'2e Q2'),e(Q3.first,'1er Q3'),e(Q4.second,'2e Q4')],
       [e(Q2.first,'1er Q2'),e(Q1.second,'2e Q1'),e(Q4.first,'1er Q4'),e(Q3.second,'2e Q3')]]
    : [[e(Q1.first,'Vainq. Q1'),e(Q2.first,'Vainq. Q2')],[e(Q3.first,'Vainq. Q3'),e(Q4.first,'Vainq. Q4')]];
  // 4 par machine : 2 groupes de 4, les 2 premiers vont en demi-finale.
  // 1 contre 1 : ce tour est directement la demi-finale (vainqueur en finale, perdant en petite).
  const s501 = f5entries.map((en,k)=>{
    const b=pf('f5',k,en,(mode4?'501 · Groupe ':'Demi-finale ')+(k+1),k+1,501);
    b.slots.forEach(x=>{
      x.toSemi = mode4 && x.place!=null && x.place<=2;
      x.toFinal = !mode4 && x.place===1;
      x.toPetite = !mode4 && x.p===b.second && b.second!==PEND;
    });
    return b;
  });

  // ---- Demi-finales en 501 (4 par machine) : les 4 demi-finalistes sont classés par place
  //      dans leur groupe, puis plus petit reste, puis rang de qualification ; 1er-4e, 2e-3e ----
  let semis = [];
  if(mode4){
    const qrank = {}; elimOrder.forEach(x=>qrank[x.p]=x.erank);
    const top = s501.flatMap(b=>[b.first,b.second].map((p,i)=>({p, place:i+1, rest:(b.slots.find(x=>x.p===p)||{}).rest})));
    const known = top.every(x=>x.p!==PEND && x.p!==null);
    const order = known ? [...top].sort((a,b)=>a.place-b.place || (a.rest||0)-(b.rest||0) || qrank[a.p]-qrank[b.p])
                        : top.map(()=>({p:PEND}));
    const sf = k=>e(order[k].p, '#'+(k+1));
    semis = [[sf(0),sf(3)],[sf(1),sf(2)]].map((en,k)=>{
      const b=pf('sf',k,en,'Demi-finale '+(k+1),k+1,501);
      b.slots.forEach(x=>{ x.toFinal = x.place===1; x.toPetite = x.p===b.second && b.second!==PEND; });
      return b;
    });
  }
  const [S1,S2] = mode4 ? semis : s501;
  function duel(entries, win){
    const pend = entries.some(x=>x.p===PEND);
    const real = entries.filter(x=>x.p!==null);
    let winner=null;
    if(!pend){
      if(win===0||win===1){ if(entries[win].p!==null) winner=entries[win].p; }
      else if(real.length===1) winner=real[0].p;
    }
    const loser = (winner!==null && real.length===2) ? real.find(x=>x.p!==winner).p : null;
    return {entries, pend, n:real.length, winner, loser, win:(win===0||win===1)?win:null, done: real.length<2 ? !pend : (win===0||win===1)};
  }
  const finale = Object.assign(duel([e(S1.first,'Vainq. demi 1'),e(S2.first,'Vainq. demi 2')], st.fin),
                               {label:'Finale', machine:1});
  const petite = Object.assign(duel([e(S1.second,'Perdant demi 1'),e(S2.second,'Perdant demi 2')], st.pet),
                               {label:'Petite finale', machine:2});
  // Excel : la 3e place n'est attribuée que sur sélection explicite
  if(petite.win===null) { petite.winner=null; petite.loser=null; }
  const podium = {1:finale.winner, 2:finale.winner!==null?finale.loser:null, 3:petite.winner, 4:petite.loser};
  // Un tour n'est révélé (adversaires du tour suivant) qu'une fois tous ses matchs joués
  const qualifDone = elimDone && qualif.every(b=>b.done);
  const s501Done = qualifDone && s501.every(b=>b.done);
  const semisDone = s501Done && semis.every(b=>b.done);
  const finalsReady = mode4 ? semisDone : s501Done;

  // ---- Programme : ordre de passage par machine ----
  const prog=[];
  const push=(phaseKey,phase,b,ready)=>{
    const players = b.slots ? b.slots.map(x=>x.p) : b.entries.filter(x=>x.p!==null).map(x=>x.p);
    prog.push({phaseKey,phase,label:b.label,machine:b.machine,players,n:players.length,done:b.done,ready});
  };
  tours[0].forEach(b=>push(1,'Poules · Tour 1',b,true));
  tours[1].forEach(b=>push(2,'Poules · Tour 2',b,true));
  elim.forEach(b=>push(3,elimName,b,poulesDone));
  qualif.forEach(b=>push(4,'Qualification',b,elimDone));
  s501.forEach(b=>push(5,mode4?'Tour 501':'Demi-finales 501',b,qualifDone));
  semis.forEach(b=>push(6,'Demi-finales 501',b,s501Done));
  push(7,'Finale · Cricket',finale,finalsReady);
  push(7,'Petite finale · Cricket',petite,finalsReady);
  prog.forEach((x,k)=>x.ord=k);
  const live = prog.filter(x=>x.n>=2 && !x.done);
  const machines = [1,2].map(mc=>{ const l=live.filter(x=>x.machine===mc); return {cur:l[0]||null, next:l[1]||null}; });
  const firstLive = live[0]||null;
  const phase = N===0 ? 'Inscriptions' : (firstLive ? firstLive.phase : 'Tournoi terminé');

  return {P,N,mode4,G,Q,tours,stats,cls,poulesDone,elim,elimOrder,elimDone,elimCls,elimCuts,elimName,elimOut,qualif,qualifDone,s501,s501Done,semis,semisDone,finalsReady,finale,petite,podium,prog,machines,phase,
          finished: N>0 && !firstLive && finale.winner!==null};
}

// place = 1 + nombre de restes plus petits ; un 0 unique suffit à désigner le vainqueur
function placeSlots(sl){
  const n=sl.length, nin=sl.filter(x=>x.rest!==null).length, zeros=sl.filter(x=>x.rest===0).length;
  for(const x of sl){
    if(n===1) x.place=1;
    else if(x.rest===0 && zeros===1) x.place=1;
    else if(nin===n) x.place=1+sl.filter(y=>y.rest<x.rest).length;
    else x.place=null;
  }
}
//LOGIC-END

if (typeof module !== 'undefined' && module.exports) module.exports = {PEND, emptyState, compute, placeSlots};
