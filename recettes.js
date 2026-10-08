/* recettes.js — choix des recettes du catalogue pour un planning (SPEC §6).
 * Logique pure, navigateur (window.Recettes) et Node.
 */
(function (root) {
  'use strict';

  // Articles du catalogue éligibles pour un service.
  // filtre : { gamme, format, pauvreEnSel, exclureCategories: [] }
  function filtrer(catalogue, filtre) {
    const exclues = new Set(filtre.exclureCategories || []);
    return catalogue.filter((a) =>
      a.gamme === filtre.gamme && a.format === filtre.format &&
      (!filtre.pauvreEnSel || a.pauvre_en_sel) && !exclues.has(a.categorie));
  }

  // Attribue un article à chaque recette du planning (numéros 1..n).
  // - jamais la même catégorie deux jours de suite si on peut l'éviter,
  // - catégories réparties au plus équitablement (terre / mer / végétarien…),
  // - `dejaUtilises` : codes déjà pris par l'autre service (évités tant que possible).
  // Si le catalogue n'a pas assez de recettes, on en resert : valeurs sûres d'abord
  // (catalogue.json, champ valeur_sure), jamais la même recette deux jours de suite.
  // Renvoie { choix: [{numero, article}], repetees } (repetees = recettes resservies).
  function proposer(planning, pool, dejaUtilises) {
    const pris = new Set(dejaUtilises || []);
    const dispo = pool.filter((a) => !pris.has(a.code));
    const choix = new Map();
    const parCat = {}, utilisations = {}, dernierJour = {};
    let precedente = null, repetees = 0;

    const meilleur = (liste, score) => liste.reduce((m, a) => (score(a) < score(m) ? a : m), liste[0]);

    for (const j of planning) {
      let art = choix.get(j.recette);
      if (!art && pool.length) {
        if (dispo.length) {
          art = meilleur(dispo, (a) => (a.categorie === precedente ? 1000 : 0) + (parCat[a.categorie] || 0) * 10);
          dispo.splice(dispo.indexOf(art), 1);
        } else {
          art = meilleur(pool, (a) =>
            (dernierJour[a.code] === j.jour - 1 ? 10000 : 0) +     // jamais la veille
            (a.valeur_sure ? 0 : 2000) +                             // valeurs sûres d'abord
            (a.categorie === precedente ? 1000 : 0) +
            (j.jour - (dernierJour[a.code] || -99) <= 3 ? 500 : 0) +
            (pris.has(a.code) ? 200 : 0) +
            (utilisations[a.code] || 0) * 10);
          repetees++;
        }
        choix.set(j.recette, art);
        parCat[art.categorie] = (parCat[art.categorie] || 0) + 1;
        utilisations[art.code] = (utilisations[art.code] || 0) + 1;
      }
      if (art) dernierJour[art.code] = j.jour;
      precedente = art ? art.categorie : null;
    }
    const liste = [...choix.entries()].sort((a, b) => a[0] - b[0]).map(([numero, article]) => ({ numero, article }));
    return { choix: liste, repetees };
  }

  const api = { filtrer, proposer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Recettes = api;
})(typeof self !== 'undefined' ? self : this);
