// Minimal, zero-dependency trusted-token server for exploring cookieless auth.
//
// The Visual Embed SDK's `authEndpoint` (for AuthType.TrustedAuthToken and
// TrustedAuthTokenCookieless) expects a URL that returns a bearer token as
// plain text. This tiny server mints one by calling the cluster's REST v2
// token API, so the token-generation secret NEVER ships to the browser.
//
// Requires Node 18+ (uses the built-in global fetch).
//
// Usage:
//   TS_HOST=https://my-cluster.thoughtspot.cloud \
//   TS_USERNAME=embed_user \
//   TS_SECRET_KEY=<cluster token secret>   \   # OR: TS_PASSWORD=<password>
//   node token-server.mjs
//
// Then in the playground set:
//   Auth type      = TrustedAuthTokenCookieless (or TrustedAuthToken)
//   Token source   = Auth endpoint URL
//   Auth endpoint  = http://localhost:5005/token
//
// A cluster admin generates the secret_key under Develop > Security settings.

import http from 'node:http';

const {
  TS_HOST,
  TS_USERNAME,
  TS_SECRET_KEY,
  TS_PASSWORD,
  TS_ORG_ID,
  PORT = 5005,
} = process.env;

if (!TS_HOST || !TS_USERNAME || (!TS_SECRET_KEY && !TS_PASSWORD)) {
  console.error('Set TS_HOST, TS_USERNAME, and TS_SECRET_KEY (or TS_PASSWORD).');
  process.exit(1);
}

const host = TS_HOST.replace(/\/+$/, '');

async function mintToken() {
  const body = {
    username: TS_USERNAME,
    validity_time_in_sec: 300,
    auto_create: false,
  };
  if (TS_ORG_ID) body.org_id = Number(TS_ORG_ID);
  if (TS_SECRET_KEY) body.secret_key = TS_SECRET_KEY;
  else body.password = TS_PASSWORD;

  const res = await fetch(`${host}/api/rest/2.0/auth/token/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Token API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

http.createServer(async (req, res) => {
  // Allow the browser SPA (any localhost origin) to fetch the token.
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (!req.url.startsWith('/token')) { res.writeHead(404).end('not found'); return; }
  try {
    const token = await mintToken();
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(token);
    console.log(`[${new Date().toISOString()}] minted token for ${TS_USERNAME}`);
  } catch (e) {
    console.error(e.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(e.message);
  }
}).listen(PORT, () => {
  console.log(`Trusted-token server on http://localhost:${PORT}/token → ${host}`);
});
