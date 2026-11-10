// Tests de replantation et collection de graines.
// Depuis FleurJ20 : la replantation se fait uniquement avec des graines
// (1 graine + 50 × tier de compost pour une espèce, 1 graine hybride +
// 5 × tier de compost mature pour un hybride). Plus aucune dépense de
// Verdance ni de PM.
// Usage : node tests/replantation.cjs <fichier.html>
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chargerJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ20.html";
const CHEMIN = path.isAbsolute(FICHIER) ? FICHIER : path.join(__dirname, "..", FICHIER);
const HTML = fs.readFileSync(CHEMIN, "utf8");
const MAINTENANT = 1700000000000;

function jeuNeuf(options) {
  return chargerJeu(FICHIER, Object.assign({ maintenant: MAINTENANT }, options));
}

// Graine de test : hybride tier 4, génération 2, 2 pétales.
const GRAINE_TEST = "{ id: 9, definition: { tier: 4, nom: 'Hybride test', nbPetales: 2,"
  + " dureeBase: 60, plancher: null, prix: null, prixPremierPetale: null, hybride: true,"
  + " parents: [2, 3], generation: 2, cycle: 5, niveauVitesse: 0, petalesAchetes: 2,"
  + " gainCycle: 7, bonusComplet: 2.5, partColoreeMax: 25 } }";

// Débloque un emplacement en achetant la chaîne précédente si besoin.
function deverrouiller(jeu, slot) {
  jeu.evaluer("verdance = 1e12;");
  if (jeu.lire("fleurs[" + slot + "].etat") !== "verrouille") return;
  if (jeu.lire("fleurs[" + slot + "].tier === null")) {
    jeu.evaluer("deverrouillerEmplacement(" + slot + ");");
    return;
  }
  for (let i = 0; i <= slot; i++) {
    if (jeu.lire("fleurs[" + i + "].etat") === "verrouille") {
      jeu.evaluer("acheterFleur(fleurs[" + i + "]); mettreAJourBoutons();");
    }
  }
}

function emplacementLibre(jeu, slot) {
  deverrouiller(jeu, slot);
  if (jeu.lire("fleurs[" + slot + "].etat") === "plante") {
    jeu.evaluer("viderEmplacement(" + slot + ");");
  }
  assert.equal(jeu.lire("fleurs[" + slot + "].etat"), "vide",
    "l'emplacement " + slot + " doit être libre");
}

function completer(jeu, slot) {
  jeu.evaluer(
    "var f = fleurs[" + slot + "];"
    + "f.niveauVitesse = 60;"
    + "f.petalesAchetes = f.nbPetales;"
    + "for (const p of f.petales) { if (p.existe) p.achete = true; }"
  );
  assert.equal(jeu.lire("fleurComplete(fleurs[" + slot + "])"), true,
    "la plante " + slot + " doit être complète après préparation");
}

function planteComplete(jeu, slot, tier) {
  jeu.evaluer("verdance = 1e12;");
  deverrouiller(jeu, slot);
  if (jeu.lire("fleurs[" + slot + "].tier") !== tier) {
    emplacementLibre(jeu, slot);
    jeu.evaluer("planter(" + slot + ", definitionEspece(" + tier + "));");
  }
  completer(jeu, slot);
}

test("replanter une basique coûte 1 graine + 50 × tier de compost, sans Verdance", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);   // la fleur 2 (tier 2) a déjà été plantée une fois
  jeu.evaluer("verdance = 1000; compost = 200; pm = 0;"
    + " sacGraines[2] = { graines: 2, fragments: 0 };");

  assert.equal(jeu.lire("prixCompostReplantation(2)"), 100);
  assert.equal(jeu.lire("planterBasique(1, 2)"), true);

  assert.equal(jeu.lire("fleurs[1].etat"), "plante");
  assert.equal(jeu.lire("fleurs[1].tier"), 2);
  assert.equal(jeu.lire("fleurs[1].graineId"), null);
  // Plus aucune dépense de Verdance, une graine et 100 de compost consommés.
  assert.equal(jeu.lire("verdance"), 1000);
  assert.equal(jeu.lire("compost"), 100);
  assert.equal(jeu.lire("graineEspece(2)"), 1);
  assert.equal(jeu.lire("nbReplantations[2]"), 1);
  // Le compteur ne change plus le prix.
  assert.equal(jeu.lire("prixCompostReplantation(2)"), 100);
});

test("planter une graine hybride : compost mature, 0 pétale acheté, prix non nul", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);
  jeu.evaluer("graines = [" + GRAINE_TEST + "]; verdance = 0; compost = 1000;"
    + " compostMature = 20; pm = 100;");

  assert.equal(jeu.lire("prixCompostMatureGraineHybride(4)"), 20);
  assert.equal(jeu.lire("planterGraine(1, 9)"), true);

  assert.equal(jeu.lire("fleurs[1].etat"), "plante");
  assert.equal(jeu.lire("fleurs[1].nom"), "Hybride test");
  assert.equal(jeu.lire("fleurs[1].graineId"), 9);
  // Une graine hybride arrive sans pétale acheté et sans vitesse.
  assert.equal(jeu.lire("fleurComplete(fleurs[1])"), false);
  assert.equal(jeu.lire("fleurs[1].petalesAchetes"), 0);
  assert.equal(jeu.lire("fleurs[1].niveauVitesse"), 0);
  assert.equal(jeu.lire("fleurs[1].progression"), 0);
  assert.equal(jeu.lire("fleurs[1].cycle"), 5);
  assert.equal(jeu.lire("fleurs[1].gainCycle"), 7);
  assert.equal(jeu.lire("fleurs[1].bonusComplet"), 2.5);
  assert.equal(jeu.lire("fleurs[1].partColoreeMax"), 25);
  // Premier pétale calculé à partir du tier (1,2 × 10 × 10^(tier−2)).
  assert.equal(jeu.lire("fleurs[1].prixPremierPetale"), jeu.lire("prixPremierPetaleHybride(4)"));
  assert.equal(jeu.lire("fleurs[1].prixPremierPetale"), 1200);
  assert.equal(jeu.lire("fleurs[1].petales[0].prix"), 1200);
  // Compost mature consommé ; compost normal, PM et Verdance inchangés.
  assert.equal(jeu.lire("compostMature"), 0);
  assert.equal(jeu.lire("compost"), 1000);
  assert.equal(jeu.lire("pm"), 100);
  assert.equal(jeu.lire("verdance"), 0);
  assert.equal(jeu.lire("graines.length"), 1, "la graine n'est pas consommée");
  assert.equal(jeu.lire("graines[0].id"), 9);
  assert.equal(jeu.lire("graines[0].plantee"), true);
});

test("refus sans rien modifier si une ressource manque", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);
  jeu.evaluer("graines = [" + GRAINE_TEST + "];");

  // Basique : graine manquante.
  jeu.evaluer("verdance = 0; compost = 1000; pm = 100; sacGraines[2] = { graines: 0, fragments: 0 };");
  assert.equal(jeu.lire("planterBasique(1, 2)"), false);
  assert.equal(jeu.lire("fleurs[1].etat"), "vide");
  assert.equal(jeu.lire("compost"), 1000);
  assert.equal(jeu.lire("nbReplantations[2]"), 0);

  // Basique : compost insuffisant (graine présente).
  jeu.evaluer("sacGraines[2] = { graines: 1, fragments: 0 }; compost = 99;");
  assert.equal(jeu.lire("planterBasique(1, 2)"), false);
  assert.equal(jeu.lire("fleurs[1].etat"), "vide");
  assert.equal(jeu.lire("graineEspece(2)"), 1);
  assert.equal(jeu.lire("nbReplantations[2]"), 0);

  // Graine hybride : compost mature insuffisant.
  jeu.evaluer("compostMature = 19; pm = 100;");
  assert.equal(jeu.lire("planterGraine(1, 9)"), false);
  assert.equal(jeu.lire("fleurs[1].etat"), "vide");
  assert.equal(jeu.lire("compostMature"), 19);
  assert.equal(jeu.lire("graines.length"), 1);
});

test("un joueur sans aucun PM ni Verdance peut replanter avec ses graines", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);
  jeu.evaluer("verdance = 0; compost = 100; pm = 0;"
    + " sacGraines[2] = { graines: 1, fragments: 0 };");
  assert.equal(jeu.lire("planterBasique(1, 2)"), true);
  assert.equal(jeu.lire("pm"), 0);
  assert.equal(jeu.lire("verdance"), 0);
  assert.equal(jeu.lire("fleurs[1].etat"), "plante");
});

test("aucune offre pour les emplacements 10 et 11, ni pour une espèce jamais possédée", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);
  jeu.evaluer("graines = [" + GRAINE_TEST + "];");

  const offres = JSON.parse(JSON.stringify(jeu.lire("offresReplantation(1)")));
  const tiers = offres.filter(function (o) { return o.type === "basique"; })
    .map(function (o) { return o.tier; });
  assert.deepEqual(tiers, [1, 2], "seules les espèces déjà plantées sont proposées");
  const hybride = offres.find(function (o) { return o.type === "graine" && o.graineId === 9; });
  assert.ok(hybride);
  assert.equal(hybride.prixCompostMature, 20);
  assert.equal(hybride.prixCompost, 0);

  assert.equal(jeu.lire("offresReplantation(10).length"), 0);
  assert.equal(jeu.lire("offresReplantation(11).length"), 0);
  assert.equal(jeu.lire("offresReplantation(0).length"), 0, "un emplacement planté n'ouvre pas le sélecteur");
});

test("cycle fusion -> graine -> replantation -> fusion de génération 2", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("verdance = 1e12; compost = 10000; compostMature = 1000; pm = 1000;");
  planteComplete(jeu, 1, 2);
  planteComplete(jeu, 2, 3);

  jeu.evaluer("lancerHybridation(1, 2, ['rapidite', 'vigueur']);"
    + "for (let i = 0; i < 200; i++) tourDeJeu();");
  assert.equal(jeu.lire("graines.length"), 1);
  const idGraine = jeu.lire("graines[0].id");

  assert.equal(jeu.lire("planterGraine(1, " + idGraine + ")"), true);
  assert.equal(jeu.lire("fleurs[1].graineId"), idGraine);
  assert.equal(jeu.lire("fleurs[1].generation"), 1);
  assert.equal(jeu.lire("fleurComplete(fleurs[1])"), false, "les pétales sont à racheter");
  completer(jeu, 1);

  // Le premier hybride redevient parent, avec une espèce complète de tier 4.
  planteComplete(jeu, 3, 4);
  assert.equal(jeu.lire("lancerHybridation(1, 3, ['rapidite', 'vigueur'])"), true);
  assert.equal(jeu.lire("hybridationEnCours.resultat.generation"), 2);
  jeu.evaluer("for (let i = 0; i < 200; i++) tourDeJeu();");
  assert.equal(jeu.lire("graines.length"), 2);
  assert.equal(jeu.lire("graines[1].definition.generation"), 2);
  // Le tier de la seconde graine est la somme des tiers : (2 + 3) + 4 = 9.
  assert.equal(jeu.lire("graines[1].definition.tier"), 9);
});

test("sauvegarde et rechargement : nbReplantations, graine plantée et hybride intacts", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 1);
  jeu.evaluer("graines = [" + GRAINE_TEST + "]; verdance = 1e12; compost = 1000;"
    + " compostMature = 20; pm = 100;");
  assert.equal(jeu.lire("planterGraine(1, 9)"), true);
  jeu.evaluer("nbReplantations[2] = 3; sauvegarder();");

  const sauvegarde = jeu.sauvegarde();
  // v7 = hybridation ; v8 = replantation ; v9 = seuils de pétales.
  assert.equal(sauvegarde.version, 9, "version courante de sauvegarde");
  assert.equal(sauvegarde.nbReplantations[2], 3);
  assert.equal(sauvegarde.emplacements[1].graineId, 9);

  const recharge = jeuNeuf({ sauvegarde: sauvegarde });
  assert.equal(recharge.lire("nbReplantations[2]"), 3);
  assert.equal(recharge.lire("fleurs[1].graineId"), 9);
  assert.equal(recharge.lire("fleurs[1].nom"), "Hybride test");
  assert.equal(recharge.lire("fleurComplete(fleurs[1])"), false);
  assert.equal(recharge.lire("graines.length"), 1);
  assert.equal(recharge.lire("graines[0].plantee"), true);

  // Une ancienne sauvegarde sans nbReplantations ni graineId se charge à zéro / null.
  const ancienne = JSON.parse(JSON.stringify(sauvegarde));
  delete ancienne.nbReplantations;
  delete ancienne.emplacements[1].graineId;
  const ancienJeu = jeuNeuf({ sauvegarde: ancienne });
  assert.equal(ancienJeu.lire("nbReplantations[2]"), 0);
  assert.equal(ancienJeu.lire("fleurs[1].graineId"), null);
});

test("interface : sélecteur statique, offres groupées et raisons, compteur de plantations", () => {
  const jeu = jeuNeuf();
  assert.ok(HTML.includes('id="replantation"'), "le panneau statique doit exister");
  emplacementLibre(jeu, 1);
  jeu.evaluer("graines = [" + GRAINE_TEST + "]; verdance = 0; compost = 0;"
    + " compostMature = 0; pm = 0;");

  const offres = JSON.parse(JSON.stringify(jeu.lire("offresReplantation(1)")));
  assert.ok(offres.length >= 2);
  assert.ok(offres.every(function (o) { return o.actif === false && o.raison.length > 0; }),
    "sans ressource, toutes les offres sont grisées avec une raison");
  const basique = offres.find(function (o) { return o.type === "basique" && o.tier === 2; });
  assert.match(basique.raison, /Graine manquante/);
  const hybride = offres.find(function (o) { return o.type === "graine" && o.graineId === 9; });
  assert.match(hybride.raison, /Compost mature insuffisant/);

  jeu.evaluer("ouvrirReplantation(1);");
  assert.equal(jeu.lire("document.getElementById('replantation').hidden"), false);
  const html = jeu.lire("document.getElementById('replantationOffres').innerHTML");
  assert.ok(html.includes("Plantes basiques"));
  assert.ok(html.includes("Graines"));
  assert.ok(html.includes("1 graine"));
  assert.ok(html.includes("compost mature"));
  assert.ok(/Graine manquante|Compost insuffisant|Compost mature insuffisant/.test(html));
  const ressources = jeu.lire("document.getElementById('replantationRessources').textContent");
  assert.match(ressources, /Compost :/);
  assert.match(ressources, /Compost mature :/);
  assert.doesNotMatch(ressources, /Verdance|PM/);
  jeu.evaluer("fermerReplantation();");
  assert.equal(jeu.lire("document.getElementById('replantation').hidden"), true);

  // Après une plantation de graine, la collection indique la plantation en cours.
  jeu.evaluer("compostMature = 20; planterGraine(1, 9); rafraichirGraines();");
  assert.match(jeu.lire("document.getElementById('listeGraines').innerHTML"), /Plantée \(en pousse\)/);
});
