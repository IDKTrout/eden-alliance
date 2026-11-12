// Search, guild filter and pages of 100 for the Power and Campaign rankings.
// Rows carry data-g (guild ID) and data-text (lower-case name and ID). The page number and guild
// are kept in the address (?page=2&guild=...), so a link opens the same view.

const PAGE_SIZE = 100;

export function setupRanking() {
  const q = document.getElementById('q') as HTMLInputElement | null;
  const g = document.getElementById('g') as HTMLSelectElement | null;
  const table = document.getElementById('t');
  if (!q || !g || !table) return;
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const pagers = [...document.querySelectorAll<HTMLElement>('[data-pager]')];
  const none = document.getElementById('none');
  const count = document.getElementById('count');

  const params = new URLSearchParams(location.search);
  if (params.get('guild') && [...g.options].some((o) => o.value === params.get('guild'))) g.value = params.get('guild')!;
  let page = Math.max(1, Number(params.get('page')) || 1);

  function matches() {
    const term = q!.value.trim().toLowerCase();
    return rows.filter((r) => (!g!.value || r.dataset.g === g!.value) && (!term || (r.dataset.text ?? '').includes(term)));
  }

  function remember() {
    const p = new URLSearchParams();
    if (g!.value) p.set('guild', g!.value);
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function pageButtons(pages: number): (number | '…')[] {
    if (pages <= 9) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    const list = [...set].sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    list.forEach((n, i) => { if (i && n - list[i - 1] > 1) out.push('…'); out.push(n); });
    return out;
  }

  function render(scroll = false) {
    const hits = matches();
    const pages = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const from = (page - 1) * PAGE_SIZE;
    const shown = new Set(hits.slice(from, from + PAGE_SIZE));
    for (const r of rows) r.hidden = !shown.has(r);
    if (none) none.hidden = hits.length > 0;
    if (count) count.textContent = hits.length
      ? `Showing ${from + 1}–${Math.min(from + PAGE_SIZE, hits.length)} of ${hits.length.toLocaleString('en-US')}`
      : '';

    for (const nav of pagers) {
      nav.hidden = pages <= 1;
      nav.replaceChildren();
      const btn = (label: string, to: number, opts: { current?: boolean; disabled?: boolean; aria?: string } = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = 'pg';
        if (opts.aria) b.setAttribute('aria-label', opts.aria);
        if (opts.current) b.setAttribute('aria-current', 'page');
        b.disabled = !!opts.disabled;
        b.addEventListener('click', () => { page = to; render(true); });
        nav.append(b);
      };
      btn('‹ Prev', page - 1, { disabled: page === 1, aria: 'Previous page' });
      for (const n of pageButtons(pages)) {
        if (n === '…') { const s = document.createElement('span'); s.className = 'pg-gap'; s.textContent = '…'; nav.append(s); }
        else btn(String(n), n, { current: n === page, aria: `Page ${n}` });
      }
      btn('Next ›', page + 1, { disabled: page === pages, aria: 'Next page' });
    }
    remember();
    if (scroll) table!.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  q.addEventListener('input', () => { page = 1; render(); });
  g.addEventListener('change', () => { page = 1; render(); });
  render();
}
