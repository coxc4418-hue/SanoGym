// Sano Gym — Renovaciones y cobranza: el tablero de retención del gimnasio
import { store, memberStatus, statusBadge, daysBetween } from '../store.js';
import { esc, usd, emptyState, fmtDate, fmtAgo, toast, todayKey, openModal, nowISO } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos, openMember } from '../member.js';
import { membershipLine } from '../membership.js';
import { waMember, memberMessage } from '../shared.js';

const TABS = {
  por_vencer: { label: 'Por vencer', icon: 'clock', msg: 'por_vencer', hint: 'Avísales antes de que venza: es el mejor momento para renovar.' },
  vencidos: { label: 'Vencidos a recuperar', icon: 'alert', msg: 'vencido', hint: 'Vencieron en los últimos 60 días y no han renovado. Una oferta de regreso funciona muy bien.' },
  deuda: { label: 'Con deuda', icon: 'dollar', msg: 'deuda', hint: 'Socios con saldo pendiente de abonos o créditos.' },
  inactivos: { label: 'Dejaron de venir', icon: 'run', msg: 'inactivo', hint: 'Tienen plan vigente pero no vienen hace 10 días o más: riesgo alto de no renovar.' },
  cumple: { label: 'Cumpleaños', icon: 'trophy', msg: 'cumple', hint: 'Un saludo a tiempo fideliza más que cualquier descuento.' }
};

export function mount(el, { params = {} }) {
  let tab = params.tab || 'por_vencer';
  let range = 7;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Renovaciones y cobranza</h1><p class="view-sub">Retén a tus socios: avisa a tiempo, recupera a los que se fueron y cobra lo pendiente.</p></div>
      <div class="view-actions"><button class="btn btn-success" id="rt-all">${icon('whatsapp')} Avisar a todos (uno por uno)</button></div></div>
    <div class="kpis" id="rt-k"></div>
    <div class="card card-flush"><div class="tabs" id="rt-tabs" style="padding:0 12px" data-tour="ret-tabs"></div><div id="rt-body" style="padding:14px 16px"></div></div>`;
  const $ = (s) => el.querySelector(s);

  const lists = () => ({
    por_vencer: store.expiringIn(range),
    vencidos: store.expiredWithin(60).filter((m) => !['activo', 'por_vencer', 'pendiente', 'congelado'].includes(memberStatus(m))),
    deuda: store.debtors,
    inactivos: store.atRisk(10),
    cumple: store.birthdaysToday
  });

  function kpis(L) {
    const lost = L.vencidos.length; const exp = store.expiringIn(30).length;
    const projected = store.expiringIn(30).reduce((a, m) => a + (Number(store.plan(m.membership?.planId)?.price) || Number(m.membership?.price) || 0), 0);
    $('#rt-k').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Vencen en 30 días</span><span class="kpi-icon tone-warning">${icon('clock')}</span></div><div class="kpi-value">${exp}</div><div class="kpi-sub">≈ ${usd(projected)} en renovaciones</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">A recuperar</span><span class="kpi-icon tone-danger">${icon('alert')}</span></div><div class="kpi-value">${lost}</div><div class="kpi-sub">vencidos últimos 60 días</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-violet">${icon('dollar')}</span></div><div class="kpi-value">${usd(store.totalDebt)}</div><div class="kpi-sub">${L.deuda.length} socio(s)</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">En riesgo</span><span class="kpi-icon tone-info">${icon('run')}</span></div><div class="kpi-value">${L.inactivos.length}</div><div class="kpi-sub">no vienen hace +10 días</div></div>`;
  }

  function render() {
    const L = lists();
    kpis(L);
    $('#rt-tabs').innerHTML = Object.entries(TABS).map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${icon(t.icon)} ${t.label} <span class="badge badge-neutral">${L[k].length}</span></button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); });
    const list = L[tab];
    const T = TABS[tab];
    const t = todayKey();
    $('#rt-body').innerHTML = `<div class="between mb row-wrap" style="gap:8px"><p class="small muted" style="margin:0">${T.hint}</p>${tab === 'por_vencer' ? `<div class="chips">${[3, 7, 15, 30].map((d) => `<button class="chip ${range === d ? 'on' : ''}" data-r="${d}">${d} días</button>`).join('')}</div>` : ''}</div>` + (list.length ? `<div class="list">${list.map((m) => {
      const ms = m.membership; const contacted = m.lastContact?.kind === T.msg && daysBetween(m.lastContact.at.slice(0, 10), t) <= 7;
      const info = tab === 'por_vencer' ? (() => { const d = daysBetween(t, ms.end); return `<b class="${d <= 1 ? 'text-danger' : 'text-warning'}">${d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `Vence en ${d} días`}</b> · ${fmtDate(ms.end)}`; })()
        : tab === 'vencidos' ? `Venció hace ${daysBetween(ms.end, t)} día(s) · ${esc(ms.planName)}`
          : tab === 'deuda' ? `<b class="text-danger">Debe ${usd(m.balance)}</b> · ${membershipLine(m)}`
            : tab === 'inactivos' ? `Última visita: ${m.lastCheckinAt ? fmtAgo(m.lastCheckinAt) : 'nunca'} · ${membershipLine(m)}`
              : `Cumple ${m.birthDate ? new Date().getFullYear() - Number(m.birthDate.slice(0, 4)) : ''} años hoy 🎂`;
      return `<div class="list-item">${avatar(m)}<div class="grow" style="min-width:0;cursor:pointer" data-open="${m.id}"><b class="ellipsis">${esc(m.name)}</b><div class="t-sub">${info}</div>${contacted ? `<div class="t-sub text-success">${icon('check')} Avisado ${fmtAgo(m.lastContact.at)}</div>` : ''}</div>
        <span class="hide-sm">${statusBadge(memberStatus(m, t))}</span>
        <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn btn-success btn-sm" data-wa="${m.id}" title="WhatsApp">${icon('whatsapp')}</button>${tab === 'deuda' ? `<button class="btn btn-primary btn-sm" data-pay="${m.id}">Cobrar</button>` : tab !== 'cumple' && tab !== 'inactivos' ? `<button class="btn btn-primary btn-sm" data-sell="${m.id}">Renovar</button>` : ''}</div></div>`;
    }).join('')}</div>` : emptyState(T.icon, tab === 'deuda' ? 'Nadie debe nada 🎉' : tab === 'cumple' ? 'Nadie cumple años hoy' : 'Todo al día', ''));
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { range = Number(b.dataset.r); render(); });
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openMember(b.dataset.open));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => contact(store.member(b.dataset.wa), T.msg));
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => { const { payDebtModal } = await import('../membership.js'); payDebtModal(store.member(b.dataset.pay)); });
    el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = async () => { const { sellModal } = await import('../membership.js'); sellModal(store.member(b.dataset.sell)); });
    hydratePhotos($('#rt-body'));
  }

  const contact = (m, kind, extra = '') => {
    if (!m) return;
    const days = m.lastCheckinAt ? daysBetween(m.lastCheckinAt.slice(0, 10), todayKey()) : '';
    waMember(kind, { member: m, extra: kind === 'inactivo' ? String(days || '') : extra });
    store.save('members', m.id, { lastContact: { kind, at: nowISO() } }).catch(() => {});
  };

  $('#rt-all').onclick = () => {
    const list = lists()[tab].filter((m) => m.phone);
    if (!list.length) { toast('Nadie en esta lista tiene teléfono registrado.', 'warning'); return; }
    const kind = TABS[tab].msg;
    let i = 0;
    const md = openModal({
      title: `Avisar: ${TABS[tab].label}`, sub: `${list.length} socio(s) con teléfono · se abre WhatsApp con el mensaje listo`, size: 'md',
      body: '<div data-b></div>', footer: `<button class="btn btn-secondary" data-close>Terminar</button><button class="btn btn-ghost" data-skip>Saltar</button><button class="btn btn-success" data-send>${icon('whatsapp')} Abrir WhatsApp</button>`
    });
    const draw = () => {
      const m = list[i];
      if (!m) { md.close(); toast('Listo: lista completa'); return; }
      md.el.querySelector('[data-b]').innerHTML = `<div class="row mb">${avatar(m)}<div><b>${esc(m.name)}</b><div class="t-sub">${i + 1} de ${list.length} · ${esc(m.phone)}</div></div></div><div class="progress mb"><i style="width:${(i / list.length) * 100}%"></i></div><pre class="wa-preview">${esc(memberMessage(kind, { member: m, extra: kind === 'inactivo' ? String(m.lastCheckinAt ? daysBetween(m.lastCheckinAt.slice(0, 10), todayKey()) : '') : '' }))}</pre>`;
      hydratePhotos(md.el);
    };
    md.el.querySelector('[data-send]').onclick = () => { contact(list[i], kind); i++; draw(); };
    md.el.querySelector('[data-skip]').onclick = () => { i++; draw(); };
    draw();
  };

  render();
  const off = store.on('*', (e) => { if (e === 'members' || e === 'settings') render(); });
  return () => off();
}
