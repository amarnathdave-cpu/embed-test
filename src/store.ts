// Config persistence in localStorage (survives SSO/OIDC page reloads), plus the
// sessionStorage key used to guard against SSO redirect loops.
import { $i, $s } from './dom';

export const STORE = 'ts-embed-playground';
export const SSO_ATTEMPTS = 'ts-embed-sso-attempts'; // sessionStorage — SSO auto-resume loop guard

export const FIELDS = [
  'sdkVersion', 'host', 'authType', 'basicUser', 'basicPass', 'tokenUser',
  'tokenSource', 'authEndpoint', 'pasteToken', 'embedType', 'contentId',
] as const;

export const CHECKS = ['suppressNoCookie', 'detectCookie', 'disableRedirect', 'includePre'] as const;

// Older saved configs stored the enum KEY as authType; map to the enum VALUE.
const LEGACY_AUTH: Record<string, string> = { SSO: 'SSO_SAML', OIDC: 'SSO_OIDC' };

export function saveCfg(): void {
  const c: Record<string, unknown> = {};
  FIELDS.forEach((f) => { c[f] = $i(f).value; });
  CHECKS.forEach((f) => { c[f] = $i(f).checked; });
  localStorage.setItem(STORE, JSON.stringify(c));
}

export function readCfg(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(STORE) || '') || {}; } catch { return {}; }
}

/** Restore every field EXCEPT authType/sdkVersion, whose <select> options don't exist yet. */
export function loadCfg(): void {
  const c = readCfg();
  FIELDS.forEach((f) => { if (c[f] != null && f !== 'authType' && f !== 'sdkVersion') $i(f).value = c[f]; });
  CHECKS.forEach((f) => { if (c[f] != null) $i(f).checked = !!c[f]; });
}

/** Applied AFTER the auth-type dropdown is populated from the loaded SDK. */
export function restoreAuthType(): void {
  const c = readCfg();
  let v: string | undefined = c.authType;
  if (v && LEGACY_AUTH[v]) v = LEGACY_AUTH[v];
  const sel = $s('authType');
  if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
}
