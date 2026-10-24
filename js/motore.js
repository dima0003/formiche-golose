// Motore di Formiche Golose: regole, mosse e generazione dei livelli.
// Niente grafica qui: lo stesso file gira nel browser e in Node (per i test).
(function (radice) {
  "use strict";

  const VUOTO = -1;

  // Generatore pseudo-casuale con seme: lo stesso livello esce sempre uguale.
  function casuale(seme) {
    let a = seme >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function vicini(w, h, i) {
    const x = i % w, y = (i / w) | 0, v = [];
    if (x > 0) v.push(i - 1);
    if (x < w - 1) v.push(i + 1);
    if (y > 0) v.push(i - w);
    if (y < h - 1) v.push(i + w);
    return v;
  }

  function sulBordo(w, h, i) {
    const x = i % w, y = (i / w) | 0;
    return x === 0 || y === 0 || x === w - 1 || y === h - 1;
  }

  // Tabellone: celle con l'indice del colore (o VUOTO) e la mappa delle
  // celle vuote collegate all'esterno, da cui le formiche possono arrivare.
  function creaTabellone(w, h, celle) {
    const t = { w, h, celle: Int8Array.from(celle), aperto: new Uint8Array(w * h) };
    for (let i = 0; i < w * h; i++) {
      if (t.celle[i] === VUOTO && sulBordo(w, h, i)) apri(t, i);
    }
    return t;
  }

  function copiaTabellone(t) {
    return { w: t.w, h: t.h, celle: Int8Array.from(t.celle), aperto: Uint8Array.from(t.aperto) };
  }

  // Apre una cella vuota e tutte le vuote chiuse collegate; restituisce le nuove aperte.
  function apri(t, inizio) {
    const nuove = [];
    if (t.aperto[inizio]) return nuove;
    const pila = [inizio];
    t.aperto[inizio] = 1;
    while (pila.length) {
      const i = pila.pop();
      nuove.push(i);
      for (const k of vicini(t.w, t.h, i)) {
        if (!t.aperto[k] && t.celle[k] === VUOTO) {
          t.aperto[k] = 1;
          pila.push(k);
        }
      }
    }
    return nuove;
  }

  function raggiungibile(t, i) {
    if (t.celle[i] === VUOTO) return false;
    if (sulBordo(t.w, t.h, i)) return true;
    for (const k of vicini(t.w, t.h, i)) if (t.aperto[k]) return true;
    return false;
  }

  // Uno sciame mangia fino a "max" pixel del suo colore, partendo da quelli
  // raggiungibili più in basso. Ogni pixel mangiato libera la strada ai vicini.
  function mangia(t, colore, max) {
    const { w, h, celle } = t;
    const mangiati = [];
    const inCoda = new Uint8Array(w * h);
    const coda = [];
    for (let i = 0; i < w * h; i++) {
      if (celle[i] === colore && raggiungibile(t, i)) {
        coda.push(i);
        inCoda[i] = 1;
      }
    }
    const centro = (w - 1) / 2;
    coda.sort((a, b) => {
      const dy = ((b / w) | 0) - ((a / w) | 0);
      return dy !== 0 ? dy : Math.abs((a % w) - centro) - Math.abs((b % w) - centro);
    });
    let testa = 0;
    while (testa < coda.length && mangiati.length < max) {
      const i = coda[testa++];
      celle[i] = VUOTO;
      mangiati.push(i);
      for (const n of apri(t, i)) {
        for (const k of vicini(w, h, n)) {
          if (celle[k] === colore && !inCoda[k]) {
            inCoda[k] = 1;
            coda.push(k);
          }
        }
      }
    }
    return mangiati;
  }

  function pixelRimasti(t) {
    let n = 0;
    for (let i = 0; i < t.celle.length; i++) if (t.celle[i] !== VUOTO) n++;
    return n;
  }

  // Trasforma un disegno (righe di caratteri + tavolozza) in celle e colori.
  function daDisegno(sprite, specchia) {
    const chiavi = Object.keys(sprite.palette);
    const colori = chiavi.map((k) => sprite.palette[k]);
    const h = sprite.righe.length, w = sprite.righe[0].length;
    const celle = new Array(w * h).fill(VUOTO);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = sprite.righe[y][specchia ? w - 1 - x : x];
        const k = chiavi.indexOf(c);
        if (k >= 0) celle[y * w + x] = k;
      }
    }
    return { w, h, celle, colori };
  }

  // Difficoltà per giro: più corsie e meno posti d'attesa andando avanti.
  const GIRI = [
    { corsie: 3, posti: 5, specchia: false },
    { corsie: 4, posti: 4, specchia: true },
    { corsie: 4, posti: 3, specchia: false },
  ];

  // Il livello si costruisce giocandolo: si simula una partita vinta scegliendo
  // a caso colori raggiungibili, e la sequenza di sciami usata viene distribuita
  // nelle corsie senza cambiarne l'ordine. Così ogni livello ha almeno una soluzione.
  function generaLivello(sprite, seme, giro) {
    const regole = GIRI[Math.min(giro, GIRI.length - 1)];
    const caso = casuale(seme);
    const d = daDisegno(sprite, regole.specchia);
    const t = creaTabellone(d.w, d.h, d.celle);
    const totale = pixelRimasti(t);
    // Sciami pochi e grandi (nell'originale vanno da circa 10 a 60 formiche).
    const minimo = Math.max(6, Math.round(totale / 14));
    const massimo = Math.max(minimo + 6, Math.round(totale / 5));

    const sequenza = [];
    while (pixelRimasti(t) > 0) {
      const conti = new Array(d.colori.length).fill(0);
      for (let i = 0; i < t.celle.length; i++) if (raggiungibile(t, i)) conti[t.celle[i]]++;
      const candidati = [];
      conti.forEach((n, c) => { if (n > 0) candidati.push(c); });
      const colore = candidati[Math.floor(caso() * candidati.length)];
      const voglia = minimo + Math.floor(caso() * (massimo - minimo + 1));
      const n = mangia(t, colore, voglia).length;
      sequenza.push({ colore, n });
    }

    const corsie = Array.from({ length: regole.corsie }, () => []);
    for (const s of sequenza) corsie[Math.floor(caso() * corsie.length)].push(s);
    for (let i = 0; i < corsie.length; i++) {
      if (corsie[i].length === 0) {
        // Corsia vuota: le si cede l'ultimo sciame della corsia più lunga (l'ordine resta valido).
        const lunga = corsie.reduce((a, b) => (b.length > a.length ? b : a));
        corsie[i].push(lunga.pop());
      }
    }

    return {
      nome: sprite.nome,
      w: d.w,
      h: d.h,
      celle: d.celle,
      colori: d.colori,
      corsie,
      posti: regole.posti,
    };
  }

  // Partita in corso.
  function nuovaPartita(livello) {
    return {
      livello,
      tab: creaTabellone(livello.w, livello.h, livello.celle),
      corsie: (() => {
        let id = 0;
        return livello.corsie.map((c) => c.map((s) => ({ ...s, id: id++ })));
      })(),
      attesa: [],
      stato: "gioco", // "gioco" | "vinto" | "perso"
      storia: [],
    };
  }

  function fotografia(p) {
    return {
      tab: copiaTabellone(p.tab),
      corsie: p.corsie.map((c) => c.map((s) => ({ ...s }))),
      attesa: p.attesa.map((s) => ({ ...s })),
      stato: p.stato,
    };
  }

  // Gli sciami in attesa ripartono da soli appena trovano cibo del loro colore.
  function svuotaAttesa(p, eventi) {
    let cambiato = true;
    while (cambiato) {
      cambiato = false;
      for (let j = 0; j < p.attesa.length; j++) {
        const s = p.attesa[j];
        const m = mangia(p.tab, s.colore, s.n);
        if (m.length) {
          s.n -= m.length;
          eventi.push({ da: "attesa", id: s.id, colore: s.colore, celle: m });
          cambiato = true;
        }
      }
      p.attesa = p.attesa.filter((s) => s.n > 0);
    }
  }

  // Tocca la corsia indicata: parte lo sciame in testa. Restituisce gli eventi
  // da animare, oppure null se la mossa non è possibile.
  // Lo sciame toccato prende un posto: le formiche che trovano cibo partono,
  // le altre restano lì ad aspettare. Se tutti i posti restano pieni si perde.
  function tocca(p, corsia) {
    if (p.stato !== "gioco" || !p.corsie[corsia] || !p.corsie[corsia].length) return null;
    if (p.attesa.length >= p.livello.posti) return null;
    p.storia.push(fotografia(p));
    const s = p.corsie[corsia].shift();
    const eventi = [];
    const m = mangia(p.tab, s.colore, s.n);
    if (m.length) eventi.push({ da: "corsia", corsia, id: s.id, colore: s.colore, celle: m });
    const resto = s.n - m.length;
    if (resto > 0) {
      p.attesa.push({ id: s.id, colore: s.colore, n: resto });
      eventi.push({ da: "in-attesa", corsia, id: s.id, colore: s.colore, n: resto });
    }
    svuotaAttesa(p, eventi);
    if (pixelRimasti(p.tab) === 0) p.stato = "vinto";
    else if (p.attesa.length >= p.livello.posti) {
      p.stato = "perso";
      eventi.push({ da: "attesa-piena" });
    }
    return eventi;
  }

  function annulla(p) {
    const f = p.storia.pop();
    if (!f) return false;
    p.tab = f.tab;
    p.corsie = f.corsie;
    p.attesa = f.attesa;
    p.stato = f.stato;
    return true;
  }

  const Motore = {
    VUOTO, GIRI, casuale, creaTabellone, mangia, raggiungibile, pixelRimasti,
    daDisegno, generaLivello, nuovaPartita, tocca, annulla,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Motore;
  else radice.Motore = Motore;
})(this);
