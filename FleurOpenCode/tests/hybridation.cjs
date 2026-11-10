// Tests d'hybridation (prompt 5) : état v7, champs propres, chaîne d'achat,
// déroulement d'une fusion de bout en bout, sauvegarde au milieu d'une fusion.
// Usage : node tests/hybridation.cjs <fichier.html>
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

// Rend l'emplacement `slot` accessible (achat séquentiel pour les slots 0..9,
// déverrouillage pour les slots 10/11), puis le vide s'il est planté.
function deverrouiller(jeu, slot) {
  jeu.evaluer("verdance = 1e12;");
  if (jeu.lire("fleurs[" + slot + "].etat") !== "verrouille") return;
  if (jeu.lire("fleurs[" + slot + "].tier === null")) {
    jeu.evaluer("deverrouillerEmplacement(" + slot + ");");
    return;
  }
  // Les emplacements 1..10 s'achètent dans l'ordre : on plante la chaîne
  // précédente si nécessaire, puis la cible.
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

// Plante l'espèce du tier demandé en emplacement `slot` et la rend complète
// (tous les pétales achetés ; la vitesse est poussée sous le plancher).
function planteComplete(jeu, slot, tier) {
  jeu.evaluer("verdance = 1e12;");
  deverrouiller(jeu, slot);
  if (jeu.lire("fleurs[" + slot + "].tier") !== tier) {
    emplacementLibre(jeu, slot);
    if (tier === 11 || tier === 12) {
      jeu.evaluer("planter(" + slot + ", definitionEspeciale(" + tier + "));");
    } else {
      jeu.evaluer("planter(" + slot + ", definitionEspece(" + tier + "));");
    }
  }
  completer(jeu, slot);
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

// Prépare deux plantes complètes de tiers 2 et 3 aux emplacements 1 et 2.
function preparerDeux(jeu) {
  planteComplete(jeu, 1, 2);
  planteComplete(jeu, 2, 3);
  jeu.evaluer("verdance = 1e12; mettreAJourBoutons();");
}

test("état de sauvegarde : nbHybridations, graines, hybridationEnCours sauvegardés et rechargés", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  // v7 = hybridation ; v8 = replantation ; v9 = seuils de pétales.
  assert.equal(sauvegarde.version, 9);
  assert.equal(sauvegarde.nbHybridations, 0);
  assert.deepEqual(sauvegarde.graines, []);
  assert.equal(sauvegarde.hybridationEnCours, null);

  const recharge = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
  assert.equal(recharge.lire("nbHybridations"), 0);
  assert.equal(recharge.lire("graines.length"), 0);
  assert.equal(recharge.lire("hybridationEnCours"), null);
});

test("chaîne d'achat : la visibilité dépend de dejaPlante, pas de l'état courant", () => {
  const jeu = jeuNeuf();
  // Partie neuve : l'emplacement 5 (slot 4) est verrouillé et la case précédente
  // n'a jamais été plantée (slot 3 toujours verrouillé) -> pas achetable.
  assert.equal(jeu.lire("fleurs[3].etat"), "verrouille");
  assert.equal(jeu.lire("boutonFleurAchetable(fleurs[4])"), false);

  // La case 4 (slot 3) reçoit une plante, puis la case 3 (slot 2) est vidée :
  // la case 5 reste achetable même si la case 3 est vide.
  planteComplete(jeu, 2, 3);
  planteComplete(jeu, 3, 4);
  jeu.evaluer("viderEmplacement(2); mettreAJourBoutons();");
  assert.equal(jeu.lire("fleurs[2].etat"), "vide");
  assert.equal(jeu.lire("fleurs[2].dejaPlante"), true);
  assert.equal(jeu.lire("boutonFleurAchetable(fleurs[4])"), true);
});

test("champ dejaPlante : posé à la première plantation, jamais retiré", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("fleurs[0].dejaPlante"), true, "fleur 1 plantée au départ");
  assert.equal(jeu.lire("fleurs[1].dejaPlante"), false);
  planteComplete(jeu, 1, 2);
  assert.equal(jeu.lire("fleurs[1].dejaPlante"), true);
  jeu.evaluer("viderEmplacement(1);");
  assert.equal(jeu.lire("fleurs[1].dejaPlante"), true, "ne repasse jamais à false");
});

test("migration v6 -> v7 sans perte, puis v7 -> v7 identique", () => {
  const v6 = {
    version: 6,
    horodatage: MAINTENANT,
    verdance: 500,
    petalesBlancs: 7,
    cyclesFinis: 9,
    tempsJeu: 1234,
    pm: 12,
    compostDeverrouille: true,
    emplacements: [
      { slot: 0, etat: "plante", tier: 1, nom: "Arum", nbPetales: 1, dureeBase: 10, plancher: 5,
        prix: 0, prixPremierPetale: 2, hybride: false, parents: null,
        progression: 25, petalesAchetes: 1, completions: 0, cycle: 1, niveauVitesse: 3,
        petales: [{ progression: 40, achete: true, teinte: "#froce" }] },
      { slot: 1, etat: "verrouille" }
    ]
  };
  const jeu = chargerJeu(FICHIER, { sauvegarde: v6, maintenant: MAINTENANT });
  jeu.evaluer("sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  // v6 -> v9 : v7 l'hybridation, v8 la replantation, v9 les seuils de pétales.
  assert.equal(sauvegarde.version, 9);
  assert.equal(sauvegarde.nbHybridations, 0);
  assert.deepEqual(sauvegarde.graines, []);
  assert.equal(sauvegarde.hybridationEnCours, null);
  // État joueur intact.
  assert.equal(jeu.lire("verdance"), 500);
  assert.equal(jeu.lire("pm"), 12);
  assert.equal(jeu.lire("cyclesFinis"), 9);
  assert.equal(jeu.lire("fleurs[0].cycle"), 1);
  assert.equal(jeu.lire("fleurs[0].niveauVitesse"), 3);
  assert.equal(jeu.lire("fleurs[0].dejaPlante"), true);
  assert.equal(jeu.lire("fleurs[1].dejaPlante"), false);

  // v8 -> v8 : la même sauvegarde se recharge sans aucun changement.
  const auRecharge = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
  assert.deepEqual(auRecharge.sauvegarde(), sauvegarde);
});

const DEFINITION_TEST = "{ tier: 4, nom: 'Souffle', nbPetales: 2,"
  + " dureeBase: 60, plancher: 20, prix: 0, prixPremierPetale: 2, hybride: false, parents: null,"
  + " generation: 2, gainCycle: 7, bonusComplet: 2, partColoreeMax: 3 }";

test("champ gainCycle : crédit et textes du cycle utilisent la valeur propre", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 4);
  jeu.evaluer("planter(4, " + DEFINITION_TEST + ");");
  assert.equal(jeu.lire("fleurs[4].gainCycle"), 7);
  // Gain par cycle : +7 (pas +4).
  jeu.evaluer("verdance = 1e6; fleurs[4].completions = seuil(fleurs[4].cycle);");
  jeu.evaluer("fleurs[4].boutonCycle.click();");
  assert.equal(jeu.lire("cyclesFinis"), 7);
  assert.equal(jeu.lire("fleurs[4].cycle"), 1);
  assert.match(jeu.lire("fleurs[4].gainCycleTexte.textContent"), /\+7/);
  assert.match(jeu.lire("fleurs[4].boutonCycle.textContent"), /\+7/);
});

test("champ bonusComplet : bonusFleur et textes « Gain × » utilisent la valeur propre", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 4);
  jeu.evaluer("planter(4, " + DEFINITION_TEST + ");");
  completer(jeu, 4);
  assert.equal(jeu.lire("bonusFleur(fleurs[4])"), 2);
  jeu.evaluer("rafraichirCarte(fleurs[4]);");
  assert.equal(jeu.lire("fleurs[4].gainBonus.textContent"), "Gain ×2.0");
});

test("champ partColoreeMax : poidsTirage et panneau Sol plafonnent au champ", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 4);
  jeu.evaluer("planter(4, " + DEFINITION_TEST + ");");
  // Cycle 0 = semis : le sol n'est pas prêt et aucune couleur ne sort. On passe
  // la fleur en jeune pour tester réellement le plafond de part colorée.
  jeu.evaluer("fleurs[4].cycle = 1;");
  // tier 4 -> plafond de base 20 % ; avec enrichissement 10 et partColoreeMax 3 -> 3 %.
  jeu.evaluer("enrichissement = 10;");
  const blanc = jeu.lire("poidsTirage(fleurs[4])[0]");
  assert.ok(Math.abs(blanc - (1 - 0.03)) < 1e-12, "poids du blanc : " + blanc);
  // Une couleur doit être débloquée pour que la part colorée soit non nulle.
  jeu.evaluer("arbreAmeliorations.niveaux.c1 = 1;");
  const part = jeu.lire("(function () { var s = 0; var p = poidsTirage(fleurs[4]); for (var i = 1; i < p.length; i++) s += p[i]; return s; })()");
  assert.ok(Math.abs(part - 0.03) < 1e-12, "part colorée totale : " + part);

  // Le panneau Sol affiche ce plafond.
  jeu.evaluer("fleurSolOuverte = fleurs[4]; rafraichirPanneauSol();");
  assert.match(jeu.lire("document.getElementById('solResume').textContent"), /plafond 3 %/);
});

test("plante classique inchangée : gainCycle, bonusComplet, partColoreeMax null", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("fleurs[0].gainCycle"), null);
  assert.equal(jeu.lire("fleurs[0].bonusComplet"), null);
  assert.equal(jeu.lire("fleurs[0].partColoreeMax"), null);
  assert.equal(jeu.lire("fleurs[0].generation"), 0);
  // Comportement historique : +1 par cycle, bonus de tier 1.
  jeu.evaluer("fleurs[0].petalesAchetes = 1; for (const p of fleurs[0].petales) if (p.existe) p.achete = true;");
  assert.equal(jeu.lire("bonusFleur(fleurs[0])"), valeurBonusAttendu(1));
});

function valeurBonusAttendu(tier) {
  // formule locale : 1 + 0,2 × somme Fibonacci(1..tier)
  let somme = 0; let a = 1; let b = 1;
  for (let i = 0; i < tier; i++) { somme += a; const t = a + b; a = b; b = t; }
  return 1 + 0.2 * somme;
}

test("productionVerdanceParSeconde : somme des gains rapportés à la durée", () => {
  const jeu = jeuNeuf();
  planteComplete(jeu, 1, 2);
  const prod = jeu.lire("productionVerdanceParSeconde(fleurs)");
  const attendu = jeu.lire("gainDeBase * multiplicateur")
    * (jeu.lire("bonusFleur(fleurs[0])") / dureeAttendue(jeu, "fleurs[0]")
      + jeu.lire("bonusFleur(fleurs[1])") / dureeAttendue(jeu, "fleurs[1]"));
  assert.ok(Math.abs(prod - attendu) < 1e-9, prod + " ≠ " + attendu);
});

function dureeAttendue(jeu, expr) {
  return jeu.lire("dureeActuelle(" + expr + ")");
}

test("fusion de bout en bout : graine, PM, coût, cases vidées", () => {
  const jeu = jeuNeuf();
  preparerDeux(jeu);
  const avant = jeu.lire("verdance");
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['rapidite', 'vigueur'])"), true);
  // Coût payé immédiatement, les deux parents retirés.
  const cout = jeu.lire("coutHybridation(3, 1, nbHybridations)");
  assert.equal(jeu.lire("verdance"), avant - cout);
  assert.equal(jeu.lire("fleurs[1].etat"), "vide");
  assert.equal(jeu.lire("fleurs[2].etat"), "vide");
  assert.equal(jeu.lire("hybridationEnCours.tempsRestant"), 20);
  assert.equal(jeu.lire("hybridationEnCours.slotA"), 1);
  assert.equal(jeu.lire("hybridationEnCours.slotB"), 2);
  assert.equal(jeu.lire("pm"), 0, "les PM ne sont crédités qu'à la fin");
  // Le compost reste débloqué après le retrait des parents.
  assert.equal(jeu.lire("compostDeverrouille"), true);

  // 20 s de jeu à raison de 0,1 s par tour : 200 tours.
  jeu.evaluer("for (let i = 0; i < 200; i++) tourDeJeu();");
  assert.equal(jeu.lire("hybridationEnCours"), null);
  assert.equal(jeu.lire("graines.length"), 1);
  assert.equal(jeu.lire("nbHybridations"), 1);
  assert.equal(jeu.lire("pm"), 6, "gainPM(2, 3) = 6");
  const graine = jeu.lire("graines[0]");
  assert.ok(graine.id >= 1 || typeof graine.id === "number");
  const def = graine.definition;
  assert.equal(def.generation, 1);
  assert.equal(def.hybride, true);
  // Le tier d'un hybride est la somme des tiers des parents : 2 + 3 = 5.
  assert.equal(def.tier, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(def.parents)), [2, 3]);
  assert.equal(def.nbPetales, 2, "rapidite non choisi pour les pétales : le plus faible");
  assert.equal(def.dureeBase, dureeAttendueInitiale(jeu, 2), "rapidite retenu : durée courte");
  assert.equal(def.bonusComplet, jeu.lire("valeurBonus(3)"), "vigueur retenu : le plus élevé");
  assert.equal(jeu.lire("document.getElementById('hybResultat').textContent"), "Graine créée : " + def.nom + ", +6 PM");
});

function dureeAttendueInitiale(jeu, tier) {
  return jeu.lire("definitionEspece(" + tier + ").dureeBase");
}

test("cas refusés : incomplet, même tier, spécial, génération, verdance, en cours, choix", () => {
  const jeu = jeuNeuf();
  preparerDeux(jeu);

  // Parent incomplet.
  jeu.evaluer("fleurs[1].petalesAchetes = 0; for (const p of fleurs[1].petales) p.achete = false;");
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['rapidite', 'vigueur'])"), false);
  assert.equal(jeu.lire("hybridationEnCours"), null);
  completE(jeu, 1);

  // Même tier : deux plantes de tier 5 aux slots 4 et 5.
  planteComplete(jeu, 4, 5);
  planteComplete(jeu, 5, 5);
  assert.equal(jeu.lire("lancerHybridation(4, 5, ['rapidite', 'vigueur'])"), false);
  assert.equal(jeu.lire("hybridationEnCours"), null);

  // Fleur spéciale (tier 11) : refuse même avec un autre parent valide.
  jeu.evaluer("deverrouillerEmplacement(10); planter(10, definitionEspeciale(11));");
  completer(jeu, 10);
  assert.equal(jeu.lire("lancerHybridation(2, 10, ['rapidite', 'vigueur'])"), false);
  assert.equal(jeu.lire("hybridationEnCours"), null);

  // Génération du résultat > 3.
  jeu.evaluer("fleurs[1].generation = 3; fleurs[2].generation = 2;");
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['rapidite', 'vigueur'])"), false);
  jeu.evaluer("fleurs[1].generation = 0; fleurs[2].generation = 0;");

  // Verdance insuffisante.
  const cout = jeu.lire("coutHybridation(3, 1, nbHybridations)");
  jeu.evaluer("verdance = " + cout + " - 1;");
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['rapidite', 'vigueur'])"), false);
  assert.equal(jeu.lire("hybridationEnCours"), null);
  jeu.evaluer("verdance = 1e12;");

  // Nombre de choix ≠ 2.
  assert.equal(jeu.lire("lancerHybridation(1, 2, [])"), false);
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['vigueur'])"), false);
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['vigueur', 'rapidite', 'gainCycle'])"), false);
  assert.equal(jeu.lire("hybridationEnCours"), null);

  // Fusion déjà en cours.
  assert.equal(jeu.lire("lancerHybridation(1, 2, ['rapidite', 'vigueur'])"), true);
  assert.equal(jeu.lire("lancerHybridation(4, 5, ['vigueur', 'gainCycle'])"), false);
  assert.equal(jeu.lire("hybridationEnCours.slotA"), 1, "la première fusion reste la seule");
});

function completE(jeu, slot) { completer(jeu, slot); }

test("sauvegarde et rechargement au milieu d'une fusion", () => {
  const jeu = jeuNeuf();
  preparerDeux(jeu);
  jeu.evaluer("lancerHybridation(1, 2, ['rapidite', 'vigueur']); vitesseTemps = 1;");
  // 70 tours de 0,1 s = 7 s de jeu.
  jeu.evaluer("for (let i = 0; i < 70; i++) tourDeJeu();");
  assert.equal(jeu.lire("hybridationEnCours.tempsRestant").toFixed(6), "13.000000", "il reste 13 s après 7 s de jeu");
  jeu.evaluer("sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  assert.equal(sauvegarde.hybridationEnCours.tempsRestant.toFixed(6), "13.000000");
  assert.equal(sauvegarde.hybridationEnCours.slotA, 1);
  assert.equal(sauvegarde.graines.length, 0, "pas encore de graine au moment de la sauvegarde");

  // Rechargement immédiat : la fusion reprend où elle s'était arrêtée.
  const recharge = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
  assert.equal(recharge.lire("hybridationEnCours !== null"), true);
  assert.equal(recharge.lire("hybridationEnCours.tempsRestant").toFixed(6), "13.000000");
  assert.equal(recharge.lire("pm"), 0);
  recharge.evaluer("for (let i = 0; i < 130; i++) tourDeJeu();");
  assert.equal(recharge.lire("hybridationEnCours"), null);
  assert.equal(recharge.lire("graines.length"), 1);
  assert.equal(recharge.lire("nbHybridations"), 1);
  assert.equal(recharge.lire("pm"), 6);

  // Avec 1 h d'absence, la fusion n'avance pas hors ligne.
  const absent = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT + 3600000 });
  assert.equal(absent.lire("hybridationEnCours !== null"), true);
  assert.equal(absent.lire("hybridationEnCours.tempsRestant").toFixed(6), "13.000000");
});

test("sauvegarde v7 : champs propres d'une plante hybride conservés au rechargement", () => {
  const jeu = jeuNeuf();
  emplacementLibre(jeu, 4);
  jeu.evaluer("planter(4, " + DEFINITION_TEST + ");");
  jeu.evaluer("sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  const e = sauvegarde.emplacements[4];
  assert.equal(e.generation, 2);
  assert.equal(e.gainCycle, 7);
  assert.equal(e.bonusComplet, 2);
  assert.equal(e.partColoreeMax, 3);
  assert.equal(e.dejaPlante, true);

  const recharge = chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
  assert.equal(recharge.lire("fleurs[4].generation"), 2);
  assert.equal(recharge.lire("fleurs[4].gainCycle"), 7);
  assert.equal(recharge.lire("fleurs[4].bonusComplet"), 2);
  assert.equal(recharge.lire("fleurs[4].partColoreeMax"), 3);
  assert.equal(recharge.lire("fleurs[4].dejaPlante"), true);
});

test("interface : squelette statique présent dans le HTML", () => {
  for (const id of ["hybCarteA", "hybCarteB", "hybBoutonsA", "hybBoutonsB", "hybChoix", "hybRecap",
    "boutonHybrider", "hybBarre", "hybTempsRestant", "listeGraines", "hybCollection",
    "hybHistorique", "listeGrainesHistorique", "hybResultat",
    "hybProdAvant", "hybProdApres", "hybPMGain", "hybPlantesPerdues", "hybCout", "hybRaison"]) {
    assert.ok(HTML.includes('id="' + id + '"'), "id manquant : " + id);
  }
});

test("interface : collection de graines lisible après une fusion", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("petalesCouleurs.mauveRose = 5; rafraichirDeblocages();");
  preparerDeux(jeu);
  jeu.evaluer("lancerHybridation(1, 2, ['rapidite', 'vigueur']);");
  jeu.evaluer("for (let i = 0; i < 200; i++) tourDeJeu();");
  const liste = jeu.lire("document.getElementById('listeGraines').innerHTML");
  assert.match(liste, /hybride gen1/);
  // Colonnes « génération » puis « pétales » de la ligne de collection.
  assert.match(liste, /hybride gen1<\/b><\/td><td>1<\/td><td>2<\/td>/);
});

test("boutons A/B : sélection, désélection, exclusion croisée et disparition", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("petalesCouleurs.mauveRose = 5; rafraichirDeblocages();");
  preparerDeux(jeu);

  assert.equal(jeu.lire("slotHybA"), null);
  assert.equal(jeu.lire("cliquerFleurHybridation('A', 1)"), true);
  assert.equal(jeu.lire("slotHybA"), 1);
  assert.equal(jeu.lire("boutonsHybA[1].bouton.classList.contains('selectionnee')"), true);
  assert.equal(jeu.lire("boutonsHybA[2].bouton.classList.contains('attenuee')"), true);
  // Le même emplacement est exclu de l'autre côté.
  assert.equal(jeu.lire("boutonsHybB[1].bouton.disabled"), true);
  assert.match(jeu.lire("boutonsHybB[1].bouton.title"), /déjà choisie/);

  // Re-cliquer sur le bouton sélectionné désélectionne et rétablit les opacités.
  assert.equal(jeu.lire("cliquerFleurHybridation('A', 1)"), true);
  assert.equal(jeu.lire("slotHybA"), null);
  assert.equal(jeu.lire("boutonsHybA[1].bouton.classList.contains('selectionnee')"), false);
  assert.equal(jeu.lire("boutonsHybA[2].bouton.classList.contains('attenuee')"), false);

  // Sélection des deux côtés, puis disparition de la plante A (vidage).
  jeu.evaluer("cliquerFleurHybridation('A', 1); cliquerFleurHybridation('B', 2);");
  assert.equal(jeu.lire("slotHybA"), 1);
  assert.equal(jeu.lire("slotHybB"), 2);
  jeu.evaluer("viderEmplacement(1);");
  assert.equal(jeu.lire("slotHybA"), null, "la plante disparue vide la sélection A");
  assert.equal(jeu.lire("slotHybB"), 2, "l'autre sélection reste valide");
});

test("boutons A/B : raisons d'indisponibilité (incomplète, même tier, génération)", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("petalesCouleurs.mauveRose = 5; rafraichirDeblocages();");
  preparerDeux(jeu);
  // Fleur incomplète.
  jeu.evaluer("fleurs[2].petalesAchetes = 0; for (const p of fleurs[2].petales) p.achete = false; rafraichirCartesHybridation();");
  assert.equal(jeu.lire("boutonsHybA[2].bouton.disabled"), true);
  assert.match(jeu.lire("boutonsHybA[2].bouton.title"), /incomplète/);

  // Même tier : fleur 4 (tier 5) et fleur 5 (tier 5).
  planteComplete(jeu, 4, 5);
  planteComplete(jeu, 5, 5);
  jeu.evaluer("cliquerFleurHybridation('A', 4); rafraichirCartesHybridation();");
  assert.equal(jeu.lire("boutonsHybB[5].bouton.disabled"), true);
  assert.match(jeu.lire("boutonsHybB[5].bouton.title"), /même tier/);

  // Génération maximale.
  jeu.evaluer("fleurs[1].generation = 3; rafraichirCartesHybridation();");
  assert.equal(jeu.lire("boutonsHybA[1].bouton.disabled"), true);
  assert.match(jeu.lire("boutonsHybA[1].bouton.title"), /génération/);
});

test("collection : 5 récentes, historique complet et état ouvert conservé", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("graines = [];"
    + "for (let i = 1; i <= 8; i++) graines.push({ id: i, plantee: false, definition: {"
    + " tier: i + 2, nom: 'Hybride ' + i, nbPetales: 2, dureeBase: 60, generation: 1,"
    + " gainCycle: 2, bonusComplet: 1.5, partColoreeMax: 10 } });"
    + "rafraichirGraines();");
  const recentes = jeu.lire("document.getElementById('listeGraines').innerHTML");
  const historique = jeu.lire("document.getElementById('listeGrainesHistorique').innerHTML");
  const nb = function (html) { return (html.match(/<tr/g) || []).length; };
  assert.equal(nb(recentes), 5);
  assert.equal(nb(historique), 8);
  assert.equal(jeu.lire("document.getElementById('hybHistorique').hidden"), false);
  assert.equal(jeu.lire("document.getElementById('hybNbHistorique').textContent"), "8");
  // La plus récente (id 8) est en tête.
  assert.match(recentes, /Hybride 8/);

  // L'état ouvert du <details> survit au rafraîchissement.
  jeu.evaluer("document.getElementById('hybHistorique').open = true; rafraichirGraines();");
  assert.equal(jeu.lire("document.getElementById('hybHistorique').open"), true);

  // À 5 graines ou moins, l'historique est masqué.
  jeu.evaluer("graines = graines.slice(0, 3); rafraichirGraines();");
  assert.equal(jeu.lire("document.getElementById('hybHistorique').hidden"), true);
  assert.equal(nb(jeu.lire("document.getElementById('listeGraines').innerHTML")), 3);
});

test("prix très élevés : formaterPrix reste lisible sur les boutons de pétales", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("viderEmplacement(0);");
  const def15 = "{ tier: 15, nom: 'Géant', nbPetales: 10, dureeBase: 600,"
    + " plancher: null, prix: null, prixPremierPetale: null, hybride: true, parents: [7, 8],"
    + " generation: 2, cycle: 0, gainCycle: 15, bonusComplet: 8, partColoreeMax: 40 }";
  assert.equal(jeu.lire("planter(0, " + def15 + ")"), true);
  const dernier = jeu.lire("fleurs[0].petales[9].prix");
  assert.ok(dernier >= 1e15, "le dernier pétale dépasse 1e15 : " + dernier);
  const texte = jeu.lire("formaterPrix(" + dernier + ")");
  assert.match(texte, /^\d+(\.\d)?e\d+$/, "notation compacte : " + texte);
  assert.equal(jeu.lire("fleurs[0].petales[9].bouton.textContent"), texte);
  // Les textes de cycle et de vitesse restent des nombres lisibles.
  jeu.evaluer("verdance = 1e300; mettreAJourBoutons();");
  assert.match(jeu.lire("fleurs[0].boutonCycle.textContent"), /e\+\d+/);
  assert.match(jeu.lire("fleurs[0].boutonVitesse.textContent"), /e\+\d+/);
});

test("un hybride de tier 12 se plante et un hybride de tier 3 ne débloque pas le compost", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("viderEmplacement(0);");
  const def12 = "{ tier: 12, nom: 'Haut hybride', nbPetales: 4, dureeBase: 60,"
    + " plancher: null, prix: null, prixPremierPetale: null, hybride: true, parents: [6, 6],"
    + " generation: 1, cycle: 0, gainCycle: 4, bonusComplet: 3, partColoreeMax: 20 }";
  assert.equal(jeu.lire("planter(0, " + def12 + ")"), true, "un hybride de tier 12 n'est pas spécial");
  assert.equal(jeu.lire("fleurs[0].tier"), 12);
  // Encore aucun compost débloqué : l'hybride de tier 12 ne compte pas comme la Trille.
  assert.equal(jeu.lire("compostDebloque()"), false);

  // Un hybride de tier 3 ne débloque pas le compost et n'apparaît pas dans le texte.
  jeu.evaluer("viderEmplacement(0);");
  const def3 = "{ tier: 3, nom: 'Petit hybride', nbPetales: 2, dureeBase: 60,"
    + " plancher: null, prix: null, prixPremierPetale: null, hybride: true, parents: [1, 2],"
    + " generation: 1, cycle: 0, gainCycle: 2, bonusComplet: 1.4, partColoreeMax: 5 }";
  assert.equal(jeu.lire("planter(0, " + def3 + ")"), true);
  jeu.evaluer("for (const p of fleurs[0].petales) p.achete = true;"
    + " fleurs[0].petalesAchetes = fleurs[0].nbPetales;");
  assert.equal(jeu.lire("fleurComplete(fleurs[0])"), true);
  assert.equal(jeu.lire("compostDebloque()"), false);
  jeu.evaluer("rafraichirDeblocages();");
  assert.equal(jeu.lire("document.getElementById('verrouCompostTexte').textContent"),
    "0/3 pétales de la Trille");
});
