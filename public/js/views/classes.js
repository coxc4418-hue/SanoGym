// Sano Gym — Clases grupales: horario semanal, reservas, asistencia y lista de espera
import { store, DAYS, DAYS_SHORT, BOOK_STATUS, memberStatus } from '../store.js';
import { bookClass, cancelBooking, markBooking, toMin } from '../ops.js';
import { esc, emptyState, fmtDate, toast, todayKey, dayKey, addDays, fromKey, openModal, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos, openMember, pickMember } from '../member.js';
import { waMember } from '../shared.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const classState = (c, date) => {
  const t = todayKey();
  if (date < t) return 'done';
  if (date > t) return 'next';
  const s = toMin(c.time); const e = s + (Number(c.minutes) || 60); const n = nowMin();
  return n >= e ? 'done' : n >= s ? 'live' : 'next';
};
function monday(d = new Date()) { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; }

export function mount(el, { navigate }) {
  let week = 0;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Clases grupales</h1><p class="view-sub">Toca una clase para ver la lista, reservar cupos y pasar asistencia.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="c-edit">${icon('settings')} Editar horario</button><button class="btn btn-primary" id="c-book">${icon('plus')} Reservar a un socio</button></div></div>
    <div class="card card-flush" data-tour="week">
      <div class="between" style="padding:14px 16px"><button class="btn btn-ghost btn-sm" id="c-prev">${icon('chevronLeft')}</button><b id="c-range"></b><button class="btn btn-ghost btn-sm" id="c-next">${icon('chevronRight')}</button></div>
      <div id="c-grid"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  function render() {
    const start = addDays(monday(), week * 7);
    const days = [...Array(7)].map((_, i) => addDays(start, i));
    $('#c-range').textContent = `${fmtDate(dayKey(days[0]))} – ${fmtDate(dayKey(days[6]))}`;
    $('#c-prev').disabled = week <= 0;
    if (!store.settings.classes.filter((c) => c.active !== false).length) {
      $('#c-grid').innerHTML = `<div style="padding:0 16px 20px">${emptyState('calendar', 'Aún no hay clases en el horario', 'Crea tus clases (Spinning, Funcional, Yoga…) con sus días, hora, cupo e instructor. También puedes cargar un horario de ejemplo y ajustarlo.')}<div class="center mt"><button class="btn btn-primary" id="c-setup">${icon('settings')} Configurar clases</button></div></div>`;
      $('#c-setup').onclick = () => navigate('ajustes', { params: { tab: 'clases' } });
      return;
    }
    const t = todayKey();
    $('#c-grid').innerHTML = `<div class="week">${days.map((d) => {
      const k = dayKey(d); const list = store.classesOn(k);
      return `<div class="wday ${k === t ? 'today' : ''} ${k < t ? 'past' : ''}"><div class="wday-h"><b>${DAYS_SHORT[d.getDay()]}</b><span>${d.getDate()}</span></div>
        ${list.length ? list.map((c) => {
          const n = store.bookedCount(c.id, k); const w = store.bookingsFor(c.id, k).filter((b) => b.status === 'espera').length; const cap = Number(c.capacity) || 0; const st = classState(c, k);
          return `<button class="wcls ${st}" style="--cc:${c.color || 'var(--brand)'}" data-c="${c.id}" data-d="${k}"><span class="wcls-t">${esc(c.time)}${st === 'live' ? ' <i class="live-dot"></i>' : ''}</span><b>${esc(c.name)}</b><span class="t-sub ellipsis">${esc(store.trainer(c.trainerId)?.name || '')}</span>
            <span class="wcls-cap"><span class="progress"><i style="width:${cap ? Math.min(100, (n / cap) * 100) : 0}%;${cap && n >= cap ? 'background:var(--danger)' : ''}"></i></span>${n}${cap ? '/' + cap : ''}${w ? ` +${w}` : ''}</span></button>`;
        }).join('') : '<div class="faint small center" style="padding:12px 0">—</div>'}</div>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClass(store.gymClass(b.dataset.c), b.dataset.d));
  }

  $('#c-prev').onclick = () => { if (week > 0) { week--; render(); } };
  $('#c-next').onclick = () => { week++; render(); };
  $('#c-edit').onclick = () => navigate('ajustes', { params: { tab: 'clases' } });
  $('#c-book').onclick = async () => { const m = await pickMember({ title: 'Reservar clase', allowNew: false }); if (m) bookForMember(m); };
  render();
  const off = store.on('*', (e) => { if (e === 'bookings' || e === 'settings') render(); });
  const tick = setInterval(render, 60000);
  return () => { off(); clearInterval(tick); };
}

/** Lista de una clase en una fecha: reservas, espera y asistencia */
export function openClass(c, date) {
  if (!c) return;
  const t = store.trainer(c.trainerId);
  const md = openModal({
    title: c.name, sub: `${DAYS[fromKey(date).getDay()]} ${fmtDate(date)} · ${c.time} · ${c.minutes} min${c.room ? ' · ' + esc(c.room) : ''}${t ? ' · ' + esc(t.name) : ''}`, size: 'md',
    body: '<div data-b></div>',
    footer: `<button class="btn btn-ghost" data-wa-all>${icon('whatsapp')} Recordar a todos</button><span class="grow"></span><button class="btn btn-secondary" data-close>Cerrar</button><button class="btn btn-primary" data-add>${icon('userPlus')} Agregar socio</button>`
  });
  const draw = () => {
    const list = store.bookingsFor(c.id, date).sort((a, b) => (a.status === 'espera') - (b.status === 'espera') || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const booked = list.filter((b) => b.status !== 'espera'); const wait = list.filter((b) => b.status === 'espera');
    const cap = Number(c.capacity) || 0; const st = classState(c, date);
    const row = (b, i) => `<div class="list-item">${avatar(store.member(b.memberId) || { name: b.memberName })}<div class="grow" style="min-width:0;cursor:pointer" data-open="${b.memberId}"><b class="ellipsis">${esc(b.memberName)}</b><div class="t-sub">${b.status === 'espera' ? `En espera #${i + 1}` : `<span class="badge badge-${BOOK_STATUS[b.status].tone}">${BOOK_STATUS[b.status].label}</span>`}${(store.member(b.memberId)?.noShows || 0) >= (store.access.noShowLimit || 3) ? ' <span class="badge badge-danger">faltas frecuentes</span>' : ''}</div></div>
      <div class="row" style="gap:4px;flex-wrap:nowrap">${b.status !== 'espera' && st !== 'next' ? `<button class="btn btn-sm ${b.status === 'asistio' ? 'btn-success' : 'btn-ghost'}" data-mk="${b.id}" data-s="asistio" title="Asistió">${icon('check')}</button><button class="btn btn-sm ${b.status === 'falto' ? 'btn-danger' : 'btn-ghost'}" data-mk="${b.id}" data-s="falto" title="No asistió">${icon('x')}</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-wa="${b.id}" title="WhatsApp">${icon('whatsapp')}</button>${st !== 'done' ? `<button class="btn btn-ghost btn-sm" data-cancel="${b.id}" title="Cancelar reserva">${icon('trash')}</button>` : ''}</div></div>`;
    md.el.querySelector('[data-b]').innerHTML = `<div class="between mb"><div><b>${booked.length}${cap ? ` de ${cap}` : ''}</b> cupo(s) ocupados${wait.length ? ` · ${wait.length} en espera` : ''}</div>${cap ? `<span class="badge badge-${booked.length >= cap ? 'danger' : 'success'}">${booked.length >= cap ? 'Llena' : `${cap - booked.length} libre(s)`}</span>` : ''}</div>
      ${cap ? `<div class="progress mb"><i style="width:${Math.min(100, (booked.length / cap) * 100)}%"></i></div>` : ''}
      ${booked.length ? `<div class="list">${booked.map(row).join('')}</div>` : emptyState('calendar', 'Sin reservas aún', 'Agrega socios o deja que reserven en recepción.')}
      ${wait.length ? `<h4 class="mt">Lista de espera</h4><div class="list">${wait.map(row).join('')}</div>` : ''}
      ${st !== 'next' && booked.some((b) => b.status === 'reservada') ? `<div class="row mt"><button class="btn btn-secondary btn-sm" data-allok>${icon('check')} Marcar todos como asistieron</button></div>` : ''}`;
    const q = (s) => md.el.querySelectorAll(s);
    const bk = (id) => list.find((x) => x.id === id);
    q('[data-open]').forEach((b) => b.onclick = () => openMember(b.dataset.open));
    q('[data-mk]').forEach((b) => b.onclick = async () => { await markBooking(bk(b.dataset.mk), b.dataset.s); });
    q('[data-wa]').forEach((b) => b.onclick = () => { const x = bk(b.dataset.wa); waMember('clase', { member: store.member(x.memberId) || {}, booking: x }); });
    q('[data-cancel]').forEach((b) => b.onclick = async () => {
      const x = bk(b.dataset.cancel);
      if (!(await confirmDialog({ title: 'Cancelar reserva', message: `¿Liberar el cupo de ${x.memberName}?`, confirmText: 'Cancelar reserva', danger: true }))) return;
      const promoted = await cancelBooking(x);
      if (promoted) { toast(`${promoted.memberName} pasó de la lista de espera a la clase`); if (await confirmDialog({ title: 'Se liberó un cupo', message: `${promoted.memberName} ya tiene lugar. ¿Avisarle por WhatsApp?`, confirmText: 'Avisar' })) waMember('cupo', { member: store.member(promoted.memberId) || {}, booking: promoted }); }
      else toast('Reserva cancelada');
    });
    md.el.querySelector('[data-allok]')?.addEventListener('click', async () => { for (const x of booked.filter((y) => y.status === 'reservada')) await markBooking(x, 'asistio'); toast('Asistencia registrada'); });
    hydratePhotos(md.el);
  };
  md.el.querySelector('[data-add]').onclick = async () => {
    const m = await pickMember({ title: `Reservar: ${c.name}`, allowNew: false });
    if (!m) return;
    await reserve(m, c, date);
  };
  md.el.querySelector('[data-wa-all]').onclick = async () => {
    const list = store.bookingsFor(c.id, date).filter((b) => b.status === 'reservada' && b.memberPhone);
    if (!list.length) { toast('Nadie con teléfono en esta clase', 'warning'); return; }
    for (const x of list.slice(0, 1)) waMember('clase', { member: store.member(x.memberId) || {}, booking: x });
    if (list.length > 1) toast('Abre los demás desde el botón de cada socio (WhatsApp no permite enviar a varios a la vez).', 'info', 4500);
  };
  draw();
  const off = store.on('bookings', draw);
  const obs = new MutationObserver(() => { if (!document.body.contains(md.el)) { off(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}

async function reserve(m, c, date) {
  try {
    const bk = await bookClass({ member: m, cls: c, date });
    toast(bk.status === 'espera' ? `${m.name} quedó en lista de espera` : `${m.name} reservado en ${c.name}`, bk.status === 'espera' ? 'warning' : 'success');
    return bk;
  } catch (e) {
    if (await confirmDialog({ title: 'No se puede reservar', message: `${e.message}\n\n¿Reservar de todos modos?`, confirmText: 'Reservar igual' })) {
      try { return await bookClass({ member: m, cls: c, date, force: true }); } catch (e2) { toast(e2.message, 'danger'); }
    }
    return null;
  }
}

/** Desde la ficha del socio: elige una clase de los próximos 7 días y reserva */
export function bookForMember(m) {
  return new Promise((resolve) => {
    const t = todayKey();
    const opts = [];
    for (let i = 0; i < 7; i++) {
      const k = dayKey(addDays(new Date(), i));
      for (const c of store.classesOn(k)) if (classState(c, k) !== 'done') opts.push({ c, k });
    }
    const st = memberStatus(m);
    const md = openModal({
      title: 'Reservar clase', sub: esc(m.name), size: 'md',
      body: (st !== 'activo' && st !== 'por_vencer' ? '<div class="box-warn small mb">Este socio no tiene una membresía vigente.</div>' : '') + (opts.length ? `<div class="list">${opts.map(({ c, k }, i) => {
        const n = store.bookedCount(c.id, k); const cap = Number(c.capacity) || 0;
        const mine = store.bookings.find((b) => b.classId === c.id && b.date === k && b.memberId === m.id && b.status !== 'cancelada');
        return `<button class="list-item cls-item" style="--cc:${c.color || 'var(--brand)'}" data-i="${i}" ${mine ? 'disabled' : ''}><span class="cls-time">${esc(c.time)}</span><div class="grow" style="min-width:0"><b>${esc(c.name)}</b><div class="t-sub">${k === t ? 'Hoy' : DAYS[fromKey(k).getDay()] + ' ' + fmtDate(k)} · ${esc(store.trainer(c.trainerId)?.name || '')}</div></div><span class="small ${cap && n >= cap ? 'text-danger' : 'muted'}">${mine ? 'Ya reservado' : cap && n >= cap ? 'Llena · espera' : `${n}/${cap || '∞'}`}</span></button>`;
      }).join('')}</div>` : emptyState('calendar', 'No hay clases en los próximos días')),
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>',
      onClose: () => resolve(null)
    });
    md.el.querySelectorAll('[data-i]').forEach((b) => b.onclick = async () => {
      const { c, k } = opts[Number(b.dataset.i)];
      const bk = await reserve(m, c, k);
      if (bk) { md.close(); if (m.phone && (await confirmDialog({ title: 'Reserva lista', message: '¿Enviarle la confirmación por WhatsApp?', confirmText: 'Enviar' }))) waMember('clase', { member: m, booking: bk }); resolve(bk); }
    });
  });
}

