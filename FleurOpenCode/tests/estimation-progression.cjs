// Estimation de progression des fleurs spéciales (prompt 8).
// Affiche, pour Lunéa et Clématite, le nombre de niveaux de vitesse jusqu'au
// plancher et le prix cumulé en Verdance. Sert à juger l'équilibrage.
// Usage : node tests/estimation-progression.cjs [fichier.html]
const path = require("node:path");
const { chargerJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ19.html";
const jeu = chargerJeu(FICHIER, { maintenant: 1700000000000 });

console.log("Estimation de progression — fleurs spéciales\n");

for (const tier of [11, 12]) {
  const p = jeu.lire("PARAMETRES_SPECIAUX[" + tier + "]");
  const def = jeu.lire("definitionEspeciale(" + tier + ")");
  const f = "{ tier: " + tier + ", cycle: 0 }";

  // Nombre de niveaux achetables avant que la durée ne soit bloquée au plancher.
  const niveaux = jeu.lire(
    "(function () { var f = " + f + "; var n = 0;"
    + " while (f.dureeBase * Math.pow(FACTEUR_VITESSE, n) > plancherDuree(f)) n++;"
    + " return n; })()"
  );

  let coutVitesse = 0;
  for (let n = 0; n < niveaux; n++) {
    coutVitesse += jeu.lire("prixVitesseFleur(" + f + ", " + n + ")");
  }

  const coutPetales = jeu.lire(
    "(function () { var total = 0; var f = " + f + ";"
    + " for (var i = 0; i < f.nbPetales; i++) total += Math.round(f.prixPremierPetale * Math.pow(PROGRESSION_PETALE, i));"
    + " return total; })()"
  );

  console.log(def.nom + " (tier " + tier + ", emplacement " + (p.slot + 1) + ")");
  console.log("  achat              : " + jeu.lire("formaterNombre(" + p.prix + ")") + " Verdance");
  console.log("  premier pétale     : " + jeu.lire("formaterNombre(" + def.prixPremierPetale + ")") + " Verdance");
  console.log("  " + niveaux + " niveaux de vitesse jusqu'au plancher " + def.plancher + " s");
  console.log("  coût cumulé vitesse: " + jeu.lire("formaterNombre(" + coutVitesse + ")") + " Verdance");
  console.log("  coût des " + def.nbPetales + " pétales : " + jeu.lire("formaterNombre(" + coutPetales + ")") + " Verdance");
  console.log("");
}
