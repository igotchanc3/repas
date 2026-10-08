# SPEC — Calculateur de commande Nutrisens (frais)

## 1. Contexte
Outil pour une commerciale Nutrisens (clients EHPAD). Pour un établissement, elle doit proposer **quelles recettes et combien de cartons commander** pour une période, en maximisant la **variété** et en minimisant les **pertes** (assiettes jetées) et les **repas « mixtes »** (des résidents mangent un reste au lieu du plat du jour).

Utilisation : **sur PC**, par elle seule, pour préparer une proposition client.

## 2. Périmètre V1
- **Produits frais uniquement.** Le surgelé (DDM > 6 mois) ne pose pas de problème de pertes, il est hors périmètre.
- **Un repas = un seul produit** (plat complet ou veloutine), pas de composition viande + légume + dessert.
- **Une commande couvre toute la période** = la DLC résiduelle à réception (15 ou 18 jours).
- Midi et soir peuvent utiliser **des gammes différentes** (ex. : plats 300 g le midi, veloutines le soir).
- Sortie : **vraie liste de recettes avec codes articles** + nombre de cartons (bon de commande) + planning jour par jour.

## 3. Données catalogue (`catalogue.json`)
Extraites du catalogue PDF NutriChef (pages produits + codes en fin de catalogue).

Champs par article : `code`, `libelle`, `gamme`, `format` (ex. `300g cassolette`), `portions_par_carton`, `categorie` (terre / mer / végétarien / pâtes / ailleurs), `pauvre_en_sel` (bool), `duo` (bool).

Gammes frais retenues en V1 :

| Gamme | Format | Colisage | Portions / carton |
|---|---|---|---|
| Plats complets | 300 g cassolette ou assiette | carton de 6 | 6 |
| Plats complets | 200 g assiette | carton de 6 | 6 |
| Plats complets | barquette 1 kg | carton de 2 | 2 × (1000 / portion) → 20 si 100 g, 24 si 80 g (arrondi inf.) |
| Veloutines | 180 g cassolette | carton de 9 | 9 |

Gammes à intégrer plus tard (données déjà dans le catalogue) : entrées verrines (12), viandes & poissons 100 g (15), légumes 180 g (6), desserts HP/HC (24).

**Barquette 1 kg (multiportion) :** l'utilisatrice **choisit le grammage d'une portion** (champ libre, raccourcis 80 g et 100 g). Portions par barquette = `floor(1000 / grammage)`. Une barquette ouverte se consomme **sous 48 h** : ses restes ne sont utilisables que le jour même ou le lendemain.

## 4. Entrées utilisateur
- Nom de l'établissement (pour l'export)
- DLC résiduelle : **15 ou 18 jours**, garantie minimum *à réception*. Le jour de livraison n'est pas un jour de service : la période = 15 ou 18 jours de service à partir du lendemain.
- **Jours de service** : l'utilisatrice coche les jours de la semaine servis (défaut : 7 j / 7). `J` = nombre de jours cochés dans la période.
- Pour **midi** et pour **soir** (chacun activable) :
  - nombre de résidents
  - gamme / format
  - portion (80 ou 100 g) si barquette 1 kg
- Tolérance « repas mixtes » : curseur, nombre max de résidents sur un reste par repas (défaut : 0). Le tableau comparatif montre de toute façon ce qu'on gagne en l'augmentant, pour qu'elle en discute avec le client.
- Options : pauvre en sel uniquement, exclure des catégories (ex. pas de porc)

## 5. Règles de calcul
Notations (par service, midi et soir traités **indépendamment**) : `N` résidents, `J` jours, `C` portions par carton, `D = N × J` portions à servir.

- Cartons minimum : `K = ceil(D / C)` → pertes minimales `K × C − D`.
- Un **repas uniforme** pour une recette demande `ceil(N / C)` cartons et laisse `ceil(N/C) × C − N` restes.
- Une recette peut faire un repas **« partiel »** : elle sert `≥ N − M` résidents (M = tolérance), le reste est complété par des restes d'autres recettes **déjà ouvertes les jours précédents**.
- Une recette peut être servie plusieurs jours (ses restes cumulés permettent un repas de plus).
- Contrainte d'ordre : un reste est consommé **après** le jour qui l'a produit, et avant la fin de la DLC (la période entière tient dans la DLC, donc seul l'ordre compte, sauf barquettes 1 kg → 48 h).

**Objectifs (options de Pareto) :** maximiser le nombre de recettes, minimiser les pertes, minimiser les repas mixtes. Proposer 3 à 4 options contrastées : *variété max*, *zéro perte*, *zéro repas mixte*, *compromis*.

**Algorithme :** les tailles sont petites (J ≤ 18, C ≤ 24, N ≤ ~100). Une énumération des répartitions de cartons par recette + une simulation gloutonne du planning (restes les plus anciens servis d'abord) suffit. Pas besoin de solveur en V1.

### Cas de test (calculé à la main, doit être retrouvé)
25 résidents, 14 jours, midi = cartons de 6, soir = cartons de 9, tolérance 7 :
- Midi : 14 recettes, 59 cartons (3 × 5 + 11 × 4), **4 pertes**, 11 midis avec 1 résident sur un reste.
- Soir : 14 recettes, 39 cartons (11 × 3 + 3 × 2), **1 perte**, 3 soirs « 18 + 7 ».
- Total : 28 recettes, 98 cartons, 5 pertes.
- Contre-exemple « zéro mixte » : 21 recettes, 105 cartons, 56 pertes.

## 6. Choix des recettes
- L'outil **propose automatiquement** les recettes du catalogue pour l'option retenue, en variant les catégories (pas deux jours de suite la même protéine, mélange terre / mer / végé).
- L'utilisatrice peut **remplacer** une recette par une autre de la même gamme (liste déroulante).

## 7. Sorties
1. Tableau comparatif des options (recettes, cartons, pertes, repas mixtes).
2. Pour l'option choisie :
   - **Bon de commande** : code article, libellé, nombre de cartons, portions
   - **Planning** jour par jour : jour, service, recette (code), résidents servis par recette (plat du jour + restes)
3. Export : **copier** dans le presse-papier + **CSV** (ouvrable dans Excel) + **impression / PDF**.

## 8. Technique
- **Une seule page HTML** autonome (HTML + JS + CSS), sans serveur ni installation, données catalogue intégrées.
- Repo GitHub : `index.html`, `catalogue.json`, `calcul.js` (logique pure, testable), `tests/` (cas du §5), `SPEC.md`, `README.md`.
- Interface en français, pensée pour un écran de PC.

## 9. Hors périmètre V1
Surgelé, composition de repas (entrée + plat + dessert), régimes multiples dans une même commande, prix, livraisons multiples dans la période.

## 10. Points tranchés
- Grammage des multiportions : choisi par l'utilisatrice.
- Jour de livraison : pas un jour de service (DLC = minimum à réception).
- Jours de service : choisis par l'utilisatrice.
- Tolérance repas mixtes : paramètre libre, défaut 0, impact affiché dans le comparatif.
