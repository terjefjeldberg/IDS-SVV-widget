# IDS SVV widget

StreamBIM-widget for:

- laste opp en `.ids`-fil
- validere modellobjekter mot IDS-regler
- gruppere like avvik
- opprette BCF-saker direkte fra avviksgrupper nar StreamBIM-instansen eksponerer dette

Datakilder:

- `StreamBIM`: eksisterende widget-basert innhenting
- `Lokal IFC`: tredjeparts valideringsmotor via IfcTester (`ifctester_service`)

## Filer

- `index.html`: widget-shell
- `styles.css`: UI
- `app.scope-prefetch-3.js`: aktiv widget-logikk
- `streambim-widget-api.min.js`: widget-API for StreamBIM
- `Test_trekkekum.ids`: eksempel-IDS
- `ifctester_service/`: lokal valideringstjeneste basert pa IfcTester

## Lokal IFC med IfcTester

Kjor lokal tjeneste:

```powershell
cd ifctester_service
.\run_local.ps1
```

Tjenesten starter pa `http://127.0.0.1:8765` og brukes automatisk av widgeten nar `Datakilde = Lokal IFC`.

## Deploy pa Render

Repoet inneholder `render.yaml` for tjenesten i `ifctester_service/`.

1. Opprett ny Render Web Service fra repoet.
2. Render leser `render.yaml` automatisk.
3. Etter deploy, noter URL-en, f.eks. `https://ids-svv-ifctester.onrender.com/validate`.
4. Start widgeten med query-parameter:

```text
...?ifctester_url=https://ids-svv-ifctester.onrender.com/validate
```

Widgeten lagrer endpointet i `localStorage` og bruker det videre.

API:

- `GET /health`
- `POST /validate` (`multipart/form-data`)
  - `ids_file` (fil)
  - `ifc_files` (1..n filer)

## Lokal test

Kjor en enkel webserver i rotmappen:

```powershell
python -m http.server 8080
```

Aapne `http://localhost:8080/`.

For full funksjon ma widgeten lastes som iframe inne i StreamBIM.
