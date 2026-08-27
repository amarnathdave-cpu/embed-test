// Live "SDK config" viewer — shows the exact init(embedConfig) and the per-embed
// viewConfig that will be sent to the SDK, updating as you edit the form.
import { $, $s, $i, esc } from './dom';
import { getSDK } from './sdk';
import { authValues } from './authTypes';
import { buildConfig, embedOptions } from './embedConfig';

export function renderConfigView(): void {
  const view = $('config-view');
  if (!view || view.classList.contains('hide')) return; // only render when visible
  const version = $s('sdkVersion').value.trim();
  const cfg = buildConfig();
  const type = $s('embedType').value;
  const id = $i('contentId').value.trim();
  const replacer = (_k: string, v: unknown) => (typeof v === 'function' ? 'ƒ () → Promise<token>' : v);
  const cfgJson = esc(JSON.stringify(cfg, replacer, 2));
  const optsJson = esc(JSON.stringify(embedOptions(type, id), null, 2));
  const types = authValues();
  view.innerHTML =
    `<span class="c-comment">// SDK @thoughtspot/visual-embed-sdk@${esc(version || '?')}` +
    (getSDK() ? `  (auth types: ${esc(types.join(', '))})` : '  — not loaded') +
    `</span>\n\n` +
    `<span class="c-comment">// init(embedConfig)</span>\n${cfgJson}\n\n` +
    `<span class="c-comment">// new ${esc(type)}Embed(container, viewConfig)</span>\n${optsJson}`;
}
