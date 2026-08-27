# Cookie management in ThoughtSpot embedding — end to end

A backend-oriented reference for how session state survives (or dies) between
the host app, the embedded ThoughtSpot app, the iframe boundary, and the
browser's cookie rules. Written to be read top-to-bottom once, then used as a
lookup.

---

## 0. The cast

| Actor | Where it runs | What it is |
|---|---|---|
| **Host app** | top-level page, e.g. `https://customer.com` or `http://localhost:5173` | your site — the *parent* of the iframe |
| **Visual Embed SDK** | in the **host app** (parent) | JS you call `init()` on; does auth *before* the iframe, talks to the iframe over `postMessage` |
| **TSE** (ThoughtSpot Embedded app) | inside the **iframe**, origin = the cluster | the actual ThoughtSpot web app (blink-v2 / prism) rendered in the frame |
| **callosum** | the cluster backend | issues/validates the session, sets the cookie (`HTTPLogin`, `OIDCClient`) |
| **Browser** | — | the referee that decides whether a cookie is stored and sent |

The whole problem is a negotiation between the **browser's cookie rules** and the
fact that **TSE runs on a different origin than the host app**.

---

## 1. The browser cookie model (the part backend folks skip)

A cookie is `(name, value)` + attributes. The attributes are the entire game:

| Attribute | Meaning | Why it matters for embedding |
|---|---|---|
| `Domain` / host-only | which host the cookie belongs to | the cluster cookie belongs to `*.thoughtspot.cloud`, **not** your host app |
| `Path` | URL path scope | callosum uses `/` |
| `Secure` | only sent over HTTPS | **mandatory** for `SameSite=None` |
| `HttpOnly` | JS cannot read it (`document.cookie` won't show it) | this is why the SDK can't "just grab the cookie and forward it" → tokens exist |
| `SameSite` | `Strict` / `Lax` / `None` — when to send on cross-site requests | **the single most important attribute for embedding** |
| `Partitioned` | CHIPS — isolate the cookie per top-level site | the modern replacement for third-party cookies |

### First-party vs third-party — the core distinction

The browser classifies every cookie access by **site context**, defined by the
**top-level document's site**, not by who makes the request.

- You visit `https://my-cluster.thoughtspot.cloud` directly → top-level site is
  the cluster → its cookie is **first-party**. Generous rules.
- You visit `https://customer.com`, which frames the cluster → top-level site is
  `customer.com`, but the cookie belongs to the cluster → inside that frame the
  cluster cookie is **third-party**. Strict rules.

> **The trap you already hit:** "I'm logged into the cluster, so the embed should
> work." You were logged in *first-party*. Inside the iframe the exact same
> cookie is *third-party*, and the browser may refuse to send it. Being logged in
> and the iframe being logged in are two different questions.

### `SameSite` decoded

- `SameSite=Strict` — never sent cross-site. Useless for embedding.
- `SameSite=Lax` (browser default when omitted) — sent only on top-level
  navigations, **not** on embedded sub-resource/iframe requests. Also useless for
  embedding.
- `SameSite=None; Secure` — sent on cross-site requests **including from
  iframes**. This is the *minimum* for cookie-based embedding. ThoughtSpot sets
  this.

But `SameSite=None` alone is not enough anymore, because browsers now block
third-party cookies **regardless of SameSite**:

### The third-party cookie phase-out (why this whole doc exists)

| Browser | Third-party cookies |
|---|---|
| **Safari** (ITP) | **Blocked by default since ~2020.** `SameSite=None` does not help. |
| **Firefox** (ETP) | Blocked by default (Total Cookie Protection partitions them). |
| **Chrome / Edge** | Phasing out; blocked for a growing share of users; blocked in Incognito. Controlled by the site-settings toggle and enterprise policy. |

So a `SameSite=None; Secure` third-party cookie is a cookie that **works in some
browsers and silently fails in others** — which is exactly the flakiness that
makes embedding painful.

---

## 2. What ThoughtSpot actually sets (from the callosum source)

Session cookie is built in
`callosum/server/.../services/session/HTTPLogin.java → populateClientSessionCookie()`:

- **Name:** `JSESSIONID` (Shiro session cookie, `CallosumSessionCookie`)
- **Path:** `/`
- **HttpOnly:** yes (so JS / the SDK cannot read it)
- **Secure:** set when the request came over HTTPS **and** `ConfigInfo.isSecureCookie()`
- **SameSite=None:** applied at the cookie-serving layer (documented in the v2
  `openapi.yaml`: `JSESSIONID=<id>; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=…`)
- **Partitioned:** the string `"; Partitioned"` is appended **iff**
  `ConfigInfo.isEnablePartitionedCookies()` is true.

```java
String cookieVal = currentSession.getId().toString();
if (configInfo.isEnablePartitionedCookies()) {
    cookieVal = cookieVal + "; Partitioned";     // CHIPS
}
cookie.setValue(cookieVal);
cookie.setSecure(https && configInfo.isSecureCookie());
```

There's a second cookie (`CALLOSUM_COOKIE_CLIENT_ID`) that also gets `Partitioned`
under the same flag.

**Backend takeaway:** whether embedding works in a 3PC-blocking browser is
gated by a **cluster config flag** (`isEnablePartitionedCookies`) plus the
browser — not by anything in your host app's code.

---

## 3. Partitioned cookies (CHIPS) — how they actually behave

CHIPS = *Cookies Having Independent Partitioned State*. A partitioned cookie is
stored under a **compound key**:

```
(cookie host = *.thoughtspot.cloud , top-level site = customer.com)
```

Requirements: must be `Secure`, `SameSite=None`, and `Partitioned`.

Consequences you must internalize:

1. **Browsers allow partitioned cookies even while blocking normal third-party
   cookies.** This is the sanctioned path forward — Chrome/Safari let CHIPS
   through because it can't be used for cross-site tracking (each top-level site
   gets its own isolated jar).
2. **The partition key is the top-level site.** The cluster embedded in
   `customer-A.com` and in `customer-B.com` get **separate, isolated** session
   cookies. Good for isolation; means no cookie sharing across host apps.
3. **The subtle gotcha (you nearly hit this):** a cookie set while visiting the
   cluster **first-party** lives in the partition `(cluster, cluster)`. The same
   cluster embedded under `customer.com` reads the partition
   `(cluster, customer.com)` — a **different jar**. So "log into the cluster in
   another tab, then embed" does **not** reliably populate the embedded
   partition. The session has to be established **from within the embedded
   context** for the partitioned cookie to land in the right jar.
4. This is precisely why top-level SSO redirects and partitioned cookies interact
   awkwardly, and why **cookieless is often simpler** than getting CHIPS right.

---

## 4. The four strategies, ranked

### Strategy A — Make ThoughtSpot first-party (custom domain / reverse proxy) ★ best
Serve the cluster under **your** domain, e.g. `analytics.customer.com`
(ThoughtSpot custom-domain / vanity URL, or your own reverse proxy). Now the
iframe origin and the host app share a site → the cookie is **first-party** →
none of the third-party rules apply. This *deletes* the problem instead of
working around it. Downside: DNS/cert/proxy setup, and it must be a real
same-site relationship (subdomain of the host app's registrable domain).

### Strategy B — Partitioned cookie (CHIPS) ★ good, modern
Turn on `isEnablePartitionedCookies` on the cluster. Cookie-based auth keeps
working in 3PC-blocking browsers because the cookie is partitioned. Watch the
gotcha in §3.3 — the session must be established in the embedded context.

### Strategy C — `SameSite=None; Secure` third-party cookie ★ legacy, dying
Works only where third-party cookies are still allowed (some Chrome, never
Safari). Fine for a quick internal demo; **not** a production strategy anymore.
This is what "allow third-party cookies for this site" in Chrome falls back to.

### Strategy D — Cookieless trusted token ★ most robust, no cookie at all
`AuthType.TrustedAuthTokenCookieless`. No session cookie is ever used:

- SDK fetches a bearer token from *your* auth server (`authEndpoint` /
  `getAuthToken`), validates it, injects it into TSE via the `APP_INIT`
  `postMessage` handshake, and refreshes it on `AuthExpire`.
- Every request carries `Authorization: Bearer <token>` instead of a cookie
  (`tokenizedFetch` in the SDK).
- callosum detects this and **actively suppresses cookies**:
  - `CallosumAccessControlFilter` sees a bearer token **or** `Sec-Fetch-Dest: iframe`
    → `setCookielessAuth(true)`.
  - `CallosumResponseHeaderFilter` strips `Set-Cookie: JSESSIONID` from responses.
  - `RequestInitializeFilter` strips `JSESSIONID` from incoming requests.

Because there is no cookie, there is nothing for the browser's third-party rules
to block. This is why it's the recommended production embed path.

---

## 5. Decision guide

```
Can you serve TS under the host app's own domain (subdomain/proxy)?
  └─ yes → Strategy A (first-party). Done. Simplest runtime behavior.
  └─ no  → Do you control an auth/token server?
             └─ yes → Strategy D (cookieless token). Most robust, browser-proof.
             └─ no  → Enable Partitioned cookies on the cluster → Strategy B (CHIPS).
                       (Strategy C only for throwaway demos.)
```

Rule of thumb: **A > D > B > C**. If someone says "embedding is flaky in Safari",
the answer is almost always "you're on C; move to D or A".

---

## 6. How to observe it in DevTools (make the invisible visible)

1. **Network tab → pick a request from the iframe to the cluster** (e.g.
   `session/isactive`, `session/info`).
   - **Request Headers → `Cookie`**: is `JSESSIONID` present? If absent, the
     browser withheld the third-party cookie → that's your failure.
   - **Response Headers → `Set-Cookie`**: read the live attributes
     (`SameSite`, `Secure`, `Partitioned`).
   - A blocked cookie shows a yellow warning icon; hover for the reason.
2. **Application tab → Cookies → the cluster origin.**
   - Modern Chrome shows a **Partition Key** column — that tells you whether the
     cookie is CHIPS-partitioned and under which top-level site.
3. **`document.cookie` in the iframe console** will **not** show `JSESSIONID`
   (it's `HttpOnly`) — don't be fooled into thinking it's missing. Use the
   Network/Application tabs, not `document.cookie`.
4. **The `NoCookieAccess` event** — TSE fires it when it can't read/send its
   cookie. In the playground it shows as `iframe:NoCookieAccess` and as
   `FAILURE type=NO_COOKIE_ACCESS`.

---

## 7. Hands-on experiments (use this playground)

| # | Setup | What to watch | Lesson |
|---|---|---|---|
| 1 | `authType: None`, no cluster login | login redirect → refused-to-connect | `None` needs an existing session that reaches the frame |
| 2 | `authType: OIDC`, fresh browser | top-level redirect → `AuthInit` → `SUCCESS` | SSO/OIDC login must run top-level, not in the frame |
| 3 | After #2, open DevTools → Network → check the `Cookie` header on an iframe→cluster call | `JSESSIONID` present or absent | proves whether you're on a working cookie path |
| 4 | Chrome: block third-party cookies (Incognito is easiest) + cookie auth | `iframe:NoCookieAccess` / `FAILURE` | reproduces the Safari-style failure on demand |
| 5 | Same as #4 but `TrustedAuthTokenCookieless` + a token | `AuthInit` → `SUCCESS`, no cookie in headers | cookieless is immune to 3PC blocking |
| 6 | Safari, cookie auth vs cookieless | cookie fails, cookieless works | the definitive A/B for why D exists |

---

## 8. One-paragraph summary

Embedding is fundamentally a **third-party cookie problem**: TSE runs on the
cluster's origin inside your host app, so its `JSESSIONID` is third-party and the
browser increasingly refuses to send it. ThoughtSpot sets that cookie
`SameSite=None; Secure; HttpOnly` and, when a cluster flag is on, `Partitioned`
(CHIPS) so it survives third-party-cookie blocking per top-level site. You either
**remove** the problem (serve TS first-party under your own domain), **partition**
around it (CHIPS), or **sidestep it entirely** with a cookieless bearer token that
the SDK injects into the iframe over `postMessage` and callosum honors while
stripping cookies. Master the DevTools cookie/Network view and you can always see
which of these you're on.
