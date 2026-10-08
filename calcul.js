/* calcul.js — logique pure du calculateur de commande (SPEC §5).
 * Fonctionne tel quel dans le navigateur (window.Calcul) et sous Node (require).
 *
 * Modèle, par service (midi / soir traités indépendamment) :
 *   N résidents, J jours, C portions par carton, M = tolérance « repas mixtes ».
 *   Une recette = un nombre de cartons + un nombre de jours où elle est « plat du jour ».
 *   Chaque jour, le plat du jour sert N-M..N résidents ; le complément (≤ M) est pris
 *   sur les restes de recettes déjà ouvertes les jours précédents (plus ancien d'abord).
 *   Barquettes 1 kg : un reste n'est utilisable que le jour d'ouverture et le lendemain.
 */
(function (root) {
  'use strict';

  const LIBELLES = {
    'variete-max': 'Variété max',
    'zero-perte': 'Zéro perte',
    'zero-repas-mixte': 'Zéro repas mixte',
    'compromis': 'Compromis',
  };

  /* ---------- Catalogue -> configuration de service ---------- */

  // Barquette 1 kg : portions par barquette = floor(1000 / grammage) ; carton de 2.
  function portionsParBarquette(grammage) {
    return Math.floor(1000 / grammage);
  }

  function portionsParCarton(article, grammage) {
    if (article.multiportion) {
      if (!(grammage > 0)) throw new Error('Grammage requis pour une barquette 1 kg');
      return article.barquettes_par_carton * portionsParBarquette(grammage);
    }
    return article.portions_par_carton;
  }

  // { residents, portionsParCarton, portionsParBarquette? } à partir d'un article du catalogue.
  function serviceDepuisArticle(article, residents, grammage) {
    const s = { residents, portionsParCarton: portionsParCarton(article, grammage) };
    if (article.multiportion) s.portionsParBarquette = portionsParBarquette(grammage);
    return s;
  }

  /* ---------- Simulation d'un service pour une répartition donnée ---------- */

  // recettes : [{cartons, jours}] — renvoie le planning, ou null si infaisable avec la tolérance M.
  function simuler(cfg, J, M, recettes) {
    const N = cfg.residents, C = cfg.portionsParCarton, B = cfg.portionsParBarquette || 0;
    const minPropre = Math.max(0, N - M);
    const recs = recettes.map((r, id) => ({
      id, cartons: r.cartons, jours: r.jours,
      P: r.cartons * C, R: r.cartons * C, futurs: r.jours,
      lots: [], nonOuvertes: B ? Math.round(r.cartons * C / B) : 0,
      jourService: [], consomme: 0,
    }));

    // Ordre : recettes à plus gros surplus d'abord (elles fournissent les restes).
    const ordre = recs.slice().sort((a, b) => (b.P - N * b.jours) - (a.P - N * a.jours) || a.id - b.id);
    const sequence = [];
    if (B) {
      for (const r of ordre) for (let k = 0; k < r.jours; k++) sequence.push(r);   // jours consécutifs (48 h)
    } else {
      const max = Math.max(...recs.map((r) => r.jours));
      for (let k = 0; k < max; k++) for (const r of ordre) if (r.jours > k) sequence.push(r);  // espacés
    }
    if (sequence.length !== J) return null;

    const planning = [];
    for (let t = 1; t <= J; t++) {
      const rec = sequence[t - 1];
      for (const r of recs) for (const lot of r.lots) if (lot.expire < t && lot.restant > 0) { r.R -= lot.restant; lot.restant = 0; }
      rec.futurs--;

      const propre = Math.min(N, rec.R - minPropre * rec.futurs);
      if (propre < minPropre) return null;

      // Portions propres : lots déjà ouverts, puis nouvelle ouverture.
      let reste = propre;
      for (const lot of rec.lots) {
        if (reste === 0) break;
        const q = Math.min(reste, lot.restant);
        lot.restant -= q; rec.R -= q; reste -= q;
      }
      while (reste > 0) {
        let lot;
        if (B) {
          if (rec.nonOuvertes <= 0) return null;
          rec.nonOuvertes--;
          lot = { restant: B, ouvert: t, expire: t + 1 };
        } else {
          lot = { restant: rec.R, ouvert: t, expire: Infinity };
        }
        rec.lots.push(lot);
        const q = Math.min(reste, lot.restant);
        lot.restant -= q; rec.R -= q; reste -= q;
        if (!B) break;
      }
      rec.consomme += propre;
      rec.jourService.push(t);

      // Complément sur les restes des autres recettes (déjà ouvertes avant t), plus anciens d'abord.
      let besoin = N - propre;
      const servis = [{ recette: rec.id, residents: propre, type: 'plat' }];
      if (besoin > 0) {
        const sources = [];
        for (const r of recs) {
          if (r === rec) continue;
          const plafond = r.R - N * r.futurs;               // on garde de quoi servir ses jours futurs
          if (plafond <= 0) continue;
          sources.push({ r, plafond, lots: r.lots.filter((l) => l.restant > 0 && l.ouvert < t && l.expire >= t) });
        }
        const lots = [];
        for (const s of sources) for (const l of s.lots) lots.push({ s, l });
        lots.sort((a, b) => a.l.ouvert - b.l.ouvert || a.s.r.id - b.s.r.id);
        const prisPar = new Map();
        for (const { s, l } of lots) {
          if (besoin === 0) break;
          const deja = s.deja || 0;
          const q = Math.min(besoin, l.restant, s.plafond - deja);
          if (q <= 0) continue;
          l.restant -= q; s.r.R -= q; s.r.consomme += q; s.deja = deja + q; besoin -= q;
          prisPar.set(s.r.id, (prisPar.get(s.r.id) || 0) + q);
        }
        if (besoin > 0) return null;
        for (const [id, q] of prisPar) servis.push({ recette: id, residents: q, type: 'reste' });
      }
      planning.push({ jour: t, recette: rec.id, servis, residentsSurReste: N - propre });
    }

    // Numérotation des recettes par ordre de première apparition.
    const rang = new Map();
    planning.forEach((j) => { if (!rang.has(j.recette)) rang.set(j.recette, rang.size + 1); });
    const num = (id) => rang.get(id);
    const cartons = recs.reduce((s, r) => s + r.cartons, 0);
    const portions = cartons * C;
    return {
      recettes: recs.length,
      cartons,
      portions,
      pertes: portions - N * J,
      repasMixtes: planning.filter((j) => j.residentsSurReste > 0).length,
      residentsSurReste: planning.reduce((s, j) => s + j.residentsSurReste, 0),
      detail: recs.map((r) => ({ numero: num(r.id), cartons: r.cartons, portions: r.P, jours: r.jourService, pertes: r.P - r.consomme })).sort((a, b) => a.numero - b.numero),
      planning: planning.map((j) => ({
        jour: j.jour, recette: num(j.recette), residentsSurReste: j.residentsSurReste,
        servis: j.servis.map((s) => ({ recette: num(s.recette), residents: s.residents, type: s.type })),
      })),
    };
  }

  /* ---------- Génération des candidats d'un service ---------- */

  // Répartit T cartons entre des recettes de poids `jours`, au moins 1 carton chacune (plus grand reste).
  function repartir(T, jours) {
    const r = jours.length, W = jours.reduce((a, b) => a + b, 0), libre = T - r;
    const base = jours.map((d) => Math.floor(libre * d / W));
    let manque = libre - base.reduce((a, b) => a + b, 0);
    const ordre = jours.map((d, i) => ({ i, frac: (libre * d) % W })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; manque > 0; k++, manque--) base[ordre[k].i]++;
    return base.map((b) => b + 1);
  }

  function dominePar(a, b) {   // b domine a ?
    return b.recettes >= a.recettes && b.pertes <= a.pertes && b.repasMixtes <= a.repasMixtes &&
      (b.recettes > a.recettes || b.pertes < a.pertes || b.repasMixtes < a.repasMixtes);
  }

  function pareto(liste, cle) {
    const out = [];
    const vus = new Set();
    for (const x of liste) {
      const k = cle(x).recettes + '|' + cle(x).pertes + '|' + cle(x).repasMixtes;
      if (vus.has(k)) continue;
      if (liste.some((y) => dominePar(cle(x), cle(y)))) continue;
      vus.add(k); out.push(x);
    }
    return out;
  }

  function candidatsService(cfg, J, M) {
    const N = cfg.residents, C = cfg.portionsParCarton;
    const K = Math.ceil(N * J / C);
    const Tmax = Math.max(K, J * Math.ceil(N / C));      // au-delà, plus aucun gain possible
    const res = [];
    for (let r = 1; r <= J; r++) {
      const jours = Array.from({ length: r }, (_, i) => Math.floor(J / r) + (i < J % r ? 1 : 0));
      for (let T = Math.max(K, r); T <= Tmax; T++) {
        const cartons = repartir(T, jours);
        const s = simuler(cfg, J, M, cartons.map((c, i) => ({ cartons: c, jours: jours[i] })));
        if (s) res.push(s);
      }
    }
    return pareto(res, (x) => x);
  }

  /* ---------- Combinaison midi + soir, options ---------- */

  function sommer(parts) {
    const t = { recettes: 0, cartons: 0, pertes: 0, repasMixtes: 0, residentsSurReste: 0 };
    for (const p of Object.values(parts)) for (const k of Object.keys(t)) t[k] += p[k];
    return t;
  }

  function front(params, M) {
    const noms = ['midi', 'soir'].filter((n) => params[n] && params[n].residents > 0);
    if (!noms.length) return [];
    let combos = [{}];
    for (const n of noms) {
      const cands = candidatsService(params[n], params.jours, M);
      combos = combos.flatMap((c) => cands.map((x) => Object.assign({}, c, { [n]: x })));
    }
    const entrees = combos.map((services) => Object.assign({ services }, sommer(services)));
    return pareto(entrees, (x) => x).sort((a, b) => b.recettes - a.recettes || a.pertes - b.pertes || a.repasMixtes - b.repasMixtes);
  }

  // Point du front le plus proche du « meilleur de chaque critère » (valeurs normalisées 0-1).
  function compromis(fr) {
    const rng = (f) => { const v = fr.map(f); return [Math.min(...v), Math.max(...v)]; };
    const [r0, r1] = rng((x) => x.recettes), [p0, p1] = rng((x) => x.pertes), [m0, m1] = rng((x) => x.repasMixtes);
    const n = (v, a, b) => (b === a ? 0 : (v - a) / (b - a));
    const score = (x) => n(r0 + r1 - x.recettes, r0, r1) + n(x.pertes, p0, p1) + n(x.repasMixtes, m0, m1);
    return fr.reduce((best, x) => (score(x) < score(best) - 1e-9 ? x : best), fr[0]);
  }

  function calculer(params) {
    const M = params.tolerance || 0;
    const fr = front(params, M);
    if (!fr.length) return { front: [], options: [] };
    const frZero = M === 0 ? fr : front(params, 0);
    const choix = [
      ['variete-max', fr[0]],
      ['zero-perte', fr.slice().sort((a, b) => a.pertes - b.pertes || b.recettes - a.recettes || a.repasMixtes - b.repasMixtes)[0]],
      ['zero-repas-mixte', compromis(frZero)],
      ['compromis', compromis(fr)],
    ];
    const options = [];
    for (const [label, e] of choix) {
      const deja = options.find((o) => o.entree === e);
      if (deja) deja.labels.push(label); else options.push({ labels: [label], entree: e });
    }
    return { front: fr, options: options.map((o) => Object.assign({ labels: o.labels }, o.entree)) };
  }

  const api = { calculer, simuler, candidatsService, portionsParCarton, portionsParBarquette, serviceDepuisArticle, LIBELLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calcul = api;
})(typeof self !== 'undefined' ? self : this);
