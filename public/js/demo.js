// Sano Gym — Modo demo (sesión anónima de 30 minutos) con un gimnasio de ejemplo lleno de vida
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS } from './store.js';
import { fmtSeq, genCode, cardData, routineSummary, openShift, sellMembership, chargeSale, cashMovement, bookingId } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, sha256, scaleUSD } from './utils.js';
import { planEnd, evalCalc, ROUTINE_TEMPLATES, SAMPLE_CLASSES, CLASS_COLORS } from './gym.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['members', 'memberships', 'checkins', 'bookings', 'routines', 'evaluations', 'photos', 'products', 'sales', 'cash_shifts', 'cash_movements', 'inventory_logs', 'config'];
const BIZ = 'Titan Fitness Club (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const TRAINERS = [
  { id: 'tr1', name: 'Carlos Rivas', specialty: 'Musculación y fuerza', phone: '0414-5550101', commission: 40, color: '#65a30d', active: true },
  { id: 'tr2', name: 'Daniela Méndez', specialty: 'Funcional, GAP y Pilates', phone: '0424-5550202', commission: 35, color: '#db2777', active: true },
  { id: 'tr3', name: 'Andrés Salazar', specialty: 'Spinning y CrossFit', phone: '0412-5550303', commission: 35, color: '#0ea5e9', active: true },
  { id: 'tr4', name: 'Mariana Ochoa', specialty: 'Yoga, Zumba y movilidad', phone: '0416-5550404', commission: 30, color: '#7c3aed', active: true }
];
const CLASS_TRAINER = { Spinning: 'tr3', Funcional: 'tr2', Zumba: 'tr4', Yoga: 'tr4', Pilates: 'tr2', CrossFit: 'tr3', 'GAP (glúteo, abdomen, pierna)': 'tr2', Boxeo: 'tr1' };

export async function createDemoTenant(uid) {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();
  const ref = (name, id) => doc(db, 'tenants', uid, name, id);
  const classes = SAMPLE_CLASSES.map(([name, days, time, minutes, capacity, room, ci], i) => ({ id: 'c' + (i + 1), name, days, time, minutes, capacity, room, color: CLASS_COLORS[ci], trainerId: CLASS_TRAINER[name] || 'tr1', active: true }));
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: 'J-50000000-0', phone: '0212-5550000', whatsapp: '0414-5550000', email: 'demo@sanogym.app',
    address: 'Av. Principal, C.C. Las Palmas, nivel 2', instagram: '@titanfitness', trainers: TRAINERS, classes,
    receiptFooter: '¡Gracias por entrenar con nosotros! Constancia, no perfección. 💪'
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}
const at = (daysAgo, h, m = 0) => { const d = addDays(new Date(), -daysAgo); d.setHours(h, m, 0, 0); return d; };
const ago = (n) => dayKey(addDays(new Date(), -n));
const birth = (age, mOff = 3, d = 14) => { const t = new Date(); return `${t.getFullYear() - age}-${String(((t.getMonth() + mOff) % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const birthdayToday = (age) => { const t = new Date(); return `${t.getFullYear() - age}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/**
 * Socios de ejemplo. start: días atrás que empezó su plan actual. freq: entrenamientos por semana.
 * hour: hora habitual. last: días desde la última visita (para los que dejaron de venir).
 */
const MEMBERS = [
  { k: 'valeria', name: 'Valeria Gómez Paredes', sex: 'F', age: 27, idDoc: 'V-24581366', phone: '0414-3201188', goal: 'Tonificar', level: 'Intermedio', plan: 'trimestral', start: 40, freq: 5, hour: 6, trainerId: 'tr2', routine: 't-gluteo', evals: true },
  { k: 'jose', name: 'José Luis Herrera', sex: 'M', age: 34, idDoc: 'V-18220934', phone: '0424-7781020', goal: 'Ganar masa muscular', level: 'Avanzado', plan: 'mensual', start: 26, freq: 6, hour: 18, trainerId: 'tr1', routine: 't-ppl', evals: true },
  { k: 'andrea', name: 'Andrea Castillo Ruiz', sex: 'F', age: 31, idDoc: 'V-20114588', phone: '0412-6654321', goal: 'Bajar de peso', level: 'Principiante', plan: 'mensual', start: 4, freq: 4, hour: 19, trainerId: 'tr2', routine: 't-grasa', evals: true, firstEval: true },
  { k: 'miguel', name: 'Miguel Ángel Torres', sex: 'M', age: 45, idDoc: 'V-12554872', phone: '0416-2203344', goal: 'Salud general', level: 'Principiante', plan: 'anual', start: 120, freq: 3, hour: 7, health: { parq: [true, false, false, false, false, false, false], conditions: ['Hipertensión'], clearance: true, clearanceAt: ago(120) } },
  { k: 'sofia', name: 'Sofía Ramírez Lugo', sex: 'F', age: 22, idDoc: 'V-28990123', phone: '0414-9087766', goal: 'Resistencia y cardio', level: 'Intermedio', plan: 'estudiante', start: 27, freq: 4, hour: 17, birthday: true },
  { k: 'ricardo', name: 'Ricardo Peña Álvarez', sex: 'M', age: 38, idDoc: 'V-16772301', phone: '0424-1132455', goal: 'Fuerza', level: 'Avanzado', plan: 'mensual', start: 32, freq: 5, hour: 20, expired: 3 },
  { k: 'carmen', name: 'Carmen Elena Díaz', sex: 'F', age: 52, idDoc: 'V-9887654', phone: '0412-4456677', goal: 'Salud general', level: 'Principiante', plan: 'manana', start: 12, freq: 3, hour: 8, routine: 't-mayor', health: { parq: [false, false, false, false, true, false, false], conditions: ['Lesión de rodilla'], clearance: false } },
  { k: 'daniel', name: 'Daniel Morales Prieto', sex: 'M', age: 29, idDoc: 'V-21889045', phone: '0416-7788990', goal: 'Ganar masa muscular', level: 'Intermedio', plan: 'mensual', start: 25, freq: 1, hour: 19, last: 14 },
  { k: 'patricia', name: 'Patricia Suárez Medina', sex: 'F', age: 36, idDoc: 'V-17336521', phone: '0414-2219988', goal: 'Tonificar', level: 'Intermedio', plan: 'clases12', start: 15, freq: 3, hour: 18, sessionsUsed: 7 },
  { k: 'luis', name: 'Luis Fernando Rojas', sex: 'M', age: 41, idDoc: 'V-14220981', phone: '0424-6609871', goal: 'Bajar de peso', level: 'Principiante', plan: 'personal8', start: 10, freq: 2, hour: 7, trainerId: 'tr1', sessionsUsed: 3, evals: true },
  { k: 'gabriela', name: 'Gabriela Fuentes', sex: 'F', age: 25, idDoc: 'V-26553410', phone: '0412-3345566', goal: 'Tonificar', level: 'Principiante', plan: 'mensual', start: 18, freq: 4, hour: 12, debt: 10 },
  { k: 'oscar', name: 'Óscar Villalobos', sex: 'M', age: 33, idDoc: 'V-19004567', phone: '0414-5512340', goal: 'Fuerza', level: 'Intermedio', plan: 'trimestral', start: 60, freq: 4, hour: 6, frozen: true },
  { k: 'mariela', name: 'Mariela Contreras', sex: 'F', age: 30, idDoc: 'V-22346781', phone: '0416-8812345', goal: 'Bajar de peso', level: 'Intermedio', plan: 'mensual', start: 40, freq: 3, hour: 18, expired: 12 },
  { k: 'kevin', name: 'Kevin Arteaga', sex: 'M', age: 19, idDoc: 'V-30112456', phone: '0424-9900112', goal: 'Ganar masa muscular', level: 'Principiante', plan: 'semanal', start: 2, freq: 5, hour: 16 },
  { k: 'elena', name: 'Elena Marcano', sex: 'F', age: 63, idDoc: 'V-5332198', phone: '0412-7766554', goal: 'Salud general', level: 'Principiante', plan: 'mensual', start: 29, freq: 3, hour: 9, routine: 't-mayor' },
  { k: 'alberto', name: 'Alberto Guzmán', sex: 'M', age: 48, idDoc: 'V-11908765', phone: '0414-6677889', goal: 'Resistencia y cardio', level: 'Intermedio', plan: 'semestral', start: 150, freq: 4, hour: 6 },
  { k: 'natalia', name: 'Natalia Rondón', sex: 'F', age: 28, idDoc: 'V-23778901', phone: '0424-2233445', goal: 'Tonificar', level: 'Intermedio', plan: 'mensual', start: 50, freq: 3, hour: 19, expired: 21 }
];

const PRODUCTS = [
  ['Proteína whey 2 lb (chocolate)', 'Proteínas', 38, 24, 8, 2, '#7c2d12'], ['Proteína whey 5 lb (vainilla)', 'Proteínas', 75, 50, 4, 1, '#a16207'],
  ['Creatina monohidratada 300 g', 'Suplementos', 28, 17, 10, 3, '#0e7490'], ['Pre-entreno 30 servicios', 'Suplementos', 32, 20, 6, 2, '#be123c'],
  ['BCAA 250 g', 'Suplementos', 22, 13, 2, 3, '#7c3aed'], ['Bebida isotónica 600 ml', 'Bebidas', 1.5, 0.8, 48, 12, '#0284c7'],
  ['Agua mineral 600 ml', 'Bebidas', 1, 0.4, 60, 24, '#38bdf8'], ['Barra de proteína', 'Snacks', 2.5, 1.4, 30, 10, '#92400e'],
  ['Shaker Sano Gym 600 ml', 'Accesorios', 6, 3, 15, 4, '#4d7c0f'], ['Guantes de entrenamiento', 'Accesorios', 12, 6, 7, 3, '#334155'],
  ['Franela dry-fit', 'Ropa', 15, 7, 12, 4, '#16a34a'], ['Toalla de microfibra', 'Accesorios', 8, 4, 0, 3, '#64748b']
];

/** Gimnasio de ejemplo: socios en todos los estados, asistencia de un mes, clases con reservas, rutinas, evaluaciones, tienda y caja. */
export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const t = todayKey();
  const now = new Date();
  const nowH = now.getHours();

  // 1) Caja abierta (todo lo que se cobre hoy pasa por ella)
  if (!store.openShift) { await openShift({ openingUSD: money(50), note: 'Apertura demo' }); await waitFor(() => store.openShift); }

  // 2) Productos de la tienda
  let b = store.batch();
  PRODUCTS.forEach(([name, category, price, cost, stock, minStock, color], i) => {
    b.set(store.ref('products', 'demo_p' + i), { name, category, price: money(price), cost: money(cost), stock, minStock, color, unit: 'und', trackStock: true, sellable: true, active: true, sku: String(7590000000100 + i), sold: 0, createdAt: nowISO(), updatedAt: nowISO(), by: 'demo' });
  });

  // 3) Socios con su membresía, historial de pagos, carnet y rutina
  const members = {};
  const salesHist = [];
  for (const s of MEMBERS) {
    const plan = store.plan(s.plan);
    if (!plan) continue;
    const id = 'demo_' + s.k;
    const seq = store.nextSeq(b, 'mem');
    let start = ago(s.start);
    let end = planEnd(plan, start);
    if (s.expired) { end = ago(s.expired); }
    const visits = plan.kind === 'tiempo' ? null : Number(plan.visits) || 1;
    const visitsLeft = visits == null ? null : Math.max(0, visits - (s.sessionsUsed || 0));
    const msId = 'demo_ms_' + s.k;
    const enrollFee = s.start > 90 ? 0 : round2(Number(store.access.enrollFee) || 0);
    const price = Number(plan.price) || 0;
    const debt = s.debt ? money(s.debt) : 0;
    const total = round2(price + enrollFee);
    const ms = {
      id: msId, planId: plan.id, planName: plan.name, kind: plan.kind, start, end, visits, visitsLeft, status: 'activa',
      freezeDays: Number(plan.freezeDays) || 0, freezeUsed: s.frozen ? 7 : 0, frozenFrom: s.frozen ? ago(2) : null, frozenUntil: s.frozen ? dayKey(addDays(now, 5)) : null,
      timeFrom: plan.timeFrom || '', timeTo: plan.timeTo || '', classes: plan.classes !== false, personal: !!plan.personal, trainerId: s.trainerId || null
    };
    if (s.frozen) ms.end = dayKey(addDays(new Date(end + 'T12:00'), 7));
    const lastDays = s.last ?? (s.expired ? s.expired + 1 : 0);
    const m = {
      name: s.name, idDoc: s.idDoc, sex: s.sex, birthDate: s.birthday ? birthdayToday(s.age) : birth(s.age, MEMBERS.indexOf(s) % 11 + 1, (MEMBERS.indexOf(s) * 3) % 27 + 1),
      phone: s.phone, email: `${s.k}@correo.com`, goal: s.goal, level: s.level, activity: 1.55, trainerId: s.trainerId || null, tags: s.plan === 'estudiante' ? ['Estudiante'] : [],
      emergencyName: 'Familiar de contacto', emergencyPhone: '0414-0000000', health: { parq: [false, false, false, false, false, false, false], conditions: [], clearance: false, answeredAt: start, ...(s.health || {}) },
      number: fmtSeq('S', seq, 4), seq, cardCode: genCode(8), active: true, visits: 0, totalSpent: round2(total - debt), balance: debt, noShows: 0,
      membership: ms, lastCheckinAt: null, enrolledAt: at(s.start, 10).toISOString(), createdAt: at(Math.max(s.start, 1) + (s.start > 60 ? 200 : 0), 10).toISOString(), updatedAt: nowISO(), by: 'demo'
    };
    members[s.k] = { id, ...m, spec: s };
    b.set(store.ref('memberships', msId), { memberId: id, memberName: m.name, memberPhone: m.phone, memberIdDoc: m.idDoc, memberNumber: m.number, planId: plan.id, planName: plan.name, kind: plan.kind, start, end: ms.end, visits, visitsLeft, price, enrollFee, discount: 0, total, paid: round2(total - debt), balance: debt, status: 'activa', trainerId: s.trainerId || null, trainer: TRAINERS.find((x) => x.id === s.trainerId)?.name || '', freezes: s.frozen ? [{ from: ms.frozenFrom, until: ms.frozenUntil, days: 7, reason: 'Viaje de trabajo' }] : [], saleIds: [], prev: null, renewal: s.start > 90, note: '', createdAt: at(s.start, 10).toISOString(), by: 'demo' });
    salesHist.push({ m: members[s.k], msId, plan, start, end: ms.end, price, enrollFee, total, paid: round2(total - debt), debt, daysAgo: s.start });
  }
  await store.commit(b);

  // 4) Recibos históricos de esas membresías (días anteriores, ya fuera de la caja de hoy)
  b = store.batch();
  for (const h of salesHist) {
    const seq = store.nextSeq(b, 'inv');
    const d = at(h.daysAgo, 9 + (h.daysAgo % 9), 15);
    const partial = h.debt > 0.009;
    const items = partial ? [{ name: `Abono: ${h.plan.name}`, price: h.paid, qty: 1, kind: 'abono', planId: h.plan.id, total: h.paid }]
      : [{ name: `${h.plan.name} · ${h.start} al ${h.end}`, price: h.price, qty: 1, kind: 'membresia', planId: h.plan.id, total: h.price }, ...(h.enrollFee ? [{ name: 'Inscripción', price: h.enrollFee, qty: 1, kind: 'inscripcion', total: h.enrollFee }] : [])];
    const method = ['efectivo', 'transferencia', 'debito', 'efectivo', 'transferencia'][seq % 5];
    const ref = store.newRef('sales');
    b.set(ref, { number: fmtSeq('F', seq, 6), seq, kind: partial ? 'abono' : 'membresia', date: d.toISOString(), dayKey: dayKey(d), items, subtotal: h.paid, discount: 0, total: h.paid, cost: 0, rate: 1, payments: [{ method, currency: 'USD', amount: h.paid, usd: h.paid }], paidUSD: h.paid, changeUSD: 0, changeCurrency: 'USD', method, received: h.paid, shiftId: null, memberId: h.m.id, memberName: h.m.name, memberPhone: h.m.phone, memberIdDoc: h.m.idDoc, memberNumber: h.m.number, membershipId: h.msId, planId: h.plan.id, status: 'completed', by: 'demo' });
    b.set(store.ref('memberships', h.msId), { saleIds: [ref.id] }, { merge: true });
  }
  // Ventas de tienda de los últimos días (para reportes)
  for (let i = 1; i <= 12; i++) {
    const [name, , price, cost] = PRODUCTS[i % 8];
    const seq = store.nextSeq(b, 'inv'); const d = at(i % 7 + 1, 17 + (i % 4), 10); const qty = 1 + (i % 3);
    const pr = money(price); const tot = round2(pr * qty);
    b.set(store.newRef('sales'), { number: fmtSeq('F', seq, 6), seq, kind: 'tienda', date: d.toISOString(), dayKey: dayKey(d), items: [{ productId: 'demo_p' + (i % 8), name, price: pr, cost: money(cost), qty, total: tot }], subtotal: tot, discount: 0, total: tot, cost: round2(money(cost) * qty), rate: 1, payments: [{ method: i % 2 ? 'efectivo' : 'debito', currency: 'USD', amount: tot, usd: tot }], paidUSD: tot, changeUSD: 0, changeCurrency: 'USD', method: i % 2 ? 'efectivo' : 'debito', received: tot, shiftId: null, memberId: null, memberName: 'Cliente de mostrador', status: 'completed', by: 'demo' });
  }
  // Gastos de días anteriores
  [['Pago de limpieza', 'Limpieza', 25, 6], ['Mantenimiento de caminadoras', 'Mantenimiento de equipos', 60, 9], ['Servicio de internet', 'Servicios', 30, 15], ['Compra de desinfectante', 'Limpieza', 12, 3]].forEach(([concept, category, amount, d]) => {
    b.set(store.newRef('cash_movements'), { shiftId: null, date: at(d, 11).toISOString(), dayKey: ago(d), type: 'expense', direction: 'out', currency: 'USD', amount: money(amount), rate: 1, flow: { inUSD: 0, inBs: 0, outUSD: money(amount), outBs: 0 }, concept, category, note: '', by: 'demo' });
  });
  await store.commit(b);

  // 5) Asistencia del último mes + hoy (con algunos socios dentro ahora mismo)
  const writes = [];
  const sched = store.settings.schedule;
  for (const m of Object.values(members)) {
    const s = m.spec;
    const firstDay = Math.min(s.start, 30);
    const lastAgo = s.last ?? (s.expired ? s.expired + 1 : 0);
    let visits = 0; let lastAt = null;
    for (let d = firstDay; d >= Math.max(lastAgo, 1); d--) {
      const date = addDays(now, -d); const wd = date.getDay();
      if (wd === 0 && !sched.sunOpen) continue;
      if (s.frozen && d <= 2) continue;
      const p = (s.freq || 3) / 6;
      if (((d * 7 + s.k.length * 13) % 100) / 100 >= p) continue;
      const h = Math.min(21, Math.max(5, (s.hour || 18) + ((d % 3) - 1)));
      const dt = at(d, h, (d * 11) % 60);
      writes.push(['checkins', { memberId: m.id, memberName: m.name, memberPhone: m.phone, memberIdDoc: m.idDoc, memberNumber: m.number, date: dt.toISOString(), dayKey: dayKey(dt), hour: dt.getHours(), weekday: dt.getDay(), via: d % 4 === 0 ? 'kiosco' : 'recepcion', result: 'ok', reason: '', notes: '', planName: m.membership.planName, membershipId: m.membership.id, consumed: m.membership.kind !== 'tiempo', note: '', outAt: new Date(dt.getTime() + 80 * 60000).toISOString(), by: 'demo' }]);
      visits++; lastAt = dt.toISOString();
    }
    m._visits = visits; m._last = lastAt;
  }
  // Hoy: los que vienen temprano ya entraron; algunos están dentro ahora
  const todayList = ['valeria', 'alberto', 'miguel', 'carmen', 'elena', 'luis', 'gabriela', 'jose', 'kevin', 'sofia', 'andrea', 'patricia'];
  const todayIns = [];
  todayList.forEach((k, i) => {
    const m = members[k]; if (!m) return;
    let h = m.spec.hour; let mi = (i * 13) % 60;
    if (h > nowH || (h === nowH && mi > now.getMinutes())) { if (i % 3) return; h = Math.max(5, nowH - (i % 2)); mi = Math.max(0, now.getMinutes() - 10 - i * 4); if (h === nowH && mi < 0) return; }
    const dt = new Date(now); dt.setHours(h, Math.max(0, mi), 0, 0);
    if (dt > now) return;
    const inside = (now - dt) / 60000 < 70;
    writes.push(['checkins', { memberId: m.id, memberName: m.name, memberPhone: m.phone, memberIdDoc: m.idDoc, memberNumber: m.number, date: dt.toISOString(), dayKey: t, hour: dt.getHours(), weekday: dt.getDay(), via: i % 3 === 0 ? 'kiosco' : 'recepcion', result: 'ok', reason: '', notes: m.spec.k === 'gabriela' ? 'Tiene una deuda.' : '', planName: m.membership.planName, membershipId: m.membership.id, consumed: m.membership.kind !== 'tiempo', note: '', ...(inside ? {} : { outAt: new Date(dt.getTime() + 75 * 60000).toISOString() }), by: 'demo' }]);
    m._visits++; m._last = dt.toISOString(); todayIns.push(k);
  });
  // Un intento rechazado hoy (membresía vencida)
  const nat = members.natalia;
  if (nat) { const dt = new Date(now.getTime() - 35 * 60000); writes.push(['checkins', { memberId: nat.id, memberName: nat.name, memberPhone: nat.phone, memberIdDoc: nat.idDoc, memberNumber: nat.number, date: dt.toISOString(), dayKey: dayKey(dt), hour: dt.getHours(), weekday: dt.getDay(), via: 'recepcion', result: 'denied', reason: `Membresía vencida desde el ${nat.membership.end}.`, notes: '', planName: nat.membership.planName, membershipId: nat.membership.id, consumed: false, note: '', by: 'demo' }]); }

  // 6) Reservas de clases: ayer (con asistencia), hoy y mañana
  const regulars = ['valeria', 'patricia', 'sofia', 'andrea', 'gabriela', 'kevin', 'elena', 'jose', 'alberto', 'carmen', 'luis', 'miguel'];
  for (const off of [-1, 0, 1]) {
    const date = dayKey(addDays(now, off));
    store.classesOn(date).forEach((c, ci) => {
      const n = Math.min(Number(c.capacity) || 10, 3 + ((ci * 5 + off + 7) % 9));
      for (let j = 0; j < n; j++) {
        const m = members[regulars[(ci * 3 + j) % regulars.length]]; if (!m) continue;
        const id = bookingId(c.id, date, m.id);
        if (writes.some((w) => w[2] === id)) continue;
        const ended = off < 0 || (off === 0 && (Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(3)) + Number(c.minutes)) < nowH * 60 + now.getMinutes());
        const status = ended ? (j % 6 === 5 ? 'falto' : 'asistio') : 'reservada';
        writes.push(['bookings', { classId: c.id, className: c.name, date, time: c.time, minutes: Number(c.minutes) || 60, room: c.room || '', trainerId: c.trainerId || null, trainer: TRAINERS.find((x) => x.id === c.trainerId)?.name || '', memberId: m.id, memberName: m.name, memberPhone: m.phone, status, createdAt: at(1 - off, 8).toISOString(), by: 'demo' }, id]);
      }
    });
  }
  // Una clase de hoy llena con lista de espera
  const todayCls = store.classesOn(t).find((c) => Number(c.time.slice(0, 2)) > nowH);
  if (todayCls) {
    const all = Object.values(members).filter((m) => !m.spec.expired && !m.spec.frozen);
    let k = 0;
    for (const m of all) {
      const id = bookingId(todayCls.id, t, m.id);
      if (writes.some((w) => w[2] === id)) continue;
      const booked = writes.filter((w) => w[0] === 'bookings' && w[1].classId === todayCls.id && w[1].date === t && w[1].status !== 'espera').length;
      writes.push(['bookings', { classId: todayCls.id, className: todayCls.name, date: t, time: todayCls.time, minutes: Number(todayCls.minutes) || 60, room: todayCls.room || '', trainerId: todayCls.trainerId, trainer: TRAINERS.find((x) => x.id === todayCls.trainerId)?.name || '', memberId: m.id, memberName: m.name, memberPhone: m.phone, status: booked >= (Number(todayCls.capacity) || 10) ? 'espera' : 'reservada', createdAt: new Date(now.getTime() - (40 - k) * 60000).toISOString(), by: 'demo' }, id]);
      if (++k > 30 || writes.filter((w) => w[0] === 'bookings' && w[1].classId === todayCls.id && w[1].date === t && w[1].status === 'espera').length >= 2) break;
    }
  }

  // 7) Rutinas asignadas y una plantilla propia del gimnasio
  const routineDocs = [];
  for (const m of Object.values(members)) {
    if (!m.spec.routine) continue;
    const tpl = ROUTINE_TEMPLATES.find((x) => x.id === m.spec.routine);
    const tr = TRAINERS.find((x) => x.id === (m.trainerId || 'tr1'));
    const r = { name: tpl.name, goal: tpl.goal, level: tpl.level, weeks: tpl.weeks, note: tpl.note, days: JSON.parse(JSON.stringify(tpl.days)), template: false, memberId: m.id, memberName: m.name, trainerId: tr.id, trainer: tr.name, active: true, createdAt: at(Math.min(m.spec.start, 20), 10).toISOString(), updatedAt: at(Math.min(m.spec.start, 20), 10).toISOString(), by: 'demo' };
    const id = 'demo_r_' + m.spec.k;
    routineDocs.push([id, r]);
    m.routineId = id; m.routineName = r.name; m._routine = routineSummary(r);
  }
  const own = ROUTINE_TEMPLATES.find((x) => x.id === 't-inicio');
  routineDocs.push(['demo_tpl_1', { ...JSON.parse(JSON.stringify(own)), name: 'Titan · Adaptación 2 semanas', weeks: 2, template: true, memberId: null, memberName: '', trainerId: 'tr1', trainer: 'Carlos Rivas', active: true, createdAt: at(30, 9).toISOString(), updatedAt: at(30, 9).toISOString(), by: 'demo' }]);

  // 8) Evaluaciones físicas (progreso de 3 meses)
  const evalDocs = [];
  const EV = {
    valeria: [[84, { weight: 66, height: 164, waist: 76, hip: 101, neck: 32, chest: 90, arm: 28, thigh: 58 }], [42, { weight: 63.8, height: 164, waist: 72, hip: 99, neck: 31.5, chest: 89, arm: 28.5, thigh: 57 }], [5, { weight: 62.1, height: 164, waist: 69, hip: 98, neck: 31, chest: 89, arm: 29, thigh: 56.5 }]],
    jose: [[90, { weight: 74, height: 178, waist: 82, neck: 38, chest: 98, arm: 34 }], [45, { weight: 77.5, height: 178, waist: 82, neck: 39, chest: 102, arm: 36 }], [3, { weight: 80.2, height: 178, waist: 83, neck: 40, chest: 105, arm: 37.5 }]],
    andrea: [[4, { weight: 82, height: 162, waist: 94, hip: 112, neck: 35, restHr: 82, bp: '128/84' }]],
    luis: [[10, { weight: 104, height: 176, waist: 112, neck: 43, restHr: 88, bp: '135/88' }], [1, { weight: 101.6, height: 176, waist: 109, neck: 42.5, restHr: 84, bp: '130/85' }]]
  };
  for (const [k, list] of Object.entries(EV)) {
    const m = members[k]; if (!m) continue;
    list.forEach(([d, e], i) => {
      const ev = { date: ago(d), ...e, activity: 1.55, notes: i === 0 ? 'Evaluación inicial.' : '' };
      const c = evalCalc(ev, m);
      evalDocs.push(['demo_ev_' + k + i, { ...ev, bmi: c.bmi, fatCalc: c.fat, lean: c.lean, bmr: c.energy?.bmr || null, memberId: m.id, memberName: m.name, by: 'demo', createdAt: at(d, 10).toISOString(), updatedAt: at(d, 10).toISOString() }]);
      const last = { date: ev.date, weight: ev.weight, bmi: c.bmi, fat: c.fat, height: ev.height };
      if (i === 0) m.firstEval = last;
      m.lastEval = last; m.height = ev.height;
    });
  }

  // 9) Escribir todo en lotes
  const all = [
    ...writes.map(([col, data, id]) => [col, id || null, data]),
    ...routineDocs.map(([id, r]) => ['routines', id, r]),
    ...evalDocs.map(([id, e]) => ['evaluations', id, e])
  ];
  for (let i = 0; i < all.length; i += 80) {
    const bb = store.batch();
    all.slice(i, i + 80).forEach(([col, id, data]) => bb.set(id ? store.ref(col, id) : store.newRef(col), data));
    await store.commit(bb);
  }
  b = store.batch();
  for (const m of Object.values(members)) {
    const { spec, _visits, _last, _routine, id, ...data } = m;
    const noShows = spec.k === 'kevin' ? 3 : 0;
    const doc2 = { ...data, visits: _visits || 0, lastCheckinAt: _last, noShows };
    b.set(store.ref('members', id), doc2);
    b.set(store.cardRef(m.cardCode), cardData({ id, ...doc2 }, _routine ? { routine: _routine } : {}));
  }
  await store.commit(b);
  await waitFor(() => store.members.length >= MEMBERS.length);

  // 10) Movimiento real de hoy por la caja: un socio nuevo, una renovación, ventas de tienda y un gasto
  try {
    const plan = store.plan('mensual');
    await sellMembership({ member: { name: 'Fernanda Quintero', idDoc: 'V-27665432', phone: '0414-1239876', sex: 'F', goal: 'Tonificar', level: 'Principiante', birthDate: birth(24), tags: ['Referida'] }, plan, start: t, payments: [{ method: 'efectivo', amount: round2((Number(plan.price) || 0) + (Number(store.access.enrollFee) || 0)) }] });
    const jose = store.member('demo_jose');
    if (jose) {
      const { suggestStart } = await import('./ops.js');
      await sellMembership({ member: jose, plan, start: suggestStart(jose), payments: [{ method: 'transferencia', amount: Number(plan.price) || 0 }] });
    }
    const p0 = store.product('demo_p5'); const p1 = store.product('demo_p7'); const p2 = store.product('demo_p0');
    if (p0 && p1) await chargeSale({ lines: [{ productId: p0.id, name: p0.name, price: p0.price, cost: p0.cost, qty: 2 }, { productId: p1.id, name: p1.name, price: p1.price, cost: p1.cost, qty: 1 }], payments: [{ method: 'efectivo', amount: round2(p0.price * 2 + p1.price) }] });
    if (p2) await chargeSale({ lines: [{ productId: p2.id, name: p2.name, price: p2.price, cost: p2.cost, qty: 1 }], member: store.member('demo_valeria'), payments: [{ method: 'debito', amount: p2.price }] });
    await cashMovement({ direction: 'out', currency: 'USD', amount: money(8), concept: 'Botellones de agua', category: 'Insumos' });
  } catch (e) { console.warn('[demo] ventas de hoy', e); }
}

/** Borra todos los datos de una sede (y sus carnets públicos). */
export async function purgeTenant(tenantId, onlyDemo = true) {
  try {
    const snap = await getDocs(collection(db, 'tenants', tenantId, 'members'));
    const codes = snap.docs.map((d) => d.data().cardCode).filter(Boolean);
    for (let i = 0; i < codes.length; i += 80) {
      const b = writeBatch(db);
      codes.slice(i, i + 80).forEach((c) => b.delete(doc(db, 'cards', c)));
      await b.commit().catch((e) => console.warn('[purge] carnets', e?.code || e));
    }
  } catch (e) { console.warn('[purge] carnets', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 80) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId) {
  await purgeTenant(tenantId, true);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
