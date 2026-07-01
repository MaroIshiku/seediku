import crypto from "node:crypto";

const SESSION_COOKIE = "seediku_session";
const SESSION_DAYS = 14;
const PLACEHOLDER_PASSWORDS = new Set(["admin", "password", "passwort", "changeme", "change-me", "123456", "123456789", "ishiku"]);

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index === -1) return [item, ""];
        return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

export function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sessionExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  return expires;
}

export function setSessionCookie(res, token, secure = false) {
  const expires = sessionExpiry();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires
  });
  return expires.toISOString();
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, saltText, keyText] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  const actual = await scrypt(password, salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function validateAdminSetup({ setupSecret, expectedSecret, username, displayName, password, passwordConfirm }) {
  const errors = {};
  const normalizedUsername = String(username || "").trim();
  const normalizedDisplayName = String(displayName || "").trim();
  const secret = String(setupSecret || "");
  const expected = String(expectedSecret || "");
  const normalizedPassword = String(password || "").trim().toLowerCase();

  if (!secret.trim()) errors.setup_secret = "Setup-Secret ist erforderlich.";
  if (!expected.trim()) errors.setup_secret = "Setup ist nicht konfiguriert.";
  if (secret && expected && !timingSafeTextEqual(secret, expected)) errors.setup_secret = "Setup-Secret ist nicht korrekt.";
  if (!normalizedDisplayName) errors.admin_display_name = "Anzeigename ist erforderlich.";
  if (!normalizedUsername) errors.admin_username = "Admin-Benutzername ist erforderlich.";
  if (!/^[a-zA-Z0-9._-]{3,48}$/.test(normalizedUsername)) {
    errors.admin_username = "Nutze 3 bis 48 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich.";
  }
  if (String(password || "").length < 12) errors.admin_password = "Das Admin-Passwort muss mindestens 12 Zeichen lang sein.";
  if (password && setupSecret && password === setupSecret) errors.admin_password = "Das Admin-Passwort darf nicht mit dem Setup-Secret übereinstimmen.";
  if (normalizedPassword && PLACEHOLDER_PASSWORDS.has(normalizedPassword)) errors.admin_password = "Bitte verwende kein Platzhalter-Passwort.";
  if (normalizedPassword && ["seediku", "torrentloader", normalizedUsername.toLowerCase()].includes(normalizedPassword)) {
    errors.admin_password = "Das Admin-Passwort darf nicht App-Name, App-ID oder Benutzername sein.";
  }
  if (password !== passwordConfirm) errors.admin_password_confirm = "Die Passwörter stimmen nicht überein.";

  return { valid: Object.keys(errors).length === 0, errors };
}

export function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
