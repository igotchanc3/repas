const test = require('node:test');
const assert = require('node:assert');
const Calcul = require('../calcul.js');
const Recettes = require('../recettes.js');
const catalogue = require('../catalogue.json');

const plan = Calcul.calculer({
  jours: 14, tolerance: 7,
  midi: { residents: 25, portionsParCarton: 6 },
  soir: { residents: 25, portionsParCarton: 9 },
}).options[0];

test('filtre : gamme, format, pauvre en sel, catégories exclues', () => {
  const f = { gamme: 'Plats complets', format: '300g cassolette' };
  assert.strictEqual(Recettes.filtrer(catalogue, f).length, 22 + 4 + 10);
  assert.strictEqual(Recettes.filtrer(catalogue, { ...f, pauvreEnSel: true }).length, 10);
  const sansMer = Recettes.filtrer(catalogue, { ...f, exclureCategories: ['mer'] });
  assert.ok(sansMer.every((a) => a.categorie !== 'mer'));
});

test('midi 14 recettes 300 g : codes distincts, pas deux jours de suite la même catégorie', () => {
  const pool = Recettes.filtrer(catalogue, { gamme: 'Plats complets', format: '300g cassolette' });
  const { choix, manque } = Recettes.proposer(plan.services.midi.planning, pool);
  assert.strictEqual(manque, 0);
  assert.strictEqual(new Set(choix.map((c) => c.article.code)).size, 14);
  const par = Object.fromEntries(choix.map((c) => [c.numero, c.article]));
  const jours = plan.services.midi.planning;
  for (let i = 1; i < jours.length; i++) {
    assert.notStrictEqual(par[jours[i].recette].categorie, par[jours[i - 1].recette].categorie, 'jour ' + (i + 1));
  }
  assert.ok(new Set(choix.map((c) => c.article.categorie)).size >= 3);
});

test('l\'autre service ne réutilise pas les mêmes codes ; catalogue trop court signalé', () => {
  const pool = Recettes.filtrer(catalogue, { gamme: 'Plats complets', format: '300g cassolette' });
  const a = Recettes.proposer(plan.services.midi.planning, pool);
  const b = Recettes.proposer(plan.services.soir.planning, pool, a.choix.map((c) => c.article.code));
  const codesA = new Set(a.choix.map((c) => c.article.code));
  assert.ok(b.choix.every((c) => !codesA.has(c.article.code)));
  const court = Recettes.proposer(plan.services.midi.planning, pool.slice(0, 5));
  assert.strictEqual(court.manque, 9);
});

test('alternatives : exclut les recettes déjà utilisées sauf l\'actuelle', () => {
  const pool = Recettes.filtrer(catalogue, { gamme: 'Veloutines', format: '180g cassolette' });
  const alt = Recettes.alternatives(pool, [pool[0].code, pool[1].code], pool[0]);
  assert.strictEqual(alt.length, pool.length - 1);
  assert.ok(alt.includes(pool[0]) && !alt.includes(pool[1]));
});
