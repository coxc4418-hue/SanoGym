// Sano Gym — Renderiza los documentos impresos (recibo, carnet, rutina, evaluación física) y los guarda como imagen
// Uso: node print-check.mjs [url=http://127.0.0.1:5099] [carpeta]  (emuladores con datos de test-emu.sh)
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5099') + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.setViewport({ width: 1100, height: 900 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.type('#lg-user', 'sede01'); await page.type('#lg-pass', acc.sede01.password); await page.click('#lg-btn');
await page.waitForSelector('.sb-nav', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
// Captura el HTML que se manda a imprimir (sin abrir el diálogo de impresión)
await page.evaluate(() => {
  window.__printed = [];
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.tagName === 'IFRAME') { n.contentWindow.print = () => {}; setTimeout(() => window.__printed.push('<!DOCTYPE html>' + n.contentDocument.documentElement.outerHTML), 900); }
  }))).observe(document.body, { childList: true });
});
const docs = await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const sh = await import('/js/shared.js');
  const wait = () => new Promise((r) => setTimeout(r, 1200));
  const sara = store.members.find((m) => m.name.startsWith('Sara')) || store.members[0];
  const sales = await store.salesBetween('2000', '9999');
  sh.printReceipt(sales.find((s) => s.kind === 'membresia') || sales[0]); await wait();
  await (await import('/js/member.js')).printCard(sara); await wait();
  const rts = await store.memberRoutines(sara.id);
  if (rts[0]) { (await import('/js/routine.js')).printRoutine(rts[0], sara); await wait(); }
  const evs = await store.listEq('evaluations', 'memberId', sara.id);
  if (evs.length) { (await import('/js/evals.js')).printEval(sara, evs); await wait(); }
  await new Promise((r) => setTimeout(r, 1200));
  return window.__printed;
});
const names = ['recibo', 'carnet', 'rutina', 'evaluacion'];
for (let i = 0; i < docs.length; i++) {
  const p = await browser.newPage();
  await p.setViewport({ width: names[i] === 'recibo' ? 420 : 816, height: 600 });
  await p.setContent(docs[i], { waitUntil: 'load' });
  await p.screenshot({ path: path.join(OUT, `print-${names[i]}.png`), fullPage: true });
}
console.log('Documentos renderizados:', docs.length, 'de', names.length);
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
await browser.close();
process.exit(docs.length === names.length && !errs.length ? 0 : 1);
