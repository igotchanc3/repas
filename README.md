# Calculateur de commande Nutrisens (frais)

Voir `SPEC.md` pour le besoin. Ouvrir `index.html` dans un navigateur (aucune installation).

| Fichier | Rôle |
|---|---|
| `catalogue.json` | 97 articles frais V1 (plats complets 200/300 g + barquettes 1 kg, veloutines 180 g), extraits du PDF |
| `scripts/extract_catalogue.py` | Régénère `catalogue.json` depuis le PDF (`python3 -I scripts/extract_catalogue.py <pdf> catalogue.json`, requiert `pdfplumber`) |
| `calcul.js` | Logique pure (navigateur + Node) : `Calcul.calculer({jours, tolerance, midi, soir})` |
| `recettes.js` | Choix des recettes (§6) : filtres, variété des catégories, remplacement |
| `src/index.template.html` + `scripts/build.js` | Interface ; `node scripts/build.js` régénère `index.html` (JS + catalogue inlinés) |
| `tests/*.test.js` | Cas du §5 + invariants. Lancer : `node --test "tests/*.test.js"` |

**Après toute modification de `calcul.js`, `recettes.js`, `catalogue.json` ou du template : `node scripts/build.js`.**

## Choix de modélisation à connaître
- Catégories (`terre/mer/végétarien/pâtes/ailleurs`) déduites du libellé par mots-clés : à relire.
- `pauvre_en_sel` et `duo` viennent des titres de section de la page « Codes produits ».
- Plats pauvres en sel 300 g : supposés en cassolette (le catalogue ne précise pas).
- « Onctueux sucrés » (180 g) exclus : desserts, hors V1.
- Pas de tolérance à saisir : la page calcule des scénarios (0, 1, 2… 10 résidents max sur un reste), garde ceux qui sont distincts et affiche le plus varié de chacun (`Calcul.scenarios`).
- Catalogue insuffisant (ex. 13 veloutines pour 15 jours) : des recettes sont resservies, en priorité les « valeurs sûres » (`valeur_sure` dans `catalogue.json`, liste dans `scripts/extract_catalogue.py` : 3 validées sur le terrain, les autres à confirmer), jamais deux jours de suite.
- Bon de commande : une ligne par code article, avec les portions restantes en fin de période.

## Retours terrain à traiter plus tard
- Pas la même viande midi et soir le même jour (ex. poulet / poulet).
- Panachage : 2 ou 3 gammes au choix pour un même service (rare en pratique).
