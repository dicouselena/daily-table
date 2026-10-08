#!/usr/bin/env python3
"""Haalt AH-prijzen en bonusaanbiedingen op voor alle ingredienten in data.json
en schrijft prijzen.json. Alleen standaardbibliotheek, geen installatie nodig.

Gebruik:
  python3 fetch_prijzen.py            haal alles op en schrijf prijzen.json
  python3 fetch_prijzen.py --dry      toon het resultaat, schrijf niets
  python3 fetch_prijzen.py --only kipfilet,ui

LET OP: dit gebruikt de niet-officiele API van de AH-app. Die kan zonder
waarschuwing veranderen. Het script schrijft prijzen.json alleen als genoeg
producten zijn gevonden, zodat een storing je bestaande prijzen niet wist.
"""
import datetime
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.ah.nl"
UA = "Appie/8.22.3 Model/phone Android/7.0-API24"
MIN_FOUND = 0.6  # minimaal aandeel ingredienten dat gevonden moet zijn
PAUSE = 0.5      # seconden tussen verzoeken, wees aardig voor de server
AVOID = ["pizza", "soep", "salade", "maaltijd", "kant-en-klaar", "snack", "chips", "smaak",
         "gemarineerd", "gekruid", "gerookt", "sap ", "drink", "yoghurtijs", "ijs "]


def http(method, path, body=None, token=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    req.add_header("x-application", "AHWEBSHOP")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def get_token():
    j = http("POST", "/mobile-auth/v1/auth/token/anonymous", {"clientId": "appie"})
    tok = j.get("access_token") or j.get("accessToken")
    if not tok:
        raise RuntimeError("geen token in antwoord: " + str(list(j.keys())))
    return tok


def search(token, query, size=24):
    qs = urllib.parse.urlencode({"query": query, "sortOn": "RELEVANCE", "page": 0, "size": size})
    j = http("GET", "/mobile-services/product/search/v2?" + qs, token=token)
    return j.get("products") or []


def parse_size(text, unit):
    """Zet '500 g', '1 kg', '1,5 l', '3 x 125 g', '4 stuks' om naar de eenheid van het ingredient."""
    if not text:
        return None
    t = text.lower().replace(",", ".").replace("ca.", "").strip()
    mult = 1.0
    m = re.match(r"(\d+)\s*x\s*(.*)", t)
    if m:
        mult = float(m.group(1))
        t = m.group(2)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|gr|gram|l|ml|cl|stuks|stuk|st)\b", t)
    if not m:
        if unit == "st" and ("per stuk" in t or t in ("stuk", "1 stuk")):
            return 1.0
        return None
    n = float(m.group(1)) * mult
    u = m.group(2)
    if unit == "g":
        return n * 1000 if u == "kg" else n if u in ("g", "gr", "gram") else None
    if unit == "ml":
        return n * 1000 if u == "l" else n * 10 if u == "cl" else n if u == "ml" else None
    if unit == "st":
        return n if u in ("stuks", "stuk", "st") else None
    return None


def prijs(p):
    cur = p.get("currentPrice")
    before = p.get("priceBeforeBonus")
    is_bonus = bool(p.get("isBonus")) or (cur is not None and before is not None and cur < before)
    price = before if (is_bonus and before) else (cur if cur is not None else before)
    bonus = cur if (is_bonus and cur is not None and price and cur < price) else None
    return price, bonus


def kies(ing, products):
    must = [w.lower() for w in ing.get("must", [])]
    q = ing.get("q", "").lower()
    cands = []
    for rank, p in enumerate(products):
        title = (p.get("title") or "").lower()
        if must and not any(w in title for w in must):
            continue
        if any(a in (title + " ") and a.strip() not in q for a in AVOID):
            continue
        size = parse_size(p.get("salesUnitSize"), ing["unit"])
        price, bonus = prijs(p)
        if not size or not price:
            continue
        cands.append((rank, p, size, price, bonus))
    if not cands:
        return None
    pack = ing["pack"]
    ok = [c for c in cands if 0.4 * pack <= c[2] <= 3 * pack] or cands
    # laagste prijs per eenheid na bonus, bij gelijkspel de meest relevante
    best = min(ok, key=lambda c: ((c[4] if c[4] is not None else c[3]) / c[2], c[0]))
    rank, p, size, price, bonus = best
    out = {"price": round(price, 2), "size": size, "label": p.get("title"), "sku": p.get("webshopId")}
    if bonus is not None:
        out["bonus"] = round(bonus, 2)
        mech = p.get("bonusMechanism")
        if mech:
            out["mech"] = mech
    return out


def week_label(today):
    mon = today - datetime.timedelta(days=today.weekday())
    sun = mon + datetime.timedelta(days=6)
    mnd = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
    return "%d t/m %d %s" % (mon.day, sun.day, mnd[sun.month - 1])


def main():
    dry = "--dry" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    data = json.load(open("data.json", encoding="utf-8"))
    ings = [i for i in data["ingredients"] if not i.get("pantry") and i["unit"] in ("g", "ml", "st")]
    if only:
        ings = [i for i in ings if i["id"] in only]
    try:
        token = get_token()
    except (urllib.error.URLError, RuntimeError, ValueError) as e:
        print("Kon geen token ophalen bij AH:", e)
        print("De prijzen worden niet aangepast.")
        return 1
    result, missing = {}, []
    for ing in ings:
        try:
            found = kies(ing, search(token, ing["q"]))
        except (urllib.error.URLError, ValueError) as e:
            print("fout bij", ing["id"], e)
            found = None
        if found:
            result[ing["id"]] = found
            b = " BONUS %.2f" % found["bonus"] if "bonus" in found else ""
            print("%-16s %6.2f voor %5g %s  %s%s" % (ing["id"], found["price"], found["size"], ing["unit"], found["label"], b))
        else:
            missing.append(ing["id"])
            print("%-16s niet gevonden" % ing["id"])
        time.sleep(PAUSE)
    share = len(result) / max(1, len(ings))
    print("\nGevonden: %d van %d (%.0f%%). Niet gevonden: %s" % (len(result), len(ings), share * 100, ", ".join(missing) or "geen"))
    if dry or only:
        return 0
    if share < MIN_FOUND:
        print("Te weinig producten gevonden, prijzen.json blijft ongewijzigd.")
        return 1
    today = datetime.date.today()
    out = {"updated": today.isoformat(), "week": week_label(today), "bron": "AH app-API", "stores": {"ah": result}}
    json.dump(out, open("prijzen.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("prijzen.json geschreven.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
