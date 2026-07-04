import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { JsonStore } from "./store.js";
import { QBittorrentClient } from "./qbittorrent.js";
import {
  clearSessionCookie,
  hashPassword,
  newSessionToken,
  parseCookies,
  sessionCookieName,
  setSessionCookie,
  tokenHash,
  validateAdminSetup,
  verifyPassword
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const manifestPath = path.join(rootDir, "app.manifest.json");

const env = {
  port: Number(process.env.PORT || process.env.SEEDIKU_PORT || 8509),
  dataDir: process.env.ISHIKU_DATA_DIR || path.join(rootDir, "data"),
  configDir: process.env.SEEDIKU_CONFIG_DIR || process.env.ISHIKU_CONFIG_DIR || path.join(rootDir, "config"),
  logLevel: process.env.ISHIKU_LOG_LEVEL || "info",
  appUrl: process.env.ISHIKU_APP_URL || "",
  basePath: process.env.ISHIKU_BASE_PATH || "/",
  trustProxy: process.env.ISHIKU_TRUST_PROXY === "true",
  setupSecretFile: process.env.ISHIKU_SETUP_SECRET_FILE || "/run/secrets/ishiku_setup_secret",
  setupSecretFallback: process.env.ISHIKU_SETUP_SECRET || "",
  secureCookies: process.env.SEEDIKU_SECURE_COOKIES === "true",
  qbUrl: process.env.QBITTORRENT_URLS || process.env.QBITTORRENT_URL || "http://qbittorrent:8185",
  qbUsername: process.env.QBITTORRENT_USERNAME || "admin",
  qbPassword: process.env.QBITTORRENT_PASSWORD || "adminadmin",
  qbWebUiUrl: process.env.QBITTORRENT_WEBUI_URL || "http://localhost:8185"
};

const bootId = crypto.randomUUID();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
const app = express();
const store = await new JsonStore(env.dataDir).init();
const qb = new QBittorrentClient({ baseUrl: env.qbUrl, username: env.qbUsername, password: env.qbPassword });
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const logs = [];
const setupAttempts = new Map();

await fs.mkdir(path.join(env.dataDir, "logs"), { recursive: true });
await store.updateBootId(bootId);
qb.configureDefaults().then(() => log("info", "qBittorrent defaults configured")).catch((error) => log("warn", "qBittorrent defaults not configured", { error: error.message }));

app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir, { extensions: ["html"] }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, app: "seediku", version: manifest.version || "0.1.0", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/readyz", async (_req, res) => {
  const qbStatus = await qb.ready();
  const status = { ok: store.ready && qbStatus.ok, database: store.ready ? "ok" : "unavailable", qbittorrent: qbStatus.ok ? "ok" : "unavailable" };
  res.status(status.ok ? 200 : 503).json(status);
});

app.get("/api/bootstrap", withOptionalUser, async (req, res) => {
  const setupSecretStatus = await getSetupSecretStatus();
  res.json({
    manifest,
    setupRequired: store.setupRequired(),
    setupConfigured: setupSecretStatus.ok,
    setupErrorKey: setupSecretStatus.ok ? "" : setupSecretStatus.key,
    authenticated: Boolean(req.user),
    user: publicUser(req.user),
    vpnWarning: req.user ? !store.isVpnWarningDismissed(req.user.id, bootId) : false
  });
});

app.post("/api/setup", setupRateLimit, async (req, res, next) => {
  try {
    if (!store.setupRequired()) return res.status(409).json({ error: "Setup ist bereits abgeschlossen." });
    const setupSecretStatus = await getSetupSecretStatus();
    if (!setupSecretStatus.ok) return res.status(503).json({ error: `Setup ist nicht konfiguriert: ${setupSecretStatus.key}` });

    const validation = validateAdminSetup({
      setupSecret: req.body.setup_secret,
      expectedSecret: setupSecretStatus.value,
      username: req.body.admin_username,
      displayName: req.body.admin_display_name,
      password: req.body.admin_password,
      passwordConfirm: req.body.admin_password_confirm
    });
    if (!validation.valid) {
      recordFailedSetup(req);
      return res.status(400).json({ errors: validation.errors });
    }
    if (store.findUserByUsername(req.body.admin_username)) {
      return res.status(409).json({ errors: { admin_username: "Dieser Benutzername existiert bereits." } });
    }

    const admin = await store.createFirstAdmin({
      username: String(req.body.admin_username).trim(),
      displayName: String(req.body.admin_display_name).trim(),
      email: String(req.body.admin_email || "").trim(),
      passwordHash: await hashPassword(String(req.body.admin_password))
    });
    log("info", "First admin created", { username: admin.username });
    await createSessionForUser(res, admin);
    res.status(201).json({ ok: true, user: publicUser(admin) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    if (store.setupRequired()) return res.status(403).json({ error: "Setup muss zuerst abgeschlossen werden." });
    const user = store.findUserByUsername(req.body.username);
    if (!user || !(await verifyPassword(String(req.body.password || ""), user.passwordHash))) {
      return res.status(401).json({ error: "Benutzername oder Passwort ist nicht korrekt." });
    }
    await createSessionForUser(res, user);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", withUser, async (req, res) => {
  await store.deleteSession(req.sessionTokenHash);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.put("/api/account", withUser, async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const displayName = String(req.body.displayName || "").trim();
    const email = String(req.body.email || "").trim();
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const passwordConfirm = String(req.body.passwordConfirm || "");
    const errors = {};

    if (!displayName) errors.displayName = "Anzeigename ist erforderlich.";
    if (!/^[a-zA-Z0-9._-]{3,48}$/.test(username)) {
      errors.username = "Nutze 3 bis 48 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich.";
    }
    const existing = store.findUserByUsername(username);
    if (existing && existing.id !== req.user.id) errors.username = "Dieser Benutzername existiert bereits.";
    if (email.length > 180) errors.email = "E-Mail ist zu lang.";

    const wantsPassword = Boolean(newPassword || passwordConfirm);
    if (wantsPassword) {
      if (!currentPassword) errors.currentPassword = "Aktuelles Passwort ist erforderlich.";
      if (!(await verifyPassword(currentPassword, req.user.passwordHash))) errors.currentPassword = "Aktuelles Passwort ist nicht korrekt.";
      if (newPassword.length < 12) errors.newPassword = "Das neue Passwort muss mindestens 12 Zeichen lang sein.";
      if (newPassword !== passwordConfirm) errors.passwordConfirm = "Die Passwörter stimmen nicht überein.";
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: "Accountdaten sind ungültig.", errors });

    const patch = { username, displayName, email };
    if (wantsPassword) patch.passwordHash = await hashPassword(newPassword);
    const user = await store.updateUser(req.user.id, patch);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/vpn-warning/dismiss", withUser, async (req, res) => {
  await store.dismissVpnWarning(req.user.id, bootId);
  res.json({ ok: true });
});

app.get("/api/torrents", withUser, async (_req, res, next) => {
  try {
    const [torrents, transfer] = await Promise.all([qb.torrents(), qb.transferInfo()]);
    res.json({ torrents: torrents.map(mapTorrent), transfer: mapTransfer(transfer) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/torrents/add", withUser, upload.single("torrent_file"), async (req, res, next) => {
  try {
    const value = String(req.body.torrent_value || "").trim();
    if (!value && !req.file) return res.status(400).json({ error: "Magnet-Link, Torrent-URL oder .torrent-Datei ist erforderlich." });
    await qb.add({ urls: value, file: req.file });
    log("info", "Torrent submitted", { user: req.user.username, mode: req.file ? "file" : "url" });
    res.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/torrents/:hash/pause", withUser, async (req, res, next) => {
  try {
    await qb.pause(req.params.hash);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/torrents/:hash/resume", withUser, async (req, res, next) => {
  try {
    await qb.resume(req.params.hash);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/torrents/:hash", withUser, async (req, res, next) => {
  try {
    await qb.remove(req.params.hash, req.query.deleteFiles === "true");
    log("info", "Torrent removed", { user: req.user.username, deleteFiles: req.query.deleteFiles === "true" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", withUser, async (_req, res, next) => {
  try {
    const [torrentPayload, ipPayload, qbStatus] = await Promise.allSettled([
      Promise.all([qb.torrents(), qb.transferInfo()]),
      publicIpInfo(),
      qb.ready()
    ]);
    const [torrents, transfer] = torrentPayload.status === "fulfilled" ? torrentPayload.value : [[], {}];
    res.json({
      stats: dashboardStats(torrents, transfer),
      ip: ipPayload.status === "fulfilled" ? ipPayload.value : { ok: false, error: ipPayload.reason?.message || "Nicht erreichbar" },
      qbittorrent: qbStatus.status === "fulfilled" ? qbStatus.value : { ok: false, error: "Nicht erreichbar" }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin", withAdmin, async (_req, res) => {
  const qbStatus = await qb.ready();
  res.json({
    app: {
      name: manifest.app_name,
      version: process.env.SEEDIKU_VERSION || "0.1.0",
      buildDate: process.env.SEEDIKU_BUILD_DATE || "local",
      githubSha: process.env.GITHUB_SHA || process.env.SEEDIKU_GITHUB_SHA || "",
      dataDir: env.dataDir,
      databaseStatus: store.ready ? "ok" : "unavailable",
      setupStatus: store.setupRequired() ? "required" : "completed",
      healthStatus: "ok",
      logLevel: env.logLevel,
      qbittorrent: qbStatus,
      qbittorrentUrl: qbStatus.url || env.qbUrl,
      qbittorrentWebUiUrl: env.qbWebUiUrl
    },
    logs: logs.slice(-120)
  });
});

app.get(["/setup", "/login", "/admin", "/downloads"], sendIndex);
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return sendIndex(req, res);
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  log(status >= 500 ? "error" : "warn", error.message, { status });
  res.status(status).json({ error: status >= 500 ? "Seediku konnte die Anfrage nicht abschließen." : error.message });
});

app.listen(env.port, () => {
  log("info", `Seediku listening on ${env.port}`);
});

async function getSetupSecretStatus() {
  const key = "ISHIKU_SETUP_SECRET_FILE";
  if (env.setupSecretFile) {
    try {
      const value = (await fs.readFile(env.setupSecretFile, "utf8")).trim();
      if (value) return { ok: true, value, source: key };
      return { ok: false, key };
    } catch (error) {
      if (error.code !== "ENOENT" || process.env.ISHIKU_SETUP_SECRET_FILE) return { ok: false, key };
    }
  }
  if (env.setupSecretFallback.trim()) return { ok: true, value: env.setupSecretFallback.trim(), source: "ISHIKU_SETUP_SECRET" };
  return { ok: false, key: "ISHIKU_SETUP_SECRET" };
}

async function createSessionForUser(res, user) {
  const token = newSessionToken();
  const expiresAt = setSessionCookie(res, token, env.secureCookies);
  await store.createSession(user.id, tokenHash(token), expiresAt);
}

function withOptionalUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[sessionCookieName()];
  if (!token) return next();
  const hash = tokenHash(token);
  const session = store.getSessionByHash(hash);
  const user = session ? store.getUserById(session.userId) : null;
  if (user) {
    req.user = user;
    req.sessionTokenHash = hash;
  }
  return next();
}

function withUser(req, res, next) {
  withOptionalUser(req, res, () => {
    if (!req.user) return res.status(401).json({ error: "Login erforderlich." });
    return next();
  });
}

function withAdmin(req, res, next) {
  withUser(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Adminrechte erforderlich." });
    return next();
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    initials: initials(user.displayName || user.username)
  };
}

function initials(value) {
  return String(value || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function setupRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const state = setupAttempts.get(key) || { count: 0, until: 0 };
  if (state.until > now) return res.status(429).json({ error: "Zu viele Setup-Versuche. Bitte kurz warten." });
  req.setupAttemptKey = key;
  next();
}

function recordFailedSetup(req) {
  const key = req.setupAttemptKey || "unknown";
  const current = setupAttempts.get(key) || { count: 0, until: 0 };
  const count = current.count + 1;
  setupAttempts.set(key, { count, until: count >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
  log("warn", "Failed setup attempt", { key });
}

function mapTorrent(torrent) {
  return {
    hash: torrent.hash,
    name: torrent.name,
    progress: torrent.progress || 0,
    state: torrent.state,
    dlspeed: torrent.dlspeed || 0,
    upspeed: torrent.upspeed || 0,
    eta: torrent.eta,
    size: torrent.size || 0,
    ratio: torrent.ratio || 0,
    error: torrent.state?.includes("error") ? torrent.state : ""
  };
}

function mapTransfer(transfer) {
  return {
    dlInfoSpeed: transfer.dl_info_speed || 0,
    upInfoSpeed: transfer.up_info_speed || 0,
    dlInfoData: transfer.dl_info_data || 0,
    upInfoData: transfer.up_info_data || 0
  };
}

function dashboardStats(torrents, transfer) {
  const mapped = torrents.map(mapTorrent);
  return {
    activeDownloads: mapped.filter((torrent) => torrent.dlspeed > 0 || /downloading|stalledDL|metaDL/i.test(torrent.state || "")).length,
    downloadSpeed: transfer.dl_info_speed || 0,
    uploadSpeed: transfer.up_info_speed || 0,
    ratio: average(mapped.map((torrent) => torrent.ratio)),
    warnings: mapped.filter((torrent) => torrent.error).length,
    graph: mapped.slice(0, 12).map((torrent) => Math.round((torrent.progress || 0) * 100))
  };
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

async function publicIpInfo() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("https://ipapi.co/json/", { signal: controller.signal, headers: { "user-agent": "Seediku/0.1" } });
    if (!response.ok) throw new Error(`IP-Dienst ${response.status}`);
    const payload = await response.json();
    return {
      ok: true,
      ip: payload.ip || "",
      city: payload.city || "",
      region: payload.region || "",
      country: payload.country_name || payload.country || ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sendIndex(_req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
}

function log(level, message, details = {}) {
  const entry = { time: new Date().toISOString(), level, message, details };
  logs.push(entry);
  while (logs.length > 500) logs.shift();
  const levels = ["debug", "info", "warn", "error"];
  if (levels.indexOf(level) >= levels.indexOf(env.logLevel)) {
    console[level === "debug" ? "log" : level](`[${entry.time}] ${level.toUpperCase()} ${message}`, redact(details));
  }
}

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (/secret|password|token|cookie/i.test(key) ? "[redacted]" : item)));
}
