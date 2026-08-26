# ThoughtSpot Embed Playground

A single-page, build-free playground for exploring the [ThoughtSpot Visual Embed
SDK](https://github.com/thoughtspot/visual-embed-sdk) against **any** cluster.
Switch auth types, try each embed type, and watch the auth/cookie/iframe events
live — designed for learning how embedding + cookie propagation actually behave.

The SDK is loaded at runtime from the jsDelivr ESM CDN via a **dynamic `import()`**,
so there is **no build step and no `npm install`** for the app itself — and you can
**switch SDK versions from the UI** (see below).

## Run it

Serve the folder over HTTP (embedding does not work from a `file://` URL):

```bash
cd ts-embed-playground
python3 -m http.server 8000
#   or:  npx serve .
```

Open <http://localhost:8000>.

## SDK version selector & dynamic auth types

The **SDK version** dropdown (top of the sidebar) lists **every published version
of `@thoughtspot/visual-embed-sdk`, pulled live from the npm registry at runtime**
(via the jsDelivr data API) — so it stays current with no hardcoded list to
maintain. Pick a version and the app re-imports that exact build from the CDN;
**latest** is selected by default.

- **Stable only by default.** Tick **include pre-releases** to also list
  `-alpha`/`-beta`/etc. builds.
- **Offline-safe.** If the registry can't be reached, it falls back to a small
  built-in list so the app still works.
- **Reload** re-imports the currently selected version.

The **Auth type** dropdown is then populated **from that SDK's own `AuthType`
enum**, so the list always matches the version you loaded. This matters because
support changes across versions — e.g. `EmbeddedSSO` is present in older builds
but dropped in newer ones. Load an older version to get it back.

Because the options are built from the enum, each option's value is the SDK's
**actual enum value** (e.g. `SSO_SAML`, `SSO_OIDC`), not the enum key — which
avoids a subtle class of "auth silently does nothing" bugs.

## SDK config inspector

The bottom panel has two tabs:

- **Events** — the live event log (see [The event log](#the-event-log)).
- **SDK config** — the exact `init(embedConfig)` object and the per-embed
  `viewConfig` the app will pass to the SDK, rendered as JSON and updated as you
  edit the form. Use it to see precisely what's being sent — the quickest way to
  understand and debug a configuration.

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
Security settings** add the origin to these allowlists:

| Serving the app from | Origin to allowlist |
|---|---|
| Production (deployed) | `https://embed.app.thoughtspotdev.cloud` |
| Local dev | `http://localhost:8000` |

- **CSP visual embed hosts** (controls `frame-ancestors`) — add the origin.
- **CORS allowlist** — add the same origin.
- **Redirect / trusted redirect domains** — add the same origin. Needed for
  **SSO/OIDC/EmbeddedSSO**, or login fails with *"Target URL domain … invalid or
  not whitelisted."*

Use the full origin (scheme + host, no trailing path). Without CSP/CORS the iframe
loads blank with CSP errors — expected, not a bug in this app.

**More setup depends on the auth type** (cookie `SameSite=None` for cookie-based
flows; **IdP iframe embedding + Trusted Origins** for EmbeddedSSO). The full
cluster + IdP prerequisite matrix is in [`AUTH.md` §0](./AUTH.md#0-prerequisites-cluster-and-idp-setup).

## Auth types — what each one does

The dropdown is generated from the loaded SDK, so the exact list depends on the
version. The `AuthType` **enum value** column is what's actually sent to `init()`:

| Selection | Enum value | Mechanism |
|---|---|---|
| None | `None` | No SDK login; uses an existing cluster session (or public content). |
| Basic | `Basic` | POSTs username+password → session **cookie**. Dev/testing only. |
| TrustedAuthToken | `AuthServer` | Fetches a token, exchanges it for a session **cookie**. Fragile under 3rd-party-cookie blocking. |
| TrustedAuthTokenCookieless | `AuthServerCookieless` | Fetches a token, injects it into the iframe via `postMessage`. **No cookie** — the recommended embed path. |
| SSO / SAML | `SSO_SAML` | Full-page redirect to the SAML IdP and back. |
| OIDC | `SSO_OIDC` | Full-page redirect to `/callosum/v1/oidc/login` and back. |
| EmbeddedSSO | `EmbeddedSSO` | In-iframe SSO (no full-page redirect). **Only in versions that still expose it.** |

> Note the enum **keys ≠ values**: `AuthType.SSO === 'SSO_SAML'` and
> `AuthType.OIDC === 'SSO_OIDC'`. The app sends the value; passing the key
> (`'SSO'`/`'OIDC'`) makes the SDK skip the auth flow entirely.

Config is saved to `localStorage`, so after an SSO/OIDC redirect the page
re-initializes automatically from where you left off. Redirect SSO only
redirects when there is **no** active session; an existing session is honoured
in place.

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

The **Events** tab of the bottom panel logs two streams so you can see the whole
handshake:

- **`init()` auth emitter** — `SDK_SUCCESS`, `SUCCESS`, `FAILURE` (with
  `AuthFailureType`, e.g. `NO_COOKIE_ACCESS`), `LOGOUT`.
- **iframe events** — `AuthInit` (app confirmed its session), `NoCookieAccess`
  (3rd-party cookie blocked — the signal to switch to Cookieless), `AuthExpire`,
  `Load`, `Error`.

The status dot next to the title turns green on auth success, red on failure.

## Console access

While the page is open, `window.tsEmbed` is the current embed instance and
`window.TsEmbedSDK` is the **entire loaded SDK module** (whichever version you
selected) — `init`, `logout`, `AuthType`, `AuthStatus`, `EmbedEvent`, `HostEvent`,
the embed classes, etc. — for live experimentation.

## Files

- `index.html` — the entire app (config panel, embed host, event log).
- `token-server.mjs` — optional zero-dependency trusted-token minter for the
  cookieless/token auth flows.
