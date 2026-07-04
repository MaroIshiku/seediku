import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_STATE = {
  version: 1,
  setupCompleted: false,
  users: [],
  sessions: [],
  meta: {
    createdAt: null,
    lastBootId: null,
    vpnWarningDismissals: {}
  }
};

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, "seediku-store.json");
    this.state = structuredClone(DEFAULT_STATE);
    this.ready = false;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
      this.state.meta = { ...structuredClone(DEFAULT_STATE.meta), ...(this.state.meta || {}) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state.meta.createdAt = new Date().toISOString();
      await this.save();
    }
    this.ready = true;
    return this;
  }

  async save() {
    const tmpPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tmpPath, this.filePath);
  }

  hasAdmin() {
    return this.state.users.some((user) => user.role === "admin");
  }

  setupRequired() {
    return !this.state.setupCompleted || !this.hasAdmin();
  }

  async createFirstAdmin(user) {
    if (this.hasAdmin() || this.state.setupCompleted) {
      throw Object.assign(new Error("Setup ist bereits abgeschlossen."), { status: 409 });
    }
    const now = new Date().toISOString();
    const admin = {
      id: crypto.randomUUID(),
      username: user.username,
      displayName: user.displayName,
      email: user.email || "",
      role: "admin",
      passwordHash: user.passwordHash,
      createdAt: now
    };
    this.state.users.push(admin);
    this.state.setupCompleted = true;
    this.state.meta.setupCompletedAt = now;
    await this.save();
    return admin;
  }

  findUserByUsername(username) {
    const normalized = String(username || "").trim().toLowerCase();
    return this.state.users.find((user) => user.username.toLowerCase() === normalized) || null;
  }

  getUserById(id) {
    return this.state.users.find((user) => user.id === id) || null;
  }

  async updateUser(userId, patch) {
    const user = this.getUserById(userId);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    await this.save();
    return user;
  }

  async createSession(userId, tokenHash, expiresAt) {
    this.state.sessions = this.state.sessions.filter((session) => new Date(session.expiresAt) > new Date());
    this.state.sessions.push({
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt
    });
    await this.save();
  }

  getSessionByHash(tokenHash) {
    const now = new Date();
    return this.state.sessions.find((session) => session.tokenHash === tokenHash && new Date(session.expiresAt) > now) || null;
  }

  async deleteSession(tokenHash) {
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => session.tokenHash !== tokenHash);
    if (before !== this.state.sessions.length) await this.save();
  }

  async updateBootId(bootId) {
    if (this.state.meta.lastBootId !== bootId) {
      this.state.meta.lastBootId = bootId;
      this.state.meta.vpnWarningDismissals = {};
      await this.save();
    }
  }

  async dismissVpnWarning(userId, bootId) {
    this.state.meta.vpnWarningDismissals[userId] = bootId;
    await this.save();
  }

  isVpnWarningDismissed(userId, bootId) {
    return this.state.meta.vpnWarningDismissals[userId] === bootId;
  }
}
