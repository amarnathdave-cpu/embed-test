// The event log in the bottom panel — the two streams (SDK auth + iframe events).
import { $ } from './dom';

export type LogKind = 'info' | 'ok' | 'warn' | 'err';

export function log(kind: LogKind, key: string, msg?: unknown): void {
  const logEl = $('log');
  const line = document.createElement('div');
  line.className = `log-line ${kind}`;
  const t = new Date().toLocaleTimeString();
  const m = msg == null ? '' : typeof msg === 'string' ? msg : JSON.stringify(msg);
  line.innerHTML = `<span class="t">${t}</span><span class="k">${key}</span><span class="m"></span>`;
  (line.querySelector('.m') as HTMLElement).textContent = m;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

export function clearLog(): void {
  $('log').innerHTML = '';
}
