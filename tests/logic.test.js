// Tests des règles du tournoi : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const {emptyState, compute, placeSlots} = require('../tournoi/web/js/logic.js');

const names = n => Array.from({length: n}, (_, i) => 'J' + (i + 1));
const tournoi = (n, scores = {}, extra = {}) => {
  const st = Object.assign(emptyState(), {players: names(n)}, extra);
  Object.assign(st.scores, scores);
  return st;
};
const joueurs = (T, b) => b.slots.map(x => T.P[x.p]);
const uneFoisChacun = (T, blocks) => {
  const vus = blocks.flatMap(b => b.slots.map(x => x.p)).sort((a, b) => a - b);
  assert.deepEqual(vus, T.P.map((_, i) => i));
};

// Poules de 4 joueurs en 1 contre 1, toutes jouées :
// tour 1 : J1 bat J2 (0 / 100), J3 bat J4 (0 / 200) ; tour 2 : J2 bat J3 (0 / 50), J1 bat J4 (0 / 10)
const POULES4 = {p1: {'0-0': 0, '0-1': 100, '1-0': 0, '1-1': 200}, p2: {'0-0': 0, '0-1': 50, '1-0': 10, '1-1': 0}};
// Tour éliminatoire : n°1 (J1) bat n°4 (J4, reste 40) ; n°2 (J3) bat n°3 (J2, reste 20)
const ELIM4 = {el: {'0-0': 0, '0-1': 40, '1-0': 0, '1-1': 20}};

test('tournoi vide', () => {
  const T = compute(emptyState());
  assert.equal(T.N, 0);
  assert.equal(T.phase, 'Inscriptions');
  assert.equal(T.finished, false);
});

test('moins de 16 joueurs : 1 contre 1, 8 qualifiés au plus', () => {
  const T = compute(tournoi(8));
  assert.equal(T.mode4, false);
  assert.equal(T.G, 4);
  assert.equal(T.Q, 8);
  assert.deepEqual(joueurs(T, T.tours[0][0]), ['J1', 'J2']);
  assert.deepEqual(joueurs(T, T.tours[1][3]), ['J8', 'J1']);   // le tour 2 décale les paires
  assert.deepEqual(T.tours[0].map(b => b.machine), [1, 2, 1, 2]);
  T.tours.forEach(bl => uneFoisChacun(T, bl));
});

test('16 joueurs et plus : 4 par machine, 16 qualifiés', () => {
  const T = compute(tournoi(16));
  assert.equal(T.mode4, true);
  assert.equal(T.G, 4);
  assert.equal(T.Q, 16);
  assert.deepEqual(joueurs(T, T.tours[0][0]), ['J1', 'J5', 'J9', 'J13']);
});

test('45 joueurs (maximum joué) : chacun une fois par tour, matchs de 3 ou 4', () => {
  const T = compute(tournoi(45));
  assert.equal(T.G, 12);
  T.tours.forEach(bl => uneFoisChacun(T, bl));
  assert.deepEqual(T.tours[0].map(b => b.n), [4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3]);
  assert.equal(T.elim.length, 12);
  uneFoisChacun(T, T.elim);
  assert.deepEqual(T.elim.map(b => b.n), [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
});

test('nombre impair en 1 contre 1 : un exempt marque 3 points', () => {
  const T = compute(tournoi(5));
  const b = T.tours[0][2];
  assert.equal(b.n, 1);
  assert.deepEqual(b.slots[0], Object.assign({}, b.slots[0], {exempt: true, pts: 3, pm: 301, place: 1}));
});

test('points de poule : 3 · 2 · 1 · 0, goal average = 301 − reste', () => {
  const T = compute(tournoi(16, {p1: {'0-0': 0, '0-1': 50, '0-2': 100, '0-3': 200}}));
  const b = T.tours[0][0];
  assert.deepEqual(b.slots.map(x => [x.place, x.pts, x.pm]), [[1, 3, 301], [2, 2, 251], [3, 1, 201], [4, 0, 101]]);
  assert.equal(b.done, true);
});

test('un 0 unique suffit à désigner le vainqueur', () => {
  const sl = [{rest: null}, {rest: 0}, {rest: null}];
  placeSlots(sl);
  assert.deepEqual(sl.map(x => x.place), [null, 1, null]);
  const tous = [{rest: 30}, {rest: 10}];
  placeSlots(tous);
  assert.deepEqual(tous.map(x => x.place), [2, 1]);
});

test('classement des poules : points, puis goal average', () => {
  const T = compute(tournoi(4, POULES4));
  assert.deepEqual(T.cls.map(r => [r.name, r.pts, r.ga]), [['J1', 6, 602], ['J3', 3, 552], ['J2', 3, 502], ['J4', 0, 392]]);
  assert.equal(T.poulesDone, true);
  assert.equal(T.phase, 'Poules · Tour 3');            // 4 joueurs pour 4 places : personne ne sort
});

test('nombre d\'éliminés connu dès les inscriptions ; sans éliminé, le tour devient « Poules · Tour 3 »', () => {
  for (const [n, out] of [[8, 0], [10, 2], [16, 0], [17, 1], [45, 29]]) {
    const T = compute(tournoi(n));
    const nom = out ? 'Tour éliminatoire' : 'Poules · Tour 3';
    assert.deepEqual([n, T.elimOut, T.elimCuts, T.elimName], [n, out, out > 0, nom]);
    assert.deepEqual([...new Set(T.prog.filter(x => x.phaseKey === 3).map(x => x.phase))], [nom]);
  }
});

test('tour éliminatoire : classement reparti de zéro avant les résultats', () => {
  const T = compute(tournoi(4, POULES4));
  assert.deepEqual(T.elimCls.map(r => [r.name, r.seed, r.rank, r.pts, r.ga]),
    [['J1', 1, null, 0, 0], ['J3', 2, null, 0, 0], ['J2', 3, null, 0, 0], ['J4', 4, null, 0, 0]]);
});

test('tour éliminatoire : la place dans le match qualifie, pas le classement des poules', () => {
  const T = compute(tournoi(4, Object.assign({}, POULES4, ELIM4)));
  assert.equal(T.elimDone, true);
  assert.deepEqual(T.elimCls.map(r => [r.name, r.rank, r.pts, r.ga]),
    [['J1', 1, 3, 301], ['J3', 2, 3, 301], ['J2', 3, 2, 281], ['J4', 4, 2, 261]]);
  // Même ordre que la qualification
  assert.deepEqual(T.elimCls.map(r => r.p), T.elimOrder.map(x => x.p));
});

test('un bon classement de poule ne protège pas d\'une défaite au tour éliminatoire', () => {
  // 20 joueurs, J1 premier des poules (tête de série n°1) finit dernier de son match éliminatoire
  const p1 = {}, p2 = {};
  compute(tournoi(20)).tours.forEach((bl, t) => bl.forEach(b => b.slots.forEach(x => {
    (t ? p2 : p1)[b.m + '-' + x.s] = x.p === 0 ? 0 : 10 + x.p;
  })));
  const T0 = compute(tournoi(20, {p1, p2}));
  assert.equal(T0.cls[0].name, 'J1');
  const m0 = T0.elim[0];
  const el = {};
  m0.slots.forEach((x, k) => { el['0-' + x.s] = x.p === 0 ? 250 : k * 10; });
  const T = compute(tournoi(20, {p1, p2, el}));
  const j1 = T.elimCls.find(r => r.name === 'J1');
  assert.equal(j1.pts, 0);
  assert.equal(j1.ga, 51);
});

// Joue des matchs : le joueur de la 1re place du match finit (reste 0), les suivants à 10, 20, 30
const jouer = (st, blocks) => blocks.forEach(b => {
  if (b.n < 2) return;
  st.scores[b.key] = st.scores[b.key] || {};
  b.slots.forEach((x, k) => { st.scores[b.key][b.m + '-' + x.s] = k * 10; });
});
const prets = (T, phaseKey) => T.prog.filter(x => x.phaseKey === phaseKey).map(x => x.ready);

test('phase finale : un tour n\'est révélé qu\'une fois tous ses matchs joués', () => {
  const st = tournoi(16);
  let T = compute(st); jouer(st, T.tours[0]); jouer(st, T.tours[1]);
  T = compute(st); jouer(st, T.elim);
  T = compute(st);
  assert.deepEqual(prets(T, 4), [true, true, true, true]);
  assert.deepEqual(prets(T, 5), [false, false]);

  jouer(st, T.qualif.slice(0, 3));                       // 3 qualifications sur 4
  T = compute(st);
  assert.equal(T.qualifDone, false);
  assert.deepEqual(prets(T, 5), [false, false]);

  jouer(st, T.qualif);
  T = compute(st);
  assert.equal(T.qualifDone, true);
  assert.deepEqual(prets(T, 5), [true, true]);
  assert.deepEqual(prets(T, 6), [false, false]);

  jouer(st, T.s501.slice(0, 1));                          // 1 groupe 501 sur 2
  T = compute(st);
  assert.equal(T.s501Done, false);
  assert.deepEqual(prets(T, 6), [false, false]);

  jouer(st, T.s501);
  T = compute(st);
  assert.equal(T.s501Done, true);
  assert.deepEqual(prets(T, 6), [true, true]);           // demi-finales
  assert.deepEqual(prets(T, 7), [false, false]);         // finales

  jouer(st, T.semis.slice(0, 1));                         // 1 demi-finale sur 2
  T = compute(st);
  assert.equal(T.semisDone, false);
  assert.deepEqual(prets(T, 7), [false, false]);

  jouer(st, T.semis);
  T = compute(st);
  assert.equal(T.semisDone, true);
  assert.deepEqual(prets(T, 7), [true, true]);
});

// 16 joueurs (4 par machine) joués jusqu'à la fin du tour 501 inclus
const jusquAu501 = f5 => {
  const st = tournoi(16);
  let T = compute(st); jouer(st, T.tours[0]); jouer(st, T.tours[1]);
  T = compute(st); jouer(st, T.elim);
  T = compute(st); jouer(st, T.qualif);
  if (f5) st.scores.f5 = f5; else jouer(st, compute(st).s501);
  return st;
};

test('demi-finales : les 2 premiers de chaque groupe 501, 1er contre 4e et 2e contre 3e', () => {
  // groupe 1 : vainqueur, puis 2e à 40 ; groupe 2 : vainqueur, puis 2e à 15
  const st = jusquAu501({'0-0': 0, '0-1': 40, '0-2': 100, '0-3': 200, '1-0': 0, '1-1': 15, '1-2': 100, '1-3': 200});
  const T = compute(st);
  assert.equal(T.phase, 'Demi-finales 501');
  const g = k => T.s501[k].slots.map(x => x.p);
  const rang = p => T.elimOrder.find(x => x.p === p).erank;
  // Les deux vainqueurs ont fini (reste 0) : départagés par leur rang de qualification
  const [meilleur, autre] = rang(g(0)[0]) < rang(g(1)[0]) ? [g(0)[0], g(1)[0]] : [g(1)[0], g(0)[0]];
  assert.deepEqual(T.semis.map(b => b.slots.map(x => x.p)), [[meilleur, g(0)[1]], [autre, g(1)[1]]]);
  assert.deepEqual(T.s501.flatMap(b => b.slots.map(x => x.toSemi)), [true, true, false, false, true, true, false, false]);
});

test('4 par machine : vainqueurs des demi-finales en finale, perdants en petite finale', () => {
  const st = jusquAu501();
  let T = compute(st);
  jouer(st, T.semis);                                      // le 1er de chaque demi-finale gagne
  T = compute(st);
  const [d1, d2] = T.semis.map(b => b.slots.map(x => x.p));
  assert.deepEqual(T.finale.entries.map(e => e.p), [d1[0], d2[0]]);
  assert.deepEqual(T.petite.entries.map(e => e.p), [d1[1], d2[1]]);
  st.fin = 0; st.pet = 1;
  T = compute(st);
  assert.deepEqual([1, 2, 3, 4].map(k => T.podium[k]), [d1[0], d2[0], d2[1], d1[1]]);
  assert.equal(T.finished, true);
  assert.equal(T.phase, 'Tournoi terminé');
  assert.equal(T.prog.filter(x => x.n >= 2).length, 22); // 8 poules, 4 élim., 4 qualif, 2 + 2 + 2
});

test('1 contre 1 : le tour 501 est la demi-finale, pas de demi-finale en plus', () => {
  const T = compute(tournoi(8));
  assert.deepEqual(T.semis, []);
  assert.deepEqual(prets(T, 6), []);
});

test('tournoi complet à 4 joueurs jusqu\'au podium', () => {
  const T = compute(tournoi(4, Object.assign({}, POULES4, ELIM4, {
    f5: {'0-0': 0, '0-1': 100, '1-0': 80, '1-1': 0},   // demi 1 : J1 bat J4 ; demi 2 : J2 bat J3
  }), {fin: 1, pet: 0}));                                // finale gagnée par J2, petite finale par J4
  assert.deepEqual(T.s501.map(b => joueurs(T, b)), [['J1', 'J4'], ['J3', 'J2']]);
  assert.deepEqual([1, 2, 3, 4].map(k => T.P[T.podium[k]]), ['J2', 'J1', 'J4', 'J3']);
  assert.equal(T.finished, true);
  assert.equal(T.phase, 'Tournoi terminé');
});
