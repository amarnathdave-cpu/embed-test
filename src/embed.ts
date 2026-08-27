// Creates and renders the chosen embed, and wires the iframe lifecycle events
// (Init / AuthInit / NoCookieAccess / AuthExpire / Load / Error / AuthFailure).
import { $, $s, $i } from './dom';
import { log } from './log';
import { getSDK } from './sdk';
import { embedOptions } from './embedConfig';
import type { EmbedInstance } from './types';

let current: EmbedInstance | null = null;

export const getCurrent = (): EmbedInstance | null => current;

export function destroyCurrent(): void {
  if (current?.destroy) { try { current.destroy(); } catch { /* ignore */ } }
  current = null;
}

export function renderEmbed(): void {
  const container = $('embed-container');
  destroyCurrent();
  container.innerHTML = '';

  const sdk = getSDK();
  if (!sdk) { log('err', 'render', 'SDK not loaded'); return; }

  const type = $s('embedType').value;
  const id = $i('contentId').value.trim();
  const Cls = sdk[type + 'Embed'] as (new (el: HTMLElement, opts: unknown) => EmbedInstance) | undefined;
  if (!Cls) { log('err', 'render', `${type}Embed is not available in SDK v${$s('sdkVersion').value}`); return; }

  const embed = new Cls(container, embedOptions(type, id));
  const E = sdk.EmbedEvent;
  // Iframe / cookie lifecycle events.
  embed
    .on(E.Init, () => log('info', 'iframe:Init', ''))
    .on(E.AuthInit, () => log('ok', 'iframe:AuthInit', 'app confirmed session inside iframe'))
    .on(E.NoCookieAccess, () => log('err', 'iframe:NoCookieAccess', '3rd-party cookie blocked — switch to Cookieless'))
    .on(E.AuthExpire, () => log('warn', 'iframe:AuthExpire', 'session/token expired'))
    .on(E.Load, () => log('info', 'iframe:Load', 'iframe loaded'))
    .on(E.Error, (e: unknown) => log('err', 'iframe:Error', e))
    .on(E.AuthFailure, (e: unknown) => log('err', 'iframe:AuthFailure', e));
  embed.render();
  current = embed;
  window.tsEmbed = embed; // for console poking
  log('info', 'render', `${type}${id ? ' · ' + id : ''}`);
}
