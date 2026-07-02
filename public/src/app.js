import { initPixelSoftUtilityApp } from "../design-system/app-shell.js";
import { bindRegisterWindow } from "../design-system/setup-flow.js";
import { setPixelSoftUtilityMode, setPixelSoftUtilityTheme } from "../design-system/theme-controller.js";

const appRoot = document.getElementById("app");
const toastHost = document.getElementById("toast-host");

const state = {
  manifest: null,
  user: null,
  setupRequired: true,
  setupConfigured: false,
  setupErrorKey: "",
  vpnWarning: false,
  torrents: [],
  transfer: {},
  dashboard: null,
  admin: null,
  selectedTorrent: null,
  currentView: "dashboard",
  refreshTimer: null
};

await injectIcons();
await bootstrap();

async function bootstrap() {
  const data = await api("/api/bootstrap", { allowError: true });
  state.manifest = data.manifest || fallbackManifest();
  state.setupRequired = Boolean(data.setupRequired);
  state.setupConfigured = Boolean(data.setupConfigured);
  state.setupErrorKey = data.setupErrorKey || "";
  state.user = data.user || null;
  state.vpnWarning = Boolean(data.vpnWarning);
  initPixelSoftUtilityApp(state.manifest);

  if (state.setupRequired) {
    renderSetup();
    return;
  }
  if (!state.user) {
    renderLogin();
    return;
  }
  renderAppShell();
  await refreshAll({ silent: true });
  startRefresh();
}

async function injectIcons() {
  const target = document.getElementById("icon-sprite");
  const response = await fetch("/icons/psu-icons.svg");
  target.innerHTML = await response.text();
}

function renderSetup() {
  stopRefresh();
  appRoot.innerHTML = setupLayout();
  if (!state.setupConfigured) return;
  const form = document.getElementById("setup-form");
  bindRegisterWindow(form, {
    appId: "seediku",
    appName: "Seediku",
    onSubmit: async (formData, formElement) => {
      setFormBusy(formElement, true);
      try {
        const result = await api("/api/setup", { method: "POST", body: new URLSearchParams(formData) });
        state.user = result.user;
        state.setupRequired = false;
        toast("Adminaccount erstellt.");
        renderAppShell();
        await refreshAll({ silent: true });
        startRefresh();
      } catch (error) {
        renderFormErrors(formElement, error.payload?.errors || {}, error.message);
      } finally {
        setFormBusy(formElement, false);
      }
    }
  });
  document.querySelector("[name='setup_secret']")?.focus();
}

function setupLayout() {
  const missing = escapeHtml(state.setupErrorKey || "ISHIKU_SETUP_SECRET");
  if (!state.setupConfigured) {
    return `
      <main class="psu-setup-screen">
        <section class="psu-setup-error-window">
          ${setupBrand("Setup nicht bereit", `Seediku braucht zuerst ein Docker-Secret oder einen lokalen Fallback.`)}
          <section class="psu-tonal-card">
            <h2 class="psu-card-title">Fehlende Konfiguration</h2>
            <p class="psu-card-text">Bitte konfiguriere <code>${missing}</code>. Secret-Werte werden hier bewusst nicht angezeigt.</p>
          </section>
        </section>
      </main>`;
  }
  return `
    <main class="psu-setup-screen">
      <section class="psu-register-window" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        ${setupBrand("Admin einrichten", "Erstelle den ersten Adminaccount für diese ishiku App.")}
        <form id="setup-form" class="psu-form-stack" novalidate>
          ${field("setup_secret", "Setup-Secret", "password", "Steht in deinem Docker-Secret oder in ISHIKU_SETUP_SECRET.", "one-time-code")}
          ${field("admin_display_name", "Anzeigename", "text", "", "name")}
          ${field("admin_username", "Admin-Benutzername", "text", "", "username")}
          ${field("admin_email", "E-Mail optional", "email", "", "email", false)}
          ${field("admin_password", "Admin-Passwort", "password", "", "new-password")}
          ${field("admin_password_confirm", "Passwort wiederholen", "password", "", "new-password")}
          <div class="psu-password-requirements">
            Das Passwort braucht mindestens 12 Zeichen und darf nicht dem Setup-Secret, App-Namen oder Benutzernamen entsprechen.
          </div>
          <p class="psu-field-error" data-form-error hidden></p>
          <div class="psu-setup-actions">
            <button class="psu-button psu-button--tonal" type="button" data-help>Setup-Hilfe anzeigen</button>
            <button class="psu-button psu-button--filled" type="submit">Adminaccount erstellen</button>
          </div>
          <p class="psu-setup-footnote">Nach dem Erstellen des Adminaccounts wird die Registrierung automatisch geschlossen.</p>
        </form>
      </section>
    </main>`;
}

function renderLogin() {
  stopRefresh();
  appRoot.innerHTML = `
    <main class="psu-setup-screen">
      <section class="psu-auth-window" role="dialog" aria-modal="true" aria-labelledby="login-title">
        ${setupBrand("Anmelden", "Melde dich mit deinem lokalen Seediku-Account an.")}
        <form id="login-form" class="psu-form-stack">
          ${field("username", "Benutzername", "text", "", "username")}
          ${field("password", "Passwort", "password", "", "current-password")}
          <p class="psu-field-error" data-form-error hidden></p>
          <div class="psu-setup-actions">
            <button class="psu-button psu-button--filled psu-button--full" type="submit">Einloggen</button>
          </div>
        </form>
      </section>
    </main>`;
  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new URLSearchParams(new FormData(form));
    setFormBusy(form, true);
    try {
      const result = await api("/api/login", { method: "POST", body });
      state.user = result.user;
      toast("Willkommen zurück.");
      renderAppShell();
      await refreshAll({ silent: true });
      startRefresh();
    } catch (error) {
      renderFormErrors(form, {}, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function renderAppShell() {
  appRoot.innerHTML = `
    <div class="psu-app-shell">
      <header class="psu-app-header" data-psu-app-header>
        <div class="psu-app-header__inner">
          <div class="psu-app-symbol" aria-hidden="true">
            <img data-psu-app-logo src="/assets/logos/seediku.png" alt="" />
            <svg data-psu-fallback-symbol><use href="#psu-icon-download"></use></svg>
          </div>
          <div class="psu-app-title-stack">
            <h1 class="psu-app-title" data-psu-app-name>Seediku</h1>
            <p class="psu-app-subtitle" data-psu-app-subtitle>Torrentloader</p>
          </div>
          <div class="psu-spacer"></div>
          <button class="psu-icon-button seediku-add-button" type="button" aria-label="Torrent hinzufügen" title="Torrent hinzufügen" data-open-add>
            <svg aria-hidden="true"><use href="#psu-icon-plus"></use></svg>
          </button>
          <button class="psu-avatar-button" type="button" aria-label="Profilmenü öffnen" data-psu-open="#profile-sheet">${escapeHtml(state.user.initials || "S")}</button>
        </div>
      </header>
      <main class="psu-main">
        <section class="seediku-tabs">
          <div class="psu-segmented-control" role="tablist" aria-label="Hauptbereich">
            <button type="button" data-view="dashboard" aria-selected="${state.currentView === "dashboard"}">Dashboard</button>
            <button type="button" data-view="downloads" aria-selected="${state.currentView === "downloads"}">Downloads</button>
          </div>
          <button class="psu-button psu-button--tonal" type="button" data-refresh>Aktualisieren</button>
        </section>
        <div id="main-view" class="seediku-main-view"></div>
      </main>
    </div>
    ${profileSheet()}
    ${addSheet()}
    ${detailsSheet()}
    ${confirmDialog()}
    <script type="application/json" data-psu-app-config>${escapeHtml(JSON.stringify(state.manifest))}</script>`;
  initPixelSoftUtilityApp(state.manifest);
  bindAppEvents();
  renderMainView();
}

function bindAppEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      renderAppShell();
    });
  });
  document.querySelector("[data-refresh]")?.addEventListener("click", refreshAll);
  document.querySelector("[data-open-add]")?.addEventListener("click", () => openSheet("#add-sheet"));
  document.querySelector("[data-psu-open='#profile-sheet']")?.addEventListener("click", refreshAdminProfile);
  bindProfileEvents();
  window.addEventListener("psu:themechange", syncThemeButtons);
  syncThemeButtons();
  bindAddForm();
}

function bindProfileEvents() {
  const profile = document.getElementById("profile-sheet");
  if (!profile) return;
  profile.querySelector("[data-logout]")?.addEventListener("click", logout);
  profile.querySelector("[data-copy-debug]")?.addEventListener("click", copyDebug);
  profile.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => setPixelSoftUtilityTheme(button.dataset.themeChoice)));
  profile.querySelectorAll("[data-mode-choice]").forEach((button) => button.addEventListener("click", () => setPixelSoftUtilityMode(button.dataset.modeChoice)));
}

function renderMainView() {
  const target = document.getElementById("main-view");
  if (!target) return;
  target.innerHTML = state.currentView === "downloads" ? downloadsView() : dashboardView();
  bindTorrentActions();
}

function dashboardView() {
  const stats = state.dashboard?.stats || {};
  const ip = state.dashboard?.ip || {};
  return `
    <section class="seediku-stat-grid">
      ${statCard("Aktive Downloads", number(stats.activeDownloads), "aus qBittorrent")}
      ${statCard("Download", bytesPerSecond(stats.downloadSpeed), "aktuelle Geschwindigkeit")}
      ${statCard("Upload", bytesPerSecond(stats.uploadSpeed), "technisch nötiger Rahmen")}
      ${statCard("Ratio", ratio(stats.ratio), `${number(stats.warnings)} Warnungen/Fehler`)}
    </section>
    <section class="seediku-dashboard-grid">
      <article class="psu-card">
        <h2 class="psu-card-title">Geschwindigkeitsgraph</h2>
        <p class="psu-card-text">Aktuelle Fortschrittsverteilung der sichtbaren Queue.</p>
        <div class="seediku-chart" aria-label="Geschwindigkeitsgraph">
          ${(stats.graph || [8, 12, 18, 22, 15, 9, 4]).map((value) => `<span class="seediku-bar" style="height:${Math.max(8, Number(value) || 8)}%"></span>`).join("")}
        </div>
      </article>
      <article class="psu-card seediku-public-ip-card">
        <h2 class="psu-card-title">Public IP</h2>
        <p class="seediku-stat__value">${ip.ok ? escapeHtml(ip.ip || "unbekannt") : "Nicht verfügbar"}</p>
        <p class="psu-card-text">${ip.ok ? escapeHtml([ip.city, ip.region, ip.country].filter(Boolean).join(", ") || "Standort unbekannt") : "Der externe IP-Dienst ist gerade nicht erreichbar."}</p>
        ${state.vpnWarning ? `
          <div class="seediku-vpn-pill" role="status">
            <span>VPN-Schutz prüfen</span>
            <button type="button" aria-label="VPN-Hinweis schließen" data-dismiss-vpn>×</button>
          </div>` : ""}
      </article>
    </section>`;
}

function downloadsView() {
  if (!state.torrents.length) {
    return `
      <section class="psu-card">
        <h2 class="psu-card-title">Keine Downloads</h2>
        <p class="psu-card-text">Füge einen Magnet-Link, eine Torrent-URL oder eine .torrent-Datei hinzu.</p>
        <div class="psu-card-actions"><button class="psu-button psu-button--filled" type="button" data-open-add>Torrent hinzufügen</button></div>
      </section>`;
  }
  return `
    <section class="seediku-download-list">
      ${state.torrents.map((torrent) => `
        <article class="psu-card seediku-download-row">
          <div class="seediku-download-main">
            <h2 class="seediku-download-title">${escapeHtml(torrent.name || torrent.hash)}</h2>
            <div class="seediku-progress" aria-label="Fortschritt"><span style="--progress:${Math.round((torrent.progress || 0) * 100)}%"></span></div>
            <p class="seediku-download-meta">${Math.round((torrent.progress || 0) * 100)}% · ${escapeHtml(torrent.state || "unbekannt")} · ${bytes(torrent.size)} · ETA ${eta(torrent.eta)} · Ratio ${ratio(torrent.ratio)}</p>
            <p class="seediku-download-meta">Down ${bytesPerSecond(torrent.dlspeed)} · Up ${bytesPerSecond(torrent.upspeed)}${torrent.error ? ` · Fehler ${escapeHtml(torrent.error)}` : ""}</p>
          </div>
          <div class="seediku-row-actions">
            <button class="psu-icon-button" type="button" title="Pausieren" aria-label="Pausieren" data-action="pause" data-hash="${escapeAttr(torrent.hash)}"><svg><use href="#psu-icon-pause"></use></svg></button>
            <button class="psu-icon-button" type="button" title="Fortsetzen" aria-label="Fortsetzen" data-action="resume" data-hash="${escapeAttr(torrent.hash)}"><svg><use href="#psu-icon-play"></use></svg></button>
            <button class="psu-icon-button" type="button" title="Details" aria-label="Details" data-action="details" data-hash="${escapeAttr(torrent.hash)}"><svg><use href="#psu-icon-info"></use></svg></button>
            <button class="psu-icon-button" type="button" title="Entfernen" aria-label="Entfernen" data-action="remove" data-hash="${escapeAttr(torrent.hash)}"><svg><use href="#psu-icon-delete"></use></svg></button>
          </div>
        </article>`).join("")}
    </section>`;
}

function profileSheet() {
  return `
    <div class="psu-backdrop" id="profile-sheet" hidden>
      <section class="psu-center-sheet seediku-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header class="psu-sheet-header">
          <button class="psu-icon-button" type="button" aria-label="Profilmenü schließen" data-psu-close><svg><use href="#psu-icon-close"></use></svg></button>
          <h2 class="psu-sheet-title" id="profile-title">Profile</h2>
          <span></span>
        </header>
        <div class="seediku-profile-scroll">
          <div class="psu-account-card">
            <div class="psu-account-avatar">${escapeHtml(state.user.initials || "S")}</div>
            <div><p class="psu-account-name">${escapeHtml(state.user.displayName || state.user.username)}</p><p class="psu-account-id">${escapeHtml(state.user.role)}</p></div>
          </div>
          <section class="psu-tonal-card">
            <h3 class="psu-card-title">Darstellung</h3>
            <div class="psu-chip-group" role="group" aria-label="Theme wählen">
              ${["lavender", "mint", "sky", "amber", "rose", "graphite"].map((theme) => `<button class="psu-chip" data-theme-choice="${theme}">${label(theme)}</button>`).join("")}
            </div>
            <div class="psu-card-actions" role="group" aria-label="Modus wählen">
              ${["system", "light", "dark"].map((mode) => `<button class="psu-chip" data-mode-choice="${mode}">${label(mode)}</button>`).join("")}
            </div>
          </section>
          ${state.user.role === "admin" ? adminSection() : ""}
          <div class="psu-list seediku-profile-actions">
            <button class="psu-list-row" type="button" data-logout><svg class="psu-list-row__icon"><use href="#psu-icon-logout"></use></svg><span class="psu-list-row__label">Sign out</span><span></span></button>
          </div>
        </div>
      </section>
    </div>`;
}

function adminSection() {
  const admin = state.admin?.app || {};
  const logs = state.admin?.logs || [];
  return `
    <section class="psu-card">
      <h3 class="psu-card-title">Admin & Diagnose</h3>
      <div class="seediku-detail-grid">
        ${tech("App-Version", admin.version)}
        ${tech("Build-Datum", admin.buildDate)}
        ${tech("GitHub SHA", admin.githubSha || "nicht gesetzt")}
        ${tech("Datenverzeichnis", admin.dataDir)}
        ${tech("Datenbankstatus", admin.databaseStatus)}
        ${tech("Setup-Status", admin.setupStatus)}
        ${tech("Health-Status", admin.healthStatus)}
        ${tech("Log-Level", admin.logLevel)}
        ${tech("qBittorrent", qbitStatusText(admin))}
      </div>
      <div class="psu-card-actions seediku-admin-actions">
        <button class="psu-button psu-button--tonal" type="button" data-copy-debug>Debug-Details kopieren</button>
        ${admin.qbittorrentWebUiUrl ? `<a class="psu-button psu-button--outlined" href="${escapeAttr(admin.qbittorrentWebUiUrl)}" target="_blank" rel="noreferrer">qBittorrent WebUI</a>` : ""}
      </div>
      <h4 class="psu-card-title">Logs</h4>
      <div class="seediku-log-list">
        ${logs.length ? logs.map((entry) => `<div class="psu-technical-card"><strong>${escapeHtml(entry.level)}</strong> ${escapeHtml(entry.time)}<br><span class="psu-technical-value">${escapeHtml(entry.message)}</span></div>`).join("") : `<p class="psu-card-text">Noch keine Logs vorhanden.</p>`}
      </div>
    </section>`;
}

function addSheet() {
  return `
    <div class="psu-backdrop" id="add-sheet" hidden>
      <section class="psu-center-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <header class="psu-sheet-header">
          <button class="psu-icon-button" type="button" aria-label="Hinzufügen schließen" data-psu-close><svg><use href="#psu-icon-close"></use></svg></button>
          <h2 class="psu-sheet-title" id="add-title">Hinzufügen</h2>
          <span></span>
        </header>
        <form id="add-form" class="psu-form-stack">
          <label class="psu-field">
            <span class="psu-label">Magnet-Link oder Torrent-URL</span>
            <textarea class="psu-input" name="torrent_value" placeholder="magnet:?xt=... oder https://..."></textarea>
          </label>
          <label class="seediku-dropzone" id="dropzone">
            <input class="psu-visually-hidden" type="file" name="torrent_file" accept=".torrent,application/x-bittorrent" />
            <span data-drop-label>.torrent-Datei hier ablegen oder auswählen</span>
          </label>
          <p class="psu-field-error" data-form-error hidden></p>
          <div class="psu-card-actions">
            <button class="psu-button psu-button--filled" type="submit">An qBittorrent übergeben</button>
            <button class="psu-button psu-button--tonal" type="button" data-psu-close>Abbrechen</button>
          </div>
        </form>
      </section>
    </div>`;
}

function detailsSheet() {
  return `
    <div class="psu-backdrop" id="details-sheet" hidden>
      <section class="psu-center-sheet" role="dialog" aria-modal="true" aria-labelledby="details-title">
        <header class="psu-sheet-header">
          <button class="psu-icon-button" type="button" aria-label="Details schließen" data-psu-close><svg><use href="#psu-icon-close"></use></svg></button>
          <h2 class="psu-sheet-title" id="details-title">Details</h2>
          <span></span>
        </header>
        <div id="details-content"></div>
      </section>
    </div>`;
}

function confirmDialog() {
  return `
    <div class="psu-backdrop" id="confirm-dialog" hidden>
      <section class="psu-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 class="psu-card-title" id="confirm-title">Download entfernen?</h2>
        <p class="psu-card-text">Diese Aktion entfernt den Torrent aus qBittorrent. Dateien werden nur gelöscht, wenn du es ausdrücklich auswählst.</p>
        <label class="psu-list-row"><span></span><span class="psu-list-row__label">Auch Daten löschen</span><input type="checkbox" id="delete-files"></label>
        <div class="psu-card-actions">
          <button class="psu-button psu-button--danger" type="button" data-confirm-remove>Entfernen</button>
          <button class="psu-button psu-button--tonal" type="button" data-psu-close>Abbrechen</button>
        </div>
      </section>
    </div>`;
}

function bindAddForm() {
  const form = document.getElementById("add-form");
  if (!form) return;
  const dropzone = document.getElementById("dropzone");
  const input = form.querySelector("input[type='file']");
  const labelNode = form.querySelector("[data-drop-label]");
  input.addEventListener("change", () => {
    labelNode.textContent = input.files?.[0]?.name || ".torrent-Datei hier ablegen oder auswählen";
  });
  ["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
  }));
  dropzone.addEventListener("drop", (event) => {
    input.files = event.dataTransfer.files;
    labelNode.textContent = input.files?.[0]?.name || ".torrent-Datei hier ablegen oder auswählen";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(form);
    setFormBusy(form, true);
    try {
      await api("/api/torrents/add", { method: "POST", body });
      closeSheet("#add-sheet");
      form.reset();
      labelNode.textContent = ".torrent-Datei hier ablegen oder auswählen";
      toast("Torrent wurde übergeben.");
      await refreshAll({ silent: true });
    } catch (error) {
      renderFormErrors(form, {}, error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
}

function bindTorrentActions() {
  document.querySelectorAll("[data-open-add]").forEach((button) => button.addEventListener("click", () => openSheet("#add-sheet")));
  document.querySelector("[data-dismiss-vpn]")?.addEventListener("click", dismissVpnWarning);
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const torrent = state.torrents.find((item) => item.hash === button.dataset.hash);
      if (!torrent) return;
      if (button.dataset.action === "details") return openDetails(torrent);
      if (button.dataset.action === "remove") return confirmRemove(torrent);
      await api(`/api/torrents/${encodeURIComponent(torrent.hash)}/${button.dataset.action}`, { method: "POST" });
      toast(button.dataset.action === "pause" ? "Download pausiert." : "Download fortgesetzt.");
      await refreshAll();
    });
  });
}

function openDetails(torrent) {
  state.selectedTorrent = torrent;
  document.getElementById("details-content").innerHTML = `
    <section class="psu-card">
      <h3 class="psu-card-title">${escapeHtml(torrent.name)}</h3>
      <div class="seediku-detail-grid">
        ${tech("Status", torrent.state)}
        ${tech("Fortschritt", `${Math.round((torrent.progress || 0) * 100)}%`)}
        ${tech("Download", bytesPerSecond(torrent.dlspeed))}
        ${tech("Upload", bytesPerSecond(torrent.upspeed))}
        ${tech("Größe", bytes(torrent.size))}
        ${tech("Ratio", ratio(torrent.ratio))}
        ${tech("Verbleibend", eta(torrent.eta))}
        ${tech("Fehler", torrent.error || "keiner")}
      </div>
    </section>`;
  openSheet("#details-sheet");
}

function confirmRemove(torrent) {
  state.selectedTorrent = torrent;
  openSheet("#confirm-dialog");
  document.querySelector("[data-confirm-remove]").onclick = async () => {
    const deleteFiles = document.getElementById("delete-files").checked;
    await api(`/api/torrents/${encodeURIComponent(torrent.hash)}?deleteFiles=${deleteFiles}`, { method: "DELETE" });
    closeSheet("#confirm-dialog");
    toast(deleteFiles ? "Download und Daten entfernt." : "Download entfernt.");
    await refreshAll();
  };
}

async function refreshAll(options = {}) {
  const { silent = false } = options;
  if (!state.user) return;
  const [torrentPayload, dashboardPayload, adminPayload] = await Promise.allSettled([
    api("/api/torrents"),
    api("/api/dashboard"),
    state.user.role === "admin" ? api("/api/admin") : Promise.resolve(null)
  ]);
  if (torrentPayload.status === "fulfilled") {
    state.torrents = torrentPayload.value.torrents || [];
    state.transfer = torrentPayload.value.transfer || {};
  } else {
    if (!silent) toast(torrentPayload.reason.message);
  }
  if (dashboardPayload.status === "fulfilled") state.dashboard = dashboardPayload.value;
  if (adminPayload.status === "fulfilled") {
    state.admin = adminPayload.value;
    renderProfileSheet();
  }
  renderMainView();
}

async function refreshAdminProfile() {
  if (state.user?.role !== "admin") return;
  try {
    state.admin = await api("/api/admin");
    renderProfileSheet();
  } catch (error) {
    toast(error.message);
  }
}

function renderProfileSheet() {
  const current = document.getElementById("profile-sheet");
  if (!current) return;
  const wasOpen = !current.hidden;
  current.outerHTML = profileSheet();
  const next = document.getElementById("profile-sheet");
  if (next && wasOpen) next.hidden = false;
  bindProfileEvents();
  syncThemeButtons();
}

function startRefresh() {
  stopRefresh();
  state.refreshTimer = setInterval(() => refreshAll({ silent: true }), 5000);
}

function stopRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  toast("Abgemeldet.");
  renderLogin();
}

async function dismissVpnWarning() {
  await api("/api/vpn-warning/dismiss", { method: "POST" });
  state.vpnWarning = false;
  renderMainView();
}

async function copyDebug() {
  const debug = JSON.stringify(state.admin?.app || {}, null, 2);
  await navigator.clipboard.writeText(debug);
  toast("Debug-Details kopiert.");
}

async function api(url, options = {}) {
  const { allowError = false, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(url, { ...fetchOptions, credentials: "same-origin" });
  } catch (error) {
    throw new Error(normalizeNetworkError(error));
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok && !allowError) {
    const error = new Error(payload.error || "Anfrage fehlgeschlagen.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function normalizeNetworkError(error) {
  if (/networkerror|failed to fetch|load failed|fetch resource/i.test(error?.message || "")) {
    return "Seediku ist gerade nicht erreichbar. Bitte prüfe, ob der Container noch läuft und die Seite neu geladen werden muss.";
  }
  return error?.message || "Netzwerkfehler.";
}

function setupBrand(title, subtitle) {
  return `
    <div class="psu-setup-brand">
      <div class="psu-setup-logo" aria-hidden="true"><img src="/assets/logos/seediku.png" alt="" /></div>
      <div><h1 class="psu-setup-title" id="setup-title">${escapeHtml(title)}</h1><p class="psu-setup-subtitle">${escapeHtml(subtitle)}</p></div>
    </div>`;
}

function field(name, labelText, type, help = "", autocomplete = "", required = true) {
  return `
    <label class="psu-field">
      <span class="psu-label">${escapeHtml(labelText)}</span>
      <input class="psu-input" name="${escapeAttr(name)}" type="${escapeAttr(type)}" ${required ? "required" : ""} ${autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : ""} />
      ${help ? `<span class="psu-card-text">${escapeHtml(help)}</span>` : ""}
      <span class="psu-field-error" data-field-error="${escapeAttr(name)}" hidden></span>
    </label>`;
}

function statCard(labelText, value, support) {
  return `<article class="psu-card seediku-stat"><p class="seediku-stat__label">${escapeHtml(labelText)}</p><p class="seediku-stat__value">${escapeHtml(value)}</p><p class="seediku-stat__support">${escapeHtml(support)}</p></article>`;
}

function tech(labelText, value) {
  return `<div class="psu-technical-card"><strong>${escapeHtml(labelText)}</strong><div class="psu-technical-value">${escapeHtml(String(value ?? "nicht verfügbar"))}</div></div>`;
}

function qbitStatusText(admin) {
  const status = admin.qbittorrent || {};
  if (status.ok) return `ok ${status.version || ""}${status.url ? ` @ ${status.url}` : ""}`.trim();
  return `nicht erreichbar${status.url ? ` @ ${status.url}` : ""}${status.error ? `: ${status.error}` : ""}`;
}

function setFormBusy(form, busy) {
  form.querySelectorAll("button, input, textarea").forEach((node) => {
    node.disabled = busy;
  });
}

function renderFormErrors(form, errors, fallback) {
  form.querySelectorAll("[data-field-error]").forEach((node) => {
    const message = errors[node.dataset.fieldError];
    node.textContent = message || "";
    node.hidden = !message;
  });
  const formError = form.querySelector("[data-form-error]");
  if (formError) {
    formError.textContent = fallback || "";
    formError.hidden = !fallback;
  }
}

function openSheet(selector) {
  document.querySelector(selector)?.removeAttribute("hidden");
}

function closeSheet(selector) {
  document.querySelector(selector)?.setAttribute("hidden", "");
}

function syncThemeButtons() {
  const root = document.documentElement;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const selected = button.dataset.themeChoice === root.dataset.theme;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-mode-choice]").forEach((button) => {
    const selected = button.dataset.modeChoice === root.dataset.mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "seediku-toast";
  node.textContent = message;
  toastHost.append(node);
  setTimeout(() => node.remove(), 3200);
}

function bytes(value) {
  const numberValue = Number(value) || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = numberValue;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function bytesPerSecond(value) {
  return `${bytes(value)}/s`;
}

function eta(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 8640000) return "unbekannt";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours} h ${minutes % 60} min`;
  if (minutes) return `${minutes} min`;
  return `${seconds} s`;
}

function ratio(value) {
  return (Number(value) || 0).toFixed(2);
}

function number(value) {
  return new Intl.NumberFormat("de-DE").format(Number(value) || 0);
}

function label(value) {
  return { system: "System", light: "Light", dark: "Dark" }[value] || `${value[0].toUpperCase()}${value.slice(1)}`;
}

function fallbackManifest() {
  return {
    app_id: "seediku",
    app_name: "Seediku",
    app_subtitle: "Torrentloader",
    app_symbol: "download",
    app_logo: { src: "/assets/logos/seediku.png", favicon: "/assets/logos/seediku.png", alt: "" },
    default_theme: "lavender",
    default_mode: "system"
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
