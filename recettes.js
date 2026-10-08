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
  // - `dejaUtilises` : codes déjà pris par l'autre service.
  // Renvoie { choix: [{numero, article}], manque } ; manque > 0 si le catalogue est trop court.
  function proposer(planning, pool, dejaUtilises) {
    const pris = new Set(dejaUtilises || []);
    const dispo = pool.filter((a) => !pris.has(a.code));
    const nb = new Set(planning.map((j) => j.recette)).size;
    const choix = new Map();
    const parCat = {};
    let precedente = null;

    for (const j of planning) {
      let art = choix.get(j.recette);
      if (!art && dispo.length) {
        let meilleur = null, score = Infinity;
        for (const a of dispo) {
          const s = (a.categorie === precedente ? 1000 : 0) + (parCat[a.categorie] || 0) * 10;
          if (s < score) { score = s; meilleur = a; }
        }
        art = meilleur;
        dispo.splice(dispo.indexOf(art), 1);
        choix.set(j.recette, art);
        parCat[art.categorie] = (parCat[art.categorie] || 0) + 1;
      }
      precedente = art ? art.categorie : null;
    }
    const liste = [...choix.entries()].sort((a, b) => a[0] - b[0]).map(([numero, article]) => ({ numero, article }));
    return { choix: liste, manque: nb - liste.length };
  }

  // Articles de la même gamme/format non encore utilisés (liste déroulante de remplacement).
  function alternatives(pool, utilises, articleActuel) {
    const pris = new Set(utilises);
    return pool.filter((a) => a.code === (articleActuel && articleActuel.code) || !pris.has(a.code));
  }

  const api = { filtrer, proposer, alternatives };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Recettes = api;
})(typeof self !== 'undefined' ? self : this);
