# IDS SVV widget

StreamBIM-widget for a:

- laste opp en `.ids`-fil
- hente objekter og property sets fra StreamBIM
- validere modellobjekter mot IDS-regler
- gruppere like avvik
- opprette BCF-saker direkte fra avviksgruppene

## Filer

- `index.html`: widget-shell
- `styles.css`: UI
- `app.js`: StreamBIM-integrasjon, IDS-parser, validering og BCF-opprettelse
- `streambim-widget-api.min.js`: widget-API for StreamBIM
- `Test_trekkekum.ids`: eksempel-IDS

## Viktig om StreamBIM-data

Denne første versjonen bruker en tolerant adapter fordi eksakte metodename fra parent-frame ikke er dokumentert i prosjektmappen. Widgeten:

- kobler til StreamBIM
- lister opp alle parent-metoder den faktisk ser
- prover kjente kandidatmetoder for objektlesing og BCF-opprettelse

Hvis StreamBIM-instansen bruker andre metodenavn eller payload-formater, kan `app.js` justeres direkte mot de metodene widgeten viser i diagnostikkpanelet.

## Lokal test

Kjor en enkel webserver i denne mappen:

```powershell
python -m http.server 8080
```

Deretter aapner du `http://localhost:8080/`.

For full funksjon ma widgeten lastes som iframe inne i StreamBIM.
