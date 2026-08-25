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

## Deploying — make a change, push, publish

This repo is connected to a Vercel project with **Git-based auto-deploy**, so
publishing is just `git push`. There is no manual deploy step and no `vercel`
command to remember.

- **GitHub repo:** <https://github.com/amarnathdave-cpu/embed-test>
- **Live URL (production):** <https://embed.app.thoughtspotdev.cloud>

### The everyday loop

```bash
# 1. Edit the app (index.html is the whole thing)
#    Preview locally first:
python3 -m http.server 8000        # → http://localhost:8000

# 2. Commit
git add -A
git commit -m "Describe your change"

# 3. Publish — pushing to main auto-deploys to production
git push
```

Within a few seconds of the push, Vercel builds and updates
<https://embed.app.thoughtspotdev.cloud>. Hard-refresh (empty cache) to see it.

### Safer: preview before it goes live

Push a **branch** instead of `main` and Vercel gives you a throwaway preview URL
(the change is NOT live on the production domain until you merge to `main`):

```bash
git checkout -b my-change
# ...edit, commit...
git push -u origin my-change        # → open a PR; Vercel comments a preview URL
```

Merge the PR into `main` → it auto-deploys to production.

### Keeping local in sync

If changes ever land on GitHub from elsewhere (e.g. a merged PR in the web UI),
pull before you start editing:

```bash
git pull
```

**Rule of thumb:** local, GitHub, and the live site stay in sync as long as every
change is a commit that you `git push`. Editing files without pushing means the
live site is behind; the deployed site is always whatever is on GitHub `main`.

## Prerequisite on the cluster (one-time, done by an admin)

The cluster must be told to trust the origin the app is served from, or the
browser will refuse to frame it / call it. In **Develop → Customizations →
Security settings** add the origin to both allowlists:

| Serving the app from | Origin to allowlist |
|---|---|
| Production (deployed) | `https://embed.app.thoughtspotdev.cloud` |
| Local dev | `http://localhost:8000` |

- **CSP visual embed hosts** (controls `frame-ancestors`) — add the origin.
- **CORS allowlist** — add the same origin.

Add whichever origin(s) you actually test from. Without this the iframe loads a
blank/blocked page and you'll see CSP errors in the console — that's expected,
not a bug in this app.

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
