// ============================================================
// ÉTAT DU JEU
// ============================================================
let verdance = 0;
let petalesBlancs = 0;
let cyclesFinis = 0;
let gainDeBase = 1;
let multiplicateur = 1;
let tempsJeu = 0;
let derniereSauvegarde = 0;   // horodatage de la dernière sauvegarde (pour le hors-ligne)

let compost = 0;
let compostDeverrouille = false;   // le compost, une fois ouvert, le reste (même si la Trille disparaît du parterre)
let pm = 0;   // Points de Mutation (laboratoire)
// Améliorations du laboratoire (prompt 7) : niveaux additifs, 0 par défaut.
let ameliorationsLabo = { l1: 0, l2: 0, l3: 0 };

// Hybridation (sauvegarde v7) : compteur, graines produites et fusion en cours.
let nbHybridations = 0;
let graines = [];                 // [{ id, definition }]
let hybridationEnCours = null;    // { slotA, slotB, choix, resultat, cout, gainPM, tempsRestant }
let laboEtaitVisible = false;     // pour rafraîchir l'interface à l'ouverture du laboratoire

function afficherPM() {
  const texte = formaterNombre(pm);
  const dansLabo = document.getElementById("pmAff");
  if (dansLabo) dansLabo.textContent = texte;
  const dansBarre = document.getElementById("pmBarre");
  if (dansBarre) dansBarre.textContent = texte;
  // Les prix d'améliorations dépendent du solde de PM.
  rafraichirAmeliorations();
}

// Ajoute des PM. Ignore tout montant non fini ou négatif (retourne false).
function ajouterPM(x) {
  if (!Number.isFinite(x) || x <= 0) return false;
  pm = pm + x;
  afficherPM();
  return true;
}

// Dépense des PM. Refuse (sans rien changer) si le montant est invalide ou
// supérieur au solde : pm ne devient jamais négatif.
function depenserPM(x) {
  if (!Number.isFinite(x) || x <= 0 || pm < x) return false;
  pm = pm - x;
  afficherPM();
  return true;
}
// Seuils « à conserver », un par monnaie de conversion.
// - blancs : pétales blancs jamais consommés par une conversion automatique.
// - chaque couleur : réserve de pétales colorés avant de payer un ferment.
// Un ferment coûte FERMENT_COUT (5) : la réserve protège donc les 5 pétales
// du ferment en cours + le seuil choisi. 0 = aucun pétale réservé en plus.
const SEUILS_PETALES_DEFAUT = {
  blancs: 1000,
  rosePale: 0,
  rose: 0,
  mauveRose: 0,
  violetMoyen: 0,
  violet: 0,
  bleu: 0
};
let seuilsPetales = Object.assign({}, SEUILS_PETALES_DEFAUT);
// Replantation (prompt 6) : compteur par espèce classique (index = tier).
let nbReplantations = new Array(11).fill(0);
// Sac de graines : par espèce classique (index = tier), graines entières et fragments en cours.
let sacGraines = [];
const MAX_GRAINES_SAC = 9;
// Prix de la replantation (constantes isolées, faciles à changer).
const PRIX_COMPOST_REPLANTATION_PAR_TIER = 50;              // basique : compost = tier × 50
const PRIX_COMPOST_MATURE_GRAINE_HYBRIDE_PAR_TIER = 2;      // hybride : compost mature = tier × 2
let vitesseTemps = 1;     // 1 = normal ; 100 en mode test
let etatSale = true;      // vrai quand les boutons doivent être recalculés (verdance, achats...)
let dernierRecalculBoutons = 0;   // horodatage (ms) du dernier recalcul complet des boutons
const DELAI_RECALCUL_BOUTONS = 250;   // au plus 4 recalculs par seconde pour les changements dus au seul temps
// Automatisations du parterre : chacune se débloque une fois (coût en Cycles Finis),
// puis la bascule ON/OFF est gratuite. L'ordre de ce tableau est celui des boutons.
const AUTOMATISATIONS = [
  { cle: "cycle",   idBouton: "boutonAutoCycle",   nom: "Auto-Cycle",   cout: 2 },
  { cle: "petales", idBouton: "boutonAutoPetales", nom: "Auto-Pétale", cout: 4 },
  { cle: "vitesse", idBouton: "boutonAutoVitesse", nom: "Auto-Vitesse", cout: 10 },
  { cle: "fleur",   idBouton: "boutonAutoFleur",   nom: "Auto-Fleur",   cout: 20 },
  { cle: "ameliorations", idBouton: "boutonAutoAmeliorations", nom: "Auto améliorations", cout: 40 }
];
const autos = {
  cycle:   { achete: false, actif: false },
  petales: { achete: false, actif: false },
  vitesse: { achete: false, actif: false },
  fleur:   { achete: false, actif: false },
  ameliorations: { achete: false, actif: false }
};
let autoCompostDebloque = false;   // l'automatisation s'ouvre dès le premier lancement manuel
let autoCompostActif = false;      // interrupteur ON/OFF des conversions (seuil de pétales blancs à conserver)
// ---- Ferments : un emplacement par cercle (bac1, bac1b, bac2, bac3), indépendants.
// N'importe quelle couleur peut aller dans n'importe quel emplacement. La couleur donne
// la famille d'effet et sa force ; le ferment est prélevé au début de chaque cycle du cercle.
const FERMENT_COUT = 5;
const FERMENTS = {
  rosePale:    { type: "vitesse",   force: 0.10 },
  rose:        { type: "rendement", force: 0.10 },
  mauveRose:   { type: "vitesse",   force: 0.20 },
  violetMoyen: { type: "rendement", force: 0.20 },
  violet:      { type: "vitesse",   force: 0.35 },
  bleu:        { type: "rendement", force: 0.50 }
};
const CERCLES = ["bac1", "bac1b", "bac2", "bac3"];
let fermentsChoisis = { bac1: "", bac1b: "", bac2: "", bac3: "" };   // couleur choisie par emplacement
let fermentsPayes = { bac1: "", bac1b: "", bac2: "", bac3: "" };     // ferment payé pour le cycle en cours
let secondeConversionAchetee = false;   // 2ᵉ barre de conversion (arbre)
// Voies de conversion des pétales blancs : la 2ᵉ n'existe qu'après l'achat de « 2nd Conversion ».
// Chaque voie est indépendante (son propre minuteur, son propre ferment).
const voies = [
  { cle: "bac1",  encours: false, progression: 0 },
  { cle: "bac1b", encours: false, progression: 0 }
];
let compostMature = 0;
let bac2progression = 0;
let compostFertile = 0;
let bac3progression = 0;
let conversionsBac1 = 0;
let conversionsBac2 = 0;
let conversionsBac3 = 0;

// Compteurs des pétales colorés (globaux) et compteur d'enrichissement du sol
let petalesCouleurs = { rosePale: 0, rose: 0, mauveRose: 0, violetMoyen: 0, violet: 0, bleu: 0 };
let enrichissement = 0;        // 0 à 50 (= % de part colorée avant plafond), +2 par niveau de « Concentrer l'humus »
let fleurSolOuverte = null;    // fleur dont le panneau Sol est affiché (null = fermé)

const COULEUR_PETALE_BLANC = "#f5f5f0";
// `bonusParPetale` rend le coefficient de gain propre à chaque couleur : le bleu
// vaut 0,01 par pétale, les cinq couleurs violettes gardent 0,001.
const PETALES_COULEURS = [
  { id: "rosePale",     nom: "Rose pâle",     hex: "#F5D3EC", bonusParPetale: 0.001 },
  { id: "rose",         nom: "Rose",          hex: "#E7AFE1", bonusParPetale: 0.001 },
  { id: "mauveRose",    nom: "Mauve rosé",    hex: "#CB85D1", bonusParPetale: 0.001 },
  { id: "violetMoyen",  nom: "Violet moyen",  hex: "#A65EC4", bonusParPetale: 0.001 },
  { id: "violet",       nom: "Violet",        hex: "#6F2DA8", bonusParPetale: 0.001 },
  { id: "bleu",         nom: "Bleu",          hex: "#3F5FD0", bonusParPetale: 0.01 }
];

// Teintes enregistrées avant la palette E : remplacées au chargement pour que
// les pétales déjà colorés suivent le nouveau dégradé. Le violet ne change pas.
const TEINTES_AVANT_PALETTE_E = {
  "#F5E6F2": "#F5D3EC",   // rose pâle
  "#E8B8DD": "#E7AFE1",   // rose
  "#D47BC7": "#CB85D1",   // mauve rosé
  "#A95BC7": "#A65EC4"    // violet moyen
};

function migrerTeinte(teinte) {
  if (!teinte) return COULEUR_PETALE_BLANC;
  const cle = String(teinte).toUpperCase();
  return TEINTES_AVANT_PALETTE_E[cle] || teinte;
}

// ============================================================
// ÉLÉMENTS DE LA PAGE
// ============================================================
const affichageVerdance = document.getElementById("verdance");
const affichagePetalesBlancs = document.getElementById("petalesblancs");
const affichageCyclesFinis = document.getElementById("cyclesfinis");
const affichageCompost = document.getElementById("compost");
const affichageGainParFleur = document.getElementById("gainparfleur");
const affichageDetailGain = document.getElementById("detailgain");
const jardin = document.getElementById("jardin");
const Compost = document.getElementById("Compost");

const affichageCompteursCouleurs = {};
for (const c of PETALES_COULEURS) {
  affichageCompteursCouleurs[c.id] = document.getElementById("compteur-" + c.id);
}

const ICONES = {
  verdance: "🌿\uFE0F",
  fleur: "⚘",
  petale: "✾",
  cycle: "꩜",
  vitesse: "⏱",
  compost: "♻︎",
  pm: "🧬",
  graine: "🌰"
};

// ============================================================
// RÉGLAGES
// ============================================================

//#region jardin
const FRACTION_PETALE = 0.25;   // ⚠ si tu changes ça, modifie aussi le texte « un quart » dans la phrase d'explication
const FACTEUR_VITESSE = 0.9;   
const BONUS_FLEUR = 0.2;        
const DEPART_PETALE = 2;     // prix du pétale 1 de la fleur 1 (fleur gratuite)
const PROGRESSION_PETALE = 2;  // chaque pétale coûte 2 × le précédent
const CROISSANCE_VITESSE_FIXE = 1.2;   // prix de la vitesse : × 1,2 par niveau, identique pour toutes les fleurs

const noms = ["Arum", "Dyade", "Trille", "Fuchsia", "Eglantier", "Tulipe", "Heptéa", "Cosmos", "Ennéa", "Anémone"];
const reglages = [];
for (let n = 1; n <= 10; n++) {
  reglages.push({
    tier: n,
    nom: noms[n - 1],
    nbPetales: n,
    duree: 10 * 4 ** (n - 1),
    prix: n === 1 ? 0 : 10 * 10 ** (n - 2)
  });
}
//#endregion

const COUT_CONVERSION = 100;   // 100 pétales blancs consommés par conversion = 1 compost (avant BonusCompost)
const DUREE_CONVERSION = 60;
const BONUS_PAR_CONVERSIONS = 0.001;
const CONVERSIONS_PAR_PROGRES_BAC3 = 1;   // 100 conversions du bac 2 = +1 sur les 100 de progression du bac 3
const CONVERSIONS_PAR_PROGRES_BAC2 = 1;   // +1 conversion accumulée pour le bac 2 à chaque conversion du bac 1 (seuil : seuilBac2())
const MULTIPLICATEUR_TEST = 100;   // vitesse du temps en mode test

// Progression hors ligne : 50 % du temps d'absence, plafonnée à 1 h.
// Avec 1 h de jeu actif par jour, cela ajoute ~30 min équivalentes par jour.
const DUREE_HORS_LIGNE_MAX = 3600;
const RENDEMENT_HORS_LIGNE = 0.5;

// ============================================================
// FONCTIONS
// ============================================================

//#region sauvegarde
// La clé reste « jardinVerdanceV3 » pour ne pas perdre les sauvegardes existantes :
// ce n'est PAS le numéro de format. Le format est porté par le champ « version »
// de la sauvegarde ; à chaque changement de structure, on incrémente
// VERSION_SAUVEGARDE et on ajoute une étape dans MIGRATIONS (clé = version de départ).
const CLE_SAUVEGARDE = "jardinVerdanceV3";
const VERSION_SAUVEGARDE = 9;
const MIGRATIONS = {
  // v4 -> v5 : la teinte d'un pétale en cours avait déjà été créditée.
  // On la retire pour qu'elle soit retirée au hasard au chargement.
  4: function (sauvegarde) {
    for (const p of (sauvegarde.petales || [])) {
      if (p && p.achete) p.teinte = null;
    }
  },
  // v5 -> v6 : fleurs[10] + pétales à plat  ->  emplacements[12] avec pétales imbriqués.
  // Dans l'ancien format, la fleur n (1..10) avait n pétales, rangés à la suite :
  // ses pétales commencent à l'indice n(n-1)/2 du tableau plat.
  5: function (sauvegarde) {
    const anciennes = sauvegarde.fleurs || [];
    const plats = sauvegarde.petales || [];
    const emplacements = [];
    for (let i = 0; i < EMPLACEMENTS_MAX; i++) {
      const ancienne = anciennes[i];
      if (i >= reglages.length) {
        emplacements.push({ slot: i, etat: "verrouille" });   // emplacements 11 et 12 : nouveaux
        continue;
      }
      const achete = ancienne ? (ancienne.achete ?? (i === 0)) : (i === 0);
      if (!achete) {
        emplacements.push({ slot: i, etat: "verrouille" });
        continue;
      }
      const def = definitionEspece(i + 1);
      const debut = i * (i + 1) / 2;
      const petalesPlante = [];
      for (let rang = 0; rang < def.nbPetales; rang++) {
        const sp = plats[debut + rang];
        petalesPlante.push(sp ? { progression: sp.progression, achete: sp.achete, teinte: sp.teinte }
                              : { progression: 0, achete: false, teinte: null });
      }
      const a = ancienne || {};
      emplacements.push(Object.assign({ slot: i, etat: "plante" }, def, {
        progression: a.progression, petalesAchetes: a.petalesAchetes, completions: a.completions,
        cycle: a.cycle, niveauVitesse: a.niveauVitesse, petales: petalesPlante
      }));
    }
    sauvegarde.emplacements = emplacements;
    // Le compost ouvert reste ouvert (ancienne règle : fleur 3 complète, ou compost déjà produit).
    const f3 = anciennes[2];
    sauvegarde.compostDeverrouille = !!((f3 && (f3.achete ?? false) && (f3.petalesAchetes || 0) >= 3)
      || sauvegarde.compost > 0 || sauvegarde.compostMature > 0 || sauvegarde.compostFertile > 0
      || sauvegarde.conversionsBac1 > 0);
    delete sauvegarde.fleurs;
    delete sauvegarde.petales;
  },
  // v6 -> v7 : hybridation (compteur, graines, fusion en cours) et mémoire de
  // plantation par emplacement. `dejaPlante` ne repasse jamais à false : la
  // visibilité d'un emplacement dépend de si le précédent a DÉJÀ été planté.
  6: function (sauvegarde) {
    sauvegarde.nbHybridations = 0;
    sauvegarde.graines = [];
    sauvegarde.hybridationEnCours = null;
    for (const e of (sauvegarde.emplacements || [])) {
      if (!e) continue;
      e.dejaPlante = e.etat === "plante";
    }
  },
  // v7 -> v8 : sac de graines (graines et fragments par espèce), vide au départ.
  7: function (sauvegarde) {
    sauvegarde.sacGraines = [];
  },
  // v8 -> v9 : le seuil unique de pétales blancs devient un objet de 7 seuils
  // (blancs + 6 couleurs). L'ancienne valeur est reprise pour les blancs ; les
  // couleurs démarrent sans réserve.
  8: function (sauvegarde) {
    const ancien = Number.isFinite(sauvegarde.MINIMUM_PETALES) && sauvegarde.MINIMUM_PETALES >= 0
      ? Math.floor(sauvegarde.MINIMUM_PETALES)
      : SEUILS_PETALES_DEFAUT.blancs;
    sauvegarde.seuilsPetales = Object.assign({}, SEUILS_PETALES_DEFAUT, { blancs: ancien });
    delete sauvegarde.MINIMUM_PETALES;
  }
};

// Applique, une par une, les migrations nécessaires. Les versions sans étape
// (2 -> 3, 3 -> 4) n'avaient pas de transformation de données à faire.
function migrerSauvegarde(sauvegarde) {
  let v = sauvegarde.version;
  while (v < VERSION_SAUVEGARDE) {
    if (MIGRATIONS[v]) MIGRATIONS[v](sauvegarde);
    v = v + 1;
    sauvegarde.version = v;
  }
  return sauvegarde;
}

function sauvegarder() {
  const sauvegarde = {
    version: VERSION_SAUVEGARDE,
    horodatage: Date.now(),
    verdance: verdance,
    petalesBlancs: petalesBlancs,
    petalesCouleurs: petalesCouleurs,
    enrichissement: enrichissement,
    cyclesFinis: cyclesFinis,
    tempsJeu: tempsJeu,
    emplacements: [],
    compostDeverrouille: compostDebloque(),   // fige le déblocage avant d'écrire
    compost: compost,
    pm: pm,
    nbHybridations: nbHybridations,
    graines: graines,
    hybridationEnCours: hybridationEnCours,
    nbReplantations: nbReplantations.slice(),
    sacGraines: sacGraines.map(function (e) {
      return e ? { graines: e.graines, fragments: e.fragments } : null;
    }),
    ameliorationsLabo: { l1: ameliorationsLabo.l1, l2: ameliorationsLabo.l2, l3: ameliorationsLabo.l3 },
    seuilsPetales: seuilsPetales,
    bac1encours: voies[0].encours,
    bac1progression: voies[0].progression,
    autoCompostActif: autoCompostActif,
    autoCompostDebloque: autoCompostDebloque,
    fermentsChoisis: fermentsChoisis,
    fermentsPayes: fermentsPayes,
    secondeConversionAchetee: secondeConversionAchetee,
    bac1bencours: voies[1].encours,
    bac1bprogression: voies[1].progression,
    compostMature: compostMature,
    compostFertile: compostFertile,
    bac2progression: bac2progression,
    bac3progression: bac3progression,
    conversionsBac1: conversionsBac1,
    conversionsBac2: conversionsBac2,
    conversionsBac3: conversionsBac3,
    arbreAmeliorations: arbreAmeliorations,
    autoCycleActif: autos.cycle.actif,
    autoCycleAchete: autos.cycle.achete,
    autoPetalesActif: autos.petales.actif,
    autoPetalesAchete: autos.petales.achete,
    autoVitesseActif: autos.vitesse.actif,
    autoVitesseAchete: autos.vitesse.achete,
    autoFleurActif: autos.fleur.actif,
    autoFleurAchete: autos.fleur.achete,
    autoAmeliorationsActif: autos.ameliorations.actif,
    autoAmeliorationsAchete: autos.ameliorations.achete
  };

  // Un objet par emplacement. Seules les plantes portent leurs données ; les pétales
  // sont imbriqués dans leur plante (seulement ceux qui existent).
  for (const f of fleurs) {
    const e = { slot: f.slot, etat: f.etat };
    if (f.etat === "plante") {
      Object.assign(e, {
        tier: f.tier, nom: f.nom, nbPetales: f.nbPetales, dureeBase: f.dureeBase,
        plancher: f.plancher,
        prix: f.prix, prixPremierPetale: f.prixPremierPetale, hybride: f.hybride, parents: f.parents,
        progression: f.progression, petalesAchetes: f.petalesAchetes, completions: f.completions,
        cycle: f.cycle, niveauVitesse: f.niveauVitesse,
        generation: f.generation,
        gainCycle: f.gainCycle,
        bonusComplet: f.bonusComplet,
        partColoreeMax: f.partColoreeMax,
        graineId: f.graineId ?? null,
        petales: f.petales.filter(function (p) { return p.existe; }).map(function (p) {
          return { progression: p.progression, achete: p.achete, teinte: p.teinte };
        })
      });
    }
    e.dejaPlante = f.dejaPlante === true;
    sauvegarde.emplacements.push(e);
  }
  localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(sauvegarde));
  derniereSauvegarde = sauvegarde.horodatage;
}

function charger() {
  const texte = localStorage.getItem(CLE_SAUVEGARDE);
  if (texte === null) {
    return;   // pas de sauvegarde : on laisse le jeu neuf
  }
  let sauvegarde;
  try {
    sauvegarde = JSON.parse(texte);
  } catch (e) {
    // Sauvegarde illisible : on la garde de côté au lieu de l'écraser en silence.
    localStorage.setItem(CLE_SAUVEGARDE + "_illisible", texte);
    localStorage.removeItem(CLE_SAUVEGARDE);
    return;
  }
  if (!sauvegarde || !sauvegarde.version || sauvegarde.version < 2) { localStorage.removeItem(CLE_SAUVEGARDE); return; }
  if (sauvegarde.version < VERSION_SAUVEGARDE) {
    // Copie de sécurité avant toute migration.
    localStorage.setItem(CLE_SAUVEGARDE + "_avant_v" + VERSION_SAUVEGARDE, texte);
    migrerSauvegarde(sauvegarde);
  }
  derniereSauvegarde = sauvegarde.horodatage || 0;

  // Les || 0 évitent d'afficher "undefined" avec une ancienne sauvegarde
  verdance = sauvegarde.verdance || 0;
  petalesBlancs = sauvegarde.petalesBlancs || 0;
  cyclesFinis = sauvegarde.cyclesFinis || 0;
  tempsJeu = sauvegarde.tempsJeu || 0;
  compost = sauvegarde.compost || 0;
  compostDeverrouille = sauvegarde.compostDeverrouille === true;
  pm = Number.isFinite(sauvegarde.pm) && sauvegarde.pm >= 0 ? sauvegarde.pm : 0;
  // Compteur additif de replantations (index = tier), absent des sauvegardes antérieures.
  nbReplantations = [];
  for (let tier = 0; tier <= reglages.length; tier++) {
    const source = sauvegarde.nbReplantations;
    const brut = Array.isArray(source)
      ? source[tier]
      : (source && typeof source === "object" ? source[tier] : 0);
    nbReplantations[tier] = Number.isInteger(brut) && brut >= 0 ? brut : 0;
  }
  // Sac de graines : champ de la v8, validé entrée par entrée.
  sacGraines = [];
  for (let tier = 0; tier <= reglages.length; tier++) {
    const brut = Array.isArray(sauvegarde.sacGraines) ? sauvegarde.sacGraines[tier] : null;
    if (!brut || typeof brut !== "object" || tier < 1) { sacGraines[tier] = null; continue; }
    const g = Number.isInteger(brut.graines) && brut.graines >= 0 ? Math.min(MAX_GRAINES_SAC, brut.graines) : 0;
    const fr = Number.isInteger(brut.fragments) && brut.fragments >= 0 ? brut.fragments : 0;
    sacGraines[tier] = { graines: g, fragments: Math.min(fr, fragmentsParGraine(tier) - 1) };
  }
  nbHybridations = Number.isInteger(sauvegarde.nbHybridations) && sauvegarde.nbHybridations >= 0
    ? sauvegarde.nbHybridations : 0;
  // Améliorations du laboratoire : champ additif, absent des sauvegardes antérieures.
  const ameliorationsSauvees = sauvegarde.ameliorationsLabo;
  ameliorationsLabo = {
    l1: ameliorationsSauvees && Number.isInteger(ameliorationsSauvees.l1) && ameliorationsSauvees.l1 >= 0
      ? ameliorationsSauvees.l1 : 0,
    l2: ameliorationsSauvees && Number.isInteger(ameliorationsSauvees.l2) && ameliorationsSauvees.l2 >= 0
      ? ameliorationsSauvees.l2 : 0,
    l3: ameliorationsSauvees && Number.isInteger(ameliorationsSauvees.l3) && ameliorationsSauvees.l3 >= 0
      ? ameliorationsSauvees.l3 : 0
  };
  graines = Array.isArray(sauvegarde.graines)
    ? sauvegarde.graines.filter(function (g) {
        const d = g && typeof g === "object" ? g.definition : null;
        // Une graine n'est gardée que si sa définition est plantable quelque part.
        return d && typeof d === "object"
          && Number.isFinite(d.tier) && Number.isInteger(d.nbPetales)
          && d.nbPetales >= 1 && d.nbPetales <= 12 && d.dureeBase > 0
          && Number.isFinite(d.gainCycle) && Number.isFinite(d.bonusComplet)
          && Number.isFinite(d.partColoreeMax);
      })
    : [];
  // Identifiants uniques et numériques (les graines sont retrouvées par id).
  {
    const vus = new Set();
    let suivant = 1;
    for (const g of graines) { if (Number.isInteger(g.id) && g.id >= suivant) suivant = g.id + 1; }
    for (const g of graines) {
      if (!Number.isInteger(g.id) || vus.has(g.id)) g.id = suivant++;
      vus.add(g.id);
    }
  }
  // Une fusion en cours reprend avec son temps restant ; hors ligne, elle n'avance pas.
  hybridationEnCours = null;
  const fusionSauvee = sauvegarde.hybridationEnCours;
  if (fusionSauvee
    && Number.isInteger(fusionSauvee.slotA) && Number.isInteger(fusionSauvee.slotB)
    && fusionSauvee.slotA >= 0 && fusionSauvee.slotA < fleurs.length
    && fusionSauvee.slotB >= 0 && fusionSauvee.slotB < fleurs.length
    && Array.isArray(fusionSauvee.choix) && fusionSauvee.choix.length === 2
    && fusionSauvee.resultat && typeof fusionSauvee.resultat === "object"
    && Number.isFinite(fusionSauvee.tempsRestant) && fusionSauvee.tempsRestant >= 0) {
    hybridationEnCours = {
      slotA: fusionSauvee.slotA,
      slotB: fusionSauvee.slotB,
      choix: fusionSauvee.choix.slice(0, 2),
      resultat: fusionSauvee.resultat,
      cout: Number(fusionSauvee.cout) || 0,
      gainPM: Number(fusionSauvee.gainPM) || 0,
      tempsRestant: fusionSauvee.tempsRestant
    };
  }
  // Champs additifs : absents des anciennes sauvegardes (les automatisations restent à débloquer).
  autos.cycle.actif = sauvegarde.autoCycleActif === true;
  autos.cycle.achete = sauvegarde.autoCycleAchete === true || autos.cycle.actif;
  autos.petales.actif = sauvegarde.autoPetalesActif === true;
  autos.petales.achete = sauvegarde.autoPetalesAchete === true || autos.petales.actif;
  autos.vitesse.actif = sauvegarde.autoVitesseActif === true;
  autos.vitesse.achete = sauvegarde.autoVitesseAchete === true || autos.vitesse.actif;
  autos.fleur.actif = sauvegarde.autoFleurActif === true;
  autos.fleur.achete = sauvegarde.autoFleurAchete === true || autos.fleur.actif;
  autos.ameliorations.actif = sauvegarde.autoAmeliorationsActif === true;
  autos.ameliorations.achete = sauvegarde.autoAmeliorationsAchete === true || autos.ameliorations.actif;
  // Seuils « à conserver » : objet de la v9. Chaque entrée est validée ;
  // une valeur absente ou invalide retombe sur le défaut.
  {
    const seuilsSauves = sauvegarde.seuilsPetales && typeof sauvegarde.seuilsPetales === "object"
      ? sauvegarde.seuilsPetales : {};
    seuilsPetales = {};
    for (const cle of Object.keys(SEUILS_PETALES_DEFAUT)) {
      const brut = seuilsSauves[cle];
      seuilsPetales[cle] = Number.isFinite(brut) && brut >= 0
        ? Math.floor(brut) : SEUILS_PETALES_DEFAUT[cle];
    }
  }
  voies[0].encours = sauvegarde.bac1encours === true;
  voies[0].progression = sauvegarde.bac1progression || 0;
  {
    // Sauvegarde d'avant l'automatisation : le compost tournait seul, on garde ce comportement.
    const ancienne = sauvegarde.autoCompostDebloque === undefined;
    autoCompostDebloque = sauvegarde.autoCompostDebloque === true || (sauvegarde.conversionsBac1 || 0) > 0;
    autoCompostActif = ancienne ? autoCompostDebloque : sauvegarde.autoCompostActif === true;
    // Ferments : objet { bac1, bac1b, bac2, bac3 } (les anciens formats sont ignorés).
    const idsValides = PETALES_COULEURS.map(function (c) { return c.id; });
    for (const cle of CERCLES) {
      const choisi = sauvegarde.fermentsChoisis && !Array.isArray(sauvegarde.fermentsChoisis)
        ? sauvegarde.fermentsChoisis[cle] : "";
      const paye = sauvegarde.fermentsPayes && !Array.isArray(sauvegarde.fermentsPayes)
        ? sauvegarde.fermentsPayes[cle] : "";
      fermentsChoisis[cle] = idsValides.indexOf(choisi) >= 0 ? choisi : "";
      fermentsPayes[cle] = idsValides.indexOf(paye) >= 0 ? paye : "";
    }
  }
  secondeConversionAchetee = sauvegarde.secondeConversionAchetee === true;
  voies[1].encours = sauvegarde.bac1bencours === true;
  voies[1].progression = sauvegarde.bac1bprogression || 0;
  compostMature = sauvegarde.compostMature || 0;
  compostFertile = sauvegarde.compostFertile || 0;
  bac2progression = sauvegarde.bac2progression || 0;
  bac3progression = sauvegarde.bac3progression || 0;
  conversionsBac1 = sauvegarde.conversionsBac1 || 0;
  conversionsBac2 = sauvegarde.conversionsBac2 || 0;
  conversionsBac3 = sauvegarde.conversionsBac3 || 0;
  if (sauvegarde.arbreAmeliorations && sauvegarde.arbreAmeliorations.niveaux) {
    arbreAmeliorations.niveaux.c1 = Math.min(5, sauvegarde.arbreAmeliorations.niveaux.c1 || 0);
    arbreAmeliorations.niveaux.c2 = Math.min(25, sauvegarde.arbreAmeliorations.niveaux.c2 || 0);
    arbreAmeliorations.niveaux.c3 = Math.min(20, sauvegarde.arbreAmeliorations.niveaux.c3 || 0);
    arbreAmeliorations.niveaux.c4 = Math.min(10, sauvegarde.arbreAmeliorations.niveaux.c4 || 0);
     arbreAmeliorations.niveaux.c5 = Math.min(10, sauvegarde.arbreAmeliorations.niveaux.c5 || 0);
     arbreAmeliorations.niveaux.c6 = Math.min(10, sauvegarde.arbreAmeliorations.niveaux.c6 || 0);
     arbreAmeliorations.niveaux.c7 = Math.min(10, sauvegarde.arbreAmeliorations.niveaux.c7 || 0);
     arbreAmeliorations.niveaux.c8 = Math.min(1, sauvegarde.arbreAmeliorations.niveaux.c8 || 0);
     arbreAmeliorations.niveaux.c9 = Math.min(10, sauvegarde.arbreAmeliorations.niveaux.c9 || 0);
     arbreAmeliorations.niveaux.c10 = Math.min(1, sauvegarde.arbreAmeliorations.niveaux.c10 || 0);
     arbreAmeliorations.niveaux.c11 = Math.min(5, sauvegarde.arbreAmeliorations.niveaux.c11 || 0);
  }
  // Le drapeau historique et le niveau c8 doivent rester cohérents :
  // une ancienne sauvegarde peut n'avoir que l'un des deux.
  if (secondeConversionAchetee) arbreAmeliorations.niveaux.c8 = 1;
  if (arbreAmeliorations.niveaux.c8 >= 1) secondeConversionAchetee = true;
  // c2 donne +2 d'enrichissement par niveau : on recalcule depuis le niveau (l'ancienne
  // sauvegarde comptait 1 par niveau).
  enrichissement = Math.min(50, 2 * arbreAmeliorations.niveaux.c2);
  if (sauvegarde.petalesCouleurs) {
    for (const c of PETALES_COULEURS) {
      petalesCouleurs[c.id] = sauvegarde.petalesCouleurs[c.id] || 0;
    }
  }

  const emplacementsSauves = sauvegarde.emplacements || [];
  for (let i = 0; i < fleurs.length; i++) {
    const f = fleurs[i];
    const s = emplacementsSauves[i];
    if (!s) {
      continue;   // emplacement absent de la sauvegarde : on garde son état neuf
    }
    // Mémoire de plantation : vraie dès qu'une plante y a vécu, même après un vidage.
    f.dejaPlante = s.dejaPlante === true;
    if (s.etat === "plante") {
      // Une plante sans définition lisible retombe sur l'espèce classique de son emplacement.
      let def = { tier: s.tier, nom: s.nom, nbPetales: s.nbPetales, dureeBase: s.dureeBase,
        plancher: s.plancher,
        prix: s.prix, prixPremierPetale: s.prixPremierPetale, hybride: s.hybride, parents: s.parents,
        generation: s.generation ?? 0, gainCycle: s.gainCycle ?? null,
        bonusComplet: s.bonusComplet ?? null, partColoreeMax: s.partColoreeMax ?? null };
      const valide = Number.isFinite(def.tier) && Number.isInteger(def.nbPetales)
        && def.nbPetales >= 1 && def.nbPetales <= capacitePetales(i) && def.dureeBase > 0;
      if (!valide) {
        if (i >= reglages.length) continue;
        def = definitionEspece(i + 1);
      }
      appliquerDefinition(f, def);
      f.etat = "plante";
      f.graineId = s.graineId ?? null;
      f.cycle = s.cycle || 0;
      f.completions = s.completions || 0;
      f.niveauVitesse = s.niveauVitesse || 0;
      f.progression = s.progression || 0;
      f.petalesAchetes = Math.min(s.petalesAchetes || 0, f.nbPetales);
      const petalesSauves = s.petales || [];
      for (let rang = 0; rang < f.nbPetales; rang++) {
        const p = f.petales[rang];
        const sp = petalesSauves[rang];
        if (!sp) continue;
        p.progression = sp.progression || 0;
        p.achete = sp.achete === true;
        p.teinte = migrerTeinte(sp.teinte);
        // Teinte absente sur un pétale en cours (migration v4 -> v5) : nouveau tirage.
        if (p.achete && !sp.teinte) {
          p.teinte = tirerTeinte(f);
        }
      }
    } else if (s.etat === "vide") {
      appliquerDefinition(f, null);
      reinitialiserCroissance(f);
      f.etat = "vide";
    } else if (s.etat === "verrouille") {
      appliquerDefinition(f, i < reglages.length ? definitionEspece(i + 1) : null);
      f.etat = "verrouille";
    }
  }
  // Graines hybrides à usage unique : une graine déjà en pousse (ancienne sauvegarde) est plantée.
  for (const g of graines) {
    g.plantee = g.plantee === true || plantationsEnCoursDeGraine(g.id) > 0;
  }
}

//#region pétales colorés et panneau Sol
function afficherPetalesCouleurs() {
  for (const c of PETALES_COULEURS) {
    const el = affichageCompteursCouleurs[c.id];
    if (el) el.textContent = formaterNombre(petalesCouleurs[c.id]);
  }
}

let refsSol = { segments: {}, chances: {} };

function construirePanneauSol() {
  const barre = document.getElementById("solBarre");
  const liste = document.getElementById("solListe");
  if (!barre || !liste) return;
  const toutes = [{ id: "blancs", nom: "Blancs", hex: COULEUR_PETALE_BLANC }].concat(PETALES_COULEURS);
  for (const c of toutes) {
    const segment = document.createElement("div");
    segment.className = "sol-segment";
    segment.style.background = c.hex;
    barre.appendChild(segment);
    refsSol.segments[c.id] = segment;

    const ligne = document.createElement("div");
    ligne.className = "sol-ligne";
    const pastille = document.createElement("span");
    pastille.className = "sol-pastille";
    pastille.style.background = c.hex;
    const nom = document.createElement("span");
    nom.className = "sol-nom";
    nom.textContent = c.nom;
    const chance = document.createElement("span");
    chance.className = "sol-chance";
    ligne.appendChild(pastille);
    ligne.appendChild(nom);
    ligne.appendChild(chance);
    liste.appendChild(ligne);
    refsSol.chances[c.id] = chance;
  }
}

function rafraichirPanneauSol() {
  if (!fleurSolOuverte) return;
  const f = fleurSolOuverte;
  const pourcentages = pourcentagesTirage(f);
  const ids = ["blancs"].concat(PETALES_COULEURS.map(function (c) { return c.id; }));
  const actives = nombreCouleursActives();
  // Part réellement colorée : somme des chances des couleurs débloquées
  let part = 0;
  for (let i = 1; i < pourcentages.length; i++) part += pourcentages[i];
  poser(document.getElementById("panneauSolTitre"), "textContent", "Sol — " + f.nom);
  poser(document.getElementById("solResume"), "textContent",
    "Part colorée : " + formaterChance(part) + " (" + texteDetailPlafond(f) + ") · "
    + actives + "/6 couleurs actives"
    + (ageDe(f) === "semis" ? " · Semis : pétales blancs uniquement" : ""));
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    refsSol.segments[id].style.width = pourcentages[i].toFixed(4) + "%";
    refsSol.chances[id].textContent = formaterChance(pourcentages[i]);
  }
}

function ouvrirSol(f) {
  if (fleurSolOuverte === f) {
    fermerSol();
    return;
  }
  fleurSolOuverte = f;
  const panneau = document.getElementById("panneau-sol");
  panneau.hidden = false;
  // Positionne le panneau quasi collé au bouton Sol qui l'a ouvert.
  const rect = f.boutonSol.getBoundingClientRect();
  const largeur = Math.min(340, window.innerWidth - 24);
  let left = rect.right + 8;
  if (left + largeur > window.innerWidth - 12) {
    left = rect.left - largeur - 8;
  }
  if (left < 12) left = 12;
  let top = rect.bottom + 8;
  if (top + panneau.offsetHeight > window.innerHeight - 12) {
    top = rect.top - panneau.offsetHeight - 8;
  }
  if (top < 12) top = 12;
  panneau.style.left = left + "px";
  panneau.style.right = "auto";
  panneau.style.top = top + "px";
  panneau.style.bottom = "auto";
  rafraichirPanneauSol();
}

function fermerSol() {
  fleurSolOuverte = null;
  document.getElementById("panneau-sol").hidden = true;
}
//#endregion

function rafraichirAffichage() {
  afficherTemps();
  afficherVerdance();
  affichercompost();
  afficherBarreBac1();
  afficherBacs23();
  rafraichirCommandesCompost();
  affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
  affichageCyclesFinis.textContent = cyclesFinis;
  afficherPetalesCouleurs();
  afficherPM();
  rafraichirSac();

  for (const f of fleurs) {
    rafraichirCarte(f);
  }
  rafraichirPanneauSeuils();
  rafraichirDeblocages();
}
//#endregion

//#region affichage
// Chaque barre de section (parterre, compost, laboratoire) reste en tête de sa
// section tant que celle-ci est visible. Dès que son emplacement passe sous la
// barre de ressources, la barre est épinglée juste en dessous des précédentes
// (ordre fixe, sans espace). L'emplacement garde la place de la barre.
const BARRES_SECTIONS = ["parterre", "compost", "laboratoire"];
function ajusterBarre() {
  const barreR = document.getElementById("barre-ressources");
  // 1) Toutes les lectures de mise en page d'abord (un seul reflow)...
  let haut = barreR.getBoundingClientRect().height;
  const infos = [];
  for (const id of BARRES_SECTIONS) {
    const emplacement = document.getElementById("emplacement-" + id);
    const barre = document.getElementById("barre-" + id);
    if (!emplacement || !barre) continue;
    infos.push({
      emplacement: emplacement,
      barre: barre,
      epinglee: barre.classList.contains("epinglee"),
      hautNaturel: emplacement.getBoundingClientRect().top,
      hauteur: barre.getBoundingClientRect().height
    });
  }
  // 2) ... puis toutes les écritures. Si une barre change de hauteur en passant en
  // position fixe, le ResizeObserver relance un recalage au tour suivant.
  for (const i of infos) {
    if (i.hautNaturel <= haut) {
      if (!i.epinglee) {
        i.emplacement.style.height = i.hauteur + "px";
        i.barre.classList.add("epinglee");
      }
      const top = haut + "px";
      if (i.barre.style.top !== top) i.barre.style.top = top;
      haut += i.hauteur;
    } else if (i.epinglee) {
      i.barre.classList.remove("epinglee");
      i.barre.style.top = "";
      i.emplacement.style.height = "";
    }
  }
}
// Au plus un recalage par image : scroll, resize, ResizeObserver et déblocages
// passent tous par là au lieu d'appeler ajusterBarre() chacun de leur côté.
let barreEnAttente = false;
function planifierAjusterBarre() {
  if (barreEnAttente) return;
  barreEnAttente = true;
  requestAnimationFrame(function () {
    barreEnAttente = false;
    ajusterBarre();
  });
}
ajusterBarre();
window.addEventListener("scroll", planifierAjusterBarre, { passive: true });
window.addEventListener("resize", planifierAjusterBarre);
window.addEventListener("load", planifierAjusterBarre);
requestAnimationFrame(function () {
  ajusterBarre();
  requestAnimationFrame(ajusterBarre);
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(planifierAjusterBarre);
}
// Filet de sécurité : si une barre change de hauteur (texte, zoom, police), on recale les suivantes
setInterval(planifierAjusterBarre, 1000);
// Recalcule aussi si la barre de ressources change de hauteur (redimensionnement, zoom, police)
if (window.ResizeObserver) {
  const observateur = new ResizeObserver(planifierAjusterBarre);
  observateur.observe(document.getElementById("barre-ressources"));
  for (const id of BARRES_SECTIONS) {
    observateur.observe(document.getElementById("barre-" + id));
  }
}

function afficherVerdance() {
  affichageVerdance.textContent = formaterVerdance(verdance);
  etatSale = true;   // la verdance a changé : les boutons seront recalculés au prochain tour
}

function formater3(x) {
  return x.toFixed(3).replace(".", ",");
}

function mettreAJourGain() {
  const bonusCycles = 1.01 ** cyclesFinis;
  const bonusPetales = 1 + 0.001 * petalesBlancs;
  let bonusCouleurs = 1;
  const facteursPetales = [];
  for (const c of PETALES_COULEURS) {
    // Coefficient propre à la couleur : 0,001 pour les violettes, 0,01 pour le bleu.
    const facteur = 1 + (c.bonusParPetale ?? 0.001) * petalesCouleurs[c.id];
    bonusCouleurs = bonusCouleurs * facteur;
    // Pastille de la couleur du pétale : plus de libellé dans la formule.
    facteursPetales.push(
      '<span class="f-fleur f-' + c.id + '" title="' + c.nom + " : ×" + formater3(facteur) + '">'
      + formater3(facteur) + "</span>"
    );
  }
  const facteurCompost = bonusCompost();
  const facteurVerdance = Math.pow(1.05, arbreNiveau("c7"));
  multiplicateur = bonusCycles * bonusPetales * bonusCouleurs * facteurCompost * facteurVerdance;
  affichageGainParFleur.textContent = formaterGain(gainDeBase * multiplicateur);
  affichageDetailGain.innerHTML = '<span class="f-sep">(</span>' + [
    '<span class="f-base" title="Gain de base par fleur complétée">' + gainDeBase + "</span>",
    '<span class="f-cycle" title="Cycles terminés : ' + cyclesFinis + ' (1,01^' + cyclesFinis + ')">'
      + formater3(bonusCycles) + "</span>",
    '<span class="f-fleur f-blanc" title="Pétales blancs : ' + formaterNombre(petalesBlancs) + '">'
      + formater3(bonusPetales) + "</span>",
    ...facteursPetales,
    '<span class="f-compost" title="BonusCompost : ×' + formater3(facteurCompost) + '">'
      + formater3(facteurCompost) + "</span>",
    '<span class="f-verdance" title="Bonus gain Verdance : ×' + formater3(facteurVerdance) + '">'
      + formater3(facteurVerdance) + "</span>"
  ].join('<span class="f-sep"> × </span>') + '<span class="f-sep">)</span>';
}

function majTextesFleur(f) {
  const dureeF = dureeActuelle(f);
  rafraichirAgeVisuel(f);
  // poser() n'écrit que si la valeur a changé : plus de réécriture inutile du DOM.
  poser(f.cycleAffiche, "textContent", "Cycle " + f.cycle + " · " + NOMS_AGES[ageDe(f)] + " : " + f.completions + "/" + seuil(f.cycle));
  poser(f.boutonCycle, "textContent", "Terminer cycle " + f.cycle + " : +" + (f.gainCycle ?? f.tier) + ICONES.cycle + " (" + formaterNombre(prixCycleFleur(f, f.cycle)) + " " + ICONES.verdance + ")");
  // Infobulle du centre : durée de la fleur
  poser(f.titreCentre, "textContent", "Durée : " + formaterDuree(dureeF) + " (minimum : " + formaterDuree(plancherDuree(f)) + ")");

  if (dureeF <= plancherDuree(f)) {
    poser(f.boutonVitesse, "textContent", ICONES.vitesse + " Max");
    poser(f.boutonVitesseMax, "textContent", ICONES.vitesse + " Max");
  } else {
    poser(f.boutonVitesse, "textContent", ICONES.vitesse + "x1 (" + formaterNombre(prixVitesseFleur(f, f.niveauVitesse)) + " " + ICONES.verdance + ")");
    const suivante = Math.max(plancherDuree(f), dureeF * FACTEUR_VITESSE);
    const texteSuivante = suivante <= plancherDuree(f) ? "Max" : formaterDuree(suivante);
    poser(f.boutonVitesse, "title", formaterDuree(dureeF) + " → " + texteSuivante);
    // Bouton Max : prix total achetable selon la verdance actuelle (résultat mis en cache).
    const totalMax = calculerAchatVitesseMax(f).total;
    poser(f.boutonVitesseMax, "textContent", ICONES.vitesse + " Max (" + formaterNombre(totalMax) + " " + ICONES.verdance + ")");
  }
}

function mettreAJourBoutons() {
  etatSale = false;
  dernierRecalculBoutons = performance.now();
  mettreAJourBoutonsSpeciales();
  for (const p of petales) {
    const plantee = p.fleur.etat === "plante";
    p.bouton.disabled = verdance < p.prix || !plantee || fleurComplete(p.fleur);
    // Seul le prochain pétale à acheter montre son bouton (et seulement si la fleur est plantée)
    if (p.existe && plantee && !p.achete && p.rang === p.fleur.petalesAchetes) {
      p.bouton.style.display = "";
    } else {
      p.bouton.style.display = "none";
    }
  }
  for (const f of fleurs) {
    const plantee = f.etat === "plante";
    // Bouton d'achat : emplacement verrouillé avec une définition, dont la précédente a déjà été plantée
    const achetable = boutonFleurAchetable(f);
    f.bouton.disabled = !achetable || verdance < f.prix;
    f.bouton.style.display = achetable ? "" : "none";
    // Une carte est visible si elle contient une plante, si elle est libre, ou si elle est achetable
    // Une carte inaccessible reste dans la grille (invisible) : les 12 places restent fixes,
    // sinon la pollinisation entre voisines ne correspondrait plus à ce qui est affiché.
    f.visible = (plantee || f.etat === "vide" || achetable);
    f.div.style.visibility = f.visible ? "" : "hidden";
    f.div.classList.toggle("verrouillee", !plantee);
    f.contenu.style.display = plantee ? "" : "none";
    f.verrou.style.display = f.etat === "verrouille" ? "" : "none";
    f.vide.style.display = f.etat === "vide" ? "flex" : "none";
    f.boutonPlanter.style.display = (f.etat === "vide" && f.slot < reglages.length) ? "" : "none";
    if (plantee) {
      f.boutonCycle.disabled = verdance < prixCycleFleur(f, f.cycle) || f.completions < seuil(f.cycle);
      f.boutonVitesse.disabled = verdance < prixVitesseFleur(f, f.niveauVitesse) || (dureeActuelle(f) <= plancherDuree(f));
      f.boutonVitesse.hidden = (dureeActuelle(f) <= plancherDuree(f));
      f.boutonVitesseMax.disabled = (dureeActuelle(f) <= plancherDuree(f)) || verdance < prixVitesseFleur(f, f.niveauVitesse);
      f.boutonVitesseMax.hidden = (dureeActuelle(f) <= plancherDuree(f));
      majTextesFleur(f);
    } else {
      f.boutonCycle.disabled = true;
      f.boutonVitesse.disabled = true;
      f.boutonVitesse.hidden = true;
      f.boutonVitesseMax.disabled = true;
      f.boutonVitesseMax.hidden = true;
    }
    // Bouton Sol : invisible (mais il garde sa place, la hauteur des cartes ne change pas)
    // tant que le compost n'est pas débloqué.
    f.boutonSol.style.visibility = compostDebloque() ? "visible" : "hidden";
    f.boutonSol.style.opacity = "0.8";
  }
  // Le parterre ne grandit que par lignes de 4 : on affiche les lignes jusqu'à la dernière
  // qui contient une carte visible (lignes toujours contiguës, donc les voisines restent justes).
  let derniereLigne = 0;
  for (const f of fleurs) {
    if (f.visible) derniereLigne = Math.max(derniereLigne, Math.floor(f.slot / COLONNES_PARTERRE));
  }
  let ligneChangee = false;
  for (const f of fleurs) {
    const affichee = Math.floor(f.slot / COLONNES_PARTERRE) <= derniereLigne ? "" : "none";
    if (f.div.style.display !== affichee) { f.div.style.display = affichee; ligneChangee = true; }
  }
  if (ligneChangee) planifierAjusterBarre();
  boutonToutAcheter.disabled = achatsPossibles().length === 0;
  rafraichirDeblocages();
}
//#endregion

//#region Formater les nombres
function formaterTemps(secondes) {
  secondes = Math.round(secondes);
  if (secondes < 60) {
    return secondes + " s";
  }
  if (secondes < 3600) {
    let minutes = Math.floor(secondes / 60);
    let reste = secondes % 60;
    return minutes + " min " + reste + " s";
  }
  if (secondes < 86400) {
    let heures = Math.floor(secondes / 3600);
    let reste = secondes % 3600;
    let minutes = Math.floor(reste / 60);
    return heures + " h " + minutes + " min";
  }
  let jours = Math.floor(secondes / 86400);
  let reste = secondes % 86400;
  let heures = Math.floor(reste / 3600);
  return jours + " j " + heures + " h";
}

function formaterDuree(secondes) {
  if (secondes < 60) {
    return secondes.toFixed(2) + " s";
  }
  return formaterTemps(secondes);
}

function formaterNombre(x) {
  if (x < 1e6) {
    return Math.round(x).toLocaleString("fr-FR");
  }
  return x.toExponential(2);
}

function formaterGain(x) {
  if (!Number.isFinite(x)) return String(x).replace(".", ",");
  if (x < 1000) {
    const texte = x.toFixed(5).replace(".", ",");
    if (Number(texte.replace(",", ".")) < 1000) return texte;
  }
  if (x < 1e6 && Math.round(x) < 1e6) {
    return Math.round(x).toLocaleString("fr-FR");
  }
  const [mantisse, exposant] = x.toExponential(2).split("e");
  const chiffres = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const exp = exposant.replace("+", "").replace("-", "⁻")
    .split("").map((c) => chiffres[Number(c)]).join("");
  return mantisse.replace(".", ",") + "×10" + exp;
}

function formaterVerdance(x) {
  if (x < 1000) {
    return x.toFixed(2);
  }
  return formaterNombre(x);
}

function formaterCompost(x) {
  if (x < 1000) {
    return x.toFixed(3);
  }
  return formaterNombre(x);
}

// Prix compacts pour les petits boutons posés sur le dessin (1500 -> 1.5k, 2000000 -> 2M ...)
// Au-delà de 1e15, la notation « k/M/G/T » deviendrait illisible : on passe
// en notation scientifique compacte (1e18, 2.5e21) pour tenir dans le bouton.
function formaterPrix(x) {
  if (!Number.isFinite(x)) return "∞";
  if (x >= 1e15) {
    const exposant = Math.floor(Math.log10(x));
    const mantisse = x / 10 ** exposant;
    return mantisse.toFixed(1).replace(/\.0$/, "") + "e" + exposant;
  }
  const unites = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"]];
  for (const [seuilU, lettre] of unites) {
    if (x >= seuilU) {
      const v = x / seuilU;
      return (v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)) + lettre;
    }
  }
  return String(x);
}

// Temps très court pour tenir au centre de la fleur (ex : 45s, 3m05s, 2h05m, 3j05h)
function formaterTempsCourt(secondes) {
  const s = Math.ceil(secondes);
  const deux = function (n) { return String(n).padStart(2, "0"); };
  if (s < 60) {
    return s + "s";
  }
  if (s < 3600) {
    return Math.floor(s / 60) + "m" + deux(s % 60) + "s";
  }
  if (s < 86400) {
    return Math.floor(s / 3600) + "h" + deux(Math.floor((s % 3600) / 60)) + "m";
  }
  return Math.floor(s / 86400) + "j" + deux(Math.floor((s % 86400) / 3600)) + "h";
}
//#endregion

//#region fleur
function fibo(n) {
  let a = 1;
  let b = 2;
  for (let i = 1; i < n; i++) {
    let suivant = a + b;
    a = b;
    b = suivant;
  }
  return a;
}

// Seuil de base d'un cycle (sans « Pousse Rapide »).
function seuilBase(cycle) {
  // Premier cycle accéléré (option A/C) : 6 floraisons au lieu de 10.
  // Les cycles suivants gardent leur seuil d'origine.
  if (cycle === 0) return 6;
  let a = 10;
  let b = 20;
  for (let i = 0; i < cycle; i++) {
    let suivant = a + b;
    a = b;
    b = suivant;
  }
  return a;
}

// Seuil réel : « Pousse Rapide » (c11) multiplie le seuil par 0,96 à chaque niveau,
// arrondi à l'entier le plus proche pour garder des objectifs de cycle ronds.
function seuil(cycle) {
  return Math.max(1, Math.round(seuilBase(cycle) * Math.pow(0.96, arbreNiveau("c11"))));
}

function prixCycle(tier, cycle) {
  // La base suit désormais la même croissance que les pétales (10^n) :
  // les cycles des grosses fleurs ne sont plus négligeables.
  // Le prix reste calculé sur le seuil de base : c11 ne baisse pas le prix des cycles.
  return seuilBase(cycle) * 10 ** (tier - 1) * 1.6 ** cycle * 0.5;
}

// Crochet propre aux fleurs : les 10 espèces classiques renvoient exactement
// prixCycle, et les fleurs spéciales utilisent provisoirement la même formule.
function prixCycleFleur(f, cycle) {
  return prixCycle(f.tier, cycle);
}

function prixVitesse(tier, niveau) {
  return 10 * 4 ** (tier - 1) * CROISSANCE_VITESSE_FIXE ** niveau;
}

function plancherDuree(f) {
  return f.plancher != null ? f.plancher : f.tier * 5;
}

function dureeActuelle(f) {
  return Math.max(plancherDuree(f), f.dureeBase * FACTEUR_VITESSE ** f.niveauVitesse);
}

function fleurComplete(f) {
  return f.nbPetales > 0 && f.petalesAchetes === f.nbPetales;
}

// ------------------------------------------------------------
// DÉBLOCAGES DE PANNEAU
// ------------------------------------------------------------
// Le compost s'ouvre quand la fleur 3 est complète (les 3 pétales).
// Les anciennes sauvegardes qui ont déjà produit du compost restent ouvertes.
// Une fois ouvert, le compost le reste (compostDeverrouille) : retirer ou fusionner
// la fleur de tier 3 plus tard ne doit pas le reverrouiller.
function compostDebloque() {
  if (!compostDeverrouille) {
    const f3 = fleurs.find(function (f) { return f.etat === "plante" && !f.hybride && f.tier === 3; });
    if ((f3 && fleurComplete(f3))
      || compost > 0 || compostMature > 0 || compostFertile > 0 || conversionsBac1 > 0) {
      compostDeverrouille = true;
    }
  }
  return compostDeverrouille;
}

// Le laboratoire s'ouvre après 5 pétales mauves (3e couleur).
function laboratoireDebloque() {
  return petalesCouleurs.mauveRose >= 5;
}
function testDeverrouillerTout() {
  petalesCouleurs.mauveRose = 10;
  arbreAmeliorations.niveaux.c1 = 5;
  rafraichirArbreCompost();
  rafraichirAmeliorations();
  rafraichirDeblocages();
}

// ------------------------------------------------------------
// AMÉLIORATIONS DU LABORATOIRE (prompt 7)
// Une seule structure décrit les trois améliorations : nom, effet, niveaux,
// prix de départ, croissance, prérequis. Les niveaux sont dans ameliorationsLabo.
// ------------------------------------------------------------
const AMELIORATIONS_LABO = [
  {
    id: "l1",
    nom: "Nouvelle couleur : bleu",
    effet: "Débloque la 6ᵉ couleur de pétale.",
    max: 1,
    prixDepart: 10,
    croissance: 1,
    compostMatureDepart: 0,
    prerequis: "Couleur violette débloquée"
  },
  {
    id: "l2",
    nom: "Raison géométrique",
    effet: "q = 0,02 + 0,01 × niveau.",
    max: 10,
    prixDepart: 50,
    croissance: 1.2,
    compostMatureDepart: 0,
    prerequis: "Nouvelle couleur : bleu"
  },
  {
    id: "l3",
    nom: "Emplacements 11 et 12",
    effet: "Débloque l'emplacement 11, puis le 12.",
    max: 2,
    prixDepart: 20,
    croissance: 25,
    compostMatureDepart: 10,
    prerequis: null
  }
];

function ameliorationParId(id) {
  for (const a of AMELIORATIONS_LABO) {
    if (a.id === id) return a;
  }
  return null;
}

function niveauAmelioration(id) {
  const n = ameliorationsLabo ? ameliorationsLabo[id] : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Prix du niveau `niveau` (0 = premier achat) : prixDépart × croissance^n, arrondi.
// Le compost mature suit la même croissance (10 puis 250 pour l3).
function prixAmelioration(id, niveau) {
  const a = ameliorationParId(id);
  if (!a) return { pm: Infinity, compostMature: Infinity };
  const n = Number.isInteger(niveau) ? niveau : niveauAmelioration(id);
  return {
    pm: Math.round(a.prixDepart * Math.pow(a.croissance, n)),
    compostMature: Math.round((a.compostMatureDepart || 0) * Math.pow(a.croissance, n))
  };
}

// Raison géométrique du tirage : 0,02 par défaut, +0,01 par niveau de l2.
function raisonGeometrique() {
  return 0.02 + 0.01 * niveauAmelioration("l2");
}

// Couleurs actives : les niveaux de c1 (au plus 5), plus le bleu si l1 est achetée.
function nombreCouleursActives() {
  return Math.min(5, arbreNiveau("c1")) + (niveauAmelioration("l1") > 0 ? 1 : 0);
}

function bleuActif() {
  return niveauAmelioration("l1") > 0;
}

function prerequisAmelioration(id) {
  if (id === "l1") {
    // Débloquée à l'acquisition de la couleur violette (5e niveau de « Enrichir le sol »).
    return arbreNiveau("c1") >= 5
      ? { ok: true, raison: null }
      : { ok: false, raison: "Couleur violette requise (Enrichir le sol 5/5)" };
  }
  if (id === "l2") {
    return niveauAmelioration("l1") > 0
      ? { ok: true, raison: null }
      : { ok: false, raison: "Nouvelle couleur : bleu requise" };
  }
  return { ok: true, raison: null };
}

// Retourne la raison du refus, ou null si l'achat est possible.
function raisonAchatAmelioration(id) {
  const a = ameliorationParId(id);
  if (!a) return "Amélioration inconnue";
  const niveau = niveauAmelioration(id);
  if (niveau >= a.max) return "Niveau maximum";
  const prerequis = prerequisAmelioration(id);
  if (!prerequis.ok) return prerequis.raison;
  const prix = prixAmelioration(id, niveau);
  if (pm < prix.pm) return "PM insuffisants";
  if (compostMature < prix.compostMature) return "Compost mature insuffisant";
  return null;
}

function acheterAmelioration(id) {
  const a = ameliorationParId(id);
  if (!a || raisonAchatAmelioration(id) !== null) return false;
  const niveau = niveauAmelioration(id);
  const prix = prixAmelioration(id, niveau);
  if (prix.pm > 0 && !depenserPM(prix.pm)) return false;
  if (prix.compostMature > 0) {
    if (compostMature < prix.compostMature) {
      if (prix.pm > 0) ajouterPM(prix.pm);
      return false;
    }
    compostMature = compostMature - prix.compostMature;
    afficherBacs23();
  }
  ameliorationsLabo[id] = niveau + 1;
  // l3 débloque l'emplacement 11 (index 10) puis le 12 (index 11).
  if (id === "l3") {
    deverrouillerEmplacement(niveau === 0 ? 10 : 11);
  }
  rafraichirAmeliorations();
  rafraichirSpeciales();
  rafraichirPanneauSol();
  return true;
}

// ------------------------------------------------------------
// FLEURS SPÉCIALES 11 ET 12 (prompt 8)
// Achat dans le laboratoire, dans les emplacements réservés 10 et 11.
// ------------------------------------------------------------
function raisonAchatFleurSpeciale(tier) {
  const p = PARAMETRES_SPECIAUX[tier];
  if (!p) return "fleur inconnue";
  const f = fleurs[p.slot];
  if (!f || f.etat === "verrouille") return "emplacement non débloqué";
  if (f.etat !== "vide") return "déjà achetée";
  if (verdance < p.prix) return "Verdance insuffisante";
  return null;
}

function acheterFleurSpeciale(tier) {
  const p = PARAMETRES_SPECIAUX[tier];
  if (!p || raisonAchatFleurSpeciale(tier) !== null) return false;
  const avant = verdance;
  verdance = verdance - p.prix;
  // planter() vérifie aussi que la fleur spéciale va dans SON emplacement.
  if (!planter(p.slot, definitionEspeciale(tier))) {
    verdance = avant;
    afficherVerdance();
    return false;
  }
  afficherVerdance();
  rafraichirSpeciales();
  return true;
}

// Lignes de la section « Fleurs spéciales », reconstruites sur événement.
function rafraichirSpeciales() {
  const liste = document.getElementById("listeSpeciales");
  if (!liste) return;
  liste.innerHTML = Object.keys(PARAMETRES_SPECIAUX).map(function (cle) {
    const p = PARAMETRES_SPECIAUX[cle];
    const raison = raisonAchatFleurSpeciale(p.tier);
    const prixTexte = formaterNombre(p.prix) + " " + ICONES.verdance;
    return '<div class="labo-amelioration' + (raison ? " indisponible" : "") + '" id="special-ligne-' + p.tier + '">'
      + '<div class="labo-amelioration-entete"><b>' + echapperHtml(p.nom) + "</b>"
      + '<span class="labo-niveau">Tier ' + p.tier + "</span></div>"
      + '<p class="labo-effet">' + p.nbPetales + " pétales · " + formaterDuree(p.dureeBase)
      + " · plancher " + formaterDuree(p.plancher) + "</p>"
      + '<p class="labo-prerequis">Emplacement ' + (p.slot + 1) + " · " + prixTexte + "</p>"
      + '<div class="labo-achat">'
      + '<button type="button" id="special-' + p.tier + '" data-special="' + p.tier + '"'
      + (raison ? " disabled" : "") + ">Acheter — " + prixTexte + "</button>"
      + '<span class="labo-raison" id="raison-special-' + p.tier + '">'
      + echapperHtml(raison || "") + "</span>"
      + "</div></div>";
  }).join("");
}

// Met à jour les boutons déjà construits quand la Verdance change, sans
// recréer la liste à chaque tick.
function mettreAJourBoutonsSpeciales() {
  for (const tier of [11, 12]) {
    const p = PARAMETRES_SPECIAUX[tier];
    if (!p) continue;
    const bouton = document.getElementById("special-" + tier);
    const raisonTexte = document.getElementById("raison-special-" + tier);
    const ligne = document.getElementById("special-ligne-" + tier);
    if (!bouton) continue;
    const raison = raisonAchatFleurSpeciale(tier);
    bouton.disabled = raison !== null;
    if (raisonTexte) raisonTexte.textContent = raison || "";
    if (ligne) ligne.classList.toggle("indisponible", raison !== null);
  }
}



// --- Hybridation (sauvegarde v7) ---
// Une fusion produit une graine, pas une plante : la replantation viendra ensuite.
// La région « logique pure » reste sans DOM ni état : tout passe par ici.
const NOMS_CHOIX_HYBRIDATION = [
  { id: "additionner", libelle: "Additionner les pétales", champ: "nbPetales", suffixe: " pétales" },
  { id: "vigueur", libelle: "Vigueur (bonus complet)", champ: "bonusComplet", suffixe: "" },
  { id: "rapidite", libelle: "Rapidité (durée)", champ: "dureeBase", suffixe: " s" },
  { id: "gainCycle", libelle: "Gain par cycle", champ: "gainCycle", suffixe: "" },
  { id: "cycle0", libelle: "Repartir au cycle 0", champ: "cycle", suffixe: "" },
  { id: "partColoree", libelle: "Part colorée max", champ: "partColoreeMax", suffixe: " %" }
];

const LIBELLES_RAISON_HYBRIDATION = {
  "incomplete": "fleur incomplète",
  "meme-tier": "même tier",
  "special": "fleur spéciale (11/12)",
  "generation": "génération au-delà de 3",
  "verrouille": "emplacement verrouillé",
  "vide": "emplacement vide",
  "deja-choisie": "déjà choisie de l'autre côté"
};

function libelleRaisonHybridation(raison) {
  return LIBELLES_RAISON_HYBRIDATION[raison] || raison;
}

// Production de Verdance par seconde des plantes fournies (récapitulatif de fusion).
function productionVerdanceParSeconde(plantes) {
  let total = 0;
  for (const f of plantes) {
    if (!f || f.etat !== "plante" || f.tier === null) continue;
    total = total + gainDeBase * multiplicateur * bonusFleur(f) / dureeActuelle(f);
  }
  return total;
}

// État d'une plante au format « parent » attendu par la logique pure.
function parentDePlante(f) {
  return {
    tier: f.tier,
    hybride: !!f.hybride,
    generation: f.generation || 0,
    nbPetales: f.nbPetales,
    dureeBase: f.dureeBase,
    cycle: f.cycle,
    gainCycle: f.gainCycle ?? f.tier,
    bonusComplet: f.bonusComplet ?? valeurBonus(f.tier),
    partColoreeMax: f.partColoreeMax ?? 5 * f.tier,
    // Une fleur spéciale est une espèce non hybride de tier 11 ou 12.
    // Un hybride peut dépasser le tier 10 sans devenir spécial.
    special: !f.hybride && f.tier > 10,
    complete: fleurComplete(f)
  };
}

function coutHybridationPour(pa, pb) {
  return coutHybridation(Math.max(pa.tier, pb.tier), generationResultat(pa, pb), nbHybridations);
}

// Raison (texte) pour laquelle la fusion ne peut pas être lancée, ou null si valide.
// Utilisée à l'affichage ET revalidée à chaque clic (l'état peut avoir changé).
function raisonRefusHybridation(slotA, slotB, choix) {
  const coches = Array.isArray(choix) ? choix : [];
  if (hybridationEnCours) return "Une fusion est déjà en cours.";
  if (slotA === null || slotB === null || slotA === undefined || slotB === undefined) {
    return "Choisissez une fleur de chaque côté.";
  }
  if (slotA === slotB) return "Choisissez deux fleurs différentes.";
  const a = fleurs[slotA];
  const b = fleurs[slotB];
  if (!a || !b || a.etat !== "plante" || b.etat !== "plante") {
    return "Une des fleurs choisies n'est plus plantée.";
  }
  const pa = parentDePlante(a);
  const pb = parentDePlante(b);
  const verdict = peutFusionner(pa, pb);
  if (!verdict.ok) return "Fusion impossible : " + libelleRaisonHybridation(verdict.raison) + ".";
  if (coches.length !== 2) return "Cochez exactement 2 choix de fusion (" + coches.length + "/2).";
  if (coches[0] === coches[1]) return "Cochez deux choix différents.";
  const disponibles = choixDisponibles(pa, pb);
  for (const c of coches) {
    const dispo = disponibles.find(function (x) { return x.id === c; });
    if (!dispo) return "Choix inconnu : " + c + ".";
    if (!dispo.actif) return "Le choix « additionner » dépasserait 10 pétales.";
  }
  const cout = coutHybridationPour(pa, pb);
  if (verdance < cout) return "Verdance insuffisante (" + formaterNombre(cout) + " requis).";
  return null;
}

// Déroule une fusion : revalide, paie, retire les parents, mémorise la fusion.
function lancerHybridation(slotA, slotB, choix) {
  const coches = Array.isArray(choix) ? choix : [];
  if (raisonRefusHybridation(slotA, slotB, coches) !== null) return false;
  const a = fleurs[slotA];
  const b = fleurs[slotB];
  const pa = parentDePlante(a);
  const pb = parentDePlante(b);
  const resultat = caracteristiquesHybride(pa, pb, coches, noms);
  if (!resultat) return false;
  const cout = coutHybridationPour(pa, pb);

  // Payer en Verdance, puis retirer immédiatement les deux parents.
  verdance = verdance - cout;
  afficherVerdance();
  viderEmplacement(slotA);
  viderEmplacement(slotB);

  hybridationEnCours = {
    slotA: slotA,
    slotB: slotB,
    choix: [coches[0], coches[1]],
    resultat: resultat,
    cout: cout,
    gainPM: gainPM(pa.tier, pb.tier),
    tempsRestant: DUREE_HYBRIDATION
  };
  document.getElementById("hybResultat").textContent = "";
  rafraichirLaboratoire();
  return true;
}

function prochainIdGraine() {
  let max = 0;
  for (const g of graines) {
    if (g && Number.isFinite(g.id) && g.id > max) max = g.id;
  }
  return max + 1;
}

// Fin de fusion : PM crédités, graine ajoutée, compteur incrémenté.
// Appelée uniquement par le pas de jeu (jamais par le hors ligne).
function terminerHybridation() {
  const fusion = hybridationEnCours;
  if (!fusion) return;
  hybridationEnCours = null;
  ajouterPM(fusion.gainPM);
  graines.push({ id: prochainIdGraine(), definition: fusion.resultat });
  nbHybridations = nbHybridations + 1;
  const nom = fusion.resultat && fusion.resultat.nom ? fusion.resultat.nom : "hybride";
  document.getElementById("hybResultat").textContent =
    "Graine créée : " + nom + ", +" + fusion.gainPM + " PM";
  sauvegarder();
  rafraichirLaboratoire();
}

// ---------- Interface du laboratoire (texte/état, listes reconstruites sur événement) ----------
function echapperHtml(texte) {
  return String(texte).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function choixHybridationCoches() {
  const coches = [];
  for (const c of NOMS_CHOIX_HYBRIDATION) {
    const el = document.getElementById("choix-" + c.id);
    if (el && el.checked) coches.push(c.id);
  }
  return coches;
}

// ---------- Choix des fleurs A et B : 20 boutons créés une seule fois ----------
// L'état de sélection vit dans ces deux variables (null = aucune sélection).
// Le DOM n'est jamais recréé : seuls classes, disabled, title et textes changent.
let slotHybA = null;
let slotHybB = null;
const boutonsHybA = [];
const boutonsHybB = [];

// Construit les 10 boutons de chaque côté (emplacements 0 à 9 uniquement).
function creerBoutonsHybridation() {
  const zones = {
    A: document.getElementById("hybBoutonsA"),
    B: document.getElementById("hybBoutonsB")
  };
  for (const cote of ["A", "B"]) {
    const zone = zones[cote];
    const boutons = cote === "A" ? boutonsHybA : boutonsHybB;
    if (!zone || boutons.length > 0) continue;
    for (let slot = 0; slot < reglages.length; slot++) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "hyb-fleur";
      bouton.dataset.hybSlot = String(slot);
      bouton.dataset.hybCote = cote;
      const nom = document.createElement("span");
      nom.className = "hyb-fleur-nom";
      const meta = document.createElement("span");
      meta.className = "hyb-fleur-meta";
      bouton.appendChild(nom);
      bouton.appendChild(meta);
      zone.appendChild(bouton);
      boutons[slot] = { bouton: bouton, nom: nom, meta: meta };
    }
  }
}

// Raison pour laquelle ce bouton est indisponible (null = cliquable).
function raisonBoutonHybridation(slot, autreSlot) {
  const f = fleurs[slot];
  if (!f || f.etat === "verrouille") return "verrouille";
  if (f.etat !== "plante" || f.tier === null) return "vide";
  if (slot === autreSlot) return "deja-choisie";
  const pa = parentDePlante(f);
  if (!pa.complete) return "incomplete";
  if (pa.special) return "special";
  if (pa.generation >= GENERATION_MAX) return "generation";
  const autre = autreSlot !== null && autreSlot !== undefined ? fleurs[autreSlot] : null;
  if (autre && autre.etat === "plante") {
    const verdict = peutFusionner(pa, parentDePlante(autre));
    if (!verdict.ok) return verdict.raison;
  }
  return null;
}

// Met à jour l'apparence des 10 boutons d'un côté sans les recréer.
function rafraichirBoutonsHyb(cote, selection, autreSelection) {
  const boutons = cote === "A" ? boutonsHybA : boutonsHybB;
  for (let slot = 0; slot < boutons.length; slot++) {
    const ref = boutons[slot];
    if (!ref) continue;
    const f = fleurs[slot];
    const raison = raisonBoutonHybridation(slot, autreSelection);
    const selectionne = selection === slot;
    poser(ref.bouton, "disabled", raison !== null);
    if (ref.bouton.classList.contains("selectionnee") !== selectionne) {
      ref.bouton.classList.toggle("selectionnee", selectionne);
    }
    const attenuee = selection !== null && !selectionne;
    if (ref.bouton.classList.contains("attenuee") !== attenuee) {
      ref.bouton.classList.toggle("attenuee", attenuee);
    }
    if (f && f.etat === "plante" && f.tier !== null) {
      poser(ref.nom, "textContent", f.nom);
      poser(ref.meta, "textContent", "tier " + f.tier + " · gén. " + (f.generation || 0)
        + " · " + f.petalesAchetes + "/" + f.nbPetales + " pétales");
    } else {
      poser(ref.nom, "textContent", "Emplacement " + (slot + 1));
      poser(ref.meta, "textContent", f && f.etat === "vide" ? "vide" : "verrouillé");
    }
    poser(ref.bouton, "title", raison !== null
      ? libelleRaisonHybridation(raison)
      : (selectionne ? "Cliquer pour désélectionner" : "Choisir cette fleur"));
  }
}

// Clic sur un bouton : sélectionne, ou désélectionne si on reclique dessus.
function cliquerFleurHybridation(cote, slot) {
  const boutons = cote === "A" ? boutonsHybA : boutonsHybB;
  const ref = boutons[slot];
  if (!ref) return false;
  if (cote === "A") {
    if (slotHybA === slot) slotHybA = null;
    else if (!ref.bouton.disabled) slotHybA = slot;
    else return false;
  } else {
    if (slotHybB === slot) slotHybB = null;
    else if (!ref.bouton.disabled) slotHybB = slot;
    else return false;
  }
  rafraichirCartesHybridation();
  return true;
}

function premierAutreChoix(id, exclus) {
  for (const c of NOMS_CHOIX_HYBRIDATION) {
    if (c.id !== id && exclus.indexOf(c.id) < 0) return c.id;
  }
  return id;
}

// Valeur affichée pour une ligne : la valeur forte si le choix est coché,
// sinon la valeur « faible » automatique de la logique pure.
function valeurPourChoixHybridation(id, pa, pb) {
  const coches = choixHybridationCoches();
  let choix;
  if (coches.indexOf(id) >= 0) {
    const partenaire = coches.find(function (x) { return x !== id; }) || premierAutreChoix(id, []);
    choix = [id, partenaire];
  } else {
    const autres = coches.filter(function (x) { return x !== id; });
    while (autres.length < 2) autres.push(premierAutreChoix(id, autres));
    choix = [autres[0], autres[1]];
  }
  const ref = caracteristiquesHybride(pa, pb, choix, noms);
  if (!ref) return "—";
  const c = NOMS_CHOIX_HYBRIDATION.find(function (x) { return x.id === id; });
  const valeur = ref[c.champ];
  if (c.champ === "bonusComplet") return "×" + Number(valeur).toFixed(1);
  if (c.champ === "dureeBase") return formaterDuree(valeur);
  return String(valeur) + c.suffixe;
}

function rafraichirChoixEtRecap(slotA, slotB) {
  const a = slotA !== null ? fleurs[slotA] : null;
  const b = slotB !== null ? fleurs[slotB] : null;
  const coupleValide = !!(a && b && a.etat === "plante" && b.etat === "plante");
  const pa = coupleValide ? parentDePlante(a) : null;
  const pb = coupleValide ? parentDePlante(b) : null;

  for (const c of NOMS_CHOIX_HYBRIDATION) {
    const chk = document.getElementById("choix-" + c.id);
    const val = document.getElementById("val-" + c.id);
    if (!chk || !val) continue;
    if (!coupleValide) {
      poser(chk, "disabled", true);
      poser(val, "textContent", "—");
      continue;
    }
    const dispo = choixDisponibles(pa, pb).find(function (x) { return x.id === c.id; });
    const actif = !!(dispo && dispo.actif);
    poser(chk, "disabled", !actif);
    if (!actif) {
      poser(chk, "checked", false);
      poser(val, "textContent", "10 pétales max");
    } else {
      poser(val, "textContent", valeurPourChoixHybridation(c.id, pa, pb));
    }
  }

  const prodAvant = productionVerdanceParSeconde(fleurs);
  let prodApres = prodAvant;
  let perdues = 0;
  if (coupleValide) {
    prodApres = productionVerdanceParSeconde(fleurs.filter(function (f) {
      return f.slot !== slotA && f.slot !== slotB;
    }));
    perdues = 2;
  }
  const elAvant = document.getElementById("hybProdAvant");
  const elApres = document.getElementById("hybProdApres");
  const elPM = document.getElementById("hybPMGain");
  const elPerdues = document.getElementById("hybPlantesPerdues");
  const elCout = document.getElementById("hybCout");
  poser(elAvant, "textContent", formaterGain(prodAvant));
  poser(elApres, "textContent", formaterGain(prodApres));
  poser(elPM, "textContent", coupleValide ? formaterNombre(gainPM(pa.tier, pb.tier)) : "0");
  poser(elPerdues, "textContent", String(perdues));
  poser(elCout, "textContent", coupleValide
    ? formaterNombre(coutHybridationPour(pa, pb)) + " " + ICONES.verdance
    : "0 " + ICONES.verdance);

  const coches = choixHybridationCoches();
  const raison = raisonRefusHybridation(slotA, slotB, coches);
  const bouton = document.getElementById("boutonHybrider");
  if (bouton) {
    poser(bouton, "disabled", raison !== null);
    poser(bouton, "textContent", "Valider l'hybridation"
      + (coupleValide ? " (" + formaterNombre(coutHybridationPour(pa, pb)) + " " + ICONES.verdance + ")" : ""));
    poser(bouton, "title", raison || "Lancer la fusion (20 secondes)");
  }
  poser(document.getElementById("hybRaison"), "textContent", raison || "");
}

function rafraichirCartesHybridation() {
  // Une plante sélectionnée qui n'est plus plantée (fusion, vidage…) est oubliée.
  if (slotHybA !== null && (!fleurs[slotHybA] || fleurs[slotHybA].etat !== "plante")) {
    slotHybA = null;
  }
  if (slotHybB !== null && (!fleurs[slotHybB] || fleurs[slotHybB].etat !== "plante")) {
    slotHybB = null;
  }
  rafraichirBoutonsHyb("A", slotHybA, slotHybB);
  rafraichirBoutonsHyb("B", slotHybB, slotHybA);
  rafraichirChoixEtRecap(slotHybA, slotHybB);
}

function rafraichirBarreHybridation() {
  const zone = document.getElementById("hybFusion");
  const barre = document.getElementById("hybBarre");
  const restant = document.getElementById("hybTempsRestant");
  const enCours = hybridationEnCours !== null;
  if (zone) zone.hidden = !enCours;
  if (barre) {
    barre.max = DUREE_HYBRIDATION;
    barre.value = enCours ? Math.max(0, DUREE_HYBRIDATION - hybridationEnCours.tempsRestant) : 0;
  }
  if (restant) {
    restant.textContent = enCours ? Math.max(0, Math.ceil(hybridationEnCours.tempsRestant)) + " s" : "";
  }
}

// Une ligne de tableau, partagée par la liste récente et l'historique complet.
function ligneGraineHtml(g) {
  const d = g.definition || {};
  const enCours = plantationsEnCoursDeGraine(g.id);
  const statut = g.plantee === true
    ? "Plantée" + (enCours > 0 ? " (en pousse)" : "")
    : "Disponible";
  return '<tr class="' + (g.plantee === true ? "plantee" : "") + '">'
    + "<td><b>" + echapperHtml(d.nom || "Hybride") + "</b></td>"
    + "<td>" + echapperHtml(d.generation || 0) + "</td>"
    + "<td>" + echapperHtml(d.nbPetales) + "</td>"
    + "<td>" + echapperHtml(d.tier) + "</td>"
    + "<td>" + echapperHtml(formaterDuree(Number(d.dureeBase))) + "</td>"
    + "<td>" + echapperHtml(d.gainCycle) + "</td>"
    + "<td>×" + echapperHtml(Number(d.bonusComplet).toFixed(1)) + "</td>"
    + "<td>" + echapperHtml(d.partColoreeMax) + " %</td>"
    + '<td class="' + (g.plantee === true ? "" : "statut-dispo") + '">' + statut + "</td>"
    + "</tr>";
}

function rafraichirGraines() {
  rafraichirSac();
  const corps = document.getElementById("listeGraines");
  const historique = document.getElementById("listeGrainesHistorique");
  const details = document.getElementById("hybHistorique");
  const compteur = document.getElementById("hybNbHistorique");
  // Du plus récent au plus ancien (id décroissant).
  const triees = graines.slice().sort(function (a, b) {
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  const vide = '<tr><td class="graine-vide" colspan="9">Aucun hybride pour le moment.</td></tr>';
  if (corps) {
    corps.innerHTML = triees.length === 0
      ? vide
      : triees.slice(0, 5).map(ligneGraineHtml).join("");
  }
  if (historique) {
    historique.innerHTML = triees.length === 0 ? vide : triees.map(ligneGraineHtml).join("");
  }
  // Le <details> est statique : on ne touche ni à son contenu ni à son état ouvert.
  if (compteur) compteur.textContent = String(triees.length);
  if (details) details.hidden = triees.length <= 5;
}

function rafraichirLaboratoire() {
  const section = document.getElementById("hybridation");
  if (!section) return;
  const visible = laboratoireDebloque();
  section.hidden = !visible;
  const collection = document.getElementById("hybCollection");
  if (collection) collection.hidden = !visible;
  if (!visible) return;
  rafraichirCartesHybridation();
  rafraichirBarreHybridation();
  rafraichirGraines();
  rafraichirAmeliorations();
  rafraichirSpeciales();
}

// Lignes des trois améliorations : reconstruites sur événement (innerHTML),
// jamais créées après le démarrage.
let dernierHtmlAmeliorations = null;
function rafraichirAmeliorations() {
  const liste = document.getElementById("listeAmeliorations");
  if (!liste) return;
  const html = AMELIORATIONS_LABO.map(function (a) {
    const niveau = niveauAmelioration(a.id);
    const max = niveau >= a.max;
    const prix = prixAmelioration(a.id, niveau);
    const raison = raisonAchatAmelioration(a.id);
    const prixTexte = max
      ? "Niveau maximum"
      : [prix.pm > 0 ? formaterNombre(prix.pm) + " PM" : "",
         prix.compostMature > 0 ? formaterNombre(prix.compostMature) + " compost mature" : ""]
        .filter(function (t) { return t !== ""; }).join(" + ");
    let prerequis = "";
    if (a.id === "l1") {
      prerequis = "Prérequis : couleur violette " + Math.min(5, arbreNiveau("c1")) + "/5";
    } else if (a.id === "l2") {
      prerequis = "Prérequis : " + a.prerequis;
    }
    return '<div class="labo-amelioration' + (max || raison ? " indisponible" : "") + '">'
      + '<div class="labo-amelioration-entete"><b>' + echapperHtml(a.nom) + "</b>"
      + '<span class="labo-niveau">' + niveau + " / " + a.max + "</span></div>"
      + '<p class="labo-effet">' + echapperHtml(a.effet) + "</p>"
      + (prerequis ? '<p class="labo-prerequis">' + echapperHtml(prerequis) + "</p>" : "")
      + '<div class="labo-achat">'
      + '<button type="button" data-amelioration="' + a.id + '"'
      + (raison ? " disabled" : "") + ">"
      + (max ? "Niveau maximum" : "Acheter — " + prixTexte) + "</button>"
      + (raison && !max ? '<span class="labo-raison">' + echapperHtml(raison) + "</span>" : "")
      + "</div></div>";
  }).join("");
  // Rien ne change : on ne touche pas au DOM (un clic en cours ne peut plus être perdu).
  if (html === dernierHtmlAmeliorations) return;
  dernierHtmlAmeliorations = html;
  liste.innerHTML = html;
}

function validerHybridationUI() {
  const slotA = slotHybA;
  const slotB = slotHybB;
  const coches = choixHybridationCoches();
  const raison = raisonRefusHybridation(slotA, slotB, coches);
  if (raison !== null) {
    const elRaison = document.getElementById("hybRaison");
    if (elRaison) elRaison.textContent = raison;
    return;
  }
  lancerHybridation(slotA, slotB, coches);
}

function rafraichirChoixDepuisSelection() {
  rafraichirChoixEtRecap(slotHybA, slotHybB);
}


// Dernier état appliqué au DOM : on ne retouche les panneaux que si un déblocage a changé.
let etatDeblocagesAffiche = { compostOk: null, laboOk: null };
function rafraichirDeblocages() {
  const compostOk = compostDebloque();
  const laboOk = laboratoireDebloque();
  const deblocageChange = compostOk !== etatDeblocagesAffiche.compostOk
    || laboOk !== etatDeblocagesAffiche.laboOk;

  if (compostOk !== etatDeblocagesAffiche.compostOk) {
    const verrouCompost = document.getElementById("compost-verrou");
    if (verrouCompost) verrouCompost.hidden = compostOk;
    const contenuCompost = document.getElementById("Compost");
    if (contenuCompost) contenuCompost.hidden = !compostOk;
    const ressourcesCompost = document.querySelector(".ressources-compost");
    if (ressourcesCompost) ressourcesCompost.hidden = !compostOk;
    const explicationCompost = document.querySelector(".explication-compost");
    if (explicationCompost) explicationCompost.hidden = !compostOk;
    const boutonRepliC = document.getElementById("boutonRepliC");
    if (boutonRepliC) boutonRepliC.style.display = compostOk ? "" : "none";
    etatDeblocagesAffiche.compostOk = compostOk;
  }

  if (laboOk !== etatDeblocagesAffiche.laboOk) {
    const verrouLabo = document.getElementById("labo-verrou");
    if (verrouLabo) verrouLabo.hidden = laboOk;
    const contenuLabo = document.getElementById("laboratoire");
    if (contenuLabo) contenuLabo.hidden = !laboOk;
    const explicationLabo = document.querySelector(".explication-laboratoire");
    if (explicationLabo) explicationLabo.hidden = !laboOk;
    etatDeblocagesAffiche.laboOk = laboOk;
  }

  // Textes de progression des panneaux encore verrouillés : seulement s'ils changent.
  if (!compostOk) {
    const texteCompost = document.getElementById("verrouCompostTexte");
    if (texteCompost) {
      const f3 = fleurs.find(function (f) { return !f.hybride && f.tier === 3; });
      poser(texteCompost, "textContent", f3
        ? f3.petalesAchetes + "/" + f3.nbPetales + " pétales de la " + f3.nom
        : "0/3 pétales de la Trille");
    }
  }
  if (!laboOk) {
    poser(document.getElementById("verrouLaboTexte"), "textContent",
      petalesCouleurs.mauveRose + "/5 pétales mauves");
  }
  // L'interface d'hybridation se construit à l'ouverture du laboratoire.
  if (laboOk !== laboEtaitVisible) {
    laboEtaitVisible = laboOk;
    rafraichirLaboratoire();
  } else if (laboOk) {
    // Une fleur peut devenir complète (ou revenir incomplète) sans changement
    // d'emplacement : on remet à jour les boutons A/B (sans réécrire ce qui est identique).
    rafraichirCartesHybridation();
  }
  // Les hauteurs ne bougent que si un panneau s'est (dé)verrouillé.
  if (deblocageChange) planifierAjusterBarre();
}

function valeurBonus(tier) {
  let somme = 0;
  for (let i = 1; i <= tier; i++) {
    somme = somme + fibo(i);
  }
  return 1 + BONUS_FLEUR * somme;
}

// Valeur du bonus de fleur complète affichée / utilisée par les gains.
// Un hybride peut porter sa propre valeur ; les plantes classiques gardent la formule du tier.
function bonusAffiche(f) {
  return f.bonusComplet ?? valeurBonus(f.tier);
}

function bonusFleur(f) {
  if (fleurComplete(f)) {
    return bonusAffiche(f);
  }
  return 1;
}

function achatsPossibles() {
  const liste = [];
  for (const f of fleurs) {
    if (!f.bouton.disabled) {
      liste.push({ prix: f.prix, bouton: f.bouton, priorite: 0 });
    }
    if (!f.boutonVitesse.disabled) {
    liste.push({ prix: prixVitesseFleur(f, f.niveauVitesse), bouton: f.boutonVitesse, priorite: 1 });
    }
    if (!f.boutonCycle.disabled) {
    liste.push({ prix: prixCycleFleur(f, f.cycle), bouton: f.boutonCycle, priorite: 1 });
    }
  }
  for (const p of petales) {
    if (!p.bouton.disabled && p.bouton.style.display !== "none") {
    liste.push({ prix: p.prix, bouton: p.bouton, priorite: 1 });
    }
  }
  // La prochaine fleur passe avant le reste : elle ne doit pas être privée de
  // verdance par des achats moins chers (pétales, cycles, vitesses).
  liste.sort(function (a, b) {
    if (a.priorite !== b.priorite) {
      return a.priorite - b.priorite;
    }
    return a.prix - b.prix;
  });
  return liste;
}
//#endregion

// Effet du ferment PAYÉ pour un cercle : vitesse (durée plus courte / progression plus rapide)
// ou rendement (production plus grande).
function effetFerment(cle) {
  const f = FERMENTS[fermentsPayes[cle]];
  return {
    vitesse: f && f.type === "vitesse" ? f.force : 0,
    rendement: f && f.type === "rendement" ? f.force : 0
  };
}
// Prélève le ferment choisi pour ce cercle s'il n'est pas déjà payé et qu'il y en a assez en stock.
function essayerPayerFerment(cle) {
  if (fermentsPayes[cle] !== "") return;
  const id = fermentsChoisis[cle];
  // Réserve de la couleur : on ne paie le ferment que si le stock dépasse
  // le seuil choisi + les 5 pétales du ferment lui-même.
  const reserve = id ? (seuilsPetales[id] || 0) : 0;
  if (id && FERMENTS[id] && petalesCouleurs[id] >= reserve + FERMENT_COUT) {
    petalesCouleurs[id] = petalesCouleurs[id] - FERMENT_COUT;
    fermentsPayes[cle] = id;
    afficherPetalesCouleurs();
    mettreAJourGain();
  }
}
// Entier tiré au sort autour de x (1,5 donne 1 ou 2) : pour le compost fertile, toujours entier.
function arrondiAleatoire(x) {
  const e = Math.floor(x);
  return e + (Math.random() < x - e ? 1 : 0);
}
// Couleurs utilisables comme ferment : celles que le sol a déjà débloquées.
function couleursDebloquees() {
  const violets = Math.min(5, arbreNiveau("c1"));
  return PETALES_COULEURS.filter(function (c, k) {
    return k < violets || (c.id === "bleu" && bleuActif());
  });
}

function voieActive(i) {
  return i === 0 || secondeConversionAchetee;
}
function dureeVoie(i) {
  return DUREE_CONVERSION * (1 - effetFerment(voies[i].cle).vitesse);
}
// Paie une conversion sur une voie (état seulement, sans toucher à la page : sert aussi hors ligne).
// Le lancement manuel ignore le seuil « à conserver », réservé à l'automatisation.
function payerVoie(i, ignorerSeuil) {
  const v = voies[i];
  if (!voieActive(i) || v.encours) return false;
  const reserve = ignorerSeuil ? 0 : seuilsPetales.blancs;
  if (petalesBlancs < reserve + COUT_CONVERSION) return false;
  petalesBlancs = petalesBlancs - COUT_CONVERSION;
  v.encours = true;
  v.progression = 0;
  fermentsPayes[v.cle] = "";
  essayerPayerFerment(v.cle);
  return true;
}
// Tente de lancer chaque voie libre ; renvoie le nombre de conversions lancées.
function lancerVoies(ignorerSeuil) {
  let n = 0;
  for (let i = 0; i < voies.length; i++) {
    if (payerVoie(i, ignorerSeuil)) n++;
  }
  return n;
}

function apresLancementConversion() {
  affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
  afficherPetalesCouleurs();
  afficherBarreBac1();
  mettreAJourGain();
  rafraichirCommandesCompost();
}

// Lancement automatique, appelé à chaque tour quand la conversion est ON.
function demarrerBac1() {
  // Tant que le compost est verrouillé, aucune conversion ne tourne en
  // arrière-plan : sinon le compost produit finirait par déverrouiller la
  // section avant la fin de la Trille.
  if (!compostDebloque() || !autoCompostActif) return;
  if (lancerVoies(false) > 0) apresLancementConversion();
}
// Premier lancement manuel : bouton « ▶ Lancer ». Il ignore le seuil et
// bascule immédiatement l'interrupteur sur ON (autoCompostDebloque = true).
function lancerConversionManuelle() {
  if (!compostDebloque()) return;
  const premiere = !autoCompostDebloque;
  if (lancerVoies(premiere) > 0) {
    if (premiere) {
      autoCompostDebloque = true;
      autoCompostActif = true;
    }
    apresLancementConversion();
  }
}

// Fin d'une conversion sur une voie (état seulement : sert en ligne et hors ligne).
function terminerVoie(i) {
  const v = voies[i];
  const fx = effetFerment(v.cle);
  conversionsBac1 = conversionsBac1 + 1;
  compost = compost + rendementBac1() * bonusCompost() * (1 + fx.rendement);
  v.progression = 0;
  v.encours = false;
  fermentsPayes[v.cle] = "";
  if (conversionsBac1 % CONVERSIONS_PAR_PROGRES_BAC2 === 0) {
    avancerBac2();
  }
}

function avancerBac1() {
  if (!compostDebloque()) {
    // Sauvegarde ancienne : une conversion avait pu démarrer avant le
    // déverrouillage. On l'annule et on rend les pétales prélevés.
    let rendu = false;
    for (const v of voies) {
      if (v.encours) {
        v.encours = false;
        v.progression = 0;
        petalesBlancs = petalesBlancs + COUT_CONVERSION;
        rendu = true;
      }
    }
    if (rendu) {
      affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
      afficherBarreBac1();
      mettreAJourGain();
    }
    return;
  }
  // Interrupteur OFF : tout est gelé, y compris une conversion en cours.
  // Le ferment déjà payé et la progression restent en place pour la reprise.
  if (!autoCompostActif) {
    afficherBarreBac1();
    return;
  }
  let fini = false;
  for (let i = 0; i < voies.length; i++) {
    const v = voies[i];
    if (!v.encours) continue;
    v.progression = v.progression + vitesseTemps * 100 / (dureeVoie(i) * 10);
    if (v.progression >= 100) {
      // Le dépassement est reporté sur la conversion suivante (mode ×100 compris).
      const depassement = v.progression - 100;
      terminerVoie(i);
      fini = true;
      // Enchaînement immédiat : on relance la voie dans le même tour si ON
      // et si le seuil de pétales blancs le permet. On évite ainsi le
      // clignotement « En attente » entre deux conversions.
      if (autoCompostActif && payerVoie(i, false)) {
        v.progression = depassement;
      }
    }
  }
  if (fini) {
    affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
    afficherBacs23();
    affichercompost();
    mettreAJourGain();
  }
  afficherBarreBac1();
}
function affichercompost() {
  document.getElementById("compost").textContent = formaterCompost(compost);
  var el = document.getElementById("compostAff"); if (el) el.textContent = compost.toFixed(3);
  afficherPM();
  var el2 = document.getElementById("bonusCompostAff"); if (el2) el2.textContent = bonusCompost().toFixed(3);
  afficherRendementBac1();
  // Le compost vient d'augmenter (ou d'être dépensé) : l'arbre doit refléter
  // tout de suite les nœuds devenus abordables.
  rafraichirArbreCompost();
}
// Anneau de progression : variable CSS --p (0 à 100), écrite seulement si elle change.
function poserAnneau(id, pourcent) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = Math.max(0, Math.min(100, pourcent)).toFixed(1);
  if (el.dataset.p !== v) {
    el.dataset.p = v;
    el.style.setProperty("--p", v);
  }
}
function poserTexte(id, texte) {
  const el = document.getElementById(id);
  if (el && el.textContent !== texte) el.textContent = texte;
}
function afficherVoie(i) {
  const v = voies[i];
  const suffixe = i === 0 ? "Bac1" : "Bac1b";
  poserAnneau("barre" + suffixe, v.progression);
  let texte;
  if (!autoCompostActif) {
    texte = "En pause";
  } else if (v.encours) {
    texte = formaterTemps((100 - v.progression) * dureeVoie(i) * 0.01);
  } else if (petalesBlancs < seuilsPetales.blancs + COUT_CONVERSION) {
    texte = "Insuffisants";
  } else {
    // Voie libre avec assez de pétales : elle démarre au prochain tour.
    texte = formaterTemps(dureeVoie(i));
  }
  poserTexte("temps" + suffixe, texte);
}
function afficherBarreBac1() {
  afficherVoie(0);
  if (secondeConversionAchetee) afficherVoie(1);
  rafraichirSlotsFerments();
}
function afficherBarreBac1b() {
  afficherBarreBac1();
}
// Le 2ᵉ cercle reste un emplacement fantôme (avec son bouton d'achat) tant que « 2nd Conversion »
// n'est pas acheté.
function afficherSecondeConversion() {
  const bloc = document.getElementById("blocBac1b");
  if (!bloc) return;
  bloc.classList.toggle("fantome", !secondeConversionAchetee);
  const bouton = document.getElementById("boutonSeconde");
  if (bouton) {
    const noeud = ARBRE_NOEUDS.find(function (n) { return n.id === "c8"; });
    const peut = !secondeConversionAchetee && arbrePeutAcheter(noeud);
    bouton.hidden = secondeConversionAchetee;
    bouton.disabled = !peut;
    const prix = formaterNombre(arbrePrix(noeud)) + " " + ICONES.verdance;
    if (bouton.dataset.prix !== prix) {
      bouton.dataset.prix = prix;
      bouton.innerHTML = "2ᵉ conversion<br><b>" + prix + "</b>";
    }
    bouton.title = arbreNiveau("c1") < 1
      ? "Achetez d'abord « Enrichir le sol »."
      : "Débloque une seconde conversion des pétales blancs, indépendante de la première (" + prix + ").";
  }
  if (secondeConversionAchetee) afficherVoie(1);
}
function avancerBac2() {
  // bac2progression compte les conversions du bac 1 déjà accumulées :
  // il en faut seuilBac2() (100 au départ, 95/90/…/50 avec c4) pour le bac 2.
  essayerPayerFerment("bac2");
  const fx = effetFerment("bac2");
  bac2progression = bac2progression + multiProgression() + fx.vitesse;
  if (bac2progression >= seuilBac2()) {
    compostMature = compostMature + rendementBac2() * (1 + fx.rendement);
    bac2progression = 0;
    fermentsPayes.bac2 = "";
    conversionsBac2 = conversionsBac2 +1;
    if (conversionsBac2 % CONVERSIONS_PAR_PROGRES_BAC3 === 0) {
      avancerBac3();
    }
    mettreAJourGain();
  }
}
function avancerBac3() {
  essayerPayerFerment("bac3");
  const fx = effetFerment("bac3");
  bac3progression = bac3progression + multiProgression() + fx.vitesse;
  if (bac3progression >= seuilBac3()) {
    compostFertile = compostFertile + arrondiAleatoire(rendementBac3() + fx.rendement);
    bac3progression = 0;
    fermentsPayes.bac3 = "";
    conversionsBac3 = conversionsBac3 +1;
  }
  mettreAJourGain();
}
function afficherBacs23() {
  var m = document.getElementById("compostMatureAff"); if (m) m.textContent = formaterNombre(compostMature);
  var f = document.getElementById("compostFertileAff"); if (f) f.textContent = formaterNombre(compostFertile);
  const seuil = seuilBac2();
  poserAnneau("barreBac2", seuil > 0 ? bac2progression / seuil * 100 : 0);
  const seuil3 = seuilBac3();
  poserAnneau("barreBac3", seuil3 > 0 ? bac3progression / seuil3 * 100 : 0);
  poserTexte("tempsBac2", Math.min(Math.floor(bac2progression), seuil) + "/" + seuil);
  poserTexte("tempsBac3", Math.floor(bac3progression) + "/" + seuil3);
}
function bonusCompost () {
  return ((1+BONUS_PAR_CONVERSIONS*conversionsBac1)*(1+BONUS_PAR_CONVERSIONS*conversionsBac2)*(1+BONUS_PAR_CONVERSIONS*conversionsBac3))
}

// ============================================================
// ARBRE D'AMÉLIORATIONS DU COMPOST (racines/mycélium)
// ============================================================
let arbreAmeliorations = {
  niveaux: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0, c9: 0, c10: 0, c11: 0 }
};

// c1 débloque les couleurs, c2 augmente le compteur d'enrichissement,
// c3 (branche de gauche) augmente le rendement du bac 1,
// c4 (sous c2) réduit le nombre de conversions du bac 1 pour le bac 2.
// c2 reste exactement sous c1 ; c3 se place à sa gauche.
// Prix du niveau n = Math.round(coutBase × facteurPrix^n), sauf si `prix` (liste fixe) est fourni.
// `titreHtml` : titre du bouton avec icônes (chaînes écrites en dur, jamais de donnée joueur).
const ARBRE_NOEUDS = [
  { id: "c1", nom: "Enrichir le sol",          parent: null, x: 135, y: 26,  coutBase: 10, facteurPrix: 1, max: 5, prix: [10, 80, 250, 1000, 2500] },
  { id: "c2", nom: "Concentrer l'humus",       parent: "c1", x: 135, y: 66,  coutBase: 20, facteurPrix: 1.25, max: 25 },
  { id: "c3", nom: "Rendement",                parent: "c1", x: 45,  y: 66,  coutBase: 1,  facteurPrix: 1.5,  max: 20, monnaie: "mature",
    titreHtml: 'Rendement&nbsp;<span class="icone-compost"></span>' },
  { id: "c4", nom: "Meilleur Compost mature",  parent: "c2", x: 135, y: 106, coutBase: 30, facteurPrix: 1.5,  max: 10,
    titreHtml: 'Meilleur&nbsp;<span class="icone-compostmature"></span>' },
  { id: "c5", nom: "Meilleur Compost Fertile", parent: "c3", x: 45,  y: 106, coutBase: 5,  facteurPrix: 1.5,  max: 10, monnaie: "mature",
    titreHtml: 'Meilleur&nbsp;<span class="icone-compostfertile"></span>' },
  { id: "c6", nom: "Rendement Compost Mature", parent: "c1", x: 225, y: 66,  coutBase: 3,  facteurPrix: 1.25, max: 10, monnaie: "fertile",
    titreHtml: 'Rendement&nbsp;<span class="icone-compostmature"></span>' },
  { id: "c7", nom: "Multiplicateur gain Verdance", parent: "c6", x: 225, y: 106, coutBase: 5, facteurPrix: 1.25, max: 10, monnaie: "fertile",
    titreHtml: 'Multiplicateur gain&nbsp;<span class="icone-verdance"></span>' },
  { id: "c8", nom: "2nd Conversion",           parent: "c1", x: 45,  y: 26,  coutBase: 15000, facteurPrix: 1, max: 1, monnaie: "verdance" },
  { id: "c9", nom: "Compost complexes",        parent: "c4", x: 45,  y: 146, coutBase: 40, facteurPrix: 1.5,  max: 10 },
  { id: "c10", nom: "Progression doublée",     parent: null, x: 225, y: 26,  coutBase: 2,  facteurPrix: 1,    max: 1, monnaie: "fertile",
    titreHtml: 'Progression ×2' },
  { id: "c11", nom: "Pousse Rapide",           parent: "c3", x: 45,  y: 186, coutBase: 10, facteurPrix: 1.5,  max: 5, monnaie: "mature" }
];

function arbreNiveau(id) {
  return arbreAmeliorations.niveaux[id] || 0;
}

function arbrePrix(noeud) {
  if (noeud.prix) return noeud.prix[Math.min(arbreNiveau(noeud.id), noeud.prix.length - 1)];
  return Math.round(noeud.coutBase * Math.pow(noeud.facteurPrix, arbreNiveau(noeud.id)));
}

// Certains nœuds se paient en compost mature plutôt qu'en compost.
function arbreMonnaie(noeud) {
  if (noeud.monnaie === "mature") return compostMature;
  if (noeud.monnaie === "fertile") return compostFertile;
  if (noeud.monnaie === "verdance") return verdance;
  return compost;
}

function arbrePeutAcheter(noeud) {
  if (arbreNiveau(noeud.id) >= noeud.max) return false;
  if (noeud.parent && arbreNiveau(noeud.parent) < 1) return false;
  return arbreMonnaie(noeud) >= arbrePrix(noeud);
}

// Rendement du bac 1 : 1 compost par conversion, ×1,25 cumulatif par niveau de c3.
function rendementBac1() {
  return Math.pow(1.25, arbreNiveau("c3"));
}

// Rendement du bac 2 : 1 compost mature par conversion, ×1,25 par niveau de c6 et ×1,10 par niveau de c9 (cumulatifs).
function rendementBac2() {
  return Math.pow(1.25, arbreNiveau("c6")) * Math.pow(1.1, arbreNiveau("c9"));
}

// Rendement du bac 3 : 1 compost fertile par conversion, ×1,05 par niveau de « Compost complexes » (cumulatif).
function rendementBac3() {
  return Math.pow(1.05, arbreNiveau("c9"));
}

// « Progression doublée » : chaque progression des bacs 2 et 3 vaut 2 au lieu de 1.
function multiProgression() {
  return arbreNiveau("c10") >= 1 ? 2 : 1;
}

// Nombre de conversions du bac 1 nécessaires pour une conversion du bac 2 :
// 100 au départ, −5 par niveau de « Meilleur Compost mature » (minimum 50).
function seuilBac2() {
  return 100 - 5 * arbreNiveau("c4");
}

// Nombre de conversions du bac 2 nécessaires pour une conversion du bac 3 :
// 50 au départ, −3 par niveau de « Meilleur Compost Fertile » (minimum 20).
function seuilBac3() {
  return 50 - 3 * arbreNiveau("c5");
}

// Valeur affichée à côté de la barre du bac 1 : seulement le résultat final
// (base × BonusCompost × rendement). Le détail reste dans l'infobulle.
function formaterRendementBac1() {
  const total = bonusCompost() * rendementBac1();
  return "+ " + total.toFixed(3).replace(".", ",");
}

function afficherRendementBac1() {
  poserTexte("rendementBac1", formaterRendementBac1());
  poserTexte("rendementBac1b", formaterRendementBac1());
}

// Valeurs affichées à côté des barres 2 et 3.
function afficherRendementsBacs() {
  poserTexte("rendementBac2", "+ " + rendementBac2().toFixed(3).replace(".", ","));
  poserTexte("rendementBac3", "+ " + rendementBac3().toFixed(2).replace(".", ","));
}

function acheterNoeudArbre(id) {
  for (const noeud of ARBRE_NOEUDS) {
    if (noeud.id !== id) continue;
    if (!arbrePeutAcheter(noeud)) return;
    const prix = arbrePrix(noeud);
    if (noeud.monnaie === "mature") {
      compostMature = compostMature - prix;
      afficherBacs23();
    } else if (noeud.monnaie === "fertile") {
      compostFertile = compostFertile - prix;
      afficherBacs23();
    } else if (noeud.monnaie === "verdance") {
      verdance = verdance - prix;
      afficherVerdance();
    } else {
      compost = compost - prix;
      affichercompost();
    }
    arbreAmeliorations.niveaux[id] = arbreNiveau(id) + 1;
    if (id === "c2") {
      enrichissement = Math.min(50, enrichissement + 2);
    }
    if (id === "c8") {
      secondeConversionAchetee = true;
      afficherSecondeConversion();
    }
    if (id === "c4" || id === "c5" || id === "c10") {
      // Le seuil d'un bac change : la barre et son texte doivent suivre tout de suite.
      afficherBacs23();
    }
    if (id === "c11") {
      // Le seuil des cycles change : les fleurs doivent le montrer tout de suite.
      mettreAJourBoutons();
    }
    mettreAJourGain();
    rafraichirArbreCompost();
    rafraichirPanneauSol();
    afficherRendementBac1();
    afficherRendementsBacs();
    rafraichirAmeliorations();
    return;
  }
}

// Les anciennes améliorations de réduction des bacs ont été retirées : l'arbre
// ne contient plus que le déblocage des couleurs, l'enrichissement du sol,
// le rendement du bac 1 et le seuil du bac 2.

function acheterMaxCompost() {
  let achete = false;
  let progres = true;
  while (progres) {
    progres = false;
    for (const noeud of ARBRE_NOEUDS) {
      if (arbreNiveau(noeud.id) >= noeud.max) continue;
      if (noeud.parent && arbreNiveau(noeud.parent) < 1) continue;
      // L'achat max ne dépense jamais de Verdance (ex. 2nd Conversion) : achat manuel uniquement.
      if (noeud.monnaie === "verdance") continue;
      // Achète le max de niveaux abordables
      while (arbreNiveau(noeud.id) < noeud.max && arbrePeutAcheter(noeud)) {
        const prix = arbrePrix(noeud);
        const monnaie = arbreMonnaie(noeud);
        if (monnaie < prix) break;
        // payer
        if (noeud.monnaie === "mature") compostMature -= prix;
        else if (noeud.monnaie === "fertile") compostFertile -= prix;
        else if (noeud.monnaie === "verdance") verdance -= prix;
        else compost -= prix;
        arbreAmeliorations.niveaux[noeud.id] = arbreNiveau(noeud.id) + 1;
        if (noeud.id === "c2") enrichissement = Math.min(50, enrichissement + 2);
        if (noeud.id === "c8") { secondeConversionAchetee = true; afficherSecondeConversion(); }
        if (noeud.id === "c4" || noeud.id === "c5" || noeud.id === "c10") afficherBacs23();
        mettreAJourGain();
        progres = true;
        achete = true;
      }
    }
  }
  if (!achete) return false;
  afficherVerdance();
  affichercompost();
  afficherBacs23();
  afficherBarreBac1();
  rafraichirArbreCompost();
  rafraichirPanneauSol();
  afficherRendementBac1();
  afficherRendementsBacs();
  rafraichirAmeliorations();
  mettreAJourBoutons();
  return true;
}

// L'arbre est construit une seule fois (tronc, branches, cartes). Les
// rafraîchissements suivants ne touchent que les classes et les textes des
// cartes : plus de reconstruction complète à chaque conversion, et les
// infobulles restent stables pendant la lecture.
let arbreRefs = null;

function texteInfobulleNoeud(noeud, niveau, max, prix) {
  const f2 = function (x) { return x.toFixed(2).replace(".", ","); };
  switch (noeud.id) {
    case "c1":
      return max
        ? "Toutes les couleurs sont débloquées."
        : "Débloque la couleur « " + PETALES_COULEURS[niveau].nom + " ».";
    case "c2":
      return "Chaque niveau ajoute 2 % de pétales colorés à toutes les fleurs, dans la limite de leur plafond.";
    case "c3":
      return "Chaque niveau multiplie par 1,25 le compost gagné à chaque conversion (actuellement : ×"
        + f2(rendementBac1()) + ").";
    case "c4":
      return max
        ? "Chaque niveau retire 5 conversions de compost pour obtenir un compost mature. Minimum atteint : "
          + seuilBac2() + " conversions."
        : "Chaque niveau retire 5 conversions de compost pour obtenir un compost mature (actuellement : "
          + seuilBac2() + ", minimum : 50).";
    case "c5":
      return max
        ? "Chaque niveau retire 3 conversions de compost mature pour obtenir un compost fertile. Minimum atteint : "
          + seuilBac3() + " conversions."
        : "Chaque niveau retire 3 conversions de compost mature pour obtenir un compost fertile (actuellement : "
          + seuilBac3() + ", minimum : 20).";
    case "c6":
      return "Chaque niveau multiplie par 1,25 le compost mature gagné à chaque conversion (actuellement : ×"
        + f2(Math.pow(1.25, niveau)) + ").";
    case "c7":
      return "Chaque niveau multiplie par 1,05 le gain de Verdance (actuellement : ×"
        + f2(Math.pow(1.05, niveau)) + ").";
    case "c8":
      return "Débloque une seconde conversion des pétales blancs en compost.";
    case "c9":
      return "Chaque niveau multiplie par 1,10 le compost mature et par 1,05 le compost fertile gagnés à chaque conversion (actuellement : ×"
        + f2(Math.pow(1.1, niveau)) + " et ×" + f2(Math.pow(1.05, niveau)) + ").";
    case "c10":
      return "Les conversions de compost mature et de compost fertile avancent deux fois plus vite.";
    case "c11":
      return "Chaque niveau multiplie par 0,96 le nombre de fleurs complétées nécessaires pour terminer un cycle, arrondi à l'entier le plus proche (actuellement : ×"
        + f2(Math.pow(0.96, niveau)) + ").";
  }
  return "";
}

// Les améliorations sont rangées sous le cercle de la monnaie qui les paie.
// (« 2nd Conversion », payée en Verdance, s'achète sur le 2ᵉ cercle.)
const ARBRE_COLONNES = {
  compost: ["c1", "c2", "c4", "c9"],
  mature:  ["c3", "c5", "c11"],
  fertile: ["c10", "c6", "c7"]
};
const ARBRE_ICONES = { compost: "icone-compost", mature: "icone-compostmature", fertile: "icone-compostfertile" };

function construireArbreCompost() {
  arbreRefs = {};
  for (const colonne of Object.keys(ARBRE_COLONNES)) {
    const liste = document.getElementById("racines-" + colonne);
    if (!liste) continue;
    liste.innerHTML = "";
    for (const id of ARBRE_COLONNES[colonne]) {
      const noeud = ARBRE_NOEUDS.find(function (n) { return n.id === id; });
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "racine-noeud";
      const nom = document.createElement("span");
      nom.className = "rn-nom";
      if (noeud.titreHtml) nom.innerHTML = '<span class="rn-titre">' + noeud.titreHtml + '</span>';
      else nom.textContent = noeud.nom;
      const pastilles = document.createElement("span");
      pastilles.className = "rn-pastilles";
      if (id === "c1") {
        for (let k = 0; k < 5; k++) {
          const p = document.createElement("i");
          p.style.background = PETALES_COULEURS[k].hex;
          pastilles.appendChild(p);
        }
        nom.appendChild(pastilles);
      }
      const niveau = document.createElement("span");
      niveau.className = "rn-niveau";
      const prix = document.createElement("span");
      prix.className = "rn-prix";
      const bas = document.createElement("div");
      bas.className = "rn-bas";
      bas.appendChild(niveau);
      bas.appendChild(prix);
      bouton.appendChild(nom);
      bouton.appendChild(bas);
      // Écouteur posé une seule fois : acheterNoeudArbre vérifie lui-même le
      // niveau maximum et la monnaie disponible.
      bouton.addEventListener("click", function () { acheterNoeudArbre(id); });
      liste.appendChild(bouton);
      arbreRefs[id] = { bouton: bouton, niveau: niveau, prix: prix, pastilles: pastilles, dernierEtat: null };
    }
  }
}

function rafraichirArbreCompost() {
  if (!arbreRefs) construireArbreCompost();
  for (const colonne of Object.keys(ARBRE_COLONNES)) {
    for (const id of ARBRE_COLONNES[colonne]) {
      const noeud = ARBRE_NOEUDS.find(function (n) { return n.id === id; });
      const r = arbreRefs[id];
      if (!r) continue;
      const niv = arbreNiveau(id);
      const max = niv >= noeud.max;
      const parentOk = !noeud.parent || arbreNiveau(noeud.parent) >= 1;
      const achetable = arbrePeutAcheter(noeud);
      const prixNombre = arbrePrix(noeud);

      const classe = "racine-noeud" + (max ? " max" : achetable ? " achetable" : !parentOk ? " verrouille" : "");
      if (r.bouton.className !== classe) r.bouton.className = classe;
      r.bouton.disabled = max || !achetable;
      poserTexteElement(r.niveau, niv + "/" + noeud.max);
      poserTexteElement(r.prix, max ? "Max" : formaterNombre(prixNombre) + " ");
      if (!max && !r.prix.querySelector("span")) {
        const ic = document.createElement("span");
        ic.className = ARBRE_ICONES[colonne];
        r.prix.appendChild(ic);
      }
      if (id === "c1") {
        const kids = r.pastilles.children;
        for (let k = 0; k < kids.length; k++) kids[k].className = k < niv ? "" : "off";
      }
      let titre = texteInfobulleNoeud(noeud, niv, max, prixNombre);
      if (!parentOk) {
        const parent = ARBRE_NOEUDS.find(function (n) { return n.id === noeud.parent; });
        titre += " Requiert : " + parent.nom + ".";
      }
      if (r.dernierEtat !== titre) {
        r.bouton.title = titre;
        r.dernierEtat = titre;
      }
    }
  }
}
function poserTexteElement(el, texte) {
  if (el.firstChild && el.firstChild.nodeType === 3) {
    if (el.firstChild.nodeValue !== texte) el.firstChild.nodeValue = texte;
  } else {
    el.insertBefore(document.createTextNode(texte), el.firstChild);
  }
}

// ============================================================
// TIRAGE DES COULEURS DE PÉTALES
// ============================================================
// Poids : blanc = 1 - S ; couleurs actives réparties en progression
// géométrique de raison q, normalisée pour que leur somme vaille S.
// S = min(enrichissement, 5 × numéro de fleur) %, en fraction (0 % tant que « Concentrer l'humus » n'est pas acheté).
// Couleurs actives : les niveaux de c1 (palette violette) puis le bleu (l1).
// Le bleu est toujours la dernière couleur active, donc la plus rare.
function poidsTirage(f) {
  // Semis (cycle 0) : le sol n'est pas prêt, que des pétales blancs.
  if (ageDe(f) === "semis") {
    const blancs = [1];
    for (let k = 0; k < PETALES_COULEURS.length; k++) blancs.push(0);
    return blancs;
  }
  const S = Math.min(enrichissement, plafondPartColoree(f)) / 100;
  const poids = [Math.max(0, 1 - S)];
  for (let k = 0; k < PETALES_COULEURS.length; k++) poids.push(0);

  const actives = [];
  const violets = Math.min(5, arbreNiveau("c1"));
  for (let k = 0; k < violets; k++) actives.push(k);
  if (bleuActif()) actives.push(5);

  const n = actives.length;
  if (n > 0) {
    const q = raisonGeometrique();
    const somme = 1 - Math.pow(q, n);   // somme des q^rang pour rang = 0..n-1
    for (let rang = 0; rang < n; rang++) {
      poids[actives[rang] + 1] = S * (1 - q) * Math.pow(q, rang) / somme;
    }
  }
  return poids;
}

function pourcentagesTirage(f) {
  const poids = poidsTirage(f);
  let total = 0;
  for (const w of poids) total += w;
  return poids.map(function (w) { return total > 0 ? w / total * 100 : 0; });
}

// Retourne -1 pour un pétale blanc, sinon l'index 0..4 de la couleur.
function tirerCouleur(f) {
  const poids = poidsTirage(f);
  let total = 0;
  for (const w of poids) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < poids.length; i++) {
    r -= poids[i];
    if (r < 0) return i - 1;
  }
  return -1;
}

// La couleur d'un pétale est tirée quand sa coloration commence, puis
// créditée seulement quand cette coloration s'achève : le multiplicateur
// augmente donc à la fin du remplissage, pas au tirage.
function tirerTeinte(f) {
  const tirage = tirerCouleur(f);
  return tirage < 0 ? COULEUR_PETALE_BLANC : PETALES_COULEURS[tirage].hex;
}

const PETALES_PAR_TEINTE = {};
for (const c of PETALES_COULEURS) {
  PETALES_PAR_TEINTE[c.hex.toUpperCase()] = c.id;
}

function crediterTeinte(teinte) {
  const id = PETALES_PAR_TEINTE[String(teinte || "").toUpperCase()];
  if (id) {
    petalesCouleurs[id] = petalesCouleurs[id] + 1;
    // Un pétale bleu terminé produit un PM passif, en jeu comme hors ligne.
    if (id === "bleu") ajouterPM(PM_PAR_PETALE_BLEU);
  } else {
    petalesBlancs = petalesBlancs + 1;   // blanc (ou teinte inconnue d'une très vieille sauvegarde)
  }
}

function formaterChance(x) {
  if (x <= 0) return "0 %";
  if (x >= 1) return x.toFixed(2).replace(".", ",") + " %";
  if (x >= 0.001) return x.toFixed(3).replace(".", ",") + " %";
  return x.toExponential(2).replace(".", ",") + " %";
}

//#region logique pure
// Règles pures de l'hybridation : aucun DOM, aucun localStorage, aucune
// variable globale du jeu. Toutes les données passent par les arguments.
// Cette région est extraite telle quelle par tests/logique.cjs.

const GENERATION_MAX = 3;
const MAX_PETALES_HYBRIDE = 10;
const DUREE_HYBRIDATION = 20;          // secondes
const COUT_HYBRIDATION_BASE = 10;
const COUT_HYBRIDATION_FACTEUR_GENERATION = 4;
const COUT_HYBRIDATION_PENTE = 0.1;
const PM_PAR_PETALE_BLEU = 1;          // PM gagnés par pétale bleu terminé

// ------------------------------------------------------------
// Invariant d'équilibrage I1 : PM passifs au maximum théorique.
// Hypothèses du meilleur cas : 10 fleurs au plancher, part colorée maximale
// (50 % pour un tier 10), l2 au niveau 10 (q = 0,12), les 6 couleurs actives.
// Chaque fleur au plancher termine t pétales en 5t secondes, soit un pétale
// toutes les 1,25 s ; le bleu est la 6ᵉ couleur, donc la plus rare.
// ------------------------------------------------------------
const PM_PASSIFS_FLEURS = 10;
const PM_PASSIFS_FRACTION_PETALE = 0.25;
const PM_PASSIFS_PLANCHER_PAR_TIER = 5;
const PM_PASSIFS_PART_COLOREE_MAX = 0.5;
const PM_PASSIFS_NIVEAU_L2_MAX = 10;
const PM_PASSIFS_Q_DEPART = 0.02;
const PM_PASSIFS_Q_PAR_NIVEAU = 0.01;
const PM_PASSIFS_COULEURS_ACTIVES_MAX = 6;
const PM_PASSIFS_SECONDES_PAR_JOUR = 86400;

// Poids normalisé de la couleur de rang `rang` parmi `n` couleurs actives.
function probabiliteCouleurRang(S, q, n, rang) {
  if (!(q > 0) || !(q < 1) || n < 1 || rang < 0 || rang >= n) return 0;
  const somme = 1 - Math.pow(q, n);
  return S * (1 - q) * Math.pow(q, rang) / somme;
}

function pmPassifsMaxParJour() {
  const q = PM_PASSIFS_Q_DEPART + PM_PASSIFS_Q_PAR_NIVEAU * PM_PASSIFS_NIVEAU_L2_MAX;
  const pBleu = probabiliteCouleurRang(
    PM_PASSIFS_PART_COLOREE_MAX, q, PM_PASSIFS_COULEURS_ACTIVES_MAX,
    PM_PASSIFS_COULEURS_ACTIVES_MAX - 1);
  const petalesParSeconde = PM_PASSIFS_FLEURS
    / (PM_PASSIFS_FRACTION_PETALE * PM_PASSIFS_PLANCHER_PAR_TIER);
  return petalesParSeconde * pBleu * PM_PASSIFS_SECONDES_PAR_JOUR * PM_PAR_PETALE_BLEU;
}

// Gain de PM d'une fusion : produit des deux tiers.
function gainPM(tierA, tierB) {
  return tierA * tierB;
}

// Génération de l'hybride : somme des générations des parents + 1.
function generationResultat(a, b) {
  return a.generation + b.generation + 1;
}

// `special` est calculé par parentDePlante : un hybride de tier élevé n'est
// jamais spécial, seules les espèces 11 et 12 le sont. Le repli sur l'ancien
// critère ne sert qu'aux objets « parent » de test qui n'ont pas encore le champ.
function estSpecialParent(x) {
  if (x.special === true) return true;
  return x.special === undefined && x.hybride !== true && x.tier > 10;
}

// Vérifie qu'une fusion est autorisée. Retourne { ok, raison }.
function peutFusionner(a, b) {
  if (!a.complete || !b.complete) return { ok: false, raison: "incomplete" };
  if (a.tier === b.tier) return { ok: false, raison: "meme-tier" };
  if (estSpecialParent(a) || estSpecialParent(b)) {
    return { ok: false, raison: "special" };
  }
  if (generationResultat(a, b) > GENERATION_MAX) return { ok: false, raison: "generation" };
  return { ok: true, raison: null };
}

// Les six choix proposés au joueur, avec leur disponibilité.
function choixDisponibles(a, b) {
  return [
    { id: "additionner", actif: a.nbPetales + b.nbPetales <= MAX_PETALES_HYBRIDE },
    { id: "vigueur", actif: true },
    { id: "rapidite", actif: true },
    { id: "gainCycle", actif: true },
    { id: "cycle0", actif: true },
    { id: "partColoree", actif: true }
  ];
}

// Coût d'une hybridation : base^tierMax × facteur^(génération−1) × (1 + pente × nbHybridations).
function coutHybridation(tierMax, generation, nbHybridations) {
  return COUT_HYBRIDATION_BASE ** tierMax
    * COUT_HYBRIDATION_FACTEUR_GENERATION ** (generation - 1)
    * (1 + COUT_HYBRIDATION_PENTE * nbHybridations);
}

// Nom de l'hybride, construit sur le nom de l'espèce ayant ce nombre de pétales.
function nomHybride(nbPetales, generation, noms) {
  return noms[nbPetales - 1] + " hybride gen" + generation;
}

// Vrai si l'identifiant fait partie des deux choix retenus (et qu'il est proposé).
function choixRetenu(choix, id) {
  return choix.indexOf(id) !== -1;
}

// Règle « le plus grand » / « le plus petit », isolée pour être facile à changer.
function plusGrand(x, y) {
  return Math.max(x, y);
}
function plusPetit(x, y) {
  return Math.min(x, y);
}

// Construit la définition de l'hybride. Retourne null si `choix` ne contient
// pas exactement deux identifiants proposés. Ne modifie aucun argument.
function caracteristiquesHybride(a, b, choix, noms) {
  if (!Array.isArray(choix) || choix.length !== 2) return null;
  const disponibles = choixDisponibles(a, b).map(function (c) { return c.id; });
  if (!choixRetenu(disponibles, choix[0]) || !choixRetenu(disponibles, choix[1]) || choix[0] === choix[1]) {
    return null;
  }

  const tier = a.tier + b.tier;   // le tier d'un hybride est la somme des tiers des parents
  const generation = generationResultat(a, b);
  // « additionner » n'est retenu que s'il était réellement disponible.
  const additionner = choixRetenu(choix, "additionner") && a.nbPetales + b.nbPetales <= MAX_PETALES_HYBRIDE;
  const nbPetales = additionner ? a.nbPetales + b.nbPetales : plusPetit(a.nbPetales, b.nbPetales);

  return {
    tier: tier,
    nom: nomHybride(nbPetales, generation, noms),
    nbPetales: nbPetales,
    dureeBase: choixRetenu(choix, "rapidite") ? plusPetit(a.dureeBase, b.dureeBase) : a.dureeBase + b.dureeBase,
    plancher: null,
    prix: null,
    prixPremierPetale: null,
    hybride: true,
    parents: [a.tier, b.tier],
    generation: generation,
    cycle: choixRetenu(choix, "cycle0") ? 0 : plusGrand(a.cycle, b.cycle),
    niveauVitesse: 0,
    petalesAchetes: nbPetales,
    gainCycle: choixRetenu(choix, "gainCycle") ? plusGrand(a.gainCycle, b.gainCycle) : plusPetit(a.gainCycle, b.gainCycle),
    bonusComplet: choixRetenu(choix, "vigueur") ? plusGrand(a.bonusComplet, b.bonusComplet) : plusPetit(a.bonusComplet, b.bonusComplet),
    partColoreeMax: choixRetenu(choix, "partColoree") ? plusGrand(a.partColoreeMax, b.partColoreeMax) : plusPetit(a.partColoreeMax, b.partColoreeMax)
  };
}
//#endregion

// ============================================================
// FABRICATION DES FLEURS
// ============================================================
const fleurs = [];
const petales = [];

//#region  Géométrie du dessin (viewBox 200 x 200, centre en 100,100). La taille réelle est gérée en CSS.
const SVGNS = "http://www.w3.org/2000/svg";
const CENTRE = 100;
const RAYON_CENTRE = 22;     // rayon du rond central
const BASE_PETALE = -27;     // début du pétale (vers le haut, depuis le centre)
const LONG_PETALE = 66;      // longueur du pétale
const MILIEU_PETALE = 60;    // distance du centre au milieu d'un pétale (pour poser le bouton)
const EMPLACEMENTS_MAX = 12;   // cartes du parterre (les emplacements 11 et 12 restent cachés tant qu'on ne les déverrouille pas)

// Capacité de pétales d'une carte : 10 pour les emplacements 0 à 9,
// 11 pour l'emplacement 10 et 12 pour l'emplacement 11.
function capacitePetales(slot) {
  if (slot === 10) return 11;
  if (slot === 11) return 12;
  return 10;
}
const FORME_PETALE = "M0,-27 C16,-41 16,-81 0,-93 C-16,-81 -16,-41 0,-27 Z";

function creerSVG(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    el.setAttribute(k, attrs[k]);
  }
  return el;
}

// Prix du premier pétale d'un hybride. Même logique que les espèces classiques
// (1,2 × le prix du tier), mais calculée directement à partir du tier : le
// tableau `reglages` ne va que jusqu'au tier 10.
function prixPremierPetaleHybride(tier) {
  return Math.round(1.2 * 10 * 10 ** (tier - 2));
}

// Définition d'une espèce classique (tier 1 à 10). Les futures plantes (hybrides,
// fleurs 11 et 12) fournissent le même format à planter().
function definitionEspece(tier) {
  const r = reglages[tier - 1];
  return {
    tier: r.tier,
    nom: r.nom,
    nbPetales: r.nbPetales,
    dureeBase: r.duree,
    prix: r.prix,
    // Le premier pétale vaut 1,2 × le prix d'achat de la fleur, puis chaque
    // pétale suivant coûte le double du précédent. La fleur 1 est gratuite :
    // son premier pétale garde le prix de base historique.
    prixPremierPetale: r.prix > 0 ? Math.round(r.prix * 1.2) : DEPART_PETALE,
    plancher: r.tier * 5,
    hybride: false,
    parents: null
  };
}

// Espèces spéciales des emplacements 11 et 12 (Lunéa, Clématite).
// TODO : formules propres (spécification, section 7) — prix et formules de
// vitesse/cycle pas encore décidés ; ces définitions ne sont branchées à aucun achat.
// Fleurs spéciales 11 et 12 (prompt 8) : un seul objet regroupe tout ce qui
// peut être réglé (emplacement réservé, pétales, durée, plancher, prix).
// Tant que les formules propres ne sont pas décidées, la vitesse et le cycle
// utilisent la formule des tiers (voir prixVitesseFleur / prixCycleFleur).
const PARAMETRES_SPECIAUX = {
  11: { tier: 11, slot: 10, nom: "Lunéa", nbPetales: 11, dureeBase: 86400, plancher: 300, prix: 1e10 },
  12: { tier: 12, slot: 11, nom: "Clématite", nbPetales: 12, dureeBase: 172800, plancher: 600, prix: 1e11 }
};

function definitionEspeciale(tier) {
  const p = PARAMETRES_SPECIAUX[tier];
  if (!p) return null;
  return {
    tier: p.tier,
    nom: p.nom,
    nbPetales: p.nbPetales,
    dureeBase: p.dureeBase,
    plancher: p.plancher,
    prix: p.prix,
    // Comme les espèces classiques : premier pétale = 1,2 × le prix d'achat,
    // puis chaque pétale suivant coûte le double du précédent.
    prixPremierPetale: Math.round(p.prix * 1.2),
    hybride: false,
    parents: null
  };
}

// 12 cartes DOM créées une seule fois, chacune avec sa capacité de pétales
// (10, ou 11 / 12 pour les deux dernières). Ensuite, tout changement (achat,
// plantation, vidage) passe par l'état de l'objet fleur : aucune création ni
// destruction de DOM après le démarrage.
for (let slot = 0; slot < EMPLACEMENTS_MAX; slot++) {
  const capacite = capacitePetales(slot);
  // Carte à taille fixe : un état verrouillé (bouton d'achat), un état libre et un état planté (dessin et boutons)
  const maDiv = document.createElement("div");
  maDiv.className = "fleur";
  // Dégradé entre les fleurs : teinte fixe 120°, saturation douce, luminosité peu contrastée
  const luminosite = 70 - slot * 2;
  maDiv.style.backgroundColor = "hsl(120, 30%, " + luminosite + "%)";

  // ---------- État verrouillé : bouton d'achat de la fleur ----------
  const verrou = document.createElement("div");
  verrou.className = "fleur-verrou";

  const boutonFleur = document.createElement("button");
  boutonFleur.className = "bouton-acheter-fleur";
  const afIcone = document.createElement("span");
  afIcone.className = "baf-icone";
  afIcone.textContent = ICONES.fleur;
  const afTexte = document.createElement("span");
  afTexte.textContent = "Acheter";
  const afPrix = document.createElement("span");
  boutonFleur.appendChild(afIcone);
  boutonFleur.appendChild(afTexte);
  boutonFleur.appendChild(afPrix);
  verrou.appendChild(boutonFleur);

  // ---------- État libre : emplacement déverrouillé mais vide ----------
  const vide = document.createElement("div");
  vide.className = "fleur-vide";
  const libelleVide = document.createElement("span");
  libelleVide.textContent = "Emplacement libre";
  const boutonPlanter = document.createElement("button");
  boutonPlanter.type = "button";
  boutonPlanter.className = "bouton-planter";
  boutonPlanter.textContent = "Planter…";
  vide.appendChild(libelleVide);
  vide.appendChild(boutonPlanter);
  vide.style.display = "none";

  // ---------- État planté ----------
  const contenu = document.createElement("div");
  contenu.className = "fleur-contenu";

  // Titre : nom + icônes de pétales sur la même ligne
  const titre = document.createElement("p");
  titre.className = "titre-fleur";
  const nom = document.createElement("span");
  titre.appendChild(nom);
  const emplacements = document.createElement("span");
  emplacements.className = "emplacements";
  const icones = [];
  for (let i = 0; i < capacite; i++) {
    const icone = document.createElement("span");
    icone.className = "icone-petale";
    emplacements.appendChild(icone);
    icones.push(icone);
  }
  titre.appendChild(emplacements);

  // Sous le titre : gain de cycle, bonus de fleur complète, cycle en cours
  const ligneInfos = document.createElement("div");
  ligneInfos.className = "infos";
  const gainCycle = document.createElement("span");
  gainCycle.className = "gain-cycle";
  ligneInfos.appendChild(gainCycle);

  const ligneBonus = document.createElement("div");
  ligneBonus.className = "infos";
  const gainBonus = document.createElement("span");
  gainBonus.className = "gain-bonus";
  ligneBonus.appendChild(gainBonus);

  const cycleAffiche = document.createElement("div");
  cycleAffiche.className = "infos";

  // Dessin SVG : rond central + 10 pétales (le nombre de pétales réels dépend de la plante)
  const zoneDessin = document.createElement("div");
  zoneDessin.className = "zone-dessin";
  const svg = creerSVG("svg", { viewBox: "0 0 200 200", "class": "dessin age-semis" });
  const decorAge = fabriquerDecorAge("c" + slot);
  svg.appendChild(decorAge.arriere);

  const petalesCarte = [];
  const boutonsPetales = [];
  for (let i = 0; i < capacite; i++) {
    const angle = i * 360 / capacite;
    const g = creerSVG("g", { transform: "rotate(" + angle + " " + CENTRE + " " + CENTRE + ") translate(" + CENTRE + " " + CENTRE + ")" });
    const fond = creerSVG("path", { d: FORME_PETALE, "class": "petale-fond inutilise" });
    g.appendChild(fond);
    const idClip = "clip-" + slot + "-" + i;
    const clip = creerSVG("clipPath", { id: idClip });
    const rectClip = creerSVG("rect", { x: -30, y: BASE_PETALE, width: 60, height: 0 });
    clip.appendChild(rectClip);
    g.appendChild(clip);
    const rempli = creerSVG("path", { d: FORME_PETALE, "class": "petale-rempli", "clip-path": "url(#" + idClip + ")" });
    g.appendChild(rempli);

    // Bouton d'achat posé sur le pétale (juste le prix) ; texte et prix fixés par rafraichirFormeFleur()
    const bouton = document.createElement("button");
    bouton.className = "achat achat-petale";
    const rad = angle * Math.PI / 180;
    // Position en pourcentage : le bouton suit le dessin quand la carte change de taille
    bouton.style.left = (((CENTRE + MILIEU_PETALE * Math.sin(rad)) / 200) * 100) + "%";
    bouton.style.top = (((CENTRE - MILIEU_PETALE * Math.cos(rad)) / 200) * 100) + "%";
    bouton.style.display = "none";
    boutonsPetales.push(bouton);
    svg.appendChild(g);
    petalesCarte.push({ fond: fond, rectClip: rectClip, rempli: rempli, g: g, angle: angle,
      baseT: "rotate(" + angle + " " + CENTRE + " " + CENTRE + ") translate(" + CENTRE + " " + CENTRE + ")" });
  }
  svg.appendChild(decorAge.avant);

  // Rond central : se remplit en concentrique, avec le temps restant écrit au centre
  const groupeCentre = creerSVG("g", {});
  const fondCentre = creerSVG("circle", { cx: CENTRE, cy: CENTRE, r: RAYON_CENTRE, "class": "centre-fond" });
  const remplissageCentre = creerSVG("circle", { cx: CENTRE, cy: CENTRE, r: 0, "class": "centre-rempli" });
  const contourCentre = creerSVG("circle", { cx: CENTRE, cy: CENTRE, r: RAYON_CENTRE, "class": "centre-contour" });
  const texteCentre = creerSVG("text", { x: CENTRE, y: CENTRE, dy: "0.35em", "text-anchor": "middle", "class": "centre-texte" });
  const titreCentre = creerSVG("title", {});   // infobulle : durée de la fleur
  groupeCentre.appendChild(fondCentre);
  groupeCentre.appendChild(remplissageCentre);
  groupeCentre.appendChild(contourCentre);
  groupeCentre.appendChild(texteCentre);
  groupeCentre.appendChild(titreCentre);
  svg.appendChild(groupeCentre);
  svg.appendChild(decorAge.dessus);
  zoneDessin.appendChild(svg);
  for (const b of boutonsPetales) {
    zoneDessin.appendChild(b);
  }

  // Sous le dessin : cycle et vitesse
  const colonneBoutons = document.createElement("div");
  colonneBoutons.className = "colonne-boutons";

  const boutonCycle = document.createElement("button");

  const boutonVitesse = document.createElement("button");
  boutonVitesse.textContent = ICONES.vitesse + "x1" ;
  const boutonVitesseMax = document.createElement("button");
  boutonVitesseMax.textContent = ICONES.vitesse + " Max";
  const boutonSol = document.createElement("button");
  boutonSol.className = "bouton-sol";
  boutonSol.textContent = "Sol";
  const ligneVitesse = document.createElement("div");
  ligneVitesse.className = "ligne-vitesse";
  ligneVitesse.appendChild(boutonVitesse);
  ligneVitesse.appendChild(boutonVitesseMax);
  // Ordre des boutons : vitesse, puis cycle, puis Sol.
  colonneBoutons.appendChild(ligneVitesse);
  colonneBoutons.appendChild(boutonCycle);
  const ligneSol = document.createElement("div");
  ligneSol.className = "ligne-sol";
  ligneSol.appendChild(boutonSol);
  colonneBoutons.appendChild(ligneSol);

  // Objet fleur : l'état de l'emplacement `slot`
  const fleur = {
    slot: slot,
    etat: slot === 0 ? "plante" : "verrouille",   // "verrouille" | "vide" | "plante"
    // Définition de la plante (renseignée par appliquerDefinition ; tier === null : aucune)
    tier: null,
    nom: "",
    nbPetales: 0,
    dureeBase: 0,
    prix: 0,
    prixPremierPetale: 0,
    hybride: false,
    parents: null,
    // Champs additifs des hybrides (null = formule historique basée sur le tier).
    generation: 0,
    gainCycle: null,
    bonusComplet: null,
    partColoreeMax: null,
    // Vrai dès la première plantation, ne repasse jamais à false.
    dejaPlante: slot === 0,
    // Graine d'origine quand la plante a été replantée depuis la collection.
    graineId: null,
    // Croissance
    // Croissance
    progression: 0,
    petalesAchetes: 0,
    completions: 0,
    cycle: 0,
    niveauVitesse: 0,
    petales: [],
    // DOM
    svg: svg,
    ageAffiche: null,
    div: maDiv,
    verrou: verrou,
    vide: vide,
    boutonPlanter: boutonPlanter,
    contenu: contenu,
    nomAffiche: nom,
    prixAffiche: afPrix,
    // Référence DOM du libellé (le champ de données `gainCycle` porte la valeur propre).
    gainCycleTexte: gainCycle,
    remplissageCentre: remplissageCentre,
    texteCentre: texteCentre,
    titreCentre: titreCentre,
    cycleAffiche: cycleAffiche,
    icones: icones,
    gainBonus: gainBonus,
    bouton: boutonFleur,
    boutonCycle: boutonCycle,
    boutonVitesse: boutonVitesse,
    boutonVitesseMax: boutonVitesseMax,
    boutonSol: boutonSol,
  };
  // Alias de lecture : une fleur est « achetée » quand son emplacement contient une plante.
  Object.defineProperty(fleur, "achete", {
    get: function () { return this.etat === "plante"; },
    set: function (v) { this.etat = v ? "plante" : "verrouille"; }
  });
  fleurs.push(fleur);

  // Le bouton « Planter… » d'une case vide ouvre le sélecteur de replantation.
  boutonPlanter.addEventListener("click", function () {
    ouvrirReplantation(slot);
  });

  // Objets pétales : autant que la capacité de la carte, `existe` dit s'ils font partie de la plante
  for (let i = 0; i < capacite; i++) {
    const p = {
      progression: 0,
      achete: false,
      existe: false,
      rang: i,
      prix: 0,
      fleur: fleur,
      fond: petalesCarte[i].fond,
      rectClip: petalesCarte[i].rectClip,
      rempli: petalesCarte[i].rempli,
      g: petalesCarte[i].g,
      angle: petalesCarte[i].angle,
      baseT: petalesCarte[i].baseT,
      teinte: COULEUR_PETALE_BLANC,
      bouton: boutonsPetales[i],
    };
    fleur.petales.push(p);
    petales.push(p);
  }

  // Les 10 premiers emplacements contiennent les 10 espèces classiques (la première est déjà plantée).
  // Les emplacements 10 et 11 restent verrouillés et cachés, sans définition.
  if (slot < reglages.length) {
    appliquerDefinition(fleur, definitionEspece(slot + 1));
  } else {
    appliquerDefinition(fleur, null);
  }

  contenu.appendChild(titre);
  contenu.appendChild(ligneInfos);
  contenu.appendChild(ligneBonus);
  contenu.appendChild(cycleAffiche);
  contenu.appendChild(zoneDessin);
  contenu.appendChild(colonneBoutons);
  maDiv.appendChild(verrou);
  maDiv.appendChild(vide);
  maDiv.appendChild(contenu);
  jardin.appendChild(maDiv);
}

// ------------------------------------------------------------
// ÉTAT DES EMPLACEMENTS : fonctions que l'hybridation et la replantation utiliseront.
// Elles ne modifient que l'état (jamais une ressource : l'appelant décide du coût).
// ------------------------------------------------------------

// Applique une définition de plante (ou null) et remet à jour tout ce qui en dépend à l'écran.
function appliquerDefinition(f, def) {
  if (def) {
    f.tier = def.tier;
    f.nom = def.nom;
    f.nbPetales = def.nbPetales;
    f.dureeBase = def.dureeBase;
    f.plancher = def.plancher != null ? def.plancher : def.tier * 5;
    f.prix = def.prix;
    // Un hybride n'a pas de prix de fleur : ses pétales se calculent à partir
    // du tier, sans écrire la valeur dans la définition sauvegardée de la graine.
    f.prixPremierPetale = def.hybride === true
      && (def.prixPremierPetale === null || !Number.isFinite(def.prixPremierPetale))
      ? prixPremierPetaleHybride(def.tier)
      : def.prixPremierPetale;
    f.hybride = def.hybride === true;
    f.parents = def.parents || null;
    // Champs additifs des hybrides (null = formule historique basée sur le tier).
    f.generation = def.generation ?? 0;
    f.gainCycle = def.gainCycle ?? null;
    f.bonusComplet = def.bonusComplet ?? null;
    f.partColoreeMax = def.partColoreeMax ?? null;
    f.graineId = null;
  } else {
    f.tier = null;
    f.nom = "";
    f.nbPetales = 0;
    f.dureeBase = 0;
    f.plancher = null;
    f.prix = 0;
    f.prixPremierPetale = 0;
    f.hybride = false;
    f.parents = null;
    f.generation = 0;
    f.gainCycle = null;
    f.bonusComplet = null;
    f.partColoreeMax = null;
    f.graineId = null;
  }
  rafraichirFormeFleur(f);
}

// Textes et pétales existants d'une carte : dépend uniquement de la définition.
function rafraichirFormeFleur(f) {
  const aDef = f.tier !== null;
  f.nomAffiche.textContent = f.nom;
  f.titreCentre.textContent = f.nom;
  f.prixAffiche.textContent = formaterNombre(f.prix) + " " + ICONES.verdance;
  f.bouton.title = "Acheter cette fleur (" + formaterNombre(f.prix) + " " + ICONES.verdance + ")";
  f.gainCycleTexte.textContent = aDef ? ICONES.cycle + "+" + (f.gainCycle ?? f.tier) + " par cycle terminé" : "";
  f.gainBonus.textContent = aDef ? "Gain ×" + bonusAffiche(f).toFixed(1) + " si fleur complète" : "";
  f.boutonCycle.textContent = aDef ? "Terminer cycle " + f.cycle + " : +" + (f.gainCycle ?? f.tier) + ICONES.cycle : "";
  for (let i = 0; i < f.petales.length; i++) {
    const p = f.petales[i];
    p.existe = i < f.nbPetales;
    f.icones[i].style.display = p.existe ? "" : "none";
    p.prix = p.existe ? Math.round(f.prixPremierPetale * PROGRESSION_PETALE ** i) : 0;
    p.fond.setAttribute("class", "petale-fond " + (!p.existe ? "inutilise" : (p.achete ? "achete" : "emplacement")));
    p.rempli.style.display = p.existe ? "" : "none";
    p.bouton.style.display = "none";
    if (p.existe) {
      p.bouton.textContent = formaterPrix(p.prix);   // une seule ligne : l'icône Verdance est dans l'infobulle
      p.bouton.title = "Acheter " + ICONES.petale + " " + (i + 1) + "/" + f.nbPetales + " (" + formaterNombre(p.prix) + " " + ICONES.verdance + ")";
    }
  }
}

// Affichage de la croissance d'une carte (rond central, pétales, icônes, bonus).
function rafraichirCarte(f) {
  rafraichirAgeVisuel(f);
  for (let j = 0; j < f.icones.length; j++) {
    f.icones[j].classList.toggle("plein", j < f.petalesAchetes);
  }
  if (f.tier !== null) {
    f.gainBonus.classList.toggle("plein", fleurComplete(f));
    f.gainBonus.textContent = fleurComplete(f)
      ? "Gain ×" + bonusAffiche(f).toFixed(1)
      : "Gain ×" + bonusAffiche(f).toFixed(1) + " si fleur complète";
    // Remet le rond central à sa progression sauvegardée
    const taux = Math.min(f.progression, 100) / 100;
    f.remplissageCentre.setAttribute("r", (RAYON_CENTRE * taux).toFixed(2));
    f.texteCentre.textContent = formaterTempsCourt(Math.max(0, (100 - f.progression) * 0.01 * dureeActuelle(f)));
  } else {
    f.remplissageCentre.setAttribute("r", "0");
    f.texteCentre.textContent = "";
  }
  for (const p of f.petales) {
    if (!p.existe) continue;
    if (p.achete) {
      p.fond.setAttribute("class", "petale-fond achete");
    }
    // Remet le remplissage du pétale à sa progression sauvegardée
    const h = LONG_PETALE * Math.min(p.progression, 100) / 100;
    p.rectClip.setAttribute("y", (BASE_PETALE - h).toFixed(2));
    p.rectClip.setAttribute("height", h.toFixed(2));
    p.rempli.style.fill = p.teinte || COULEUR_PETALE_BLANC;
  }
}

function reinitialiserCroissance(f) {
  f.progression = 0;
  f.petalesAchetes = 0;
  f.completions = 0;
  f.cycle = 0;
  f.niveauVitesse = 0;
  f.dernierRayon = null;
  f.dernierTexte = null;
  for (const p of f.petales) {
    p.progression = 0;
    p.achete = false;
    p.teinte = COULEUR_PETALE_BLANC;
    p.dernierH = null;
  }
  rafraichirFormeFleur(f);
  rafraichirCarte(f);
}

function finirChangementEmplacement() {
  etatSale = true;
  mettreAJourBoutons();
  mettreAJourGain();
  rafraichirLaboratoire();
  if (slotReplantation !== null) rafraichirReplantation();
}

// Un emplacement verrouillé est achetable si sa définition existe et si
// l'emplacement précédent a DÉJÀ été planté (dejaPlante ne repasse jamais à false,
// même après une hybridation qui vide des cases).
function boutonFleurAchetable(f) {
  const precedentePlantee = f.slot === 0 || fleurs[f.slot - 1].dejaPlante === true;
  return f.etat === "verrouille" && f.tier !== null && precedentePlantee;
}

// Emplacement verrouillé et sans définition (11 et 12) -> libre.
function deverrouillerEmplacement(slot) {
  const f = fleurs[slot];
  if (!f || f.etat !== "verrouille" || f.tier !== null) return false;
  f.etat = "vide";
  finirChangementEmplacement();
  return true;
}

// Emplacement libre -> planté. `definition` : { tier, nom, nbPetales (1..10), dureeBase, prix, prixPremierPetale, hybride, parents }
// options.cycle : cycle de départ (sinon definition.cycle, sinon 0).
// options.graineId mémorise la graine d'origine pour compter ses plantations en cours.
// Une espèce basique démarre à 0 pétale acheté (ils sont à racheter) ; une graine hybride
// est plantée avec TOUS ses pétales déjà achetés (fleur complète). Dans les deux cas :
// niveau de vitesse 0, sans progression ni complétion.
function planter(slot, definition, options) {
  const opts = options || {};
  const f = fleurs[slot];
  if (!f || f.etat !== "vide" || !definition) return false;
  const n = definition.nbPetales;
  if (!Number.isInteger(n) || n < 1 || n > capacitePetales(slot)) return false;
  if (!(definition.dureeBase > 0) || !Number.isFinite(definition.tier)) return false;
  // Une fleur spéciale ne peut être plantée que dans son emplacement réservé.
  // Les hybrides, même de tier 11 ou 12, ne sont pas concernés.
  if (!definition.hybride && (definition.tier === 11 || definition.tier === 12)) {
    const p = PARAMETRES_SPECIAUX[definition.tier];
    if (!p || p.slot !== slot) return false;
  }
  appliquerDefinition(f, definition);
  reinitialiserCroissance(f);
  // Le cycle de départ est appliqué après la remise à zéro ; l'âge en découle.
  f.cycle = Number.isFinite(opts.cycle)
    ? opts.cycle
    : (Number.isFinite(definition.cycle) ? definition.cycle : 0);
  f.niveauVitesse = 0;
  f.petalesAchetes = 0;
  f.completions = 0;
  f.progression = 0;
  if (definition.hybride === true) {
    // Un hybride arrive avec tous ses pétales achetés, chacun avec sa teinte tirée.
    f.petalesAchetes = n;
    for (let rang = 0; rang < n; rang++) {
      const p = f.petales[rang];
      p.achete = true;
      p.teinte = tirerTeinte(f);
      if (p.rempli) p.rempli.style.fill = p.teinte;
    }
    rafraichirFormeFleur(f);
  }
  rafraichirCarte(f);
  f.graineId = opts.graineId !== undefined && opts.graineId !== null ? opts.graineId : null;
  f.etat = "plante";
  f.dejaPlante = true;
  finirChangementEmplacement();
  return true;
}

// Emplacement planté -> libre. Les compteurs globaux (cycles, pétales colorés, compost) sont conservés.
function viderEmplacement(slot) {
  const f = fleurs[slot];
  if (!f || f.etat !== "plante") return false;
  compostDebloque();   // fige le déblocage du compost avant de perdre la plante
  if (fleurSolOuverte === f) fermerSol();
  f.etat = "vide";
  appliquerDefinition(f, null);
  reinitialiserCroissance(f);
  finirChangementEmplacement();
  return true;
}

// ------------------------------------------------------------
// REPLANTATION (prompt 6) : une case vide peut rester vide ; le joueur y
// replante soit une espèce basique déjà possédée, soit une graine hybride.
// Une graine hybride est à usage unique : une fois plantée, elle reste dans la
// collection (marquée « plantée ») mais n'est plus proposée sans nouvelle hybridation.
// ------------------------------------------------------------

function definitionPlantable(slot, definition) {
  if (!definition) return false;
  const n = definition.nbPetales;
  return Number.isFinite(definition.tier)
    && Number.isInteger(n) && n >= 1 && n <= capacitePetales(slot)
    && definition.dureeBase > 0;
}

// Une espèce est possédée quand son emplacement d'origine a déjà été planté.
function especePossedee(tier) {
  const f = fleurs[tier - 1];
  return !!(f && f.dejaPlante === true);
}

function prixCompostReplantation(tier) {
  return tier * PRIX_COMPOST_REPLANTATION_PAR_TIER;
}

function prixCompostMatureGraineHybride(tier) {
  return tier * PRIX_COMPOST_MATURE_GRAINE_HYBRIDE_PAR_TIER;
}

// ---------- Âges des plantes ----------
// L'âge se déduit du cycle : Semis 0, Jeune 1-3, Adulte 4-9, Vénérable 10 et plus.
const NOMS_AGES = { semis: "Semis", jeune: "Jeune", adulte: "Adulte", venerable: "Vénérable" };
const CLES_AGES = ["semis", "jeune", "adulte", "venerable"];
const INFOS_AGES = {
  semis:     { cycles: "Cycle 0",          bonus: "Ne produit que des pétales blancs" },
  jeune:     { cycles: "Cycles 1 à 3",     bonus: "Niveaux de vitesse 20 % moins chers" },
  adulte:    { cycles: "Cycles 4 à 9",     bonus: "2 fragments de graine par cycle" },
  venerable: { cycles: "Cycle 10 et plus", bonus: "Pollinise les 8 cartes autour (diagonales comprises) : +2 % de part colorée chacune, cumulable" }
};
const REMISE_VITESSE = 0.8;          // niveaux de vitesse à 80 % du prix dès l'âge Jeune
const BONUS_POLLINISATION = 2;       // points de part colorée par voisine Vénérable
const PLAFOND_POLLINISATION = 50;    // la pollinisation ne fait jamais dépasser ce plafond

function ageDeCycle(cycle) {
  if (cycle >= 10) return "venerable";
  if (cycle >= 4) return "adulte";
  if (cycle >= 1) return "jeune";
  return "semis";
}

function ageDe(f) {
  return ageDeCycle(f.cycle || 0);
}

function prixVitesseFleur(f, niveau) {
  // Provisoire : la formule des tiers sert aussi aux fleurs spéciales.
  const base = prixVitesse(f.tier, niveau);
  return ageDe(f) === "semis" ? base : base * REMISE_VITESSE;
}

// Le parterre est toujours une grille de 4 colonnes × 3 lignes (la place d'une carte ne change
// jamais). Une Vénérable pollinise les cartes qui l'entourent dans les 8 directions.
const COLONNES_PARTERRE = 4;
const POLLINISATION_SUR_SOI = false;   // true : la Vénérable bénéficie aussi de sa propre pollinisation
// Pour chaque emplacement : la liste des emplacements qui l'entourent (calculée une seule fois).
const voisinsPollinisation = (function () {
  const lignes = Math.ceil(EMPLACEMENTS_MAX / COLONNES_PARTERRE);
  const liste = [];
  for (let slot = 0; slot < EMPLACEMENTS_MAX; slot++) {
    const l = Math.floor(slot / COLONNES_PARTERRE);
    const c = slot % COLONNES_PARTERRE;
    const voisins = [];
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dl === 0 && dc === 0 && !POLLINISATION_SUR_SOI) continue;
        const nl = l + dl;
        const nc = c + dc;
        if (nl < 0 || nl >= lignes || nc < 0 || nc >= COLONNES_PARTERRE) continue;
        const autre = nl * COLONNES_PARTERRE + nc;
        if (autre < EMPLACEMENTS_MAX) voisins.push(autre);
      }
    }
    liste.push(voisins);
  }
  return liste;
})();

// Nombre de cartes Vénérables qui pollinisent cette plante.
function voisinesVenerables(f) {
  let n = 0;
  for (const slot of voisinsPollinisation[f.slot]) {
    const v = fleurs[slot];
    if (v && v.etat === "plante" && ageDe(v) === "venerable") n = n + 1;
  }
  return n;
}

// Points de part colorée apportés par les voisines Vénérables (les bonus se cumulent).
function bonusPollinisation(f) {
  return voisinesVenerables(f) * BONUS_POLLINISATION;
}

// Texte du plafond pour le panneau Sol : « plafond 10 % + 4 % pollinisation (2 voisines Vénérables) ».
function texteDetailPlafond(f) {
  const base = f.partColoreeMax ?? 5 * f.tier;
  const n = voisinesVenerables(f);
  let texte = "plafond " + base + " %";
  if (n > 0) {
    const bonus = n * BONUS_POLLINISATION;
    texte += " + " + bonus + " % pollinisation (" + n + (n > 1 ? " voisines Vénérables" : " voisine Vénérable") + ")";
    if (base + bonus > PLAFOND_POLLINISATION) texte += ", limité à " + PLAFOND_POLLINISATION + " %";
  }
  return texte;
}

// Plafond de part colorée : celui de la plante, plus la pollinisation, sans jamais passer
// au-dessus de 50 % ni retomber sous le plafond de base.
function plafondPartColoree(f) {
  const base = f.partColoreeMax ?? 5 * f.tier;
  return Math.max(base, Math.min(PLAFOND_POLLINISATION, base + bonusPollinisation(f)));
}

function pointPolaire(r, deg) {
  const a = deg * Math.PI / 180;
  return { x: +(CENTRE + r * Math.sin(a)).toFixed(2), y: +(CENTRE - r * Math.cos(a)).toFixed(2) };
}

// Les lobes n'ont plus de contour : le dessin reste doux, sans bordure visible.
function couronneDecor(groupe, n, rayonCentre, rayon, decalage, fond) {
  for (let i = 0; i < n; i++) {
    const p = pointPolaire(rayonCentre, decalage + i * 360 / n);
    groupe.appendChild(creerSVG("circle", {
      cx: p.x, cy: p.y, r: rayon, fill: fond, "fill-opacity": "0.3"
    }));
  }
}

// Décor des âges d'un dessin de fleur : trois groupes créés une seule fois au démarrage
// (derrière les pétales, devant, et au-dessus du centre). L'âge affiché est choisi en CSS
// par la classe age-* du dessin ; rien n'est créé ni retiré ensuite.
function fabriquerDecorAge(idUnique) {
  // Échelle 0,85 : les couronnes (rayon 88 + 30 = 118) tiennent dans la zone de dessin (100).
  const reduction = "translate(100 100) scale(0.85) translate(-100 -100)";
  const arriere = creerSVG("g", {});
  const avant = creerSVG("g", {});
  const dessus = creerSVG("g", {});

  const defs = creerSVG("defs", {});
  const degrade = creerSVG("radialGradient", { id: "halo-" + idUnique, cx: "50%", cy: "50%", r: "50%" });
  [["0", "0.3"], ["0.7", "0.2"], ["1", "0"]].forEach(function (s) {
    degrade.appendChild(creerSVG("stop", { offset: s[0], "stop-color": "#ffc107", "stop-opacity": s[1] }));
  });
  defs.appendChild(degrade);
  arriere.appendChild(defs);

  // Semis : six petites feuilles rondes, plus courtes que les pétales.
  const semis = creerSVG("g", { "class": "a-semis" });
  for (let k = 0; k < 6; k++) {
    const feuille = creerSVG("g", { transform: "rotate(" + (30 + 60 * k) + " 100 100) translate(100 100)" });
    feuille.appendChild(creerSVG("ellipse", { cx: 0, cy: -50, rx: 18, ry: 28, fill: "#6d9f70", "fill-opacity": "0.3" }));
    semis.appendChild(feuille);
  }
  arriere.appendChild(semis);

  // Jeune : couronne de six larges lobes ronds.
  const jeune = creerSVG("g", { "class": "a-jeune", transform: reduction });
  couronneDecor(jeune, 6, 72, 36, 30, "#6d9f70");
  arriere.appendChild(jeune);

  // Adulte : seconde couronne, plus large.
  const adulte = creerSVG("g", { "class": "a-adulte", transform: reduction });
  couronneDecor(adulte, 6, 88, 30, 0, "#5f9463");
  couronneDecor(adulte, 6, 72, 36, 30, "#6d9f70");
  arriere.appendChild(adulte);

  // Vénérable : même couronne, contour doré, baignée d'un halo doré.
  const venerable = creerSVG("g", { "class": "a-venerable", transform: reduction });
  couronneDecor(venerable, 6, 88, 30, 0, "#5f9463");
  couronneDecor(venerable, 6, 72, 36, 30, "#6d9f70");
  venerable.appendChild(creerSVG("circle", { cx: 100, cy: 100, r: 125, fill: "url(#halo-" + idUnique + ")" }));
  arriere.appendChild(venerable);

  // Devant les pétales : pollen (Adulte et Vénérable), anneau et étamines dorés (Vénérable).
  const pollen = creerSVG("g", { "class": "a-adulte a-venerable" });
  for (let i = 0; i < 10; i++) {
    const p = pointPolaire(29, i * 36 + 18);
    pollen.appendChild(creerSVG("circle", { cx: p.x, cy: p.y, r: 3.2, fill: "#e6d28a", stroke: "#c9a93a", "stroke-width": 0.8 }));
  }
  avant.appendChild(pollen);
  const orVen = creerSVG("g", { "class": "a-venerable" });
  orVen.appendChild(creerSVG("circle", { cx: 100, cy: 100, r: 25, fill: "none", stroke: "#d9b84a", "stroke-width": 2.6 }));
  for (let i = 0; i < 10; i++) {
    const a = pointPolaire(25, i * 36 + 18);
    const b = pointPolaire(41, i * 36 + 18);
    orVen.appendChild(creerSVG("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#d9b84a", "stroke-width": 2, "stroke-linecap": "round" }));
    orVen.appendChild(creerSVG("circle", { cx: b.x, cy: b.y, r: 3, fill: "#f3e6a8", stroke: "#c9a93a", "stroke-width": 1 }));
  }
  avant.appendChild(orVen);

  // Lucioles qui scintillent (Vénérable), au-dessus du centre.
  const lucioles = creerSVG("g", { "class": "a-venerable" });
  [[15, 88], [75, 90], [135, 88], [195, 90], [255, 88], [315, 90]].forEach(function (ra) {
    const p = pointPolaire(ra[1], ra[0]);
    const l = creerSVG("g", {});
    l.appendChild(creerSVG("animate", { attributeName: "opacity", values: "0.3;1;0.3", dur: "2.6s", repeatCount: "indefinite" }));
    l.appendChild(creerSVG("circle", { cx: p.x, cy: p.y, r: 7, fill: "#fff176", "fill-opacity": "0.3" }));
    l.appendChild(creerSVG("circle", { cx: p.x, cy: p.y, r: 2.6, fill: "#fffde7", stroke: "#d9b84a", "stroke-width": 0.9 }));
    lucioles.appendChild(l);
  });
  dessus.appendChild(lucioles);

  return { arriere: arriere, avant: avant, dessus: dessus };
}

// Applique l'âge d'une plante à sa carte : classe du dessin, pétales plus courts au stade
// Semis, boutons de pétales recentrés. Ne fait rien tant que l'âge ne change pas.
function rafraichirAgeVisuel(f) {
  const age = ageDe(f);
  if (f.ageAffiche === age) return;
  f.ageAffiche = age;
  f.svg.setAttribute("class", "dessin age-" + age);
  const semis = age === "semis";
  const sx = semis ? 0.8 : 1;
  const sy = semis ? 0.74 : 1;
  for (const p of f.petales) {
    p.g.setAttribute("transform", p.baseT + (semis ? " scale(" + sx + " " + sy + ")" : ""));
    const rad = p.angle * Math.PI / 180;
    p.bouton.style.left = (((CENTRE + MILIEU_PETALE * sy * Math.sin(rad)) / 200) * 100) + "%";
    p.bouton.style.top = (((CENTRE - MILIEU_PETALE * sy * Math.cos(rad)) / 200) * 100) + "%";
  }
}

// ---------- Sac de graines ----------
// Un cycle terminé rapporte 1 fragment de l'espèce ; N fragments = 1 graine
// (N = 2 + ⌈(11 − tier) / 3⌉ : 6 pour l'Arum, 3 pour l'Anémone, les autres suivent).
function fragmentsParGraine(tier) {
  return 2 + Math.ceil((11 - tier) / 3);
}

function entreeSac(tier) {
  if (!sacGraines[tier]) sacGraines[tier] = { graines: 0, fragments: 0 };
  return sacGraines[tier];
}

function totalGrainesSac() {
  let total = 0;
  for (const e of sacGraines) if (e) total = total + e.graines;
  return total;
}

// Les hybrides ne donnent pas de fragments : leurs graines viennent du laboratoire.
function crediterFragments(f, quantite) {
  if (!f || f.hybride || !Number.isInteger(f.tier) || f.tier < 1 || f.tier > reglages.length) return;
  const e = entreeSac(f.tier);
  const n = fragmentsParGraine(f.tier);
  // À partir du cycle 4 (Adulte), un cycle terminé rapporte 2 fragments au lieu d'1.
  const parDefaut = (f.cycle - 1) >= 4 ? 2 : 1;
  e.fragments = e.fragments + (quantite === undefined ? parDefaut : quantite);
  while (e.fragments >= n) {
    e.fragments = e.fragments - n;
    e.graines = Math.min(MAX_GRAINES_SAC, e.graines + 1);
  }
  if (e.graines >= MAX_GRAINES_SAC) e.fragments = 0;   // sac plein : les fragments s'arrêtent
  rafraichirSac();
}

function sacHtml() {
  let html = "";
  for (let tier = 1; tier <= reglages.length; tier++) {
    if (!especePossedee(tier)) continue;
    const e = entreeSac(tier);
    const n = fragmentsParGraine(tier);
    let points = "";
    if (e.graines >= MAX_GRAINES_SAC) {
      points = "plein";
    } else {
      for (let i = 0; i < n; i++) points = points + (i < e.fragments ? "●" : "○");
    }
    html = html + '<div class="sac-ligne' + (e.graines === 0 ? " vide" : "") + '">'
      + '<span class="sac-nom">' + echapperHtml(reglages[tier - 1].nom) + "</span>"
      + '<span class="sac-graines">' + ICONES.graine + " ×" + e.graines + "</span>"
      + '<span class="sac-fragments" title="Fragments : ' + e.fragments + " / " + n + '">' + points + "</span>"
      + "</div>";
  }
  if (html === "") html = '<p class="sac-vide">Aucune espèce plantée pour l\'instant.</p>';
  return html;
}

// Graines hybrides non encore plantées (usage unique).
function grainesHybridesDisponibles() {
  return graines.filter(function (g) { return g && g.plantee !== true; });
}

function sacHybridesHtml() {
  const dispo = grainesHybridesDisponibles();
  if (dispo.length === 0) {
    return '<p class="sac-vide">Aucune graine hybride disponible.</p>';
  }
  return dispo.map(function (g) {
    const d = g.definition || {};
    return '<div class="sac-ligne">'
      + '<span class="sac-nom">' + echapperHtml(d.nom || "Hybride") + "</span>"
      + '<span class="sac-graines">' + ICONES.graine + " ×1</span>"
      + '<span class="sac-hybride-detail">gén. ' + (d.generation || 0) + " · " + d.nbPetales + " pétales</span>"
      + "</div>";
  }).join("");
}

function rafraichirSac() {
  const total = document.getElementById("sacTotal");
  if (total) total.textContent = totalGrainesSac();
  const panneau = document.getElementById("panneau-sac");
  if (!panneau || panneau.hidden) return;
  document.getElementById("sacListe").innerHTML = sacHtml();
  document.getElementById("sacHybrides").innerHTML = sacHybridesHtml();
  const nbHyb = grainesHybridesDisponibles().length;
  document.getElementById("sacResume").textContent = totalGrainesSac() + " classique(s) · " + nbHyb + " hybride(s)";
}

function ouvrirSac() {
  const panneau = document.getElementById("panneau-sac");
  const bouton = document.getElementById("boutonSac");
  if (!panneau || !bouton) return;
  panneau.hidden = false;
  rafraichirSac();
  // Sous le bouton, en restant dans la fenêtre.
  const rect = bouton.getBoundingClientRect();
  const largeur = Math.min(580, window.innerWidth - 24);
  let left = Math.min(rect.left, window.innerWidth - 12 - largeur);
  if (left < 12) left = 12;
  let top = rect.bottom + 6;
  if (top + panneau.offsetHeight > window.innerHeight - 12) {
    top = Math.max(12, rect.top - panneau.offsetHeight - 6);
  }
  panneau.style.left = left + "px";
  panneau.style.top = top + "px";
}

function fermerSac() {
  const panneau = document.getElementById("panneau-sac");
  if (panneau) panneau.hidden = true;
}

function graineEspece(tier) {
  return sacGraines[tier] ? sacGraines[tier].graines : 0;
}

function plantationsEnCoursDeGraine(graineId) {
  let n = 0;
  for (const f of fleurs) {
    if (f.etat === "plante" && f.graineId === graineId) n = n + 1;
  }
  return n;
}

// Offres pour un emplacement vide (0 à 9). Chaque offre porte son prix complet
// et, si une ressource manque, une raison lisible (l'interface la grise).
// Une espèce sans graine reste visible mais indisponible : plus d'achat en Verdance.
function offresReplantation(slot) {
  const f = fleurs[slot];
  if (!f || f.etat !== "vide" || slot >= reglages.length) return [];
  const offres = [];

  for (let tier = 1; tier <= reglages.length; tier++) {
    if (!especePossedee(tier)) continue;
    const def = definitionEspece(tier);
    if (!definitionPlantable(slot, def)) continue;
    const prixCompost = prixCompostReplantation(tier);
    const raisons = [];
    if (graineEspece(tier) < 1) raisons.push("Graine manquante");
    if (compost < prixCompost) raisons.push("Compost insuffisant");
    offres.push({
      type: "basique", tier: tier, nom: def.nom, definition: def,
      prixCompost: prixCompost, prixCompostMature: 0,
      actif: raisons.length === 0, raison: raisons.join(" · ")
    });
  }

  for (const graine of graines) {
    const d = graine && graine.definition;
    if (!d || graine.plantee === true || !definitionPlantable(slot, d)) continue;
    const prixCompostMature = prixCompostMatureGraineHybride(d.tier);
    const raisons = [];
    if (compostMature < prixCompostMature) raisons.push("Compost mature insuffisant");
    offres.push({
      type: "graine", graineId: graine.id, tier: d.tier, nom: d.nom, definition: d,
      prixCompost: 0, prixCompostMature: prixCompostMature,
      actif: raisons.length === 0, raison: raisons.join(" · ")
    });
  }
  return offres;
}

// Replante une espèce basique possédée : 1 graine de l'espèce + 50 × tier en
// compost, puis croissance remise à zéro (les pétales sont à racheter).
function planterBasique(slot, tier) {
  const f = fleurs[slot];
  if (!f || f.etat !== "vide" || slot >= reglages.length || !especePossedee(tier)) return false;
  const def = definitionEspece(tier);
  if (!definitionPlantable(slot, def)) return false;
  const prixCompost = prixCompostReplantation(tier);
  if (graineEspece(tier) < 1 || compost < prixCompost) return false;

  entreeSac(tier).graines = entreeSac(tier).graines - 1;
  compost = compost - prixCompost;
  affichercompost();
  const ok = planter(slot, def);
  if (!ok) {
    entreeSac(tier).graines = entreeSac(tier).graines + 1;
    compost = compost + prixCompost;
    affichercompost();
  } else {
    // Simple statistique : n'influence plus aucun prix.
    nbReplantations[tier] = (nbReplantations[tier] || 0) + 1;
  }
  rafraichirSac();
  return ok;
}

// Plante une graine hybride : la graine (usage unique) + 2 × tier en compost
// mature. La plante arrive avec tous ses pétales achetés, vitesse 0, cycle de la définition.
function planterGraine(slot, graineId) {
  const f = fleurs[slot];
  if (!f || f.etat !== "vide" || slot >= reglages.length) return false;
  let graine = null;
  for (const g of graines) {
    if (g && g.id === graineId) { graine = g; break; }
  }
  if (!graine || graine.plantee === true) return false;
  const d = graine.definition;
  if (!definitionPlantable(slot, d)) return false;
  const prixCompostMature = prixCompostMatureGraineHybride(d.tier);
  if (compostMature < prixCompostMature) return false;

  compostMature = compostMature - prixCompostMature;
  afficherBacs23();
  const ok = planter(slot, d, { cycle: d.cycle, graineId: graine.id });
  if (!ok) {
    compostMature = compostMature + prixCompostMature;
    afficherBacs23();
  } else {
    graine.plantee = true;
    rafraichirGraines();
  }
  if (slotReplantation !== null) rafraichirReplantation();
  return ok;
}

// ---------- Interface du sélecteur de replantation ----------
// Le panneau est statique dans le HTML ; seules ses lignes sont reconstruites
// sur événement (innerHTML), jamais créées après le démarrage.
let slotReplantation = null;

function ligneOffreReplantationHtml(offre) {
  const code = offre.type === "graine"
    ? "graine:" + offre.graineId
    : "basique:" + offre.tier;
  const details = offre.type === "basique"
    ? "tier " + offre.tier + " · " + offre.definition.nbPetales + " pétales à racheter · " + formaterDuree(offre.definition.dureeBase)
    : "tier " + offre.tier + " · génération " + (offre.definition.generation || 0)
      + " · " + offre.definition.nbPetales + " pétales (tous déjà achetés)";
  const prix = [];
  if (offre.type === "basique") {
    prix.push("1 graine " + ICONES.graine);
    prix.push(formaterNombre(offre.prixCompost) + " compost");
  } else {
    prix.push("1 graine hybride " + ICONES.graine);
    prix.push(formaterNombre(offre.prixCompostMature) + " compost mature");
  }
  return '<button type="button" class="replantation-offre' + (offre.actif ? "" : " indisponible") + '"'
    + ' data-offre="' + code + '"' + (offre.actif ? "" : " disabled") + ">"
    + '<span class="offre-nom">' + echapperHtml(offre.nom || "Hybride") + "</span>"
    + '<span class="offre-detail">' + echapperHtml(details) + "</span>"
    + '<span class="offre-prix">' + echapperHtml(prix.join(" · ")) + "</span>"
    + (offre.raison ? '<span class="offre-raison">' + echapperHtml(offre.raison) + "</span>" : "")
    + "</button>";
}

function offresReplantationHtml(offres) {
  const basiques = offres.filter(function (o) { return o.type === "basique"; });
  const grainesOffertes = offres.filter(function (o) { return o.type === "graine"; });
  let html = "";
  if (basiques.length > 0) {
    html = html + '<div class="replantation-groupe"><h4>Plantes basiques</h4>'
      + basiques.map(ligneOffreReplantationHtml).join("") + "</div>";
  }
  if (grainesOffertes.length > 0) {
    html = html + '<div class="replantation-groupe"><h4>Graines hybrides (usage unique)</h4>'
      + grainesOffertes.map(ligneOffreReplantationHtml).join("") + "</div>";
  }
  if (html === "") html = '<p class="replantation-vide">Aucune plante ni graine disponible.</p>';
  return html;
}

function rafraichirReplantation() {
  const panneau = document.getElementById("replantation");
  if (!panneau || slotReplantation === null) return;
  const f = fleurs[slotReplantation];
  if (!f || f.etat !== "vide") {
    fermerReplantation();
    return;
  }
  const titre = document.getElementById("replantationTitre");
  if (titre) titre.textContent = "Planter dans l'emplacement " + (slotReplantation + 1);
  const ressources = document.getElementById("replantationRessources");
  if (ressources) {
    ressources.textContent = "Compost : " + formaterNombre(compost)
      + " · Compost mature : " + formaterNombre(compostMature);
  }
  const zone = document.getElementById("replantationOffres");
  if (zone) zone.innerHTML = offresReplantationHtml(offresReplantation(slotReplantation));
}

function ouvrirReplantation(slot) {
  const f = fleurs[slot];
  const panneau = document.getElementById("replantation");
  if (!f || !panneau || f.etat !== "vide" || slot >= reglages.length) return false;
  slotReplantation = slot;
  rafraichirReplantation();
  panneau.hidden = false;
  return true;
}

function fermerReplantation() {
  const panneau = document.getElementById("replantation");
  if (panneau) panneau.hidden = true;
  slotReplantation = null;
}

function planterDepuisOffre(code) {
  if (slotReplantation === null) return false;
  const parties = String(code).split(":");
  const valeur = parseInt(parties[1], 10);
  let ok = false;
  if (parties[0] === "basique") ok = planterBasique(slotReplantation, valeur);
  else if (parties[0] === "graine") ok = planterGraine(slotReplantation, valeur);
  if (ok) fermerReplantation();
  else rafraichirReplantation();
  return ok;
}


// ============================================================
// BOUTONS D'ACHAT
// ============================================================

  //#region Repli
const boutonRepli = document.getElementById("boutonRepli");
const boutonRepliC = document.getElementById("boutonRepliC");
let jardinRepli = false;
boutonRepli.addEventListener("click", function () {
  if (jardinRepli === true) {
    jardin.style.display = "";
    document.querySelector(".explication-parterre").style.display = "";
    boutonRepli.textContent = "\u25BC";
    jardinRepli = false;
  } else {
    jardin.style.display = "none";
    document.querySelector(".explication-parterre").style.display = "none";
    boutonRepli.textContent = "\u25B6";
    jardinRepli = true;
  }
});
let compostRepli = false;
function appliquerRepliCompost() {
  // Replie tout le contenu du compost (infos, explication, cercles), pas seulement #Compost.
  const colonne = document.getElementById("colonne-compost");
  const cibles = colonne
    ? colonne.querySelectorAll(".ressources-compost, .explication-compost, #Compost")
    : [];
  cibles.forEach(function (el) { el.style.display = compostRepli ? "none" : ""; });
  boutonRepliC.textContent = compostRepli ? "\u25B6" : "\u25BC";
  if (compostRepli) {
    const panneau = document.getElementById("panneau-seuils");
    if (panneau) panneau.hidden = true;
    const bs = document.getElementById("boutonSeuils");
    if (bs) bs.setAttribute("aria-expanded", "false");
  }
  if (typeof planifierAjusterBarre === "function") planifierAjusterBarre();
}
boutonRepliC.addEventListener("click", function () {
  compostRepli = !compostRepli;
  appliquerRepliCompost();
});
//#endregion

  //#region Repli du laboratoire
const boutonRepliL = document.getElementById("boutonRepliL");
let laboRepli = false;
boutonRepliL.addEventListener("click", function () {
  laboRepli = !laboRepli;
  const colonne = document.getElementById("colonne-laboratoire");
  Array.from(colonne.children).forEach(function (el) {
    if (!el.classList.contains("emplacement-barre")) el.style.display = laboRepli ? "none" : "";
  });
  boutonRepliL.textContent = laboRepli ? "\u25B6" : "\u25BC";
  boutonRepliL.setAttribute("aria-expanded", laboRepli ? "false" : "true");
  if (typeof planifierAjusterBarre === "function") planifierAjusterBarre();
});
//#endregion

  //#region Achats du parterre
// Une seule logique d'achat, partagée par les clics, « Tout acheter (test) » et les
// automatisations. Chaque fonction revérifie elle-même toutes les conditions (état de la
// carte, Verdance suffisante) et renvoie vrai si l'achat a eu lieu. Elles ne recalculent
// pas les boutons : l'appelant s'en charge (mettreAJourBoutons).
function acheterFleur(f) {
  if (!boutonFleurAchetable(f) || verdance < f.prix) return false;
  verdance = verdance - f.prix;
  afficherVerdance();
  f.etat = "plante";
  f.dejaPlante = true;
  return true;
}

function acheterPetale(p) {
  const f = p.fleur;
  if (!p.existe || f.etat !== "plante" || p.achete || p.rang !== f.petalesAchetes
    || fleurComplete(f) || verdance < p.prix) return false;
  verdance = verdance - p.prix;
  afficherVerdance();
  p.achete = true;
  // Le pétale commence tout de suite sa coloration dans la couleur tirée.
  p.teinte = tirerTeinte(f);
  if (p.rempli) p.rempli.style.fill = p.teinte;
  f.petalesAchetes = f.petalesAchetes + 1;
  f.icones[f.petalesAchetes - 1].classList.add("plein");
  p.fond.setAttribute("class", "petale-fond achete");
  if (fleurComplete(f)) {
    f.gainBonus.classList.add("plein");
    f.gainBonus.textContent = "Gain ×" + bonusAffiche(f).toFixed(1);
  }
  return true;
}

function acheterVitesse(f) {
  if (f.etat !== "plante" || dureeActuelle(f) <= plancherDuree(f)) return false;
  const prix = prixVitesseFleur(f, f.niveauVitesse);
  if (verdance < prix) return false;
  verdance = verdance - prix;
  afficherVerdance();
  f.niveauVitesse = f.niveauVitesse + 1;
  return true;
}

// Combien de niveaux de vitesse encore utiles la Verdance actuelle permet d'acheter, et leur total.
function calculerAchatVitesseMax(f) {
  // Le résultat ne dépend que de ces valeurs : on le garde tant qu'elles ne changent pas
  // (évite de refaire la boucle de 100 itérations à chaque tour, par fleur).
  const cle = verdance + "|" + f.niveauVitesse + "|" + f.dureeBase + "|" + plancherDuree(f)
    + "|" + f.tier + "|" + (ageDe(f) === "semis");
  if (f.cacheAchatMax && f.cacheAchatMax.cle === cle) return f.cacheAchatMax.valeur;
  const valeur = calculerAchatVitesseMaxBrut(f);
  f.cacheAchatMax = { cle: cle, valeur: valeur };
  return valeur;
}
function calculerAchatVitesseMaxBrut(f) {
  let n = 0;
  let total = 0;
  // Durée courante mise à jour à chaque niveau : sinon, une fois le plancher
  // atteint, la comparaison resterait fausse et on achèterait 100 niveaux.
  let dureeCourante = dureeActuelle(f);
  while (true) {
    const prochain = f.niveauVitesse + n;
    const dureeApres = Math.max(plancherDuree(f), f.dureeBase * FACTEUR_VITESSE ** (prochain + 1));
    if (dureeApres >= dureeCourante) break;   // plus d'amélioration utile
    const prix = prixVitesseFleur(f, prochain);
    if (verdance < total + prix) break;       // plus abordable
    total += prix;
    n += 1;
    dureeCourante = dureeApres;
    if (n >= 100) break;
  }
  return { n: n, total: total };
}

function acheterVitesseMax(f) {
  if (f.etat !== "plante") return false;
  const achat = calculerAchatVitesseMax(f);
  if (achat.n <= 0) return false;
  verdance = verdance - achat.total;
  afficherVerdance();
  f.niveauVitesse = f.niveauVitesse + achat.n;
  return true;
}

function acheterCycle(f) {
  if (f.etat !== "plante" || f.completions < seuil(f.cycle)) return false;
  const prix = prixCycleFleur(f, f.cycle);
  if (verdance < prix) return false;
  verdance = verdance - prix;
  afficherVerdance();
  f.cycle = f.cycle + 1;
  cyclesFinis = cyclesFinis + (f.gainCycle ?? f.tier);
  affichageCyclesFinis.textContent = cyclesFinis;
  f.completions = 0;
  crediterFragments(f);
  mettreAJourGain();
  return true;
}

// Automatisations actives, appelées à chaque tour de jeu. Priorité quand la Verdance est
// limitée : fleur, pétales, vitesse, cycle. Les boutons ne sont recalculés qu'une fois,
// à la fin, et seulement si quelque chose a été acheté.
function appliquerAutomatisations() {
  let achat = false;
  if (autos.fleur.actif) {
    for (const f of fleurs) {
      if (acheterFleur(f)) achat = true;
    }
  }
  if (autos.petales.actif) {
    for (const p of petales) {
      if (acheterPetale(p)) achat = true;
    }
  }
  if (autos.vitesse.actif) {
    for (const f of fleurs) {
      if (acheterVitesseMax(f)) achat = true;
    }
  }
  if (autos.cycle.actif) {
    for (const f of fleurs) {
      if (acheterCycle(f)) achat = true;
    }
  }
  if (achat) {
    mettreAJourBoutons();
    rafraichirLaboratoire();   // une fleur complétée ou achetée change la liste d'hybridation
  }
  // Améliorations du compost : même logique que l'ancien « Achat max » (jamais de Verdance dépensée).
  if (autos.ameliorations.actif && compostDebloque()) {
    acheterMaxCompost();
  }
}
//#endregion

  //#region BoutonFleur
// Minuterie et écouteurs du panneau Sol : partagés par toutes les cartes (posés une seule fois).
let solTimer = null;
const panneauSol = document.getElementById("panneau-sol");
if (panneauSol) {
  panneauSol.addEventListener("mouseenter", function () {
    if (solTimer) { clearTimeout(solTimer); solTimer = null; }
  });
  panneauSol.addEventListener("mouseleave", function () {
    solTimer = setTimeout(fermerSol, 200);
  });
}
for (const f of fleurs) {
  if (f.bouton) {
    f.bouton.addEventListener("click", function () {
      if (acheterFleur(f)) {
        mettreAJourBoutons();
        rafraichirLaboratoire();
      }
    });
  }

  f.boutonSol.addEventListener("click", function () {
    // Tactile : pas de survol. Le clic ouvre le panneau (fermeture par × ou en survol).
    if (!compostDebloque()) return;
    if (fleurSolOuverte !== f) ouvrirSol(f);
  });
  f.boutonSol.addEventListener("mouseenter", function () {
    if (!compostDebloque()) return;
    if (solTimer) { clearTimeout(solTimer); solTimer = null; }
    ouvrirSol(f);
  });
  f.boutonSol.addEventListener("mouseleave", function () {
    solTimer = setTimeout(function () {
      // Ne ferme que si la souris n'est ni sur le bouton ni sur le panneau
      const panneau = document.getElementById("panneau-sol");
      if (panneau && panneau.matches(":hover")) return;
      fermerSol();
    }, 200);
  });
  f.boutonCycle.addEventListener("click", function () {
    if (acheterCycle(f)) mettreAJourBoutons();
  });

  f.boutonVitesse.addEventListener("click", function () {
    if (acheterVitesse(f)) mettreAJourBoutons();
  });
  f.boutonVitesseMax.addEventListener("click", function () {
    // Achète le max de niveaux encore utiles et abordables.
    if (acheterVitesseMax(f)) mettreAJourBoutons();
  });
}

for (const p of petales) {
  p.bouton.addEventListener("click", function () {
    if (acheterPetale(p)) {
      mettreAJourBoutons();
      if (fleurComplete(p.fleur)) rafraichirLaboratoire();   // la fleur devient hybridable
    }
  });
}

const boutonToutAcheter = document.getElementById("boutonToutAcheter");
boutonToutAcheter.addEventListener("click", function () {
  let liste = achatsPossibles();
  while (liste.length > 0) {
    liste[0].bouton.click();
    liste = achatsPossibles();
  }
})

// Boutons d'automatisation (cycle, pétales, vitesse, fleur) : le premier clic débloque en
// payant des Cycles Finis, ensuite la bascule ON/OFF est gratuite.
function rafraichirBoutonsAuto() {
  for (const a of AUTOMATISATIONS) {
    const bouton = document.getElementById(a.idBouton);
    if (!bouton) continue;
    const etat = autos[a.cle];
    let html;
    if (etat.actif) {
      html = a.nom + " : ON";
    } else if (etat.achete) {
      html = a.nom + " : OFF";
    } else {
      html = a.nom + " : OFF (" + a.cout + " <span class=\"icone-cycle\"></span>)";
    }
    if (bouton.innerHTML !== html) bouton.innerHTML = html;
    bouton.classList.toggle("actif", etat.actif);
  }
}
for (const a of AUTOMATISATIONS) {
  const bouton = document.getElementById(a.idBouton);
  if (!bouton) continue;
  bouton.addEventListener("click", function () {
    const etat = autos[a.cle];
    if (etat.actif) {
      etat.actif = false;
      rafraichirBoutonsAuto();
      sauvegarder();
      return;
    }
    // Première activation : coût en Cycles Finis (ils baissent donc le bonus de gain des cycles).
    if (!etat.achete) {
      if (cyclesFinis < a.cout) {
        alert("Il faut au moins " + a.cout + " cycles finis pour débloquer « " + a.nom + " ».");
        return;
      }
      cyclesFinis = cyclesFinis - a.cout;
      affichageCyclesFinis.textContent = cyclesFinis;
      mettreAJourGain();
      etat.achete = true;
    }
    etat.actif = true;
    rafraichirBoutonsAuto();
    sauvegarder();
  });
}
rafraichirBoutonsAuto();
  //#endregion

// Panneau « Seuils » : une entrée par monnaie de conversion.
// L'ordre suit PETALES_COULEURS ; les blancs passent en premier.
const SEUILS_CHAMPS = [
  { cle: "blancs",      id: "seuil-blancs" },
  { cle: "rosePale",    id: "seuil-rosePale" },
  { cle: "rose",        id: "seuil-rose" },
  { cle: "mauveRose",   id: "seuil-mauveRose" },
  { cle: "violetMoyen", id: "seuil-violetMoyen" },
  { cle: "violet",      id: "seuil-violet" },
  { cle: "bleu",        id: "seuil-bleu" }
];

// Recopie les seuils dans les champs du panneau (sans casser une saisie en cours).
function rafraichirPanneauSeuils() {
  for (const champ of SEUILS_CHAMPS) {
    const el = document.getElementById(champ.id);
    if (!el) continue;
    const valeur = String(seuilsPetales[champ.cle]);
    if (el.value !== valeur) el.value = valeur;
  }
}

// Normalise une saisie : nombre entier >= 0, sinon 0.
function lireSeuil(el) {
  const valeur = Math.floor(Number(el.value));
  return Number.isFinite(valeur) && valeur >= 0 ? valeur : 0;
}

const boutonSeuils = document.getElementById("boutonSeuils");
const panneauSeuils = document.getElementById("panneau-seuils");
if (boutonSeuils && panneauSeuils) {
  // Même comportement que Âges et Sac : survol (ou clic au tactile), placé sous le bouton.
  let seuilsTimer = null;
  const annulerSeuils = function () { if (seuilsTimer) { clearTimeout(seuilsTimer); seuilsTimer = null; } };
  const fermerSeuils = function () {
    panneauSeuils.hidden = true;
    boutonSeuils.setAttribute("aria-expanded", "false");
  };
  const ouvrirSeuils = function () {
    panneauSeuils.hidden = false;
    boutonSeuils.setAttribute("aria-expanded", "true");
    const rect = boutonSeuils.getBoundingClientRect();
    const largeur = Math.min(238, window.innerWidth - 24);
    let left = Math.min(rect.left, window.innerWidth - 12 - largeur);
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + panneauSeuils.offsetHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - panneauSeuils.offsetHeight - 6);
    }
    panneauSeuils.style.left = left + "px";
    panneauSeuils.style.top = top + "px";
  };
  const planifierSeuils = function () {
    annulerSeuils();
    seuilsTimer = setTimeout(function () {
      if (panneauSeuils.matches(":hover") || boutonSeuils.matches(":hover")) return;
      if (panneauSeuils.contains(document.activeElement)) return;   // saisie en cours
      fermerSeuils();
    }, 200);
  };
  boutonSeuils.addEventListener("mouseenter", function () { annulerSeuils(); ouvrirSeuils(); });
  boutonSeuils.addEventListener("mouseleave", planifierSeuils);
  boutonSeuils.addEventListener("click", function () {
    if (panneauSeuils.hidden) ouvrirSeuils(); else fermerSeuils();
  });
  panneauSeuils.addEventListener("mouseenter", annulerSeuils);
  panneauSeuils.addEventListener("mouseleave", planifierSeuils);
  window.addEventListener("scroll", fermerSeuils, { passive: true });
  for (const champ of SEUILS_CHAMPS) {
    const el = document.getElementById(champ.id);
    if (!el) continue;
    el.addEventListener("input", function () {
      seuilsPetales[champ.cle] = lireSeuil(el);
    });
    el.addEventListener("change", function () {
      // On réécrit la valeur propre une fois la saisie terminée (vide, négatif, décimal).
      seuilsPetales[champ.cle] = lireSeuil(el);
      el.value = String(seuilsPetales[champ.cle]);
    });
  }
}


//#region Commandes du compost : lancement manuel, auto-conversion, ferments par cercle
function poser(el, propriete, valeur) {
  if (el && el[propriete] !== valeur) el[propriete] = valeur;
}

// Texte de l'effet d'un ferment selon le cercle où il est placé.
function texteEffetFerment(cle, id) {
  const f = FERMENTS[id];
  if (!f) return "";
  const pct = Math.round(f.force * 100) + " %";
  const enTemps = cle === "bac1" || cle === "bac1b";
  if (f.type === "vitesse") {
    return enTemps ? "⏱ durée −" + pct : "⏱ progression +" + pct;
  }
  const produit = cle === "bac2" ? "mature" : cle === "bac3" ? "fertile" : "compost";
  return "▲ " + produit + " +" + pct;
}

const NOMS_CERCLES = { bac1: "compost", bac1b: "compost (2ᵉ conversion)", bac2: "compost mature", bac3: "compost fertile" };

function rafraichirSlotsFerments() {
  for (const cle of CERCLES) {
    const slot = document.getElementById("slot" + (cle === "bac1" ? "Bac1" : cle === "bac1b" ? "Bac1b" : cle === "bac2" ? "Bac2" : "Bac3"));
    const effet = document.getElementById("effet" + (cle === "bac1" ? "Bac1" : cle === "bac1b" ? "Bac1b" : cle === "bac2" ? "Bac2" : "Bac3"));
    if (!slot) continue;
    const id = fermentsChoisis[cle];
    const couleur = PETALES_COULEURS.find(function (c) { return c.id === id; });
    const manque = !!id && fermentsPayes[cle] === ""
      && petalesCouleurs[id] < (seuilsPetales[id] || 0) + FERMENT_COUT;
    const classe = "slot-ferment" + (id ? " rempli" : " vide")
      + (fermentsPayes[cle] !== "" ? " actif" : "") + (manque ? " manque" : "");
    if (slot.className !== classe) slot.className = classe;
    const fond = couleur ? couleur.hex : "";
    if (slot.style.background !== fond && slot.dataset.fond !== fond) {
      slot.dataset.fond = fond;
      slot.style.background = fond;
    }
    poser(slot, "textContent", id ? "✾" : "+");
    const titre = id
      ? "Ferment : " + couleur.nom + " — " + texteEffetFerment(cle, id) + ". " + formaterNombre(petalesCouleurs[id])
        + " en stock, −" + FERMENT_COUT + " par cycle. Cliquer pour changer."
      : "Ajouter un ferment au cercle « " + NOMS_CERCLES[cle] + " » (5 pétales colorés par cycle).";
    poser(slot, "title", titre);
    if (effet) {
      poser(effet, "textContent", id ? texteEffetFerment(cle, id) + (manque ? " (stock !)" : "") : "");
      effet.classList.toggle("manque", manque);
    }
  }
}

function rafraichirCommandesCompost() {
  const ok = compostDebloque();
  const bouton = document.getElementById("boutonConversion");
  if (!bouton) return;
  poser(bouton, "hidden", !ok);
  // Le bouton et le panneau « Seuils » ne servent à rien tant que le compost
  // est verrouillé : on les cache et on referme le panneau.
  const boutonSeuils = document.getElementById("boutonSeuils");
  const panneauSeuils = document.getElementById("panneau-seuils");
  poser(boutonSeuils, "hidden", !ok);
  poser(document.getElementById("boutonAutoAmeliorations"), "hidden", !ok);
  if (!ok && panneauSeuils) {
    panneauSeuils.hidden = true;
    if (boutonSeuils) boutonSeuils.setAttribute("aria-expanded", "false");
  }
  if (!ok) {
    afficherSecondeConversion();
    rafraichirSlotsFerments();
    return;
  }

  const debloque = autoCompostDebloque;
  const actif = debloque && autoCompostActif;
  bouton.classList.toggle("debloque", debloque);
  bouton.classList.toggle("actif", actif);
  poser(bouton, "textContent", !debloque
    ? "▶ Lancer"
    : (actif ? "Conversion : ON" : "Conversion : OFF"));

  const libre = voies.some(function (v, i) { return voieActive(i) && !v.encours; });
  // Avant le premier lancement, le bouton ne s'active que s'il y a de quoi
  // payer une conversion. Ensuite, l'interrupteur reste toujours cliquable.
  poser(bouton, "disabled", !debloque && !(libre && petalesBlancs >= COUT_CONVERSION));

  let titre;
  if (!debloque) {
    titre = !libre
      ? "Toutes les conversions sont déjà en cours."
      : (petalesBlancs < COUT_CONVERSION
        ? "Il faut " + COUT_CONVERSION + " pétales blancs."
        : "Première conversion : elle ignore le seuil de pétales blancs.");
  } else if (actif) {
    titre = "Conversion ON : les voies se relancent automatiquement dans la limite des seuils.";
  } else {
    titre = "Conversion OFF : tout est en pause, y compris hors ligne.";
  }
  poser(bouton, "title", titre);

  afficherSecondeConversion();
  rafraichirSlotsFerments();
}

// Menu de choix du ferment (un seul, déplacé près du cercle cliqué).
let cercleMenuFerment = null;
function fermerMenuFerment() {
  const menu = document.getElementById("menuFerment");
  if (menu) menu.hidden = true;
  cercleMenuFerment = null;
}
function ouvrirMenuFerment(cle, slot) {
  const menu = document.getElementById("menuFerment");
  const conteneur = document.getElementById("Compost");
  if (!menu || !conteneur) return;
  cercleMenuFerment = cle;
  const dispo = couleursDebloquees();
  const pastilles = document.getElementById("menuFermentPastilles");
  pastilles.innerHTML = "";
  const aucun = document.createElement("button");
  aucun.type = "button";
  aucun.className = "mf-pastille aucun" + (fermentsChoisis[cle] === "" ? " choisi" : "");
  aucun.textContent = "∅";
  aucun.dataset.id = "";
  pastilles.appendChild(aucun);
  for (const c of PETALES_COULEURS) {
    const b = document.createElement("button");
    b.type = "button";
    const debloquee = dispo.indexOf(c) >= 0;
    b.className = "mf-pastille" + (fermentsChoisis[cle] === c.id ? " choisi" : "") + (debloquee ? "" : " bloquee");
    b.style.background = c.hex;
    b.dataset.id = c.id;
    b.disabled = !debloquee;
    pastilles.appendChild(b);
  }
  poser(document.getElementById("menuFermentInfo"), "textContent",
    "Ferment du cercle « " + NOMS_CERCLES[cle] + " ». Survolez une couleur.");
  menu.hidden = false;
  const rs = slot.getBoundingClientRect();
  const rc = conteneur.getBoundingClientRect();
  const largeur = menu.offsetWidth;
  let gauche = rs.left - rc.left + rs.width / 2 - largeur / 2;
  gauche = Math.max(0, Math.min(gauche, rc.width - largeur));
  menu.style.left = gauche + "px";
  menu.style.top = (rs.bottom - rc.top + 6) + "px";
}

{
  const bConversion = document.getElementById("boutonConversion");
  if (bConversion) bConversion.addEventListener("click", function () {
    if (!compostDebloque()) return;
    if (!autoCompostDebloque) {
      // Premier lancement : ignore le seuil et passe l'interrupteur sur ON.
      lancerConversionManuelle();
    } else {
      autoCompostActif = !autoCompostActif;
      if (autoCompostActif && lancerVoies(false) > 0) {
        apresLancementConversion();
      }
      afficherBarreBac1();
      rafraichirCommandesCompost();
    }
    sauvegarder();
  });
  const bSeconde = document.getElementById("boutonSeconde");
  if (bSeconde) bSeconde.addEventListener("click", function () {
    acheterNoeudArbre("c8");
    rafraichirCommandesCompost();
    sauvegarder();
  });
  const cles = { slotBac1: "bac1", slotBac1b: "bac1b", slotBac2: "bac2", slotBac3: "bac3" };
  for (const idSlot of Object.keys(cles)) {
    const slot = document.getElementById(idSlot);
    if (!slot) continue;
    slot.addEventListener("click", function (e) {
      e.stopPropagation();
      const cle = cles[idSlot];
      if (cercleMenuFerment === cle) { fermerMenuFerment(); return; }
      if (couleursDebloquees().length === 0) return;
      ouvrirMenuFerment(cle, slot);
    });
  }
  const pastilles = document.getElementById("menuFermentPastilles");
  if (pastilles) {
    pastilles.addEventListener("click", function (e) {
      const b = e.target.closest("button");
      if (!b || b.disabled || cercleMenuFerment === null) return;
      fermentsChoisis[cercleMenuFerment] = b.dataset.id;
      fermerMenuFerment();
      rafraichirSlotsFerments();
      sauvegarder();
    });
    pastilles.addEventListener("mouseover", function (e) {
      const b = e.target.closest("button");
      if (!b || cercleMenuFerment === null) return;
      const info = document.getElementById("menuFermentInfo");
      const id = b.dataset.id;
      if (!id) { poser(info, "textContent", "Aucun ferment."); return; }
      const c = PETALES_COULEURS.find(function (x) { return x.id === id; });
      poser(info, "textContent", b.disabled
        ? c.nom + " : couleur pas encore débloquée (« Enrichir le sol »)."
        : c.nom + " — " + texteEffetFerment(cercleMenuFerment, id) + " · " + formaterNombre(petalesCouleurs[id])
          + " en stock (−" + FERMENT_COUT + " par cycle)");
    });
  }
  document.addEventListener("click", function (e) {
    const menu = document.getElementById("menuFerment");
    if (menu && !menu.hidden && !menu.contains(e.target)) fermerMenuFerment();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") fermerMenuFerment();
  });
}
//#endregion
// ============================================================
// BOUCLE DU JEU (10 tours par seconde)
// ============================================================
// On n'écrit dans la page que ce qui change vraiment : le dessin à chaque tour,
// les boutons et leurs textes seulement quand la verdance ou un achat les modifie (etatSale).
function dessinerFleur(f, dureeF) {
  const r = (RAYON_CENTRE * Math.min(f.progression, 100) / 100).toFixed(2);
  if (f.dernierRayon !== r) {
    f.remplissageCentre.setAttribute("r", r);
    f.dernierRayon = r;
  }
  const texteTemps = formaterTempsCourt(Math.max(0, (100 - f.progression) * dureeF * 0.01));
  if (f.dernierTexte !== texteTemps) {
    f.texteCentre.textContent = texteTemps;
    f.dernierTexte = texteTemps;
  }
}

function dessinerPetale(p) {
  // Le pétale se colorie de sa base vers sa pointe
  const h = (LONG_PETALE * Math.min(p.progression, 100) / 100).toFixed(2);
  if (p.dernierH !== h) {
    p.rectClip.setAttribute("y", (BASE_PETALE - h).toFixed(2));
    p.rectClip.setAttribute("height", h);
    p.dernierH = h;
  }
}

// ------------------------------------------------------------
// PROGRESSION HORS LIGNE
// ------------------------------------------------------------
// On rejoue uniquement la production (fleurs, pétales, compost), sans achats
// ni auto-cycle. 50 % du temps d'absence, plafonné à 1 h.
function avancerProductionHorsLigne(dtSecondes) {
  // Le multiplicateur doit refléter l'état actuel (pétales, cycles, compost)
  // avant de créditer de la verdance : au premier pas, il n'avait pas encore
  // été calculé depuis le chargement de la sauvegarde.
  mettreAJourGain();
  for (const f of fleurs) {
    if (!f.achete) continue;
    const dureeF = dureeActuelle(f);
    f.progression = f.progression + dtSecondes * 100 / dureeF;
    const nb = Math.floor(f.progression / 100);
    if (nb >= 1) {
      verdance = verdance + gainDeBase * multiplicateur * bonusFleur(f) * nb;
      f.progression = f.progression - 100 * nb;
      f.completions = Math.min(seuil(f.cycle), f.completions + nb);
    }
  }

  for (const p of petales) {
    if (!p.achete) continue;
    const dureeP = dureeActuelle(p.fleur) * FRACTION_PETALE;
    p.progression = p.progression + dtSecondes * 100 / dureeP;
    const nb = Math.floor(p.progression / 100);
    if (nb >= 1) {
      for (let k = 0; k < nb; k++) {
        crediterTeinte(p.teinte);
        p.teinte = tirerTeinte(p.fleur);
      }
      p.progression = p.progression - 100 * nb;
    }
  }
  mettreAJourGain();
}

function avancerCompostHorsLigne(dtSecondes) {
  // En OFF, rien ne tourne hors ligne : les progressions restent gelées.
  if (!compostDebloque() || !autoCompostActif) return;
  let temps = dtSecondes;
  while (temps > 0) {
    // Hors ligne, seule l'auto-conversion relance des conversions.
    if (autoCompostActif) lancerVoies(false);
    let prochain = Infinity;
    for (let i = 0; i < voies.length; i++) {
      if (voies[i].encours) prochain = Math.min(prochain, (100 - voies[i].progression) * dureeVoie(i) / 100);
    }
    if (prochain === Infinity) break;   // plus rien ne tourne
    const pas = Math.min(temps, prochain);
    for (let i = 0; i < voies.length; i++) {
      if (voies[i].encours) voies[i].progression = voies[i].progression + pas * 100 / dureeVoie(i);
    }
    temps = temps - pas;
    for (let i = 0; i < voies.length; i++) {
      if (voies[i].encours && voies[i].progression >= 100 - 1e-7) terminerVoie(i);
    }
  }
}

function appliquerProgressionHorsLigne() {
  if (!derniereSauvegarde) return;
  const absence = Math.max(0, (Date.now() - derniereSauvegarde) / 1000);
  const credit = Math.min(absence, DUREE_HORS_LIGNE_MAX) * RENDEMENT_HORS_LIGNE;
  derniereSauvegarde = Date.now();
  if (credit < 1) return;

  const avant = {
    verdance: verdance,
    blancs: petalesBlancs,
    compost: compost,
    mauve: petalesCouleurs.mauveRose
  };

  // Pas de 10 s : assez fin pour que le multiplicateur suive les pétales,
  // assez gros pour simuler 30 min de crédit sans ralentir le chargement.
  let reste = credit;
  while (reste > 0) {
    const pas = Math.min(reste, 10);
    avancerProductionHorsLigne(pas);
    avancerCompostHorsLigne(pas);
    reste = reste - pas;
  }

  mettreAJourGain();
  afficherVerdance();
  affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
  afficherPetalesCouleurs();
  affichercompost();
  afficherBacs23();
  afficherBarreBac1();
  rafraichirDeblocages();

  const resume = document.getElementById("resumeHorsLigne");
  if (resume) {
    const gains = [];
    const gainVerdance = verdance - avant.verdance;
    const gainBlancs = petalesBlancs - avant.blancs;
    const gainCompost = compost - avant.compost;
    const gainMauve = petalesCouleurs.mauveRose - avant.mauve;
    if (gainVerdance > 0) gains.push("+" + formaterNombre(gainVerdance) + " " + ICONES.verdance);
    if (gainBlancs > 0) gains.push("+" + formaterNombre(gainBlancs) + " " + ICONES.petale);
    if (gainCompost > 0) gains.push("+" + formaterCompost(gainCompost) + " " + ICONES.compost);
    if (gainMauve > 0) gains.push("+" + gainMauve + " mauve" + (gainMauve > 1 ? "s" : ""));
    resume.textContent = "🌙 Absence de " + formaterTemps(absence)
      + " : " + formaterTemps(credit) + " créditées (50 %, plafond 1 h)"
      + (gains.length ? " → " + gains.join(", ") : "");
    resume.hidden = false;
    setTimeout(function () { resume.hidden = true; }, 30000);
  }

  // On enregistre tout de suite le nouvel horodatage : sinon, fermer l'onglet
  // avant la sauvegarde automatique (10 s) re-créditerait la même absence.
  sauvegarder();
}

function tourDeJeu() {
  const dt = vitesseTemps;

  // Hybridation : le temps restant suit le même pas que le reste du jeu
  // (mode test ×100 compris). Hors ligne, rien n'avance.
  if (hybridationEnCours) {
    hybridationEnCours.tempsRestant = hybridationEnCours.tempsRestant - dt / 10;   // tour = 0,1 s de jeu
    if (hybridationEnCours.tempsRestant <= 0) {
      terminerHybridation();
    } else {
      rafraichirBarreHybridation();
    }
  }

  for (const f of fleurs) {
    if (!f.achete) {
      continue;
    }
    const dureeF = dureeActuelle(f);
    f.progression = f.progression + dt * 100 / (dureeF * 10);
    // En mode test, une fleur peut se terminer plusieurs fois dans le même tour
    const nb = Math.floor(f.progression / 100);
    if (nb >= 1) {
      verdance = verdance + gainDeBase * multiplicateur * bonusFleur(f) * nb;
      f.progression = f.progression - 100 * nb;
      f.completions = Math.min(seuil(f.cycle), f.completions + nb);
      afficherVerdance();
    }
    dessinerFleur(f, dureeF);
  }

  let petalesTermines = false;
  for (const p of petales) {
    if (!p.achete) {
      continue;
    }
    const dureeP = dureeActuelle(p.fleur) * FRACTION_PETALE;
    p.progression = p.progression + dt * 100 / (dureeP * 10);
    const nb = Math.floor(p.progression / 100);
    if (nb >= 1) {
      // La coloration s'achève : on crédite la couleur qui vient d'être
      // remplie, puis on tire celle du remplissage suivant.
      for (let k = 0; k < nb; k++) {
        crediterTeinte(p.teinte);
        p.teinte = tirerTeinte(p.fleur);
        if (p.rempli) p.rempli.style.fill = p.teinte;
      }
      p.progression = p.progression - 100 * nb;
      petalesTermines = true;
    }
    dessinerPetale(p);
  }
  if (petalesTermines) {
    affichagePetalesBlancs.textContent = formaterNombre(petalesBlancs);
    afficherPetalesCouleurs();
    mettreAJourGain();
    rafraichirDeblocages();
  }

  // Automatisations du parterre (fleur, pétales, vitesse, cycle) : voir appliquerAutomatisations().
  appliquerAutomatisations();

  demarrerBac1();
  avancerBac1();
  rafraichirCommandesCompost();
  // Recalcul des boutons : immédiat après tout clic (les gestionnaires l'appellent eux-mêmes),
  // et au plus 4 fois par seconde pour les changements dus au seul écoulement du temps.
  if (etatSale && performance.now() - dernierRecalculBoutons >= DELAI_RECALCUL_BOUTONS) {
    mettreAJourBoutons();
  }
  if (fleurSolOuverte) {
    rafraichirPanneauSol();
  }
}
setInterval(tourDeJeu, 100);

//#region Sauvegarde
setInterval(function()  {
  sauvegarder();
}, 10000);
function afficherTemps() {
  document.getElementById("tempsJeu").textContent = "⏳ " + formaterTemps(tempsJeu);
}

setInterval(function () {
  // En mode test, le temps de jeu s'écoule aussi ×100.
  tempsJeu = tempsJeu + vitesseTemps;
  afficherTemps();
}, 1000);

document.getElementById("boutonSauvegarder").addEventListener("click", function () {
  sauvegarder();
  const bouton = document.getElementById("boutonSauvegarder");
  bouton.textContent = "✔ Sauvegardé";
  setTimeout(function () {
    bouton.textContent = "💾 Sauvegarder";
  }, 1000);
});

const boutonTest = document.getElementById("boutonTest");
boutonTest.addEventListener("click", function () {
  const activer = (vitesseTemps === 1);
  vitesseTemps = activer ? MULTIPLICATEUR_TEST : 1;
  boutonTest.classList.toggle("actif", activer);
  boutonTest.textContent = activer ? "⚡ Test ×" + MULTIPLICATEUR_TEST + " (actif)" : "⚡ Test ×" + MULTIPLICATEUR_TEST;
});

document.getElementById("boutonEffacer").addEventListener("click", function () {
  if (confirm("Effacer la sauvegarde et recommencer à zéro ?")) {
    localStorage.removeItem(CLE_SAUVEGARDE);
    location.reload();
  }
});
//#endregion

// ============================================================
// DÉMARRAGE
// ============================================================
charger();
appliquerProgressionHorsLigne();
rafraichirBoutonsAuto();
construirePanneauSol();
document.getElementById("panneauSolFermer").addEventListener("click", fermerSol);
// Frise des âges : dessins et bonus, construits une seule fois au démarrage.
{
  const frise = document.getElementById("agesFrise");
  CLES_AGES.forEach(function (cle, idx) {
    if (idx > 0) {
      const fleche = document.createElement("span");
      fleche.className = "age-fleche";
      fleche.textContent = "▶";
      frise.appendChild(fleche);
    }
    const etape = document.createElement("div");
    etape.className = "age-etape";
    etape.id = "age-etape-" + cle;
    const nom = document.createElement("span");
    nom.className = "age-nom";
    nom.textContent = NOMS_AGES[cle];
    const cycles = document.createElement("span");
    cycles.className = "age-cycles";
    cycles.textContent = INFOS_AGES[cle].cycles;
    const dessin = creerSVG("svg", { viewBox: "0 0 200 200", "class": "dessin age-" + cle });
    dessin.style.width = "96px";
    dessin.style.height = "96px";
    const decor = fabriquerDecorAge("frise-" + cle);
    dessin.appendChild(decor.arriere);
    // Seuls les décors de l'âge sont dessinés : les pétales sont déjà ceux de la carte.
    dessin.appendChild(decor.avant);
    dessin.appendChild(decor.dessus);
    const bonus = document.createElement("div");
    bonus.className = "age-bonus";
    bonus.textContent = INFOS_AGES[cle].bonus;
    etape.appendChild(nom);
    etape.appendChild(cycles);
    etape.appendChild(dessin);
    etape.appendChild(bonus);
    frise.appendChild(etape);
  });

  const boutonAges = document.getElementById("boutonAges");
  const panneauAges = document.getElementById("panneau-ages");
  let agesTimer = null;
  const rafraichirAges = function () {
    const n = { semis: 0, jeune: 0, adulte: 0, venerable: 0 };
    for (const f of fleurs) if (f.etat === "plante") n[ageDe(f)] = n[ageDe(f)] + 1;
    CLES_AGES.forEach(function (cle) {
      document.getElementById("age-etape-" + cle).classList.toggle("present", n[cle] > 0);
    });
  };
  const ouvrirAges = function () {
    panneauAges.hidden = false;
    rafraichirAges();
    const rect = boutonAges.getBoundingClientRect();
    const largeur = Math.min(640, window.innerWidth - 24);
    let left = Math.min(rect.left, window.innerWidth - 12 - largeur);
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + panneauAges.offsetHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - panneauAges.offsetHeight - 6);
    }
    panneauAges.style.left = left + "px";
    panneauAges.style.top = top + "px";
  };
  const annulerAges = function () { if (agesTimer) { clearTimeout(agesTimer); agesTimer = null; } };
  const planifierAges = function () {
    annulerAges();
    agesTimer = setTimeout(function () {
      if (panneauAges.matches(":hover") || boutonAges.matches(":hover")) return;
      panneauAges.hidden = true;
    }, 200);
  };
  boutonAges.addEventListener("mouseenter", function () { annulerAges(); fermerSac(); ouvrirAges(); });
  boutonAges.addEventListener("mouseleave", planifierAges);
  boutonAges.addEventListener("click", function () {
    if (panneauAges.hidden) ouvrirAges(); else panneauAges.hidden = true;
  });
  panneauAges.addEventListener("mouseenter", annulerAges);
  panneauAges.addEventListener("mouseleave", planifierAges);
  window.addEventListener("scroll", function () { panneauAges.hidden = true; }, { passive: true });
}

// Sac de graines : s'ouvre au survol du bouton (ou au clic, pour le tactile), reste ouvert sur le panneau.
{
  const boutonSac = document.getElementById("boutonSac");
  const panneauSac = document.getElementById("panneau-sac");
  let sacTimer = null;
  const annulerFermeture = function () { if (sacTimer) { clearTimeout(sacTimer); sacTimer = null; } };
  const planifierFermeture = function () {
    annulerFermeture();
    sacTimer = setTimeout(function () {
      if (panneauSac.matches(":hover") || boutonSac.matches(":hover")) return;
      fermerSac();
    }, 200);
  };
  boutonSac.addEventListener("mouseenter", function () { annulerFermeture(); document.getElementById("panneau-ages").hidden = true; ouvrirSac(); });
  boutonSac.addEventListener("mouseleave", planifierFermeture);
  boutonSac.addEventListener("click", function () {
    if (panneauSac.hidden) ouvrirSac(); else fermerSac();
  });
  panneauSac.addEventListener("mouseenter", annulerFermeture);
  panneauSac.addEventListener("mouseleave", planifierFermeture);
  window.addEventListener("scroll", fermerSac, { passive: true });
}
// Sélecteur de replantation : panneau statique, écouteurs posés une seule fois.
document.getElementById("replantationFermer").addEventListener("click", fermerReplantation);
document.getElementById("replantationOffres").addEventListener("click", function (evenement) {
  const bouton = evenement.target && evenement.target.closest
    ? evenement.target.closest("[data-offre]")
    : null;
  if (!bouton || bouton.disabled) return;
  planterDepuisOffre(bouton.getAttribute("data-offre"));
});
// Améliorations du laboratoire : liste statique, un seul écouteur délégué.
document.getElementById("listeAmeliorations").addEventListener("click", function (evenement) {
  const bouton = evenement.target && evenement.target.closest
    ? evenement.target.closest("[data-amelioration]")
    : null;
  if (!bouton || bouton.disabled) return;
  acheterAmelioration(bouton.getAttribute("data-amelioration"));
});
// Fleurs spéciales : même délégation, sur la liste statique.
document.getElementById("listeSpeciales").addEventListener("click", function (evenement) {
  const bouton = evenement.target && evenement.target.closest
    ? evenement.target.closest("[data-special]")
    : null;
  if (!bouton || bouton.disabled) return;
  acheterFleurSpeciale(parseInt(bouton.getAttribute("data-special"), 10));
});
rafraichirAffichage ();
mettreAJourBoutons();
mettreAJourGain();
afficherRendementsBacs();
afficherSecondeConversion();
rafraichirArbreCompost();
window.addEventListener('resize', rafraichirArbreCompost);

// Interface d'hybridation : les 20 boutons A/B sont créés une seule fois ici,
// puis un unique écouteur délégué gère tous les clics.
creerBoutonsHybridation();
const zoneHybridationUI = document.getElementById("hybridation");
if (zoneHybridationUI) {
  zoneHybridationUI.addEventListener("click", function (evenement) {
    const cible = evenement.target;
    const bouton = cible && cible.closest ? cible.closest("[data-hyb-slot]") : null;
    if (!bouton || bouton.disabled) return;
    const cote = bouton.getAttribute("data-hyb-cote");
    const slot = parseInt(bouton.getAttribute("data-hyb-slot"), 10);
    if ((cote === "A" || cote === "B") && Number.isInteger(slot)) {
      cliquerFleurHybridation(cote, slot);
    }
  });
}
const boutonHybriderUI = document.getElementById("boutonHybrider");
if (boutonHybriderUI) boutonHybriderUI.addEventListener("click", validerHybridationUI);
for (const c of NOMS_CHOIX_HYBRIDATION) {
  const chk = document.getElementById("choix-" + c.id);
  if (chk) chk.addEventListener("change", rafraichirChoixDepuisSelection);
}
rafraichirLaboratoire();


document.addEventListener("DOMContentLoaded", function(){ var btn=document.getElementById("boutonTestUnlock"); if(btn) btn.addEventListener("click", testDeverrouillerTout); });
