// Tests de sauvegarde du niveau c8 (2nd Conversion).
// Le jeu complet est chargé via chargerJeu() : les fonctions ne peuvent plus
// être isolées, `charger()` dépend de tout l'état (arbres, fleurs, seuils…).
// Usage : node tests/sauvegarde-c8.test.cjs [fichier.html]
const test = require("node:test");
const assert = require("node:assert/strict");
const { chargerJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ20.html";
const MAINTENANT = 1700000000000;

function chargerAvec(sauvegarde) {
  return chargerJeu(FICHIER, { sauvegarde: sauvegarde, maintenant: MAINTENANT });
}

test("la sauvegarde restaure le niveau c8 (2nd Conversion)", () => {
  const jeu = chargerAvec({
    version: 5,
    secondeConversionAchetee: true,
    arbreAmeliorations: {
      niveaux: { c1: 1, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 1 }
    }
  });
  assert.equal(jeu.lire("arbreAmeliorations.niveaux.c8"), 1);
});

test("une ancienne sauvegarde avec seulement le drapeau restaure c8", () => {
  const jeu = chargerAvec({ version: 5, secondeConversionAchetee: true });
  assert.equal(jeu.lire("arbreAmeliorations.niveaux.c8"), 1);
  assert.equal(jeu.lire("secondeConversionAchetee"), true);
});

test("un c8 acheté sans drapeau restaure aussi le drapeau", () => {
  const jeu = chargerAvec({
    version: 5,
    arbreAmeliorations: {
      niveaux: { c1: 1, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 1 }
    }
  });
  assert.equal(jeu.lire("secondeConversionAchetee"), true);
});
