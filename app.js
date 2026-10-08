const KEY = 'dailytable.v1';
const APP = document.getElementById('app');
let D = null;
let PRICES = null;
let ST = null;
let TEMP = null;
const UI = { tab: 'menu', open: {}, toast: '', draft: null, copy: null, io: null, err: '' };

const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.4-9.3A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 9.4 4.8c-1.9 4.7-9.4 9.3-9.4 9.3z"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n) => (n < 10 ? '0' : '') + n;
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function defaultProfile(naam) {
  return { id: uid(), naam: naam || 'Mijn standaard', personen: 2, budget: 70, days: 5, meals: ['diner'], appliances: ['fornuis', 'oven', 'magnetron'], allergies: [], veg: false, vegan: false, halal: false, nutri: 'geen', maxTijd: null, store: 'ah', favBoost: true, vezelDoel: 30, eiwitDoel: 55 };
}

function load() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* geen opslag */ }
  return null;
}
function save() { try { recordHistory(); } catch (e) { /* geen geschiedenis */ }
  try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* geen opslag */ } }

function rebuild() { D = buildData(BASE, ST.custom); }
function activeP() {
  if (ST.activeId === 'temp' && TEMP) return TEMP;
  return ST.profiles.find((p) => p.id === ST.activeId) || ST.profiles[0];
}
function storeName(id) { const s = D.stores.find((x) => x.id === id); return s ? s.naam : id; }
const bySlot = (a, b) => (a.d - b.d) || (MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));

function newPlan() {
  const P = activeP();
  const cfg = { days: P.days, meals: P.meals.slice() };
  const g = generatePlan(D, PRICES, P, cfg, P.store, ST.favs, Math.random);
  ST.plan = { cfg, start: todayISO(), slots: g.slots, store: P.store, budgetOverride: null, have: {}, persons: P.personen, pid: P.id };
  save();
}

function reconcile() {
  const pl = ST.plan; const P = activeP();
  const keep = pl.slots.filter((s) => s.d < pl.cfg.days && pl.cfg.meals.indexOf(s.meal) >= 0);
  const add = [];
  for (let d = 0; d < pl.cfg.days; d++) {
    pl.cfg.meals.forEach((m) => { if (!keep.some((s) => s.d === d && s.meal === m)) add.push({ d, meal: m, rid: null, done: false }); });
  }
  pl.slots = keep.concat(add).sort(bySlot);
  add.forEach((a) => { const idx = pl.slots.indexOf(a); a.rid = pickForSlot(D, PRICES, P, pl, idx, pl.store); });
  pl.budgetOverride = null;
  save();
}

function calc() {
  const pl = ST.plan; const P = activeP();
  const rids = pl.slots.filter((s) => s.rid && D.rec[s.rid]).map((s) => s.rid);
  const bl = buildList(D, PRICES, pl.store, rids, pl.persons, P.halal);
  const sm = sumLines(bl.lines, pl.have);
  const budget = planBudget(P, pl);
  return { rids, bl, sm, budget };
}

function priceStatus(store) {
  const S = PRICES && PRICES.stores;
  const n = (S && S[store]) ? Object.keys(S[store]).length : 0;
  const nm = storeName(store);
  const tot = D.ingredients.filter((i) => !i.pantry && !i.cp).length;
  if (n) return nm + ': winkelprijzen van ' + (PRICES.updated || 'onbekend') + ' (bron ' + (PRICES.bron || 'onbekend') + '), ' + n + ' van ' + tot + ' ingrediënten. De rest is geschat. Acties en bonus zijn nog niet inbegrepen.';
  if (S && S.ah && Object.keys(S.ah).length) return nm + ': geschat op basis van de AH-prijzen van ' + (PRICES.updated || 'onbekend') + '.';
  return 'Prijzen zijn nu schattingen. Zodra het weekscript draait, staan hier de echte winkelprijzen.';
}

/* ---------- views ---------- */
function headerHTML() {
  const pl = ST.plan; const P = activeP();
  const opts = ST.profiles.map((p) => '<option value="' + p.id + '"' + (ST.activeId === p.id ? ' selected' : '') + '>' + esc(p.naam) + (p.id === ST.defaultId ? ' ★' : '') + '</option>').join('')
    + (TEMP ? '<option value="temp"' + (ST.activeId === 'temp' ? ' selected' : '') + '>Tijdelijk</option>' : '');
  const stores = D.stores.map((s) => '<button class="store" data-a="store" data-v="' + s.id + '" aria-pressed="' + (pl.store === s.id) + '">' + esc(s.naam) + '</button>').join('');
  const c = calc();
  const tot = c.sm.all; const over = tot > c.budget + 0.005;
  const pct = c.budget > 0 ? Math.min(100, Math.round(tot / c.budget * 100)) : 0;
  const diff = Math.abs(round2(c.budget - tot));
  const pills = [(over ? '<span class="pill warn">' + eur(diff) + ' boven budget</span>' : '<span class="pill ok">' + eur(diff) + ' onder budget</span>')];
  if (c.sm.saved > 0.004) pills.push('<span class="pill accent">' + eur(c.sm.saved) + ' bespaard met bonus</span>');
  if (P.halal && c.sm.halal > 0) pills.push('<span class="pill">waarvan ' + eur(c.sm.halal) + ' halal vlees (geschat)</span>');
  return '<header class="top"><div class="brand">' + LOGO + '<span>daily table<i>.</i></span></div>'
    + '<label class="prof"><span class="sr">Profiel</span><select data-a="profsel" aria-label="Profiel">' + opts + '</select></label></header>'
    + '<div class="stores" role="group" aria-label="Supermarkt">' + stores + '</div>'
    + '<div class="meter"><div class="meter-row"><span class="meter-big num">' + eur(tot) + '</span><span class="small num">van ' + eur(c.budget) + ' voor ' + pl.slots.filter((s) => s.rid).length + ' maaltijden, ' + pl.persons + ' pers.</span></div>'
    + '<div class="bar' + (over ? ' over' : '') + '"><span style="width:' + pct + '%"></span></div>'
    + '<div class="actions" style="margin-top:8px">' + pills.join('') + '</div></div>';
}

function tagsFor(r, P) {
  const t = [];
  if (r.own) t.push('<span class="pill accent">eigen</span>');
  if (r.vegan) t.push('<span class="pill">veganistisch</span>'); else if (r.veg) t.push('<span class="pill">vegetarisch</span>');
  if (r.v != null && r.v >= THR.v) t.push('<span class="pill">vezelrijk</span>');
  if (r.e != null && r.e >= THR.e) t.push('<span class="pill">eiwitrijk</span>');
  return t.join('');
}
function timeText(r) {
  let s = r.t + ' min';
  if (r.w) s += ' + ' + (r.w >= 60 ? Math.round(r.w / 60) + ' u' : r.w + ' min') + ' wachten';
  return s;
}
function dayLabel(i) {
  const d = new Date(ST.plan.start + 'T12:00:00'); d.setDate(d.getDate() + i);
  const today = todayISO();
  const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const txt = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  return { main: iso === today ? 'Vandaag' : txt.charAt(0).toUpperCase() + txt.slice(1), sub: iso === today ? txt : '' };
}

function slotHTML(s, idx, P, pl) {
  const r = s.rid ? D.rec[s.rid] : null;
  const head = '<span class="cap">' + MEAL_NL[s.meal] + '</span>';
  if (!r) {
    return '<div class="slot skipped"><div class="slot-head">' + head + '<div class="slot-name">Overgeslagen</div>'
      + '<div class="slot-tools"><button class="btn sm" data-a="add" data-i="' + idx + '">Toevoegen</button></div></div></div>';
  }
  const fav = ST.favs.indexOf(r.id) >= 0;
  const cost = recipeCost(D, PRICES, pl.store, r.id, pl.persons, P.halal);
  const open = !!UI.open[idx];
  let more = '';
  if (open) {
    const ings = r.items.map((x) => { const ing = D.ing[x.id]; return '<li>' + esc(ing.naam) + (ing.pantry ? '' : ' · ' + amountText(ing.unit, x.a * pl.persons)) + '</li>'; }).join('');
    const steps = r.steps.map((t) => '<li>' + esc(t) + '</li>').join('');
    const al = r.allergens.length ? '<div class="small">Bevat: ' + r.allergens.map(esc).join(', ') + '. Controleer altijd de verpakking.</div>' : '<div class="small">Geen van de bekende allergenen. Controleer altijd de verpakking.</div>';
    const halalNote = P.halal ? '<div class="small">' + (r.meat ? 'Koop het vlees halal-gecertificeerd. ' : '') + (r.stremsel ? 'Check of de kaas vegetarisch gestremd is.' : '') + '</div>' : '';
    const prompt = (s.done && !fav) ? '<div class="hint">Lekker? <button class="linkbtn" data-a="fav" data-i="' + idx + '">Zet hem bij je favorieten</button></div>' : '';
    more = '<div class="slot-more"><div><div class="cap">Ingrediënten voor ' + pl.persons + '</div><ul>' + ings + '</ul></div>'
      + '<div><div class="cap">Bereiding</div><ol>' + steps + '</ol></div>' + al + halalNote
      + '<label class="donebox"><input type="checkbox" data-a="done" data-i="' + idx + '"' + (s.done ? ' checked' : '') + '> Gemaakt</label>' + prompt + photoHTML(r, s) + '</div>';
  }
  return '<div class="slot' + (s.done ? ' done' : '') + '"><div class="slot-head">' + head
    + '<div class="nm2">' + thumbHTML(r) + '<div><button class="namebtn slot-name" data-a="open" data-i="' + idx + '" aria-expanded="' + open + '">' + esc(r.naam) + '</button>'
    + '<div class="slot-meta"><span>' + timeText(r) + '</span><span class="num">≈ ' + eur(cost) + '</span>' + (r.kcal ? '<span class="num">' + r.kcal + ' kcal p.p.</span>' : '') + '</div>'
    + '<div class="slot-meta">' + tagsFor(r, P) + '</div></div></div>'
    + '<div class="slot-tools"><button class="ic' + (fav ? ' on' : '') + '" data-a="fav" data-i="' + idx + '" aria-label="' + (fav ? 'Verwijder uit favorieten' : 'Zet bij favorieten') + '" aria-pressed="' + fav + '">' + ICON.heart + '</button>'
    + '<button class="ic" data-a="swap" data-i="' + idx + '" aria-label="Ander gerecht">' + ICON.swap + '</button>'
    + '<button class="ic" data-a="remove" data-i="' + idx + '" aria-label="Maaltijd overslaan">' + ICON.x + '</button></div></div>' + more + '</div>';
}

function photoHTML(r, s) {
  if (!s.done) return '';
  const ph = ST.photos && ST.photos[r.id];
  return '<div class="photo-row">' + (ph ? '<img alt="Jouw foto van ' + esc(r.naam) + '" src="' + esc(ph) + '"><button class="linkbtn" data-a="photodel" data-v="' + r.id + '">Foto verwijderen</button>' : '')
    + '<label class="filebtn">' + (ph ? 'Andere foto' : 'Foto van jouw versie toevoegen') + '<input type="file" accept="image/*" data-a="photo" data-v="' + r.id + '"></label></div>';
}

function diagHTML() {
  const P = activeP(); const pl = ST.plan; const out = [];
  pl.cfg.meals.forEach((m) => {
    const e = eligible(D, P, m);
    if (e.list.length === 0) {
      const worst = e.steps.slice().sort((a, b) => b.removed - a.removed)[0];
      out.push('Voor ' + MEAL_NL[m].toLowerCase() + ' blijft geen enkel recept over' + (worst && worst.removed ? '. Het strengste filter is ' + worst.name + '.' : '.') + ' Pas je profiel aan.');
    } else if (e.list.length < pl.cfg.days) {
      out.push('Voor ' + MEAL_NL[m].toLowerCase() + ' zijn er maar ' + e.list.length + ' recepten, dus je ziet herhalingen.');
    }
  });
  return out.length ? '<div class="note warn" style="margin-top:14px">' + out.map(esc).join('<br>') + '</div>' : '';
}

function menuHTML() {
  const pl = ST.plan; const P = activeP();
  const dayBtns = [1, 2, 3, 4, 5, 6, 7].map((n) => '<button class="chip" data-a="days" data-v="' + n + '" aria-pressed="' + (pl.cfg.days === n) + '">' + n + '</button>').join('');
  const mealBtns = MEALS.map((m) => '<button class="chip" data-a="mealtog" data-v="' + m + '" aria-pressed="' + (pl.cfg.meals.indexOf(m) >= 0) + '">' + MEAL_NL[m] + '</button>').join('');
  const auto = scopeBudget(P, pl.cfg.days * pl.cfg.meals.length);
  let days = '';
  for (let d = 0; d < pl.cfg.days; d++) {
    const lab = dayLabel(d);
    const rows = pl.slots.map((s, i) => ({ s, i })).filter((x) => x.s.d === d).map((x) => slotHTML(x.s, x.i, P, pl)).join('');
    days += '<section class="day"><h3>' + esc(lab.main) + '<span>' + esc(lab.sub) + '</span></h3>' + rows + '</section>';
  }
  const anyRecipe = pl.slots.some((s) => s.rid);
  return '<div class="sec"><span class="cap">Voor hoeveel dagen</span><div class="seg">' + dayBtns + '</div></div>'
    + '<div class="sec"><span class="cap">Welke maaltijden</span><div class="seg">' + mealBtns + '</div></div>'
    + '<div class="sec grid2"><div class="field"><label for="persons">Personen</label><input id="persons" type="number" min="1" max="8" value="' + pl.persons + '" data-a="persons"></div>'
    + '<div class="field"><label for="budget">Budget dit menu (€)</label><input id="budget" type="number" min="0" step="1" value="' + (pl.budgetOverride != null ? pl.budgetOverride : auto) + '" data-a="budget"></div></div>'
    + '<div class="actions sec"><button class="btn primary" data-a="new">Nieuw menu</button><button class="linkbtn" data-a="tofile">Bewaar dagen en maaltijden in dit profiel</button></div>'
    + diagHTML() + (anyRecipe ? '<div class="sec"><span class="cap">Weekoverzicht</span>' + weekGridHTML() + '</div>' + days : '<div class="empty">Er zijn geen recepten die bij dit profiel passen.</div>' + days);
}

function listHTML() {
  const pl = ST.plan; const P = activeP(); const c = calc();
  const cmp = D.stores.map((s) => {
    const rids = c.rids; const bl = buildList(D, PRICES, s.id, rids, pl.persons, P.halal); const sm = sumLines(bl.lines, pl.have);
    return '<button data-a="store" data-v="' + s.id + '" aria-pressed="' + (pl.store === s.id) + '"><span>' + esc(s.naam) + '</span><b class="num">' + eur(sm.all) + '</b></button>';
  }).join('');
  let rec = '';
  D.depts.forEach((d) => {
    const ls = c.bl.lines.filter((l) => l.ing.dept === d[0] && !l.halalMeat);
    if (!ls.length) return;
    rec += '<h4>' + esc(d[1]) + '</h4>' + ls.map(lineHTML).join('');
  });
  const hm = c.bl.lines.filter((l) => l.halalMeat);
  if (hm.length) rec += '<h4>Vlees (halal, slager of Turkse supermarkt)</h4>' + hm.map(lineHTML).join('');
  if (c.bl.pantry.length) rec += '<h4>Voorraadkast, check even</h4><div class="small" style="font-family:var(--sans)">' + c.bl.pantry.map((p) => esc(p.naam.toLowerCase())).join(', ') + '</div>';
  const text = shareText(D, pl.store, c.bl.lines, c.bl.pantry, pl.have, c.sm.all, storeName(pl.store));
  const copyFallback = UI.copy ? '<div class="sec"><span class="cap">Selecteer en kopieer</span><textarea id="copytxt" readonly>' + esc(UI.copy) + '</textarea></div>' : '';
  if (!c.bl.lines.length) return '<div class="empty">Nog geen boodschappen. Maak eerst een menu.</div>';
  return '<div class="sec" style="margin-top:14px"><span class="cap">Vergelijk winkels voor dit menu</span><div class="cmp">' + cmp + '</div><p class="small">' + esc(priceStatus(pl.store)) + '</p></div>'
    + '<div class="receipt" aria-label="Boodschappenlijst">' + rec
    + '<div class="tot"><span>Totaal ' + esc(storeName(pl.store)) + '</span><b class="num">' + eur(c.sm.all) + '</b></div></div>'
    + '<div class="actions sec"><button class="btn primary" data-a="share">Deel lijst</button><button class="btn" data-a="copy">Kopieer lijst</button></div>'
    + '<p class="small">Delen opent het deelmenu van je telefoon, daar kies je Notities of Herinneringen. Vink af wat je al in huis hebt, dan gaat het van het totaal af.</p>' + copyFallback
    + '<textarea id="sharetxt" class="sr" tabindex="-1" aria-hidden="true">' + esc(text) + '</textarea>';
}
function lineHTML(l) {
  const pl = ST.plan; const have = !!pl.have[l.id];
  const price = l.bonus ? '<span class="was num">' + eur(l.packs * l.was) + '</span><span class="num">' + eur(l.cost) + '</span>' : '<span class="num">' + eur(l.cost) + '</span>';
  const tags = (l.bonus ? '<span class="tag">bonus' + (l.mech ? ' ' + esc(l.mech) : '') + '</span>' : '') + (l.halalMeat ? '<span class="tag">halal</span>' : '');
  return '<div class="rl' + (have ? ' have' : '') + '"><input type="checkbox" data-a="have" data-v="' + l.id + '"' + (have ? ' checked' : '') + ' aria-label="Heb ik al: ' + esc(l.ing.naam) + '">'
    + '<span class="nm">' + esc(l.ing.naam) + tags + '<span class="sub">' + (l.halalMeat ? amountText(l.ing.unit, l.need) : l.packs + '× ' + amountText(l.ing.unit, l.size) + ' · nodig ' + amountText(l.ing.unit, l.need)) + (l.label ? ' · ' + esc(l.label) : '') + '</span></span>'
    + '<span class="pr">' + price + '</span></div>';
}

function favsHTML() {
  const P = activeP();
  const list = ST.favs.map((id) => D.rec[id]).filter(Boolean);
  if (!list.length) return '<div class="sec"><h2>Favorieten</h2></div><div class="empty">Nog geen favorieten. Tik op het hartje bij een recept dat je lekker vond.</div>';
  return '<div class="sec"><h2>Favorieten</h2></div><div class="list">' + list.map((r) => '<div><div class="rowflex"><div class="nm2">' + thumbHTML(r) + '<div><div class="slot-name">' + esc(r.naam) + '</div>'
    + '<div class="slot-meta"><span>' + r.meals.map((m) => MEAL_NL[m].toLowerCase()).join(', ') + '</span><span>' + timeText(r) + '</span></div><div class="slot-meta">' + tagsFor(r, P) + '</div></div></div>'
    + '<div class="slot-tools"><button class="ic on" data-a="unfav" data-v="' + r.id + '" aria-label="Verwijder uit favorieten">' + ICON.heart + '</button></div></div>'
    + '<div class="actions" style="margin-top:8px"><button class="btn sm" data-a="usefav" data-v="' + r.id + '">Gebruik in menu</button></div></div>').join('') + '</div>';
}

function optHTML(selected) {
  let h = '<option value="">Kies ingrediënt</option>';
  D.depts.forEach((d) => {
    const items = D.ingredients.filter((i) => i.dept === d[0]).sort((a, b) => a.naam.localeCompare(b.naam));
    if (!items.length) return;
    h += '<optgroup label="' + esc(d[1]) + '">' + items.map((i) => '<option value="' + i.id + '"' + (i.id === selected ? ' selected' : '') + '>' + esc(i.naam) + '</option>').join('') + '</optgroup>';
  });
  return h + '<option value="__new">+ Nieuw ingrediënt…</option>';
}
function draftHTML() {
  const d = UI.draft;
  const meals = MEALS.map((m) => '<button type="button" class="chip" data-a="dmeal" data-v="' + m + '" aria-pressed="' + (d.meals.indexOf(m) >= 0) + '">' + MEAL_NL[m] + '</button>').join('');
  const needs = D.appliances.map((a) => '<button type="button" class="chip" data-a="dneed" data-v="' + a[0] + '" aria-pressed="' + (d.needs.indexOf(a[0]) >= 0) + '">' + esc(a[1]) + '</button>').join('');
  const rows = d.items.map((it, i) => '<div class="ing-row"><select data-a="rowsel" data-i="' + i + '" aria-label="Ingrediënt">' + optHTML(it.id) + '</select>'
    + '<input type="number" min="0" step="any" placeholder="p.p." value="' + esc(it.a) + '" data-d="row" data-i="' + i + '" aria-label="Hoeveelheid per persoon">'
    + '<button type="button" class="ic" data-a="rowdel" data-i="' + i + '" aria-label="Verwijder regel">' + ICON.x + '</button></div>').join('');
  let nf = '';
  if (d.newIng) {
    const n = d.newIng;
    nf = '<div class="sub-form"><div class="cap">Nieuw ingrediënt</div>'
      + '<div class="field"><label for="ni-naam">Naam</label><input id="ni-naam" type="text" value="' + esc(n.naam) + '" data-d="ni" data-k="naam"></div>'
      + '<div class="grid2"><div class="field"><label for="ni-unit">Eenheid</label><select id="ni-unit" data-d="ni" data-k="unit">' + ['g', 'ml', 'st'].map((u) => '<option value="' + u + '"' + (n.unit === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>'
      + '<div class="field"><label for="ni-pack">Inhoud verpakking</label><input id="ni-pack" type="number" min="1" step="any" value="' + esc(n.pack) + '" data-d="ni" data-k="pack"></div></div>'
      + '<div class="grid2"><div class="field"><label for="ni-price">Prijs verpakking (€)</label><input id="ni-price" type="number" min="0" step="0.01" value="' + esc(n.price) + '" data-d="ni" data-k="price"></div>'
      + '<div class="field"><label for="ni-soort">Soort</label><select id="ni-soort" data-d="ni" data-k="soort">' + [['plant', 'Plantaardig'], ['zuivel', 'Zuivel of ei'], ['vlees', 'Vlees (kip, rund)'], ['varken', 'Varkensvlees'], ['vis', 'Vis of schaaldier']].map((o) => '<option value="' + o[0] + '"' + (n.soort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div></div>'
      + '<div><div class="lbl">Allergenen</div><div class="seg" style="margin-top:6px">' + D.allergens.map((a) => '<button type="button" class="chip" data-a="niall" data-v="' + a[0] + '" aria-pressed="' + (n.al.indexOf(a[0]) >= 0) + '">' + esc(a[1]) + '</button>').join('') + '</div></div>'
      + '<div class="actions"><button type="button" class="btn sm primary" data-a="nisave">Toevoegen</button><button type="button" class="btn sm ghost" data-a="nicancel">Annuleren</button></div></div>';
  }
  return '<div class="sec"><h3>' + (d.id ? 'Recept bewerken' : 'Nieuw recept') + '</h3></div>'
    + '<div class="sec field"><label for="d-naam">Naam</label><input id="d-naam" type="text" value="' + esc(d.naam) + '" data-d="naam"></div>'
    + '<div class="sec"><span class="cap">Maaltijd</span><div class="seg">' + meals + '</div></div>'
    + '<div class="sec grid2"><div class="field"><label for="d-t">Actieve kooktijd (min)</label><input id="d-t" type="number" min="0" value="' + esc(d.t) + '" data-d="t"></div>'
    + '<div class="field"><label for="d-w">Wachttijd (min)</label><input id="d-w" type="number" min="0" value="' + esc(d.w) + '" data-d="w"></div></div>'
    + '<div class="sec"><span class="cap">Apparaten die je nodig hebt</span><div class="seg">' + needs + '</div></div>'
    + '<div class="sec"><span class="cap">Ingrediënten per persoon</span>' + rows + '<button type="button" class="btn sm ghost" data-a="rowadd">Regel toevoegen</button>' + nf + '</div>'
    + '<div class="sec grid2"><div class="field"><label for="d-v">Vezels p.p. (g, optioneel)</label><input id="d-v" type="number" min="0" value="' + esc(d.v) + '" data-d="v"></div>'
    + '<div class="field"><label for="d-e">Eiwit p.p. (g, optioneel)</label><input id="d-e" type="number" min="0" value="' + esc(d.e) + '" data-d="e"></div></div>'
    + '<div class="sec field"><label for="d-steps">Bereiding, één stap per regel</label><textarea id="d-steps" data-d="steps">' + esc(d.steps) + '</textarea></div>'
    + (UI.err ? '<div class="note warn" style="margin-top:12px">' + esc(UI.err) + '</div>' : '')
    + '<div class="actions sec"><button class="btn primary" data-a="rsave">Opslaan</button><button class="btn ghost" data-a="rcancel">Annuleren</button></div>';
}
function recipesHTML() {
  if (UI.draft) return draftHTML();
  const own = D.recipes.filter((r) => r.own);
  const list = own.length ? '<div class="list">' + own.map((r) => '<div><div class="rowflex"><div><div class="slot-name">' + esc(r.naam) + '</div><div class="slot-meta"><span>' + r.meals.map((m) => MEAL_NL[m].toLowerCase()).join(', ') + '</span><span>' + timeText(r) + '</span></div></div>'
    + '<div class="actions"><button class="btn sm ghost" data-a="redit" data-v="' + r.id + '">Bewerk</button><button class="btn sm ghost" data-a="rdel" data-v="' + r.id + '">Verwijder</button></div></div></div>').join('') + '</div>'
    : '<div class="empty">Je eigen recepten komen hier te staan.</div>';
  return '<div class="sec" style="margin-top:28px"><h2>Eigen recepten</h2></div><div class="actions sec"><button class="btn primary" data-a="rnew">Nieuw recept</button></div>' + list
    + '<p class="small">Je eigen recepten doen mee bij het maken van een menu, net als de andere recepten. Prijzen van eigen ingrediënten stel je zelf in.</p>';
}

function chips(field, arr, items) {
  return '<div class="seg">' + items.map((a) => '<button class="chip" data-a="ptog" data-f="' + field + '" data-v="' + a[0] + '" aria-pressed="' + (arr.indexOf(a[0]) >= 0) + '">' + esc(a[1]) + '</button>').join('') + '</div>';
}
function bool(field, label, on) { return '<button class="chip" data-a="pbool" data-f="' + field + '" aria-pressed="' + !!on + '">' + label + '</button>'; }
function profielHTML() {
  const P = activeP(); const isTemp = ST.activeId === 'temp';
  const names = ST.profiles.map((p) => '<button class="chip" data-a="pick" data-v="' + p.id + '" aria-pressed="' + (ST.activeId === p.id) + '">' + esc(p.naam) + (p.id === ST.defaultId ? ' ★' : '') + '</button>').join('')
    + (TEMP ? '<button class="chip" data-a="pick" data-v="temp" aria-pressed="' + isTemp + '">Tijdelijk</button>' : '');
  const full = ST.profiles.length >= MAX_PROFILES;
  const nutri = [['geen', 'Geen voorkeur'], ['vezel', 'Vezelrijk'], ['eiwit', 'Eiwitrijk'], ['beide', 'Beide']].map((o) => '<button class="chip" data-a="nutri" data-v="' + o[0] + '" aria-pressed="' + (P.nutri === o[0]) + '">' + o[1] + '</button>').join('');
  const tijd = [['', 'Geen limiet'], ['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min']].map((o) => '<option value="' + o[0] + '"' + (String(P.maxTijd || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
  const stores = D.stores.map((s) => '<option value="' + s.id + '"' + (P.store === s.id ? ' selected' : '') + '>' + esc(s.volledig) + '</option>').join('');
  const days = [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (P.days === n ? ' selected' : '') + '>' + n + '</option>').join('');
  const io = UI.io ? '<div class="sec"><span class="cap">Back-up</span><textarea id="iotxt">' + esc(UI.io.text) + '</textarea><div class="actions" style="margin-top:8px"><button class="btn sm" data-a="ioapply">Importeer wat hierin staat</button><button class="btn sm ghost" data-a="ioclose">Sluiten</button></div>' + (UI.io.msg ? '<p class="small">' + esc(UI.io.msg) + '</p>' : '') + '</div>' : '';
  return '<div class="sec"><h2>Profielen</h2><p class="small">Een profiel bewaart al je instellingen. Je kunt er ' + MAX_PROFILES + ' opslaan en daarnaast één tijdelijk profiel gebruiken dat niet bewaard blijft. Een ander profiel kiezen maakt meteen een nieuw menu.</p><div class="seg" style="margin-top:10px">' + names + '</div></div>'
    + '<div class="actions sec"><button class="btn sm" data-a="padd"' + (full ? ' disabled' : '') + '>Nieuw profiel</button><button class="btn sm ghost" data-a="ptemp">Tijdelijk profiel</button>'
    + (isTemp ? '<button class="btn sm ghost" data-a="pkeep"' + (full ? ' disabled' : '') + '>Bewaar als profiel</button>' : '<button class="btn sm ghost" data-a="pdefault"' + (P.id === ST.defaultId ? ' disabled' : '') + '>Maak standaard</button><button class="btn sm ghost" data-a="pdel"' + (ST.profiles.length < 2 ? ' disabled' : '') + '>Verwijder</button>') + '</div>'
    + (isTemp ? '<div class="note" style="margin-top:12px">Dit profiel wordt niet opgeslagen en verdwijnt als je de app sluit.</div>' : '')
    + (full ? '<p class="small">Je hebt het maximum van ' + MAX_PROFILES + ' profielen bereikt.</p>' : '')
    + '<div class="sec"><span class="cap">Naam</span><input id="p-naam" type="text" value="' + esc(P.naam) + '" data-a="pfield" data-f="naam" aria-label="Naam van het profiel"></div>'
    + '<div class="sec grid2"><div class="field"><label for="p-pers">Personen</label><input id="p-pers" type="number" min="1" max="8" value="' + P.personen + '" data-a="pfield" data-f="personen"></div>'
    + '<div class="field"><label for="p-bud">Budget voor je standaardmenu (€)</label><input id="p-bud" type="number" min="0" value="' + P.budget + '" data-a="pfield" data-f="budget"></div></div>'
    + '<div class="sec grid2"><div class="field"><label for="p-days">Standaard aantal dagen</label><select id="p-days" data-a="pfield" data-f="days">' + days + '</select></div>'
    + '<div class="field"><label for="p-store">Standaardwinkel</label><select id="p-store" data-a="pfield" data-f="store">' + stores + '</select></div></div>'
    + '<div class="sec"><span class="cap">Maaltijden</span>' + chips('meals', P.meals, MEALS.map((m) => [m, MEAL_NL[m]])) + '</div>'
    + '<div class="sec"><span class="cap">Keukenapparaten</span>' + chips('appliances', P.appliances, D.appliances) + '</div>'
    + '<div class="sec"><span class="cap">Allergieën</span>' + chips('allergies', P.allergies, D.allergens) + '</div>'
    + '<div class="sec"><span class="cap">Dieet</span><div class="seg">' + bool('veg', 'Vegetarisch', P.veg) + bool('vegan', 'Veganistisch', P.vegan) + bool('halal', 'Halal', P.halal) + '</div></div>'
    + '<div class="sec"><span class="cap">Voeding</span><div class="seg">' + nutri + '</div><p class="small">Vezelrijk is minimaal ' + THR.v + ' g en eiwitrijk minimaal ' + THR.e + ' g per portie. De waarden zijn schattingen.</p></div>'
    + '<div class="sec grid2"><div class="field"><label for="p-vd">Vezeldoel per dag (g)</label><input id="p-vd" type="number" min="0" value="' + (P.vezelDoel || 30) + '" data-a="pfield" data-f="vezelDoel"></div>'
    + '<div class="field"><label for="p-ed">Eiwitdoel per dag (g)</label><input id="p-ed" type="number" min="0" value="' + (P.eiwitDoel || 55) + '" data-a="pfield" data-f="eiwitDoel"></div></div>'
    + '<div class="sec field"><label for="p-tijd">Maximale kooktijd per maaltijd</label><select id="p-tijd" data-a="pfield" data-f="maxTijd">' + tijd + '</select></div>'
    + tasteSummaryHTML()
    + '<div class="sec"><span class="cap">Favorieten</span><div class="seg">' + bool('favBoost', 'Favorieten vaker meenemen', P.favBoost) + '</div></div>'
    + '<div class="actions sec"><button class="btn primary" data-a="new">Maak nieuw menu met dit profiel</button></div>'
    + '<div class="actions sec"><button class="btn sm ghost" data-a="export">Exporteer back-up</button><button class="btn sm ghost" data-a="import">Importeer back-up</button></div>' + io
    + '<p class="small" style="margin-top:20px">Je profielen, favorieten en eigen recepten staan alleen op dit apparaat. Met een back-up neem je ze mee naar een ander apparaat.</p>';
}

function render() {
  if (!D || !ST) return;
  let body = '';
  const t = UI.tab;
  if (t === 'smaak') { APP.innerHTML = '<header class="top"><div class="brand">' + LOGO + '<span>daily table<i>.</i></span></div></header><main>' + tasteHTML() + '</main>'; return; }
  if (t === 'menu') body = menuHTML();
  else if (t === 'lijst') body = listHTML();
  else if (t === 'inzicht') body = inzichtHTML();
  else if (t === 'recepten') body = UI.draft ? recipesHTML() : favsHTML() + recipesHTML();
  else body = profielHTML();
  const tabs = [['menu', 'Menu'], ['lijst', 'Lijst'], ['inzicht', 'Inzicht'], ['recepten', 'Recepten'], ['profiel', 'Profiel']]
    .map((x) => '<button class="tab" role="tab" data-a="tab" data-v="' + x[0] + '" aria-selected="' + (t === x[0]) + '">' + x[1] + '</button>').join('');
  APP.innerHTML = headerHTML() + '<main>' + body + '</main><nav class="tabs" role="tablist" aria-label="Onderdelen"><div class="tabs-in">' + tabs + '</div></nav>' + (UI.toast ? '<div class="toast" role="status">' + esc(UI.toast) + '</div>' : '');
}

function toast(msg) { UI.toast = msg; render(); setTimeout(() => { UI.toast = ''; render(); }, 1800); }

/* ---------- acties ---------- */
function updP(fn) { fn(activeP()); if (ST.activeId !== 'temp') save(); render(); }
function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

async function doCopy(text) {
  try { await navigator.clipboard.writeText(text); UI.copy = null; toast('Lijst gekopieerd'); } catch (e) { UI.copy = text; render(); }
}
async function doShare(text) {
  if (navigator.share) {
    try { await navigator.share({ title: 'Boodschappen', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  doCopy(text);
}
function listText() { const c = calc(); const pl = ST.plan; return shareText(D, pl.store, c.bl.lines, c.bl.pantry, pl.have, c.sm.all, storeName(pl.store)); }

function newDraft(r) {
  if (r) return { id: r.id, naam: r.naam, meals: r.meals.slice(), t: r.t, w: r.w || 0, needs: r.needs.slice(), items: r.ing.map((x) => ({ id: x[0], a: x[1] })), steps: r.steps.join('\n'), v: r.v == null ? '' : r.v, e: r.e == null ? '' : r.e, newIng: null, row: null };
  return { id: null, naam: '', meals: ['diner'], t: 20, w: 0, needs: ['fornuis'], items: [{ id: '', a: '' }], steps: '', v: '', e: '', newIng: null, row: null };
}
const SOORT = { plant: [], zuivel: ['animal'], vlees: ['meat', 'animal'], varken: ['meat', 'animal', 'pork'], vis: ['fish', 'animal'] };

function saveDraft() {
  const d = UI.draft;
  const items = d.items.filter((x) => x.id && x.id !== '__new' && parseFloat(x.a) > 0);
  if (!d.naam.trim()) { UI.err = 'Geef het recept een naam.'; return render(); }
  if (!d.meals.length) { UI.err = 'Kies minstens één maaltijd.'; return render(); }
  if (!items.length) { UI.err = 'Voeg minstens één ingrediënt met een hoeveelheid toe.'; return render(); }
  const rec = { id: d.id || 'own-' + uid(), naam: d.naam.trim(), meals: d.meals.slice(), t: parseInt(d.t, 10) || 0, w: parseInt(d.w, 10) || 0, needs: d.needs.slice(), cat: 'eigen', ing: items.map((x) => [x.id, parseFloat(x.a)]), v: d.v === '' ? null : parseFloat(d.v), e: d.e === '' ? null : parseFloat(d.e), kcal: null, steps: d.steps.split('\n').map((s) => s.trim()).filter(Boolean) };
  const i = ST.custom.recipes.findIndex((r) => r.id === rec.id);
  if (i >= 0) ST.custom.recipes[i] = rec; else ST.custom.recipes.push(rec);
  rebuild(); save(); UI.draft = null; UI.err = '';
  toast('Recept opgeslagen');
}

function act(a, ds, el) {
  if (tasteAct(a, ds)) return;
  const pl = ST.plan; const P = activeP(); const i = ds.i != null ? parseInt(ds.i, 10) : null;
  switch (a) {
    case 'tab': UI.tab = ds.v; UI.copy = null; render(); window.scrollTo(0, 0); break;
    case 'store': pl.store = ds.v; save(); render(); break;
    case 'days': pl.cfg.days = parseInt(ds.v, 10); reconcile(); render(); break;
    case 'mealtog': {
      const m = ds.v; const on = pl.cfg.meals.indexOf(m) >= 0;
      if (on && pl.cfg.meals.length === 1) { toast('Kies minstens één maaltijd'); break; }
      if (on) pl.cfg.meals.splice(pl.cfg.meals.indexOf(m), 1); else pl.cfg.meals.push(m);
      pl.cfg.meals.sort((x, y) => MEALS.indexOf(x) - MEALS.indexOf(y));
      reconcile(); render(); break;
    }
    case 'new': newPlan(); UI.open = {}; UI.tab = 'menu'; render(); window.scrollTo(0, 0); break;
    case 'tofile': updP((p) => { p.days = pl.cfg.days; p.meals = pl.cfg.meals.slice(); }); toast('Opgeslagen in profiel'); break;
    case 'swap': { const rid = pickForSlot(D, PRICES, P, pl, i, pl.store, Math.random); if (rid) { pl.slots[i].rid = rid; pl.slots[i].done = false; save(); render(); } else toast('Geen ander recept beschikbaar'); break; }
    case 'remove': pl.slots[i].rid = null; pl.slots[i].done = false; save(); render(); break;
    case 'add': { const rid = pickForSlot(D, PRICES, P, pl, i, pl.store, Math.random); if (rid) { pl.slots[i].rid = rid; save(); render(); } else toast('Geen recept beschikbaar'); break; }
    case 'open': UI.open[i] = !UI.open[i]; render(); break;
    case 'done': pl.slots[i].done = el.checked; save(); render(); break;
    case 'fav': { const rid = pl.slots[i].rid; toggle(ST.favs, rid); save(); render(); break; }
    case 'unfav': toggle(ST.favs, ds.v); save(); render(); break;
    case 'usefav': {
      const r = D.rec[ds.v]; const m = r.meals.find((x) => pl.cfg.meals.indexOf(x) >= 0);
      if (!m) { toast('Zet eerst ' + MEAL_NL[r.meals[0]].toLowerCase() + ' aan in je menu'); break; }
      let idx = pl.slots.findIndex((s) => s.meal === m && !s.rid);
      if (idx < 0) idx = pl.slots.findIndex((s) => s.meal === m);
      pl.slots[idx].rid = r.id; pl.slots[idx].done = false; save(); UI.tab = 'menu'; render(); toast('Toegevoegd aan je menu'); break;
    }
    case 'have': if (el.checked) pl.have[ds.v] = true; else delete pl.have[ds.v]; save(); render(); break;
    case 'copy': doCopy(listText()); break;
    case 'share': doShare(listText()); break;
    case 'pick': ST.activeId = ds.v; if (ds.v !== 'temp') save(); newPlan(); render(); break;
    case 'padd': {
      if (ST.profiles.length >= MAX_PROFILES) break;
      const np = Object.assign({}, JSON.parse(JSON.stringify(P)), { id: uid(), naam: 'Profiel ' + (ST.profiles.length + 1) });
      ST.profiles.push(np); ST.activeId = np.id; save(); newPlan(); render(); break;
    }
    case 'ptemp': {
      const def = ST.profiles.find((p) => p.id === ST.defaultId) || ST.profiles[0];
      TEMP = Object.assign({}, JSON.parse(JSON.stringify(def)), { id: 'temp', naam: 'Tijdelijk' }); ST.activeId = 'temp'; newPlan(); render(); break;
    }
    case 'pkeep': {
      if (ST.profiles.length >= MAX_PROFILES) break;
      const np = Object.assign({}, JSON.parse(JSON.stringify(TEMP)), { id: uid(), naam: 'Profiel ' + (ST.profiles.length + 1) });
      ST.profiles.push(np); TEMP = null; ST.activeId = np.id; ST.plan.pid = np.id; save(); render(); break;
    }
    case 'pdefault': ST.defaultId = P.id; save(); render(); break;
    case 'pdel': {
      if (ST.profiles.length < 2) break;
      ST.profiles = ST.profiles.filter((p) => p.id !== P.id);
      if (ST.defaultId === P.id) ST.defaultId = ST.profiles[0].id;
      ST.activeId = ST.defaultId; save(); newPlan(); render(); break;
    }
    case 'ptog': updP((p) => { if (ds.f === 'meals' && p.meals.length === 1 && p.meals[0] === ds.v) return; toggle(p[ds.f], ds.v); if (ds.f === 'meals') p.meals.sort((x, y) => MEALS.indexOf(x) - MEALS.indexOf(y)); }); break;
    case 'pbool': updP((p) => { p[ds.f] = !p[ds.f]; if (ds.f === 'vegan' && p.vegan) p.veg = true; }); break;
    case 'nutri': updP((p) => { p.nutri = ds.v; }); break;
    case 'export': UI.io = { text: JSON.stringify({ v: 1, profiles: ST.profiles, defaultId: ST.defaultId, favs: ST.favs, custom: ST.custom }), msg: 'Kopieer deze tekst en bewaar hem ergens veilig.' }; render(); break;
    case 'import': UI.io = { text: '', msg: 'Plak hier je back-up en kies importeren.' }; render(); break;
    case 'ioclose': UI.io = null; render(); break;
    case 'ioapply': {
      try {
        const j = JSON.parse(document.getElementById('iotxt').value);
        if (!j || !Array.isArray(j.profiles) || !j.profiles.length) throw new Error('profielen ontbreken');
        ST.profiles = j.profiles.slice(0, MAX_PROFILES); ST.defaultId = j.defaultId || ST.profiles[0].id; ST.favs = j.favs || [];
        ST.custom = j.custom || { ingredients: [], recipes: [] }; ST.activeId = ST.defaultId; TEMP = null;
        rebuild(); newPlan(); UI.io = null; toast('Back-up geïmporteerd');
      } catch (e) { UI.io.msg = 'Dit lijkt geen geldige back-up: ' + e.message; render(); }
      break;
    }
    case 'rnew': UI.draft = newDraft(null); UI.err = ''; render(); break;
    case 'redit': UI.draft = newDraft(D.rec[ds.v]); UI.err = ''; render(); break;
    case 'rdel': {
      ST.custom.recipes = ST.custom.recipes.filter((r) => r.id !== ds.v); ST.favs = ST.favs.filter((f) => f !== ds.v);
      rebuild(); ST.plan.slots.forEach((s) => { if (s.rid === ds.v) s.rid = null; }); save(); render(); break;
    }
    case 'rcancel': UI.draft = null; UI.err = ''; render(); break;
    case 'rsave': saveDraft(); break;
    case 'dmeal': toggle(UI.draft.meals, ds.v); render(); break;
    case 'dneed': toggle(UI.draft.needs, ds.v); render(); break;
    case 'rowadd': UI.draft.items.push({ id: '', a: '' }); render(); break;
    case 'rowdel': UI.draft.items.splice(i, 1); if (!UI.draft.items.length) UI.draft.items.push({ id: '', a: '' }); render(); break;
    case 'niall': toggle(UI.draft.newIng.al, ds.v); render(); break;
    case 'nicancel': { const d = UI.draft; if (d.row != null && d.items[d.row] && d.items[d.row].id === '__new') d.items[d.row].id = ''; d.newIng = null; render(); break; }
    case 'nisave': {
      const d = UI.draft; const n = d.newIng; const pack = parseFloat(n.pack); const price = parseFloat(n.price);
      if (!n.naam.trim() || !(pack > 0) || !(price >= 0)) { UI.err = 'Vul naam, inhoud en prijs van het ingrediënt in.'; render(); break; }
      const ing = { id: 'c-' + uid(), naam: n.naam.trim(), unit: n.unit, pack, price, cp: price, dept: 'overig', fl: SOORT[n.soort].slice(), al: n.al.slice(), q: n.naam.toLowerCase(), custom: true };
      ST.custom.ingredients.push(ing); rebuild(); save();
      if (d.row != null && d.items[d.row]) d.items[d.row].id = ing.id;
      d.newIng = null; UI.err = ''; render(); break;
    }
    default: break;
  }
}

APP.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a], [data-a="open"]');
  if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  act(b.dataset.a, b.dataset, b);
});

APP.addEventListener('change', (e) => {
  const el = e.target; const ds = el.dataset;
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && ds.a) { act(ds.a, ds, el); return; }
  const pl = ST.plan;
  if (ds.a === 'profsel') { ST.activeId = el.value; if (el.value !== 'temp') save(); newPlan(); render(); return; }
  if (ds.a === 'persons') { pl.persons = Math.min(8, Math.max(1, parseInt(el.value, 10) || 1)); save(); render(); return; }
  if (ds.a === 'budget') { const v = parseFloat(el.value); pl.budgetOverride = isNaN(v) ? null : v; save(); render(); return; }
  if (ds.a === 'pfield') {
    updP((p) => {
      const f = ds.f; let v = el.value;
      if (f === 'personen') v = Math.min(8, Math.max(1, parseInt(v, 10) || 1));
      else if (f === 'budget') v = Math.max(0, parseFloat(v) || 0);
      else if (f === 'vezelDoel' || f === 'eiwitDoel') v = Math.max(0, parseInt(v, 10) || 0);
      else if (f === 'days') v = parseInt(v, 10);
      else if (f === 'maxTijd') v = v ? parseInt(v, 10) : null;
      else if (f === 'naam') v = v.trim() || 'Profiel';
      p[f] = v;
    });
    return;
  }
  if (ds.a === 'rowsel') {
    const d = UI.draft; const idx = parseInt(ds.i, 10);
    d.items[idx].id = el.value;
    if (el.value === '__new') { d.row = idx; d.newIng = { naam: '', unit: 'g', pack: '', price: '', soort: 'plant', al: [] }; }
    render(); return;
  }
  if (ds.d && UI.draft) draftInput(el);
});
APP.addEventListener('input', (e) => { if (e.target.dataset.d && UI.draft) draftInput(e.target); });
function draftInput(el) {
  const d = UI.draft; const k = el.dataset.d;
  if (k === 'row') d.items[parseInt(el.dataset.i, 10)].a = el.value;
  else if (k === 'ni') d.newIng[el.dataset.k] = el.value;
  else d[k] = el.value;
}

/* ---------- start ---------- */
async function loadPrices() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch('prijzen.json', { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (r.ok) { const j = await r.json(); if (j && j.stores) return j; }
  } catch (e) { /* geen prijzenbestand */ }
  return (typeof EMBED !== 'undefined' && EMBED && EMBED.stores && EMBED.updated) ? EMBED : null;
}

(async function start() {
  document.documentElement.style.setProperty('--logo', 'url(' + LOGO_URL + ')'); document.documentElement.style.setProperty('--lr', LOGO_RATIO);
  PRICES = await loadPrices();
  ST = load();
  if (!ST || !Array.isArray(ST.profiles) || !ST.profiles.length) {
    const p = defaultProfile();
    ST = { profiles: [p], defaultId: p.id, activeId: p.id, favs: [], custom: { ingredients: [], recipes: [] }, plan: null };
  }
  if (!ST.custom) ST.custom = { ingredients: [], recipes: [] };
  if (!ST.favs) ST.favs = [];
  if (!ST.photos) ST.photos = {};
  if (!ST.taste) ST.taste = { done: false, liked: [], disliked: [], never: [], nopeIng: [] };
  ST.activeId = ST.defaultId;
  rebuild();
  applyTaste();
  const pl = ST.plan;
  const ok = pl && pl.cfg && Array.isArray(pl.slots) && pl.slots.length && pl.slots.every((s) => !s.rid || D.rec[s.rid]) && D.stores.some((s) => s.id === pl.store);
  if (ok) { if (ST.profiles.some((p) => p.id === pl.pid)) ST.activeId = pl.pid; if (!pl.have) pl.have = {}; } else newPlan();
  if (!ST.taste.done && !ST.profiles.some((p) => p.touched)) startTaste();
  render();
})();
