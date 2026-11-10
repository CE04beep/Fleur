// Tests des fleurs spéciales 11 et 12 (prompt 8) : achat dans le laboratoire,
// formules de prix, plancher de vitesse, hybridation interdite, sauvegarde et UI.
// Usage : node tests/speciales.cjs <fichier.html>
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chargerJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ19.html";
const CHEMIN = path.isAbsolute(FICHIER) ? FICHIER : path.join(__dirname, "..", FICHIER);
const HTML = fs.readFileSync(CHEMIN, "utf8");
const MAINTENANT = 1700000000000;

function jeuNeuf(options) {
  return chargerJeu(FICHIER, Object.assign({ maintenant: MAINTENANT }, options));
}

function debloquerLaboratoire(jeu) {
  jeu.evaluer("petalesCouleurs.mauveRose = 10; rafraichirDeblocages();");
  assert.equal(jeu.lire("laboratoireDebloque()"), true);
}

// Débloque les emplacements 10 et 11 sans dépendre du prix de l3 (déjà testé
// par la suite du prompt 7).
function debloquerEmplacementsSpeciaux(jeu) {
  jeu.evaluer("ameliorationsLabo.l3 = 2; deverrouillerEmplacement(10); deverrouillerEmplacement(11);");
  assert.equal(jeu.lire("fleurs[10].etat"), "vide");
  assert.equal(jeu.lire("fleurs[11].etat"), "vide");
}

test("paramètres : un seul objet décrit Lunéa et Clématite", () => {
  const jeu = jeuNeuf();
  assert.equal(jeu.lire("Object.keys(PARAMETRES_SPECIAUX).length"), 2);
  const lunea = JSON.parse(JSON.stringify(jeu.lire("PARAMETRES_SPECIAUX[11]")));
  const clematite = JSON.parse(JSON.stringify(jeu.lire("PARAMETRES_SPECIAUX[12]")));
  assert.equal(lunea.slot, 10);
  assert.equal(lunea.nbPetales, 11);
  assert.equal(lunea.dureeBase, 86400);
  assert.equal(lunea.plancher, 300);
  assert.equal(lunea.prix, 1e10);
  assert.equal(clematite.slot, 11);
  assert.equal(clematite.nbPetales, 12);
  assert.equal(clematite.dureeBase, 172800);
  assert.equal(clematite.plancher, 600);
  assert.equal(clematite.prix, 1e11);

  // Le premier pétale vaut 1,2 × le prix d'achat, comme les espèces classiques.
  const def11 = JSON.parse(JSON.stringify(jeu.lire("definitionEspeciale(11)")));
  const def12 = JSON.parse(JSON.stringify(jeu.lire("definitionEspeciale(12)")));
  assert.equal(def11.nom, "Lunéa");
  assert.equal(def11.prixPremierPetale, Math.round(1e10 * 1.2));
  assert.equal(def12.nom, "Clématite");
  assert.equal(def12.prixPremierPetale, Math.round(1e11 * 1.2));
});

test("achat : refusé sans emplacement / sans Verdance, accepté une seule fois", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);

  // Emplacements encore verrouillés (l3 = 0).
  jeu.evaluer("verdance = 1e12; ameliorationsLabo.l3 = 0;");
  assert.notEqual(jeu.lire("raisonAchatFleurSpeciale(11)"), null);
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), false);
  assert.equal(jeu.lire("verdance"), 1e12);
  assert.equal(jeu.lire("fleurs[10].etat"), "verrouille");

  // Emplacement libre mais pas assez de Verdance.
  debloquerEmplacementsSpeciaux(jeu);
  jeu.evaluer("verdance = 1e10 - 1;");
  assert.equal(jeu.lire("raisonAchatFleurSpeciale(11)"), "Verdance insuffisante");
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), false);
  assert.equal(jeu.lire("fleurs[10].etat"), "vide");

  // Achat accepté, débit exact, fleur plantée avec ses 11 pétales.
  jeu.evaluer("verdance = 1e12;");
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), true);
  assert.equal(jeu.lire("verdance"), 1e12 - 1e10);
  assert.equal(jeu.lire("fleurs[10].etat"), "plante");
  assert.equal(jeu.lire("fleurs[10].dejaPlante"), true);
  assert.equal(jeu.lire("fleurs[10].nbPetales"), 11);
  assert.equal(jeu.lire("fleurs[10].dureeBase"), 86400);
  assert.equal(jeu.lire("fleurs[10].plancher"), 300);
  assert.equal(jeu.lire("fleurs[10].petalesAchetes"), 0);

  // Déjà achetée : ni deuxième débit, ni écrasement.
  assert.equal(jeu.lire("raisonAchatFleurSpeciale(11)"), "déjà achetée");
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), false);
  assert.equal(jeu.lire("verdance"), 1e12 - 1e10);

  // Clématite dans son emplacement 11.
  jeu.evaluer("verdance = 1e12;");
  assert.equal(jeu.lire("acheterFleurSpeciale(12)"), true);
  assert.equal(jeu.lire("verdance"), 1e12 - 1e11);
  assert.equal(jeu.lire("fleurs[11].etat"), "plante");
  assert.equal(jeu.lire("fleurs[11].nbPetales"), 12);
  assert.equal(jeu.lire("fleurs[11].plancher"), 600);
});

test("emplacement réservé : une fleur spéciale ne se plante pas ailleurs", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);
  debloquerEmplacementsSpeciaux(jeu);
  // Lunéa (11 pétales) tiendrait dans l'emplacement 11 (capacité 12) : le
  // garde-fou doit refuser sans rien effacer.
  assert.equal(jeu.lire("planter(11, definitionEspeciale(11))"), false);
  assert.equal(jeu.lire("fleurs[11].etat"), "vide");
  assert.equal(jeu.lire("fleurs[11].tier"), null);
});

test("prix : les crochets redonnent exactement les formules des tiers 1 à 10", () => {
  const jeu = jeuNeuf();
  const remise = jeu.lire("REMISE_VITESSE");
  for (let tier = 1; tier <= 10; tier++) {
    const f = "{ tier: " + tier + ", cycle: 0 }";
    const fJeune = "{ tier: " + tier + ", cycle: 1 }";
    for (let niveau = 0; niveau <= 150; niveau++) {
      assert.equal(
        jeu.lire("prixVitesseFleur(" + f + ", " + niveau + ")"),
        jeu.lire("prixVitesse(" + tier + ", " + niveau + ")"),
        "vitesse tier " + tier + " niveau " + niveau
      );
    }
    // À l'âge Jeune, la remise existante reste appliquée.
    assert.equal(
      jeu.lire("prixVitesseFleur(" + fJeune + ", 10)"),
      jeu.lire("prixVitesse(" + tier + ", 10)") * remise
    );
    for (let cycle = 0; cycle <= 20; cycle++) {
      assert.equal(
        jeu.lire("prixCycleFleur(" + f + ", " + cycle + ")"),
        jeu.lire("prixCycle(" + tier + ", " + cycle + ")"),
        "cycle tier " + tier + " cycle " + cycle
      );
    }
  }
});

test("prix des spéciales : provisoirement la formule des tiers", () => {
  const jeu = jeuNeuf();
  for (let niveau = 0; niveau <= 150; niveau++) {
    assert.equal(
      jeu.lire("prixVitesseFleur({ tier: 11, cycle: 0 }, " + niveau + ")"),
      jeu.lire("prixVitesse(11, " + niveau + ")")
    );
    assert.equal(
      jeu.lire("prixVitesseFleur({ tier: 12, cycle: 0 }, " + niveau + ")"),
      jeu.lire("prixVitesse(12, " + niveau + ")")
    );
  }
  for (let cycle = 0; cycle <= 20; cycle++) {
    assert.equal(
      jeu.lire("prixCycleFleur({ tier: 11 }, " + cycle + ")"),
      jeu.lire("prixCycle(11, " + cycle + ")")
    );
    assert.equal(
      jeu.lire("prixCycleFleur({ tier: 12 }, " + cycle + ")"),
      jeu.lire("prixCycle(12, " + cycle + ")")
    );
  }
});

test("vitesse : le bouton Max s'arrête exactement au plancher, sans boucle", () => {
  for (const cas of [
    { tier: 11, slot: 10, plancher: 300, duree: 86400 },
    { tier: 12, slot: 11, plancher: 600, duree: 172800 }
  ]) {
    const jeu = jeuNeuf();
    debloquerLaboratoire(jeu);
    debloquerEmplacementsSpeciaux(jeu);
    jeu.evaluer("verdance = 1e15;");
    assert.equal(jeu.lire("acheterFleurSpeciale(" + cas.tier + ")"), true);

    const f = "fleurs[" + cas.slot + "]";
    const niveauMin = jeu.lire(
      "(function () { var f = " + f + "; var n = 0;"
      + " while (f.dureeBase * Math.pow(FACTEUR_VITESSE, n) > plancherDuree(f)) n++;"
      + " return n; })()"
    );
    assert.ok(niveauMin > 0 && niveauMin < 100, "niveau minimal : " + niveauMin);

    // Le clic « Max » ne doit pas dépasser le niveau utile.
    jeu.evaluer("verdance = 1e15; " + f + ".niveauVitesse = 0; mettreAJourBoutons(); "
      + f + ".boutonVitesseMax.click();");
    assert.equal(jeu.lire(f + ".niveauVitesse"), niveauMin, "tier " + cas.tier);
    assert.equal(jeu.lire("dureeActuelle(" + f + ")"), cas.plancher);

    // Une fois au plancher, les deux boutons de vitesse sont inactifs/masqués.
    jeu.evaluer("mettreAJourBoutons();");
    assert.equal(jeu.lire(f + ".boutonVitesseMax.disabled"), true);
    assert.equal(jeu.lire(f + ".boutonVitesse.hidden"), true);
  }
});

test("hybridation : une fleur spéciale est refusée avec la raison « special »", () => {
  const jeu = jeuNeuf();
  const speciale = "{ tier: 11, generation: 0, complete: true }";
  const classique = "{ tier: 5, generation: 0, complete: true }";
  const verdict = JSON.parse(JSON.stringify(jeu.lire("peutFusionner(" + speciale + ", " + classique + ")")));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.raison, "special");
  const entreSpeciales = JSON.parse(JSON.stringify(jeu.lire("peutFusionner(" + speciale + ", { tier: 12, generation: 0, complete: true })")));
  assert.equal(entreSpeciales.ok, false);
  assert.equal(entreSpeciales.raison, "special");
});

test("sauvegarde : Lunéa et Clématite se rechargent à l'identique", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);
  debloquerEmplacementsSpeciaux(jeu);
  jeu.evaluer("verdance = 1e15;");
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), true);
  assert.equal(jeu.lire("acheterFleurSpeciale(12)"), true);
  jeu.evaluer("fleurs[10].progression = 1234; fleurs[10].petalesAchetes = 2;"
    + " fleurs[10].niveauVitesse = 7; fleurs[10].cycle = 3;"
    + " fleurs[11].progression = 5678; fleurs[11].petalesAchetes = 4;"
    + " fleurs[11].niveauVitesse = 9; fleurs[11].cycle = 5; sauvegarder();");

  const sauvegarde = jeu.sauvegarde();
  assert.equal(sauvegarde.version, 9);
  const recharge = jeuNeuf({ sauvegarde: sauvegarde });
  for (const [slot, tier, nom, petals, duree, plancher, prix] of [
    [10, 11, "Lunéa", 11, 86400, 300, 1e10],
    [11, 12, "Clématite", 12, 172800, 600, 1e11]
  ]) {
    assert.equal(recharge.lire("fleurs[" + slot + "].etat"), "plante");
    assert.equal(recharge.lire("fleurs[" + slot + "].tier"), tier);
    assert.equal(recharge.lire("fleurs[" + slot + "].nom"), nom);
    assert.equal(recharge.lire("fleurs[" + slot + "].nbPetales"), petals);
    assert.equal(recharge.lire("fleurs[" + slot + "].dureeBase"), duree);
    assert.equal(recharge.lire("fleurs[" + slot + "].plancher"), plancher);
    assert.equal(recharge.lire("fleurs[" + slot + "].prix"), prix);
  }
  assert.equal(recharge.lire("fleurs[10].progression"), 1234);
  assert.equal(recharge.lire("fleurs[10].cycle"), 3);
  assert.equal(recharge.lire("fleurs[11].petalesAchetes"), 4);

  // Une partie neuve ne contient aucune fleur spéciale et garde ses emplacements verrouillés.
  const neuve = jeuNeuf();
  neuve.evaluer("sauvegarder();");
  const sv = neuve.sauvegarde();
  assert.equal(sv.emplacements[10].etat, "verrouille");
  assert.equal(sv.emplacements[11].etat, "verrouille");
});

test("interface : section statique, lignes et raisons lisibles", () => {
  const jeu = jeuNeuf();
  assert.ok(HTML.includes('id="listeSpeciales"'), "la liste statique doit exister");
  assert.ok(HTML.includes("Fleurs spéciales"), "le titre doit exister");
  debloquerLaboratoire(jeu);

  // Emplacements verrouillés.
  jeu.evaluer("verdance = 1e12; ameliorationsLabo.l3 = 0; rafraichirSpeciales();");
  let html = jeu.lire("document.getElementById('listeSpeciales').innerHTML");
  assert.ok(html.includes("Lunéa"));
  assert.ok(html.includes("Clématite"));
  assert.ok(html.includes("11 pétales"));
  assert.ok(html.includes("12 pétales"));
  assert.ok(html.includes("emplacement non débloqué"));

  // Emplacements libres mais sans Verdance.
  debloquerEmplacementsSpeciaux(jeu);
  jeu.evaluer("verdance = 0; rafraichirSpeciales();");
  html = jeu.lire("document.getElementById('listeSpeciales').innerHTML");
  assert.ok(html.includes("Verdance insuffisante"));

  // Achat possible puis déjà achetée.
  jeu.evaluer("verdance = 1e12; rafraichirSpeciales();");
  html = jeu.lire("document.getElementById('listeSpeciales').innerHTML");
  assert.ok(/data-special="11"/.test(html));
  assert.equal(jeu.lire("acheterFleurSpeciale(11)"), true);
  jeu.evaluer("rafraichirSpeciales();");
  html = jeu.lire("document.getElementById('listeSpeciales').innerHTML");
  assert.ok(html.includes("déjà achetée"));
});
