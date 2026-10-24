// Interfaccia di Formiche Golose: schermate, disegno su canvas, formiche animate.
(function () {
  "use strict";

  const M = window.Motore;
  const SPRITES = window.SPRITES || [];
  const NUM_LIVELLI = SPRITES.length * M.GIRI.length;
  const NOMI_GIRI = ["Giro 1 · Antipasto", "Giro 2 · Primo", "Giro 3 · Gran banchetto"];

  // ---------- Salvataggio (solo su questo telefono) ----------
  const CHIAVE = "formiche-golose-v1";
  function leggiDati() {
    try { return JSON.parse(localStorage.getItem(CHIAVE)) || {}; } catch (e) { return {}; }
  }
  function salvaDati() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch (e) { /* niente spazio o modalità privata */ }
  }
  const dati = Object.assign({ fatti: [], suono: true }, leggiDati());
  const fatti = new Set(dati.fatti);

  function infoLivello(n) {
    return { sprite: SPRITES[n % SPRITES.length], giro: Math.floor(n / SPRITES.length) };
  }
  function creaLivello(n) {
    const { sprite, giro } = infoLivello(n);
    const l = M.generaLivello(sprite, 7919 * n + 13, giro);
    l.numero = n;
    return l;
  }

  // ---------- Colori ----------
  function rgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function mescola(hex, verso, f) {
    const a = rgb(hex), b = rgb(verso);
    return "rgb(" + a.map((c, i) => Math.round(c + (b[i] - c) * f)).join(",") + ")";
  }
  function chiaro(hex) {
    const [r, g, b] = rgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b > 165;
  }

  // ---------- Suoni brevi generati al volo ----------
  let audio = null, ultimoMorso = 0;
  function suona(freq, durata, tipo, volume) {
    if (!dati.suono) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = tipo || "square";
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + durata);
      g.gain.setValueAtTime(volume || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + durata);
    } catch (e) { /* audio non disponibile */ }
  }
  function morso() {
    const ora = performance.now();
    if (ora - ultimoMorso < 45) return;
    ultimoMorso = ora;
    suona(500 + Math.random() * 500, 0.05, "square", 0.025);
  }
  function fanfara() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => suona(f, 0.18, "triangle", 0.07), i * 110));
  }

  // ---------- Schermate ----------
  const $ = (id) => document.getElementById(id);
  let schermoAttivo = "home";
  function vai(nome) {
    document.querySelectorAll(".schermo").forEach((s) => s.classList.toggle("attivo", s.id === nome));
    document.querySelectorAll(".velo").forEach((v) => v.classList.remove("attivo"));
    schermoAttivo = nome;
    if (nome === "livelli") costruisciGriglia();
    if (nome === "partita") ridimensiona();
  }
  document.querySelectorAll("[data-vai]").forEach((b) => b.addEventListener("click", () => vai(b.dataset.vai)));

  function disegnaMiniatura(canvas, sprite, specchia) {
    const d = M.daDisegno(sprite, specchia);
    canvas.width = d.w;
    canvas.height = d.h;
    const c = canvas.getContext("2d");
    for (let i = 0; i < d.celle.length; i++) {
      if (d.celle[i] < 0) continue;
      c.fillStyle = d.colori[d.celle[i]];
      c.fillRect(i % d.w, Math.floor(i / d.w), 1, 1);
    }
  }

  function primoDaFare() {
    for (let n = 0; n < NUM_LIVELLI; n++) if (!fatti.has(n)) return n;
    return 0;
  }

  let grigliaFatta = false;
  function costruisciGriglia() {
    const g = $("griglia");
    if (!grigliaFatta) {
      g.innerHTML = "";
      for (let giro = 0; giro < M.GIRI.length; giro++) {
        const h = document.createElement("h3");
        h.textContent = NOMI_GIRI[giro] || "Giro " + (giro + 1);
        g.appendChild(h);
        const righe = document.createElement("div");
        righe.className = "righe";
        SPRITES.forEach((s, i) => {
          const n = giro * SPRITES.length + i;
          const b = document.createElement("button");
          b.className = "carta";
          b.dataset.n = n;
          b.setAttribute("aria-label", "Livello " + (n + 1) + ": " + s.nome);
          const cv = document.createElement("canvas");
          disegnaMiniatura(cv, s, M.GIRI[giro].specchia);
          const num = document.createElement("b");
          num.textContent = n + 1;
          b.append(cv, num);
          b.addEventListener("click", () => avvia(n));
          righe.appendChild(b);
        });
        g.appendChild(righe);
      }
      grigliaFatta = true;
    }
    g.querySelectorAll(".carta").forEach((b) => b.classList.toggle("fatto", fatti.has(+b.dataset.n)));
  }

  // ---------- Partita ----------
  const tela = $("tela");
  const ctx = tela.getContext("2d");
  let partita = null, visivo = null, formiche = [], briciole = [], scossa = 0, finale = false;
  // Posti come li vede il giocatore: uno sciame toccato resta nel suo posto finché
  // tutte le sue formiche non sono uscite (o, se non trovano cibo, finché aspetta).
  let postiVisivi = [], inUscita = new Map();
  let L = null; // misure dello schermo di gioco

  function avvia(n) {
    const livello = creaLivello(n);
    partita = M.nuovaPartita(livello);
    $("titolo").textContent = (n + 1) + " · " + livello.nome;
    vai("partita");
    ripristinaVisivo();
  }

  function ripristinaVisivo() {
    visivo = Int8Array.from(partita.tab.celle);
    postiVisivi = partita.attesa.map((a) => ({ id: a.id, colore: a.colore }));
    inUscita = new Map();
    formiche = [];
    briciole = [];
    finale = false;
    document.querySelectorAll(".velo").forEach((v) => v.classList.remove("attivo"));
  }

  function ridimensiona() {
    if (!partita) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = tela.clientWidth, H = tela.clientHeight;
    tela.width = Math.round(W * dpr);
    tela.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const liv = partita.livello, nc = liv.corsie.length, margine = 14;
    const T = Math.min((W - margine * 2) / nc * 0.6, H * 0.1, 74); // gettone in testa
    const t2 = T * 0.62; // gettoni in coda
    const altezzaCorsie = T + 3 * (t2 + 6) + margine;
    const P = Math.min((W - margine * 2) / liv.posti - 10, T * 0.85);
    const altezzaAttesa = P + 22;
    const altezzaTana = 46;
    const zonaAlta = H - altezzaCorsie - altezzaAttesa - altezzaTana - margine;
    const cella = Math.max(4, Math.floor(Math.min((W - margine * 2) / liv.w, (zonaAlta - margine) / liv.h)));
    const bw = cella * liv.w, bh = cella * liv.h;
    L = {
      W, H, T, t2, P, cella,
      bx: Math.round((W - bw) / 2),
      by: Math.round(margine / 2 + (zonaAlta - bh) / 2),
      bw, bh,
      tanaY: zonaAlta + altezzaTana / 2 + 4,
      attesaY: zonaAlta + altezzaTana + 6,
      corsieY: zonaAlta + altezzaTana + altezzaAttesa + 8,
      xCorsia: (i) => (W * (i + 0.5)) / nc,
      xPosto: (j) => W / 2 + (j - (liv.posti - 1) / 2) * (P + 10),
    };
  }
  window.addEventListener("resize", ridimensiona);

  function centroCella(i) {
    const w = partita.livello.w;
    return [L.bx + (i % w + 0.5) * L.cella, L.by + (Math.floor(i / w) + 0.5) * L.cella];
  }

  // Ogni pixel mangiato ha la sua formica: esce dalla tana, raggiunge il pixel, lo porta via.
  function lanciaFormiche(eventi) {
    const ora = performance.now();
    for (const e of eventi) {
      if (e.da === "attesa-piena") { scossa = ora; suona(140, 0.35, "sawtooth", 0.06); continue; }
      if (e.id === undefined) continue;
      if (!postiVisivi.some((p) => p.id === e.id)) postiVisivi.push({ id: e.id, colore: e.colore });
      if (!e.celle) continue;
      inUscita.set(e.id, (inUscita.get(e.id) || 0) + e.celle.length);
      const passo = Math.min(45, 1400 / e.celle.length);
      e.celle.forEach((cella, k) => {
        const [tx, ty] = centroCella(cella);
        const sx = L.W / 2 + (Math.random() - 0.5) * 18, sy = L.tanaY + (Math.random() - 0.5) * 6;
        const dist = Math.hypot(tx - sx, ty - sy);
        formiche.push({
          id: e.id, uscita: false,
          sx, sy, tx, ty, cella, colore: partita.livello.colori[e.colore],
          inizio: ora + k * passo, durata: 260 + dist * 0.9, onda: Math.random() * 6.28,
          arrivata: false, ritorno: 0, rx: L.W / 2 + (Math.random() - 0.5) * 16, ry: L.tanaY,
        });
      });
    }
  }

  function tocco(ev) {
    if (!partita || partita.stato !== "gioco" || !L) return;
    const r = tela.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (y < L.corsieY - 8) return;
    const nc = partita.corsie.length;
    const i = Math.min(nc - 1, Math.max(0, Math.floor((x / L.W) * nc)));
    if (!partita.corsie[i].length) return;
    if (postiVisivi.length >= partita.livello.posti) { scossa = performance.now(); return; }
    const eventi = M.tocca(partita, i);
    if (!eventi) return;
    if (navigator.vibrate) navigator.vibrate(8);
    suona(320, 0.08, "triangle", 0.05);
    lanciaFormiche(eventi);
  }
  tela.addEventListener("pointerdown", tocco);

  $("annulla").addEventListener("click", () => { if (partita && M.annulla(partita)) ripristinaVisivo(); });
  $("annullaPerso").addEventListener("click", () => { if (partita && M.annulla(partita)) ripristinaVisivo(); });
  $("ricomincia").addEventListener("click", () => partita && avvia(partita.livello.numero));
  $("riprova").addEventListener("click", () => partita && avvia(partita.livello.numero));
  $("prossimo").addEventListener("click", () => avvia((partita.livello.numero + 1) % NUM_LIVELLI));

  // ---------- Disegno ----------
  function rettangoloTondo(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Formica vista dall'alto, in stile cartone: testa grande con occhioni e antenne.
  function disegnaFormica(x, y, angolo, s, colore, alfa) {
    const scuro = "#2b1d14";
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(x, y);
    ctx.rotate(angolo);
    ctx.lineCap = "round";
    ctx.strokeStyle = scuro;
    ctx.lineWidth = Math.max(1, s * 0.1);
    const zampa = Math.sin(performance.now() / 45 + x) * s * 0.22;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(k * s * 0.28, 0);
      ctx.lineTo(k * s * 0.28 + zampa, -s * 0.55);
      ctx.moveTo(k * s * 0.28, 0);
      ctx.lineTo(k * s * 0.28 - zampa, s * 0.55);
      ctx.stroke();
    }
    // antenne con pallina
    for (const lato of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.78, lato * s * 0.1);
      ctx.quadraticCurveTo(s * 1.0, lato * s * 0.18, s * 1.1, lato * s * 0.38);
      ctx.stroke();
      ctx.fillStyle = scuro;
      ctx.beginPath(); ctx.arc(s * 1.1, lato * s * 0.38, s * 0.08, 0, 6.29); ctx.fill();
    }
    // addome del colore dello sciame, torace, testa
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.fillStyle = colore;
    ctx.beginPath(); ctx.ellipse(-s * 0.48, 0, s * 0.44, s * 0.34, 0, 0, 6.29); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath(); ctx.ellipse(-s * 0.58, -s * 0.12, s * 0.15, s * 0.08, -0.3, 0, 6.29); ctx.fill();
    ctx.fillStyle = scuro;
    ctx.beginPath(); ctx.ellipse(s * 0.1, 0, s * 0.18, s * 0.15, 0, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#5a3d2b";
    ctx.beginPath(); ctx.arc(s * 0.55, 0, s * 0.3, 0, 6.29); ctx.fill(); ctx.stroke();
    // occhioni
    for (const lato of [-1, 1]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(s * 0.66, lato * s * 0.13, s * 0.13, 0, 6.29); ctx.fill();
      ctx.fillStyle = scuro;
      ctx.beginPath(); ctx.arc(s * 0.71, lato * s * 0.12, s * 0.07, 0, 6.29); ctx.fill();
    }
    ctx.restore();
  }

  // Gettone dello sciame: il musetto di una formica sul colore dello sciame, col numero.
  function disegnaGettone(cx, cy, s, colore, n, alfa) {
    const scuro = "#2b1d14";
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.fillStyle = "rgba(59,42,32,0.25)";
    rettangoloTondo(cx - s / 2, cy - s / 2 + s * 0.07, s, s, s * 0.26);
    ctx.fill();
    ctx.fillStyle = colore;
    rettangoloTondo(cx - s / 2, cy - s / 2, s, s, s * 0.26);
    ctx.fill();
    ctx.strokeStyle = mescola(colore, "#000000", 0.35);
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    rettangoloTondo(cx - s * 0.4, cy - s * 0.44, s * 0.8, s * 0.2, s * 0.1);
    ctx.fill();

    const fx = cx, fy = cy - s * 0.1, r = s * 0.25;
    const [cr, cg, cb] = rgb(colore);
    const antenne = 0.299 * cr + 0.587 * cg + 0.114 * cb < 80 ? "#f6e7cf" : scuro;
    ctx.lineCap = "round";
    ctx.strokeStyle = antenne;
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    for (const lato of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(fx + lato * r * 0.45, fy - r * 0.85);
      ctx.quadraticCurveTo(fx + lato * r * 0.6, fy - r * 1.55, fx + lato * r * 1.15, fy - r * 1.6);
      ctx.stroke();
      ctx.fillStyle = antenne;
      ctx.beginPath(); ctx.arc(fx + lato * r * 1.15, fy - r * 1.6, s * 0.045, 0, 6.29); ctx.fill();
    }
    ctx.strokeStyle = scuro;
    ctx.fillStyle = "#6b4630";
    ctx.beginPath(); ctx.ellipse(fx, fy, r * 1.08, r, 0, 0, 6.29); ctx.fill();
    ctx.stroke();
    for (const lato of [-1, 1]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.ellipse(fx + lato * r * 0.42, fy - r * 0.15, r * 0.34, r * 0.4, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = scuro;
      ctx.beginPath(); ctx.arc(fx + lato * r * 0.36, fy - r * 0.05, r * 0.2, 0, 6.29); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(fx + lato * r * 0.3, fy - r * 0.15, r * 0.07, 0, 6.29); ctx.fill();
      ctx.fillStyle = "rgba(255,120,140,0.55)";
      ctx.beginPath(); ctx.ellipse(fx + lato * r * 0.78, fy + r * 0.42, r * 0.17, r * 0.1, 0, 0, 6.29); ctx.fill();
    }
    ctx.strokeStyle = scuro;
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    ctx.beginPath(); ctx.arc(fx, fy + r * 0.38, r * 0.22, 0.2, Math.PI - 0.2); ctx.stroke();

    const pw = Math.max(s * 0.46, String(n).length * s * 0.2 + s * 0.16), ph = s * 0.27;
    ctx.fillStyle = "#fffaf1";
    rettangoloTondo(cx - pw / 2, cy + s * 0.22, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = "#3b2a20";
    ctx.font = "800 " + Math.round(s * 0.24) + "px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, cx, cy + s * 0.22 + ph / 2 + 1);
    ctx.restore();
  }

  function disegna(ora) {
    const liv = partita.livello, colori = liv.colori;
    ctx.clearRect(0, 0, L.W, L.H);

    // piatto dietro al disegno
    const bordo = Math.max(10, L.cella);
    ctx.fillStyle = "rgba(255,250,241,0.92)";
    rettangoloTondo(L.bx - bordo, L.by - bordo, L.bw + bordo * 2, L.bh + bordo * 2, 22);
    ctx.fill();

    // sagoma tenue del cibo già mangiato, poi i pixel rimasti
    const c = L.cella, smusso = Math.max(1, Math.round(c * 0.14));
    for (let i = 0; i < visivo.length; i++) {
      const x = L.bx + (i % liv.w) * c, y = L.by + Math.floor(i / liv.w) * c;
      if (visivo[i] < 0) {
        if (liv.celle[i] >= 0) { ctx.fillStyle = "rgba(59,42,32,0.06)"; ctx.fillRect(x, y, c, c); }
        continue;
      }
      const col = colori[visivo[i]];
      ctx.fillStyle = col;
      ctx.fillRect(x, y, c, c);
      if (c >= 6) {
        ctx.fillStyle = mescola(col, "#000000", 0.18);
        ctx.fillRect(x, y + c - smusso, c, smusso);
        ctx.fillRect(x + c - smusso, y, smusso, c);
        ctx.fillStyle = mescola(col, "#ffffff", 0.25);
        ctx.fillRect(x, y, c - smusso, smusso);
      }
    }

    // tana da cui escono le formiche
    const tx0 = L.W / 2;
    ctx.fillStyle = "rgba(255,250,241,0.5)";
    ctx.beginPath(); ctx.ellipse(tx0, L.tanaY + 3, 34, 14, 0, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#6b4630";
    ctx.beginPath(); ctx.ellipse(tx0, L.tanaY, 28, 11, 0, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#2b1d14";
    ctx.beginPath(); ctx.ellipse(tx0, L.tanaY + 2, 22, 7.5, 0, 0, 6.29); ctx.fill();

    // posti: chi non ha più formiche in uscita né in attesa libera il posto
    postiVisivi = postiVisivi.filter((p) => (inUscita.get(p.id) || 0) > 0 || partita.attesa.some((a) => a.id === p.id));
    const tremito = ora - scossa < 400 ? Math.sin((ora - scossa) / 25) * 6 * (1 - (ora - scossa) / 400) : 0;
    for (let j = 0; j < liv.posti; j++) {
      const x = L.xPosto(j) + tremito, y = L.attesaY + L.P / 2;
      ctx.fillStyle = "rgba(59,42,32,0.12)";
      rettangoloTondo(x - L.P / 2, y - L.P / 2, L.P, L.P, L.P * 0.24);
      ctx.fill();
      const p = postiVisivi[j];
      if (p) {
        const fermo = partita.attesa.find((a) => a.id === p.id);
        const n = (inUscita.get(p.id) || 0) + (fermo ? fermo.n : 0);
        disegnaGettone(x, y, L.P * 0.92, colori[p.colore], n, 1);
      }
    }

    // corsie: in testa il gettone grande da toccare, sotto quelli in coda
    partita.corsie.forEach((corsia, i) => {
      const x = L.xCorsia(i);
      corsia.slice(0, 4).forEach((s, k) => {
        if (k === 0) disegnaGettone(x, L.corsieY + L.T / 2, L.T, colori[s.colore], s.n, 1);
        else disegnaGettone(x, L.corsieY + L.T + 6 + (k - 1) * (L.t2 + 6) + L.t2 / 2, L.t2, colori[s.colore], s.n, 0.75);
      });
      if (corsia.length > 4) {
        ctx.fillStyle = "#8a7262";
        ctx.font = "700 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+" + (corsia.length - 4), x + L.t2 * 0.75, L.corsieY + L.T + 6 + 2 * (L.t2 + 6) + L.t2 / 2);
      }
    });

    // briciole
    briciole = briciole.filter((b) => ora - b.t < 450);
    for (const b of briciole) {
      const f = (ora - b.t) / 450;
      ctx.globalAlpha = 1 - f;
      ctx.fillStyle = b.colore;
      ctx.fillRect(b.x + b.vx * f * 18, b.y + b.vy * f * 18 + f * f * 14, b.s, b.s);
    }
    ctx.globalAlpha = 1;

    // formiche
    const misura = Math.max(11, Math.min(18, L.cella * 1.3));
    formiche = formiche.filter((f) => f.ritorno < 1);
    for (const f of formiche) {
      if (ora < f.inizio) continue;
      if (!f.uscita) {
        f.uscita = true;
        inUscita.set(f.id, (inUscita.get(f.id) || 1) - 1);
      }
      let p = (ora - f.inizio) / f.durata, x, y, angolo;
      if (p < 1) {
        const e = 1 - (1 - p) * (1 - p);
        const nx = -(f.ty - f.sy), ny = f.tx - f.sx, ln = Math.hypot(nx, ny) || 1;
        const ondeggio = Math.sin(e * 9 + f.onda) * 8 * (1 - e);
        x = f.sx + (f.tx - f.sx) * e + (nx / ln) * ondeggio;
        y = f.sy + (f.ty - f.sy) * e + (ny / ln) * ondeggio;
        angolo = Math.atan2(f.ty - f.sy, f.tx - f.sx);
        disegnaFormica(x, y, angolo, misura, f.colore, 1);
      } else {
        if (!f.arrivata) {
          f.arrivata = true;
          visivo[f.cella] = -1;
          morso();
          for (let k = 0; k < 3; k++) {
            briciole.push({ x: f.tx, y: f.ty, vx: Math.random() - 0.5, vy: -Math.random(), s: Math.max(2, L.cella * 0.3), colore: f.colore, t: ora });
          }
        }
        f.ritorno = Math.min(1, (ora - f.inizio - f.durata) / 600);
        x = f.tx + (f.rx - f.tx) * f.ritorno;
        y = f.ty + (f.ry - f.ty) * f.ritorno;
        angolo = Math.atan2(f.ry - f.ty, f.rx - f.tx);
        disegnaFormica(x, y, angolo, misura, f.colore, 1 - f.ritorno);
        ctx.fillStyle = f.colore;
        ctx.globalAlpha = 1 - f.ritorno;
        ctx.fillRect(x + Math.cos(angolo) * misura * 0.9 - 2, y + Math.sin(angolo) * misura * 0.9 - 2, 4, 4);
        ctx.globalAlpha = 1;
      }
    }

    // finale: quando le formiche hanno finito
    if (!finale && partita.stato !== "gioco" && formiche.every((f) => f.arrivata)) {
      finale = true;
      setTimeout(mostraFinale, partita.stato === "vinto" ? 450 : 250);
    }
  }

  function mostraFinale() {
    if (schermoAttivo !== "partita") return;
    if (partita.stato === "vinto") {
      const n = partita.livello.numero;
      fatti.add(n);
      dati.fatti = [...fatti];
      salvaDati();
      const { sprite, giro } = infoLivello(n);
      disegnaMiniatura($("premio"), sprite, M.GIRI[giro].specchia);
      $("testoVinto").textContent = "Le formiche hanno divorato: " + partita.livello.nome + ".";
      $("veloVinto").classList.add("attivo");
      fanfara();
    } else if (partita.stato === "perso") {
      $("veloPerso").classList.add("attivo");
    }
  }

  function ciclo(ora) {
    if (schermoAttivo === "partita" && partita && L) disegna(ora);
    requestAnimationFrame(ciclo);
  }
  requestAnimationFrame(ciclo);

  // ---------- Home ----------
  $("gioca").addEventListener("click", () => avvia(primoDaFare()));
  $("apriLivelli").addEventListener("click", () => vai("livelli"));
  function etichettaSuono() { $("suono").textContent = "Suono: " + (dati.suono ? "sì" : "no"); }
  $("suono").addEventListener("click", () => { dati.suono = !dati.suono; salvaDati(); etichettaSuono(); });
  etichettaSuono();

  if (SPRITES.length) disegnaMiniatura($("logo"), SPRITES[0], false);
})();
