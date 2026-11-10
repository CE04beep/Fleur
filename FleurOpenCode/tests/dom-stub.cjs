// Stub DOM minimal pour exécuter FleurJ*.html dans Node (vm).
// Il ne cherche pas à simuler le rendu : seulement les API utilisées par le jeu.

class ClassList {
  constructor(owner) {
    this._owner = owner || null;
    this._set = new Set();
  }
  // Le code du jeu alterne className = "..." et classList.toggle(...) :
  // on garde les deux vues synchronisées.
  _sync() {
    if (this._owner) this._owner._className = Array.from(this._set).join(" ");
  }
  add(...noms) {
    for (const n of noms) this._set.add(n);
    this._sync();
  }
  remove(...noms) {
    for (const n of noms) this._set.delete(n);
    this._sync();
  }
  contains(nom) {
    return this._set.has(nom);
  }
  toggle(nom, force) {
    if (force === undefined) {
      if (this._set.has(nom)) this._set.delete(nom);
      else this._set.add(nom);
      this._sync();
      return this._set.has(nom);
    }
    if (force) this._set.add(nom);
    else this._set.delete(nom);
    this._sync();
    return this._set.has(nom);
  }
}

class Element {
  constructor(tagName, id) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.id = id || "";
    // 1 = élément, 3 = nœud texte (comme le DOM réel).
    this.nodeType = 1;
    this.nodeValue = "";
    this._className = "";
    this.classList = new ClassList(this);
    this.className = "";
    this.dataset = {};
    this.style = { setProperty(nom, valeur) { this[nom] = valeur; } };
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.title = "";
    this.height = 0;
    this.width = 0;
    this.offsetHeight = 0;
    this.offsetWidth = 0;
    this._listeners = {};
    this._clicked = 0;
  }
  get className() {
    return this._className;
  }
  set className(valeur) {
    this._className = String(valeur || "");
    this.classList._set = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  get firstChild() {
    return this.children.length > 0 ? this.children[0] : null;
  }
  appendChild(enfant) {
    this.children.push(enfant);
    if (enfant && typeof enfant === "object") enfant.parentNode = this;
    return enfant;
  }
  // Insère un nœud avant une référence (null/undefined = ajout à la fin).
  // Utilisé par poserTexteElement pour poser un texte devant les icônes.
  insertBefore(enfant, reference) {
    if (!reference) return this.appendChild(enfant);
    const i = this.children.indexOf(reference);
    if (i < 0) return this.appendChild(enfant);
    this.children.splice(i, 0, enfant);
    if (enfant && typeof enfant === "object") enfant.parentNode = this;
    return enfant;
  }
  removeChild(enfant) {
    const i = this.children.indexOf(enfant);
    if (i >= 0) this.children.splice(i, 1);
    return enfant;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  setAttribute(nom, valeur) {
    this.attributes[nom] = String(valeur);
    if (nom === "class") this.className = String(valeur);
    if (nom === "id") this.id = String(valeur);
  }
  getAttribute(nom) {
    if (nom === "class") return this.className;
    if (nom === "id") return this.id;
    return this.attributes[nom] === undefined ? null : this.attributes[nom];
  }
  hasAttribute(nom) {
    return Object.prototype.hasOwnProperty.call(this.attributes, nom);
  }
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  removeEventListener(type, fn) {
    const liste = this._listeners[type] || [];
    const i = liste.indexOf(fn);
    if (i >= 0) liste.splice(i, 1);
  }
  dispatchEvent(evt) {
    const type = evt && evt.type ? evt.type : evt;
    for (const fn of this._listeners[type] || []) fn.call(this, evt);
  }
  click() {
    this._clicked += 1;
    this.dispatchEvent({ type: "click", target: this });
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: this.width, height: this.height };
  }
  matches(selecteur) {
    return correspondAuSelecteur(this, selecteur);
  }
  querySelector(selecteur) {
    const trouves = this.querySelectorAll(selecteur);
    return trouves.length > 0 ? trouves[0] : null;
  }
  querySelectorAll(selecteur) {
    const trouves = [];
    const visiter = (racine) => {
      for (const enfant of racine.children) {
        if (correspondAuSelecteur(enfant, selecteur)) trouves.push(enfant);
        visiter(enfant);
      }
    };
    visiter(this);
    return trouves;
  }
  focus() {}
  blur() {}
}

// Sélecteur minimal : #id, .classe ou nom de balise (suffisant pour les tests).
function correspondAuSelecteur(el, selecteur) {
  if (!el || typeof selecteur !== "string") return false;
  const sel = selecteur.trim();
  if (sel === "") return false;
  if (sel[0] === "#") return el.id === sel.slice(1);
  if (sel[0] === ".") {
    return String(el.className || "").split(/\s+/).indexOf(sel.slice(1)) >= 0;
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function creerDocument(compteur) {
  const parId = new Map();
  const parSelecteur = new Map();

  const elementParId = (id) => {
    if (!parId.has(id)) {
      compteur.crees += 1;
      parId.set(id, new Element("div", id));
    }
    return parId.get(id);
  };

  const document = {
    getElementById: elementParId,
    createElement(tag) {
      compteur.crees += 1;
      return new Element(tag);
    },
    createElementNS(ns, tag) {
      compteur.crees += 1;
      return new Element(tag);
    },
    createTextNode(texte) {
      compteur.crees += 1;
      const e = new Element("#text");
      e.nodeType = 3;
      e.nodeValue = texte;
      e.textContent = texte;
      return e;
    },
    querySelector(sel) {
      if (!parSelecteur.has(sel)) {
        compteur.crees += 1;
        parSelecteur.set(sel, new Element("div"));
      }
      return parSelecteur.get(sel);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, fn) {
      (document._listeners[type] || (document._listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    _listeners: {},
    fonts: { ready: Promise.resolve() },
  };
  return document;
}

function creerLocalStorage(initial) {
  const donnees = new Map();
  if (initial) {
    for (const cle of Object.keys(initial)) {
      donnees.set(cle, initial[cle]);
    }
  }
  return {
    getItem(cle) {
      return donnees.has(cle) ? donnees.get(cle) : null;
    },
    setItem(cle, valeur) {
      donnees.set(cle, String(valeur));
    },
    removeItem(cle) {
      donnees.delete(cle);
    },
    clear() {
      donnees.clear();
    },
    get length() {
      return donnees.size;
    },
    _donnees: donnees,
  };
}

function creerEnvironnement(options) {
  const opts = options || {};
  const compteur = { crees: 0 };
  const document = creerDocument(compteur);
  const localStorage = creerLocalStorage(opts.stockage);
  const timers = { intervals: [], timeouts: [], raf: [] };
  let idTimer = 0;
  const horloge = { maintenant: opts.maintenant === undefined ? 1700000000000 : opts.maintenant };

  class DateFactice {
    constructor(...args) {
      return new Date(...args);
    }
    static now() {
      return horloge.maintenant;
    }
  }

  const sandbox = {
    document,
    localStorage,
    console: opts.console || console,
    Math,
    JSON,
    Date: DateFactice,
    // Horloge monotone utilisée par mettreAJourBoutons (performance.now).
    performance: { now() { return horloge.maintenant; } },
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Promise,
    setTimeout(fn, delai) {
      idTimer += 1;
      timers.timeouts.push({ id: idTimer, fn, delai });
      return idTimer;
    },
    clearTimeout(id) {
      timers.timeouts = timers.timeouts.filter(function (t) { return t.id !== id; });
    },
    setInterval(fn, delai) {
      idTimer += 1;
      timers.intervals.push({ id: idTimer, fn, delai });
      return idTimer;
    },
    clearInterval(id) {
      timers.intervals = timers.intervals.filter(function (t) { return t.id !== id; });
    },
    requestAnimationFrame(fn) {
      idTimer += 1;
      timers.raf.push({ id: idTimer, fn });
      return idTimer;
    },
    alert() {},
    confirm() {
      return true;
    },
    location: { reload() {} },
    _compteur: compteur,
    _horloge: horloge,
    _timers: timers,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 800;
  sandbox.addEventListener = function (type, fn) {
    (sandbox._listeners[type] || (sandbox._listeners[type] = [])).push(fn);
  };
  sandbox.removeEventListener = function () {};
  sandbox._listeners = {};
  return sandbox;
}

module.exports = { Element, creerEnvironnement, creerLocalStorage };
