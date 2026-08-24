# ThoughtSpot Embed Playground

A single-page, build-free playground for exploring the [ThoughtSpot Visual Embed
SDK](https://github.com/thoughtspot/visual-embed-sdk) against **any** cluster.
Switch auth types, try each embed type, and watch the auth/cookie/iframe events
live — designed for learning how embedding + cookie propagation actually behave.

The SDK is loaded straight from the jsDelivr ESM CDN (`@thoughtspot/visual-embed-sdk@1.51.0`),
so there is **no build step and no `npm install`** for the app itself.

## Run it

Serve the folder over HTTP (embedding does not work from a `file://` URL):

```bash
cd ts-embed-playground
python3 -m http.server 8000
#   or:  npx serve .
```

Open <http://localhost:8000>.

## Prerequisite on the cluster (one-time, done by an admin)

The cluster must be told to trust your dev origin, or the browser will refuse to
frame it / call it. In **Develop → Customizations → Security settings** add your
origin to the allowlists:

- **CSP visual embed hosts** (controls `frame-ancestors`): `http://localhost:8000`
- **CORS allowlist**: `http://localhost:8000`

Without this the iframe loads a blank/blocked page and you'll see CSP errors in
the console — that's expected, not a bug in this app.

## Auth types — what each one does

| Selection | SDK `AuthType` | Mechanism |
|---|---|---|
| None | `None` | No SDK login; uses an existing cluster session (or public content). |
| Basic | `Basic` | POSTs username+password → session **cookie**. Dev/testing only. |
| TrustedAuthToken | `AuthServer` | Fetches a token, exchanges it for a session **cookie**. Fragile under 3rd-party-cookie blocking. |
| TrustedAuthTokenCookieless | `AuthServerCookieless` | Fetches a token, injects it into the iframe via `postMessage`. **No cookie** — the recommended embed path. |
| SSO / SAML | `SSO` | Full-page redirect to the SAML IdP and back. |
| OIDC | `OIDC` | Full-page redirect to `/callosum/v1/oidc/login` and back. |

Config is saved to `localStorage`, so after an SSO/OIDC redirect the page
re-initializes automatically from where you left off.

## Exploring the cookieless path

`TrustedAuthToken*` needs a token source. Two options in the UI:

1. **Paste a token** — quickest. Mint one with
   `POST /api/rest/2.0/auth/token/full` (Playground → REST API, or the token
   server below) and paste it in.
2. **Auth endpoint URL** — point the SDK at a server that returns a token as
   plain text. Use the bundled `token-server.mjs` so the token secret never
   touches the browser:

   ```bash
   TS_HOST=https://my-cluster.thoughtspot.cloud \
   TS_USERNAME=embed_user \
   TS_SECRET_KEY=<cluster token secret> \
   node token-server.mjs
   ```

   Then set **Auth endpoint** to `http://localhost:5005/token`.

## The event log

The bottom panel logs two streams so you can see the whole handshake:

- **`init()` auth emitter** — `SDK_SUCCESS`, `SUCCESS`, `FAILURE` (with
  `AuthFailureType`, e.g. `NO_COOKIE_ACCESS`), `LOGOUT`.
- **iframe events** — `AuthInit` (app confirmed its session), `NoCookieAccess`
  (3rd-party cookie blocked — the signal to switch to Cookieless), `AuthExpire`,
  `Load`, `Error`.

The status dot next to the title turns green on auth success, red on failure.

## Console access

While the page is open, `window.tsEmbed` is the current embed instance and
`window.TsEmbedSDK` holds `{ init, AuthType, AuthStatus, EmbedEvent, HostEvent }`
for live experimentation.

## Files

- `index.html` — the entire app (config panel, embed host, event log).
- `token-server.mjs` — optional zero-dependency trusted-token minter for the
  cookieless/token auth flows.
