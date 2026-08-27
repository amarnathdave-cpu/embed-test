// Dynamic sidebar form: shows/hides the auth-specific fieldsets and updates the
// content-id label/hint based on the selected auth type and embed type.
import { $, $s } from './dom';
import { AUTH_META } from './authTypes';

/** [label, hint] for the content-id field, per embed type. */
export const CONTENT: Record<string, [string, string]> = {
  Liveboard: ['Liveboard ID', 'GUID of the Liveboard to open.'],
  Search: ['Data source ID (optional)', 'Worksheet/Model GUID to search against. Blank = pick in-app.'],
  SearchBar: ['Data source ID', 'Worksheet/Model GUID the search bar queries.'],
  App: ['Landing path (optional)', 'e.g. "/home", "/pinboards". Blank = default home.'],
  Spotter: ['Worksheet / Model ID', 'GUID of the data source Spotter converses over. Required.'],
};

export function syncForm(): void {
  const at = $s('authType').value;
  $('authHint').textContent = AUTH_META[at]?.hint || '';
  $('fs-basic').classList.toggle('hide', at !== 'Basic');
  $('fs-token').classList.toggle('hide', at !== 'AuthServer' && at !== 'AuthServerCookieless');
  const paste = $s('tokenSource').value === 'paste';
  $('fs-endpoint').classList.toggle('hide', paste);
  $('fs-paste').classList.toggle('hide', !paste);
  const [lbl, hint] = CONTENT[$s('embedType').value] || ['Content ID', ''];
  $('contentLabel').textContent = lbl;
  $('contentHint').textContent = hint;
}
