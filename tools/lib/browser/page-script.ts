/**
 * JavaScript evaluated inside the page to read what the accessibility snapshot does not give:
 * form fields with their constraints and values, table rows, loading indicators, header/footer text.
 *
 * It is kept as source text on purpose. A TypeScript function passed to `page.evaluate` is
 * serialised with `toString()`, and the tsx/esbuild transform adds helper calls that do not exist
 * in the page. Plain text is immune to that.
 */

export interface PageField {
  label: string;
  /** Where the label came from: aria | label | title | placeholder | name | none. */
  label_source: string;
  type: string;
  value: string;
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  min: string | null;
  max: string | null;
  step: string | null;
  minlength: string | null;
  maxlength: string | null;
  pattern: string | null;
  options: string[];
  invalid: boolean;
  validation: string;
  in_dialog: boolean;
}

export interface PageTable {
  name: string;
  columns: string[];
  row_count: number;
  rows: string[][];
}

export interface PageFacts {
  fields: PageField[];
  tables: PageTable[];
  /** Number of visible loading indicators (aria-busy, progressbar, spinner classes). */
  busy: number;
  /** Text of header and footer landmarks: usually the signed-in user and the version. */
  chrome: string[];
  ready: string;
  main_text: string;
  modal: boolean;
}

export const EMPTY_PAGE_FACTS: PageFacts = {
  fields: [],
  tables: [],
  busy: 0,
  chrome: [],
  ready: "?",
  main_text: "",
  modal: false,
};

const PAGE_FACTS_FUNCTION = String.raw`(maxRows) => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = s => (s || '').trim().replace(/\s+/g, ' ');
  const label = e => {
    if (t(e.getAttribute('aria-label'))) return [t(e.getAttribute('aria-label')), 'aria'];
    const by = (e.getAttribute('aria-labelledby') || '').split(/\s+/).map(i => i && document.getElementById(i))
      .filter(Boolean).map(n => n.innerText).join(' ');
    if (t(by)) return [t(by), 'aria'];
    if (e.labels && e.labels[0] && t(e.labels[0].innerText)) return [t(e.labels[0].innerText), 'label'];
    if (t(e.title)) return [t(e.title), 'title'];
    if (t(e.getAttribute('placeholder'))) return [t(e.getAttribute('placeholder')), 'placeholder'];
    if (t(e.name || e.id)) return [t(e.name || e.id), 'name'];
    return ['(unlabelled ' + (e.type || e.tagName.toLowerCase()) + ')', 'none'];
  };
  const value = e => {
    if (e.type === 'password') return e.value ? '(hidden)' : '';
    if (e.type === 'checkbox' || e.type === 'radio') return e.checked ? 'checked' : 'unchecked';
    if (e.tagName === 'SELECT') return e.selectedOptions[0] ? t(e.selectedOptions[0].text) : '';
    return (e.value || '').slice(0, 120);
  };
  const fields = [...document.querySelectorAll('input, select, textarea')]
    .filter(e => vis(e) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(e.type))
    .map(e => ({
      label: label(e)[0].slice(0, 80), label_source: label(e)[1], type: e.type || e.tagName.toLowerCase(),
      value: value(e), required: !!e.required, disabled: !!e.disabled, readonly: !!e.readOnly,
      min: e.getAttribute('min'), max: e.getAttribute('max'), step: e.getAttribute('step'),
      minlength: e.getAttribute('minlength'), maxlength: e.getAttribute('maxlength'), pattern: e.getAttribute('pattern'),
      options: e.tagName === 'SELECT' ? [...e.options].map(o => t(o.text)).slice(0, 30) : [],
      invalid: e.getAttribute('aria-invalid') === 'true' || e.matches(':user-invalid'),
      validation: e.validationMessage || '', in_dialog: !!e.closest('dialog,[role=dialog]')
    }));
  const tables = [...document.querySelectorAll('table')].filter(vis).map(tb => ({
    name: t(tb.getAttribute('aria-label') || (tb.caption && tb.caption.innerText) || ''),
    columns: [...tb.querySelectorAll(tb.querySelector('thead') ? 'thead th' : 'tr:first-child th')]
      .map(th => t(th.innerText)).slice(0, 20),
    row_count: tb.querySelectorAll('tbody tr').length,
    rows: [...tb.querySelectorAll('tbody tr')].slice(0, maxRows)
      .map(tr => [...tr.children].map(td => t(td.innerText).slice(0, 80)))
  }));
  const busy = [...document.querySelectorAll('[aria-busy="true"], [role=progressbar], .spinner, .loading, .skeleton')]
    .filter(vis).length;
  const chrome = [...document.querySelectorAll('header, footer, [role=banner], [role=contentinfo]')]
    .filter(vis).map(n => t(n.innerText).slice(0, 300));
  const main = document.querySelector('main, [role=main]') || document.body;
  return {fields, tables, busy, chrome, ready: document.readyState,
          main_text: (main.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(),
          modal: !!document.querySelector('dialog:modal, [aria-modal="true"]:not([hidden])')};
}`;

/** Expression that returns PageFacts, with at most `maxRows` rows per table. */
export function pageFactsExpression(maxRows: number): string {
  return `(${PAGE_FACTS_FUNCTION})(${Math.max(0, Math.trunc(maxRows))})`;
}

/** Index of the first visible link whose address equals the given one (ignoring fragment and trailing slash), or -1. */
export function findLinkExpression(url: string): string {
  return String.raw`(t => [...document.querySelectorAll('a[href]')].findIndex(a => {
    const r = a.getBoundingClientRect();
    return a.href.split('#')[0].replace(/\/$/, '') === t && r.width > 0 && r.height > 0; }))(${JSON.stringify(url)})`;
}
