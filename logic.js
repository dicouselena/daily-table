const MEALS = ['ontbijt', 'lunch', 'diner'];
const MEAL_NL = { ontbijt: 'Ontbijt', lunch: 'Lunch', diner: 'Diner' };
const THR = { v: 8, e: 25 };
const HALAL_FACTOR = 1.1;
const MAX_PROFILES = 5;
const UNIT_NL = { g: 'g', ml: 'ml', st: 'st', sn: 'sneden', teen: 'tenen' };

const round2 = (x) => Math.round(x * 100) / 100;

function buildData(base, custom) {
  const D = { stores: base.stores, appliances: base.appliances, allergens: base.allergens, depts: base.depts };
  D.ingredients = base.ingredients.concat((custom && custom.ingredients) || []);
  D.ing = {};
  D.ingredients.forEach((i) => { D.ing[i.id] = i; });
  const own = ((custom && custom.recipes) || []).map((r) => Object.assign({ own: true }, r));
  D.recipes = base.recipes.map((r) => Object.assign({}, r)).concat(own).filter((r) => r.ing.every((x) => D.ing[x[0]]));
  D.rec = {};
  D.recipes.forEach((r) => { prepRecipe(D, r); D.rec[r.id] = r; });
  return D;
}

function prepRecipe(D, r) {
  r.items = r.ing.map((x) => ({ id: x[0], a: x[1] }));
  const ings = r.items.map((x) => D.ing[x.id]);
  const has = (f) => ings.some((i) => i.fl.indexOf(f) >= 0);
  r.allergens = [];
  ings.forEach((i) => i.al.forEach((a) => { if (r.allergens.indexOf(a) < 0) r.allergens.push(a); }));
  r.meat = has('meat'); r.fish = has('fish'); r.animal = has('animal'); r.pork = has('pork'); r.stremsel = has('stremsel');
  r.veg = !r.meat && !r.fish;
  r.vegan = !r.animal;
}

function eligible(D, P, meal) {
  let list = D.recipes.filter((r) => r.meals.indexOf(meal) >= 0);
  const steps = [];
  const f = (name, fn) => { const b = list.length; list = list.filter(fn); steps.push({ name, removed: b - list.length }); };
  f('smaak', (r) => TASTE.never.indexOf(r.id) < 0 && !r.items.some((x) => TASTE.nopeIng.indexOf(x.id) >= 0));
  f('apparatuur', (r) => r.needs.every((g) => g.split('|').some((a) => P.appliances.indexOf(a) >= 0)));
  f('allergieën', (r) => !r.allergens.some((a) => P.allergies.indexOf(a) >= 0));
  if (P.vegan) f('veganistisch', (r) => r.vegan); else if (P.veg) f('vegetarisch', (r) => r.veg);
  if (P.halal) f('halal', (r) => !r.pork);
  if (P.maxTijd) f('kooktijd', (r) => r.t <= P.maxTijd);
  if (P.nutri === 'vezel') f('vezelrijk', (r) => r.v != null && r.v >= THR.v);
  if (P.nutri === 'eiwit') f('eiwitrijk', (r) => r.e != null && r.e >= THR.e);
  if (P.nutri === 'beide') f('vezel- en eiwitrijk', (r) => r.v != null && r.e != null && r.v >= THR.v && r.e >= THR.e);
  return { list, steps };
}

function priceOf(D, prices, store, id) {
  const ing = D.ing[id];
  if (ing.cp != null) return { price: ing.cp, bonus: null, size: ing.pack, src: 'eigen' };
  const S = prices && prices.stores;
  const live = S && S[store] && S[store][id];
  if (live && typeof live.price === 'number') {
    const b = (typeof live.bonus === 'number' && live.bonus < live.price) ? live.bonus : null;
    return { price: live.price, bonus: b, size: live.size || ing.pack, src: 'live', label: live.label || null, mech: live.mech || null };
  }
  const st = D.stores.find((s) => s.id === store);
  const f = st ? st.factor : 1;
  const ah = S && S.ah && S.ah[id];
  const base = (ah && typeof ah.price === 'number') ? { price: ah.price, size: ah.size || ing.pack } : { price: ing.price, size: ing.pack };
  return { price: round2(base.price * f), bonus: null, size: base.size, src: 'schatting' };
}

function buildList(D, prices, store, rids, persons, halal) {
  const need = {};
  rids.forEach((rid) => {
    const r = D.rec[rid];
    if (!r) return;
    r.items.forEach((x) => { need[x.id] = (need[x.id] || 0) + x.a * persons; });
  });
  const lines = []; const pantry = [];
  Object.keys(need).forEach((id) => {
    const ing = D.ing[id];
    if (ing.pantry) { pantry.push(ing); return; }
    const p = priceOf(D, prices, store, id);
    const packs = Math.max(1, Math.ceil(need[id] / p.size - 1e-9));
    let unit = p.bonus != null ? p.bonus : p.price;
    let was = p.price; let src = p.src;
    const hm = !!(halal && ing.fl.indexOf('meat') >= 0);
    if (hm) { unit *= HALAL_FACTOR; was *= HALAL_FACTOR; src = 'schatting'; }
    lines.push({ id, ing, need: need[id], packs, size: p.size, unit: round2(unit), was: round2(was), bonus: p.bonus != null, cost: round2(packs * unit), saved: round2(packs * (was - unit)), src, label: p.label, mech: p.mech, halalMeat: hm });
  });
  pantry.sort((a, b) => a.naam.localeCompare(b.naam));
  return { lines, pantry };
}

function sumLines(lines, have) {
  let t = 0; let h = 0; let s = 0;
  lines.forEach((l) => {
    if (have && have[l.id]) return;
    if (l.halalMeat) h += l.cost; else t += l.cost;
    s += l.saved;
  });
  return { total: round2(t), halal: round2(h), saved: round2(s), all: round2(t + h) };
}

function recipeCost(D, prices, store, rid, persons, halal) {
  const r = D.rec[rid];
  if (!r) return 0;
  let c = 0;
  r.items.forEach((x) => {
    const ing = D.ing[x.id];
    if (ing.pantry) return;
    const p = priceOf(D, prices, store, x.id);
    let u = p.bonus != null ? p.bonus : p.price;
    if (halal && ing.fl.indexOf('meat') >= 0) u *= HALAL_FACTOR;
    c += (x.a * persons / p.size) * u;
  });
  return round2(c);
}

function scopeBudget(P, slotCount) {
  // P.budget geldt voor het standaardmenu van het profiel (P.days dagen x P.meals maaltijden)
  const per = Math.max(1, (P.days || 5) * Math.max(1, P.meals.length));
  return round2(P.budget * slotCount / per);
}

let TASTE = { liked: [], disliked: [], never: [], nopeIng: [] };
let CATW = {};
function setTaste(t, D) {
  TASTE = { liked: (t && t.liked) || [], disliked: (t && t.disliked) || [], never: (t && t.never) || [], nopeIng: (t && t.nopeIng) || [] };
  CATW = {};
  TASTE.liked.forEach((id) => { const r = D && D.rec[id]; if (r) CATW[r.cat] = (CATW[r.cat] || 0) + 1; });
  TASTE.disliked.forEach((id) => { const r = D && D.rec[id]; if (r) CATW[r.cat] = (CATW[r.cat] || 0) - 1; });
}
function tasteWeight(r) {
  let w = Math.pow(0.85, Math.max(-3, Math.min(3, CATW[r.cat] || 0)));
  if (TASTE.liked.indexOf(r.id) >= 0) w *= 0.45;
  if (TASTE.disliked.indexOf(r.id) >= 0) w *= 3;
  return w;
}

function shuffleWeighted(list, rng, favs, boost) {
  return list.map((r) => ({ r, k: rng() * ((boost && favs.indexOf(r.id) >= 0) ? 0.4 : 1) * tasteWeight(r) }))
    .sort((a, b) => a.k - b.k).map((x) => x.r);
}

function planCost(D, prices, store, slots, P, have) {
  const rids = slots.filter((s) => s.rid).map((s) => s.rid);
  const bl = buildList(D, prices, store, rids, P.personen, P.halal);
  return sumLines(bl.lines, have);
}

function scorePlan(D, prices, store, slots, P, budget, rng) {
  const sm = planCost(D, prices, store, slots, P);
  let score = sm.all <= budget ? 1000 - sm.all * 0.15 : 1000 - (sm.all - budget) * 40;
  MEALS.forEach((m) => {
    const c = {}; let n = 0;
    slots.filter((s) => s.meal === m && s.rid && D.rec[s.rid]).forEach((s) => { const k = D.rec[s.rid].cat; c[k] = (c[k] || 0) + 1; n++; });
    const lim = Math.max(2, Math.ceil(n / 3));
    Object.keys(c).forEach((k) => { if (c[k] > lim) score -= 25 * (c[k] - lim); });
    score += Object.keys(c).length * 12;
  });
  score += sm.saved * 6 + rng() * 8;
  return { score, total: sm.all };
}

function generatePlan(D, prices, P, cfg, store, favs, rng) {
  rng = rng || Math.random;
  const elig = {}; const diag = {};
  cfg.meals.forEach((m) => { const e = eligible(D, P, m); elig[m] = e.list; diag[m] = e.steps; });
  const days = cfg.days;
  const slotCount = days * cfg.meals.length;
  const budget = scopeBudget(P, slotCount);
  let best = null;
  for (let t = 0; t < 300; t++) {
    const per = {};
    cfg.meals.forEach((m) => {
      const pool = shuffleWeighted(elig[m], rng, favs, P.favBoost);
      per[m] = [];
      for (let d = 0; d < days; d++) per[m].push(pool.length ? pool[d % pool.length].id : null);
    });
    const slots = [];
    for (let d = 0; d < days; d++) cfg.meals.forEach((m) => slots.push({ d, meal: m, rid: per[m][d], done: false }));
    const sc = scorePlan(D, prices, store, slots, P, budget, rng);
    if (!best || sc.score > best.score) best = { slots, score: sc.score };
  }
  return { slots: best.slots, diag, budget };
}

function pickForSlot(D, prices, P, plan, idx, store, rng) {
  rng = rng || Math.random;
  const slot = plan.slots[idx];
  const e = eligible(D, P, slot.meal).list;
  const usedSame = plan.slots.filter((s, i) => s.meal === slot.meal && i !== idx && s.rid).map((s) => s.rid);
  let cands = e.filter((r) => usedSame.indexOf(r.id) < 0 && r.id !== slot.rid);
  if (!cands.length) cands = e.filter((r) => r.id !== slot.rid);
  if (!cands.length) cands = e;
  if (!cands.length) return null;
  const budget = planBudget(P, plan);
  const scored = cands.map((r) => {
    const slots = plan.slots.map((s, i) => (i === idx ? Object.assign({}, s, { rid: r.id }) : s));
    return { r, total: planCost(D, prices, store, slots, P).all };
  });
  const ok = scored.filter((x) => x.total <= budget);
  if (ok.length) return ok[Math.floor(rng() * ok.length)].r.id;
  scored.sort((a, b) => a.total - b.total);
  return scored[0].r.id;
}

function planBudget(P, plan) {
  if (plan.budgetOverride != null) return plan.budgetOverride;
  return scopeBudget(P, plan.cfg.days * plan.cfg.meals.length);
}

/* ---------- formatting ---------- */
function fmtNum(n) { return String(n).replace('.', ','); }
function amountText(unit, n) {
  if (unit === 'g') { if (n >= 1000) return fmtNum(Math.round(n / 100) / 10) + ' kg'; return Math.max(5, Math.round(n / 5) * 5) + ' g'; }
  if (unit === 'ml') { if (n >= 1000) return fmtNum(Math.round(n / 100) / 10) + ' l'; return Math.max(5, Math.round(n / 5) * 5) + ' ml'; }
  const q = Math.max(0.5, Math.round(n * 2) / 2);
  return fmtNum(q) + ' ' + (UNIT_NL[unit] || unit);
}
const EUR = typeof Intl !== 'undefined' ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }) : null;
function eur(x) { return EUR ? EUR.format(x) : '€' + x.toFixed(2); }

function shareText(D, store, lines, pantry, have, total, storeName) {
  const out = ['Boodschappen · Daily Table · ' + storeName];
  D.depts.forEach((d) => {
    const ls = lines.filter((l) => l.ing.dept === d[0] && !have[l.id] && !l.halalMeat);
    if (!ls.length) return;
    out.push('', d[1]);
    ls.forEach((l) => out.push('- ' + l.ing.naam + ' · ' + l.packs + '× ' + amountText(l.ing.unit, l.size)));
  });
  const hm = lines.filter((l) => l.halalMeat && !have[l.id]);
  if (hm.length) {
    out.push('', 'Vlees (halal)');
    hm.forEach((l) => out.push('- ' + l.ing.naam + ' · ' + amountText(l.ing.unit, l.need)));
  }
  if (pantry.length) out.push('', 'Voorraadkast, check even: ' + pantry.map((p) => p.naam.toLowerCase()).join(', '));
  out.push('', 'Totaal ca. ' + eur(total));
  return out.join('\n');
}

/* ---------- inzicht ---------- */
const CAT_NL = { vlees: 'Vlees', vis: 'Vis', vega: 'Vega' };
function catGroup(r) { return r.meat ? 'vlees' : (r.fish ? 'vis' : 'vega'); }

function dayInsights(D, plan) {
  const days = [];
  for (let d = 0; d < plan.cfg.days; d++) days.push({ d, e: 0, v: 0, kcal: 0, t: 0, w: 0, n: 0, missing: 0, meals: [] });
  plan.slots.forEach((s, idx) => {
    const day = days[s.d];
    if (!day) return;
    const r = s.rid ? D.rec[s.rid] : null;
    day.meals.push({ meal: s.meal, r, idx });
    if (!r) return;
    day.n++; day.t += r.t; day.w += r.w || 0;
    if (r.e != null) day.e += r.e; else day.missing++;
    if (r.v != null) day.v += r.v;
    if (r.kcal) day.kcal += r.kcal;
  });
  return days;
}

function deptTotals(D, lines, have) {
  const out = {};
  lines.forEach((l) => {
    if (have && have[l.id]) return;
    out[l.ing.dept] = (out[l.ing.dept] || 0) + l.cost;
  });
  return D.depts.map((d) => ({ id: d[0], naam: d[1], cost: round2(out[d[0]] || 0) })).filter((x) => x.cost > 0).sort((a, b) => b.cost - a.cost);
}

if (typeof module !== 'undefined') {
  module.exports = { setTaste, TASTE_GET: () => TASTE, buildData, eligible, priceOf, buildList, sumLines, recipeCost, scopeBudget, generatePlan, pickForSlot, planBudget, planCost, amountText, eur, MEALS, THR, round2, shareText, dayInsights, deptTotals, catGroup };
}
