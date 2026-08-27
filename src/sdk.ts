// Loads the ThoughtSpot Visual Embed SDK at runtime from the jsDelivr CDN (so the
// version can be switched in the UI) and pulls the list of published versions from
// the npm registry. Holds the loaded module + version state for the rest of the app.
import { $, $s, $i } from './dom';
import { log } from './log';
import type { SDKModule } from './types';

const PKG = '@thoughtspot/visual-embed-sdk';
const CDN = (v: string): string => `https://cdn.jsdelivr.net/npm/${PKG}@${v}/dist/tsembed.es.js`;
const DATA_API = `https://data.jsdelivr.com/v1/packages/npm/${PKG}`; // CORS-enabled versions list
export const DEFAULT_VERSION = '1.51.0';
// Used only if the registry can't be reached (offline / API down).
const FALLBACK_VERSIONS = ['1.51.0', '1.42.0', '1.36.2', '1.31.0', '1.28.4', '1.25.0'];

let sdk: SDKModule | null = null;
let allVersions: string[] = [];
let latest = DEFAULT_VERSION;

export const getSDK = (): SDKModule | null => sdk;
export const getLatest = (): string => latest;

/** Load (or switch to) a specific SDK version. Returns whether it loaded. */
export async function loadSDK(version?: string): Promise<boolean> {
  const v = (version || DEFAULT_VERSION).trim();
  log('info', 'sdk', `loading ${PKG}@${v} …`);
  try {
    sdk = (await import(/* @vite-ignore */ CDN(v))) as SDKModule;
    window.TsEmbedSDK = sdk; // for console tinkering
    log('ok', 'sdk', `loaded v${v}`);
    return true;
  } catch (e) {
    log('err', 'sdk', `failed to load v${v}: ${errMsg(e)}`);
    return false;
  }
}

/** Pull the full list of published versions from the npm registry (via jsDelivr). */
export async function fetchVersions(): Promise<boolean> {
  try {
    const res = await fetch(DATA_API, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    latest = data?.tags?.latest || DEFAULT_VERSION;
    allVersions = (data?.versions || []).map((v: { version: string }) => v.version).filter(Boolean);
    if (!allVersions.length) throw new Error('empty version list');
    log('ok', 'versions', `fetched ${allVersions.length} versions from registry · latest ${latest}`);
    return true;
  } catch (e) {
    allVersions = FALLBACK_VERSIONS.slice();
    latest = DEFAULT_VERSION;
    log('warn', 'versions', `registry fetch failed (${errMsg(e)}) — using built-in fallback list`);
    return false;
  }
}

/** Fill the SDK-version <select> (stable-only unless "include pre-releases" is on). */
export function populateVersions(preferred?: string): void {
  const sel = $s('sdkVersion');
  const includePre = $i('includePre').checked;
  const list = allVersions.filter((v) => includePre || !v.includes('-'));
  if (preferred && !list.includes(preferred)) list.unshift(preferred); // keep a saved/custom pick visible
  sel.innerHTML = '';
  for (const v of list) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === latest ? `${v}  (latest)` : v;
    sel.appendChild(opt);
  }
  const want = preferred && list.includes(preferred) ? preferred : list.includes(latest) ? latest : list[0];
  if (want) sel.value = want;
  const hidden = allVersions.filter((v) => v.includes('-')).length;
  $('versionHint').textContent =
    `${list.length} versions from the npm registry (newest first)` +
    (includePre ? '' : ` · ${hidden} pre-releases hidden`) +
    '. Auth types reflect the loaded version.';
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
