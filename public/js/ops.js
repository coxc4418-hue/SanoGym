// Sano Gym — Operaciones: socios, membresías, acceso, clases, rutinas, evaluaciones, cobros, caja e inventario
import { auth } from './firebase.js';
import { store, memberStatus, daysBetween, LIVE_STATUS } from './store.js';
import { round2, round4, nowISO, todayKey, dayKey, PAY_METHODS, addDays, fromKey, loc, usd, fmtDate } from './utils.js';
import { planEnd, evalCalc, needsClearance, exercise } from './gym.js';

export const APP_URL = 'https://sano-gym.web.app';
export const by = () => (auth.currentUser?.isAnonymous ? 'demo' : (auth.currentUser?.email || '').split('@')[0] || '—');
const FLOW0 = () => ({ inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 });

const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode(n = 8) {
  return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join('');
}
export const cardUrl = (code) => `${APP_URL}/carnet/${code}`;
export const fmtSeq = (prefix, n, len = 5) => `${prefix}-${String(n).padStart(len, '0')}`;
export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowHM = () => { const d = new Date(); return minToTime(d.getHours() * 60 + d.getMinutes()); };

// ======================================================================
// TOTALES
// ======================================================================
export function itemsTotal(items) { return round2((items || []).reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)); }
export function itemsCost(items) { return round2((items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0)); }
export function cleanItems(items) {
  return (items || []).filter((i) => i && i.name && Number(i.qty) > 0).map((i) => ({
    productId: i.productId || null, planId: i.planId || null, trainerId: i.trainerId || null, name: String(i.name), qty: round4(Number(i.qty)),
    price: round2(Number(i.price) || 0), cost: round4(Number(i.cost) || 0), kind: i.kind || (i.productId ? 'producto' : 'servicio')
  }));
}

// ======================================================================
// PAGOS Y CAJA
// ======================================================================
export function normalizePays(payments) {
  return (payments || []).filter((p) => p.amount > 0.004).map((p) => ({ method: p.method, currency: loc().cur, amount: round2(p.amount), usd: round4(p.amount) }));
}
/** Lo que realmente queda por forma de pago: lo pagado menos el vuelto, que sale del efectivo. */
export function methodNet(sale) {
  const m = {};
  (sale.payments || []).forEach((p) => { m[p.method] = round4((m[p.method] || 0) + (p.usd || 0)); });
  const ch = Number(sale.changeUSD) || 0;
  if (ch > 0.004) m.efectivo = round4((m.efectivo || 0) - ch);
  return m;
}
export function cashFlowOf(payments, changeUSD) {
  const f = FLOW0();
  for (const p of payments) if (PAY_METHODS[p.method]?.cash || p.method === 'efectivo_usd') f.inUSD += p.amount;
  if (changeUSD > 0.004) f.outUSD += round2(changeUSD);
  for (const k in f) f[k] = round2(f[k]);
  return f;
}
function shiftIncrements(flow, extra = {}) {
  const u = {};
  for (const k of ['inUSD', 'inBs', 'outUSD', 'outBs']) if (flow[k]) u[k] = store.inc(flow[k]);
  for (const [k, v] of Object.entries(extra)) if (v) u[k] = store.inc(round4(v));
  u.updatedAt = nowISO();
  return u;
}
function preparePayment({ amount, payments }) {
  const shift = store.openShift;
  if (!shift) throw new Error('Abre la caja antes de cobrar (menú Caja).');
  const pays = normalizePays(payments);
  const paidUSD = round4(pays.reduce((a, p) => a + p.usd, 0));
  if (paidUSD < amount - 0.01) throw new Error(`Falta por cobrar ${usd(amount - paidUSD)}.`);
  const changeUSD = round2(Math.max(0, paidUSD - amount));
  const flow = cashFlowOf(pays, changeUSD);
  return { rate: 1, shift, pays, paidUSD, changeUSD, changeCurrency: 'USD', flow, received: round2(paidUSD - changeUSD) };
}
function addToShift(b, pay) {
  const byMethod = {};
  for (const [k, v] of Object.entries(methodNet({ payments: pay.pays, changeUSD: pay.changeUSD }))) byMethod[`byMethod.${k}`] = v;
  b.update(store.ref('cash_shifts', pay.shift.id), shiftIncrements(pay.flow, { salesCount: 1, salesTotal: pay.received, ...byMethod }));
}
function paymentFields(pay) {
  return {
    rate: 1, payments: pay.pays, paidUSD: pay.paidUSD, changeUSD: pay.changeUSD, changeCurrency: 'USD',
    method: pay.pays.length === 1 ? pay.pays[0].method : pay.pays.length ? 'mixto' : 'ninguno', received: pay.received,
    shiftId: pay.shift?.id || null, cashFlow: pay.flow, fxRate: Number(store.settings.fx?.enabled ? store.settings.fx.rate : 0) || 0
  };
}
export function memberFields(m) {
  return { memberId: m?.id || null, memberName: m?.name || 'Cliente de mostrador', memberPhone: m?.phone || '', memberIdDoc: m?.idDoc || '', memberNumber: m?.number || '' };
}
function newSale(b, { kind, items, discount = 0, pay, member, extra = {} }) {
  const seq = store.nextSeq(b, 'inv');
  const number = fmtSeq(store.settings.invoicePrefix || 'F', seq, 6);
  const ref = store.newRef('sales');
  const subtotal = itemsTotal(items);
  const total = round2(subtotal - discount);
  const sale = {
    number, seq, kind, date: nowISO(), dayKey: todayKey(), items: items.map((x) => ({ ...x, total: round2(x.price * x.qty) })),
    subtotal, discount: round2(discount), total, cost: itemsCost(items), ...paymentFields(pay), ...memberFields(member), status: 'completed', by: by(), ...extra
  };
  b.set(ref, sale);
  addToShift(b, pay);
  return { id: ref.id, ...sale };
}

// ======================================================================
// INVENTARIO: descuento de productos vendidos
// ======================================================================
function applyStockDelta(b, oldItems, newItems, refLabel, type = 'venta') {
  const qtyMap = (items) => {
    const m = new Map();
    (items || []).forEach((i) => { if (i.productId) m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.qty) || 0)); });
    return m;
  };
  const before = qtyMap(oldItems); const after = qtyMap(newItems);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const date = nowISO();
  const low = [];
  for (const id of ids) {
    const p = store.product(id);
    const delta = round4((after.get(id) || 0) - (before.get(id) || 0));
    if (!p || !delta || p.trackStock === false) continue;
    b.update(store.ref('products', id), { stock: store.inc(-delta), ...(delta > 0 ? { sold: store.inc(delta) } : {}), updatedAt: date });
    b.set(store.newRef('inventory_logs'), { productId: id, name: p.name, date, dayKey: todayKey(), type: delta > 0 ? type : 'devolucion', qty: -delta, cost: Number(p.cost) || 0, reason: refLabel, by: by() });
    const left = (Number(p.stock) || 0) - delta;
    if (delta > 0 && left <= (Number(p.minStock) || 0)) low.push({ ...p, stock: left });
  }
  return low;
}
function checkStock(items) {
  for (const l of items) {
    const p = l.productId && store.product(l.productId);
    if (p && p.trackStock !== false && (Number(p.stock) || 0) < l.qty - 1e-9) throw new Error(`No hay suficiente ${p.name} (quedan ${Number(p.stock) || 0}).`);
  }
}

// ======================================================================
// CARNET DIGITAL (colección pública cards/{código}: datos mínimos del socio)
// ======================================================================
export function cardData(m, extra = {}) {
  const ms = m.membership || null;
  const first = String(m.name || '').trim().split(/\s+/);
  return {
    tenantId: store.tenantId, gym: store.businessName, gymPhone: store.settings.whatsapp || store.settings.phone || '', gymAddress: store.settings.address || '',
    country: store.settings.country || '', name: first.length > 1 ? `${first[0]} ${first[first.length - 1]}` : first[0] || 'Socio', number: m.number || '',
    active: m.active !== false, plan: ms ? { name: ms.planName, kind: ms.kind, start: ms.start, end: ms.end, visitsLeft: ms.visitsLeft ?? null, visits: ms.visits ?? null, frozenFrom: ms.frozenFrom || null, frozenUntil: ms.frozenUntil || null, status: ms.status || 'activa' } : null,
    debt: (Number(m.balance) || 0) > 0.009, visits: Number(m.visits) || 0, lastCheckinAt: m.lastCheckinAt || null, lastEval: m.lastEval || null, goal: m.goal || '',
    updatedAt: nowISO(), ...extra
  };
}
function putCard(b, m, extra = {}) {
  if (!m?.cardCode) return;
  b.set(store.cardRef(m.cardCode), cardData(m, extra), { merge: true });
}
/** Resumen de la rutina para el carnet (sin datos sensibles) */
export function routineSummary(r) {
  if (!r) return null;
  return { name: r.name, goal: r.goal || '', level: r.level || '', note: r.note || '', trainer: r.trainer || '', updatedAt: nowISO(),
    days: (r.days || []).map((d) => ({ name: d.name, items: (d.items || []).map((i) => ({ name: i.name, sets: i.sets, reps: i.reps, rest: i.rest, weight: i.weight || '', note: i.note || '' })) })) };
}

// ======================================================================
// SOCIOS
// ======================================================================
const MEMBER_FIELDS = ['name', 'idDoc', 'birthDate', 'sex', 'phone', 'email', 'address', 'occupation', 'photo', 'emergencyName', 'emergencyPhone',
  'goal', 'level', 'activity', 'trainerId', 'referredBy', 'notes', 'health', 'tags', 'company', 'guardianName'];

export function cleanMember(data) {
  const out = {};
  for (const k of MEMBER_FIELDS) {
    if (data[k] === undefined) continue;
    out[k] = Array.isArray(data[k]) ? data[k].map((x) => String(x).trim()).filter(Boolean) : typeof data[k] === 'object' && data[k] ? data[k] : String(data[k] ?? '').trim();
  }
  if (out.name) out.name = out.name.replace(/\s+/g, ' ');
  if (out.idDoc) out.idDoc = out.idDoc.toUpperCase().replace(/\s+/g, '');
  if (out.activity) out.activity = Number(out.activity) || 1.55;
  return out;
}
const docKey = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^[VEJPG]/, '');
/** Socio con el mismo documento (evita duplicados) */
export function findByIdDoc(idDoc, exceptId = null) {
  const k = docKey(idDoc);
  if (k.length < 5) return null;
  return store.members.find((p) => p.id !== exceptId && docKey(p.idDoc) === k) || null;
}

function newMemberDoc(b, data) {
  const clean = cleanMember(data);
  if (!clean.name) throw new Error('Escribe el nombre del socio.');
  const dup = clean.idDoc && findByIdDoc(clean.idDoc);
  if (dup) throw new Error(`Ya existe un socio con ese documento: ${dup.name} (${dup.number}).`);
  const ref = store.newRef('members');
  const seq = store.nextSeq(b, 'mem');
  const date = nowISO();
  const m = { ...clean, number: fmtSeq('S', seq, 4), seq, cardCode: genCode(8), active: true, visits: 0, totalSpent: 0, balance: 0, noShows: 0, membership: null, lastCheckinAt: null, createdAt: date, updatedAt: date, by: by() };
  b.set(ref, m);
  const out = { id: ref.id, ...m };
  putCard(b, out);
  return out;
}

export async function saveMember(data, id = null) {
  const b = store.batch();
  if (!id) {
    const m = newMemberDoc(b, data);
    await store.commit(b);
    return m;
  }
  const clean = cleanMember(data);
  const dup = clean.idDoc && findByIdDoc(clean.idDoc, id);
  if (dup) throw new Error(`Ya existe un socio con ese documento: ${dup.name} (${dup.number}).`);
  b.set(store.ref('members', id), { ...clean, updatedAt: nowISO() }, { merge: true });
  const m = { ...(store.member(id) || {}), ...clean, id };
  putCard(b, m);
  await store.commit(b);
  return m;
}
export async function setMemberActive(m, active, reason = '') {
  const b = store.batch();
  b.set(store.ref('members', m.id), { active, updatedAt: nowISO(), ...(active ? { leftAt: null, leftReason: '' } : { leftAt: nowISO(), leftReason: reason }) }, { merge: true });
  putCard(b, { ...m, active });
  await store.commit(b);
}
/** Regenera el código del carnet (si el socio lo perdió o lo compartió) */
export async function renewCardCode(m) {
  const b = store.batch();
  const code = genCode(8);
  if (m.cardCode) b.delete(store.cardRef(m.cardCode));
  b.set(store.ref('members', m.id), { cardCode: code, updatedAt: nowISO() }, { merge: true });
  putCard(b, { ...m, cardCode: code });
  await store.commit(b);
  return code;
}

// ======================================================================
// MEMBRESÍAS
// ======================================================================
/** ¿Cobra inscripción? La primera vez, o si estuvo vencido más días de los configurados. */
export function needsEnroll(m) {
  if ((Number(store.access.enrollFee) || 0) <= 0) return false;
  if (!m?.membership) return true;
  const ms = m.membership;
  if (ms.status === 'anulada') return !m.enrolledAt;
  return ms.end < dayKey(addDays(new Date(), -(Number(store.access.reenrollDays) || 60)));
}
/** Fecha de inicio sugerida: el día siguiente al vencimiento si aún está vigente; si no, hoy. */
export function suggestStart(m) {
  const t = todayKey();
  const ms = m?.membership;
  if (ms && ms.status !== 'anulada' && ms.end >= t && ms.kind === 'tiempo') return dayKey(addDays(fromKey(ms.end), 1));
  return t;
}
export function quoteMembership({ member, plan, start, discount = 0, enroll = null }) {
  const s = start || suggestStart(member);
  const end = planEnd(plan, s);
  const price = round2(Number(plan.price) || 0);
  const withEnroll = enroll == null ? needsEnroll(member) : enroll;
  const enrollFee = withEnroll && plan.kind !== 'pase' ? round2(Number(store.access.enrollFee) || 0) : 0;
  const disc = round2(Math.min(price + enrollFee, Math.max(0, Number(discount) || 0)));
  return { start: s, end, price, enrollFee, discount: disc, total: round2(price + enrollFee - disc) };
}
function snapOf(msId, plan, q, extra = {}) {
  return {
    id: msId, planId: plan.id, planName: plan.name, kind: plan.kind, start: q.start, end: q.end,
    visits: plan.kind === 'tiempo' ? null : Number(plan.visits) || 1, visitsLeft: plan.kind === 'tiempo' ? null : Number(plan.visits) || 1,
    status: 'activa', freezeDays: Number(plan.freezeDays) || 0, freezeUsed: 0, frozenFrom: null, frozenUntil: null,
    timeFrom: plan.timeFrom || '', timeTo: plan.timeTo || '', classes: plan.classes !== false, personal: !!plan.personal, ...extra
  };
}

/**
 * Vende una membresía. paid: lo que se cobra ahora (puede ser menos que el total: queda como deuda del socio).
 * Si paid > 0 hace falta la caja abierta.
 */
export async function sellMembership({ member, plan, start, discount = 0, enroll = null, paid = null, payments = [], trainerId = null, note = '' }) {
  if (!plan) throw new Error('Elige un plan.');
  const b = store.batch();
  let m = member;
  if (!m?.id) m = newMemberDoc(b, member || {});
  const q = quoteMembership({ member: m, plan, start, discount, enroll });
  if (q.end < todayKey()) throw new Error('La membresía quedaría vencida: revisa la fecha de inicio.');
  const pay = paid == null ? q.total : round2(Math.min(q.total, Math.max(0, Number(paid) || 0)));
  const balance = round2(q.total - pay);
  const date = nowISO();
  const msRef = store.newRef('memberships');
  const trainer = store.trainer(trainerId || plan.trainerId) || null;
  const items = cleanItems([
    { name: `${plan.name} · ${fmtDate(q.start)} al ${fmtDate(q.end)}`, price: q.price, qty: 1, planId: plan.id, trainerId: trainer?.id || null, kind: 'membresia' },
    ...(q.enrollFee ? [{ name: 'Inscripción', price: q.enrollFee, qty: 1, kind: 'inscripcion' }] : [])
  ]);
  let sale = null;
  if (pay > 0.004) {
    const p = preparePayment({ amount: pay, payments });
    const saleItems = balance > 0.009 ? cleanItems([{ name: `Abono: ${plan.name} (${fmtDate(q.start)} al ${fmtDate(q.end)})`, price: pay, qty: 1, planId: plan.id, trainerId: trainer?.id || null, kind: 'abono' }]) : items;
    sale = newSale(b, { kind: balance > 0.009 ? 'abono' : 'membresia', items: saleItems, discount: balance > 0.009 ? 0 : q.discount, pay: p, member: m, extra: { membershipId: msRef.id, planId: plan.id, note } });
  }
  const ms = {
    ...memberFields(m), planId: plan.id, planName: plan.name, kind: plan.kind, start: q.start, end: q.end,
    visits: plan.kind === 'tiempo' ? null : Number(plan.visits) || 1, visitsLeft: plan.kind === 'tiempo' ? null : Number(plan.visits) || 1,
    price: q.price, enrollFee: q.enrollFee, discount: q.discount, total: q.total, paid: pay, balance, status: 'activa',
    trainerId: trainer?.id || null, trainer: trainer?.name || '', freezes: [], saleIds: sale ? [sale.id] : [], prev: m.membership || null,
    renewal: !!(m.membership && m.membership.status !== 'anulada'), note, createdAt: date, by: by()
  };
  b.set(msRef, ms);
  // Renovación anticipada: el acceso sigue continuo desde el plan actual hasta el nuevo vencimiento
  const cur = m.membership;
  const live = cur && cur.status !== 'anulada' && LIVE_STATUS.includes(memberStatus(m));
  const snap = snapOf(msRef.id, plan, q, { trainerId: trainer?.id || null, ...(live && q.start > todayKey() ? { start: cur.start, paidFrom: q.start } : {}) });
  const patch = {
    membership: snap, totalSpent: store.inc(pay), balance: store.inc(balance), updatedAt: date,
    ...(q.enrollFee ? { enrolledAt: date } : {}), ...(trainer && plan.personal ? { trainerId: trainer.id } : {})
  };
  b.set(store.ref('members', m.id), patch, { merge: true });
  const after = { ...m, membership: snap, balance: (Number(m.balance) || 0) + balance };
  putCard(b, after);
  await store.commit(b);
  return { member: after, membership: { id: msRef.id, ...ms }, sale, quote: q, balance };
}

/** Cobra deuda del socio (abono al saldo de su membresía) */
export async function payBalance(m, { amount, payments, note = '' }) {
  const bal = round2(Number(m.balance) || 0);
  const amt = round2(Math.min(bal, Number(amount) || 0));
  if (!(amt > 0)) throw new Error('Indica el monto a abonar.');
  const b = store.batch();
  const p = preparePayment({ amount: amt, payments });
  const msId = m.membership?.id || null;
  const sale = newSale(b, { kind: 'abono', items: cleanItems([{ name: `Abono a deuda${m.membership ? ' · ' + m.membership.planName : ''}`, price: amt, qty: 1, kind: 'abono' }]), pay: p, member: m, extra: { membershipId: msId, note } });
  b.set(store.ref('members', m.id), { balance: store.inc(-amt), totalSpent: store.inc(amt), updatedAt: nowISO() }, { merge: true });
  if (msId) b.set(store.ref('memberships', msId), { paid: store.inc(amt), balance: store.inc(-amt), updatedAt: nowISO() }, { merge: true });
  putCard(b, { ...m, balance: bal - amt });
  await store.commit(b);
  return { sale };
}

/** Congela la membresía N días desde una fecha: el vencimiento se corre esos días. */
export async function freezeMembership(m, { from, days, reason = '', force = false }) {
  const ms = m.membership;
  if (!ms || ms.status === 'anulada') throw new Error('El socio no tiene una membresía para congelar.');
  if (ms.kind === 'pase') throw new Error('Un pase diario no se puede congelar.');
  const d = Math.round(Number(days) || 0);
  if (d < 1) throw new Error('Indica los días a congelar.');
  if (from > ms.end) throw new Error('La fecha de inicio es posterior al vencimiento.');
  const allowed = Math.max(0, (Number(ms.freezeDays) || 0) - (Number(ms.freezeUsed) || 0));
  if (d > allowed && !force) throw new Error(allowed ? `Este plan permite congelar ${allowed} día(s) más.` : 'Este plan no incluye días de congelamiento.');
  const until = dayKey(addDays(fromKey(from), d - 1));
  const end = dayKey(addDays(fromKey(ms.end), d));
  const snap = { ...ms, frozenFrom: from, frozenUntil: until, end, freezeUsed: (Number(ms.freezeUsed) || 0) + d };
  const b = store.batch();
  b.set(store.ref('members', m.id), { membership: snap, updatedAt: nowISO() }, { merge: true });
  b.set(store.ref('memberships', ms.id), { end, freezeUsed: snap.freezeUsed, freezes: [...(ms.freezes || []), { from, until, days: d, reason, at: nowISO(), by: by() }], updatedAt: nowISO() }, { merge: true });
  putCard(b, { ...m, membership: snap });
  await store.commit(b);
  return snap;
}
/** Termina el congelamiento hoy: devuelve los días no usados */
export async function unfreezeMembership(m) {
  const ms = m.membership;
  const t = todayKey();
  if (!ms?.frozenUntil || ms.frozenUntil < t) throw new Error('La membresía no está congelada.');
  const startAt = ms.frozenFrom && ms.frozenFrom > t ? ms.frozenFrom : t;
  const unused = daysBetween(startAt, ms.frozenUntil) + 1;
  const end = dayKey(addDays(fromKey(ms.end), -unused));
  const snap = { ...ms, frozenUntil: ms.frozenFrom && ms.frozenFrom > t ? null : dayKey(addDays(new Date(), -1)), frozenFrom: ms.frozenFrom && ms.frozenFrom > t ? null : ms.frozenFrom, end, freezeUsed: Math.max(0, (Number(ms.freezeUsed) || 0) - unused) };
  const b = store.batch();
  b.set(store.ref('members', m.id), { membership: snap, updatedAt: nowISO() }, { merge: true });
  b.set(store.ref('memberships', ms.id), { end, freezeUsed: snap.freezeUsed, updatedAt: nowISO() }, { merge: true });
  putCard(b, { ...m, membership: snap });
  await store.commit(b);
  return snap;
}
/** Ajuste manual (cortesía, compensación, corrección): vencimiento y sesiones */
export async function adjustMembership(m, { end, visitsLeft, reason = '' }) {
  const ms = m.membership;
  if (!ms) throw new Error('El socio no tiene membresía.');
  if (end && ms.start && end < ms.start) throw new Error('La fecha de vencimiento no puede ser anterior al inicio del plan.');
  const snap = { ...ms, ...(end ? { end } : {}), ...(visitsLeft != null && ms.kind !== 'tiempo' ? { visitsLeft: Math.max(0, Math.round(visitsLeft)) } : {}) };
  const b = store.batch();
  b.set(store.ref('members', m.id), { membership: snap, updatedAt: nowISO() }, { merge: true });
  b.set(store.ref('memberships', ms.id), { end: snap.end, visitsLeft: snap.visitsLeft ?? null, adjustments: [...(ms.adjustments || []), { at: nowISO(), by: by(), from: ms.end, to: snap.end, visits: snap.visitsLeft ?? null, reason }], updatedAt: nowISO() }, { merge: true });
  putCard(b, { ...m, membership: snap });
  await store.commit(b);
  return snap;
}

// ======================================================================
// CONTROL DE ACCESO
// ======================================================================
/**
 * Evalúa si el socio puede entrar ahora.
 * → { level: 'ok' | 'warn' | 'deny', title, reasons: [motivos de rechazo], notes: [avisos], consume (descuenta sesión) }
 */
export function checkAccess(m, now = new Date()) {
  const t = dayKey(now);
  const A = store.access;
  const reasons = []; const notes = [];
  const ms = m?.membership;
  const prev = store.checkedInToday(m?.id);
  let consume = false;
  if (!m) return { level: 'deny', title: 'Socio no encontrado', reasons: ['El código no corresponde a ningún socio.'], notes };
  if (m.active === false) reasons.push('El socio está dado de baja.');
  else if (!ms || ms.status === 'anulada') reasons.push('No tiene una membresía. Véndele un plan o un pase diario.');
  else {
    const st = memberStatus(m, t);
    if (st === 'congelado') reasons.push(`Membresía congelada hasta el ${fmtDate(ms.frozenUntil)}.`);
    else if (st === 'pendiente') reasons.push(`Su plan empieza el ${fmtDate(ms.start)}.`);
    else if (ms.end < t) {
      const late = daysBetween(ms.end, t);
      if (late <= (Number(A.graceDays) || 0)) notes.push(`Venció hace ${late} día(s): entra por los días de gracia. Recuérdale renovar.`);
      else reasons.push(`Membresía vencida desde el ${fmtDate(ms.end)} (hace ${late} días).`);
    } else {
      const left = daysBetween(t, ms.end);
      if (left === 0) notes.push('Su membresía vence HOY. Ofrécele renovar.');
      else if (left <= (store.settings.remindDays ?? 5)) notes.push(`Vence en ${left} día(s) (${fmtDate(ms.end)}).`);
    }
    if (ms.kind !== 'tiempo' && !reasons.length) {
      if (prev) notes.push('Ya registró una entrada hoy: no se descuenta otra sesión.');
      else if (Number(ms.visitsLeft ?? 0) <= 0) reasons.push('Ya usó todas las sesiones de su plan.');
      else { consume = true; const after = Number(ms.visitsLeft) - 1; notes.push(after <= 2 ? `Le quedarán ${after} sesión(es).` : `Sesión ${Number(ms.visits) - after} de ${ms.visits}.`); }
    }
    if ((ms.timeFrom || ms.timeTo) && !reasons.length) {
      const hm = minToTime(now.getHours() * 60 + now.getMinutes());
      if ((ms.timeFrom && hm < ms.timeFrom) || (ms.timeTo && hm > ms.timeTo)) reasons.push(`Su plan solo permite entrar de ${ms.timeFrom || '00:00'} a ${ms.timeTo || '23:59'}.`);
    }
  }
  const bal = Number(m.balance) || 0;
  if (bal > 0.009) (A.blockDebt ? reasons : notes).push(`Tiene una deuda de ${usd(bal)}.`);
  if (needsClearance(m.health)) (A.requireParq ? reasons : notes).push('Falta la constancia médica (respondió “sí” en el cuestionario de salud).');
  if (m.health?.conditions?.length) notes.push(`Salud: ${m.health.conditions.join(', ')}.`);
  if (prev && ms?.kind === 'tiempo') notes.push(`Ya entró hoy a las ${new Date(prev.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`);
  if (m.birthDate && m.birthDate.slice(5) === t.slice(5)) notes.unshift('🎂 ¡Hoy es su cumpleaños! Felicítalo.');
  const cap = Number(A.capacity) || 0;
  if (cap && store.inside.length >= cap && !reasons.length) notes.push(`Aforo completo (${store.inside.length}/${cap}).`);
  const level = reasons.length ? 'deny' : notes.some((n) => !/cumplea|Sesión \d|Salud:/.test(n)) ? 'warn' : 'ok';
  return { level, title: level === 'deny' ? 'Acceso denegado' : 'Bienvenido', reasons, notes, consume };
}

/** Registra la entrada. force: el personal autoriza la entrada pese al rechazo (con PIN). */
export async function registerCheckin(m, { via = 'recepcion', force = false, note = '', check = null } = {}) {
  const r = check || checkAccess(m);
  const date = nowISO();
  const b = store.batch();
  const ref = store.newRef('checkins');
  const ok = r.level !== 'deny' || force;
  const ms = m?.membership || null;
  const hour = new Date().getHours();
  const c = {
    ...memberFields(m), date, dayKey: todayKey(), hour, weekday: new Date().getDay(), via, result: ok ? (r.level === 'deny' ? 'forced' : 'ok') : 'denied',
    reason: r.reasons.join(' ') || '', notes: r.notes.join(' '), planName: ms?.planName || '', membershipId: ms?.id || null, consumed: ok && r.consume, note, by: by()
  };
  b.set(ref, c);
  if (m?.id && ok) {
    const patch = { lastCheckinAt: date, visits: store.inc(1), updatedAt: date };
    let after = { ...m, lastCheckinAt: date, visits: (Number(m.visits) || 0) + 1 };
    if (r.consume && ms) {
      const snap = { ...ms, visitsLeft: Math.max(0, Number(ms.visitsLeft) - 1) };
      patch.membership = snap; after.membership = snap;
      b.set(store.ref('memberships', ms.id), { visitsLeft: store.inc(-1), updatedAt: date }, { merge: true });
    }
    b.set(store.ref('members', m.id), patch, { merge: true });
    putCard(b, after);
    // Si tiene una clase reservada que empieza pronto (o ya empezó), se marca la asistencia
    const now = toMin(nowHM());
    store.bookings.filter((x) => x.memberId === m.id && x.date === todayKey() && x.status === 'reservada' && toMin(x.time) - now <= 60 && now - toMin(x.time) <= 30)
      .forEach((x) => b.set(store.ref('bookings', x.id), { status: 'asistio', checkinAt: date }, { merge: true }));
  }
  await store.commit(b);
  return { id: ref.id, ...c, ok };
}
export async function checkout(c) { await store.save('checkins', c.id, { outAt: nowISO() }); }

// ======================================================================
// CLASES GRUPALES
// ======================================================================
export const bookingId = (classId, date, memberId) => `${classId}_${date}_${memberId}`;
export async function bookClass({ member, cls, date, force = false }) {
  const st = memberStatus(member, date);
  if (!force) {
    if (!['activo', 'por_vencer'].includes(st) && !(st === 'vencido' && date <= member.membership?.end)) throw new Error(`${member.name} no tiene una membresía vigente para esa fecha.`);
    if (member.membership && member.membership.classes === false) throw new Error(`El plan ${member.membership.planName} no incluye clases grupales.`);
    if (member.membership && member.membership.end < date) throw new Error(`Su membresía vence el ${fmtDate(member.membership.end)}, antes de la clase.`);
  }
  if (date < todayKey() || (date === todayKey() && toMin(cls.time) + (Number(cls.minutes) || 60) < toMin(nowHM()))) throw new Error('Esa clase ya terminó.');
  const id = bookingId(cls.id, date, member.id);
  const ex = store.bookings.find((x) => x.id === id && x.status !== 'cancelada');
  if (ex) throw new Error(`${member.name} ya está ${ex.status === 'espera' ? 'en la lista de espera' : 'inscrito'} en esta clase.`);
  const full = store.bookedCount(cls.id, date) >= (Number(cls.capacity) || 999);
  const t = store.trainer(cls.trainerId);
  const bk = {
    classId: cls.id, className: cls.name, date, time: cls.time, minutes: Number(cls.minutes) || 60, room: cls.room || '', trainerId: cls.trainerId || null, trainer: t?.name || '',
    memberId: member.id, memberName: member.name, memberPhone: member.phone || '', status: full ? 'espera' : 'reservada', createdAt: nowISO(), by: by()
  };
  await store.save('bookings', id, bk, false);
  return { id, ...bk };
}
/** Cancela la reserva; si había lista de espera, pasa el primero a reservado y lo devuelve (para avisarle). */
export async function cancelBooking(bk) {
  const b = store.batch();
  b.set(store.ref('bookings', bk.id), { status: 'cancelada', cancelledAt: nowISO() }, { merge: true });
  let promoted = null;
  if (bk.status === 'reservada') {
    promoted = store.bookingsFor(bk.classId, bk.date).filter((x) => x.status === 'espera' && x.id !== bk.id).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))[0] || null;
    if (promoted) b.set(store.ref('bookings', promoted.id), { status: 'reservada', promotedAt: nowISO() }, { merge: true });
  }
  await store.commit(b);
  return promoted;
}
export async function markBooking(bk, status) {
  const b = store.batch();
  b.set(store.ref('bookings', bk.id), { status, markedAt: nowISO() }, { merge: true });
  if (status === 'falto' && bk.status !== 'falto') b.set(store.ref('members', bk.memberId), { noShows: store.inc(1) }, { merge: true });
  if (bk.status === 'falto' && status !== 'falto') b.set(store.ref('members', bk.memberId), { noShows: store.inc(-1) }, { merge: true });
  await store.commit(b);
}

// ======================================================================
// RUTINAS
// ======================================================================
export function cleanRoutine(r) {
  return {
    name: String(r.name || 'Rutina').trim(), goal: r.goal || '', level: r.level || '', weeks: Number(r.weeks) || 0, note: String(r.note || '').trim(),
    days: (r.days || []).map((d, i) => ({ name: String(d.name || `Día ${i + 1}`).trim(), items: (d.items || []).filter((x) => x && x.name).map((x) => ({
      exId: x.exId || null, name: String(x.name).trim(), sets: Number(x.sets) || 0, reps: String(x.reps ?? '').trim(), rest: Number(x.rest) || 0, weight: String(x.weight ?? '').trim(), note: String(x.note ?? '').trim()
    })) }))
  };
}
/** Guarda una rutina. Si es de un socio, queda como su rutina activa y se publica en su carnet. */
export async function saveRoutine(data, id = null, member = null) {
  const r = cleanRoutine(data);
  if (!r.days.length || !r.days.some((d) => d.items.length)) throw new Error('Agrega al menos un ejercicio.');
  const b = store.batch();
  const ref = id ? store.ref('routines', id) : store.newRef('routines');
  const t = store.trainer(data.trainerId || member?.trainerId);
  const docData = { ...r, template: !member, memberId: member?.id || null, memberName: member?.name || '', trainerId: t?.id || null, trainer: t?.name || '', active: true, updatedAt: nowISO(), ...(id ? {} : { createdAt: nowISO(), by: by() }) };
  b.set(ref, docData, { merge: true });
  if (member) {
    const snap = routineSummary({ ...docData });
    b.set(store.ref('members', member.id), { routineId: ref.id, routineName: r.name, updatedAt: nowISO() }, { merge: true });
    putCard(b, member, { routine: snap });
  }
  await store.commit(b);
  return { id: ref.id, ...docData };
}
export async function deleteRoutine(r) { await store.remove('routines', r.id); }
/** Ejercicio de la biblioteca → línea de rutina */
export const exLine = (id, sets = 3, reps = '12', rest = 60) => { const e = exercise(id); return { exId: id, name: e?.name || id, sets, reps, rest, weight: '', note: '' }; };

// ======================================================================
// EVALUACIONES FÍSICAS
// ======================================================================
const EVAL_NUM = ['weight', 'height', 'fat', 'muscle', 'visceral', 'neck', 'chest', 'waist', 'hip', 'arm', 'thigh', 'calf', 'restHr'];
export async function saveEvaluation(member, data, id = null) {
  const ev = { date: data.date || todayKey(), bp: String(data.bp || '').trim(), notes: String(data.notes || '').trim(), activity: Number(data.activity) || member.activity || 1.55 };
  for (const k of EVAL_NUM) { const v = Number(String(data[k] ?? '').replace(',', '.')); if (v > 0) ev[k] = Math.round(v * 10) / 10; }
  if (!ev.weight) throw new Error('Indica al menos el peso.');
  if (!ev.height && member.height) ev.height = member.height;
  const c = evalCalc(ev, member);
  Object.assign(ev, { bmi: c.bmi, fatCalc: c.fat, lean: c.lean, bmr: c.energy?.bmr || null, memberId: member.id, memberName: member.name, by: by(), updatedAt: nowISO() });
  const b = store.batch();
  const ref = id ? store.ref('evaluations', id) : store.newRef('evaluations');
  b.set(ref, { ...ev, ...(id ? {} : { createdAt: nowISO() }) }, { merge: true });
  const last = { date: ev.date, weight: ev.weight, bmi: c.bmi, fat: c.fat, height: ev.height || null };
  if (!member.lastEval || member.lastEval.date <= ev.date) {
    b.set(store.ref('members', member.id), { lastEval: last, height: ev.height || member.height || null, ...(member.firstEval ? {} : { firstEval: last }), updatedAt: nowISO() }, { merge: true });
    putCard(b, { ...member, lastEval: last });
  }
  await store.commit(b);
  return { id: ref.id, ...ev, calc: c };
}
export async function deleteEvaluation(ev) { await store.remove('evaluations', ev.id); }

// ======================================================================
// COBRO DE PRODUCTOS Y SERVICIOS (tienda y mostrador)
// ======================================================================
export function cartTotals(lines, discount = 0) {
  const subtotal = round2((lines || []).reduce((a, l) => a + l.price * l.qty, 0));
  const disc = round2(Math.min(subtotal, Math.max(0, Number(discount) || 0)));
  return { subtotal, discount: disc, total: round2(subtotal - disc) };
}
export async function chargeSale({ lines, member = null, discount = 0, payments = [], note = '' }) {
  const clean = cleanItems(lines);
  if (!clean.length) throw new Error('No hay nada para cobrar.');
  checkStock(clean);
  const t = cartTotals(clean, discount);
  const pay = preparePayment({ amount: t.total, payments });
  const b = store.batch();
  const sale = newSale(b, { kind: 'tienda', items: clean, discount: t.discount, pay, member, extra: { note } });
  const low = applyStockDelta(b, [], clean, `Venta ${sale.number}`, 'venta');
  if (member?.id && store.member(member.id)) b.update(store.ref('members', member.id), { totalSpent: store.inc(t.total) });
  await store.commit(b);
  return { sale, low };
}

/** Anula una factura: revierte caja e inventario; si era de una membresía, la anula o revierte el abono. */
export async function voidSale(sale, reason = '') {
  if (sale.status === 'voided') throw new Error('El documento ya está anulado.');
  const b = store.batch();
  const date = nowISO();
  b.update(store.ref('sales', sale.id), { status: 'voided', voidedAt: date, voidReason: reason || '', voidedBy: by() });
  if (sale.kind === 'tienda') applyStockDelta(b, sale.items, [], `Anulación ${sale.number}`, 'venta');
  const m = sale.memberId ? store.member(sale.memberId) : null;
  if (sale.membershipId) {
    if (sale.kind === 'membresia') {
      const ms = await store.getDocById('memberships', sale.membershipId);
      b.set(store.ref('memberships', sale.membershipId), { status: 'anulada', voidedAt: date, voidReason: reason, balance: 0 }, { merge: true });
      if (m) {
        const patch = { totalSpent: store.inc(-(sale.total || 0)), balance: store.inc(-(Number(ms?.balance) || 0)), updatedAt: date };
        if (m.membership?.id === sale.membershipId) patch.membership = ms?.prev || null;
        b.set(store.ref('members', m.id), patch, { merge: true });
        putCard(b, { ...m, ...(m.membership?.id === sale.membershipId ? { membership: ms?.prev || null } : {}) });
      }
    } else if (sale.kind === 'abono') {
      b.set(store.ref('memberships', sale.membershipId), { paid: store.inc(-(sale.total || 0)), balance: store.inc(sale.total || 0) }, { merge: true });
      if (m) b.set(store.ref('members', m.id), { balance: store.inc(sale.total || 0), totalSpent: store.inc(-(sale.total || 0)) }, { merge: true });
    }
  } else if (m) b.update(store.ref('members', m.id), { totalSpent: store.inc(-(sale.total || 0)) });
  const shift = store.openShift;
  const f = sale.cashFlow || FLOW0();
  const reverse = { inUSD: f.outUSD || 0, inBs: f.outBs || 0, outUSD: f.inUSD || 0, outBs: f.inBs || 0 };
  let cashReverted = false;
  if (shift && (sale.received || 0) > 0) {
    const extra = {};
    if (sale.shiftId === shift.id) {
      extra.salesCount = -1; extra.salesTotal = -(sale.received || 0);
      for (const [k, v] of Object.entries(methodNet(sale))) extra[`byMethod.${k}`] = -v;
    }
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(reverse, extra));
    if (reverse.inUSD || reverse.outUSD) {
      b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'void', direction: 'out', currency: 'USD', amount: 0, flow: reverse, concept: `Anulación ${sale.number}`, category: 'Anulaciones', refId: sale.id, by: by() });
    }
    cashReverted = true;
  }
  await store.commit(b);
  return { cashReverted };
}

// ======================================================================
// CAJA
// ======================================================================
export async function cashMovement({ direction, currency, amount, concept, category, note = '' }) {
  const shift = store.openShift;
  if (!shift) throw new Error('No hay caja abierta.');
  const b = store.batch();
  const flow = FLOW0();
  flow[direction === 'in' ? 'inUSD' : 'outUSD'] = round2(amount);
  const date = nowISO();
  b.set(store.newRef('cash_movements'), {
    shiftId: shift.id, date, dayKey: todayKey(), type: direction === 'in' ? 'income' : 'expense', direction, currency,
    amount: round2(amount), rate: 1, flow, concept, category, note, by: by()
  });
  b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, direction === 'out' ? { expensesUSD: amount } : { incomeUSD: amount }));
  await store.commit(b);
}
export async function openShift({ openingUSD, openingBs = 0, note = '' }) {
  if (store.openShift) throw new Error('Ya hay una caja abierta.');
  const ref = store.newRef('cash_shifts');
  const b = store.batch();
  const seq = store.nextSeq(b, 'shift');
  b.set(ref, {
    status: 'open', openedAt: nowISO(), openedBy: by(), dayKey: todayKey(), number: fmtSeq('T', seq, 4),
    openingUSD: round2(openingUSD), openingBs: round2(openingBs), rateAtOpen: 1,
    inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note
  });
  await store.commit(b);
  return ref.id;
}
export function shiftExpected(shift) {
  return {
    usd: round2((shift.openingUSD || 0) + (shift.inUSD || 0) - (shift.outUSD || 0)),
    bs: round2((shift.openingBs || 0) + (shift.inBs || 0) - (shift.outBs || 0))
  };
}
export async function closeShift(shift, { countedUSD, countedBs = 0, note = '' }) {
  const exp = shiftExpected(shift);
  const b = store.batch();
  b.update(store.ref('cash_shifts', shift.id), {
    status: 'closed', closedAt: nowISO(), closedBy: by(), rateAtClose: 1,
    expectedUSD: exp.usd, expectedBs: exp.bs, countedUSD: round2(countedUSD), countedBs: round2(countedBs),
    diffUSD: round2(countedUSD - exp.usd), diffBs: round2(countedBs - exp.bs), closeNote: note
  });
  await store.commit(b);
}

// ======================================================================
// INVENTARIO DE LA TIENDA
// ======================================================================
/** mode: 'compra' (entrada con costo) | 'entrada' | 'merma' | 'salida' | 'conteo' (fija el stock) */
export async function moveProduct(p, { mode, qty, unitCost = 0, reason = '', payFromCash = false, payCurrency = 'USD', lot = '', expiresAt = '' }) {
  const current = Number(store.product(p.id)?.stock ?? p.stock) || 0;
  const q = round4(Number(qty) || 0);
  const delta = round4(mode === 'compra' || mode === 'entrada' ? q : mode === 'conteo' ? q - current : -q);
  const date = nowISO();
  const b = store.batch();
  const patch = { stock: store.inc(delta), updatedAt: date };
  if (mode === 'compra' && unitCost > 0) {
    const stockNow = Math.max(0, current);
    const avg = stockNow + q > 0 ? (stockNow * (Number(p.cost) || 0) + q * unitCost) / (stockNow + q) : unitCost;
    patch.cost = round4(avg); patch.lastCost = round4(unitCost); patch.lastPurchaseAt = date;
  }
  if ((mode === 'compra' || mode === 'entrada') && lot) patch.lot = lot;
  if ((mode === 'compra' || mode === 'entrada') && expiresAt) patch.expiresAt = !p.expiresAt || current <= 0 || expiresAt < p.expiresAt ? expiresAt : p.expiresAt;
  b.update(store.ref('products', p.id), patch);
  b.set(store.newRef('inventory_logs'), { productId: p.id, name: p.name, date, dayKey: todayKey(), type: mode, qty: delta, cost: mode === 'compra' ? unitCost : Number(p.cost) || 0, reason, lot: lot || '', expiresAt: expiresAt || '', by: by() });
  if (mode === 'compra' && payFromCash && unitCost > 0) {
    const shift = store.openShift;
    if (!shift) throw new Error('Abre la caja para pagar la compra con dinero de la caja.');
    const amount = round2(unitCost * q);
    const flow = FLOW0(); flow.outUSD = amount;
    b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'expense', direction: 'out', currency: payCurrency, amount, rate: 1, flow, concept: `Compra: ${q} × ${p.name}`, category: 'Compra de mercancía', by: by() });
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { expensesUSD: amount }));
  }
  await store.commit(b);
}

export { addDays, dayKey };
