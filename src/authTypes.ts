// Auth-type metadata + populating the dropdown from the loaded SDK's AuthType enum.
//
// The dropdown option value IS the SDK enum VALUE (e.g. 'SSO_SAML', not 'SSO'). The
// enum keys are NOT the values — AuthType.SSO === 'SSO_SAML', AuthType.OIDC ===
// 'SSO_OIDC' — so sending the key would make the SDK silently skip the auth flow.
// Building options straight from the enum avoids that whole class of bug.
import { $s } from './dom';
import { getSDK } from './sdk';
import type { AuthMeta } from './types';

export const AUTH_META: Record<string, AuthMeta> = {
  None: { label: 'None — existing session', hint: 'No SDK login. The iframe uses whatever session already exists (or public content).' },
  Basic: { label: 'Basic — username + password', hint: 'POSTs username/password to /callosum/v1/session/login. Sets a cookie. Dev/testing only.' },
  AuthServer: { label: 'TrustedAuthToken — token → cookie', hint: 'Fetches a token, exchanges it for a session COOKIE. Fragile under 3rd-party cookie blocking.' },
  AuthServerCookieless: { label: 'TrustedAuthTokenCookieless — token, no cookie', hint: 'Fetches a token and injects it into the iframe via postMessage. No cookie — the recommended embed path.' },
  SSO_SAML: { label: 'SSO / SAML — full-page redirect', hint: 'Redirects the WHOLE PAGE to /callosum/v1/saml/login, then back. Config restored from localStorage after the round-trip.' },
  SSO_OIDC: { label: 'OIDC — full-page redirect', hint: 'Redirects the WHOLE PAGE to /callosum/v1/oidc/login (forceSAMLAutoRedirect=true), then back.' },
  EmbeddedSSO: { label: 'EmbeddedSSO — in-iframe SSO', hint: 'SSO handled inside the iframe (no full-page redirect). Requires the IdP to allow iframe embedding.' },
};

const AUTH_ORDER = ['None', 'Basic', 'AuthServer', 'AuthServerCookieless', 'SSO_SAML', 'SSO_OIDC', 'EmbeddedSSO'];

/** Unique AuthType values exposed by the loaded SDK (this is the version-specific list). */
export function authValues(): string[] {
  const sdk = getSDK();
  if (!sdk?.AuthType) return [];
  const uniq = [...new Set(Object.values(sdk.AuthType))];
  return uniq.sort((a, b) => {
    const ia = AUTH_ORDER.indexOf(a), ib = AUTH_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

export function populateAuthTypes(): void {
  const sel = $s('authType');
  const prev = sel.value;
  sel.innerHTML = '';
  for (const val of authValues()) {
    const meta = AUTH_META[val] ?? { label: val, hint: '' };
    const opt = document.createElement('option');
    opt.value = val; // the option value IS the real SDK enum value
    opt.textContent = meta.label || val;
    sel.appendChild(opt);
  }
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}
