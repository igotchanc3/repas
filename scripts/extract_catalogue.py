#!/usr/bin/env python3
"""Extrait les codes produits frais (V1) du catalogue PDF NutriChef -> catalogue.json.

Usage : python3 -I scripts/extract_catalogue.py CATALOGUE-TEXTURES-ADAPTEES-012626.pdf catalogue.json
Dépend de pdfplumber. La page « CODES PRODUITS » est un double-page A3 à 6 colonnes
(titres de section en gras, puis lignes « CODE LIBELLE »).
"""
import json, re, sys, unicodedata
import pdfplumber

PAGE_CODES = 31                        # index 0-based de la page « CODES PRODUITS »
COLS = [34, 198, 362, 566, 733, 898]   # x0 des 6 colonnes
CODE = re.compile(r'^([A-Z]{2,5}\d{2,3}|\d{5})$')

# titre de section -> (gamme, format, portions_par_carton | None, barquettes_par_carton, duo, pauvre_en_sel)
SECTIONS = {
    'PLATS COMPLETS SALÉS EN FRAIS (300G)':               ('Plats complets', '300g cassolette', 6, None, False, False),
    'PLATS COMPLETS SALÉS EN FRAIS (300G) ASSIETTE':      ('Plats complets', '300g assiette', 6, None, False, False),
    'PLATS COMPLETS DUO SALÉS EN FRAIS (300G)':           ('Plats complets', '300g cassolette', 6, None, True, False),
    'PLATS COMPLETS DUO SALÉS EN FRAIS (300G) ASSIETTE':  ('Plats complets', '300g assiette', 6, None, True, False),
    'PLATS COMPLETS PAUVRES EN SEL EN FRAIS (300G)':      ('Plats complets', '300g cassolette', 6, None, False, True),
    'PLATS COMPLETS SALÉS EN FRAIS (200G)':               ('Plats complets', '200g assiette', 6, None, False, False),
    'PLATS COMPLETS DUO SALÉS EN FRAIS (200G)':           ('Plats complets', '200g assiette', 6, None, True, False),
    'PLATS COMPLETS SALÉS EN FRAIS (1KG)':                ('Plats complets', 'barquette 1kg', None, 2, False, False),
    'VELOUTINES SALÉES - FRAIS (180G)':                   ('Veloutines', '180g cassolette', 9, None, False, False),
}

# Recettes « valeurs sûres » (bien consommées), resservies en priorité quand le catalogue
# n'a pas assez de recettes pour couvrir la période. Libellés normalisés (sans accents).
# Les 3 premières viennent du terrain ; les autres sont des classiques à valider.
VALEURS_SURES = [
    'poulet et petits legumes', 'quiche lorraine', 'dinde a la mediterraneenne',
    'poulet roti haricots verts', 'dinde petits legumes', 'dinde aux petits legumes',
    'blanquette de veau', 'parmentier de boeuf', 'hachis parmentier', 'boeuf bourguignon',
    'veau carottes', 'boeuf roti haricots verts',
]

def norm(s):
    s = s.lower().replace('œ', 'oe')
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()

def categorie(libelle):
    t = norm(libelle)
    if re.search(r'\bpaella|\bpaëlla', t): return 'ailleurs'
    if re.search(r'poisson|saumon|colin|cabillaud|de la mer|dieppoise', t): return 'mer'
    if re.search(r'\bpates\b', t): return 'pâtes'
    viande = r'jambon|lardon|boeuf|canard|dinde|poulet|porc|veau|boudin'
    if re.search(r'\boeufs?\b|souffle|fromages?\b|lentilles au cumin|riz petits legumes', t) and not re.search(viande, t):
        return 'végétarien'
    return 'terre'

def main(pdf_path, out_path):
    page = pdfplumber.open(pdf_path).pages[PAGE_CODES]
    words = page.extract_words(extra_attrs=['fontname'])
    items, section = [], None
    for ci, x in enumerate(COLS):
        hi = COLS[ci + 1] - 3 if ci + 1 < len(COLS) else 10**4
        cw = sorted((w for w in words if x - 4 <= w['x0'] < hi), key=lambda w: (round(w['top']), w['x0']))
        lines = []
        for w in cw:
            if lines and abs(lines[-1][0] - w['top']) < 2.5: lines[-1][1].append(w)
            else: lines.append([w['top'], [w]])
        section = None
        for _, l in lines:
            l.sort(key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in l)
            if all('Bold' in w['fontname'] for w in l):
                section = text
                continue
            first = l[0]['text']
            if section in SECTIONS and CODE.match(first):
                gamme, fmt, ppc, bpc, duo, sel = SECTIONS[section]
                libelle = ' '.join(w['text'] for w in l[1:])
                items.append(dict(code=first, libelle=libelle, gamme=gamme, format=fmt,
                                  portions_par_carton=ppc, categorie=categorie(libelle),
                                  pauvre_en_sel=sel, duo=duo,
                                  valeur_sure=any(v in norm(libelle) for v in VALEURS_SURES),
                                  **({'multiportion': True, 'barquettes_par_carton': bpc, 'poids_barquette_g': 1000} if bpc else {})))
            elif section in SECTIONS:
                print('ligne ignorée :', section, '|', text, file=sys.stderr)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(len(items), 'articles ->', out_path)

if __name__ == '__main__':
    main(*sys.argv[1:3])
