// Tests d'acceptation des cartes 11/12, des PM et des garde-fous.
// Usage : node tests/accept.cjs <fichier.html>
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chargerJeu, lireCodeJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ19.html";
const CHEMIN = path.isAbsolute(FICHIER) ? FICHIER : path.join(__dirname, "..", FICHIER);
const HTML = fs.readFileSync(CHEMIN, "utf8");
const CODE = lireCodeJeu(FICHIER);
const MAINTENANT = 1700000000000;

function jeuNeuf() {
  return chargerJeu(FICHIER, { maintenant: MAINTENANT });
}

test("12 cartes et 123 objets pétales", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("fleurs.length"), 12);
  assert.equal(jeu.lire("petales.length"), 123);
});

test("capacités de pétales 10 / 11 / 12 par emplacement", () => {
  const jeu = jeuNeuf();
  const capacites = JSON.parse(JSON.stringify(jeu.lire("[capacitePetales(0), capacitePetales(9), capacitePetales(10), capacitePetales(11)]")));
  assert.deepEqual(capacites, [10, 10, 11, 12]);
  const longueurs = JSON.parse(JSON.stringify(jeu.lire("fleurs.map(function (f) { return f.petales.length; })")));
  assert.deepEqual(longueurs, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 12]);
});

test("définitions spéciales des fleurs 11 et 12", () => {
  const jeu = jeuNeuf();
  const f11 = jeu.lire("definitionEspeciale(11)");
  assert.equal(f11.nom, "Lunéa");
  assert.equal(f11.tier, 11);
  assert.equal(f11.nbPetales, 11);
  assert.equal(f11.dureeBase, 86400);
  assert.equal(f11.plancher, 300);
  // Depuis le prompt 8, les fleurs spéciales ont un prix d'achat en Verdance.
  assert.equal(f11.prix, 1e10);
  assert.equal(f11.prixPremierPetale, Math.round(1e10 * 1.2));

  const f12 = jeu.lire("definitionEspeciale(12)");
  assert.equal(f12.nom, "Clématite");
  assert.equal(f12.tier, 12);
  assert.equal(f12.nbPetales, 12);
  assert.equal(f12.dureeBase, 172800);
  assert.equal(f12.plancher, 600);
  assert.equal(f12.prix, 1e11);
  assert.equal(f12.prixPremierPetale, Math.round(1e11 * 1.2));
});

test("planter accepte 11 pétales en emplacement 10, refuse 12", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("deverrouillerEmplacement(10)"), true);
  assert.equal(jeu.lire("planter(10, definitionEspeciale(11))"), true);
  assert.equal(jeu.lire("fleurs[10].nbPetales"), 11);

  assert.equal(jeu.lire("deverrouillerEmplacement(11)"), true);
  const douze = jeu.lire("Object.assign({}, definitionEspeciale(12), { nbPetales: 12 })");
  assert.equal(jeu.lire("planter(10, " + JSON.stringify(douze) + ")"), false);
  assert.equal(jeu.lire("planter(11, " + JSON.stringify(douze) + ")"), true);
  assert.equal(jeu.lire("fleurs[11].nbPetales"), 12);
});

test("une carte de 10 pétales refuse 11 pétales", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("fleurs[1].etat = 'vide';");
  const onze = jeu.lire("Object.assign({}, definitionEspeciale(11), { nbPetales: 11 })");
  assert.equal(jeu.lire("planter(1, " + JSON.stringify(onze) + ")"), false);
});

test("sauvegarde puis rechargement d'une plante à 12 pétales en emplacement 11", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("deverrouillerEmplacement(11); planter(11, definitionEspeciale(12)); sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  assert.equal(sauvegarde.emplacements[11].nbPetales, 12);

  const recharge = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
  assert.equal(recharge.lire("fleurs[11].etat"), "plante");
  assert.equal(recharge.lire("fleurs[11].nbPetales"), 12);
  assert.equal(recharge.lire("fleurs[11].petales.length"), 12);
  assert.equal(recharge.lire("fleurs[11].petales.filter(function (p) { return p.existe; }).length"), 12);
  assert.equal(recharge.lire("petales.length"), 123);
});

test("plancher de durée : champ explicite, retombée sur tier × 5", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("definitionEspece(3).plancher"), 15);
  assert.equal(jeu.lire("plancherDuree({ tier: 3, plancher: 300 })"), 300);
  assert.equal(jeu.lire("plancherDuree({ tier: 7, plancher: 600 })"), 600);
  assert.equal(jeu.lire("plancherDuree({ tier: 7 })"), 35);

  const sansPlancher = {
    version: 6,
    horodatage: MAINTENANT,
    emplacements: [
      { slot: 0, etat: "plante", tier: 1, nom: "Arum", nbPetales: 1, dureeBase: 10,
        prix: 0, prixPremierPetale: 2, hybride: false, parents: null,
        progression: 0, petalesAchetes: 0, completions: 0, cycle: 0, niveauVitesse: 0, petales: [] }
    ]
  };
  const recharge = chargerJeu(FICHIER, { sauvegarde: sansPlancher, maintenant: MAINTENANT });
  assert.equal(recharge.lire("fleurs[0].plancher"), 5);
  assert.equal(recharge.lire("plancherDuree(fleurs[0])"), 5);
});

test("PM : ajouterPM et depenserPM refusent les valeurs invalides", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("ajouterPM(-1)"), false);
  assert.equal(jeu.lire("ajouterPM(NaN)"), false);
  assert.equal(jeu.lire("ajouterPM(Infinity)"), false);
  assert.equal(jeu.lire("pm"), 0);
  assert.equal(jeu.lire("ajouterPM(5)"), true);
  assert.equal(jeu.lire("pm"), 5);
  assert.equal(jeu.lire("depenserPM(6)"), false);
  assert.equal(jeu.lire("pm"), 5);
  assert.equal(jeu.lire("depenserPM(0)"), false);
  assert.equal(jeu.lire("depenserPM(NaN)"), false);
  assert.equal(jeu.lire("depenserPM(5)"), true);
  assert.equal(jeu.lire("pm"), 0);
});

test("PM : l'affichage du haut et du laboratoire est rafraîchi", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("ajouterPM(1234)");
  assert.equal(jeu.lire("document.getElementById('pmAff').textContent"), jeu.lire("formaterNombre(pm)"));
  assert.equal(jeu.lire("document.getElementById('pmBarre').textContent"), jeu.lire("formaterNombre(pm)"));
  assert.match(HTML, /id="pmBarre"/);
  assert.match(CODE, /pm:\s*"🧬"/);
});

test("PM : une sauvegarde invalide se recharge à 0", () => {
  for (const valeur of [-5, "abc", null, NaN]) {
    const sauvegarde = { version: 6, horodatage: MAINTENANT, pm: valeur };
    const jeu = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
    assert.equal(jeu.lire("pm"), 0, "pm devrait valoir 0 pour " + String(valeur));
  }
});

test("PM : affichercompost ne casse pas le formatage du laboratoire", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("ajouterPM(1234); affichercompost();");
  assert.equal(jeu.lire("document.getElementById('pmAff').textContent"), jeu.lire("formaterNombre(pm)"));
  assert.equal(jeu.lire("document.getElementById('pmBarre').textContent"), jeu.lire("formaterNombre(pm)"));
});

test("aucune création DOM après le démarrage", () => {
  const jeu = jeuNeuf();
  const avant = jeu.elementsCrees();
  jeu.evaluer("deverrouillerEmplacement(10); planter(10, definitionEspeciale(11));");
  jeu.evaluer("for (let i = 0; i < 50; i++) tourDeJeu();");
  jeu.evaluer("viderEmplacement(10); sauvegarder();");
  assert.equal(jeu.elementsCrees(), avant);
});

test("CROISSANCE_VITESSE a disparu du fichier", () => {
  assert.equal(CODE.includes("CROISSANCE_VITESSE "), false);
  assert.equal(CODE.includes("const CROISSANCE_VITESSE ="), false);
});
