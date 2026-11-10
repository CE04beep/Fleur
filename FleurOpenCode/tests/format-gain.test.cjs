// Tests de formaterGain. Le code du jeu vit dans js/FleurJXX.js depuis la
// refonte : lireCodeJeu() lit le HTML puis le script externe référencé.
// Usage : node tests/format-gain.test.cjs [fichier.html]
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { lireCodeJeu } = require("./saves.cjs");

const FICHIER = process.argv[2] || "FleurJ20.html";
const code = lireCodeJeu(FICHIER);

function extraireFonction(source, nom) {
  const debut = source.indexOf("function " + nom + "(");
  if (debut === -1) throw new Error(nom + " introuvable");
  let profondeur = 0;
  for (let i = source.indexOf("{", debut); i < source.length; i++) {
    if (source[i] === "{") profondeur++;
    if (source[i] === "}") {
      profondeur--;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  throw new Error("accolade fermante introuvable pour " + nom);
}

const formaterGain = vm.runInNewContext(
  extraireFonction(code, "formaterGain") + "\nformaterGain"
);

const milliers = (n) => n.toLocaleString("fr-FR");

test("petits nombres : 5 décimales avec virgule", () => {
  assert.equal(formaterGain(0), "0,00000");
  assert.equal(formaterGain(12.34567), "12,34567");
});

test("un petit nombre qui arrondit à 1000 passe au format entier", () => {
  assert.equal(formaterGain(999.999999), milliers(1000));
});

test("milliers et millions courts : entier avec espaces", () => {
  assert.equal(formaterGain(1000), milliers(1000));
  assert.equal(formaterGain(12345), milliers(12345));
  assert.equal(formaterGain(999999), milliers(999999));
});

test("un nombre qui arrondit à 1e6 passe en scientifique", () => {
  assert.equal(formaterGain(999999.5), "1,00×10⁶");
});

test("grands nombres : scientifique avec virgule et exposant typographique", () => {
  assert.equal(formaterGain(1e6), "1,00×10⁶");
  assert.equal(formaterGain(1234567), "1,23×10⁶");
  assert.equal(formaterGain(2e8), "2,00×10⁸");
});

test("valeurs non finies : ne lève pas et reste lisible", () => {
  assert.equal(formaterGain(Infinity), "Infinity");
  assert.equal(formaterGain(NaN), "NaN");
});
