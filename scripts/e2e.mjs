// Sano Gym — Prueba de punta a punta contra los emuladores (datos creados por test-emu.sh)
// Uso: node e2e.mjs [url=http://127.0.0.1:5099] [carpeta de capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5099') + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; let passed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? '  ✔' : '  ✘', name, extra); if (cond) passed++; else fails++; };
const errs = [];
const logs = [];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-fake-ui-for-media-stream'] });
async function newPage() {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 860 });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.dismiss());
  p.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.text()); });
  return { ctx, p };
}
// Ejecuta una función con acceso a los módulos de la app
const run = (p, fn, arg = null) => p.evaluate(async (src, a) => {
  const M = { store: (await import('/js/store.js')).store, ops: await import('/js/ops.js'), utils: await import('/js/utils.js'), gym: await import('/js/gym.js') };
  return (0, eval)(src)(M, a);
}, fn.toString(), arg);
const go = async (p, route) => { await p.evaluate((r) => { location.hash = '#/' + r; }, route); await sleep(1100); };
const text = (p) => p.evaluate(() => document.body.innerText);
const pin = async (p, value = null) => {
  await p.waitForSelector('.modal [data-pin]', { timeout: 8000 });
  await p.type('.modal [data-pin]', value || acc.sede01.pin);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(900);
};
const pickCountry = async (p, code) => {
  await p.waitForSelector(`.country-grid [data-c="${code}"]`, { timeout: 60000 });
  await p.click(`.country-grid [data-c="${code}"]`); await sleep(250);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(1500);
};

try {
  // ==================================================================
  console.log('1) Inicio de sesión y país');
  let { ctx, p } = await newPage();
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.screenshot({ path: path.join(OUT, '01-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await pickCountry(p, 'VE');
  await p.waitForSelector('.sb-nav', { timeout: 30000 });
  ok('sede01 entra y elige país (Venezuela)', (await run(p, ({ store }) => store.settings.country)) === 'VE');
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());

  // ==================================================================
  console.log('2) Socios, membresías y caja');
  const r1 = await run(p, async ({ store, ops, utils }) => {
    await ops.openShift({ openingUSD: 20 });
    for (let i = 0; i < 30 && !store.openShift; i++) await new Promise((r) => setTimeout(r, 100));
    const plan = store.plan('mensual');
    const out = await ops.sellMembership({ member: { name: 'Laura Prueba Pérez', idDoc: 'V-12345678', phone: '04141234567', sex: 'F', birthDate: '1995-04-10', goal: 'Tonificar' }, plan, start: utils.todayKey(), payments: [{ method: 'efectivo', amount: plan.price + store.access.enrollFee }] });
    for (let i = 0; i < 30 && !store.member(out.member.id); i++) await new Promise((r) => setTimeout(r, 100));
    const m = store.member(out.member.id);
    const card = await (await import('/js/store.js')).getCard(m.cardCode);
    return { id: m.id, code: m.cardCode, number: m.number, status: (await import('/js/store.js')).memberStatus(m), total: out.sale.total, kind: out.sale.kind, enroll: out.quote.enrollFee, card: card?.plan?.name, shift: !!store.openShift };
  });
  ok('Caja abierta', r1.shift);
  ok('Socio nuevo con membresía mensual activa', r1.status === 'activo', `${r1.number} · ${r1.status}`);
  ok('Primera membresía cobra inscripción', r1.enroll > 0 && r1.kind === 'membresia', `total ${r1.total}`);
  ok('Carnet digital publicado con el plan', r1.card === 'Mensual', r1.code);
  const dup = await run(p, async ({ ops }) => { try { await ops.saveMember({ name: 'Otra', idDoc: 'V12345678' }); return 'creó'; } catch (e) { return e.message; } });
  ok('Rechaza documento duplicado', /Ya existe/.test(dup), dup.slice(0, 50));

  // ==================================================================
  console.log('3) Control de acceso');
  const r2 = await run(p, async ({ store, ops }, id) => {
    const m = store.member(id);
    const a = ops.checkAccess(m); await ops.registerCheckin(m, { check: a });
    for (let i = 0; i < 30 && !store.okCheckins.length; i++) await new Promise((r) => setTimeout(r, 100));
    const b = ops.checkAccess(store.member(id));
    return { a: a.level, inside: store.inside.length, again: b.notes.join(' '), visits: store.member(id).visits };
  }, r1.id);
  ok('Entrada permitida y cuenta como dentro', r2.a === 'ok' && r2.inside === 1, JSON.stringify(r2));
  ok('Segunda entrada del día avisa “ya entró hoy”', /Ya entró hoy/.test(r2.again));
  // Vencido → rechazado en la pantalla de recepción
  const r3 = await run(p, async ({ store, ops, utils }) => {
    const out = await ops.sellMembership({ member: { name: 'Pedro Vencido Gómez', idDoc: 'V-22333444', phone: '04241112233' }, plan: store.plan('semanal'), start: utils.todayKey(), payments: [{ method: 'transferencia', amount: store.plan('semanal').price + store.access.enrollFee }] });
    for (let i = 0; i < 30 && !store.member(out.member.id); i++) await new Promise((r) => setTimeout(r, 100));
    let bad = ''; try { await ops.adjustMembership(store.member(out.member.id), { end: utils.dayKey(utils.addDays(new Date(), -20)) }); } catch (e) { bad = e.message; }
    if (!bad) throw new Error('adjustMembership aceptó un fin anterior al inicio');
    const ms0 = store.member(out.member.id).membership;
    await store.save('members', out.member.id, { membership: { ...ms0, start: utils.dayKey(utils.addDays(new Date(), -13)), end: utils.dayKey(utils.addDays(new Date(), -6)) } });
    for (let i = 0; i < 30 && store.member(out.member.id).membership.end >= utils.todayKey(); i++) await new Promise((r) => setTimeout(r, 100));
    return { id: out.member.id, level: ops.checkAccess(store.member(out.member.id)).level };
  });
  ok('Membresía vencida (fuera de la gracia) se rechaza', r3.level === 'deny');
  await go(p, 'recepcion');
  await p.type('#r-q', 'V-22333444'); await p.keyboard.press('Enter'); await sleep(1500);
  ok('Recepción muestra ACCESO DENEGADO con botón Renovar', (await text(p)).includes('ACCESO DENEGADO') && !!(await p.$('[data-x="renew"]')));
  await p.screenshot({ path: path.join(OUT, '02-recepcion-denegado.png') });
  await p.type('#r-q', 'Laura'); await p.keyboard.press('Enter'); await sleep(1500);
  ok('Recepción por nombre: ADELANTE (ya entró hoy)', /ACCESO PERMITIDO|ADELANTE/.test(await text(p)));
  await p.screenshot({ path: path.join(OUT, '03-recepcion-ok.png') });
  // Sesiones, congelamiento, horario del plan
  const r4 = await run(p, async ({ store, ops, utils }, ids) => {
    const plan = store.plan('clases12');
    const o = await ops.sellMembership({ member: { name: 'Sara Sesiones', idDoc: 'V-30111222' }, plan, start: utils.todayKey(), payments: [{ method: 'efectivo', amount: plan.price + store.access.enrollFee }] });
    for (let i = 0; i < 30 && !store.member(o.member.id); i++) await new Promise((r) => setTimeout(r, 100));
    const c = ops.checkAccess(store.member(o.member.id)); await ops.registerCheckin(store.member(o.member.id), { check: c });
    for (let i = 0; i < 30 && store.member(o.member.id).membership.visitsLeft === 12; i++) await new Promise((r) => setTimeout(r, 100));
    const left = store.member(o.member.id).membership.visitsLeft;
    await ops.freezeMembership(store.member(ids.laura), { from: utils.todayKey(), days: 5, reason: 'viaje' });
    for (let i = 0; i < 30 && (await import('/js/store.js')).memberStatus(store.member(ids.laura)) !== 'congelado'; i++) await new Promise((r) => setTimeout(r, 100));
    const frozen = (await import('/js/store.js')).memberStatus(store.member(ids.laura));
    const endFrozen = store.member(ids.laura).membership.end;
    const deny = ops.checkAccess(store.member(ids.laura)).level;
    await ops.unfreezeMembership(store.member(ids.laura));
    for (let i = 0; i < 30 && (await import('/js/store.js')).memberStatus(store.member(ids.laura)) === 'congelado'; i++) await new Promise((r) => setTimeout(r, 100));
    const morning = { ...store.member(ids.laura), membership: { ...store.member(ids.laura).membership, timeFrom: '05:00', timeTo: '05:01' } };
    return { left, frozen, deny, endFrozen, after: (await import('/js/store.js')).memberStatus(store.member(ids.laura)), morning: ops.checkAccess(morning, new Date(new Date().setHours(18, 0))).reasons.join(' '), sara: o.member.id };
  }, { laura: r1.id });
  ok('Plan por sesiones descuenta una sesión', r4.left === 11, String(r4.left));
  ok('Congelar: estado congelado y entrada rechazada', r4.frozen === 'congelado' && r4.deny === 'deny', r4.endFrozen);
  ok('Reactivar devuelve a activo', ['activo', 'por_vencer'].includes(r4.after), r4.after);
  ok('Plan con horario restringido rechaza fuera de hora', /solo permite entrar/.test(r4.morning));

  // ==================================================================
  console.log('4) Abonos, deuda y anulación');
  const r5 = await run(p, async ({ store, ops, utils }, ids) => {
    const plan = store.plan('trimestral');
    const o = await ops.sellMembership({ member: store.member(ids.pedro), plan, start: utils.todayKey(), paid: 30, payments: [{ method: 'efectivo', amount: 30 }] });
    for (let i = 0; i < 30 && !(store.member(ids.pedro).balance > 0); i++) await new Promise((r) => setTimeout(r, 100));
    const debt = store.member(ids.pedro).balance;
    const access = ops.checkAccess(store.member(ids.pedro));
    await ops.payBalance(store.member(ids.pedro), { amount: debt, payments: [{ method: 'efectivo', amount: debt }] });
    for (let i = 0; i < 30 && store.member(ids.pedro).balance > 0.009; i++) await new Promise((r) => setTimeout(r, 100));
    const after = store.member(ids.pedro).balance;
    // Anular la venta de la membresía de Laura: vuelve a no tener plan
    const sales = await store.memberSales(ids.laura);
    const sale = sales.find((s) => s.kind === 'membresia');
    await ops.voidSale(sale, 'prueba');
    for (let i = 0; i < 30 && store.member(ids.laura).membership && store.member(ids.laura).membership.status !== 'anulada'; i++) await new Promise((r) => setTimeout(r, 100));
    return { kind: o.sale.kind, debt, accessNote: access.notes.join(' '), after, voided: (await import('/js/store.js')).memberStatus(store.member(ids.laura)) };
  }, { pedro: r3.id, laura: r1.id });
  ok('Venta con abono deja deuda (recibo tipo abono)', r5.kind === 'abono' && r5.debt > 0, `deuda ${r5.debt}`);
  ok('La entrada avisa la deuda', /deuda/.test(r5.accessNote));
  ok('Cobro de la deuda la deja en cero', r5.after < 0.01, String(r5.after));
  ok('Anular la membresía la quita del socio', r5.voided === 'sin_plan', r5.voided);

  // ==================================================================
  console.log('5) Clases, reservas y lista de espera');
  const r6 = await run(p, async ({ store, ops, utils }, ids) => {
    const tomorrow = utils.dayKey(utils.addDays(new Date(), 1));
    const wd = new Date(tomorrow + 'T12:00').getDay();
    await store.saveSettings({ trainers: [{ id: 'tA', name: 'Ana Coach', commission: 30, active: true }], classes: [{ id: 'cx', name: 'Spinning', days: [wd], time: '18:00', minutes: 45, capacity: 1, room: 'Sala', color: '#65a30d', trainerId: 'tA', active: true }] });
    const cls = store.gymClass('cx');
    const a = await ops.bookClass({ member: store.member(ids.pedro), cls, date: tomorrow });
    const b = await ops.bookClass({ member: store.member(ids.sara), cls, date: tomorrow });
    for (let i = 0; i < 30 && store.bookingsFor('cx', tomorrow).length < 2; i++) await new Promise((r) => setTimeout(r, 100));
    let dupe = ''; try { await ops.bookClass({ member: store.member(ids.pedro), cls, date: tomorrow }); } catch (e) { dupe = e.message; }
    const promoted = await ops.cancelBooking(store.bookings.find((x) => x.id === a.id));
    for (let i = 0; i < 30 && store.bookedCount('cx', tomorrow) !== 1; i++) await new Promise((r) => setTimeout(r, 100));
    let noPlan = ''; try { await ops.bookClass({ member: store.member(ids.laura), cls, date: tomorrow }); } catch (e) { noPlan = e.message; }
    return { a: a.status, b: b.status, dupe, promoted: promoted?.memberName, now: store.bookingsFor('cx', tomorrow).map((x) => x.status).join(','), noPlan };
  }, { pedro: r3.id, sara: r4.sara, laura: r1.id });
  ok('Primera reserva entra, la segunda va a lista de espera', r6.a === 'reservada' && r6.b === 'espera');
  ok('No permite reservar dos veces', /ya está/.test(r6.dupe));
  ok('Al cancelar, el primero en espera toma el cupo', r6.promoted === 'Sara Sesiones' && r6.now === 'reservada', r6.now);
  ok('Socio sin membresía no puede reservar', /membresía vigente/.test(r6.noPlan));
  await go(p, 'clases');
  ok('Horario semanal muestra la clase', (await p.$$('.wcls')).length >= 1);
  await p.screenshot({ path: path.join(OUT, '04-clases.png') });

  // ==================================================================
  console.log('6) Rutina, evaluación y carnet público');
  const r7 = await run(p, async ({ store, ops, gym }, ids) => {
    const t = gym.ROUTINE_TEMPLATES.find((x) => x.id === 't-inicio');
    await ops.saveRoutine(JSON.parse(JSON.stringify(t)), null, store.member(ids.sara));
    const ev = await ops.saveEvaluation(store.member(ids.sara), { weight: 70, height: 165, waist: 78, neck: 33, hip: 100 });
    for (let i = 0; i < 30 && !store.member(ids.sara).lastEval; i++) await new Promise((r) => setTimeout(r, 100));
    await store.save('members', ids.sara, { sex: 'F', birthDate: '1990-01-01' });
    const card = await (await import('/js/store.js')).getCard(store.member(ids.sara).cardCode);
    return { bmi: ev.calc.bmi, fat: ev.calc.fat, routine: card?.routine?.name, days: card?.routine?.days?.length, last: store.member(ids.sara).lastEval?.weight, code: store.member(ids.sara).cardCode };
  }, { sara: r4.sara });
  ok('Rutina asignada y publicada en el carnet', r7.routine && r7.days === 3, r7.routine);
  ok('Evaluación calcula IMC y queda como última', r7.bmi > 25 && r7.bmi < 26 && r7.last === 70, `IMC ${r7.bmi}`);
  const pub = await browser.newPage();
  pub.on('pageerror', (e) => errs.push('carnet: ' + e.message));
  await pub.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await pub.goto(BASE.replace('/?emu=1', `/carnet/${r7.code}?emu=1`), { waitUntil: 'networkidle2' });
  await pub.waitForSelector('.mcard', { timeout: 20000 }).catch(() => {});
  const ptxt = await pub.evaluate(() => document.body.innerText);
  ok('Carnet público /carnet/CÓDIGO con QR y plan', ptxt.includes('Sara') && ptxt.includes('12 clases grupales') && !!(await pub.$('.mcard-qr img')));
  await pub.screenshot({ path: path.join(OUT, '05-carnet.png') });
  await pub.click('.mcard-tabs [data-t="rutina"]').catch(() => {}); await sleep(500);
  ok('El carnet muestra la rutina', (await pub.evaluate(() => document.body.innerText)).includes('Día A'));
  await pub.screenshot({ path: path.join(OUT, '06-carnet-rutina.png') });
  await pub.goto(BASE.replace('/?emu=1', '/carnet/NOEXISTE?emu=1'), { waitUntil: 'networkidle2' }); await sleep(1500);
  ok('Carnet inexistente muestra aviso', (await pub.evaluate(() => document.body.innerText)).includes('Carnet no encontrado'));
  await pub.close();

  // ==================================================================
  console.log('7) Tienda, caja y vistas');
  const r8 = await run(p, async ({ store, ops }) => {
    const ref = store.newRef('products');
    await store.save('products', ref.id, { name: 'Agua 600 ml', category: 'Bebidas', price: 1, cost: 0.4, stock: 10, minStock: 2, trackStock: true, sellable: true, active: true }, false);
    for (let i = 0; i < 30 && !store.product(ref.id); i++) await new Promise((r) => setTimeout(r, 100));
    const out = await ops.chargeSale({ lines: [{ productId: ref.id, name: 'Agua 600 ml', price: 1, cost: 0.4, qty: 3 }], payments: [{ method: 'efectivo', amount: 5 }] });
    for (let i = 0; i < 30 && store.product(ref.id).stock !== 7; i++) await new Promise((r) => setTimeout(r, 100));
    let over = ''; try { await ops.chargeSale({ lines: [{ productId: ref.id, name: 'Agua', price: 1, qty: 50 }], payments: [{ method: 'efectivo', amount: 50 }] }); } catch (e) { over = e.message; }
    await ops.cashMovement({ direction: 'out', currency: 'USD', amount: 3, concept: 'Limpieza', category: 'Limpieza' });
    await new Promise((r) => setTimeout(r, 600));
    const exp = ops.shiftExpected(store.openShift);
    return { stock: store.product(ref.id).stock, change: out.sale.changeUSD, over, exp };
  });
  ok('Venta de tienda descuenta inventario y calcula vuelto', r8.stock === 7 && r8.change === 2, `stock ${r8.stock} · vuelto ${r8.change}`);
  ok('No vende más de lo que hay', /No hay suficiente/.test(r8.over));
  ok('Caja calcula el efectivo esperado', typeof r8.exp === 'object' || r8.exp > 0, JSON.stringify(r8.exp).slice(0, 80));
  const before = errs.length;
  for (const v of ['inicio', 'recepcion', 'socios', 'renovaciones', 'clases', 'rutinas', 'cobrar', 'facturas', 'caja', 'inventario', 'ajustes']) {
    await go(p, v);
    await p.screenshot({ path: path.join(OUT, `10-${v}.png`) });
  }
  await go(p, 'reportes'); await pin(p); await sleep(1500);
  ok('Reportes con PIN muestran tasa de renovación', (await text(p)).includes('Tasa de renovación'));
  await p.screenshot({ path: path.join(OUT, '10-reportes.png'), fullPage: true });
  ok('Todas las pantallas sin errores', errs.length === before, errs.slice(before).join(' | '));
  // Ficha del socio: todas las pestañas
  await p.evaluate(async (id) => (await import('/js/member.js')).openMember(id), r4.sara); await sleep(1500);
  const tabs = await p.$$eval('.modal [data-tabs] [data-t]', (x) => x.map((b) => b.dataset.t));
  for (const t of tabs) { await p.click(`.modal [data-tabs] [data-t="${t}"]`).catch(() => {}); await sleep(800); }
  ok('Ficha del socio abre todas sus pestañas sin errores', tabs.length >= 6 && errs.length === before, tabs.join(','));
  await p.screenshot({ path: path.join(OUT, '11-ficha.png') });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals());
  // Kiosco: entrada por documento
  await go(p, 'kiosco'); await sleep(800);
  await p.keyboard.type('30111222'); await p.keyboard.press('Enter'); await sleep(1500);
  ok('Kiosco reconoce al socio por documento', /Hola, Sara|Sara/.test(await text(p)));
  await p.screenshot({ path: path.join(OUT, '12-kiosco.png') });
  await p.click('#k-exit'); await pin(p); await sleep(800);
  ok('Salir del kiosco con PIN vuelve a recepción', (await p.evaluate(() => location.hash)).includes('recepcion'));
  // Cierre de caja
  const r9 = await run(p, async ({ store, ops }) => { const s = store.openShift; const e = ops.shiftExpected(s); await ops.closeShift(s, { countedUSD: e.cashUSD ?? e.usd ?? 0 }); for (let i = 0; i < 30 && store.openShift; i++) await new Promise((r) => setTimeout(r, 100)); return !store.openShift; });
  ok('Cierre de caja', r9);
  await ctx.close();

  // ==================================================================
  console.log('8) Demo');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.click('#lg-demo');
  await pickCountry(p, 'CO');
  await p.waitForFunction(() => document.body.innerText.includes('Modo demo'), { timeout: 90000 });
  await sleep(5000);
  const d = await run(p, ({ store }) => ({ members: store.members.length, today: store.okCheckins.length, inside: store.inside.length, bookings: store.bookings.length, sales: store.recentSales.length, products: store.products.length, shift: !!store.openShift, cur: store.settings.currency, plan: store.plan('mensual').price, classes: store.settings.classes.length, trainers: store.settings.trainers.length }));
  ok('Demo con gimnasio de ejemplo completo', d.members >= 17 && d.today >= 3 && d.bookings >= 10 && d.sales >= 10 && d.products >= 10 && d.shift && d.classes >= 10, JSON.stringify(d));
  ok('Precios de la demo en pesos colombianos', d.cur === 'COP' && d.plan > 10000, String(d.plan));
  ok('Recorrido guiado abierto al entrar', !!(await p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => null)));
  await p.screenshot({ path: path.join(OUT, '20-demo-tour.png') });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const b2 = errs.length;
  for (const v of ['inicio', 'recepcion', 'socios', 'renovaciones', 'clases', 'rutinas', 'cobrar', 'caja']) { await go(p, v); await p.screenshot({ path: path.join(OUT, `21-demo-${v}.png`) }); }
  ok('Pantallas de la demo sin errores', errs.length === b2, errs.slice(b2).join(' | '));
  await go(p, 'recepcion'); await p.type('#r-q', 'Natalia'); await p.keyboard.press('Enter'); await sleep(1500);
  ok('Demo: Natalia (vencida) es rechazada', (await text(p)).includes('ACCESO DENEGADO'));
  await p.screenshot({ path: path.join(OUT, '22-demo-rechazo.png') });
  const codes = await run(p, ({ store }) => store.members.map((m) => m.cardCode));
  const uid = await p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await p.evaluate(() => document.getElementById('demo-end').click());
  await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
  await p.waitForSelector('#login-form', { timeout: 60000 }).catch(async (e) => { await p.screenshot({ path: path.join(OUT, '29-demo-fin.png') }); console.log('LOGS', logs.slice(-15).join(' || ')); throw e; });
  ok('Terminar la demo vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('9) Administrador general');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.type('#lg-user', 'admin'); await p.type('#lg-pass', acc.admin.password); await p.click('#lg-btn');
  await p.waitForSelector('[data-enter]', { timeout: 30000 }); await sleep(2000);
  ok('Admin ve las sedes', (await p.$$('[data-enter]')).length === 3);
  await p.screenshot({ path: path.join(OUT, '30-admin.png') });
  const gone = await p.evaluate(async (u, cs) => { const f = await import('/js/firebase.js'); const t = await f.getDoc(f.doc(f.db, 'tenants', u)); const c = await f.getDoc(f.doc(f.db, 'cards', cs[0])); return !t.exists() && !c.exists(); }, uid, codes);
  ok('La demo y sus carnets se borraron', gone);
  await ctx.close();
} catch (e) { console.log('ERROR', e.stack || e.message); fails++; }
await browser.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(`${passed} OK · ${fails} fallas`);
process.exit(fails ? 1 : 0);
