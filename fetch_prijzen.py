#!/usr/bin/env python3
"""Maakt prijzen.json voor Daily Table met open data van Checkjebon (MIT-licentie,
https://github.com/supermarkt/checkjebon). Daarin staan de prijzen van AH, Jumbo,
Hoogvliet en Lidl. Alleen standaardbibliotheek.

  python3 fetch_prijzen.py                 haal data op en schrijf prijzen.json
  python3 fetch_prijzen.py --dry           alleen tonen
  python3 fetch_prijzen.py --file s.json   gebruik een lokaal bestand
  python3 fetch_prijzen.py --only kipfilet,ui

Let op: Checkjebon bevat geen bonusprijzen. Daarom worden acties hier niet getoond.
Een storing wist niets: prijzen.json wordt per winkel alleen overschreven als
genoeg ingredienten zijn gevonden.
"""
import datetime, json, re, sys, unicodedata, urllib.request

URL = "https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json"
STORES = ["ah", "jumbo", "lidl", "hoogvliet"]
MIN_FOUND = 0.6
AVOID = ["pizza", "soep", "salade", "maaltijd", "kant-en-klaar", "snack", "chips", "smaak", "gemarineerd",
         "gekruid", "gerookt", "sap", "drink", "ijs", "saus", "bowl", "wrap", "sandwich", "kruiden", "dressing",
         "pakket", "box", "mix voor", "burger", "schnitzel", "schnitzel", "spies", "reep", "koek", "taart", "puree"]
# per ingredient: extra woorden die juist wel mogen (haalt een AVOID-woord weg)
ALLOW = {"gerooktezalm": ["gerookt"], "tomatenpuree": ["puree"], "roerbakmix": ["mix"], "slamix": ["mix", "salade"],
         "pesto": ["saus"], "ketjap": ["saus"], "sojasaus": ["saus"], "tomatenblokjes": ["blokjes"],
         "wraps": ["wrap"], "kokosmelk": ["drink"], "haverdrink": ["drink"], "kikkererwten": [], "hummus": [],
         "bouillon": [], "kerrie": ["kruiden"], "italiaans": ["kruiden"], "komijn": ["kruiden"], "paprikapoeder": ["kruiden"],
         "mosterd": ["saus"], "boerenkool": ["mix"], "spinazie": []}
EXTRA_AVOID = {"kipfilet": ["kipfilet blokjes", "reepjes", "spiesjes"], "tomaat": ["cherry", "pruim", "gedroogd", "puree", "blokjes", "gepeld"],
               "ui": ["rode", "bosui", "zilverui", "gebakken", "gesneden", "ringen", "gekarameliseerd"], "ei": ["eiwit", "eiersalade", "paas"],
               "melk": ["chocolade", "karnemelk", "kokos", "haver", "soja", "amandel", "rijstmelk"], "aardappel": ["zoete", "chips", "friet", "puree", "kroket", "gekookt"],
               "kaas": ["roomkaas", "smeer"], "pasta": ["volkoren", "saus", "gevuld"], "rijst": ["zilvervlies", "melk", "wafel", "cake", "koek", "bruine", "pudding"],
               "volkorenbrood": ["stokbrood", "meergranen", "beschuit"], "stokbrood": ["afbak", "ontbijt"], "citroen": ["sap", "limoen", "thee"], "appel": ["sap", "mos", "taart", "compote", "peer"]}


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def parse_size(text, unit):
    if not text:
        return None
    t = norm(text).replace(",", ".").replace("ca.", "").strip()
    mult = 1.0
    m = re.match(r"(\d+)\s*x\s*(.*)", t)
    if m:
        mult = float(m.group(1)); t = m.group(2)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(kilogram|kg|gram|gr|g|liter|l|milliliter|ml|cl|stuks|stuk|st)\b", t)
    if not m:
        if unit == "st" and ("per stuk" in t or t in ("stuk", "1 stuk")):
            return 1.0
        return None
    n = float(m.group(1)) * mult
    u = m.group(2)
    if unit == "g":
        return n * 1000 if u in ("kg", "kilogram") else n if u in ("g", "gr", "gram") else None
    if unit == "ml":
        return n * 1000 if u in ("l", "liter") else n * 10 if u == "cl" else n if u in ("ml", "milliliter") else None
    if unit == "st":
        return n if u in ("stuks", "stuk", "st") else None
    return None


def words(name):
    return re.findall(r"[a-z0-9]+", norm(name))


def has(ws, term):
    term = norm(term)
    return any(w.startswith(term) or term in w for w in ws) if " " not in term else term in " ".join(ws)


FILLER = set("""ah jumbo hoogvliet lidl biologisch bio vers verse hollandse nederlandse nederlands scharrel scharrelei finest
terra large xl l m s per stuk stuks st kg g gr gram kilo liter ml cl 1 2 3 4 5 6 8 10 12 klein groot grote kleine
voordeelpak grootverpakking kleinverpakking los vers' rauw gepeld ongezouten gezouten ongezoet rijp ready eat
premium extra ca la de het een en met van in op voor""".split())


def extras(ws, ing, q):
    known = set(norm(m) for m in (ing.get("must") or [])) | set(q) | FILLER
    n = 0
    for w in ws:
        if w.isdigit() or re.fullmatch(r"\d+[a-z]*", w) or w in known:
            continue
        if any(w.startswith(k) or k.startswith(w) for k in known if len(k) > 3 and len(w) > 3):
            continue
        n += 1
    return n


from matchers import K, GEN

UNITW = set("g gr gram kg kilo l liter ml cl stuks stuk st x".split())


def kies_m(ing, products):
    kw, ok = K[ing["id"]]
    kw = [norm(w) for w in kw.split()]
    allowed = set(norm(w) for w in (ok + " " + " ".join(kw) + " " + " ".join(GEN)).split())
    cands = []
    for p in products:
        ws = words(p["n"])
        if not ws:
            continue
        def known(w):
            return w in allowed or w.isdigit() or re.fullmatch(r"\d+[a-z]*", w) or w in UNITW or any(len(a) > 3 and (w.startswith(a) or a.startswith(w) and len(w) > 3) for a in allowed)
        # merk: eerste woord mag onbekend zijn
        rest = ws if known(ws[0]) else ws[1:]
        if any(not known(w) for w in rest):
            continue
        if not any(any(w.startswith(k) for k in kw) for w in ws):
            continue
        size = parse_size(p.get("s"), ing["unit"]) or parse_size(p["n"], ing["unit"])
        if not size and ing["unit"] == "st" and not p.get("s") and ing["pack"] <= 2:
            size = 1.0
        if not size or not p.get("p"):
            continue
        cands.append((p, size))
    if not cands:
        return None
    pack = ing["pack"]
    ok2 = [c for c in cands if 0.4 * pack <= c[1] <= 3 * pack] or cands
    ok2.sort(key=lambda c: c[0]["p"] / c[1])
    p, size = ok2[len(ok2) // 3]
    return {"price": round(p["p"], 2), "size": size, "label": p["n"][:60]}


def kies(ing, products):
    if ing['id'] in K:
        return kies_m(ing, products)
    return kies_generic(ing, products)


def kies_generic(ing, products):
    must = ing.get("must") or []
    q = [w for w in norm(ing.get("q", "")).split() if w not in ("in", "op", "met", "rood", "geel", "groen", "blik", "diepvries", "gesneden", "naturel", "scharrel", "halfvolle")]
    avoid = [a for a in AVOID if a not in ALLOW.get(ing["id"], [])] + EXTRA_AVOID.get(ing["id"], [])
    cands = []
    for p in products:
        name = p["n"]; ws = words(name)
        if not any(has(ws, m) for m in must):
            continue
        if any(has(ws, a) for a in avoid):
            continue
        size = parse_size(p.get("s"), ing["unit"]) or parse_size(name, ing["unit"])
        if ing["unit"] == "st" and not size and ing["id"] in ("komkommer", "citroen", "avocado", "paprika") and not p.get("s"):
            size = 1.0
        if not size or not p.get("p"):
            continue
        hit = sum(1 for w in q if has(ws, w))
        cands.append((hit, extras(ws, ing, q), p, size))
    if not cands:
        return None
    top = max(c[0] for c in cands)
    cands = [c for c in cands if c[0] == top]
    lo = min(c[1] for c in cands)
    cands = [c for c in cands if c[1] <= lo + (1 if lo == 0 and sum(1 for c2 in cands if c2[1] == 0) < 3 else 0)]
    cands = [(c[0], c[2], c[3]) for c in cands]
    pack = ing["pack"]
    ok = [c for c in cands if 0.4 * pack <= c[2] <= 3 * pack] or cands
    # mediaan per eenheid: sterk tegen uitschieters (merkproducten, bio, luxe)
    per = sorted(ok, key=lambda c: c[1]["p"] / c[2])
    best = per[len(per) // 3]  # lager derde: huismerk-achtig zonder het goedkoopste foutje
    hit, p, size = best
    return {"price": round(p["p"], 2), "size": size, "label": p["n"][:60]}


def week_label(today):
    mon = today - datetime.timedelta(days=today.weekday()); sun = mon + datetime.timedelta(days=6)
    mnd = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
    return "%d t/m %d %s" % (mon.day, sun.day, mnd[sun.month - 1])


def main():
    dry = "--dry" in sys.argv
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    if "--file" in sys.argv:
        raw = json.load(open(sys.argv[sys.argv.index("--file") + 1], encoding="utf-8"))
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "daily-table"})
        raw = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))
    data = json.load(open("data.json", encoding="utf-8"))
    ings = [i for i in data["ingredients"] if i["unit"] in ("g", "ml", "st") and i["id"] in K]
    if only:
        ings = [i for i in ings if i["id"] in only]
    old = {}
    try:
        old = json.load(open("prijzen.json", encoding="utf-8")).get("stores", {})
    except (OSError, ValueError):
        pass
    pins = json.load(open("pins.json", encoding="utf-8"))
    out, report = {}, {}
    for s in raw:
        if s["n"] not in STORES:
            continue
        idx = {p["l"]: p for p in s["d"]}
        res, miss = {}, []
        for ing in ings:
            pin = pins.get(s["n"], {}).get(ing["id"])
            link, forced = (pin["l"], pin.get("size")) if isinstance(pin, dict) else (pin, None)
            p = idx.get(link) if link else None
            if not p or not p.get("p"):
                miss.append(ing["id"]); continue
            size = parse_size(p.get("s"), ing["unit"]) or parse_size(p["n"], ing["unit"]) or forced
            if not size and ing["unit"] == "st" and ing["pack"] <= 2:
                size = 1.0
            if not size:
                miss.append(ing["id"]); continue
            res[ing["id"]] = {"price": round(p["p"], 2), "size": size, "label": p["n"][:60]}
            print("%-9s %-15s %6.2f / %5g %s  %s" % (s["n"], ing["id"], p["p"], size, ing["unit"], p["n"][:50]))
        share = len(res) / max(1, len(ings))
        report[s["n"]] = (len(res), len(ings), miss)
        print("== %s: %d van %d (%.0f%%) zonder prijs (schatting): %s\n" % (s["n"], len(res), len(ings), share * 100, ", ".join(miss) or "geen"))
        out[s["n"]] = res if (share >= MIN_FOUND and not only) else old.get(s["n"], {})
    if dry or only:
        return 0
    today = datetime.date.today()
    j = {"updated": today.isoformat(), "week": week_label(today), "bron": "Checkjebon (open data)", "stores": out}
    json.dump(j, open("prijzen.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("prijzen.json geschreven.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
