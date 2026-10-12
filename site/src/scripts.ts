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
  document.querySelectorAll<HTMLElement>('.pick').forEach((b) => {
    const on = state[b.dataset.contest!]?.pick === b.dataset.choice;
    b.setAttribute('aria-pressed', String(on));
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
  const b = (ev.target as HTMLElement).closest<HTMLElement>('.pick');
  if (b) {
    const id = b.dataset.contest!;
    const e = (state[id] ??= {});
    e.pick = e.pick === b.dataset.choice ? undefined : b.dataset.choice;
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
