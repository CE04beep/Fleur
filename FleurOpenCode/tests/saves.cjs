// Chargement du jeu FleurJ*.html dans un contexte Node (vm) avec le stub DOM.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { creerEnvironnement } = require("./dom-stub.cjs");

const CLE_SAUVEGARDE = "jardinVerdanceV3";
const RACINE = path.join(__dirname, "..");

function extraireScripts(html, baseDir) {
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const attributs = m[1] || "";
    const contenu = m[2];
    const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(attributs) || /\bsrc\s*=\s*'([^']+)'/i.exec(attributs);
    // Base refactorée : le code du jeu est dans un fichier séparé (js/*.js).
    if (src && baseDir) {
      scripts.push(fs.readFileSync(path.resolve(baseDir, src[1]), "utf8"));
    } else {
      scripts.push(contenu);
    }
  }
  return scripts;
}

function cheminJeu(fichier) {
  return path.isAbsolute(fichier) ? fichier : path.join(RACINE, fichier);
}

function lireCodeJeu(fichier) {
  const chemin = cheminJeu(fichier);
  const html = fs.readFileSync(chemin, "utf8");
  return extraireScripts(html, path.dirname(chemin)).join("\n");
}

// options : { sauvegarde, maintenant, stockage }
function chargerJeu(fichier, options) {
  const opts = options || {};
  const chemin = cheminJeu(fichier);
  const html = fs.readFileSync(chemin, "utf8");
  const scripts = extraireScripts(html, path.dirname(chemin));

  const stockage = Object.assign({}, opts.stockage);
  if (opts.sauvegarde !== undefined && opts.sauvegarde !== null) {
    stockage[CLE_SAUVEGARDE] = typeof opts.sauvegarde === "string"
      ? opts.sauvegarde
      : JSON.stringify(opts.sauvegarde);
  }

  const sandbox = creerEnvironnement({
    stockage,
    maintenant: opts.maintenant,
    console: opts.console,
  });
  // Le navigateur expose chaque id comme variable globale (boutonRepli, …).
  const regexId = /\bid\s*=\s*"([^"]+)"/g;
  let mid;
  while ((mid = regexId.exec(html)) !== null) {
    sandbox[mid[1]] = sandbox.document.getElementById(mid[1]);
  }
  const ctx = vm.createContext(sandbox);

  for (const code of scripts) {
    if (code.trim() === "") continue;
    vm.runInContext(code, ctx, { filename: fichier });
  }

  const jeu = {
    fichier,
    ctx,
    sandbox,
    localStorage: sandbox.localStorage,
    evaluer(code) {
      return vm.runInContext(code, ctx, { filename: fichier + " (test)" });
    },
    lire(code) {
      return vm.runInContext(code, ctx, { filename: fichier + " (test)" });
    },
    sauvegarde() {
      const texte = sandbox.localStorage.getItem(CLE_SAUVEGARDE);
      return texte === null ? null : JSON.parse(texte);
    },
    elementsCrees() {
      return sandbox._compteur.crees;
    },
    maintenant() {
      return sandbox._horloge.maintenant;
    },
    avancerHorloge(ms) {
      sandbox._horloge.maintenant += ms;
    },
  };
  return jeu;
}

// Instantané stable de l'état du jeu, utilisé par regression.cjs.
const EXPRESSION_ETAT = `JSON.stringify({
  verdance: verdance,
  petalesBlancs: petalesBlancs,
  cyclesFinis: cyclesFinis,
  compost: compost,
  pm: pm,
  tempsJeu: tempsJeu,
  enrichissement: enrichissement,
  petalesCouleurs: { rosePale: petalesCouleurs.rosePale, rose: petalesCouleurs.rose,
    mauveRose: petalesCouleurs.mauveRose, violetMoyen: petalesCouleurs.violetMoyen,
    violet: petalesCouleurs.violet },
  fleurs: fleurs.map(function (f) {
    return {
      slot: f.slot, etat: f.etat, tier: f.tier, nbPetales: f.nbPetales, dureeBase: f.dureeBase,
      progression: f.progression, petalesAchetes: f.petalesAchetes, completions: f.completions,
      cycle: f.cycle, niveauVitesse: f.niveauVitesse
    };
  })
})`;

function etatJeu(jeu) {
  return JSON.parse(jeu.lire(EXPRESSION_ETAT));
}

module.exports = {
  CLE_SAUVEGARDE,
  RACINE,
  extraireScripts,
  lireCodeJeu,
  chargerJeu,
  etatJeu,
  EXPRESSION_ETAT,
};
