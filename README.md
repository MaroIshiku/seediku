# Seediku

Torrentloader

> Seediku ist eine selbst gehostete WebGUI für qBittorrent mit Pixel-Soft-Utility-Oberfläche und Docker-Compose-Setup.

## Kurzbeschreibung

Seediku ist eine self-hosted Torrentloader-Web-App aus der ishiku-Familie. Die App stellt eine eigene ruhige Weboberfläche bereit und spricht serverseitig mit der qBittorrent Web API. qBittorrent bleibt die stabile Torrent-Engine im Hintergrund.

## Teil der ishiku-Familie

Seediku verwendet die gemeinsame ishiku Oberfläche:

- ruhige, abgerundete Pixel-Soft-Utility-Komponenten
- sechs gemeinsame Themes: Lavender, Mint, Sky, Amber, Rose und Graphite
- Light, Dark und System Mode
- einheitlicher AppHeader, Profil-/Einstellungs-Sheets und About/Admin-Bereiche
- einheitliches First-Run-Setup für den ersten Adminaccount

Die App soll sich bewusst wie Teil einer gemeinsamen Suite anfühlen, nicht wie eine separate Marke mit eigener Designsprache.

## Funktionen

- First-Run-Setup mit Setup-Secret und erstem Adminaccount
- Login per HttpOnly Session-Cookie
- Magnet-Links, Torrent-URLs und `.torrent` Upload per Dropzone
- Downloadliste mit Fortschritt, Status, Geschwindigkeit, ETA, Größe, Ratio und Fehlerstatus
- Aktionen für Pausieren, Fortsetzen, Entfernen und Entfernen inklusive Daten nach Bestätigung
- Dashboard mit aktiven Downloads, Geschwindigkeit, Ratio, Warnungen, Public IP und Standort
- Admin-/Diagnosebereich mit Logs, Health-Status und qBittorrent-Verbindungsstatus
- Docker Compose für Seediku und qBittorrent plus Gluetun-Beispiel

## Tech Stack

- Frontend: Vanilla JavaScript mit Pixel Soft Utility Codex Pack v4
- Backend: Node.js, Express
- Datenhaltung: persistente JSON-Datei in `/data`
- Torrent-Engine: qBittorrent Web API
- Deployment: Docker / Docker Compose

## Installation

### Docker Compose

```bash
mkdir -p secrets data config downloads/incomplete downloads/complete downloads/watch
cp .env.example .env
cp secrets/setup_secret.example.txt secrets/setup_secret.txt
```

Lege anschließend ein langes zufälliges Setup-Secret an:

```bash
openssl rand -base64 48 > secrets/setup_secret.txt
chmod 600 secrets/setup_secret.txt
```

Starte die App:

```bash
docker compose up -d --build
```

Seediku ist danach unter `http://localhost:8509` erreichbar. Die optionale qBittorrent-WebUI ist unter `http://localhost:8185` erreichbar.

Für die Gluetun-Variante:

```bash
docker compose -f docker-compose.yml -f docker-compose.gluetun.example.yml up -d --build
```

Die offizielle Gluetun-Konfiguration liegt hier: https://github.com/qdm12/gluetun/wiki

### Erstes Starten

Beim ersten Öffnen zeigt Seediku automatisch das Registrierungsfenster für den ersten Adminaccount an. Die Registrierung ist nur möglich, wenn das Setup-Secret korrekt eingegeben wird.

### Adminaccount erstellen

Im Registrierungsfenster werden benötigt:

- Setup-Secret aus `secrets/setup_secret.txt`
- Admin-Benutzername
- Anzeigename
- Admin-Passwort

Das Admin-Passwort darf nicht mit dem Setup-Secret übereinstimmen. Nach erfolgreicher Erstellung des ersten Adminaccounts wird die öffentliche Registrierung automatisch geschlossen.

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Standard |
| --- | --- | --- |
| `TZ` | Zeitzone für Logs und Anzeige | `Europe/Berlin` |
| `ISHIKU_APP_URL` | Öffentliche URL der App | `http://localhost:8509` |
| `ISHIKU_BASE_PATH` | Basis-Pfad hinter Reverse Proxy | `/` |
| `ISHIKU_DATA_DIR` | Persistenter Datenpfad im Container | `/data` |
| `ISHIKU_LOG_LEVEL` | Log-Level | `info` |
| `ISHIKU_SETUP_SECRET_FILE` | Pfad zum Docker-Secret | `/run/secrets/ishiku_setup_secret` |
| `ISHIKU_SETUP_SECRET` | Fallback-Secret als ENV, nur wenn kein Secret-File genutzt wird | leer |
| `QBITTORRENT_URL` | Serverinterne qBittorrent API URL | `http://qbittorrent:8185` |
| `QBITTORRENT_USERNAME` | qBittorrent API Benutzer | `admin` |
| `QBITTORRENT_PASSWORD` | qBittorrent API Passwort | `adminadmin` |
| `QBITTORRENT_WEBUI_URL` | Link zur optionalen qBittorrent-WebUI | `http://localhost:8185` |

### Docker Secrets

Bevorzugt wird ein Docker/Compose Secret als Datei. In `docker-compose.yml` wird dieses Secret nach `/run/secrets/ishiku_setup_secret` gemountet. Das Setup-Secret ist nur für die erste Admin-Registrierung gedacht und wird nicht im Client offengelegt.

### Persistente Daten

Persistente Daten liegen standardmäßig in:

```txt
data/
config/
downloads/
  incomplete/
  complete/
  watch/
secrets/
```

Sichere diese Ordner regelmäßig, wenn die App produktiv genutzt wird.

## Sicherheit

- Das Setup-Secret dient nur zur ersten Admin-Registrierung.
- Das Admin-Passwort darf nicht dem Setup-Secret entsprechen.
- Passwörter werden nicht im Klartext gespeichert.
- Die öffentliche Registrierung wird nach dem ersten Adminaccount geschlossen.
- qBittorrent-Zugangsdaten werden nur serverseitig verwendet.
- Destruktive Download-Aktionen verlangen eine Bestätigung.
- Secrets, `.env`, Datenbanken, Logs und Downloads gehören nicht ins Repository.
- Seediku erzwingt in Version 1 keinen VPN-Betrieb. Nach jedem Container-Neustart erscheint ein Hinweis, den gewünschten VPN-Schutz zu prüfen.

## Updates und Backup

```bash
docker compose pull
docker compose up -d --build
```

Vor Updates sollte der persistente Datenbestand gesichert werden:

```bash
tar -czf backup-seediku-$(date +%Y%m%d).tar.gz data config downloads secrets
```

## Entwicklung

```bash
npm install
npm run dev
```

Für lokale Entwicklung ohne Docker Secret kann `ISHIKU_SETUP_SECRET` gesetzt werden. Im normalen Compose-Betrieb sollte stattdessen `secrets/setup_secret.txt` verwendet werden.

Codex soll bei Änderungen das gemeinsame Pixel Soft Utility Designsystem beibehalten und keine app-spezifischen UI-Abweichungen einführen.

## Erstellt mit ChatGPT Codex

Dieses Projekt wurde mit Unterstützung von ChatGPT Codex erstellt bzw. überarbeitet. Codex wurde verwendet, um Code, Struktur, UI-Komponenten und Dokumentation nach den Vorgaben der ishiku / Pixel Soft Utility Standards zu generieren.

Die Verantwortung für Betrieb, Prüfung, Sicherheit und Veröffentlichung liegt beim Repository-Betreiber.

## Status und Lizenz

Status: v1 Implementierung

Lizenz: Noch nicht festgelegt.
