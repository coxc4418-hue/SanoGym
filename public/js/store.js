// Sano Gym — Capa de datos multisede (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { addDays, startOfDay, sha256, toast, todayKey, dayKey, applyLocale, setFx, scaleUSD, fromKey } from './utils.js';
import { DEFAULT_PLANS } from './gym.js';

// ---------- Estado del socio ----------
export const MEMBER_STATUS = {
  activo: { label: 'Activo', tone: 'success', icon: 'checkCircle' },
  por_vencer: { label: 'Por vencer', tone: 'warning', icon: 'clock' },
  vencido: { label: 'Vencido', tone: 'danger', icon: 'alert' },
  agotado: { label: 'Sin sesiones', tone: 'danger', icon: 'alert' },
  congelado: { label: 'Congelado', tone: 'info', icon: 'snow' },
  pendiente: { label: 'Inicia pronto', tone: 'violet', icon: 'calendar' },
  sin_plan: { label: 'Sin membresía', tone: 'neutral', icon: 'user' },
  baja: { label: 'De baja', tone: 'neutral', icon: 'x' }
};
export const LIVE_STATUS = ['activo', 'por_vencer'];
export const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);

/** Estado de un socio según su membresía vigente (instantánea guardada en el socio) */
export function memberStatus(m, today = todayKey()) {
  if (!m) return 'sin_plan';
  if (m.active === false) return 'baja';
  const ms = m.membership;
  if (!ms || ms.status === 'anulada') return 'sin_plan';
  if (ms.frozenUntil && ms.frozenUntil >= today && (!ms.frozenFrom || ms.frozenFrom <= today)) return 'congelado';
  if (ms.start > today) return 'pendiente';
  if (ms.end < today) return 'vencido';
  if (ms.kind !== 'tiempo' && Number(ms.visitsLeft ?? 1) <= 0) return 'agotado';
  if (daysBetween(today, ms.end) <= (store.settings.remindDays ?? 5)) return 'por_vencer';
  return 'activo';
}
export const statusBadge = (s) => {
  const st = MEMBER_STATUS[s] || { label: s, tone: 'neutral' };
  return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`;
};
export function daysLeft(m, today = todayKey()) {
  const ms = m?.membership;
  return ms?.end ? daysBetween(today, ms.end) : null;
}

export const SEX = { F: 'Femenino', M: 'Masculino' };
export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const PRODUCT_CATEGORIES = ['Suplementos', 'Proteínas', 'Bebidas', 'Snacks', 'Accesorios', 'Ropa', 'Otros'];

// ---------- Reservas de clases ----------
export const BOOK_STATUS = {
  reservada: { label: 'Reservada', tone: 'info' },
  espera: { label: 'Lista de espera', tone: 'warning' },
  asistio: { label: 'Asistió', tone: 'success' },
  falto: { label: 'No asistió', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' }
};

export const DEFAULT_SERVICES = [
  { name: 'Alquiler de toalla', price: 1 }, { name: 'Locker por día', price: 1 }, { name: 'Clase suelta', price: 4 },
  { name: 'Evaluación física', price: 8 }, { name: 'Asesoría nutricional', price: 15 }, { name: 'Reposición de carnet', price: 2 }
];
const DEFAULT_SETTINGS = {
  fx: { enabled: false, sym: 'Bs', name: 'Bolívares', rate: 0, updatedAt: '' },
  businessName: '',
  rif: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  instagram: '',
  receiptFooter: '¡Gracias por entrenar con nosotros! Constancia, no perfección.',
  receiptFormat: '80mm',
  docTitle: 'RECIBO',
  country: '',
  currency: '',
  iva: 0,
  plans: DEFAULT_PLANS,
  categories: PRODUCT_CATEGORIES,
  trainers: [],
  classes: [],
  services: DEFAULT_SERVICES,
  schedule: { days: [1, 2, 3, 4, 5, 6], open: '05:00', close: '22:00', satOpen: '07:00', satClose: '15:00', sunOpen: '', sunClose: '' },
  access: { graceDays: 2, blockDebt: false, requireParq: false, stayMinutes: 180, capacity: 80, enrollFee: 5, reenrollDays: 60, noShowLimit: 3 },
  remindDays: 5,
  rules: 'Uso obligatorio de toalla. Regresa el equipo a su lugar. Calzado deportivo. Respeta el turno en las máquinas. El gimnasio no se hace responsable por objetos olvidados.'
};

class Store {
  constructor() {
    this.tenantId = null;
    this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.security = {};
    this.counters = {};
    this.announcement = null;
    this.members = [];
    this.todayCheckins = [];
    this.bookings = [];
    this.products = [];
    this.openShift = null;
    this.recentSales = [];
    this.templates = [];
    this.ready = false;
    this._unsubs = [];
    this._listeners = {};
    this._loaded = new Set();
  }

  // ---------- Eventos ----------
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  // ---------- Referencias ----------
  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  cardRef(code) { return doc(db, 'cards', String(code)); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /**
   * Confirma un lote. La caché local aplica el cambio al instante (también sin internet);
   * se espera la confirmación del servidor como máximo unos segundos para no bloquear la recepción.
   */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la sede esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }

  async save(name, id, data, merge = true) {
    const b = this.batch();
    b.set(this.ref(name, id), data, { merge });
    await this.commit(b);
  }
  async remove(name, id) {
    const b = this.batch();
    b.delete(this.ref(name, id));
    await this.commit(b);
  }

  // ---------- Ciclo de vida ----------
  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'members', 'checkins', 'bookings', 'products', 'shift', 'sales', 'templates'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      applyLocale(this.settings.country || 'VE', this.settings.currency);
      this.settings.fx = { ...DEFAULT_SETTINGS.fx, ...(this.settings.fx || {}) };
      setFx(this.settings.fx);
      for (const k of ['categories', 'plans']) if (!Array.isArray(this.settings[k]) || !this.settings[k].length) this.settings[k] = DEFAULT_SETTINGS[k];
      for (const k of ['trainers', 'classes', 'services']) if (!Array.isArray(this.settings[k])) this.settings[k] = [];
      this.settings.schedule = { ...DEFAULT_SETTINGS.schedule, ...(this.settings.schedule || {}) };
      this.settings.access = { ...DEFAULT_SETTINGS.access, ...(this.settings.access || {}) };
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('members'), 'members', (s) => { this.members = rows(s).sort(byName); this._mMap = null; });
    listen(query(this.col('checkins'), where('dayKey', '==', todayKey())), 'checkins', (s) => {
      this.todayCheckins = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });
    listen(query(this.col('bookings'), where('date', '>=', dayKey(addDays(new Date(), -1)))), 'bookings', (s) => { this.bookings = rows(s); });
    listen(this.col('products'), 'products', (s) => { this.products = rows(s).sort(byName); this._pMap = null; });
    listen(query(this.col('cash_shifts'), where('status', '==', 'open')), 'shift', (s) => {
      this.openShift = rows(s).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))[0] || null;
    });
    const since = startOfDay(addDays(new Date(), -7)).toISOString();
    listen(query(this.col('sales'), where('date', '>=', since)), 'sales', (s) => {
      this.recentSales = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });
    listen(query(this.col('routines'), where('template', '==', true)), 'templates', (s) => { this.templates = rows(s).sort(byName); });

    // Nunca bloquear más de 8 s (p. ej. sin internet y sin caché)
    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
    this.ready = false;
    this.tenant = null; this.members = []; this.todayCheckins = []; this.bookings = []; this.products = [];
    this.openShift = null; this.recentSales = []; this.templates = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this._pMap = null; this._mMap = null;
  }

  // ---------- Ajustes ----------
  get rate() { return 1; }
  get country() { return this.settings.country || ''; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi gimnasio'; }
  get access() { return this.settings.access; }
  plan(id) { return this.settings.plans.find((p) => p.id === id) || null; }
  get activePlans() { return this.settings.plans.filter((p) => p.active !== false); }
  trainer(id) { return this.settings.trainers.find((t) => t.id === id) || null; }
  get activeTrainers() { return this.settings.trainers.filter((t) => t.active !== false); }
  gymClass(id) { return this.settings.classes.find((c) => c.id === id) || null; }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    if (patch.fx) setFx(this.settings.fx);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  /** País de trabajo: define moneda, formas de pago, prefijo de WhatsApp y nombres de documentos */
  async setCountry(code, currency = null) {
    const prevCur = this.settings.currency || 'USD';
    const first = !this.settings.country;
    const l = applyLocale(code, currency);
    const patch = { country: code, currency: l.cur, countrySetAt: new Date().toISOString() };
    // Primera vez: los precios de ejemplo (en USD) se adaptan a la moneda del país
    if (first && prevCur !== l.cur) {
      const def = new Map(DEFAULT_PLANS.map((x) => [x.id, x.price]));
      patch.plans = (this.settings.plans || []).map((x) => (def.get(x.id) === x.price ? { ...x, price: scaleUSD(x.price, l.cur, l.dec) } : x));
      const defS = new Map(DEFAULT_SERVICES.map((x) => [x.name, x.price]));
      patch.services = (this.settings.services || []).map((x) => (defS.get(x.name) === x.price ? { ...x, price: scaleUSD(x.price, l.cur, l.dec) } : x));
      if (this.settings.access.enrollFee === DEFAULT_SETTINGS.access.enrollFee) patch.access = { ...this.settings.access, enrollFee: scaleUSD(DEFAULT_SETTINGS.access.enrollFee, l.cur, l.dec) };
    }
    await this.saveSettings(patch);
    this.emit('rate', 1);
  }

  /** Correlativo (socios "mem", facturas "inv", turnos "shift"…). Se reserva en el mismo lote que el documento. */
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN de administrador ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) {
      const s = await getDoc(this.ref('config', 'security')).catch(() => null);
      if (s?.exists()) this.security = s.data();
    }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Socios ----------
  product(id) {
    if (!this._pMap) this._pMap = new Map(this.products.map((p) => [p.id, p]));
    return this._pMap.get(id);
  }
  member(id) {
    if (!this._mMap) this._mMap = new Map(this.members.map((p) => [p.id, p]));
    return this._mMap.get(id);
  }
  /** Busca por código de socio (S-0001 o 1), código o enlace del carnet, o documento de identidad */
  findMember(code) {
    const raw = String(code || '').trim();
    if (!raw) return null;
    const url = /\/carnet\/([A-Z0-9]+)/i.exec(raw);
    const v = (url ? url[1] : raw).toUpperCase().replace(/\s+/g, '');
    const digits = v.replace(/\D/g, '');
    return this.members.find((m) => (m.cardCode || '') === v)
      || this.members.find((m) => (m.number || '').toUpperCase() === v || (/^S-?\d+$/.test(v) && Number(m.seq) === Number(digits)))
      || (digits.length >= 5 ? this.members.find((m) => String(m.idDoc || '').replace(/\D/g, '') === digits) : null)
      || (/^\d{1,4}$/.test(v) ? this.members.find((m) => Number(m.seq) === Number(v)) : null)
      || null;
  }
  get liveMembers() { return this.members.filter((m) => m.active !== false); }
  get activeMembers() { const t = todayKey(); return this.members.filter((m) => LIVE_STATUS.includes(memberStatus(m, t))); }
  membersBy(status) { const t = todayKey(); return this.members.filter((m) => memberStatus(m, t) === status); }
  /** Vencen en los próximos N días (incluye hoy) */
  expiringIn(days = 7) {
    const t = todayKey(); const lim = dayKey(addDays(new Date(), days));
    return this.members.filter((m) => m.active !== false && m.membership && m.membership.status !== 'anulada' && m.membership.end >= t && m.membership.end <= lim && memberStatus(m, t) !== 'congelado')
      .sort((a, b) => a.membership.end.localeCompare(b.membership.end));
  }
  /** Vencidos en los últimos N días y que no renovaron: a recuperar */
  expiredWithin(days = 60) {
    const t = todayKey(); const from = dayKey(addDays(new Date(), -days));
    return this.members.filter((m) => m.active !== false && m.membership && m.membership.status !== 'anulada' && m.membership.end < t && m.membership.end >= from)
      .sort((a, b) => b.membership.end.localeCompare(a.membership.end));
  }
  get debtors() { return this.members.filter((m) => m.active !== false && (Number(m.balance) || 0) > 0.009).sort((a, b) => (b.balance || 0) - (a.balance || 0)); }
  get totalDebt() { return this.debtors.reduce((a, m) => a + (Number(m.balance) || 0), 0); }
  /** Socios con plan vigente que no vienen hace N días o más: riesgo de abandono */
  atRisk(days = 10) {
    const lim = addDays(new Date(), -days).toISOString();
    const limDay = dayKey(addDays(new Date(), -days));
    const t = todayKey();
    return this.members.filter((m) => LIVE_STATUS.includes(memberStatus(m, t)) && (m.lastCheckinAt ? m.lastCheckinAt < lim : (m.membership?.start || t) < limDay))
      .sort((a, b) => (a.lastCheckinAt || '').localeCompare(b.lastCheckinAt || ''));
  }
  get birthdaysToday() {
    const md = todayKey().slice(5);
    return this.members.filter((m) => m.active !== false && m.birthDate && m.birthDate.slice(5) === md);
  }

  // ---------- Asistencia ----------
  get okCheckins() { return this.todayCheckins.filter((c) => c.result !== 'denied'); }
  /** Socios dentro del gimnasio: entraron en los últimos N minutos y no marcaron salida */
  get inside() {
    const lim = Date.now() - (Number(this.access.stayMinutes) || 180) * 60000;
    const seen = new Set();
    return this.okCheckins.filter((c) => {
      const k = c.memberId || c.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return !c.outAt && new Date(c.date).getTime() >= lim;
    });
  }
  checkedInToday(memberId) { return this.okCheckins.find((c) => c.memberId === memberId) || null; }

  // ---------- Clases ----------
  /** Clases programadas en una fecha (según el horario semanal) */
  classesOn(date) {
    const wd = fromKey(date).getDay();
    return this.settings.classes.filter((c) => c.active !== false && (c.days || []).includes(wd)).sort((a, b) => a.time.localeCompare(b.time));
  }
  bookingsFor(classId, date) { return this.bookings.filter((b) => b.classId === classId && b.date === date && b.status !== 'cancelada'); }
  bookedCount(classId, date) { return this.bookingsFor(classId, date).filter((b) => b.status !== 'espera').length; }

  // ---------- Inventario ----------
  get lowProducts() {
    return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || 0));
  }
  get outProducts() { return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= 0); }
  /** Productos vencidos o que vencen en los próximos 60 días (con existencia) */
  get expiringProducts() {
    const lim = dayKey(addDays(new Date(), 60));
    return this.products.filter((p) => p.active !== false && p.expiresAt && p.expiresAt <= lim && (Number(p.stock) || 0) > 0)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }

  // ---------- Consultas a la base ----------
  async listBetween(name, field, fromISO, toISO) {
    const s = await getDocs(query(this.col(name), where(field, '>=', fromISO), where(field, '<=', toISO)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async salesBetween(fromISO, toISO) { return this.listBetween('sales', 'date', fromISO, toISO); }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async getDocById(name, id) {
    const s = await getDoc(this.ref(name, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }
  async getMember(id) { return this.member(id) || this.getDocById('members', id); }
  async memberMemberships(id) { return (await this.listEq('memberships', 'memberId', id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
  async memberCheckins(id) { return (await this.listEq('checkins', 'memberId', id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
  async memberEvals(id) { return (await this.listEq('evaluations', 'memberId', id)).sort((a, b) => (a.date || '').localeCompare(b.date || '')); }
  async memberRoutines(id) { return (await this.listEq('routines', 'memberId', id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
  async memberSales(id) { return (await this.listEq('sales', 'memberId', id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
  async memberBookings(id) { return (await this.listEq('bookings', 'memberId', id)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)); }
  async closedShifts(max = 30) {
    const s = await getDocs(query(this.col('cash_shifts'), where('status', '==', 'closed')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, max);
  }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'sales'), where('date', '>=', fromISO)));
  return s.docs.map((d) => d.data());
}
export async function tenantCheckinsOn(tenantId, day) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'checkins'), where('dayKey', '==', day)));
  return s.docs.map((d) => d.data());
}
export async function getTenant(id) {
  const s = await getDoc(doc(db, 'tenants', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) {
  const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() {
  const s = await getDoc(doc(db, 'system', 'announcement'));
  return s.exists() ? s.data() : null;
}
/** Carnet digital público del socio (página /carnet/CODIGO) */
export async function getCard(code) {
  const s = await getDoc(doc(db, 'cards', String(code).toUpperCase()));
  return s.exists() ? s.data() : null;
}
export { DEFAULT_SETTINGS };
