const STORAGE_KEY = 'kalender-passphrase';

const content = document.getElementById('content');
const unlockForm = document.getElementById('unlock');
const passphraseInput = document.getElementById('passphrase');
const unlockError = document.getElementById('unlock-error');
const updated = document.getElementById('updated');
const lockButton = document.getElementById('lock');

const timeFormat = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
const updatedFormat = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

let latestPayload = null;

const storage = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch {} },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch {} },
};

// "2026-10-27" → lokal midnatt (inte UTC), så heldagshändelser hamnar rätt dag.
function parsePlainDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDates(event) {
  return event.allDay
    ? { start: parsePlainDate(event.start), end: parsePlainDate(event.end) }
    : { start: new Date(event.start), end: new Date(event.end) };
}

function dayLabel(day, today) {
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return 'Idag';
  if (diff === 1) return 'Imorgon';
  return dayFormat.format(day);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(payload) {
  const now = new Date();
  const today = startOfDay(now);

  // Händelser som redan pågår visas under "Idag".
  const groups = new Map();
  for (const event of payload.events) {
    const { start, end } = toDates(event);
    if (end <= now) continue;
    const day = startOfDay(start < today ? today : start);
    const key = day.getTime();
    if (!groups.has(key)) groups.set(key, { day, items: [] });
    groups.get(key).items.push({ event, start, end });
  }

  content.replaceChildren();

  if (payload.demo) {
    content.append(el('p', 'banner',
      'Det här är exempeldata. Lägg till din kalenderlänk som ICS_URL i GitHub för att se dina egna händelser.'));
  }

  if (groups.size === 0) {
    content.append(el('p', 'status', 'Inga kommande händelser 🎉'));
  }

  for (const { day, items } of [...groups.values()].sort((a, b) => a.day - b.day)) {
    const heading = el('h2', day.getTime() === today.getTime() ? 'today' : '', dayLabel(day, today));
    const list = el('ul', 'day');
    items.sort((a, b) => (b.event.allDay - a.event.allDay) || (a.start - b.start));

    for (const { event, start, end } of items) {
      const li = el('li', 'event');
      const time = el('div', 'time');
      if (event.allDay) {
        time.textContent = 'heldag';
      } else {
        time.textContent = start < today ? 'pågår' : timeFormat.format(start);
        time.append(el('span', 'end', timeFormat.format(end)));
      }
      const details = el('div', 'details');
      details.append(el('div', 'title', event.title));
      if (event.location) details.append(el('div', 'location', event.location));
      li.append(time, details);
      list.append(li);
    }
    content.append(heading, list);
  }

  updated.textContent = `Uppdaterad ${updatedFormat.format(new Date(payload.generatedAt))}`;
}

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decrypt(encrypted, passphrase) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(encrypted.salt), iterations: encrypted.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(encrypted.iv) }, key, fromB64(encrypted.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

async function unlock(data, passphrase) {
  try {
    const payload = await decrypt(data.encrypted, passphrase);
    storage.set(passphrase);
    unlockForm.hidden = true;
    lockButton.hidden = false;
    latestPayload = payload;
    render(payload);
    return true;
  } catch {
    return false;
  }
}

async function load() {
  let data;
  try {
    const res = await fetch('events.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    // Offline svarar service workern med senast sparade kopia, så hit kommer vi
    // bara om det inte finns någon sparad kopia.
    if (!latestPayload) content.replaceChildren(el('p', 'status', 'Kunde inte ladda kalendern.'));
    return;
  }

  if (!data.encrypted) {
    latestPayload = data;
    render(data);
    return;
  }

  const saved = storage.get();
  if (saved && await unlock(data, saved)) return;

  storage.clear();
  content.replaceChildren();
  lockButton.hidden = true;
  unlockForm.hidden = false;
  unlockForm.onsubmit = async (e) => {
    e.preventDefault();
    unlockError.hidden = await unlock(data, passphraseInput.value);
    passphraseInput.value = '';
  };
}

document.getElementById('refresh').addEventListener('click', load);

lockButton.addEventListener('click', () => {
  storage.clear();
  latestPayload = null;
  load();
});

// Hämta nytt när appen öppnas igen från hemskärmen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});

// Rita om varje minut så att avslutade händelser försvinner.
setInterval(() => { if (latestPayload) render(latestPayload); }, 60000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

load();
