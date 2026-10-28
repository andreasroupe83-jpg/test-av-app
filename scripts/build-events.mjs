// Hämtar kalendrarna från ICS_URL (en länk per rad) och läser alla kalenderfiler
// i mappen calendars/, plockar ut kommande händelser och skriver dist/events.json. Om PASSPHRASE är satt krypteras innehållet så att bara
// den som kan lösenordet kan läsa det i appen.
//
// Utan ICS_URL och kalenderfiler skapas exempelhändelser så att appen går att prova direkt.

import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import IcalExpander from 'ical-expander';

const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || 60);
const PBKDF2_ITERATIONS = 250000;

const { ICS_URL, PASSPHRASE } = process.env;

const now = new Date();
const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const to = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

function toPlainDate(icalTime) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${icalTime.year}-${pad(icalTime.month)}-${pad(icalTime.day)}`;
}

function mapEvent(item, startDate, endDate) {
  const allDay = startDate.isDate;
  return {
    title: item.summary || '(Utan titel)',
    location: item.location || '',
    allDay,
    start: allDay ? toPlainDate(startDate) : startDate.toJSDate().toISOString(),
    end: allDay ? toPlainDate(endDate) : endDate.toJSDate().toISOString(),
  };
}

const URL_PATTERN = /(?:https?|webcal):\/\/\S+/gi;

const urls = (ICS_URL || '').match(URL_PATTERN) || [];

// Filnamnet spelar ingen roll (t.ex. .ics eller .txt). En fil kan innehålla
// antingen en hel kalender (BEGIN:VCALENDAR) eller kalenderlänkar.
const files = [];
for (const name of await readdir('calendars').catch(() => [])) {
  if (name === 'README.md') continue;
  const text = await readFile(`calendars/${name}`, 'utf8');
  if (/BEGIN:VCALENDAR/i.test(text)) files.push(text);
  else urls.push(...(text.match(URL_PATTERN) || []));
}

async function loadAllEvents() {
  const lists = await Promise.all([
    ...[...new Set(urls)].map((url, i) => fetchIcs(url, i + 1).then(expand)),
    ...files.map(expand),
  ]);
  return lists.flat();
}

async function fetchIcs(rawUrl, number) {
  const url = rawUrl.replace(/^webcal:\/\//i, 'https://');
  const res = await fetch(url);
  // Visa inte länken i loggen – den är hemlig.
  if (!res.ok) throw new Error(`Kunde inte hämta kalender nr ${number}: HTTP ${res.status}`);
  return res.text();
}

function expand(ics) {
  // maxIterations 0 = ingen gräns; säkert eftersom vi alltid har ett slutdatum.
  const expander = new IcalExpander({ ics, maxIterations: 0 });
  const { events, occurrences } = expander.between(from, to);

  return [
    ...events.map((e) => mapEvent(e, e.startDate, e.endDate)),
    ...occurrences.map((o) => mapEvent(o.item, o.startDate, o.endDate)),
  ];
}

function demoEvents() {
  const at = (days, hour, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const day = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return [
    { title: 'Morgonmöte', location: 'Teams', allDay: false, start: at(0, 9), end: at(0, 9, 30) },
    { title: 'Lunch med Sara', location: 'Café Linné', allDay: false, start: at(0, 12), end: at(0, 13) },
    { title: 'Tandläkare', location: '', allDay: false, start: at(1, 15, 30), end: at(1, 16, 15) },
    { title: 'Födelsedag 🎉', location: '', allDay: true, start: day(2), end: day(3) },
    { title: 'Padel', location: 'PDL Center', allDay: false, start: at(3, 18), end: at(3, 19, 30) },
  ];
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function encrypt(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext),
  );
  return { salt: b64(salt), iv: b64(iv), iterations: PBKDF2_ITERATIONS, data: b64(new Uint8Array(data)) };
}

const demo = urls.length === 0 && files.length === 0;
const events = (demo ? demoEvents() : await loadAllEvents())
  .sort((a, b) => a.start.localeCompare(b.start));

const payload = { generatedAt: now.toISOString(), demo, events };

let output;
if (PASSPHRASE && !demo) {
  output = { version: 1, encrypted: await encrypt(JSON.stringify(payload), PASSPHRASE) };
} else {
  if (!demo) console.warn('Varning: PASSPHRASE saknas – händelserna publiceras okrypterade.');
  output = { version: 1, ...payload };
}

await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await writeFile('dist/events.json', JSON.stringify(output));
console.log(`Skrev ${events.length} händelser till dist/events.json${demo ? ' (exempeldata)' : ''}.`);
