# Seediku

Torrent loader

> Seediku is a self-hosted web GUI for qBittorrent with a Pixel Soft Utility interface and Docker Compose deployment.

## Summary

Seediku is a self-hosted torrent loader web app from the ishiku family. The app provides its own calm web interface and talks to the qBittorrent Web API server-side. qBittorrent remains the stable torrent engine in the background.

## Part of the ishiku Family

Seediku uses the shared ishiku interface:

- calm, rounded Pixel Soft Utility components
- six shared themes: Lavender, Mint, Sky, Amber, Rose, and Graphite
- Light, Dark, and System modes
- consistent AppHeader, profile/settings sheets, and About/Admin areas
- consistent first-run setup for the first admin account

The app is intentionally meant to feel like part of a shared suite, not like a separate brand with its own design language.

## Features

- First-run setup with setup secret and first admin account
- Login with HttpOnly session cookie
- Magnet links, torrent URLs, and `.torrent` uploads through a drop zone
- Download list with progress, status, speed, ETA, size, ratio, and error state
- Pause, resume, remove, and remove-with-data actions after confirmation
- Dashboard with active downloads, speed, ratio, warnings, public IP, and location
- Admin/diagnostics area with logs, health status, and qBittorrent connection status
- Docker Compose for Seediku and qBittorrent plus an optional Gluetun example

## Tech Stack

- Frontend: vanilla JavaScript with Pixel Soft Utility Codex Pack v4
- Backend: Node.js and Express
- Storage: persistent JSON file in `/data`
- Torrent engine: qBittorrent Web API
- Deployment: Docker / Docker Compose

## Installation

### Docker Compose

Create the persistent host folders on ZimaOS or your Docker host:

```bash
mkdir -p /DATA/AppData/seediku/data
mkdir -p /DATA/AppData/seediku/config/qbittorrent
mkdir -p /DATA/AppData/seediku/downloads/incomplete
mkdir -p /DATA/AppData/seediku/downloads/complete
mkdir -p /DATA/AppData/seediku/downloads/watch
```

Open `docker-compose.yml` and replace this value with a long random setup secret:

```yaml
ISHIKU_SETUP_SECRET: "CHANGE-ME-seediku-first-run-setup-secret"
```

Start the app:

```bash
docker compose up -d --build
```

Seediku is then available at `http://localhost:8509`. The optional qBittorrent Web UI is available at `http://localhost:8185`.

For the Gluetun variant:

```bash
docker compose -f docker-compose.yml -f docker-compose.gluetun.example.yml up -d --build
```

The official Gluetun configuration guide is available at <https://github.com/qdm12/gluetun/wiki>.

### First Start

On first open, Seediku automatically shows the registration window for the first admin account. Registration is only possible when the setup secret is entered correctly.

### Create the Admin Account

The registration window requires:

- setup secret from `secrets/setup_secret.txt`
- admin username
- display name
- admin password

The admin password must not match the setup secret. After the first admin account is created successfully, public registration is closed automatically.

## Configuration

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `TZ` | Time zone for logs and display | `Europe/Berlin` |
| `ISHIKU_APP_URL` | Public app URL | `http://localhost:8509` |
| `ISHIKU_BASE_PATH` | Base path behind a reverse proxy | `/` |
| `ISHIKU_DATA_DIR` | Persistent data path in the container | `/data` |
| `ISHIKU_LOG_LEVEL` | Log level | `info` |
| `ISHIKU_SETUP_SECRET_FILE` | File containing the one-time setup secret | `/run/secrets/ishiku_setup_secret` |
| `QBITTORRENT_URLS` | Server-internal qBittorrent API URLs, checked in order | `http://seediku-qbittorrent:8185,...` |
| `QBITTORRENT_USERNAME` | qBittorrent API username | `admin` |
| `QBITTORRENT_PASSWORD_FILE` | File containing the current qBittorrent Web UI password | `/run/secrets/qbittorrent_password` |
| `QBITTORRENT_WEBUI_URL` | Link to the optional qBittorrent Web UI | `http://localhost:8185` |
| `SEEDIKU_PUBLIC_IP_ENDPOINTS` | Comma-separated HTTPS endpoints used to observe direct egress; the request discloses the requesting IP | `https://api.ipify.org?format=json` |
| `SEEDIKU_VPN_IP_URL` | Trusted Gluetun control URL used to observe torrent/VPN egress | unset; the Gluetun overlay sets it |
| `SEEDIKU_EXPECTED_VPN_IPS` | Optional allowlist used to confirm an expected VPN exit | unset |

### Setup Secret

Copy both example files in `secrets/` to their names without `.example`, then replace the contents with unique values. On a fresh qBittorrent installation, read its generated temporary Web UI password from the qBittorrent container log, change it in qBittorrent, and store the same value in `secrets/qbittorrent_password.txt`. The real files are ignored by Git and mounted as Compose secrets.

### Persistent Data

Persistent data is stored in named Compose volumes by default:

```text
seediku-data
seediku-config
qbittorrent-config
downloads-incomplete
downloads-complete
downloads-watch
```

Back up these folders regularly when Seediku is used in production.

## Security

- The setup secret is only used for the first admin registration.
- The admin password must not match the setup secret.
- Passwords are not stored as plaintext.
- Public registration is closed after the first admin account.
- qBittorrent credentials are used server-side only.
- Destructive download actions require confirmation.
- Secrets, `.env`, databases, logs, and downloads do not belong in the repository.
- Direct public-IP lookup is explicit and configurable; it sends the source address to the configured HTTPS service.
- With the Gluetun overlay, Seediku also reads Gluetun's `/v1/publicip/ip` endpoint and compares VPN egress with direct egress. The result is evidence for the torrent network namespace, not a substitute for a firewall/kill-switch test.

## Updates and Backup

```bash
docker compose pull
docker compose up -d --build
```

Back up the persistent data before updates:

```bash
docker run --rm -v seediku_seediku-data:/source:ro -v "$PWD":/backup alpine tar -czf /backup/seediku-data.tgz -C /source .
```

## Development

```bash
npm install
npm run dev
```

For local development, point `ISHIKU_SETUP_SECRET_FILE` and `QBITTORRENT_PASSWORD_FILE` at private files. Do not place secrets in environment examples or source files.

When making changes, keep the shared Pixel Soft Utility design system intact and avoid app-specific UI deviations.

## Created with ChatGPT Codex

This project was created and revised with support from ChatGPT Codex. Codex was used to generate and refine code, structure, UI components, and documentation according to the ishiku / Pixel Soft Utility standards.

Responsibility for operation, review, security, and publication remains with the repository owner.

## Status and License

Status: v1 implementation

License: not specified yet.
