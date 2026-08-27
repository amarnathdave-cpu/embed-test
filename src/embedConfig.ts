// Builds the SDK embedConfig (for init) and the per-embed viewConfig (for the embed
// class) from the form. Shared by the run flow and the live config viewer.
import { $i, $s } from './dom';
import type { EmbedConfig } from './types';

/** The `embedConfig` passed to `init()`. Auth-type value is already the SDK enum value. */
export function buildConfig(): EmbedConfig {
  const authType = $s('authType').value;
  const cfg: EmbedConfig = {
    thoughtSpotHost: $i('host').value.trim().replace(/\/+$/, ''),
    authType,
    suppressNoCookieAccessAlert: $i('suppressNoCookie').checked,
    detectCookieAccessSlow: $i('detectCookie').checked,
    disableLoginRedirect: $i('disableRedirect').checked,
    logLevel: 'INFO',
  };
  if (authType === 'Basic') {
    cfg.username = $i('basicUser').value.trim();
    cfg.password = $i('basicPass').value;
  }
  if (authType === 'AuthServer' || authType === 'AuthServerCookieless') {
    const user = $i('tokenUser').value.trim();
    if (user) cfg.username = user;
    if ($s('tokenSource').value === 'paste') {
      const tok = $i('pasteToken').value.trim();
      cfg.getAuthToken = () => Promise.resolve(tok);
    } else {
      cfg.authEndpoint = $i('authEndpoint').value.trim();
    }
  }
  return cfg;
}

/** The `viewConfig` passed to `new <Type>Embed(container, viewConfig)`. */
export function embedOptions(type: string, id: string): Record<string, unknown> {
  const view = { frameParams: { width: '100%', height: '100%' } };
  switch (type) {
    case 'Liveboard': return { ...view, liveboardId: id };
    case 'Search': return { ...view, dataSource: id || undefined };
    case 'SearchBar': return { ...view, dataSource: id || undefined };
    case 'App': return { ...view, path: id || undefined };
    case 'Spotter': return { ...view, worksheetId: id };
    default: return view;
  }
}
