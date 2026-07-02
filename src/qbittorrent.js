import { setTimeout as delay } from "node:timers/promises";

export class QBittorrentClient {
  constructor(options = {}) {
    this.baseUrls = normalizeBaseUrls(options.baseUrl || "http://qbittorrent:8185");
    this.activeBaseUrl = this.baseUrls[0] || "http://qbittorrent:8185";
    this.username = options.username || "admin";
    this.password = options.password || "adminadmin";
    this.cookie = "";
    this.lastLoginAt = 0;
  }

  async ready() {
    try {
      const version = await this.request("/api/v2/app/version", { text: true, timeoutMs: 2500 });
      return { ok: true, version, url: this.activeBaseUrl };
    } catch (error) {
      return { ok: false, error: error.message, url: this.activeBaseUrl };
    }
  }

  async login(force = false) {
    if (!force && this.cookie && Date.now() - this.lastLoginAt < 15 * 60 * 1000) return;
    const body = new URLSearchParams({ username: this.username, password: this.password });
    const errors = [];
    for (const baseUrl of orderedUrls(this.baseUrls, this.activeBaseUrl)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: controller.signal
        });
        const text = await response.text();
        if (!response.ok || !/^Ok\.?$/i.test(text.trim())) {
          errors.push(`${baseUrl}: Login fehlgeschlagen (${response.status}, ${text.trim() || response.statusText})`);
          continue;
        }
        this.activeBaseUrl = baseUrl;
        this.cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
        this.lastLoginAt = Date.now();
        return;
      } catch (error) {
        errors.push(`${baseUrl}: ${formatFetchError(error)}`);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(`qBittorrent nicht erreichbar (${errors.join("; ")})`);
  }

  async request(path, options = {}) {
    const {
      method = "GET",
      body,
      headers = {},
      auth = true,
      text = false,
      timeoutMs = 10000,
      retry = true
    } = options;
    if (auth) await this.login();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.activeBaseUrl}${path}`, {
        method,
        headers: {
          ...headers,
          ...(auth && this.cookie ? { cookie: this.cookie } : {})
        },
        body,
        signal: controller.signal
      });
      if ((response.status === 401 || response.status === 403) && auth && retry) {
        this.cookie = "";
        await delay(100);
        await this.login(true);
        return this.request(path, { ...options, retry: false });
      }
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(`qBittorrent API ${response.status}: ${message || response.statusText}`);
      }
      if (text) return response.text();
      const payload = await response.text();
      return payload ? JSON.parse(payload) : {};
    } catch (error) {
      if (auth && retry) {
        this.cookie = "";
        this.lastLoginAt = 0;
        await delay(100);
        await this.login(true);
        return this.request(path, { ...options, retry: false });
      }
      throw new Error(formatFetchError(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  async configureDefaults() {
    const json = {
      max_ratio_enabled: true,
      max_ratio: 0,
      max_ratio_act: 1,
      max_seeding_time_enabled: true,
      max_seeding_time: 1,
      scan_dirs: {
        "/downloads/watch": 0
      },
      temp_path_enabled: true,
      temp_path: "/downloads/incomplete",
      save_path: "/downloads/complete"
    };
    const body = new URLSearchParams({ json: JSON.stringify(json) });
    return this.request("/api/v2/app/setPreferences", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      text: true
    });
  }

  async torrents() {
    return this.request("/api/v2/torrents/info");
  }

  async transferInfo() {
    return this.request("/api/v2/transfer/info");
  }

  async add({ urls, file }) {
    const form = new FormData();
    if (urls) form.append("urls", urls);
    if (file?.buffer?.length) {
      const blob = new Blob([file.buffer], { type: file.mimetype || "application/x-bittorrent" });
      form.append("torrents", blob, file.originalname || "upload.torrent");
    }
    form.append("savepath", "/downloads/complete");
    form.append("autoTMM", "false");
    form.append("ratioLimit", "0");
    form.append("seedingTimeLimit", "1");
    return this.request("/api/v2/torrents/add", { method: "POST", body: form, text: true, timeoutMs: 30000 });
  }

  async pause(hash) {
    const body = new URLSearchParams({ hashes: hash });
    return this.request("/api/v2/torrents/pause", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, text: true });
  }

  async resume(hash) {
    const body = new URLSearchParams({ hashes: hash });
    return this.request("/api/v2/torrents/resume", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, text: true });
  }

  async remove(hash, deleteFiles = false) {
    const body = new URLSearchParams({ hashes: hash, deleteFiles: String(Boolean(deleteFiles)) });
    return this.request("/api/v2/torrents/delete", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, text: true });
  }
}

function normalizeBaseUrls(value) {
  return String(value || "")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

function orderedUrls(urls, activeUrl) {
  const unique = urls.filter(Boolean);
  return [activeUrl, ...unique].filter((url, index, all) => url && all.indexOf(url) === index);
}

function formatFetchError(error) {
  if (error?.name === "AbortError") return "Timeout";
  const cause = error?.cause;
  const code = cause?.code || error?.code;
  const syscall = cause?.syscall ? `${cause.syscall} ` : "";
  const target = cause?.hostname || cause?.address || "";
  if (code) return `${syscall}${code}${target ? ` ${target}` : ""}`.trim();
  return error?.message || "fetch failed";
}
