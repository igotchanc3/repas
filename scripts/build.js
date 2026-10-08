#!/usr/bin/env node
// Assemble index.html (page autonome) à partir de src/index.template.html, calcul.js, recettes.js et catalogue.json.
// Usage : node scripts/build.js
const fs = require('fs');
const path = require('path');
const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
const sansScriptClos = (t) => t.replace(/<\/script/gi, '<\\/script');

const html = lire('src/index.template.html')
  .replace('/*__CATALOGUE__*/', '')
  .replace('__CATALOGUE_JSON__', () => sansScriptClos(JSON.stringify(JSON.parse(lire('catalogue.json')))))
  .replace('__CALCUL_JS__', () => sansScriptClos(lire('calcul.js')))
  .replace('__RECETTES_JS__', () => sansScriptClos(lire('recettes.js')));
fs.writeFileSync(path.join(racine, 'index.html'), html);
console.log('index.html généré (' + Math.round(html.length / 1024) + ' ko)');
