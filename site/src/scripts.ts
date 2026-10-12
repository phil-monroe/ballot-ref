// Tiny client script: picks and notes live only in this browser's localStorage.
type Entry = { pick?: string; note?: string };
const KEY = document.documentElement.dataset.picksKey ?? 'ballot-ref';

const load = (): Record<string, Entry> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};
let state = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode): choices last until the page closes */
  }
};

const render = () => {
  document.querySelectorAll<HTMLElement>('.pick, .card-check').forEach((b) => {
    const on = state[b.dataset.contest!]?.pick === b.dataset.choice;
    b.setAttribute('aria-pressed', String(on));
    b.closest('.card')?.classList.toggle('picked', on);
  });
  document.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => {
    const e = state[r.dataset.row!] ?? {};
    r.classList.toggle('done', !!e.pick);
    const note = r.querySelector<HTMLElement>('[data-note-view]');
    if (note) {
      note.textContent = e.note ?? '';
      note.hidden = !e.note;
    }
  });
  document.querySelectorAll<HTMLTextAreaElement>('textarea[data-note]').forEach((t) => {
    if (document.activeElement !== t) t.value = state[t.dataset.note!]?.note ?? '';
  });
  const total = Number(document.documentElement.dataset.total) || document.querySelectorAll('[data-row]').length;
  const done = Object.values(state).filter((e) => e.pick).length;
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach((p) => (p.textContent = `${done}/${total} chosen`));
};

document.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('.pick, .card-check');
  if (b) {
    const id = b.dataset.contest!;
    const e = (state[id] ??= {});
    if (e.pick === b.dataset.choice) {
      if (!confirm(`Remove your choice "${e.pick}"?`)) return;
      e.pick = undefined;
    } else {
      e.pick = b.dataset.choice;
    }
    save();
    render();
  } else if ((ev.target as HTMLElement).closest('[data-reset]') && confirm('Clear all your choices and notes on this device?')) {
    state = {};
    save();
    render();
  }
});
document.addEventListener('input', (ev) => {
  const t = ev.target as HTMLTextAreaElement;
  if (t.dataset.note) {
    (state[t.dataset.note] ??= {}).note = t.value || undefined;
    save();
    render();
  }
});
window.addEventListener('storage', () => {
  state = load();
  render();
});
render();

// Candidate comparison: one select switches which section every candidate card shows.
const compare = document.querySelector<HTMLElement>('.compare');
const select = document.querySelector<HTMLSelectElement>('[data-compare]');
if (compare && select) {
  const VIEW_KEY = 'ballot-ref:compare-view';
  const apply = (v: string) => {
    compare.dataset.view = v;
    select.value = v;
  };
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved && [...select.options].some((o) => o.value === saved)) apply(saved);
  } catch {
    /* storage unavailable: start on Summary */
  }
  select.addEventListener('change', () => {
    apply(select.value);
    try {
      localStorage.setItem(VIEW_KEY, select.value);
    } catch {
      /* ignore */
    }
  });
}

const copyBtn = document.querySelector<HTMLButtonElement>('[data-copy-guide]');
if (copyBtn) {
  const status = document.querySelector<HTMLElement>('[data-copy-status]');
  copyBtn.addEventListener('click', async () => {
    try {
      const text = await (await fetch('/llms-full.txt')).text();
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = ' Copied. Paste it into your chat.';
    } catch {
      if (status) status.textContent = ' Could not copy; open the full guide link and copy from there.';
    }
  });
}

document.querySelectorAll<HTMLAnchorElement>('[data-ask-claude]').forEach((a) => {
  const status = a.parentElement?.querySelector<HTMLElement>('[data-ask-status]');
  let cached: string | undefined;
  // Prefetch so the clipboard write can happen synchronously inside the click.
  fetch(a.dataset.src!).then((r) => r.text()).then((t) => (cached = t)).catch(() => {});
  a.addEventListener('click', (ev) => {
    const done = (ok: boolean) => {
      if (status) status.textContent = ok ? 'Copied. Paste into the Claude chat that just opened, then send.' : 'Could not copy automatically. Open the guide text link on the About page and copy it.';
    };
    if (cached !== undefined) {
      navigator.clipboard.writeText(cached).then(() => done(true), () => done(false));
      return;
    }
    ev.preventDefault();
    fetch(a.dataset.src!).then((r) => r.text()).then((t) => navigator.clipboard.writeText(t)).then(() => done(true), () => done(false)).finally(() => window.open(a.href, '_blank', 'noopener'));
  });
});
