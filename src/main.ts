// Entry point: wires the UI events and boots the app.
import './styles.css';

import { $, $s, $i, $b, setDot } from './dom';
import { log, clearLog } from './log';
import { FIELDS, CHECKS, SSO_ATTEMPTS, saveCfg, loadCfg, readCfg, restoreAuthType } from './store';
import { getSDK, getLatest, loadSDK, fetchVersions, populateVersions } from './sdk';
import { populateAuthTypes, authValues } from './authTypes';
import { buildConfig } from './embedConfig';
import { syncForm } from './form';
import { renderConfigView } from './configView';
import { wireTabs } from './tabs';
import { wireAuth } from './auth';
import { renderEmbed, getCurrent, destroyCurrent } from './embed';

// ---- After the SDK (re)loads, refresh the auth-type UI from the loaded build. ----
function applyLoadedSDK(): void {
  populateAuthTypes();  // options straight from the SDK's AuthType enum
  restoreAuthType();    // re-select the saved auth type if this version still has it
  syncForm();
  renderConfigView();
  log('ok', 'sdk', `auth types: ${authValues().join(', ')}`);
}

/** Load a version and refresh the UI. NOTE: does not saveCfg (that would clobber the
 *  saved authType before restoreAuthType runs — callers save first when needed). */
async function loadAndApply(version: string): Promise<boolean> {
  const ok = await loadSDK(version);
  if (ok) applyLoadedSDK();
  return ok;
}

// ---- Initialize & Render ----
function run(): void {
  const sdk = getSDK();
  if (!sdk) { log('err', 'sdk', 'SDK not loaded yet — set a valid version and click Load'); return; }
  saveCfg();
  const cfg = buildConfig();
  if (!cfg.thoughtSpotHost) { log('err', 'config', 'Cluster URL is required'); return; }
  setDot('');
  renderConfigView();
  log('info', 'init', `sdk=${$s('sdkVersion').value} authType=${cfg.authType} host=${cfg.thoughtSpotHost}`);
  try {
    const authEE = sdk.init(cfg);
    wireAuth(authEE);

    // ONE render for every auth type. For EmbeddedSSO the iframe is created BEFORE the
    // session exists and authenticates in-iframe; the cluster's OIDC callback then lands
    // it on '/' (root), dropping the #/embed/viz/<id> deep-link. So once the session is
    // GENUINELY created (AuthStatus.SUCCESS), do a single clean in-iframe redirect to the
    // target content — no page reload. (Redirect SSO/Cookieless don't need this: their
    // iframe is only ever created after the session exists.)
    renderEmbed();
    if (cfg.authType === 'EmbeddedSSO') {
      let redirected = false;
      authEE.on(sdk.AuthStatus.SUCCESS, () => {
        if (redirected) return;
        redirected = true;
        const type = $s('embedType').value;
        const id = $i('contentId').value.trim();
        const cur = getCurrent();
        if (type === 'Liveboard' && id && typeof cur?.navigateToLiveboard === 'function') {
          log('info', 'redirect', `session ready → navigateToLiveboard ${id}`);
          try { cur.navigateToLiveboard(id); return; } catch (e) { log('err', 'redirect', errMsg(e)); }
        }
        // Answer/Search/App/Spotter: re-render now that a session exists so it loads the
        // target route directly (no OAuth round-trip this time).
        log('info', 'redirect', `session ready → re-render ${type} with live session`);
        renderEmbed();
      });
    }
  } catch (e) {
    setDot('err');
    log('err', 'init:error', errMsg(e));
  }
}

// ---- Logout (clears the session so you can test the no-session redirect path) ----
async function logout(): Promise<void> {
  const sdk = getSDK();
  if (!sdk) { log('err', 'sdk', 'SDK not loaded yet'); return; }
  saveCfg();
  const cfg = buildConfig();
  if (!cfg.thoughtSpotHost) { log('err', 'logout', 'Cluster URL is required to log out'); return; }
  try {
    sdk.init(cfg);        // ensure the SDK is pointed at this cluster first
    await sdk.logout();   // ends the ThoughtSpot session → clears JSESSIONID
    destroyCurrent();
    sessionStorage.removeItem(SSO_ATTEMPTS);
    $('embed-container').innerHTML =
      '<div class="placeholder">Session cleared. Click <b style="margin:0 4px">Initialize &amp; Render</b> to test the no-session redirect.</div>';
    setDot('');
    log('warn', 'logout', 'SDK logout() done — session cleared. Re-run to test the redirect.');
  } catch (e) {
    log('err', 'logout:error', errMsg(e));
  }
}

// ---- Event wiring ----
function wireEvents(): void {
  $b('clearLog').onclick = clearLog;
  wireTabs();

  (['authType', 'tokenSource', 'embedType'] as const).forEach((id) =>
    $(id).addEventListener('change', () => { syncForm(); renderConfigView(); }));
  ([...FIELDS, ...CHECKS] as string[]).forEach((id) =>
    $(id).addEventListener('change', () => { saveCfg(); renderConfigView(); }));
  (FIELDS as readonly string[]).forEach((id) =>
    $(id).addEventListener('input', renderConfigView));

  $b('reloadSdk').onclick = () => { saveCfg(); void loadAndApply($s('sdkVersion').value || getLatest()); };
  $s('sdkVersion').addEventListener('change', () => { saveCfg(); void loadAndApply($s('sdkVersion').value); });
  $i('includePre').addEventListener('change', () => { saveCfg(); populateVersions($s('sdkVersion').value || getLatest()); });

  $b('run').onclick = run;
  $b('logout').onclick = () => { void logout(); };
}

// ---- Boot ----
async function boot(): Promise<void> {
  wireEvents();
  loadCfg();                                    // restore fields + checkboxes (incl. includePre)
  await fetchVersions();                        // pull the live version list from the registry
  populateVersions(readCfg().sdkVersion || getLatest());
  const ok = await loadAndApply($s('sdkVersion').value || getLatest());
  if (!ok) return;

  // Auto-resume after an SSO/OIDC/EmbeddedSSO redirect returns to the page. Loop-guarded
  // (capped, counted in sessionStorage across the redirect reloads) so a persistently
  // failing login can't spin forever and freeze the page.
  const at = $s('authType').value;
  if ((at === 'SSO_SAML' || at === 'SSO_OIDC' || at === 'EmbeddedSSO') && $i('host').value.trim()) {
    const attempts = +(sessionStorage.getItem(SSO_ATTEMPTS) || 0);
    if (attempts >= 2) {
      sessionStorage.removeItem(SSO_ATTEMPTS);
      log('warn', 'boot', `${at} auto-resume stopped after ${attempts} attempts to avoid a redirect loop. Click Initialize & Render to retry, or switch auth type.`);
    } else {
      sessionStorage.setItem(SSO_ATTEMPTS, String(attempts + 1));
      log('info', 'boot', `${at} auth type detected on load — re-initializing (attempt ${attempts + 1}/2)`);
      run();
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

void boot();
