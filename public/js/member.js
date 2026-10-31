// Sano Gym — Socios: buscador, formulario con foto y salud, ficha completa y carnet
import { store, memberStatus, statusBadge, MEMBER_STATUS, daysBetween, SEX, BOOK_STATUS } from './store.js';
import { saveMember, setMemberActive, renewCardCode, cardUrl, voidSale } from './ops.js';
import { PARQ, CONDITIONS, GOALS, LEVELS, ACTIVITY, parqRisk, needsClearance, ageOf, evalCalc } from './gym.js';
import { openModal, esc, usd, toast, setBusy, fmtDate, fmtDateTime, todayKey, dayKey, addDays, fromKey, loc, normalize, debounce, initials, colorFor, compressImage, confirmDialog, emptyState, methodLabel, waLink, printHTML, fmtAgo, num } from './utils.js';
import { icon } from './icons.js';
import { sellModal, freezeModal, payDebtModal, adjustModal, membershipLine } from './membership.js';
import { qrDataURL, waMember, memberMessage, printReceipt, PRINT_HEAD } from './shared.js';
import { db, doc, getDoc, setDoc, deleteDoc } from './firebase.js';
import { requirePin } from './auth.js';

// ======================================================================
// FOTOS (colección aparte: la lista de socios no carga imágenes)
// ======================================================================
const photoCache = new Map();
const photoRef = (id) => doc(db, 'tenants', store.tenantId, 'photos', id);
export async function memberPhoto(m) {
  if (!m?.hasPhoto) return '';
  if (photoCache.has(m.id)) return photoCache.get(m.id);
  const p = getDoc(photoRef(m.id)).then((s) => (s.exists() ? s.data().data || '' : '')).catch(() => '');
  photoCache.set(m.id, p);
  return p;
}
async function savePhoto(id, data) {
  photoCache.set(id, Promise.resolve(data || ''));
  if (data) await setDoc(photoRef(id), { data, updatedAt: new Date().toISOString() });
  else await deleteDoc(photoRef(id)).catch(() => {});
}
/** Avatar con iniciales; si el socio tiene foto se carga después (hydratePhotos) */
export function avatar(m, size = '') {
  return `<span class="avatar ${size}" style="background:${colorFor(m?.name)}" ${m?.hasPhoto ? `data-ph="${m.id}"` : ''}>${esc(initials(m?.name))}</span>`;
}
export function hydratePhotos(root, max = 60) {
  [...root.querySelectorAll('[data-ph]')].slice(0, max).forEach(async (el) => {
    const m = store.member(el.dataset.ph);
    const src = await memberPhoto(m || { id: el.dataset.ph, hasPhoto: true });
    if (src && el.isConnected) { el.innerHTML = `<img src="${src}" alt="">`; el.classList.add('has-img'); el.removeAttribute('data-ph'); }
  });
}

// ======================================================================
// BUSCAR / ELEGIR SOCIO
// ======================================================================
export function pickMember({ title = 'Buscar socio', allowNew = true, filter = null } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Nombre, ${esc(loc().id)}, teléfono o N° de socio…" autocomplete="off" autofocus></label><div class="pick-list" data-l></div></div>`,
      footer: `${allowNew ? `<button class="btn btn-secondary" data-new style="margin-right:auto">${icon('userPlus')} Socio nuevo</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button>`,
      onClose: () => resolve(picked)
    });
    const draw = (q = '') => {
      const t = normalize(q);
      const list = store.members.filter((x) => x.active !== false && (!filter || filter(x)) && (!t || normalize(`${x.name} ${x.idDoc || ''} ${x.phone || ''} ${x.number || ''}`).includes(t))).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((x) => `<button type="button" class="list-item" data-id="${x.id}">${avatar(x)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(x.name)}</b><div class="t-sub">${esc(x.number)}${x.idDoc ? ' · ' + esc(x.idDoc) : ''} · ${membershipLine(x)}</div></div>${statusBadge(memberStatus(x))}</button>`).join('')
        : emptyState('users', t ? 'Sin resultados' : 'Aún no hay socios', allowNew ? 'Registra al socio con “Socio nuevo”.' : '');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.member(b.dataset.id); m.close(); });
      hydratePhotos(m.el, 20);
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    m.el.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') { const f = store.findMember(e.target.value); if (f) { picked = f; m.close(); } } };
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = async () => { const q = m.el.querySelector('[data-q]').value.trim(); const r = await memberForm(null, { name: /\d{5,}/.test(q) ? '' : q, idDoc: /\d{5,}/.test(q) ? q : '' }); if (r) { picked = r; m.close(); } };
    draw();
  });
}

// ======================================================================
// FORMULARIO DEL SOCIO
// ======================================================================
export function memberForm(member = null, preset = {}) {
  const x = { ...preset, ...(member || {}) };
  const h = x.health || {};
  let photo = null; let photoChanged = false;
  return new Promise((resolve) => {
    let saved = null;
    const m = openModal({
      title: member ? 'Editar socio' : 'Nuevo socio', sub: member ? esc(member.number) : 'Los datos de salud ayudan a entrenar con seguridad.', size: 'lg',
      body: `<form data-f autocomplete="off">
        <div class="mform">
          <div class="photo-pick" data-photo>${avatar(x, 'avatar-xl')}<label class="btn btn-secondary btn-sm">${icon('camera')} Foto<input type="file" accept="image/*" capture="user" data-file hidden></label>${x.hasPhoto ? `<button type="button" class="linkish small" data-rmph>Quitar foto</button>` : ''}</div>
          <div class="form-grid grow">
            <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(x.name || '')}" autofocus></div>
            <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(x.idDoc || '')}"></div>
            <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(x.birthDate || '')}"></div>
            <div class="field"><label>Sexo</label><div class="seg seg-block" data-sex>${Object.entries(SEX).map(([k, v]) => `<button type="button" data-sx="${k}" class="${x.sex === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
            <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel" value="${esc(x.phone || '')}"></div>
            <div class="field"><label>Correo</label><input class="input" name="email" inputmode="email" value="${esc(x.email || '')}"></div>
            <div class="field"><label>Ocupación</label><input class="input" name="occupation" value="${esc(x.occupation || '')}"></div>
          </div>
        </div>
        <div class="section-title mt-lg">${icon('target')} Objetivo</div>
        <div class="form-grid">
          <div class="field"><label>Objetivo principal</label><select class="select" name="goal"><option value="">—</option>${GOALS.map((g) => `<option ${x.goal === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          <div class="field"><label>Nivel</label><select class="select" name="level">${LEVELS.map((g) => `<option ${x.level === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          <div class="field"><label>Actividad fuera del gym</label><select class="select" name="activity">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${Number(x.activity || 1.55) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Entrenador asignado</label><select class="select" name="trainerId"><option value="">—</option>${store.activeTrainers.map((t) => `<option value="${t.id}" ${x.trainerId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        </div>
        <div class="section-title mt-lg">${icon('heart')} Salud (PAR-Q)</div>
        <div class="parq">${PARQ.map((q, i) => `<div class="parq-row"><span>${i + 1}. ${q}</span><div class="seg"><button type="button" data-pq="${i}" data-v="0" class="${(h.parq || [])[i] ? '' : 'on'}">No</button><button type="button" data-pq="${i}" data-v="1" class="${(h.parq || [])[i] ? 'on yes' : ''}">Sí</button></div></div>`).join('')}</div>
        <div class="box small mt" data-parq-msg></div>
        <div class="field mt"><label>Condiciones</label><div class="chips chips-wrap" data-cond>${CONDITIONS.map((c) => `<button type="button" class="chip ${(h.conditions || []).includes(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
        <div class="form-grid mt">
          <div class="field"><label>Lesiones u operaciones</label><input class="input" name="injuries" value="${esc(h.injuries || '')}" placeholder="Ej.: menisco derecho 2023"></div>
          <div class="field"><label>Medicamentos</label><input class="input" name="meds" value="${esc(h.meds || '')}"></div>
          <div class="field"><label>Contacto de emergencia</label><input class="input" name="emergencyName" value="${esc(x.emergencyName || '')}" placeholder="Nombre y parentesco"></div>
          <div class="field"><label>Teléfono de emergencia</label><input class="input" name="emergencyPhone" inputmode="tel" value="${esc(x.emergencyPhone || '')}"></div>
        </div>
        <label class="check mt" data-clr-wrap><input type="checkbox" name="clearance" ${h.clearance ? 'checked' : ''}> <span>Presentó constancia médica de aptitud${h.clearanceAt ? ` (${fmtDate(h.clearanceAt)})` : ''}</span></label>
        <div class="form-grid mt">
          <div class="field"><label>¿Cómo nos conoció?</label><select class="select" name="referredBy">${['', 'Instagram', 'Facebook', 'TikTok', 'Google', 'Recomendación de un socio', 'Pasaba por aquí', 'Volante / publicidad', 'Empresa / convenio', 'Otro'].map((o) => `<option ${x.referredBy === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>Notas</label><input class="input" name="notes" value="${esc(x.notes || '')}"></div>
        </div>
        <div class="error-msg mt" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${member ? 'Guardar' : 'Registrar socio'}</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    let sex = x.sex || '';
    const parq = [...(h.parq || PARQ.map(() => false))];
    const conds = new Set(h.conditions || []);
    const parqMsg = () => {
      const risk = parq.some(Boolean);
      const el = m.el.querySelector('[data-parq-msg]');
      el.className = `box small mt ${risk ? 'box-warn' : ''}`;
      el.innerHTML = risk ? `${icon('alert')} Respondió “sí” a ${parq.filter(Boolean).length} pregunta(s): pide una <b>constancia médica</b> antes de entrenar fuerte.` : `${icon('checkCircle')} Apto para actividad física moderada según el cuestionario.`;
    };
    m.el.querySelectorAll('[data-sx]').forEach((b) => b.onclick = () => { sex = b.dataset.sx; m.el.querySelectorAll('[data-sx]').forEach((y) => y.classList.toggle('on', y === b)); });
    m.el.querySelectorAll('[data-pq]').forEach((b) => b.onclick = () => {
      const i = +b.dataset.pq; parq[i] = b.dataset.v === '1';
      m.el.querySelectorAll(`[data-pq="${i}"]`).forEach((y) => { y.classList.toggle('on', y.dataset.v === (parq[i] ? '1' : '0')); y.classList.toggle('yes', y.dataset.v === '1' && parq[i]); });
      parqMsg();
    });
    m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { const c = b.dataset.c; conds.has(c) ? conds.delete(c) : conds.add(c); b.classList.toggle('on', conds.has(c)); });
    m.el.querySelector('[data-file]').onchange = async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try { photo = await compressImage(f, 220, 0.72); photoChanged = true; m.el.querySelector('[data-photo] .avatar').outerHTML = `<span class="avatar avatar-xl has-img"><img src="${photo}" alt=""></span>`; }
      catch (_) { toast('No se pudo leer la imagen', 'warning'); }
    };
    m.el.querySelector('[data-rmph]')?.addEventListener('click', () => { photo = ''; photoChanged = true; m.el.querySelector('[data-photo] .avatar').outerHTML = avatar({ name: F.name.value }, 'avatar-xl'); });
    if (member?.hasPhoto) memberPhoto(member).then((src) => { const a = m.el.querySelector('[data-photo] .avatar'); if (src && a && !photoChanged) { a.innerHTML = `<img src="${src}" alt="">`; a.classList.add('has-img'); } });
    parqMsg();
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre del socio.'; F.name.focus(); return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      const health = { parq, conditions: [...conds], injuries: F.injuries.value.trim(), meds: F.meds.value.trim(), clearance: F.clearance.checked, clearanceAt: F.clearance.checked ? (h.clearanceAt || todayKey()) : null, answeredAt: h.answeredAt || todayKey() };
      const data = {
        name: F.name.value, idDoc: F.idDoc.value, birthDate: F.birthDate.value, sex, phone: F.phone.value, email: F.email.value, occupation: F.occupation.value,
        goal: F.goal.value, level: F.level.value, activity: F.activity.value, trainerId: F.trainerId.value, emergencyName: F.emergencyName.value, emergencyPhone: F.emergencyPhone.value,
        referredBy: F.referredBy.value, notes: F.notes.value, health
      };
      try {
        const out = await saveMember(data, member?.id || null);
        if (photoChanged) { await savePhoto(out.id, photo); await store.save('members', out.id, { hasPhoto: !!photo }); out.hasPhoto = !!photo; }
        saved = { ...out, hasPhoto: photoChanged ? !!photo : out.hasPhoto };
        m.close();
        toast(member ? 'Socio actualizado' : `Socio registrado: ${saved.number}`);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

// ======================================================================
// MÉTRICAS DE ASISTENCIA
// ======================================================================
const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export function attendanceStats(checkins) {
  const ok = checkins.filter((c) => c.result !== 'denied');
  const days = new Set(ok.map((c) => c.dayKey));
  const now = new Date();
  const month = todayKey().slice(0, 7);
  const thisMonth = [...days].filter((d) => d.startsWith(month)).length;
  const w0 = weekStart(now);
  const weekCount = (i) => { const a = addDays(w0, -7 * i); const b = addDays(a, 7); return [...days].filter((d) => { const x = fromKey(d); return x >= a && x < b; }).length; };
  const last8 = Array.from({ length: 8 }, (_, i) => weekCount(i));
  let streak = 0;
  for (let i = last8[0] ? 0 : 1; i < 52; i++) { if (weekCount(i) > 0) streak++; else break; }
  const hours = {}; ok.forEach((c) => { hours[c.hour] = (hours[c.hour] || 0) + 1; });
  const favHour = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
  return { total: days.size, thisMonth, avgWeek: Math.round((last8.reduce((a, b) => a + b, 0) / 8) * 10) / 10, streak, favHour: favHour ? Number(favHour[0]) : null, days };
}
/** Calendario de calor de las últimas N semanas */
export function heatmapHTML(days, weeks = 14) {
  const end = weekStart(new Date());
  const start = addDays(end, -7 * (weeks - 1));
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const k = dayKey(day);
      const future = day > new Date();
      cells.push(`<i class="${future ? 'hm-f' : days.has(k) ? 'hm-on' : ''}" title="${fmtDate(k)}"></i>`);
    }
    cols.push(`<div class="hm-col">${cells.join('')}</div>`);
  }
  return `<div class="heatmap"><div class="hm-days"><span>L</span><span></span><span>M</span><span></span><span>V</span><span></span><span>D</span></div>${cols.join('')}</div>`;
}

// ======================================================================
// FICHA DEL SOCIO
// ======================================================================
const TABS = { resumen: 'Resumen', membresias: 'Membresías', asistencia: 'Asistencia', clases: 'Clases', rutina: 'Rutina', evaluaciones: 'Evaluaciones', pagos: 'Pagos', salud: 'Salud' };

export async function openMember(id, { tab = 'resumen' } = {}) {
  let mb = store.member(id) || await store.getMember(id);
  if (!mb) { toast('Socio no encontrado', 'warning'); return; }
  const cache = {};
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('member-modal');
  const root = m.el.querySelector('[data-root]');
  const load = async (k, fn) => (cache[k] ??= await fn().catch((e) => { console.error(e); return []; }));
  const off = store.on('members', () => { const n = store.member(id); if (n) { mb = n; header(); } });
  const close0 = m.close; m.close = () => { off(); close0(); };

  root.innerHTML = `<div data-head></div><div class="tabs mt" data-tabs>${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join('')}</div><div data-body class="mt"></div>`;
  const $ = (q) => root.querySelector(q);

  function header() {
    const st = memberStatus(mb);
    const ms = mb.membership;
    const bal = Number(mb.balance) || 0;
    const age = ageOf(mb.birthDate);
    $('[data-head]').innerHTML = `<div class="mhead">
      ${avatar(mb, 'avatar-xl')}
      <div class="grow" style="min-width:0">
        <div class="row row-wrap"><h2 class="mhead-name">${esc(mb.name)}</h2>${statusBadge(st)}${bal > 0.009 ? `<span class="badge badge-danger">Debe ${usd(bal)}</span>` : ''}${needsClearance(mb.health) ? `<span class="badge badge-warning">${icon('heart')} Falta constancia médica</span>` : ''}</div>
        <div class="t-sub">${esc(mb.number)}${mb.idDoc ? ` · ${esc(loc().id)} ${esc(mb.idDoc)}` : ''}${age != null ? ` · ${age} años` : ''}${mb.phone ? ` · ${esc(mb.phone)}` : ''}${mb.goal ? ` · ${icon('target')} ${esc(mb.goal)}` : ''}</div>
        <div class="small mt">${ms ? `${membershipLine(mb)} · ${fmtDate(ms.start)} al ${fmtDate(ms.end)}` : 'Sin membresía'}${mb.lastCheckinAt ? ` · último ingreso ${fmtAgo(mb.lastCheckinAt)}${Date.now() - new Date(mb.lastCheckinAt) > 864e5 ? '' : ''}` : ''}</div>
      </div>
      <button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="mactions">
      <button class="btn btn-success" data-a="in">${icon('userCheck')} Registrar entrada</button>
      <button class="btn btn-primary" data-a="sell">${icon('refresh')} ${ms && ms.status !== 'anulada' ? 'Renovar' : 'Inscribir'}</button>
      ${bal > 0.009 ? `<button class="btn btn-secondary" data-a="debt">${icon('dollar')} Cobrar deuda</button>` : ''}
      ${ms && ms.kind !== 'pase' ? `<button class="btn btn-secondary" data-a="freeze">${icon('snow')} ${st === 'congelado' ? 'Reactivar' : 'Congelar'}</button>` : ''}
      <button class="btn btn-secondary" data-a="card">${icon('qr')} Carnet</button>
      <button class="btn btn-whatsapp" data-a="wa">${icon('whatsapp')} WhatsApp</button>
      <button class="btn btn-ghost" data-a="edit">${icon('edit')} Editar</button>
      <button class="btn btn-ghost btn-icon" data-a="more" title="Más opciones">${icon('menu')}</button>
    </div>`;
    hydratePhotos($('[data-head]'));
    $('[data-x]').onclick = () => m.close();
    root.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => action(b.dataset.a));
  }

  async function action(a) {
    if (a === 'in') { const { doCheckin } = await import('./access.js'); await doCheckin(mb); cache.checkins = null; draw(); }
    if (a === 'sell') { const out = await sellModal(mb); if (out) { cache.ms = null; cache.sales = null; draw(); } }
    if (a === 'debt') { await payDebtModal(mb); cache.sales = null; draw(); }
    if (a === 'freeze') { await freezeModal(mb); cache.ms = null; draw(); }
    if (a === 'card') cardModal(mb);
    if (a === 'edit') { const r = await memberForm(mb); if (r) { mb = { ...mb, ...r }; header(); draw(); } }
    if (a === 'wa') waMenu(mb);
    if (a === 'more') moreMenu();
  }

  function moreMenu() {
    const mm = openModal({
      title: 'Más opciones', sub: esc(mb.name), size: 'sm',
      body: `<div class="list">
        ${mb.membership ? `<button class="list-item" data-o="adj">${icon('edit')}<div class="grow"><b>Ajustar vencimiento o sesiones</b><div class="t-sub">Cortesía, compensación o corrección (PIN)</div></div></button>` : ''}
        <button class="list-item" data-o="code">${icon('refresh')}<div class="grow"><b>Nuevo código de carnet</b><div class="t-sub">Si perdió el carnet o lo compartió</div></div></button>
        <button class="list-item" data-o="baja">${icon(mb.active === false ? 'unlock' : 'x')}<div class="grow"><b>${mb.active === false ? 'Reactivar socio' : 'Dar de baja'}</b><div class="t-sub">${mb.active === false ? 'Vuelve a la lista de socios' : 'Se conserva su historial'}</div></div></button>
      </div>`,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
    mm.el.querySelector('[data-o="adj"]')?.addEventListener('click', async () => { mm.close(); await adjustModal(mb); });
    mm.el.querySelector('[data-o="code"]').onclick = async () => {
      mm.close();
      if (!(await confirmDialog({ title: 'Nuevo código de carnet', message: 'El carnet y el enlace anteriores dejarán de funcionar.', confirmText: 'Generar' }))) return;
      const code = await renewCardCode(mb); mb = { ...mb, cardCode: code }; toast('Código renovado'); cardModal(mb);
    };
    mm.el.querySelector('[data-o="baja"]').onclick = async () => {
      mm.close();
      if (mb.active === false) { await setMemberActive(mb, true); toast('Socio reactivado'); return; }
      if (!(await confirmDialog({ title: 'Dar de baja', message: `${esc(mb.name)} dejará de aparecer en la lista de socios activos. Su historial se conserva y puedes reactivarlo cuando quieras.`, confirmText: 'Dar de baja', danger: true }))) return;
      await setMemberActive(mb, false, 'Baja manual'); toast('Socio dado de baja', 'warning');
    };
  }

  async function draw() {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('[data-body]');
    body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try { await TAB_RENDER[tab](body); } catch (e) { console.error(e); body.innerHTML = emptyState('alert', 'No se pudo cargar', esc(e.message)); }
  }

  const TAB_RENDER = {
    async resumen(body) {
      const checkins = await load('checkins', () => store.memberCheckins(mb.id));
      const s = attendanceStats(checkins);
      const card = mb.cardCode ? await qrDataURL(cardUrl(mb.cardCode), 3) : '';
      const ev0 = mb.firstEval; const ev1 = mb.lastEval;
      const delta = (a, b, u, inv = false) => { if (a == null || b == null) return ''; const d = Math.round((b - a) * 10) / 10; if (!d) return `<span class="faint">sin cambio</span>`; const good = inv ? d > 0 : d < 0; return `<span class="${good ? 'text-success' : 'text-danger'}">${d > 0 ? '+' : ''}${num(d, 1)} ${u}</span>`; };
      body.innerHTML = `<div class="grid-main">
        <div class="stack">
          <div class="kpis kpis-sm">
            <div class="card kpi"><div class="kpi-label">Visitas</div><div class="kpi-value">${s.total}</div><div class="kpi-sub">${s.thisMonth} este mes</div></div>
            <div class="card kpi"><div class="kpi-label">Promedio semanal</div><div class="kpi-value">${num(s.avgWeek, 1)}</div><div class="kpi-sub">últimas 8 semanas</div></div>
            <div class="card kpi"><div class="kpi-label">Racha</div><div class="kpi-value">${s.streak} ${icon('flame')}</div><div class="kpi-sub">semanas seguidas</div></div>
            <div class="card kpi"><div class="kpi-label">Hora favorita</div><div class="kpi-value">${s.favHour != null ? `${s.favHour}:00` : '—'}</div><div class="kpi-sub">${mb.lastCheckinAt ? 'último: ' + fmtDate(mb.lastCheckinAt) : 'sin ingresos'}</div></div>
          </div>
          <div class="card"><div class="card-head"><div class="card-title">${icon('calendar')} Asistencia · últimas 14 semanas</div></div>${heatmapHTML(s.days)}</div>
          ${ev1 ? `<div class="card"><div class="card-head"><div class="card-title">${icon('trend')} Progreso</div><button class="btn btn-ghost btn-sm" data-go="evaluaciones">Ver evaluaciones</button></div>
            <div class="kv-grid"><div><span>Peso</span><b>${num(ev1.weight, 1)} kg</b>${ev0 && ev0.date !== ev1.date ? delta(ev0.weight, ev1.weight, 'kg', /masa|fuerza/i.test(mb.goal || '')) : ''}</div>
            <div><span>IMC</span><b>${ev1.bmi ? num(ev1.bmi, 1) : '—'}</b>${ev0 && ev0.date !== ev1.date ? delta(ev0.bmi, ev1.bmi, '') : ''}</div>
            <div><span>% grasa</span><b>${ev1.fat ? num(ev1.fat, 1) + ' %' : '—'}</b>${ev0 && ev0.date !== ev1.date ? delta(ev0.fat, ev1.fat, '%') : ''}</div>
            <div><span>Última evaluación</span><b>${fmtDate(ev1.date)}</b>${daysBetween(ev1.date, todayKey()) > 45 ? '<span class="text-warning">toca reevaluar</span>' : ''}</div></div></div>` : `<div class="box">${icon('ruler')} Aún no tiene evaluación física. <button class="linkish" data-go="evaluaciones">Hacer la primera</button></div>`}
        </div>
        <div class="stack">
          <div class="card center stack" style="align-items:center">
            <div class="card-title">${icon('qr')} Carnet digital</div>
            ${card ? `<img src="${card}" alt="QR" class="qr-img">` : ''}
            <div class="small muted">Lo escanea la recepción o el kiosco. El socio ve su plan y su rutina.</div>
            <div class="row"><button class="btn btn-secondary btn-sm" data-a2="card">${icon('print')} Imprimir</button><button class="btn btn-secondary btn-sm" data-a2="copy">${icon('copy')} Enlace</button></div>
          </div>
          <div class="card stack"><div class="card-title">${icon('info')} Datos</div>
            <div class="kv"><span>Socio desde</span><b>${fmtDate(mb.createdAt)}</b></div>
            <div class="kv"><span>Entrenador</span><b>${esc(store.trainer(mb.trainerId)?.name || '—')}</b></div>
            <div class="kv"><span>Nivel</span><b>${esc(mb.level || '—')}</b></div>
            <div class="kv"><span>Total pagado</span><b>${usd(mb.totalSpent || 0)}</b></div>
            ${mb.noShows ? `<div class="kv"><span>Faltas a clases</span><b class="text-warning">${mb.noShows}</b></div>` : ''}
            ${mb.emergencyName ? `<div class="kv"><span>Emergencia</span><b>${esc(mb.emergencyName)} ${esc(mb.emergencyPhone || '')}</b></div>` : ''}
            ${mb.notes ? `<div class="small muted">${esc(mb.notes)}</div>` : ''}
          </div>
        </div></div>`;
      body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { tab = b.dataset.go; draw(); });
      body.querySelector('[data-a2="card"]')?.addEventListener('click', () => printCard(mb));
      body.querySelector('[data-a2="copy"]')?.addEventListener('click', () => copyCard(mb));
    },

    async membresias(body) {
      const list = await load('ms', () => store.memberMemberships(mb.id));
      body.innerHTML = `<div class="between mb"><b>${list.length} membresía(s)</b><button class="btn btn-primary btn-sm" data-sell>${icon('plus')} ${mb.membership ? 'Renovar' : 'Inscribir'}</button></div>` + (list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Plan</th><th>Vigencia</th><th class="r">Total</th><th class="r">Pagado</th><th class="c">Estado</th></tr></thead><tbody>
        ${list.map((x) => { const cur = mb.membership?.id === x.id; const t = todayKey(); const stx = x.status === 'anulada' ? ['Anulada', 'neutral'] : cur && memberStatus(mb) === 'congelado' ? ['Congelada', 'info'] : x.end < t ? ['Terminada', 'neutral'] : x.start > t ? ['Programada', 'violet'] : ['Vigente', 'success'];
          return `<tr><td><b>${esc(x.planName)}</b>${x.renewal ? '<div class="t-sub">Renovación</div>' : '<div class="t-sub">Inscripción</div>'}${x.trainer ? `<div class="t-sub">${icon('user')} ${esc(x.trainer)}</div>` : ''}</td>
            <td class="small">${fmtDate(x.start)} al ${fmtDate(x.end)}${x.kind !== 'tiempo' ? `<div class="t-sub">${x.visitsLeft ?? 0}/${x.visits} sesiones</div>` : ''}${(x.freezes || []).length ? `<div class="t-sub">${icon('snow')} ${x.freezes.map((f) => `${f.days} d (${esc(f.reason)})`).join(', ')}</div>` : ''}</td>
            <td class="r num">${usd(x.total)}${x.discount ? `<div class="t-sub">desc. ${usd(x.discount)}</div>` : ''}</td><td class="r num">${usd(x.paid)}${x.balance > 0.009 && x.status !== 'anulada' ? `<div class="t-sub text-danger">debe ${usd(x.balance)}</div>` : ''}</td>
            <td class="c"><span class="badge badge-${stx[1]}">${stx[0]}</span></td></tr>`; }).join('')}</tbody></table></div>` : emptyState('ticket', 'Sin membresías', 'Inscríbelo en un plan para que pueda entrar.'));
      body.querySelector('[data-sell]').onclick = () => action('sell');
    },

    async asistencia(body) {
      const checkins = await load('checkins', () => store.memberCheckins(mb.id));
      const s = attendanceStats(checkins);
      body.innerHTML = `<div class="card mb">${heatmapHTML(s.days, 26)}<div class="small muted mt">${s.total} visitas · promedio ${num(s.avgWeek, 1)} por semana · racha de ${s.streak} semana(s)</div></div>` + (checkins.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Hora</th><th>Resultado</th><th class="hide-sm">Detalle</th></tr></thead><tbody>
        ${checkins.slice(0, 120).map((c) => `<tr><td>${fmtDate(c.date)}</td><td class="num">${new Date(c.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</td><td>${c.result === 'denied' ? '<span class="badge badge-danger">Denegado</span>' : c.result === 'forced' ? '<span class="badge badge-warning">Autorizado</span>' : '<span class="badge badge-success">Entró</span>'}${c.via === 'kiosco' ? ' <span class="t-sub">kiosco</span>' : ''}</td><td class="small hide-sm">${esc(c.reason || c.notes || '')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('userCheck', 'Aún no registra entradas'));
    },

    async clases(body) {
      const list = await load('bookings', () => store.memberBookings(mb.id));
      const att = list.filter((b) => b.status === 'asistio').length;
      body.innerHTML = `<div class="between mb"><b>${att} clase(s) asistidas · ${list.filter((b) => b.status === 'falto').length} falta(s)</b><button class="btn btn-primary btn-sm" data-book>${icon('plus')} Reservar clase</button></div>` + (list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Clase</th><th>Fecha</th><th class="c">Estado</th></tr></thead><tbody>
        ${list.slice(0, 80).map((b) => `<tr><td><b>${esc(b.className)}</b>${b.trainer ? `<div class="t-sub">${esc(b.trainer)}</div>` : ''}</td><td class="small">${fmtDate(b.date)} · ${esc(b.time)}</td><td class="c"><span class="badge badge-${BOOK_STATUS[b.status]?.tone || 'neutral'}">${BOOK_STATUS[b.status]?.label || b.status}</span></td></tr>`).join('')}</tbody></table></div>` : emptyState('calendar', 'Sin reservas de clases'));
      body.querySelector('[data-book]').onclick = async () => { const { bookForMember } = await import('./views/classes.js'); await bookForMember(mb); cache.bookings = null; draw(); };
    },

    async rutina(body) {
      const list = await load('routines', () => store.memberRoutines(mb.id));
      const { routineCardHTML, routineEditor, assignTemplate, printRoutine } = await import('./routine.js');
      const cur = list.find((r) => r.id === mb.routineId) || list[0];
      body.innerHTML = `<div class="between mb row-wrap"><b>${cur ? esc(cur.name) : 'Sin rutina asignada'}</b><div class="row row-wrap">
        <button class="btn btn-secondary btn-sm" data-r="tpl">${icon('layers')} Desde plantilla</button><button class="btn btn-${cur ? 'secondary' : 'primary'} btn-sm" data-r="new">${icon('plus')} Nueva</button>
        ${cur ? `<button class="btn btn-secondary btn-sm" data-r="edit">${icon('edit')} Editar</button><button class="btn btn-secondary btn-sm" data-r="print">${icon('print')}</button><button class="btn btn-whatsapp btn-sm" data-r="wa">${icon('whatsapp')}</button>` : ''}</div></div>
        ${cur ? routineCardHTML(cur) : emptyState('dumbbell', 'Sin rutina', 'Asígnale una plantilla según su objetivo o crea una a su medida. Se publica en su carnet digital.')}
        ${list.length > 1 ? `<div class="section-title mt-lg">Rutinas anteriores</div><div class="list">${list.filter((r) => r.id !== cur?.id).map((r) => `<div class="list-item"><div class="grow"><b>${esc(r.name)}</b><div class="t-sub">${fmtDate(r.createdAt)}</div></div></div>`).join('')}</div>` : ''}`;
      const done = () => { cache.routines = null; draw(); };
      body.querySelector('[data-r="tpl"]').onclick = async () => { if (await assignTemplate(mb)) done(); };
      body.querySelector('[data-r="new"]').onclick = async () => { if (await routineEditor(null, { member: mb })) done(); };
      body.querySelector('[data-r="edit"]')?.addEventListener('click', async () => { if (await routineEditor(cur, { member: mb })) done(); });
      body.querySelector('[data-r="print"]')?.addEventListener('click', () => printRoutine(cur, mb));
      body.querySelector('[data-r="wa"]')?.addEventListener('click', () => waMember('rutina', { member: mb, extra: cur.name }));
    },

    async evaluaciones(body) {
      const list = await load('evals', () => store.memberEvals(mb.id));
      const { evalPanelHTML, evalModal, bindEvalPanel } = await import('./evals.js');
      body.innerHTML = evalPanelHTML(mb, list);
      bindEvalPanel(body, mb, list, async () => { if (await evalModal(mb, null, list)) { cache.evals = null; draw(); } }, () => { cache.evals = null; draw(); });
    },

    async pagos(body) {
      const list = await load('sales', () => store.memberSales(mb.id));
      const ok = list.filter((s) => s.status !== 'voided');
      body.innerHTML = `<div class="between mb"><b>${ok.length} pago(s) · ${usd(ok.reduce((a, s) => a + (s.total || 0), 0))}</b>${(Number(mb.balance) || 0) > 0.009 ? `<button class="btn btn-primary btn-sm" data-debt>${icon('dollar')} Cobrar deuda (${usd(mb.balance)})</button>` : ''}</div>` + (list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Recibo</th><th>Concepto</th><th class="r">Monto</th><th></th></tr></thead><tbody>
        ${list.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b><div class="t-sub">${fmtDateTime(s.date)}</div></td><td class="small">${(s.items || []).map((i) => esc(i.name)).join(', ')}<div class="t-sub">${esc(methodLabel(s.method))}${s.status === 'voided' ? ' · ANULADO' : ''}</div></td><td class="r num">${usd(s.total)}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}">${icon('print')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('receipt', 'Sin pagos registrados'));
      body.querySelector('[data-debt]')?.addEventListener('click', () => action('debt'));
      body.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(list.find((s) => s.id === b.dataset.pr)));
    },

    async salud(body) {
      const h = mb.health || {};
      body.innerHTML = `<div class="grid-2"><div class="card stack"><div class="card-title">${icon('heart')} Cuestionario PAR-Q</div>
        ${h.answeredAt ? `<div class="small muted">Respondido el ${fmtDate(h.answeredAt)}</div>` : ''}
        ${PARQ.map((q, i) => `<div class="parq-row"><span class="small">${q}</span><b class="${(h.parq || [])[i] ? 'text-danger' : 'text-success'}">${(h.parq || [])[i] ? 'Sí' : 'No'}</b></div>`).join('')}
        <div class="box small ${parqRisk(h) ? (h.clearance ? '' : 'box-warn') : ''}">${parqRisk(h) ? (h.clearance ? `${icon('checkCircle')} Presentó constancia médica${h.clearanceAt ? ' el ' + fmtDate(h.clearanceAt) : ''}.` : `${icon('alert')} Debe presentar constancia médica de aptitud.`) : `${icon('checkCircle')} Apto según el cuestionario.`}</div></div>
        <div class="card stack"><div class="card-title">${icon('alert')} Condiciones y lesiones</div>
          ${(h.conditions || []).length ? `<div class="chips chips-wrap">${h.conditions.map((c) => `<span class="chip on">${esc(c)}</span>`).join('')}</div>` : '<div class="muted small">Sin condiciones registradas.</div>'}
          <div class="kv"><span>Lesiones</span><b>${esc(h.injuries || '—')}</b></div><div class="kv"><span>Medicamentos</span><b>${esc(h.meds || '—')}</b></div>
          <div class="kv"><span>Emergencia</span><b>${esc(mb.emergencyName || '—')} ${esc(mb.emergencyPhone || '')}</b></div>
          <button class="btn btn-secondary" data-ed>${icon('edit')} Actualizar salud</button></div></div>`;
      body.querySelector('[data-ed]').onclick = () => action('edit');
    }
  };

  root.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  header(); draw();
  return m;
}

function waMenu(mb) {
  const kinds = [['por_vencer', 'Recordar vencimiento'], ['vencido', 'Invitar a volver'], ['inactivo', 'No ha venido'], ['deuda', 'Recordar deuda'], ['cumple', 'Feliz cumpleaños'], ['bienvenida', 'Bienvenida y carnet'], ['libre', 'Mensaje libre']];
  const m = openModal({
    title: 'Escribir por WhatsApp', sub: `${esc(mb.name)} · ${esc(mb.phone || 'sin teléfono')}`, size: 'md',
    body: `<div class="chips chips-wrap" data-k>${kinds.map(([k, l]) => `<button class="chip" data-kk="${k}">${l}</button>`).join('')}</div><textarea class="textarea mt" rows="9" data-t></textarea>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-whatsapp" data-send>${icon('whatsapp')} Abrir WhatsApp</button>`
  });
  const ta = m.el.querySelector('[data-t]');
  const days = mb.lastCheckinAt ? Math.floor((Date.now() - new Date(mb.lastCheckinAt)) / 864e5) : '';
  const set = (k) => { ta.value = memberMessage(k, { member: mb, extra: k === 'inactivo' ? days : '' }); m.el.querySelectorAll('[data-kk]').forEach((b) => b.classList.toggle('on', b.dataset.kk === k)); };
  m.el.querySelectorAll('[data-kk]').forEach((b) => b.onclick = () => set(b.dataset.kk));
  const st = memberStatus(mb);
  set((Number(mb.balance) || 0) > 0.009 ? 'deuda' : st === 'por_vencer' ? 'por_vencer' : ['vencido', 'agotado'].includes(st) ? 'vencido' : 'libre');
  m.el.querySelector('[data-send]').onclick = () => { window.open(mb.phone ? waLink(mb.phone, ta.value) : 'https://wa.me/?text=' + encodeURIComponent(ta.value), '_blank', 'noopener'); m.close(); };
}

// ======================================================================
// CARNET
// ======================================================================
async function copyCard(mb) {
  try { await navigator.clipboard.writeText(cardUrl(mb.cardCode)); toast('Enlace del carnet copiado'); } catch (_) { toast(cardUrl(mb.cardCode), 'info', 6000); }
}
export async function cardModal(mb) {
  const qr = await qrDataURL(cardUrl(mb.cardCode), 5);
  const m = openModal({
    title: 'Carnet digital', sub: esc(mb.name), size: 'sm',
    body: `<div class="center stack" style="align-items:center"><img src="${qr}" class="qr-img lg" alt="QR"><div class="mono small">${esc(mb.cardCode)}</div>
      <div class="small muted">El socio abre el enlace en su teléfono y muestra el QR en recepción o en el kiosco. Ahí ve su plan, sus sesiones y su rutina.</div></div>`,
    footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar enlace</button><button class="btn btn-secondary" data-pr>${icon('print')} Imprimir</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>`
  });
  m.el.querySelector('[data-copy]').onclick = () => copyCard(mb);
  m.el.querySelector('[data-pr]').onclick = () => printCard(mb);
  m.el.querySelector('[data-wa]').onclick = () => waMember('bienvenida', { member: mb });
}
/** Carnet tamaño tarjeta (CR80) para imprimir y plastificar */
export async function printCard(mb) {
  const qr = await qrDataURL(cardUrl(mb.cardCode), 6);
  const photo = await memberPhoto(mb);
  const ms = mb.membership;
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Carnet ${esc(mb.number)}</title><style>
    @page { size: auto; margin: 10mm; } body { font-family: Arial, Helvetica, sans-serif; }
    .card { width: 85.6mm; height: 54mm; border-radius: 3.5mm; overflow: hidden; position: relative; background: #0d120a; color: #fff; display: flex; box-shadow: 0 0 0 .2mm #999; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .l { flex: 1; padding: 4mm; display: flex; flex-direction: column; gap: 1.2mm; }
    .brand { font-size: 3mm; letter-spacing: .4mm; text-transform: uppercase; color: #bef264; font-weight: 700; }
    .gym { font-size: 3.6mm; font-weight: 700; }
    .ph { width: 16mm; height: 16mm; border-radius: 2mm; object-fit: cover; background: #222; margin-top: 1.5mm; }
    .nm { font-size: 3.9mm; font-weight: 800; line-height: 1.1; margin-top: auto; }
    .num { font-size: 2.8mm; color: #cbd5c0; } .pl { font-size: 2.5mm; color: #a3e635; }
    .r { width: 30mm; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm; color: #111; }
    .r img { width: 25mm; height: 25mm; } .r small { font-size: 2.2mm; font-family: monospace; }
    .bar { position: absolute; left: 0; right: 30mm; bottom: 0; height: 1.2mm; background: linear-gradient(90deg,#facc15,#a3e635,#22c55e); }
  </style></head><body>
  <div class="card"><div class="l"><div class="brand">Socio · Sano Gym</div><div class="gym">${esc(store.businessName)}</div>
    ${photo ? `<img class="ph" src="${photo}">` : ''}
    <div class="nm">${esc(mb.name)}</div><div class="num">${esc(mb.number)}${mb.idDoc ? ' · ' + esc(mb.idDoc) : ''}</div>
    ${ms ? `<div class="pl">${esc(ms.planName)}</div>` : ''}</div>
    <div class="r"><img src="${qr}"><small>${esc(mb.cardCode)}</small><small>Escanea en recepción</small></div><div class="bar"></div></div>
  </body></html>`);
}
export { voidSale };
