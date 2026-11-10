// Tests de la région « logique pure » (hybridation), extraite du HTML et
// exécutée dans un contexte vide.
// Usage : node tests/logique.cjs [fichier.html]
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const { lireCodeJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || path.join(__dirname, "..", "FleurJ22.html");

function extraireRegion() {
  const code = lireCodeJeu(FICHIER);
  const debut = code.indexOf("//#region logique pure");
  const fin = code.indexOf("//#endregion", debut);
  if (debut === -1 || fin === -1) throw new Error("région « logique pure » introuvable");
  return code.slice(debut, fin + "//#endregion".length);
}

let api = null;
let erreurChargement = null;
try {
  const contexte = vm.createContext({ Math });
  vm.runInContext(
    extraireRegion() + "\nglobalThis.__api = {"
    + " GENERATION_MAX: GENERATION_MAX, MAX_PETALES_HYBRIDE: MAX_PETALES_HYBRIDE,"
    + " NB_CHOIX_HYBRIDATION: NB_CHOIX_HYBRIDATION,"
    + " IDS_CHOIX_HYBRIDATION: IDS_CHOIX_HYBRIDATION,"
    + " DUREE_HYBRIDATION_BASE: DUREE_HYBRIDATION_BASE,"
    + " COUT_HYBRIDATION_BASE: COUT_HYBRIDATION_BASE,"
    + " COUT_HYBRIDATION_FACTEUR_GENERATION: COUT_HYBRIDATION_FACTEUR_GENERATION,"
    + " COUT_HYBRIDATION_PENTE: COUT_HYBRIDATION_PENTE, PM_PAR_PETALE_BLEU: PM_PAR_PETALE_BLEU,"
    + " moyenne: moyenne, arrondiDixieme: arrondiDixieme,"
    + " dureeBaseDeTier: dureeBaseDeTier, prixPremierPetaleDeTier: prixPremierPetaleDeTier,"
    + " dureeHybridation: dureeHybridation, valeursChoixHybride: valeursChoixHybride,"
    + " choixValides: choixValides, choixDisponibles: choixDisponibles,"
    + " gainPM: gainPM, generationResultat: generationResultat, peutFusionner: peutFusionner,"
    + " coutHybridation: coutHybridation, nomHybride: nomHybride,"
    + " caracteristiquesHybride: caracteristiquesHybride };",
    contexte
  );
  api = contexte.__api;
} catch (e) {
  erreurChargement = e;
}

function parent(champs) {
  return Object.assign({
    tier: 2,
    generation: 0,
    nbPetales: 3,
    dureeBase: 40,
    cycle: 0,
    plancher: 10,
    gainCycle: 2,
    bonusComplet: 1.4,
    partColoreeMax: 10,
    complete: true
  }, champs || {});
}

// Parents « réels » du cas de référence : A tier 3 et B tier 5.
function parentA() {
  return parent({
    tier: 3, nbPetales: 3, dureeBase: 160, plancher: 15,
    gainCycle: 3, bonusComplet: 1.8, partColoreeMax: 15
  });
}
function parentB() {
  return parent({
    tier: 5, nbPetales: 5, dureeBase: 2560, plancher: 25,
    gainCycle: 5, bonusComplet: 3.4, partColoreeMax: 25
  });
}

const NOMS = ["Arum", "Dyade", "Trille", "Fuchsia", "Eglantier", "Tulipe",
  "Heptéa", "Cosmos", "Ennéa", "Anémone"];

function json(x) {
  return JSON.parse(JSON.stringify(x));
}

test("la région pure se charge sans document, localStorage ni état du jeu", () => {
  assert.equal(erreurChargement, null, erreurChargement && erreurChargement.message);
  assert.ok(api);
});

test("constantes de la spécification", () => {
  assert.equal(api.GENERATION_MAX, 3);
  assert.equal(api.MAX_PETALES_HYBRIDE, 10);
  assert.equal(api.NB_CHOIX_HYBRIDATION, 2);
  assert.equal(api.DUREE_HYBRIDATION_BASE, 20);
  assert.equal(api.COUT_HYBRIDATION_BASE, 10);
  assert.equal(api.COUT_HYBRIDATION_FACTEUR_GENERATION, 3);
  assert.equal(api.COUT_HYBRIDATION_PENTE, 0.1);
  assert.equal(api.PM_PAR_PETALE_BLEU, 1);
  assert.deepEqual(json(api.IDS_CHOIX_HYBRIDATION),
    ["additionner", "vigueur", "rapidite", "gainCycle", "cycle", "partColoree"]);
});

test("moyenne et arrondiDixieme", () => {
  assert.equal(api.moyenne(2, 4), 3);
  assert.equal(api.moyenne(3, 5), 4);
  assert.equal(api.moyenne(1, 2), 1.5);
  assert.equal(api.arrondiDixieme(2.64), 2.6);
  assert.equal(api.arrondiDixieme(4.75), 4.8);
});

test("gainPM = tierA × tierB", () => {
  assert.equal(api.gainPM(1, 1), 1);
  assert.equal(api.gainPM(9, 10), 90);
});

test("generationResultat additionne les générations + 1", () => {
  assert.equal(api.generationResultat(parent({ generation: 0 }), parent({ generation: 0 })), 1);
  assert.equal(api.generationResultat(parent({ generation: 0 }), parent({ generation: 1 })), 2);
  assert.equal(api.generationResultat(parent({ generation: 1 }), parent({ generation: 1 })), 3);
  assert.equal(api.generationResultat(parent({ generation: 2 }), parent({ generation: 1 })), 4);
});

test("peutFusionner refuse les quatre cas et accepte un cas valide", () => {
  const fusion = (a, b) => json(api.peutFusionner(a, b));
  assert.deepEqual(fusion(parent({ complete: false }), parent({ tier: 3 })), { ok: false, raison: "incomplete" });
  assert.deepEqual(fusion(parent({ tier: 2 }), parent({ tier: 2 })), { ok: false, raison: "meme-tier" });
  assert.deepEqual(fusion(parent({ tier: 11 }), parent({ tier: 3 })), { ok: false, raison: "special" });
  assert.deepEqual(fusion(parent({ generation: 2, tier: 2 }), parent({ generation: 1, tier: 3 })), { ok: false, raison: "generation" });
  assert.equal(fusion(parent({ tier: 2 }), parent({ tier: 3 })).ok, true);
});

test("peutFusionner : un hybride de tier 12 reste fusionnable", () => {
  const fusion = (a, b) => json(api.peutFusionner(a, b));
  const hybride12 = parent({ tier: 12, hybride: true, special: false });
  // Le tier élevé ne suffit pas : seul le champ `special` bloque la fusion.
  assert.equal(fusion(hybride12, parent({ tier: 3 })).ok, true);
  // Une fleur spéciale (Lunéa) est bien refusée.
  assert.deepEqual(fusion(parent({ tier: 11, special: true }), parent({ tier: 3 })), { ok: false, raison: "special" });
});

test("choixDisponibles : les 6 identifiants et l'état de additionner", () => {
  const choix = api.choixDisponibles(parent({ nbPetales: 3 }), parent({ tier: 3, nbPetales: 7 }));
  const ids = json(choix.map(function (c) { return c.id; }));
  assert.deepEqual(ids, ["additionner", "vigueur", "rapidite", "gainCycle", "cycle", "partColoree"]);
  assert.equal(choix[0].actif, true);

  const trop = api.choixDisponibles(parent({ nbPetales: 5 }), parent({ tier: 3, nbPetales: 6 }));
  assert.equal(trop[0].actif, false);
});

test("choixValides : exactement 2 identifiants distincts et connus", () => {
  assert.equal(api.choixValides(["vigueur", "rapidite"]), true);
  assert.equal(api.choixValides([]), false);
  assert.equal(api.choixValides(["vigueur"]), false);
  assert.equal(api.choixValides(["vigueur", "rapidite", "cycle"]), false);
  assert.equal(api.choixValides(["vigueur", "vigueur"]), false);
  assert.equal(api.choixValides(["vigueur", "inconnu"]), false);
  assert.equal(api.choixValides("vigueur"), false);
});

test("dureeBaseDeTier et prixPremierPetaleDeTier", () => {
  assert.equal(api.dureeBaseDeTier(1), 10);
  assert.equal(api.dureeBaseDeTier(5), 2560);
  assert.equal(api.prixPremierPetaleDeTier(5), 12000);
  assert.equal(api.prixPremierPetaleDeTier(8), 12000000);
});

test("dureeHybridation : 20 s × 2^(tier−2)", () => {
  assert.equal(api.dureeHybridation(2), 20);
  assert.equal(api.dureeHybridation(5), 160);
  assert.equal(api.dureeHybridation(8), 1280);
});

test("coutHybridation suit la formule de la spécification", () => {
  assert.equal(api.coutHybridation(5, 1, 0), 10000);
  assert.equal(api.coutHybridation(5, 3, 0), 90000);
  assert.equal(api.coutHybridation(10, 1, 0), 1e9);
  // Pente : n = 5 -> multiplicateur 1,5.
  assert.equal(api.coutHybridation(10, 1, 5) / api.coutHybridation(10, 1, 0), 1.5);
});

test("nomHybride : nom de l'espèce du nombre de pétales + H<génération>", () => {
  assert.equal(api.nomHybride(3, 1, NOMS), "Trille H1");
  assert.equal(api.nomHybride(8, 1, NOMS), "Cosmos H1");
  assert.equal(api.nomHybride(8, 2, NOMS), "Cosmos H2");
});

test("valeursChoixHybride : chaque choix apporte sa valeur", () => {
  const v = api.valeursChoixHybride(parentA(), parentB());
  assert.equal(v.additionner.valeur, 8, "8 pétales = 3 + 5");
  assert.equal(v.vigueur.valeur, 2.6, "moyenne des bonus : (1,8 + 3,4) / 2");
  assert.equal(v.rapidite.valeur, 160, "durée minimale des parents");
  assert.equal(v.gainCycle.valeur, 5, "meilleur gain par cycle");
  assert.equal(v.cycle.valeur, 0);
  assert.equal(v.partColoree.valeur, 25, "meilleure part colorée");
});

test("caracteristiquesHybride : cas de référence A tier 3 + B tier 5", () => {
  const h = json(api.caracteristiquesHybride(parentA(), parentB(), ["additionner", "vigueur"], NOMS));
  assert.deepEqual(h, {
    tier: 8,
    nom: "Cosmos H1",
    nbPetales: 8,
    dureeBase: 1360,
    plancher: 20,
    prix: null,
    prixPremierPetale: 12000000,
    hybride: true,
    parents: [3, 5],
    generation: 1,
    cycle: 0,
    niveauVitesse: 0,
    petalesAchetes: 0,
    gainCycle: 4,
    bonusComplet: 2.6,
    partColoreeMax: 20
  });
});

test("caracteristiquesHybride : chaque choix retenu", () => {
  const a = parentA();
  const b = parentB();

  const addition = api.caracteristiquesHybride(a, b, ["additionner", "rapidite"], NOMS);
  assert.equal(addition.nbPetales, 8);

  const vigueur = api.caracteristiquesHybride(a, b, ["vigueur", "rapidite"], NOMS);
  assert.equal(vigueur.bonusComplet, 2.6);

  const rapidite = api.caracteristiquesHybride(a, b, ["vigueur", "rapidite"], NOMS);
  assert.equal(rapidite.dureeBase, 160);

  const gain = api.caracteristiquesHybride(a, b, ["gainCycle", "vigueur"], NOMS);
  assert.equal(gain.gainCycle, 5);

  const cycle0 = api.caracteristiquesHybride(
    parent({ tier: 2, cycle: 2 }), parent({ tier: 3, cycle: 0 }), ["cycle", "vigueur"], NOMS);
  assert.equal(cycle0.cycle, 0);

  const part = api.caracteristiquesHybride(a, b, ["partColoree", "vigueur"], NOMS);
  assert.equal(part.partColoreeMax, 25);
});

test("caracteristiquesHybride : valeurs par défaut quand le choix n'est pas retenu", () => {
  const a = parentA();
  const b = parentB();

  // Ni additionner, ni vigueur, ni gainCycle, ni partColoree, ni rapidite.
  const faible = api.caracteristiquesHybride(a, b, ["cycle", "partColoree"], NOMS);
  assert.equal(faible.nbPetales, 4, "moyenne arrondie de 3 et 5");
  assert.equal(faible.dureeBase, 1360, "moyenne des durées");
  assert.equal(faible.bonusComplet, 1.8, "bonus du parent le plus faible");
  assert.equal(faible.gainCycle, 4, "moyenne des gains");
  assert.equal(faible.cycle, 0);
  assert.equal(faible.partColoreeMax, 25, "partColoree choisi");

  const sansPart = api.caracteristiquesHybride(a, b, ["cycle", "rapidite"], NOMS);
  assert.equal(sansPart.partColoreeMax, 20, "moyenne des parts colorées");
});

test("caracteristiquesHybride : null si les choix sont invalides ou indisponibles", () => {
  const a = parentA();
  const b = parentB();
  assert.equal(api.caracteristiquesHybride(a, b, [], NOMS), null);
  assert.equal(api.caracteristiquesHybride(a, b, ["vigueur"], NOMS), null);
  assert.equal(api.caracteristiquesHybride(a, b, ["vigueur", "rapidite", "cycle"], NOMS), null);
  assert.equal(api.caracteristiquesHybride(a, b, ["vigueur", "inconnu"], NOMS), null);
  assert.equal(api.caracteristiquesHybride(a, b, ["vigueur", "vigueur"], NOMS), null);

  // additionner indisponible : 6 + 6 = 12 > 10.
  const grosA = parent({ tier: 2, nbPetales: 6 });
  const grosB = parent({ tier: 3, nbPetales: 6 });
  assert.equal(api.caracteristiquesHybride(grosA, grosB, ["additionner", "vigueur"], NOMS), null);
});

test("caracteristiquesHybride : null si les parents ne peuvent pas fusionner", () => {
  const a = parentA();
  const b = parentB();
  assert.equal(api.caracteristiquesHybride(a, parent({ tier: 3 }), ["vigueur", "rapidite"], NOMS), null, "même tier");
  assert.equal(api.caracteristiquesHybride(a, Object.assign(parentB(), { complete: false }), ["vigueur", "rapidite"], NOMS), null, "incomplète");
});

test("caracteristiquesHybride ne modifie aucun argument", () => {
  const a = parentA();
  const b = parentB();
  const avantA = JSON.stringify(a);
  const avantB = JSON.stringify(b);
  api.caracteristiquesHybride(a, b, ["additionner", "vigueur"], NOMS);
  assert.equal(JSON.stringify(a), avantA);
  assert.equal(JSON.stringify(b), avantB);
});
