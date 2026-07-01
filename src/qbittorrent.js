import { setTimeout as delay } from "node:timers/promises";

export class QBittorrentClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "http://qbittorrent:8185").replace(/\/$/, "");
    this.username = options.username || "admin";
    this.password = options.password || "adminadmin";
    this.cookie = "";
    this.lastLoginAt = 0;
  }

  async ready() {
    try {
      const version = await this.request("/api/v2/app/version", { text: true, timeoutMs: 2500 });
      return { ok: true, version };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async login(force = false) {
    if (!force && this.cookie && Date.now() - this.lastLoginAt < 15 * 60 * 1000) return;
    const body = new URLSearchParams({ username: this.username, password: this.password });
    const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const text = await response.text();
    if (!response.ok || !/^Ok\.?$/i.test(text.trim())) {
      throw new Error(`qBittorrent Login fehlgeschlagen (${response.status})`);
    }
    this.cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
    this.lastLoginAt = Date.now();
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
      const response = await fetch(`${this.baseUrl}${path}`, {
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
