import { isIP } from "node:net";

export async function publicIpInfo(config, options = {}) {
  let direct;
  const errors = [];
  for (const endpoint of config.publicIpEndpoints) {
    try {
      direct = await fetchIp(endpoint, false, options);
      break;
    } catch (error) {
      errors.push(error.message);
    }
  }

  let vpn;
  if (config.vpnIpUrl) {
    vpn = await fetchIp(config.vpnIpUrl, true, options).catch((error) => ({ error: error.message }));
  }

  const vpnIp = vpn?.ip || "";
  const directIp = direct?.ip || "";
  const vpnActive = Boolean(vpnIp) && (
    config.expectedVpnIps.length
      ? config.expectedVpnIps.includes(vpnIp)
      : Boolean(directIp && vpnIp !== directIp)
  );

  return {
    ok: Boolean(directIp || vpnIp),
    ip: vpnIp || directIp,
    directIp,
    vpnIp,
    vpnConfigured: Boolean(config.vpnIpUrl),
    vpnActive,
    provider: vpn?.provider || direct?.provider || "",
    disclosure: "Public IP checks contact the configured external service and may disclose the requesting address.",
    error: directIp || vpnIp ? "" : errors.join("; ") || vpn?.error || "Public IP services are unavailable."
  };
}

export async function fetchIp(value, allowInternalHttp, options = {}) {
  const url = new URL(value);
  if (url.username || url.password) throw new Error("Credentials in public IP endpoints are not allowed.");

  const internalHost = ["gluetun", "localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowInternalHttp && url.protocol === "http:" && internalHost)) {
    throw new Error("Rejected non-HTTPS public IP endpoint.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 3000);
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { "user-agent": "Seediku/0.1" }
    });
    if (!response.ok) throw new Error(`Public IP service returned ${response.status}.`);
    const text = await response.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch { payload = { ip: text.trim() }; }
    const ip = String(payload.ip || payload.public_ip || payload.query || "").trim();
    if (!isIP(ip)) throw new Error("Public IP service returned an invalid address.");
    return { ip, provider: url.origin };
  } finally {
    clearTimeout(timeout);
  }
}
