// Cas de test du SPEC §5 (calculés à la main). Lancer : node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const Calcul = require('../calcul.js');
const catalogue = require('../catalogue.json');

const cas = (tolerance) => ({
  jours: 14, tolerance,
  midi: { residents: 25, portionsParCarton: 6 },
  soir: { residents: 25, portionsParCarton: 9 },
});

const compte = (detail) => detail.reduce((m, r) => ((m[r.cartons] = (m[r.cartons] || 0) + 1), m), {});

test('§5 : 25 résidents, 14 jours, midi C=6, soir C=9, tolérance 7', () => {
  const { options } = Calcul.calculer(cas(7));
  const o = options.find((x) => x.labels.includes('variete-max'));
  const { midi, soir } = o.services;

  // Midi : 14 recettes, 59 cartons (3 × 5 + 11 × 4), 4 pertes, 11 midis avec 1 résident sur un reste.
  assert.deepStrictEqual([midi.recettes, midi.cartons, midi.pertes], [14, 59, 4]);
  assert.deepStrictEqual(compte(midi.detail), { 5: 3, 4: 11 });
  assert.strictEqual(midi.repasMixtes, 11);
  assert.ok(midi.planning.filter((j) => j.residentsSurReste > 0).every((j) => j.residentsSurReste === 1));

  // Soir : 14 recettes, 39 cartons (11 × 3 + 3 × 2), 1 perte, 3 soirs « 18 + 7 ».
  assert.deepStrictEqual([soir.recettes, soir.cartons, soir.pertes], [14, 39, 1]);
  assert.deepStrictEqual(compte(soir.detail), { 3: 11, 2: 3 });
  assert.strictEqual(soir.repasMixtes, 3);
  const mixtes = soir.planning.filter((j) => j.residentsSurReste > 0);
  mixtes.forEach((j) => assert.deepStrictEqual(
    [j.servis.find((s) => s.type === 'plat').residents, j.residentsSurReste], [18, 7]));

  // Total : 28 recettes, 98 cartons, 5 pertes.
  assert.deepStrictEqual([o.recettes, o.cartons, o.pertes], [28, 98, 5]);
});

test('planning : chaque jour sert N résidents, les restes viennent de recettes ouvertes avant', () => {
  const { options } = Calcul.calculer(cas(7));
  for (const o of options) for (const s of Object.values(o.services)) {
    const premier = {};
    s.planning.forEach((j) => { if (!(j.recette in premier)) premier[j.recette] = j.jour; });
    for (const j of s.planning) {
      assert.strictEqual(j.servis.reduce((a, x) => a + x.residents, 0), 25);
      j.servis.filter((x) => x.type === 'reste').forEach((x) => assert.ok(premier[x.recette] < j.jour));
    }
    const portionsConsommees = s.detail.reduce((a, r) => a + r.portions - r.pertes, 0);
    assert.strictEqual(portionsConsommees, 25 * 14);
    assert.strictEqual(s.detail.reduce((a, r) => a + r.pertes, 0), s.pertes);
  }
});

test('§5 contre-exemple « zéro mixte » : 21 recettes, 105 cartons, 56 pertes est sur le front', () => {
  const { front } = Calcul.calculer(cas(0));
  assert.ok(front.every((e) => e.repasMixtes === 0));
  assert.ok(front.some((e) => e.recettes === 21 && e.cartons === 105 && e.pertes === 56));
  const max = front[0];                       // variété max sans repas mixte : une recette par jour
  assert.deepStrictEqual([max.recettes, max.cartons, max.pertes], [28, 112, 98]);
});

test('cartons minimum K = ceil(D/C) et pertes minimales K×C − D', () => {
  const { options } = Calcul.calculer(cas(7));
  const zp = options.find((x) => x.labels.includes('zero-perte'));
  assert.strictEqual(zp.services.midi.cartons, Math.ceil(350 / 6));
  assert.strictEqual(zp.services.soir.pertes, 39 * 9 - 350);
});

test('un seul service actif', () => {
  const { options } = Calcul.calculer({ jours: 14, tolerance: 7, soir: { residents: 25, portionsParCarton: 9 } });
  assert.deepStrictEqual(Object.keys(options[0].services), ['soir']);
  assert.strictEqual(options[0].cartons, 39);
});

test('barquette 1 kg : portions par carton = 2 × floor(1000 / grammage)', () => {
  const b = catalogue.find((a) => a.multiportion);
  assert.strictEqual(Calcul.portionsParCarton(b, 100), 20);
  assert.strictEqual(Calcul.portionsParCarton(b, 80), 24);
  const cfg = Calcul.serviceDepuisArticle(b, 25, 100);
  assert.deepStrictEqual(cfg, { residents: 25, portionsParCarton: 20, portionsParBarquette: 10 });
});

test('barquette 1 kg (48 h) : un reste vient d\'une barquette ouverte la veille', () => {
  const cfg = Calcul.serviceDepuisArticle(catalogue.find((a) => a.multiportion), 25, 100);
  const { options } = Calcul.calculer({ jours: 14, tolerance: 7, midi: cfg });
  assert.ok(options.length > 0);
  for (const o of options) {
    const s = o.services.midi;
    assert.strictEqual(s.pertes, s.cartons * 20 - 350);
    for (const j of s.planning) {
      assert.strictEqual(j.servis.reduce((a, x) => a + x.residents, 0), 25);
      for (const r of j.servis.filter((x) => x.type === 'reste')) {
        const veille = s.planning[j.jour - 2];
        assert.ok(veille && veille.recette === r.recette, 'reste de la recette ' + r.recette + ' jour ' + j.jour);
      }
    }
  }
});

test('catalogue.json : champs et colisages', () => {
  assert.strictEqual(catalogue.length, 97);
  assert.strictEqual(new Set(catalogue.map((a) => a.code)).size, 97);
  for (const a of catalogue) {
    for (const k of ['code', 'libelle', 'gamme', 'format', 'categorie', 'pauvre_en_sel', 'duo']) assert.ok(k in a, k + ' manquant : ' + a.code);
    assert.ok(['terre', 'mer', 'végétarien', 'pâtes', 'ailleurs'].includes(a.categorie), a.code);
  }
  assert.ok(catalogue.filter((a) => a.gamme === 'Veloutines').every((a) => a.portions_par_carton === 9));
  assert.ok(catalogue.filter((a) => a.format.startsWith('300g') || a.format.startsWith('200g')).every((a) => a.portions_par_carton === 6));
  assert.ok(catalogue.filter((a) => a.multiportion).every((a) => a.barquettes_par_carton === 2 && a.portions_par_carton === null));
});
