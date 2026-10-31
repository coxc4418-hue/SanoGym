// Sano Gym — Inicio: el día del gimnasio de un vistazo
import { store, memberStatus, statusBadge, daysBetween } from '../store.js';
import { esc, usd, fmtLongDate, todayKey, emptyState, fmtAgo, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos, openMember, memberForm } from '../member.js';
import { waMember } from '../shared.js';

export function mount(el, { navigate }) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">${hello} ${h < 12 ? '☀️' : h < 19 ? '💪' : '🌙'}</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
      <div class="view-actions" data-tour="quick">
        <button class="btn btn-success" data-q="in">${icon('userCheck')} Registrar entrada</button>
        <button class="btn btn-secondary" data-q="new">${icon('userPlus')} Nuevo socio</button>
        <button class="btn btn-primary" data-q="sell">${icon('ticket')} Vender membresía</button>
      </div></div>
    <div class="kpis" data-tour="kpis" id="d-kpis"></div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><div class="card-title">${icon('chart')} Afluencia de hoy</div><span class="small muted" id="d-peak"></span></div><div id="d-hours"></div></div>
      <div class="card" data-tour="classes"><div class="card-head"><div class="card-title">${icon('calendar')} Clases de hoy</div><button class="btn btn-ghost btn-sm" data-go="clases">Ver horario</button></div><div id="d-classes"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card card-flush" data-tour="feed"><div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('userCheck')} Últimas entradas</div><button class="btn btn-ghost btn-sm" data-go="recepcion">Recepción</button></div><div id="d-feed"></div></div>
      <div class="card" data-tour="follow"><div class="card-head"><div class="card-title">${icon('refresh')} Seguimiento</div><button class="btn btn-ghost btn-sm" data-go="renovaciones">Ver todo</button></div><div id="d-follow"></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
  $('[data-q="in"]').onclick = () => navigate('recepcion');
  $('[data-q="new"]').onclick = async () => { const m = await memberForm(); if (m) { const { sellModal } = await import('../membership.js'); sellModal(m); } };
  $('[data-q="sell"]').onclick = async () => { const { sellModal } = await import('../membership.js'); sellModal(); };

  function kpis() {
    const t = todayKey();
    const active = store.activeMembers.length;
    const newMonth = store.members.filter((m) => (m.createdAt || '').slice(0, 7) === t.slice(0, 7)).length;
    const inside = store.inside.length; const cap = Number(store.access.capacity) || 0;
    const ok = store.okCheckins; const uniq = new Set(ok.map((c) => c.memberId)).size;
    const denied = store.todayCheckins.filter((c) => c.result === 'denied').length;
    const sales = store.recentSales.filter((s) => s.dayKey === t && s.status !== 'voided');
    const cash = sales.reduce((a, s) => a + (s.received || 0), 0);
    const exp = store.expiringIn(7).length;
    $('#d-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Socios activos</span><span class="kpi-icon tone-brand">${icon('users')}</span></div><div class="kpi-value">${active}</div><div class="kpi-sub">${newMonth} nuevo(s) este mes</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Entrenando ahora</span><span class="kpi-icon tone-success">${icon('flame')}</span></div><div class="kpi-value">${inside}${cap ? `<small>/${cap}</small>` : ''}</div>${cap ? `<div class="progress mt-xs"><i style="width:${Math.min(100, (inside / cap) * 100)}%;background:${inside / cap > 0.85 ? 'var(--danger)' : inside / cap > 0.6 ? 'var(--warning)' : 'var(--success)'}"></i></div>` : ''}<div class="kpi-sub">aforo ${cap ? Math.round((inside / cap) * 100) + ' %' : 'sin límite'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Entradas hoy</span><span class="kpi-icon tone-info">${icon('userCheck')}</span></div><div class="kpi-value">${uniq}</div><div class="kpi-sub">${denied ? `<span class="text-danger">${denied} rechazada(s)</span>` : 'ningún rechazo'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado hoy</span><span class="kpi-icon tone-violet">${icon('dollar')}</span></div><div class="kpi-value">${usd(cash)}</div><div class="kpi-sub">${sales.length} cobro(s)${store.openShift ? '' : ' · <span class="text-warning">caja cerrada</span>'}</div></div>
      <div class="card kpi kpi-link" data-go2="renovaciones"><div class="kpi-top"><span class="kpi-label">Vencen en 7 días</span><span class="kpi-icon tone-warning">${icon('clock')}</span></div><div class="kpi-value">${exp}</div><div class="kpi-sub">${store.debtors.length ? `${store.debtors.length} con deuda · ${usd(store.totalDebt)}` : 'sin deudas'}</div></div>`;
    el.querySelectorAll('[data-go2]').forEach((b) => b.onclick = () => navigate(b.dataset.go2));
  }

  function hours() {
    const counts = Array(24).fill(0);
    store.okCheckins.forEach((c) => { counts[c.hour ?? new Date(c.date).getHours()]++; });
    const sch = store.settings.schedule;
    const wd = new Date().getDay();
    const open = parseInt((wd === 6 ? sch.satOpen : wd === 0 ? sch.sunOpen : sch.open) || '05', 10);
    const close = parseInt((wd === 6 ? sch.satClose : wd === 0 ? sch.sunClose : sch.close) || '22', 10);
    const from = Math.min(open || 5, ...counts.map((v, i) => (v ? i : 24))); const to = Math.max(close || 22, ...counts.map((v, i) => (v ? i + 1 : 0)));
    const max = Math.max(1, ...counts); const nowH = new Date().getHours();
    const peak = counts.indexOf(Math.max(...counts));
    $('#d-peak').textContent = counts[peak] ? `Hora pico: ${peak}:00 (${counts[peak]})` : '';
    $('#d-hours').innerHTML = `<div class="hours">${counts.slice(from, Math.max(from + 1, to)).map((v, i) => { const hh = from + i; return `<div class="hcol ${hh === nowH ? 'now' : ''}" title="${hh}:00 · ${v} entrada(s)"><b>${v || ''}</b><i style="height:${Math.max(3, (v / max) * 100)}%"></i><span>${hh}</span></div>`; }).join('')}</div>`;
  }

  function classes() {
    const t = todayKey();
    const list = store.classesOn(t);
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const toM = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
    $('#d-classes').innerHTML = list.length ? `<div class="list">${list.map((c) => {
      const n = store.bookedCount(c.id, t); const cap = Number(c.capacity) || 0; const wait = store.bookingsFor(c.id, t).filter((b) => b.status === 'espera').length;
      const done = toM(c.time) + (Number(c.minutes) || 60) < nowM; const live = !done && toM(c.time) <= nowM;
      return `<div class="list-item cls-item" style="--cc:${c.color || 'var(--brand)'};${done ? 'opacity:.55' : ''}"><span class="cls-time">${esc(c.time)}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.name)}</b><div class="t-sub">${esc(store.trainer(c.trainerId)?.name || 'Sin instructor')}${c.room ? ' · ' + esc(c.room) : ''}${live ? ' · <b class="text-success">en curso</b>' : ''}</div>
        ${cap ? `<div class="progress mt-xs"><i style="width:${Math.min(100, (n / cap) * 100)}%"></i></div>` : ''}</div><span class="badge ${n >= cap && cap ? 'badge-danger' : 'badge-neutral'}">${n}/${cap || '∞'}${wait ? ` +${wait}` : ''}</span></div>`;
    }).join('')}</div>` : emptyState('calendar', 'Sin clases hoy', store.settings.classes.length ? '' : 'Configura tu horario en Clases grupales.');
  }

  function feed() {
    const list = store.todayCheckins.slice(0, 10);
    $('#d-feed').innerHTML = list.length ? `<div class="list" style="padding:6px 10px 10px">${list.map((c) => {
      const m = store.member(c.memberId);
      return `<button class="list-item" data-m="${c.memberId || ''}">${avatar(m || { name: c.memberName })}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.memberName)}</b><div class="t-sub">${esc(c.planName || '')}${c.result === 'denied' ? ` · <span class="text-danger">${esc(c.reason)}</span>` : ''}</div></div>
        <div class="r"><span class="badge ${c.result === 'denied' ? 'badge-danger' : c.result === 'forced' ? 'badge-warning' : 'badge-success'}">${c.result === 'denied' ? 'Rechazado' : c.result === 'forced' ? 'Autorizado' : 'Entró'}</span><div class="t-sub">${fmtAgo(c.date)}</div></div></button>`;
    }).join('')}</div>` : `<div style="padding:12px">${emptyState('userCheck', 'Aún no hay entradas hoy', 'Registra la primera desde Recepción (F1) o deja el kiosco abierto en la entrada.')}</div>`;
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => b.dataset.m && openMember(b.dataset.m));
    hydratePhotos($('#d-feed'), 10);
  }

  function follow() {
    const t = todayKey();
    const exp = store.expiringIn(7).slice(0, 5);
    const bdays = store.birthdaysToday;
    const risk = store.atRisk(10);
    const lost = store.expiredWithin(30).length;
    const row = (m, sub, kind) => `<div class="list-item">${avatar(m)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-m="${m.id}"><b>${esc(m.name)}</b></button><div class="t-sub">${sub}</div></div><button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${m.id}" data-k="${kind}" title="WhatsApp">${icon('whatsapp')}</button></div>`;
    $('#d-follow').innerHTML = `
      <div class="follow-sums"><div><b>${store.expiringIn(7).length}</b><span>por vencer</span></div><div><b>${lost}</b><span>vencidos (30 d)</span></div><div><b>${risk.length}</b><span>en riesgo</span></div><div><b>${store.debtors.length}</b><span>con deuda</span></div></div>
      ${bdays.length ? `<div class="section-title mt">${icon('cake')} Cumpleaños hoy</div><div class="list">${bdays.map((m) => row(m, 'Felicítalo por WhatsApp', 'cumple')).join('')}</div>` : ''}
      ${exp.length ? `<div class="section-title mt">${icon('clock')} Vencen pronto</div><div class="list">${exp.map((m) => { const d = daysBetween(t, m.membership.end); return row(m, `${esc(m.membership.planName)} · ${d === 0 ? '<b class="text-danger">hoy</b>' : d === 1 ? 'mañana' : 'en ' + d + ' días'}`, 'por_vencer'); }).join('')}</div>` : ''}
      ${!exp.length && !bdays.length ? emptyState('checkCircle', 'Todo al día', 'Nadie vence esta semana.') : ''}`;
    el.querySelectorAll('#d-follow [data-m]').forEach((b) => b.onclick = () => openMember(b.dataset.m));
    el.querySelectorAll('#d-follow [data-wa]').forEach((b) => b.onclick = () => waMember(b.dataset.k, { member: store.member(b.dataset.wa) }));
    hydratePhotos($('#d-follow'), 12);
  }

  const all = () => { kpis(); hours(); classes(); feed(); follow(); };
  all();
  const tick = setInterval(() => { kpis(); classes(); }, 60000);
  const off = store.on('*', (evt) => {
    if (evt === 'checkins') { kpis(); hours(); feed(); }
    if (evt === 'members') { kpis(); follow(); }
    if (evt === 'bookings' || evt === 'settings') { classes(); kpis(); }
    if (evt === 'sales' || evt === 'shift' || evt === 'rate') kpis();
  });
  return () => { off(); clearInterval(tick); };
}
