/* ---------- illustraties per soort gerecht ---------- */
const ART = {
  kip: '<path d="M16 40c-6-8-3-20 9-23 9-2 17 3 17 11 0 6-5 9-9 10l-9 9a4 4 0 1 1-5-5l3-3c-3-1-5-3-6-5z"/><circle cx="22" cy="23" r="1.2"/>',
  rund: '<path d="M10 30c0-10 9-17 21-17 13 0 23 6 23 16 0 11-12 20-26 20-11 0-18-8-18-19z"/><path d="M24 28c3-4 9-5 13-2M26 38c4 2 10 1 14-3"/>',
  varken: '<rect x="8" y="23" width="48" height="18" rx="9"/><path d="M20 23v18M32 23v18M44 23v18"/>',
  vis: '<path d="M8 32c8-12 22-16 34-10 4 2 7 6 7 10s-3 8-7 10c-12 6-26 2-34-10z"/><path d="M49 32l9-8v16z"/><circle cx="20" cy="29" r="1.3"/>',
  vega: '<path d="M32 54V30"/><path d="M32 34c-10 0-16-6-16-16 10 0 16 6 16 16zM32 28c9 0 15-5 16-14-9 0-16 5-16 14z"/>',
  ei: '<path d="M32 10c-10 0-18 14-18 26 0 10 8 18 18 18s18-8 18-18c0-12-8-26-18-26z"/><circle cx="32" cy="38" r="8"/>',
};
function artSVG(r) {
  const k = ART[r.cat] ? r.cat : 'vega';
  return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ART[k] + '</svg>';
}
function thumbHTML(r) {
  const ph = ST.photos && ST.photos[r.id];
  return '<span class="thumb">' + (ph ? '<img alt="" src="' + esc(ph) + '">' : artSVG(r)) + '</span>';
}

/* ---------- smaakprofiel ---------- */
function applyTaste() { setTaste(ST.taste, D); }

function buildQueue() {
  const P = activeP(); const q = [];
  ['ontbijt', 'lunch', 'diner'].forEach((m) => {
    const list = eligible(D, P, m).list.filter((r) => !r.own).slice();
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
    const seen = {}; const pick = [];
    list.forEach((r) => { if (pick.length < 4 && !seen[r.cat]) { seen[r.cat] = 1; pick.push(r); } });
    list.forEach((r) => { if (pick.length < 4 && pick.indexOf(r) < 0) pick.push(r); });
    pick.forEach((r) => { if (!q.some((x) => x.id === r.id)) q.push(r); });
  });
  return q.map((r) => r.id);
}

function tasteHTML() {
  const T = ST.taste; const sw = UI.sw;
  if (sw.step === 'nope') {
    const ings = D.ingredients.filter((i) => !i.pantry && !i.cp).sort((a, b) => a.naam.localeCompare(b.naam));
    const chips = ings.map((i) => '<button class="chip" data-a="nopetog" data-v="' + i.id + '" aria-pressed="' + (T.nopeIng.indexOf(i.id) >= 0) + '">' + esc(i.naam) + '</button>').join('');
    return '<div class="sec"><h2>Wat eet je echt niet?</h2><p class="small">Gerechten met deze ingrediënten komen nooit in je menu. Je past dit altijd aan bij Profiel.</p></div><div class="seg">' + chips + '</div>'
      + '<div class="actions sec"><button class="btn primary" data-a="swfinish">Klaar, maak mijn menu</button></div>';
  }
  const rid = sw.queue[sw.i]; const r = rid && D.rec[rid];
  if (!r) return '<div class="sec"><h2>Klaar met swipen</h2></div><div class="actions sec"><button class="btn primary" data-a="swnope">Verder</button></div>';
  const m = r.meals.map((x) => MEAL_NL[x].toLowerCase()).join(' of ');
  return '<div class="sec"><span class="cap">' + (sw.i + 1) + ' van ' + sw.queue.length + '</span><h2>Wat vind je lekker?</h2><p class="small">Swipe naar rechts voor lekker, naar links voor niet voor mij. Zo leert de app je smaak kennen.</p></div>'
    + '<div class="swcard" id="swcard" tabindex="0"><div class="swart">' + artSVG(r) + '</div><div class="cap">' + esc(m) + '</div><h3>' + esc(r.naam) + '</h3><div class="slot-meta"><span>' + timeText(r) + '</span></div><div class="slot-meta">' + tagsFor(r, activeP()) + '</div></div>'
    + '<div class="swbtns"><button class="btn" data-a="swno">Niet voor mij</button><button class="btn primary" data-a="swlike">Lekker</button></div>'
    + '<div class="actions"><button class="linkbtn" data-a="swnever">Dit eet ik echt niet, nooit meer tonen</button><button class="linkbtn" data-a="swnope">Sla de rest over</button></div>';
}

function startTaste() {
  UI.sw = { queue: buildQueue(), i: 0, step: 'swipe' };
  UI.tab = 'smaak';
}
function tasteNext() { UI.sw.i++; if (UI.sw.i >= UI.sw.queue.length) UI.sw.step = 'nope'; render(); }

function tasteAct(a, ds) {
  const T = ST.taste;
  switch (a) {
    case 'swlike': { const id = UI.sw.queue[UI.sw.i]; if (T.liked.indexOf(id) < 0) T.liked.push(id); T.disliked = T.disliked.filter((x) => x !== id); applyTaste(); save(); tasteNext(); return true; }
    case 'swno': { const id = UI.sw.queue[UI.sw.i]; if (T.disliked.indexOf(id) < 0) T.disliked.push(id); T.liked = T.liked.filter((x) => x !== id); applyTaste(); save(); tasteNext(); return true; }
    case 'swnever': { const id = UI.sw.queue[UI.sw.i]; if (T.never.indexOf(id) < 0) T.never.push(id); applyTaste(); save(); tasteNext(); return true; }
    case 'swnope': UI.sw.step = 'nope'; render(); return true;
    case 'nopetog': { const i = T.nopeIng.indexOf(ds.v); if (i >= 0) T.nopeIng.splice(i, 1); else T.nopeIng.push(ds.v); applyTaste(); save(); render(); return true; }
    case 'swfinish': T.done = true; UI.tab = 'menu'; applyTaste(); newPlan(); save(); render(); window.scrollTo(0, 0); return true;
    case 'tasteagain': startTaste(); render(); window.scrollTo(0, 0); return true;
    case 'tastenope': UI.sw = { queue: [], i: 0, step: 'nope' }; UI.tab = 'smaak'; render(); return true;
    case 'neverclear': T.never = []; T.disliked = []; applyTaste(); save(); render(); return true;
    case 'neverdel': T.never = T.never.filter((x) => x !== ds.v); applyTaste(); save(); render(); return true;
    case 'photodel': delete ST.photos[ds.v]; save(); render(); return true;
    default: return false;
  }
}

function tasteSummaryHTML() {
  const T = ST.taste;
  const nm = (id) => (D.rec[id] ? D.rec[id].naam : id);
  const never = T.never.length ? '<div class="small">Nooit meer: ' + T.never.map((id) => esc(nm(id)) + ' <button class="linkbtn" data-a="neverdel" data-v="' + id + '">terugzetten</button>').join(', ') + '</div>' : '';
  const nope = T.nopeIng.length ? '<div class="small">Eet je niet: ' + T.nopeIng.map((id) => esc(D.ing[id] ? D.ing[id].naam.toLowerCase() : id)).join(', ') + '</div>' : '';
  return '<div class="sec"><span class="cap">Smaak</span><div class="small">' + T.liked.length + ' gerechten lekker, ' + T.disliked.length + ' niet voor jou.</div>' + never + nope
    + '<div class="actions" style="margin-top:8px"><button class="btn sm" data-a="tasteagain">Swipe opnieuw</button><button class="btn sm ghost" data-a="tastenope">Wat ik niet eet</button></div></div>';
}

/* swipen met de vinger of muis */
(function () {
  let sx = null; let card = null;
  document.addEventListener('pointerdown', (e) => { const c = e.target.closest && e.target.closest('#swcard'); if (c) { card = c; sx = e.clientX; try { c.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } } });
  document.addEventListener('pointermove', (e) => { if (card && sx != null) { const dx = e.clientX - sx; card.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 25 + 'deg)'; card.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 400)); } });
  const end = (e) => {
    if (!card || sx == null) return;
    const dx = e.clientX - sx; const c = card; card = null; sx = null;
    if (dx > 90) act('swlike', {}, null); else if (dx < -90) act('swno', {}, null);
    else { c.style.transform = ''; c.style.opacity = ''; }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => { if (UI.tab === 'smaak' && UI.sw && UI.sw.step === 'swipe') { if (e.key === 'ArrowRight') act('swlike', {}, null); else if (e.key === 'ArrowLeft') act('swno', {}, null); } });
})();

/* eigen foto bij een gemaakt gerecht */
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.dataset || el.dataset.a !== 'photo' || !el.files || !el.files[0]) return;
  const rid = el.dataset.v; const f = el.files[0];
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      if (!ST.photos) ST.photos = {};
      ST.photos[rid] = cv.toDataURL('image/jpeg', 0.72); save(); render();
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(f);
});
