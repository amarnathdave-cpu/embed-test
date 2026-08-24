# ThoughtSpot embedding — the auth flow, end to end

Companion to `COOKIES.md`. That doc explains *how the credential is carried*
(cookies vs tokens); this one explains *the full journey of getting
authenticated pixels into the iframe*, for every auth type.

Read `COOKIES.md` §0 for the cast (host app, SDK, TSE, callosum, browser). The
one-line recap: the **SDK runs in your parent page**, **TSE runs inside the
iframe on the cluster origin**, and they talk over `postMessage`.

---

## 1. The universal skeleton (true for every auth type)

Embedding auth always has the same five phases. **Only Phase 1 changes** between
auth types — everything else is identical.

```
Phase 0  init(config)            — you configure the SDK (host app)
Phase 1  authenticate()          — SDK establishes auth IN THE PARENT WINDOW  ← the only phase that differs
Phase 2  render iframe           — SDK creates <iframe src=cluster>
Phase 3  APP_INIT handshake      — TSE boots, asks parent for init data (incl. token)
Phase 4  AuthInit → SUCCESS      — TSE confirms its session is live
Phase 5  runtime                 — token refresh / expiry / logout
```

Why auth happens in the **parent** first (Phase 1 before Phase 2): so that by the
time the iframe loads the cluster, a session/token already exists. Doing login
*inside* the iframe fails — either the cookie is third-party (blocked) or the IdP
login page refuses to be framed.

### Code anchors (Visual Embed SDK)
- `init()` → `handleAuth()` → `authenticate(config)` — `src/base.ts`, `src/auth.ts:579`
- Dispatch on `authType` → `doTokenAuth` / `doCookielessTokenAuth` / `doSamlAuth`
  / `doOIDCAuth` / `doBasicAuth`
- `isLoggedIn()` → `GET /callosum/v1/session/isactive`
- iframe build → `createIframeEl()` (`src/embed/ts-embed.ts`)
- `APP_INIT` responder injecting the token → `appInitCb` / `getDefaultAppInitData`
- request credential choice → `src/tokenizedFetch.ts`

---

## 2. Phase 1 for each auth type

Phase 1 answers two questions: **(a) how is the credential obtained**, and
**(b) does a cookie or a token carry it afterward**.

| AuthType (enum value) | Phase-1 mechanism | Carrier |
|---|---|---|
| `None` | nothing — assume a session already exists | cookie (pre-existing) |
| `Basic` (`Basic`) | `POST /callosum/v1/session/login` (user+pass) | cookie |
| `TrustedAuthToken` (`AuthServer`) | fetch token from your server → `POST /session/login/token` | cookie |
| `TrustedAuthTokenCookieless` (`AuthServerCookieless`) | fetch token, keep it in the SDK | **token** (no cookie) |
| `SSO` / `SAML` (`SSO`) | full-page redirect to SAML IdP → back | cookie |
| `OIDC` (`OIDC`) | full-page redirect to `/callosum/v1/oidc/login` → IdP → back | cookie |

### 2a. `None`
SDK does no login. TSE relies on an existing cluster session cookie reaching the
iframe. Works only if you're already logged in **and** the cookie is first-party
or partitioned (see COOKIES.md). On a fresh browser against an SSO cluster this
fails: TSE is unauthenticated → tries to redirect to login → the login page
can't be framed → "refused to connect".

### 2b. `Basic`
`fetchBasicAuthService()` → `POST /callosum/v1/session/login` with
`username`+`password`, `credentials: 'include'`. callosum sets `JSESSIONID`.
Dev/testing only — you're putting cluster credentials in browser JS.

### 2c. `TrustedAuthToken` (cookie-based token login)
1. SDK gets a token: either `authEndpoint` (SDK does `fetch(authEndpoint)`) or
   your `getAuthToken()` callback. **Your server** mints it via
   `POST /api/rest/2.0/auth/token/full` using a `secret_key` — the secret never
   touches the browser.
2. SDK validates it: `GET /session/isactive` with `Authorization: Bearer <token>`,
   `credentials: 'omit'` (`verifyTokenService`).
3. SDK exchanges it for a session: `POST /callosum/v1/session/login/token`
   (`fetchAuthPostService`), `credentials: 'include'`, `redirect: 'manual'`.
   Success is a 302/opaqueredirect. callosum sets `JSESSIONID`.
4. From here it's cookie-based — subject to all third-party-cookie rules.

### 2d. `TrustedAuthTokenCookieless` (the important one)
1. Same token acquisition as 2c (`authEndpoint` / `getAuthToken`).
2. **No login exchange, no cookie.** The SDK just holds the token.
3. The token is handed to TSE in Phase 3 via `APP_INIT`, and every subsequent
   request uses `Authorization: Bearer <token>` (`tokenizedFetch`). callosum runs
   its cookieless path (strips `Set-Cookie`; see COOKIES.md §4-D).
4. Because there's no cookie, third-party-cookie blocking is irrelevant. This is
   the recommended production path.

### 2e / 2f. `SAML` and `OIDC` (redirect SSO) — full sequence below
Both do a **top-level page redirect** (`window.location.href = ssoURL`), not an
iframe navigation. OIDC is the IAM-v2 path (`OIDCClient` on the backend).

---

## 3. OIDC end to end (IAM v2) — the full sequence

This is the flow you'll see most on modern clusters. Actors: **B**rowser top
window, **S**DK, **C**allosum, **I**dP (Okta), **T**SE (iframe).

```
1.  You: init({ authType: OIDC, thoughtSpotHost }) in the host app
2.  S:   authenticate() → doOIDCAuth() → isLoggedIn()?  GET /session/isactive
           └─ 200 → already logged in, skip to Phase 2
           └─ 401 → continue
3.  S:   window.location.href =
           {host}/callosum/v1/oidc/login?targetURLPath=<back-to-host-app>&forceSAMLAutoRedirect=true
         (TOP-LEVEL navigation — the whole page leaves your app)
4.  C:   OIDCClient.getAuthorizeUrl() reads targetURLPath, detects embedded SSO,
         → 307 to  https://identity.<...>/oauth2/.../authorize?...&redirect_uri={host}/callosum/v1/oidc/callback&state=...
5.  I:   user authenticates (or SSO session reused) → 302 back to the callback with ?code=...
6.  C:   /callosum/v1/oidc/callback → OIDCClient.exchangeCodeForToken()
           → validates ID/access token → OIDCLogin (extends HTTPLogin)
           → creates session, Set-Cookie: JSESSIONID=…; SameSite=None; Secure; HttpOnly[; Partitioned]
         (cookie is set here as FIRST-PARTY, because the top-level page is the cluster)
7.  C:   302 back to targetURLPath → your host app URL, decorated with the SSO marker GUID
8.  S:   page reloads; SDK re-runs; isAtSSORedirectUrl()==true → strips the marker,
         isLoggedIn() now 200 → loggedInStatus=true → notifyAuthSDKSuccess()  (AuthStatus.SDK_SUCCESS)
9.  S:   Phase 2 — createIframeEl(), src = {host}/v2/?embedApp=true&authType=OIDC...#/embed/...
10. T:   iframe loads; TSE boots; sends EmbedEvent.APP_INIT up to the parent
11. S:   appInitCb responds with init data (customisations, filters, hostConfig, ...)
12. T:   TSE confirms session → EmbedEvent.AuthInit → SDK notifyAuthSuccess()
           → getSessionInfo() → AuthStatus.SUCCESS(sessionInfo)   ← you saw "user=..." here
13. runtime: TSE requests carry the JSESSIONID cookie cross-site
            (works iff first-party / partitioned / 3PC allowed — else NoCookieAccess)
```

**Key insight:** steps 3–7 are all **top-level** (that's why your whole page
navigated to Okta and back). The iframe (steps 9+) only appears *after* the
cookie is already set. The IdP login page is never framed — which is exactly why
you can't do SSO with `authType: None`.

Backend anchors: `OIDCClient.getAuthorizeUrl / exchangeCodeForToken`,
`OIDCLogin` (extends `HTTPLogin`), `HTTPLogin.populateClientSessionCookie`.

SAML is identical in shape, via `/callosum/v1/saml/login?targetURLPath=...` and
`doSamlAuth`. `inPopup: true` swaps the top-level redirect for a popup window
that posts the result back with `EmbedEvent.SAMLComplete`.

---

## 4. Cookieless end to end — the full sequence

No redirect, no cookie. Your auth/token server does the heavy lifting.

```
1.  You: init({ authType: TrustedAuthTokenCookieless, getAuthToken })
2.  S:   authenticate() → doCookielessTokenAuth() → getAuthenticationToken()
           → getAuthToken()  (your callback) OR fetch(authEndpoint)
           → validateAuthToken() via /session/isactive with Bearer (credentials: omit)
           → cache token in-window
3.  S:   Phase 2 — createIframeEl(), src includes cookieless=true & authType
4.  T:   iframe loads; TSE sends EmbedEvent.APP_INIT
5.  S:   appInitCb → getDefaultAppInitData() → getAuthTokenForCookielessInit()
           → returns { authToken, ... } in the APP_INIT response  (token crosses into the iframe here)
6.  T:   TSE uses the token; EmbedEvent.AuthInit → AuthStatus.SUCCESS
7.  T→S: on expiry, TSE emits EmbedEvent.AuthExpire / RefreshAuthToken
8.  S:   refreshAuthTokenForCookieless() → getAuthenticationToken(force) → responder posts a fresh token back
         (user never gets logged out)
9.  runtime: every request carries Authorization: Bearer <token>;
            callosum (CallosumAccessControlFilter) sees the bearer token /
            Sec-Fetch-Dest: iframe → cookieless path, strips Set-Cookie.
```

Your token server (see `token-server.mjs`) is the trust root: it holds the
`secret_key` and calls `POST /api/rest/2.0/auth/token/full`. In production, that
server would authenticate the end-user in *your* system first, then mint a
ThoughtSpot token scoped to that user.

---

## 5. The parent ↔ iframe channel (how Phase 3–5 physically work)

Two origins can't share memory, so all cross-boundary auth data moves over
`postMessage`, with strict controls:

- **Inbound (TSE → SDK):** the SDK only accepts a message if
  `event.source === iframe.contentWindow`. That's the origin check.
- **Outbound (SDK → TSE):** `iframe.contentWindow.postMessage(msg, thoughtSpotHost, [port2])`
  — `targetOrigin` pinned to the cluster (never `*`), plus a `MessageChannel`
  port for the reply.
- The **token itself** travels inside the `APP_INIT` reply payload — it is never
  put in a cookie or the URL for cookieless.

Events you can observe (all surfaced in the playground log):

| Layer | Event | Meaning |
|---|---|---|
| SDK auth emitter | `SDK_SUCCESS` | Phase 1 done in parent; iframe not up yet |
| SDK auth emitter | `SUCCESS(sessionInfo)` | Phase 4 — TSE session confirmed |
| SDK auth emitter | `FAILURE(type)` | type = `SDK` / `NO_COOKIE_ACCESS` / `EXPIRY` / `IDLE_SESSION_TIMEOUT` / ... |
| iframe | `AuthInit` | TSE confirmed its session |
| iframe | `NoCookieAccess` | TSE can't read/send its cookie (3PC blocked) |
| iframe | `AuthExpire` | session/token expired → triggers refresh |

---

## 6. Runtime: keeping the session alive

- **Cookie modes:** on `AuthExpire`, SDK re-runs `handleAuth()` (a fresh login).
- **Cookieless:** on `AuthExpire` / `RefreshAuthToken`, SDK fetches a new token
  and posts it into the iframe (`refreshAuthTokenForCookieless`). Set
  `refreshAuthTokenOnNearExpiry` so it refreshes *before* expiry.
- **Idle timeout:** `EmbedEvent.IdleSessionTimeout` → SDK re-auths and reports
  `AuthFailureType.IDLE_SESSION_TIMEOUT`.
- **Logout:** `logout()` → `POST /callosum/v1/session/logout`, clears cached
  token/services, replaces iframes with the login-failed message,
  `AuthStatus.LOGOUT`.

---

## 7. The mental model to keep

Every embed auth is: **(1) get a credential in the parent → (2) render the frame
→ (3) hand the session to TSE (cookie rides along, or token is injected via
postMessage) → (4) TSE confirms → (5) refresh forever.** Auth *types* differ only
in step 1 and in whether a cookie or a token is the carrier. Redirect SSO
(SAML/OIDC) does step 1 at the **top level** so the cookie is set first-party;
cookieless skips the cookie entirely and injects a token. Master those two — OIDC
redirect and cookieless — and the rest are variations.
