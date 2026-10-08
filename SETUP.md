# Daily Table online zetten (GitHub Pages)

1. Maak een gratis account op github.com.
2. Klik rechtsboven op + en kies New repository. Naam: daily-table. Kies Public. Maak aan.
3. Kies Add file, Upload files en sleep de inhoud van deze map erin (niet de map zelf). Vergeet de verborgen map .github niet: pak de zip uit en sleep alles mee. Klik Commit changes.
4. Ga naar Settings, Pages. Kies bij Source: Deploy from a branch, branch main, map / (root). Opslaan.
5. Na een minuut staat de app op https://JOUWNAAM.github.io/daily-table/
6. Ga naar Settings, Actions, General, onderaan Workflow permissions: kies Read and write permissions. Opslaan.
7. Ga naar het tabblad Actions, kies Prijzen bijwerken en klik Run workflow. Daarna draait het elke maandag vanzelf.
8. Open de link op je telefoon. iPhone: Safari, Deel, Zet op beginscherm. Android: Chrome, menu met drie puntjes, App installeren of Toevoegen aan startscherm. Je krijgt het cherry-icoon op je beginscherm.

Let op: index.html moet opnieuw gebouwd worden als je data verandert (python3 data_src.py en python3 build.py).
