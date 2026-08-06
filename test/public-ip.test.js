import test from "node:test";
import assert from "node:assert/strict";
import { fetchIp, publicIpInfo } from "../src/public-ip.js";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body; }
  };
}

test("compares configured direct and Gluetun egress without exposing endpoint credentials", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ hasSignal: Boolean(options.signal), userAgent: options.headers["user-agent"] });
    return url.hostname === "gluetun"
      ? response(JSON.stringify({ ip: "198.51.100.20" }))
      : response(JSON.stringify({ ip: "198.51.100.10" }));
  };

  const result = await publicIpInfo({
    publicIpEndpoints: ["https://ip.example.test/current"],
    vpnIpUrl: "http://gluetun:8000/v1/publicip/ip",
    expectedVpnIps: []
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.directIp, "198.51.100.10");
  assert.equal(result.vpnIp, "198.51.100.20");
  assert.equal(result.vpnActive, true);
  assert.equal(result.provider, "http://gluetun:8000");
  assert.match(result.disclosure, /configured external service/);
  assert.deepEqual(seen, [
    { hasSignal: true, userAgent: "Seediku/0.1" },
    { hasSignal: true, userAgent: "Seediku/0.1" }
  ]);
});

test("uses the explicit expected VPN address list when configured", async () => {
  const fetchImpl = async (url) => response(url.hostname === "gluetun" ? "203.0.113.40" : "203.0.113.30");
  const result = await publicIpInfo({
    publicIpEndpoints: ["https://ip.example.test"],
    vpnIpUrl: "http://gluetun:8000",
    expectedVpnIps: ["203.0.113.99"]
  }, { fetchImpl });

  assert.equal(result.vpnActive, false);
});

test("rejects insecure external endpoints and credentials in endpoint URLs", async () => {
  await assert.rejects(() => fetchIp("http://ip.example.test", false), /non-HTTPS/);
  await assert.rejects(() => fetchIp("https://user:secret@ip.example.test", false), /Credentials/);
  await assert.rejects(() => fetchIp("http://example.test", true), /non-HTTPS/);
});

test("rejects invalid IP responses", async () => {
  await assert.rejects(
    () => fetchIp("https://ip.example.test", false, { fetchImpl: async () => response("not-an-ip") }),
    /invalid address/
  );
});

test("aborts an unresponsive endpoint within the configured timeout", async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
  });

  await assert.rejects(
    () => fetchIp("https://ip.example.test", false, { fetchImpl, timeoutMs: 10 }),
    /request aborted/
  );
});
