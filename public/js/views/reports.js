// Sano Gym — Reportes del gimnasio (protegidos con PIN)
import { store, DAYS_SHORT, SEX } from '../store.js';
import { methodNet } from '../ops.js';
import { esc, usd, num, emptyState, startOfDay, endOfDay, addDays, dayKey, fromKey, fmtDate, methodLabel, toCSV, download, todayKey } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';
import { ageOf } from '../gym.js';

const RANGES = { hoy: 'Hoy', '7': '7 días', '30': '30 días', mes: 'Este mes', anio: 'Este año', custom: 'Personalizado' };
const KIND = { membresia: 'Membresías', abono: 'Abonos y cobro de deudas', tienda: 'Tienda y servicios' };
const AGE_GROUPS = [['Menos de 18', 0, 17], ['18-25', 18, 25], ['26-35', 26, 35], ['36-45', 36, 45], ['46-59', 46, 59], ['60+', 60, 200]];

export function mount(el) {
  let range = '30';
  let from = dayKey(addDays(new Date(), -29)); let to = dayKey();
  let data = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Ingresos, renovación de socios, asistencia por hora, ocupación de clases, comisiones de entrenadores y gastos.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="r-csv">${icon('download')} Excel</button><button class="btn btn-secondary" id="r-print">${icon('print')} Imprimir</button></div></div>
    <div class="card" style="margin-bottom:16px;padding:12px 14px"><div class="row row-wrap"><div class="chips" id="r-ranges"></div><div class="row" id="r-custom" hidden><input class="input input-sm" type="date" id="r-from" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="r-to" style="width:auto"></div></div></div>
    <div id="r-body"><div class="empty"><div class="spinner"></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  function setRange(k) {
    range = k; const now = new Date();
    if (k === 'hoy') { from = to = dayKey(); }
    if (k === '7') { from = dayKey(addDays(now, -6)); to = dayKey(); }
    if (k === '30') { from = dayKey(addDays(now, -29)); to = dayKey(); }
    if (k === 'mes') { from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); to = dayKey(); }
    if (k === 'anio') { from = dayKey(new Date(now.getFullYear(), 0, 1)); to = dayKey(); }
    $('#r-ranges').innerHTML = Object.entries(RANGES).map(([v, l]) => `<button class="chip ${v === range ? 'on' : ''}" data-r="${v}">${l}</button>`).join('');
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => setRange(b.dataset.r));
    $('#r-custom').hidden = k !== 'custom';
    $('#r-from').value = from; $('#r-to').value = to;
    load();
  }

  async function load() {
    $('#r-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    const a = startOfDay(fromKey(from)).toISOString(), b = endOfDay(fromKey(to)).toISOString();
    try {
      const [sales, sold, ended, checkins, bookings, moves] = await Promise.all([
        store.salesBetween(a, b), store.listBetween('memberships', 'createdAt', a, b), store.listBetween('memberships', 'end', from, to),
        store.listBetween('checkins', 'date', a, b), store.listBetween('bookings', 'date', from, to), store.listBetween('cash_movements', 'date', a, b)
      ]);
      data = { sales: sales.filter((s) => s.status !== 'voided'), sold: sold.filter((m) => m.status !== 'anulada'), ended: ended.filter((m) => m.status !== 'anulada' && m.kind !== 'pase'), checkins, bookings: bookings.filter((x) => x.status !== 'cancelada'), moves };
    } catch (e) { if ($('#r-body')) $('#r-body').innerHTML = `<div class="card">${emptyState('alert', 'No se pudo cargar', esc(e.message))}</div>`; return; }
    if (!$('#r-body')) return; // se cambió de pantalla mientras cargaba
    render();
  }

  const top = (map, n = 8) => Object.entries(map).sort((x, y) => y[1] - x[1]).slice(0, n);
  function hbars(rows, fmt = (v) => v, unit = '') {
    if (!rows.length) return emptyState('chart', 'Sin datos en el período');
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return rows.map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${fmt(v)}${unit}"><span class="ellipsis">${esc(k)}</span><div class="track"><i style="width:${Math.max(2, v / max * 100)}%"></i></div><b class="num">${fmt(v)}${unit}</b></div>`).join('');
  }
  const add = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };

  function compute() {
    const { sales, sold, ended, checkins, bookings, moves } = data;
    const billed = sales.reduce((a, s) => a + (s.total || 0), 0);
    const cash = sales.reduce((a, s) => a + (s.received || 0), 0);
    const cost = sales.reduce((a, s) => a + (s.cost || 0), 0);
    const byKind = {}; sales.forEach((s) => add(byKind, KIND[s.kind] || s.kind, s.total || 0));
    const byPlan = {}; const planCount = {}; sold.forEach((m) => { add(byPlan, m.planName, m.total || 0); add(planCount, m.planName); });
    const renewals = sold.filter((m) => m.renewal).length; const newOnes = sold.length - renewals;
    const enrollIncome = sold.reduce((a, m) => a + (Number(m.enrollFee) || 0), 0);
    const pendingSold = sold.reduce((a, m) => a + (Number(m.balance) || 0), 0);
    // Renovación: de las membresías que vencieron en el período, ¿cuántos socios renovaron?
    const endedPast = ended.filter((m) => m.end < todayKey());
    const renewed = endedPast.filter((m) => { const cur = store.member(m.memberId)?.membership; return cur && cur.status !== 'anulada' && cur.id !== m.id && cur.end > m.end; });
    const renewRate = endedPast.length ? renewed.length / endedPast.length * 100 : null;
    const methods = {}; sales.forEach((s) => Object.entries(methodNet(s)).forEach(([k, v]) => add(methods, k, v)));
    const products = {}; sales.filter((s) => s.kind === 'tienda').forEach((s) => (s.items || []).forEach((i) => add(products, i.name, i.price * i.qty)));
    // Asistencia
    const ok = checkins.filter((c) => c.result !== 'denied');
    const denied = checkins.filter((c) => c.result === 'denied');
    const uniq = new Set(ok.map((c) => c.memberId)).size;
    const days = []; for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) days.push(dayKey(d));
    const perDay = days.map((k) => [k, ok.filter((c) => c.dayKey === k).length]);
    const incomeDay = days.map((k) => [k, sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.received || 0), 0)]);
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    ok.forEach((c) => { const d = new Date(c.date); heat[c.weekday ?? d.getDay()][c.hour ?? d.getHours()]++; });
    const reasons = {}; denied.forEach((c) => add(reasons, (c.reason || 'Otro').split('.')[0].slice(0, 60)));
    const vias = {}; ok.forEach((c) => add(vias, { recepcion: 'Recepción', kiosco: 'Kiosco', qr: 'Cámara QR' }[c.via] || c.via || 'Recepción'));
    // Clases
    const cls = {}; bookings.forEach((x) => {
      const k = `${x.className} · ${x.time}`;
      cls[k] ||= { booked: 0, att: 0, miss: 0, wait: 0, sessions: new Set(), cap: Number(store.gymClass(x.classId)?.capacity) || 0, trainer: x.trainer };
      const o = cls[k]; o.sessions.add(x.date);
      if (x.status === 'espera') o.wait++; else o.booked++;
      if (x.status === 'asistio') o.att++; if (x.status === 'falto') o.miss++;
    });
    const clsRows = Object.entries(cls).map(([k, o]) => [k, o.cap && o.sessions.size ? Math.round(o.booked / (o.cap * o.sessions.size) * 100) : 0, o]).sort((a, b) => b[1] - a[1]);
    // Entrenadores: comisiones sobre membresías con entrenador y asistencia a sus clases
    const tr = {};
    store.settings.trainers.forEach((t) => { tr[t.id] = { name: t.name, pct: Number(t.commission) || 0, sales: 0, count: 0, classAtt: 0 }; });
    sold.forEach((m) => { if (m.trainerId && tr[m.trainerId]) { tr[m.trainerId].sales += Number(m.price) || 0; tr[m.trainerId].count++; } });
    bookings.forEach((x) => { if (x.trainerId && tr[x.trainerId] && x.status === 'asistio') tr[x.trainerId].classAtt++; });
    const trainers = Object.values(tr).filter((t) => t.sales || t.classAtt).map((t) => ({ ...t, commission: t.sales * t.pct / 100 }));
    // Gastos
    const out = moves.filter((m) => m.direction === 'out');
    const expenses = out.reduce((a, m) => a + (Number(m.amount) || 0), 0);
    const expCat = {}; out.forEach((m) => add(expCat, m.category || 'Otros', Number(m.amount) || 0));
    // Socios nuevos del período (demografía)
    const newMembers = store.members.filter((m) => (m.createdAt || '') >= startOfDay(fromKey(from)).toISOString() && (m.createdAt || '') <= endOfDay(fromKey(to)).toISOString());
    const ages = Object.fromEntries(AGE_GROUPS.map(([l]) => [l, 0])); const sex = {}; const goals = {};
    store.activeMembers.forEach((m) => { const a = m.birthDate ? ageOf(m.birthDate) : null; const g = AGE_GROUPS.find(([, x, y]) => a != null && a >= x && a <= y); if (g) ages[g[0]]++; add(sex, SEX[m.sex] || 'Sin indicar'); if (m.goal) add(goals, m.goal); });
    return { billed, cash, cost, byKind, byPlan, planCount, renewals, newOnes, enrollIncome, pendingSold, endedPast, renewed, renewRate, methods, products, ok, denied, uniq, perDay, incomeDay, heat, reasons, vias, clsRows, trainers, expenses, expCat, newMembers, ages, sex, goals };
  }

  function heatHTML(heat) {
    const tot = heat.flat().reduce((a, b) => a + b, 0);
    if (!tot) return emptyState('clock', 'Sin entradas en el período');
    const hrs = []; for (let h = 0; h < 24; h++) if (heat.some((r) => r[h])) hrs.push(h);
    const h0 = Math.min(...hrs); const h1 = Math.max(...hrs);
    const max = Math.max(...heat.flat());
    const order = [1, 2, 3, 4, 5, 6, 0];
    const cols = []; for (let h = h0; h <= h1; h++) cols.push(h);
    return `<div class="dh-wrap"><table class="dh"><thead><tr><th></th>${cols.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${order.map((d) => `<tr><th>${DAYS_SHORT[d]}</th>${cols.map((h) => { const v = heat[d][h]; return `<td title="${DAYS_SHORT[d]} ${h}:00 · ${v} entrada(s)" style="--a:${v ? 0.12 + (v / max) * 0.88 : 0}">${v || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted mt-xs">Más oscuro = más gente. Úsalo para planificar personal, clases y promociones en horas valle.</p>`;
  }

  function render() {
    const c = compute();
    const max = Math.max(1, ...c.perDay.map((x) => x[1]));
    const maxI = Math.max(1, ...c.incomeDay.map((x) => x[1]));
    const showDays = c.perDay.length <= 31;
    const nDays = Math.max(1, c.perDay.length);
    $('#r-body').innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Facturado</span><span class="kpi-icon tone-brand">${icon('dollar')}</span></div><div class="kpi-value">${usd(c.billed)}</div><div class="kpi-sub">Cobrado ${usd(c.cash)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Membresías vendidas</span><span class="kpi-icon tone-success">${icon('ticket')}</span></div><div class="kpi-value">${data.sold.length}</div><div class="kpi-sub">${c.newOnes} nueva(s) · ${c.renewals} renovación(es)</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Tasa de renovación</span><span class="kpi-icon tone-info">${icon('refresh')}</span></div><div class="kpi-value">${c.renewRate == null ? '—' : num(c.renewRate, 0) + '%'}</div><div class="kpi-sub">${c.renewed.length} de ${c.endedPast.length} que vencieron</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Asistencia</span><span class="kpi-icon tone-violet">${icon('userCheck')}</span></div><div class="kpi-value">${c.ok.length}</div><div class="kpi-sub">${c.uniq} socio(s) · ${num(c.ok.length / nDays, 1)} por día</div></div>
      </div>
      <div class="kpis kpis-sm">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Gastos</span></div><div class="kpi-value">${usd(c.expenses)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Resultado (cobrado − gastos)</span></div><div class="kpi-value ${c.cash - c.expenses < 0 ? 'text-danger' : ''}">${usd(c.cash - c.expenses)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Socios nuevos</span></div><div class="kpi-value">${c.newMembers.length}</div><div class="kpi-sub">Inscripciones ${usd(c.enrollIncome)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Quedó a crédito</span></div><div class="kpi-value">${usd(c.pendingSold)}</div><div class="kpi-sub">Deuda total hoy ${usd(store.totalDebt)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Entradas rechazadas</span></div><div class="kpi-value">${c.denied.length}</div><div class="kpi-sub">oportunidades de venta</div></div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><div class="card-title">${icon('userCheck')} Entradas por día</div></div>
          ${showDays ? `<div class="bars">${c.perDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${v}"><i style="height:${v / max * 100}%"></i><span>${c.perDay.length > 14 ? k.slice(8) : fmtDate(k).slice(0, 5)}</span></div>`).join('')}</div>` : `<p class="muted small">Total del período: ${c.ok.length}</p>`}</div>
        <div class="card"><div class="card-head"><div class="card-title">${icon('dollar')} Cobrado por día</div></div>
          ${showDays ? `<div class="bars">${c.incomeDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${usd(v)}"><i style="height:${v / maxI * 100}%"></i><span>${c.incomeDay.length > 14 ? k.slice(8) : fmtDate(k).slice(0, 5)}</span></div>`).join('')}</div>` : `<p class="muted small">Total del período: ${usd(c.cash)}</p>`}</div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-title" style="margin-bottom:10px">${icon('flame')} Horas pico: entradas por día y hora</div>${heatHTML(c.heat)}</div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('chart')} Ingresos por tipo</div>${hbars(top(c.byKind), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('ticket')} Ingresos por plan</div>${hbars(top(c.byPlan, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('trophy')} Planes más vendidos</div>${hbars(top(c.planCount, 10))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('wallet')} Formas de pago</div>${hbars(Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => [methodLabel(k), v]).sort((a, b) => b[1] - a[1]), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('calendar')} Ocupación de clases</div>${c.clsRows.length ? c.clsRows.slice(0, 12).map(([k, pct, o]) => `<div class="hbar" title="${esc(k)}"><span class="ellipsis">${esc(k)}</span><div class="track"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div><b class="num">${pct}%</b></div><div class="t-sub" style="margin:-4px 0 8px">${o.booked} reserva(s) · ${o.att} asistieron · ${o.miss} faltaron${o.wait ? ` · ${o.wait} en espera` : ''}</div>`).join('') : emptyState('calendar', 'Sin reservas en el período')}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('user')} Entrenadores y comisiones</div>${c.trainers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Entrenador</th><th class="r">Planes</th><th class="r">Asist. clases</th><th class="r">Comisión</th></tr></thead><tbody>${c.trainers.map((t) => `<tr><td><b>${esc(t.name)}</b><div class="t-sub">${t.pct}% de ${usd(t.sales)}</div></td><td class="r num">${t.count}</td><td class="r num">${t.classAtt}</td><td class="r num"><b>${usd(t.commission)}</b></td></tr>`).join('')}</tbody></table></div>` : emptyState('user', 'Sin datos', 'Asigna entrenadores a los planes personalizados y a las clases; define su % de comisión en Configuración.')}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('box')} Tienda: más vendidos</div>${hbars(top(c.products, 10), (v) => usd(v))}<p class="small muted mt-xs">Margen de la tienda: ${usd(Object.values(c.products).reduce((a, b) => a + b, 0) - c.cost)}</p></div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('wallet')} Gastos por categoría</div>${hbars(top(c.expCat, 10), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('alert')} Motivos de rechazo en la entrada</div>${hbars(top(c.reasons, 8))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('users')} Socios activos: edad, sexo y objetivo</div>${hbars(Object.entries(c.ages).filter(([, v]) => v))}<div class="mt">${hbars(top(c.sex))}</div><div class="mt">${hbars(top(c.goals, 6))}</div></div>
      </div>`;
  }

  $('#r-from').onchange = (e) => { from = e.target.value; load(); };
  $('#r-to').onchange = (e) => { to = e.target.value; load(); };
  $('#r-csv').onclick = () => {
    if (!data) return;
    download(`reporte-sano-gym-${from}-${to}.csv`, '﻿' + toCSV([
      ['Documento', 'Tipo', 'Fecha', 'Socio', 'Detalle', 'Total', 'Cobrado', 'Pago', 'Usuario'],
      ...data.sales.map((s) => [s.number, KIND[s.kind] || s.kind, s.date.slice(0, 16).replace('T', ' '), s.memberName, (s.items || []).map((i) => i.name).join(' + '), (s.total || 0).toFixed(2), (s.received || 0).toFixed(2), (s.payments || []).map((p) => methodLabel(p.method)).join(' + '), s.by || '']),
      [], ['Membresía', 'Socio', 'Plan', 'Inicio', 'Vence', 'Precio', 'Inscripción', 'Descuento', 'Total', 'Pagado', 'Saldo', 'Renovación', 'Entrenador'],
      ...data.sold.map((m) => ['', m.memberName, m.planName, m.start, m.end, m.price, m.enrollFee || 0, m.discount || 0, m.total, m.paid, m.balance, m.renewal ? 'Sí' : 'No', m.trainer || '']),
      [], ['Entrada', 'Fecha', 'Socio', 'Plan', 'Resultado', 'Motivo', 'Vía'],
      ...data.checkins.map((c) => ['', c.date.slice(0, 16).replace('T', ' '), c.memberName, c.planName, c.result, c.reason, c.via])
    ]), 'text/csv;charset=utf-8');
  };
  $('#r-print').onclick = () => {
    if (!data) return;
    const c = compute();
    const tbl = (rows, f = (v) => v) => `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${f(v)}</td></tr>`).join('') || '<tr><td>Sin datos</td></tr>'}</tbody></table>`;
    printDoc(`Reporte del ${fmtDate(from)} al ${fmtDate(to)}`, `
      <div class="kpis"><div class="kpi">Facturado<b>${usd(c.billed)}</b></div><div class="kpi">Cobrado<b>${usd(c.cash)}</b></div><div class="kpi">Gastos<b>${usd(c.expenses)}</b></div><div class="kpi">Membresías<b>${data.sold.length}</b></div><div class="kpi">Renovación<b>${c.renewRate == null ? '—' : num(c.renewRate, 0) + '%'}</b></div><div class="kpi">Entradas<b>${c.ok.length}</b></div></div>
      <h2>Ingresos por tipo</h2>${tbl(top(c.byKind), (v) => usd(v))}
      <h2>Ingresos por plan</h2>${tbl(top(c.byPlan, 20), (v) => usd(v))}
      <h2>Formas de pago</h2>${tbl(Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => [methodLabel(k), v]), (v) => usd(v))}
      <h2>Entrenadores y comisiones</h2>${tbl(c.trainers.map((t) => [`${t.name} (${t.pct}% de ${usd(t.sales)})`, t.commission]), (v) => usd(v))}
      <h2>Ocupación de clases</h2>${tbl(c.clsRows.map(([k, p]) => [k, p]), (v) => v + '%')}
      <h2>Gastos por categoría</h2>${tbl(top(c.expCat, 20), (v) => usd(v))}
      <h2>Tienda</h2>${tbl(top(c.products, 15), (v) => usd(v))}`);
  };
  setRange('30');
  return null;
}
