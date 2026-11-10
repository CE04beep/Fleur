// Sérialisation stable des instantanés de régression.
const fs = require("node:fs");

function normaliser(valeur) {
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (valeur && typeof valeur === "object") {
    const out = {};
    for (const cle of Object.keys(valeur).sort()) out[cle] = normaliser(valeur[cle]);
    return out;
  }
  return valeur;
}

function texte(valeur) {
  return JSON.stringify(normaliser(valeur), null, 2) + "\n";
}

function ecrire(fichier, valeur) {
  fs.writeFileSync(fichier, texte(valeur));
}

function lire(fichier) {
  return fs.readFileSync(fichier, "utf8");
}

module.exports = { normaliser, texte, ecrire, lire };
