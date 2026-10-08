/* ---------- inzicht: grafieken ---------- */
const DAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
function dayShort(i) {
  const d = new Date(ST.plan.start + 'T12:00:00'); d.setDate(d.getDate() + i);
  return DAYS_SHORT[d.getDay()];
}
const tipAttr = (title, lines) => ' data-tip="' + esc([title].concat(lines || []).join('|')) + '"';

function weekGridHTML() {
  const pl = ST.plan; const n = pl.cfg.days;
  let h = '<div class="wk" style="grid-template-columns:62px repeat(' + n + ',minmax(0,1fr))" role="group" aria-label="Weekoverzicht"><span></span>';
  for (let d = 0; d < n; d++) h += '<span class="h">' + dayShort(d) + '</span>';
  pl.cfg.meals.forEach((m) => {
    h += '<span class="rl2">' + MEAL_NL[m] + '</span>';
    for (let d = 0; d < n; d++) {
      const s = pl.slots.find((x) => x.d === d && x.meal === m); const r = s && s.rid ? D.rec[s.rid] : null;
      if (!r) { h += '<span class="wcell none" aria-label="leeg">·</span>'; continue; }
      const g = catGroup(r);
      h += '<button class="wcell ' + g + '"' + tipAttr(r.naam, [CAT_NL[g] + ' · ' + timeText(r), eur(recipeCost(D, PRICES, pl.store, r, pl.persons)) + ' voor ' + pl.persons + ' pers.']) + '>' + r.t + '′</button>';
    }
  });
  h += '</div><div class="leg"><span><i style="background:var(--c1)"></i>Vlees</span><span><i style="background:var(--c2)"></i>Vis</span><span><i style="background:var(--c3)"></i>Vega</span><span>getal is actieve kooktijd in minuten</span></div>';
  return h;
}

function hbarsHTML(rows, fmt, hi) {
  const max = Math.max.apply(null, rows.map((r) => r.v).concat([0.01]));
  return '<div class="hb">' + rows.map((r, i) => '<span class="nm">' + esc(r.label) + '</span><div class="tr"><button' + tipAttr(r.label, r.tip || [fmt(r.v)]) + '><span class="b' + (hi != null && i !== hi ? ' dim' : '') + '" style="width:calc((100% - 70px) * ' + (r.v / max).toFixed(3) + ')"></span><span class="val">' + fmt(r.v) + '</span></button></div>').join('') + '</div>';
}

function colsHTML(vals, labels, o) {
  const n = vals.length; const max = Math.max.apply(null, vals.concat([o.target || 0, 1])) * 1.12;
  const H = 150;
  let h = '<div class="col" style="--n:' + n + '">';
  vals.forEach((v, i) => {
    const hit = o.target ? v >= o.target : true;
    h += '<button class="cb"' + tipAttr(labels[i], o.tip(i)) + '><span class="cap">' + (v ? o.fmt(v) : '') + '</span><span class="bar' + (hit ? '' : ' dim') + '" style="height:' + Math.max(2, Math.round(v / max * (H - 22))) + 'px"></span></button>';
  });
  if (o.target) h += '<div class="tgt" style="bottom:' + Math.round(o.target / max * (H - 22)) + 'px"><span>doel ' + o.fmt(o.target) + '</span></div>';
  h += '</div><div class="colx" style="--n:' + n + '">' + labels.map((l) => '<span>' + l + '</span>').join('') + '</div>';
  return h;
}

function lineChartHTML(hist) {
  const W = 320; const H = 150; const L = 8; const R = 12; const T = 12; const B = 24;
  const n = hist.length;
  const max = Math.max.apply(null, hist.map((x) => Math.max(x.spent, x.budget))) * 1.15 || 1;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const pts = (k) => hist.map((p, i) => x(i).toFixed(1) + ',' + y(p[k]).toFixed(1)).join(' ');
  let s = '<svg class="line-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Uitgaven en budget per menu">';
  [0, 0.5, 1].forEach((f) => { const yy = (T + (H - T - B) * f).toFixed(1); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/>'; });
  s += '<polyline points="' + pts('budget') + '" fill="none" stroke="var(--cn)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  s += '<polyline points="' + pts('spent') + '" fill="none" stroke="var(--c1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  hist.forEach((p, i) => {
    s += '<g class="hit"' + tipAttr(p.label, ['Uitgaven ' + eur(p.spent), 'Budget ' + eur(p.budget), storeName(p.store)]) + ' tabindex="0"><rect x="' + (x(i) - 14) + '" y="0" width="28" height="' + H + '" fill="transparent"/><circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.spent).toFixed(1) + '" r="4" fill="var(--c1)" stroke="var(--bg)" stroke-width="2"/></g>';
    if (n <= 8 || i === 0 || i === n - 1) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(p.short) + '</text>';
  });
  return s + '</svg><div class="leg"><span><i class="line" style="background:var(--c1)"></i>Uitgaven</span><span><i class="line" style="background:var(--cn)"></i>Budget</span></div>';
}

function recordHistory() {
  const pl = ST.plan; if (!pl || !D) return;
  const c = calc(); if (!c.rids.length) return;
  if (!ST.history) ST.history = [];
  const d = new Date(pl.start + 'T12:00:00');
  const e = { key: pl.start, label: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }), short: d.getDate() + '/' + (d.getMonth() + 1), spent: c.sm.all, budget: c.budget, store: pl.store, slots: c.rids.length };
  const i = ST.history.findIndex((x) => x.key === e.key);
  if (i >= 0) ST.history[i] = e; else ST.history.push(e);
  ST.history.sort((a, b) => (a.key < b.key ? -1 : 1));
  ST.history = ST.history.slice(-12);
}

function tableHTML(head, rows) {
  return '<details class="tbl"><summary>Bekijk als tabel</summary><div class="scroll"><table><thead><tr>' + head.map((h, i) => '<th' + (i ? ' class="n"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="n"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
}

function inzichtHTML() {
  const pl = ST.plan; const P = activeP(); const c = calc();
  if (!c.rids.length) return '<div class="empty">Nog geen menu om te laten zien.</div>';
  const days = dayInsights(D, pl);
  const share = pl.cfg.meals.reduce((a, m) => a + ({ ontbijt: 0.25, lunch: 0.3, diner: 0.45 }[m] || 0), 0);
  const eDoel = Math.round((P.eiwitDoel || 55) * share); const vDoel = Math.round((P.vezelDoel || 30) * share);
  const left = round2(c.budget - c.sm.all);
  const totalMin = days.reduce((a, d) => a + d.t, 0);
  const filled = days.filter((d) => d.n);
  const avgE = filled.length ? Math.round(filled.reduce((a, d) => a + d.e, 0) / filled.length) : 0;
  const kpis = '<div class="kpis"><div class="kpi"><span class="cap">Totaal</span><b class="num">' + eur(c.sm.all) + '</b></div>'
    + '<div class="kpi"><span class="cap">' + (left >= 0 ? 'Over van budget' : 'Boven budget') + '</span><b class="num">' + eur(Math.abs(left)) + '</b></div>'
    + '<div class="kpi"><span class="cap">Per portie</span><b class="num">' + eur(c.sm.all / Math.max(1, c.rids.length * pl.persons)) + '</b></div>'
    + '<div class="kpi"><span class="cap">Kooktijd totaal</span><b class="num">' + Math.floor(totalMin / 60) + 'u ' + (totalMin % 60) + 'm</b></div></div>';

  const dep = deptTotals(D, c.bl.lines, pl.have);
  const depChart = hbarsHTML(dep.map((x) => ({ label: x.naam, v: x.cost, tip: [eur(x.cost), Math.round(x.cost / Math.max(0.01, c.sm.all) * 100) + '% van het totaal'] })), eur, null);

  const stores = D.stores.map((s) => { const bl = buildList(D, PRICES, s.id, c.rids, pl.persons, P.halal); return { id: s.id, naam: s.naam, v: sumLines(bl.lines, pl.have).all }; });
  const cheapest = Math.min.apply(null, stores.map((x) => x.v));
  const stChart = hbarsHTML(stores.map((x) => ({ label: x.naam + (x.id === pl.store ? ' ✓' : ''), v: x.v, tip: [eur(x.v), x.v === cheapest ? 'Goedkoopste voor dit menu' : '+' + eur(x.v - cheapest) + ' t.o.v. goedkoopste'] })), eur, stores.findIndex((x) => x.v === cheapest));

  const labels = days.map((d) => dayShort(d.d));
  const eChart = colsHTML(days.map((d) => Math.round(d.e)), labels, { target: eDoel, fmt: (v) => v + ' g', tip: (i) => [Math.round(days[i].e) + ' g eiwit', 'doel ' + eDoel + ' g'].concat(days[i].missing ? ['niet alles bekend'] : []) });
  const vChart = colsHTML(days.map((d) => Math.round(d.v)), labels, { target: vDoel, fmt: (v) => v + ' g', tip: (i) => [Math.round(days[i].v) + ' g vezels', 'doel ' + vDoel + ' g'] });
  const tChart = colsHTML(days.map((d) => d.t), labels, { fmt: (v) => v + '′', tip: (i) => [days[i].t + ' min actief koken', days[i].w ? days[i].w + ' min wachten (oven, marineren)' : 'geen wachttijd'] });

  const hist = ST.history || [];
  const hChart = hist.length >= 2 ? lineChartHTML(hist) : '<div class="empty" style="margin-top:12px">Het verloop verschijnt zodra je meer dan één menu hebt gemaakt. Elk menu telt als een punt.</div>';

  const mealsPerDay = pl.cfg.meals.length;
  const partial = '';

  return kpis
    + '<section class="ch"><h3>Waar gaat je geld heen</h3><p class="small">Per afdeling, ' + esc(storeName(pl.store)) + '.</p>' + depChart + '</section>'
    + '<section class="ch"><h3>Vergelijk winkels</h3><p class="small">Hetzelfde menu, de goedkoopste winkel staat gemarkeerd.</p>' + stChart + '<p class="small">' + esc(priceStatus(pl.store)) + '</p></section>'
    + '<section class="ch"><h3>Eiwit per dag</h3><p class="small">Gemiddeld ' + avgE + ' g per dag, schatting.</p>' + eChart + partial + '</section>'
    + '<section class="ch"><h3>Vezels per dag</h3><p class="small">Doel ' + vDoel + ' g, stel je in bij Profiel.</p>' + vChart + '</section>'
    + '<section class="ch"><h3>Kooktijd per dag</h3><p class="small">Actieve tijd in de keuken, in minuten.</p>' + tChart + '</section>'
    + '<section class="ch"><h3>Budgetverloop</h3><p class="small">Je laatste menu\'s tegenover je budget.</p>' + hChart + '</section>'
    + tableHTML(['Dag', 'Eiwit g', 'Vezels g', 'Kooktijd min', 'Gerechten'], days.map((d) => [dayShort(d.d), Math.round(d.e), Math.round(d.v), d.t, d.meals.filter((m) => m.r).map((m) => m.r.naam).join(', ')]))
    + tableHTML(['Afdeling', 'Kosten'], dep.map((x) => [x.naam, eur(x.cost)]).concat(stores.map((x) => [x.naam + ' (totaal)', eur(x.v)])))
    + (hist.length ? tableHTML(['Menu', 'Uitgaven', 'Budget'], hist.map((h) => [h.label, eur(h.spent), eur(h.budget)])) : '');
}

/* ---------- tooltip ---------- */
let TIPEL = null;
function showTip(el) {
  const raw = el.getAttribute('data-tip'); if (!raw) return;
  const parts = raw.split('|');
  if (!TIPEL) { TIPEL = document.createElement('div'); TIPEL.className = 'tip'; TIPEL.setAttribute('role', 'tooltip'); document.body.appendChild(TIPEL); }
  TIPEL.textContent = '';
  const b = document.createElement('b'); b.textContent = parts[1] || parts[0]; TIPEL.appendChild(b);
  const first = document.createElement('span'); first.textContent = parts[1] ? parts[0] : ''; if (parts[1]) TIPEL.appendChild(first);
  parts.slice(2).forEach((t) => { const s = document.createElement('span'); s.textContent = t; TIPEL.appendChild(s); });
  TIPEL.style.display = 'block';
  const r = el.getBoundingClientRect(); const tw = TIPEL.offsetWidth; const th = TIPEL.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  let y = r.top - th - 8; if (y < 8) y = r.bottom + 8;
  TIPEL.style.left = x + 'px'; TIPEL.style.top = y + 'px';
}
function hideTip() { if (TIPEL) TIPEL.style.display = 'none'; }
document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); else hideTip(); });
document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('focusout', hideTip);
document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); else hideTip(); });
document.addEventListener('scroll', hideTip, true);
