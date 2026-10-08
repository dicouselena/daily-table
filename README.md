# Daily Table

Maaltijdplanner met weekmenu, boodschappenlijst en prijsvergelijking (AH, Jumbo, Lidl, Hoogvliet).

## Wat zit erin

- `index.html` is de hele app in één bestand, geen server nodig.
- `prijzen.json` bevat de weekprijzen en bonusaanbiedingen. Nu nog leeg, dan gebruikt de app schattingen.
- `fetch_prijzen.py` haalt elke maandag de open data van Checkjebon (MIT-licentie, github.com/supermarkt/checkjebon) op en vult `prijzen.json` voor AH, Jumbo, Lidl en Hoogvliet. `pins.json` koppelt elk ingrediënt per winkel aan één vast product, zodat de prijs altijd van hetzelfde product komt. `fetch_ah_bonus.py` is het oude AH-appscript voor acties (niet getest, optioneel).
- `.github/workflows/prijzen.yml` draait dat script elke maandag automatisch.
- `data_src.py`, `src/` en `build.py` zijn de bron. Met `python3 data_src.py && python3 build.py` bouw je `index.html` opnieuw.

## Online zetten met automatische prijzen

1. Maak op github.com een nieuwe repository en upload alle bestanden uit deze map.
2. Ga naar Settings, Pages, kies Deploy from a branch, branch main, map root.
3. Je app staat dan op `https://jouwnaam.github.io/repositorynaam/`. Open die link op je telefoon en kies Zet op beginscherm.
4. Ga naar het tabblad Actions en start Prijzen bijwerken één keer handmatig. Daarna draait het elke maandag vanzelf.

Delen via Notities en Herinneringen werkt alleen als de app op deze manier online staat.

## Let op

- Checkjebon bevat geen bonus of acties. Die zijn dus nog niet in de app. Prijzen kunnen een dag of enkele dagen achterlopen.
- Gaat er iets mis of worden te weinig producten gevonden, dan blijft `prijzen.json` zoals het was.
- Ingrediënten zonder pin of zonder gevonden product worden geschat op basis van de AH-prijs. De app toont hoeveel ingrediënten echte prijzen hebben.
- Voedingswaarden en allergenen komen uit de receptendata en zijn indicatief. Controleer bij een allergie altijd de verpakking.
