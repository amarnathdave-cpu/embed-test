// Bottom-panel tabs: "Events" (the log) vs "SDK config" (the live config viewer).
import { $, $b } from './dom';
import { renderConfigView } from './configView';

export function showTab(which: 'events' | 'config'): void {
  const events = which === 'events';
  $('tab-events').classList.toggle('active', events);
  $('tab-config').classList.toggle('active', !events);
  $('log').classList.toggle('hide', !events);
  $('config-view').classList.toggle('hide', events);
  $('clearLog').classList.toggle('hide', !events);
  if (!events) renderConfigView();
}

export function wireTabs(): void {
  $b('tab-events').onclick = () => showTab('events');
  $b('tab-config').onclick = () => showTab('config');
}
