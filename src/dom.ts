// Tiny DOM helpers — typed element lookups + a couple of shared utilities.

/** Element by id (generic HTMLElement — use for textContent/classList/etc.). */
export const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
/** Input/textarea/checkbox by id (has .value / .checked). */
export const $i = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
/** Select by id (has .value / .options). */
export const $s = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
/** Button by id (has .onclick). */
export const $b = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;

/** HTML-escape for values we inject via innerHTML in the config viewer. */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/** Status dot next to the title. */
export function setDot(state: '' | 'ok' | 'err'): void {
  $('status-dot').className = 'dot' + (state ? ' ' + state : '');
}
