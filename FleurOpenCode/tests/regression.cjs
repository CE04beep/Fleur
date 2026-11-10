// Régression : 8 scénarios rejoués sur FleurJ14-test.html.
// Usage : node tests/regression.cjs <fichier.html> <sortie.json>
// Le fichier de sortie est comparé à tests/base-j12.json (sauf s'il EST la base).
const fs = require("node:fs");
const path = require("node:path");
const { chargerJeu, etatJeu } = require("./saves.cjs");
const snapshot = require("./snapshot.cjs");

const FICHIER = process.argv[2] || "FleurJ19.html";
const SORTIE = process.argv[3] || path.join(__dirname, "sortie-regression.json");
const BASE = path.join(__dirname, "base-j12.json");
const MAINTENANT = 1700000000000;

function baseV5() {
  const petales = [];
  for (let i = 0; i < 55; i++) {
    petales.push({ progression: (i * 7) % 100, achete: i % 3 === 0, teinte: i % 5 === 0 ? "#F5D3EC" : null });
  }
  return {
    version: 5,
    horodatage: MAINTENANT,
    verdance: 1234.5,
    petalesBlancs: 4321,
    petalesCouleurs: { rosePale: 12, rose: 7, mauveRose: 3, violetMoyen: 2, violet: 1 },
    enrichissement: 4,
    cyclesFinis: 21,
    tempsJeu: 9876,
    compost: 3.5,
    fleurs: [
      { achete: true, progression: 25, petalesAchetes: 1, completions: 2, cycle: 1, niveauVitesse: 2 },
      { achete: true, progression: 60, petalesAchetes: 1, completions: 0, cycle: 0, niveauVitesse: 1 },
      { achete: true, progression: 10, petalesAchetes: 2, completions: 3, cycle: 0, niveauVitesse: 0 }
    ],
    petales: petales
  };
}

function baseV6() {
  const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
  jeu.evaluer("verdance = 98765; petalesBlancs = 1234; cyclesFinis = 9; compost = 2.25; pm = 7;");
  jeu.evaluer("fleurs[0].progression = 42; fleurs[0].petalesAchetes = 1; fleurs[0].cycle = 2; fleurs[0].niveauVitesse = 3;");
  jeu.evaluer("sauvegarder();");
  return jeu.sauvegarde();
}

const SCENARIOS = [
  {
    nom: "01-partie-neuve",
    executer() {
      return chargerJeu(FICHIER, { maintenant: MAINTENANT });
    }
  },
  {
    nom: "02-sauvegarde-v5-migree",
    executer() {
      return chargerJeu(FICHIER, { sauvegarde: baseV5(), maintenant: MAINTENANT });
    }
  },
  {
    nom: "03-rechargement-v6",
    executer() {
      return chargerJeu(FICHIER, { sauvegarde: baseV6(), maintenant: MAINTENANT });
    }
  },
  {
    nom: "04-mille-tours",
    executer() {
      const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
      jeu.evaluer("for (let i = 0; i < 1000; i++) tourDeJeu();");
      return jeu;
    }
  },
  {
    nom: "05-achats-fleurs-petales-cycles",
    executer() {
      const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
      jeu.evaluer("verdance = 1e12;");
      jeu.evaluer("fleurs[0].petales[0].bouton.click(); fleurs[0].petales[1].bouton.click();");
      jeu.evaluer("fleurs[1].bouton.click(); fleurs[1].petales[0].bouton.click();");
      jeu.evaluer("fleurs[0].boutonCycle.click(); fleurs[1].boutonVitesse.click();");
      return jeu;
    }
  },
  {
    nom: "06-petales-et-couleurs",
    executer() {
      const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
      jeu.evaluer("verdance = 1e9;");
      jeu.evaluer("for (const p of fleurs[0].petales) p.bouton.click();");
      jeu.evaluer("for (let i = 0; i < 300; i++) tourDeJeu();");
      return jeu;
    }
  },
  {
    nom: "07-hors-ligne-une-heure",
    executer() {
      const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
      jeu.evaluer("derniereSauvegarde = " + (MAINTENANT - 3600 * 1000) + "; appliquerProgressionHorsLigne();");
      return jeu;
    }
  },
  {
    nom: "08-compost-conversions",
    executer() {
      const jeu = chargerJeu(FICHIER, { maintenant: MAINTENANT });
      jeu.evaluer("petalesBlancs = 100000; compostDeverrouille = true; avancerCompostHorsLigne(600);");
      return jeu;
    }
  }
];

function executer() {
  const resultat = {};
  for (const sc of SCENARIOS) {
    const jeu = sc.executer();
    resultat[sc.nom] = etatJeu(jeu);
  }
  return resultat;
}

const resultat = executer();
snapshot.ecrire(SORTIE, resultat);

if (path.resolve(SORTIE) === path.resolve(BASE) || !fs.existsSync(BASE)) {
  console.log("Base écrite : " + SORTIE);
  process.exit(0);
}

const attendu = snapshot.lire(BASE);
const obtenu = snapshot.lire(SORTIE);
if (attendu === obtenu) {
  console.log("Régression OK : " + SCENARIOS.length + " scénarios identiques à " + path.basename(BASE));
  process.exit(0);
}

const lignesAttendues = attendu.split("\n");
const lignesObtenues = obtenu.split("\n");
let differences = 0;
for (let i = 0; i < Math.max(lignesAttendues.length, lignesObtenues.length); i++) {
  if (lignesAttendues[i] !== lignesObtenues[i]) {
    if (differences < 20) {
      console.error("ligne " + (i + 1) + " : attendu " + JSON.stringify(lignesAttendues[i])
        + " | obtenu " + JSON.stringify(lignesObtenues[i]));
    }
    differences += 1;
  }
}
console.error("Régression ÉCHEC : " + differences + " ligne(s) différente(s).");
process.exit(1);
