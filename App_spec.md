# Seediku App Spec

Status: Planung
App-Name: Seediku
Subtitle: Torrentloader
Zielplattform: Docker Compose, primär ZimaOS
Repository: github.com/MaroIshiku/seediku
Designsystem: Pixel Soft Utility Codex Pack v4

## 1. Ziel

Seediku ist eine selbst gehostete Torrentloader-Webapp mit einer ruhigen, schönen Pixel-Soft-Utility-Oberfläche. Die App nutzt eine stabile Torrent-Engine im Hintergrund und ersetzt deren Standard-Weboberfläche im Alltag durch eine eigene WebGUI.

Das wichtigste Ziel ist ein funktionierendes, lokal betreibbares Docker-Setup für ZimaOS und andere Docker-Compose-Umgebungen. Am Ende der Implementierung müssen mindestens eine vollständige Compose-Datei, ein Secret-Beispiel, eine `.env.example` und eine README nach ishiku-Standard vorhanden sein.

## 2. Grundarchitektur

### Torrent-Engine

Seediku nutzt qBittorrent als Torrent-Engine, weil qBittorrent stabil, weit verbreitet, Docker-tauglich und über eine HTTP-API steuerbar ist.

Geplantes Modell:

- Seediku stellt die eigene WebGUI und Backend-API bereit.
- qBittorrent läuft als separater Docker-Service oder als klar getrennte Runtime-Komponente.
- Seediku spricht serverseitig mit der qBittorrent Web API.
- Die originale qBittorrent-WebUI bleibt optional für Admin- oder Debug-Zwecke erreichbar.
- Nutzer verwenden im Alltag Seediku, nicht die qBittorrent-WebUI.

### VPN

Für Version 1 wird Seediku ohne festen VPN-Zwang geplant. Zusätzlich soll eine separate Docker-Compose-Variante mit Gluetun-Vorbereitung bereitgestellt werden.

Regeln:

- Die Standard-Compose funktioniert ohne Gluetun.
- Eine zweite Compose-Datei oder klar dokumentierte Override-Variante bereitet Gluetun vor.
- Keine VPN-Anbieter-spezifischen Secrets werden mitgeliefert.
- Die README verweist fest auf die offizielle Gluetun-Dokumentation: https://github.com/qdm12/gluetun/wiki
- Nach jedem Container-Neustart zeigt Seediku eine sichtbare Warnmeldung, dass geprüft werden soll, ob der gewünschte VPN-Schutz aktiv ist.
- Downloads werden nicht automatisch blockiert, wenn kein VPN erkannt wird.

## 3. Ports und Datenpfade

### Ports

- Seediku WebGUI: `8509`
- qBittorrent WebUI/API: `8185`
- Torrent TCP: `6881`
- Torrent UDP: `6881`

### Persistente Ordner

Geplante lokale Struktur:

```text
config/
data/
downloads/
  incomplete/
  complete/
  watch/
secrets/
```

Container-Pfade:

- Seediku-Daten: `/data`
- Seediku-Konfiguration: `/config`
- Unfertige Downloads: `/downloads/incomplete`
- Fertige Downloads: `/downloads/complete`
- Watch-Folder: `/downloads/watch`
- Setup-Secret: `/run/secrets/ishiku_setup_secret`

Der Watch-Folder ist optional nützlich: Wenn eine `.torrent`-Datei dort landet, kann qBittorrent sie automatisch importieren. Die primäre Seediku-Funktion bleibt aber das Hinzufügen über die WebGUI.

## 4. Torrent-Verhalten

### Version-1-Verhalten

- Torrents sollen standardmäßig nur laden und nicht langfristig seeden.
- Standard-Ratio-Limit: `0`
- Standard-Seed-Zeit: so kurz wie technisch sauber möglich.
- Upload soll nur im technisch nötigen Rahmen stattfinden, soweit qBittorrent das während des Downloads verlangt.
- Kategorien sind für Version 1 nicht wichtig.
- RSS ist nicht notwendig.
- Torrent-Suche und Indexer-Integration werden ausgeklammert.

### Hinzufügen von Downloads

Seediku muss ein zentrales Hinzufügen-Menü unterstützen:

- Magnet-Link einfügen
- Direkte Torrent-URL einfügen
- `.torrent`-Datei per Dropzone hochladen

Die Dropzone soll Drag-and-drop und klassische Dateiauswahl unterstützen. Nach dem Absenden wird der Torrent direkt an qBittorrent übergeben.

## 5. UI und Bedienung

### Designverbindlichkeit

Seediku folgt vollständig dem Pixel Soft Utility Codex Pack v4:

- AppShell
- AppHeader
- ProfileSheet
- SettingsSheet
- About/Admin/Diagnostics/Logs in Sheets
- sechs Themes: Lavender, Mint, Sky, Amber, Rose, Graphite
- Modes: System, Light, Dark
- Theme-Persistenz:
  - `seediku-theme`
  - `seediku-mode`
- keine app-spezifischen Farben, Radien, Shadows oder Header-Varianten
- keine technischen Statusdaten im Header
- keine externen Icon-CDNs
- mobile und desktop gleichwertig

### Header

Header-Inhalt:

- Seediku Logo im gemeinsamen 42px AppSymbol-Container
- App-Name `Seediku`
- Subtitle `Torrentloader`
- AvatarButton für angemeldete Nutzer
- vom Nutzer gewünschter Plus-Button zum Hinzufügen von Torrents

Design-Hinweis:

Das Pixel-Soft-Utility-Komponentenmapping verbietet permanente Primary Actions im Header. Für Seediku wird das Header-Plus als explizit gewünschte Produktentscheidung dokumentiert. Die Umsetzung darf nur als schlichter IconButton erfolgen, nicht als auffälliger Filled-Button. Der Header darf weiterhin keine technischen Statuschips, Download-Zähler, Versionen oder Speicherinfos enthalten.

### Hauptbereiche

Geplante Hauptbereiche:

- Dashboard
- Downloads
- Hinzufügen-Menü über Plus-Icon
- Profile/Settings/Admin über AvatarButton

Admin ist kein eigener Haupttab, sondern liegt im Profil-/Settings-Menü.

### Dashboard

Das Dashboard zeigt praktische Statuskarten, keine technischen Headerdaten.

Gewünschte Inhalte:

- aktive Downloads
- Download- und Upload-Geschwindigkeit
- Geschwindigkeitsgraph
- Ratio
- Fehler und Warnungen
- Public IP
- IP-Standort
- Hinweis nach Container-Neustart: VPN prüfen

Public-IP- und Standortdaten dürfen keine Voraussetzung für den normalen Betrieb sein. Wenn der externe Dienst nicht erreichbar ist, zeigt Seediku einen ruhigen Fehlerzustand.

### Downloads

Die Downloads-Ansicht soll zeigen:

- Name
- Fortschritt
- Status
- Downloadgeschwindigkeit
- Uploadgeschwindigkeit
- verbleibende Zeit
- Größe
- Ratio
- Fehlerstatus

Erwartete Aktionen:

- pausieren
- fortsetzen
- entfernen
- entfernen inklusive Daten, nur nach Bestätigungsdialog
- Details öffnen

## 6. Accounts und Auth

Seediku ist accountbasiert.

### First-Run Setup

Seediku implementiert den Universal First-Run Setup Flow aus dem Pixel Soft Utility v4 Vertrag.

Wenn noch kein Adminaccount existiert:

- normale App ist blockiert
- `RegisterWindow` wird sofort angezeigt
- Setup-Secret wird serverseitig geprüft
- bevorzugt über `ISHIKU_SETUP_SECRET_FILE=/run/secrets/ishiku_setup_secret`
- Fallback: `ISHIKU_SETUP_SECRET`
- Admin-Passwort darf nicht dem Setup-Secret entsprechen
- Admin-Passwort mindestens 12 Zeichen
- Passwörter werden nie im Klartext gespeichert
- nach erfolgreicher Admin-Erstellung ist öffentliche Registrierung geschlossen

### Rollen

Version 1 soll diese Rollen vorbereiten:

- Admin
- Benutzer

Nur der erste User wird automatisch Admin. Admins können später Benutzer hinzufügen.

Benutzer dürfen Downloads hinzufügen und verwalten, sofern der Admin dies nicht später einschränkt. Erweiterte Rechteverwaltung kann später folgen.

### Login

- normale Session-Logins mit HttpOnly Cookies
- SameSite mindestens `Lax`
- keine 2FA in Version 1
- keine Account-Recovery ohne explizit konfigurierte Recovery-Methode

## 7. Admin, Logs und Diagnostics

Admin- und Diagnoseinformationen liegen ausschließlich im Profile-/Settings-/Admin-Bereich, nicht im Header.

Gewünscht:

- Logs anzeigen
- App-Version
- Build-Datum
- GitHub SHA, falls verfügbar
- Datenverzeichnis
- Datenbankstatus
- Setup-Status
- Health-Status
- Log-Level
- qBittorrent-Verbindungsstatus
- qBittorrent WebUI/Admin-Link, falls aktiviert
- Copy-Debug-Details-Aktion ohne Secrets

Verboten:

- Secret-Werte anzeigen
- Klartextpasswörter anzeigen
- Session-Tokens anzeigen
- technische Badges im Header

## 8. Sicherheit

Seediku ist primär für lokale Nutzung geplant. Reverse Proxy ist für Version 1 nicht das Hauptziel.

Sicherheitsanforderungen:

- Setup-Secret bevorzugt als Docker Secret
- keine echten Secrets im Repository
- `.env` wird nicht committed
- `secrets/setup_secret.txt` wird nicht committed
- Datenbanken, Logs und Downloads werden nicht committed
- Passwörter mit sicherem Hashing speichern, bevorzugt Argon2id
- Setup-Versuche rate-limiten
- qBittorrent-Zugangsdaten nicht im Client offenlegen
- qBittorrent API nur serverseitig ansprechen
- Destruktive Aktionen mit Dialog bestätigen

## 9. Health und Runtime

Seediku stellt bereit:

- `/healthz` ohne Auth, keine sensiblen Daten
- `/readyz` ohne sensible Daten, prüft Datenbank und qBittorrent-Erreichbarkeit soweit sinnvoll
- `/setup`
- `/login`
- `/logout`
- `/admin` nur für Admins

Standard-Umgebungsvariablen:

- `TZ=Europe/Berlin`
- `ISHIKU_APP_URL`
- `ISHIKU_BASE_PATH=/`
- `ISHIKU_DATA_DIR=/data`
- `ISHIKU_LOG_LEVEL=info`
- `ISHIKU_SETUP_SECRET_FILE=/run/secrets/ishiku_setup_secret`
- `ISHIKU_SETUP_SECRET` nur als lokaler Fallback
- qBittorrent API Host/User/Password, genaue Namen während Implementierung festlegen

## 10. Docker-Lieferumfang

Am Ende der Implementierung sollen mindestens diese Dateien existieren:

- `docker-compose.yml` oder `docker-compose.example.yml`
- `docker-compose.gluetun.example.yml` oder dokumentierter Gluetun-Override
- `.env.example`
- `secrets/setup_secret.example.txt`
- `.gitignore`
- `README.md`

Die Standard-Compose soll enthalten:

- Seediku Service
- qBittorrent Service
- gemeinsame Netzwerkkonfiguration
- persistente Volumes/Pfade
- Docker Secret für First-Run Admin Setup
- Healthcheck für Seediku
- qBittorrent Port `8185`
- Seediku Port `8509`
- Torrent Ports `6881/tcp` und `6881/udp`

Die Gluetun-Variante soll vorbereiten:

- Gluetun Service
- qBittorrent Netzwerk über Gluetun
- Torrent-Ports über Gluetun
- Hinweis auf offizielle Gluetun-Konfiguration
- keine echten VPN-Secrets

## 11. Nicht in Version 1

Diese Punkte werden bewusst ausgeklammert:

- RSS
- integrierte Torrent-Suche
- Jackett/Prowlarr
- Sonarr/Radarr/Lidarr/Readarr
- Jellyfin/Plex/Emby
- Telegram/Discord/E-Mail/ntfy Benachrichtigungen
- automatische Speicherverwaltung
- 2FA
- komplexe Rollen- und Rechteverwaltung

## 12. Version-1-Erfolgskriterien

Version 1 gilt als erfolgreich, wenn:

- Docker Compose startet Seediku und qBittorrent stabil.
- Seediku ist über Port `8509` erreichbar.
- qBittorrent API ist für Seediku erreichbar.
- First-Run Setup erstellt genau einen ersten Admin.
- Login per Session-Cookie funktioniert.
- Magnet-Links können hinzugefügt werden.
- Torrent-URLs können hinzugefügt werden.
- `.torrent` Dateien können per Dropzone hochgeladen werden.
- Downloads werden in Seediku angezeigt und aktualisiert.
- Standardverhalten versucht langfristiges Seeden zu vermeiden.
- Dashboard zeigt aktive Downloads, Geschwindigkeit, Ratio, Fehler, Public IP und IP-Standort.
- Logs und Diagnostics sind im Admin-Bereich sichtbar.
- Nach Container-Neustart erscheint ein VPN-Prüfhinweis.
- README folgt dem ishiku README-Vertrag.
- keine Secrets, Datenbanken, Logs oder Downloads werden committed.

## 13. Offene Implementierungsentscheidungen

Diese Punkte werden beim Implementierungsstart final entschieden:

- konkreter Tech Stack für Backend und Frontend
- ob qBittorrent als offizielles Image oder LinuxServer.io Image genutzt wird
- genaue qBittorrent-API-Credentials und Secret-Namen
- ob Seediku eine eigene SQLite-Datenbank nutzt
- ob die qBittorrent-WebUI standardmäßig nur lokal im Docker-Netz oder auch auf Host-Port `8185` erreichbar ist
- genaue Strategie, um qBittorrent auf minimales Seeding zu konfigurieren
- ob Public-IP/Standort über einen externen Dienst oder optional konfigurierbaren Endpoint ermittelt wird

## 14. Nächster Schritt

Nach Freigabe dieser App Spec beginnt die Implementierungsplanung:

1. Repository sauber vorbereiten.
2. App-Manifest für Seediku erstellen.
3. Docker- und Secret-Struktur anlegen.
4. Backend mit First-Run Setup und qBittorrent API bauen.
5. Pixel-Soft-Utility AppShell und UI bauen.
6. Compose-Dateien, README und Beispiele fertigstellen.
7. Lokal testen und visuell prüfen.
