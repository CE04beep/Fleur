// Tests des améliorations du laboratoire (prompt 7) : PM, couleur bleue,
// raison géométrique, emplacements 11/12, sauvegarde et invariant I1.
// Usage : node tests/ameliorations.cjs <fichier.html>
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

function debloquerLaboratoire(jeu) {
  jeu.evaluer("petalesCouleurs.mauveRose = 10; rafraichirDeblocages();");
  assert.equal(jeu.lire("laboratoireDebloque()"), true);
}

test("l1 : refusée sans la couleur violette, acceptée à 5/5 avec 10 PM, PM débités", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);
  jeu.evaluer("pm = 10; arbreAmeliorations.niveaux.c1 = 4;");
  assert.notEqual(jeu.lire("raisonAchatAmelioration('l1')"), null);
  assert.equal(jeu.lire("acheterAmelioration('l1')"), false);
  assert.equal(jeu.lire("ameliorationsLabo.l1"), 0);
  assert.equal(jeu.lire("pm"), 10);

  jeu.evaluer("arbreAmeliorations.niveaux.c1 = 5;");
  assert.equal(jeu.lire("raisonAchatAmelioration('l1')"), null);
  assert.equal(jeu.lire("acheterAmelioration('l1')"), true);
  assert.equal(jeu.lire("ameliorationsLabo.l1"), 1);
  assert.equal(jeu.lire("pm"), 0);
  assert.equal(jeu.lire("acheterAmelioration('l1')"), false, "un seul niveau");
});

test("l2 : refusée sans l1, q change par niveau, prix 50 × 1,2^n, plafond 10", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);
  jeu.evaluer("pm = 1e9;");
  assert.notEqual(jeu.lire("raisonAchatAmelioration('l2')"), null);
  assert.equal(jeu.lire("acheterAmelioration('l2')"), false);

  jeu.evaluer("ameliorationsLabo.l1 = 1;");
  assert.equal(jeu.lire("raisonGeometrique()"), 0.02);
  assert.equal(jeu.lire("prixAmelioration('l2', 0).pm"), 50);
  assert.equal(jeu.lire("prixAmelioration('l2', 1).pm"), 60);
  assert.equal(jeu.lire("prixAmelioration('l2', 9).pm"), Math.round(50 * 1.2 ** 9));

  assert.equal(jeu.lire("acheterAmelioration('l2')"), true);
  assert.equal(jeu.lire("ameliorationsLabo.l2"), 1);
  assert.equal(jeu.lire("raisonGeometrique()"), 0.03);
  assert.equal(jeu.lire("pm"), 1e9 - 50);

  jeu.evaluer("ameliorationsLabo.l2 = 10;");
  assert.equal(jeu.lire("acheterAmelioration('l2')"), false, "plafond à 10 niveaux");
  assert.equal(jeu.lire("ameliorationsLabo.l2"), 10);
});

test("l3 : deux niveaux, PM et compost mature débités, cases 10 et 11 vides", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("pm = 520; compostMature = 260;");
  assert.equal(jeu.lire("prixAmelioration('l3', 0).pm"), 20);
  assert.equal(jeu.lire("prixAmelioration('l3', 0).compostMature"), 10);
  assert.equal(jeu.lire("prixAmelioration('l3', 1).pm"), 500);
  assert.equal(jeu.lire("prixAmelioration('l3', 1).compostMature"), 250);

  assert.equal(jeu.lire("acheterAmelioration('l3')"), true);
  assert.equal(jeu.lire("ameliorationsLabo.l3"), 1);
  assert.equal(jeu.lire("pm"), 500);
  assert.equal(jeu.lire("compostMature"), 250);
  assert.equal(jeu.lire("fleurs[10].etat"), "vide");
  assert.equal(jeu.lire("fleurs[11].etat"), "verrouille");

  assert.equal(jeu.lire("acheterAmelioration('l3')"), true);
  assert.equal(jeu.lire("ameliorationsLabo.l3"), 2);
  assert.equal(jeu.lire("pm"), 0);
  assert.equal(jeu.lire("compostMature"), 0);
  assert.equal(jeu.lire("fleurs[10].etat"), "vide");
  assert.equal(jeu.lire("fleurs[11].etat"), "vide");
  assert.equal(jeu.lire("acheterAmelioration('l3')"), false);
});

test("tirage : le bleu sort avec l1, jamais sans ; Math.random extrême", () => {
  const jeu = jeuNeuf();
  debloquerLaboratoire(jeu);
  // Une fleur au cycle 0 est un semis : le sol n'est pas prêt et elle ne produit
  // que du blanc. Le bleu ne concerne donc que les fleurs jeunes ou plus âgées.
  jeu.evaluer("arbreAmeliorations.niveaux.c1 = 5; ameliorationsLabo.l2 = 10; fleurs[0].cycle = 1;");
  const f = "fleurs[0]";
  const weightBleu = "poidsTirage(" + f + ")[6]";
  assert.equal(jeu.lire(weightBleu), 0, "sans l1, le bleu n'a aucun poids");

  // Sans l1, même un tirage extrême ne donne jamais le bleu.
  jeu.evaluer("Math.random = function () { return 0.999999999; };");
  assert.equal(jeu.lire("PETALES_COULEURS[tirerCouleur(" + f + ")].id"), "violet");

  jeu.evaluer("ameliorationsLabo.l1 = 1;");
  assert.ok(jeu.lire(weightBleu) > 0, "avec l1, le bleu a un poids");
  assert.equal(jeu.lire("PETALES_COULEURS[tirerCouleur(" + f + ")].id"), "bleu");

  // Un tirage tout petit retombe sur le blanc.
  jeu.evaluer("Math.random = function () { return 0; };");
  assert.equal(jeu.lire("tirerCouleur(" + f + ")"), -1);
});

test("un pétale bleu terminé ajoute 1 PM, en jeu actif et hors ligne", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("pm = 0; crediterTeinte(PETALES_COULEURS[5].hex);");
  assert.equal(jeu.lire("petalesCouleurs.bleu"), 1);
  assert.equal(jeu.lire("pm"), 1);

  // Hors ligne : un pétale bleu prêt à se terminer crédite aussi son PM.
  jeu.evaluer("pm = 0;");
  jeu.evaluer(
    "var f = fleurs[0];"
    + "f.niveauVitesse = 0;"
    + "var p = f.petales[0]; p.achete = true; p.existe = true;"
    + "p.progression = 99; p.teinte = PETALES_COULEURS[5].hex;"
  );
  jeu.evaluer("avancerProductionHorsLigne(1);");
  assert.equal(jeu.lire("petalesCouleurs.bleu"), 2);
  assert.equal(jeu.lire("pm"), 1);
});

test("sauvegarde : améliorations et bleu rechargés ; ancienne sauvegarde à zéro", () => {
  const jeu = jeuNeuf();
  jeu.evaluer("ameliorationsLabo = { l1: 1, l2: 3, l3: 1 }; petalesCouleurs.bleu = 42; sauvegarder();");
  const sauvegarde = jeu.sauvegarde();
  // Le prompt 7 est additif : il ne crée pas de version. La base est déjà en v9
  // (v7 = hybridation, v8 = replantation, v9 = seuils de pétales).
  assert.equal(sauvegarde.version, 9, "version courante : v9");
  assert.deepEqual(JSON.parse(JSON.stringify(sauvegarde.ameliorationsLabo)), { l1: 1, l2: 3, l3: 1 });
  assert.equal(sauvegarde.petalesCouleurs.bleu, 42);

  const recharge = jeuNeuf({ sauvegarde: sauvegarde });
  assert.deepEqual(JSON.parse(JSON.stringify(recharge.lire("ameliorationsLabo"))), { l1: 1, l2: 3, l3: 1 });
  assert.equal(recharge.lire("petalesCouleurs.bleu"), 42);
  assert.equal(recharge.lire("raisonGeometrique()"), 0.05);

  const ancienne = JSON.parse(JSON.stringify(sauvegarde));
  delete ancienne.ameliorationsLabo;
  delete ancienne.petalesCouleurs.bleu;
  const ancienJeu = jeuNeuf({ sauvegarde: ancienne });
  assert.deepEqual(JSON.parse(JSON.stringify(ancienJeu.lire("ameliorationsLabo"))), { l1: 0, l2: 0, l3: 0 });
  assert.equal(ancienJeu.lire("petalesCouleurs.bleu"), 0);
  assert.equal(ancienJeu.lire("raisonGeometrique()"), 0.02);
});

test("interface : lignes statiques reconstruites, prix et raisons lisibles", () => {
  const jeu = jeuNeuf();
  assert.ok(HTML.includes('id="listeAmeliorations"'), "la liste statique doit exister");
  debloquerLaboratoire(jeu);
  jeu.evaluer("pm = 0; compostMature = 0; nbHybridations = 2; ameliorationsLabo.l1 = 1;");
  jeu.evaluer("rafraichirAmeliorations();");
  const html = jeu.lire("document.getElementById('listeAmeliorations').innerHTML");
  assert.ok(html.includes("Raison géométrique"));
  assert.ok(html.includes("Emplacements 11 et 12"));
  assert.ok(/PM insuffisants|Compost mature insuffisant/.test(html));
});

test("invariant I1 : PM passifs maximaux sous 16 PM par jour et proches de 7,6", () => {
  const jeu = jeuNeuf();
  const valeur = jeu.lire("pmPassifsMaxParJour()");
  assert.ok(valeur > 7 && valeur < 8, "valeur attendue ≈ 7,6 : " + valeur);
  assert.ok(valeur < 16, "invariant I1 : " + valeur + " < 16");
});
