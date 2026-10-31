// Sano Gym — Ventanas de membresía: inscribir / renovar, congelar, cobrar deuda y ajustar
import { store, memberStatus, statusBadge, daysBetween } from './store.js';
import { sellMembership, quoteMembership, suggestStart, needsEnroll, payBalance, freezeMembership, unfreezeMembership, adjustMembership } from './ops.js';
import { planDuration, pricePerDay, planEnd, PLAN_KINDS } from './gym.js';
import { openModal, esc, usd, num, parseNum, round2, toast, setBusy, fmtDate, todayKey, dayKey, addDays, fromKey, loc, confirmDialog } from './utils.js';
import { icon } from './icons.js';
import { openPay, showPaid } from './pay.js';
import { printReceipt, waMember } from './shared.js';
import { requirePin } from './auth.js';

const kindTag = (p) => p.kind === 'sesiones' ? `${p.visits} sesiones` : p.kind === 'pase' ? '1 día' : planDuration(p);

/** Inscribir o renovar. Devuelve el resultado de la venta o null. */
export async function sellModal(member = null, { planId = null, onDone = null } = {}) {
  if (!member) {
    const { pickMember } = await import('./member.js');
    member = await pickMember({ title: '¿A quién le vendes la membresía?', allowNew: true });
    if (!member) return null;
  }
  const plans = store.activePlans;
  if (!plans.length) { toast('Crea tus planes en Configuración › Planes y precios.', 'warning'); return null; }
  const cur = member.membership;
  const st = memberStatus(member);
  let plan = store.plan(planId) || plans.find((p) => p.id === cur?.planId && p.active !== false) || plans.find((p) => p.popular) || plans[0];
  let start = suggestStart(member);
  let enroll = needsEnroll(member);
  let discount = 0;
  let mode = 'full';
  let paidPart = 0;
  let trainerId = member.trainerId || '';
  const best = plans.filter((p) => p.kind === 'tiempo').reduce((a, p) => (!a || pricePerDay(p) < pricePerDay(a) ? p : a), null);

  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: cur && cur.status !== 'anulada' ? 'Renovar membresía' : 'Inscribir', size: 'xl',
      sub: `${esc(member.name || 'Socio nuevo')}${member.number ? ' · ' + esc(member.number) : ''}${cur ? ` · actual: ${esc(cur.planName)} (vence ${fmtDate(cur.end)})` : ''}`,
      body: `<div class="sell">
        <div class="sell-plans" data-plans></div>
        <div class="sell-side stack">
          <div class="form-grid">
            <div class="field"><label>Inicia</label><input class="input" type="date" data-start value="${start}"></div>
            <div class="field"><label>Vence</label><div class="input input-ro" data-end></div></div>
          </div>
          <div data-hint class="small muted"></div>
          <div class="field" data-tr-wrap hidden><label>Entrenador personal</label><select class="select" data-tr><option value="">— Sin asignar —</option>${store.activeTrainers.map((t) => `<option value="${t.id}" ${t.id === trainerId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
          <label class="check" data-en-wrap><input type="checkbox" data-enroll ${enroll ? 'checked' : ''}> <span>Cobrar inscripción (${usd(store.access.enrollFee)})</span></label>
          <div class="field"><label>Descuento</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input" data-disc inputmode="decimal" placeholder="0"></div></div>
          <div class="seg seg-block" data-mode><button type="button" data-md="full" class="on">Paga completo</button><button type="button" data-md="part">Abono</button><button type="button" data-md="credit">A crédito</button></div>
          <div class="field" data-part-wrap hidden><label>Abona ahora</label><div class="input-group"><span class="prefix">${esc(loc().sym)}</span><input class="input" data-part inputmode="decimal" placeholder="0"></div></div>
          <div class="summary-box" data-sum></div>
          <div class="error-msg" data-err></div>
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-success btn-lg" data-ok>${icon('check')} Continuar</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const $ = (q) => m.el.querySelector(q);

    function drawPlans() {
      $('[data-plans]').innerHTML = Object.entries(PLAN_KINDS).map(([k, kd]) => {
        const list = plans.filter((p) => p.kind === k);
        if (!list.length) return '';
        return `<div class="section-title">${kd.label}</div><div class="plan-grid">${list.map((p) => `<button type="button" class="plan-opt ${p.id === plan.id ? 'on' : ''}" data-p="${esc(p.id)}" style="--pc:${p.color || 'var(--brand)'}">
          ${p.id === best?.id ? '<span class="plan-flag">Mejor precio por día</span>' : p.popular ? '<span class="plan-flag">Más vendido</span>' : ''}
          <b>${esc(p.name)}</b><span class="plan-price">${usd(p.price)}</span><small>${esc(kindTag(p))}${p.kind === 'tiempo' ? ` · ${usd(pricePerDay(p))}/día` : ''}</small>
          <span class="plan-tags">${p.classes !== false ? '<i>Clases</i>' : ''}${p.personal ? '<i>Entrenador</i>' : ''}${p.timeFrom || p.timeTo ? `<i>${esc(p.timeFrom || '')}–${esc(p.timeTo || '')}</i>` : ''}${p.freezeDays ? `<i>Congela ${p.freezeDays} d</i>` : ''}</span>
        </button>`).join('')}</div>`;
      }).join('');
      m.el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { plan = plans.find((x) => x.id === b.dataset.p); if (plan.kind !== 'tiempo') start = todayKey(); else start = suggestStart(member); $('[data-start]').value = start; drawPlans(); calc(); });
    }

    function calc() {
      const q = quoteMembership({ member, plan, start, discount, enroll });
      $('[data-end]').textContent = fmtDate(q.end);
      $('[data-tr-wrap]').hidden = !plan.personal;
      $('[data-en-wrap]').hidden = plan.kind === 'pase' || !(Number(store.access.enrollFee) > 0);
      const hints = [];
      if (cur && cur.status !== 'anulada' && cur.end >= todayKey() && start > todayKey()) hints.push(`${icon('info')} Renovación anticipada: empieza al terminar su plan actual (${fmtDate(cur.end)}). No pierde días.`);
      if (st === 'vencido' && cur) hints.push(`${icon('clock')} Venció el ${fmtDate(cur.end)} (hace ${daysBetween(cur.end, todayKey())} días).`);
      if (plan.kind === 'sesiones') hints.push(`${icon('ticket')} ${plan.visits} sesiones para usar antes del ${fmtDate(q.end)}.`);
      if (plan.note) hints.push(`${icon('info')} ${esc(plan.note)}`);
      $('[data-hint]').innerHTML = hints.join('<br>');
      const pay = mode === 'full' ? q.total : mode === 'credit' ? 0 : Math.min(q.total, paidPart);
      $('[data-sum]').innerHTML = `
        <div class="summary-row"><span>${esc(plan.name)}</span><b>${usd(q.price)}</b></div>
        ${q.enrollFee ? `<div class="summary-row"><span>Inscripción</span><b>${usd(q.enrollFee)}</b></div>` : ''}
        ${q.discount ? `<div class="summary-row"><span>Descuento</span><b class="text-success">−${usd(q.discount)}</b></div>` : ''}
        <div class="summary-row sum-total"><span>Total</span><b>${usd(q.total)}</b></div>
        <div class="summary-row"><span>Paga ahora</span><b>${usd(pay)}</b></div>
        ${q.total - pay > 0.009 ? `<div class="summary-row"><span>Queda debiendo</span><b class="text-danger">${usd(q.total - pay)}</b></div>` : ''}`;
      $('[data-ok]').innerHTML = `${icon('check')} ${pay > 0.004 ? 'Cobrar ' + usd(pay) : 'Registrar a crédito'}`;
      return { q, pay };
    }

    $('[data-start]').onchange = (e) => { start = e.target.value || todayKey(); calc(); };
    $('[data-enroll]').onchange = (e) => { enroll = e.target.checked; calc(); };
    $('[data-disc]').oninput = (e) => { discount = round2(parseNum(e.target.value)); calc(); };
    $('[data-part]').oninput = (e) => { paidPart = round2(parseNum(e.target.value)); calc(); };
    $('[data-tr]').onchange = (e) => { trainerId = e.target.value; };
    m.el.querySelectorAll('[data-md]').forEach((b) => b.onclick = () => {
      mode = b.dataset.md;
      m.el.querySelectorAll('[data-md]').forEach((x) => x.classList.toggle('on', x === b));
      $('[data-part-wrap]').hidden = mode !== 'part';
      if (mode === 'part') setTimeout(() => $('[data-part]').focus(), 30);
      calc();
    });

    $('[data-ok]').onclick = async (e) => {
      const err = $('[data-err]'); err.textContent = '';
      const { q, pay } = calc();
      if (q.end < todayKey()) { err.textContent = 'Con esa fecha de inicio la membresía ya estaría vencida.'; return; }
      if (mode === 'part' && !(pay > 0)) { err.textContent = 'Indica cuánto abona ahora.'; return; }
      if (q.discount > 0 && !(await requirePin('Aplicar un descuento'))) return;
      if (pay < q.total - 0.009 && !(await requirePin('Vender con saldo pendiente'))) return;
      const args = { member, plan, start, discount, enroll, trainerId: trainerId || null };
      const finish = (out) => {
        done = true; m.close();
        resolve(out);
        afterSale(out, !!(cur && cur.status !== 'anulada'));
        onDone?.(out);
      };
      if (pay <= 0.004) {
        const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
        try { finish(await sellMembership({ ...args, paid: 0 })); } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
        return;
      }
      const out = await openPay({
        title: 'Cobrar membresía', sub: `${esc(member.name || '')} · ${esc(plan.name)}`, amount: pay, printLabel: 'Imprimir recibo',
        onConfirm: async (res) => { const r = await sellMembership({ ...args, paid: pay, payments: res.payments }); r.print = res.print; return r; }
      });
      if (out) finish(out);
    };
    drawPlans(); calc();
  });
}

function afterSale(out, renewal) {
  if (out.sale && out.print) printReceipt(out.sale);
  const mm = out.member;
  const msg = renewal ? 'renovacion' : 'bienvenida';
  const mo = openModal({
    size: 'sm',
    body: `<div class="center stack" style="padding:18px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('check')}</div>
      <div><div class="muted small">${renewal ? 'Membresía renovada' : '¡Socio inscrito!'}</div><div style="font-size:24px;font-weight:800;letter-spacing:-.02em">${esc(mm.name)}</div></div>
      <div>${esc(out.membership.planName)} · hasta el <b>${fmtDate(out.membership.end)}</b></div>
      ${out.balance > 0.009 ? `<div class="badge badge-danger" style="height:28px;font-size:13px">Queda debiendo ${usd(out.balance)}</div>` : ''}
      ${out.sale ? `<div class="small muted">Recibo ${esc(out.sale.number)} · ${usd(out.sale.received)}${out.sale.changeUSD > 0.009 ? ` · vuelto ${usd(out.sale.changeUSD)}` : ''}</div>` : ''}
    </div>`,
    footer: `${out.sale ? `<button class="btn btn-secondary" data-pr>${icon('print')} Recibo</button>` : ''}<button class="btn btn-secondary" data-card>${icon('card')} Carnet</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} WhatsApp</button><button class="btn btn-primary" data-close>Listo</button>`
  });
  mo.el.querySelector('[data-pr]')?.addEventListener('click', () => printReceipt(out.sale));
  mo.el.querySelector('[data-wa]').onclick = () => waMember(msg, { member: mm });
  mo.el.querySelector('[data-card]').onclick = () => import('./member.js').then((x) => x.printCard(mm));
}

/** Cobrar la deuda del socio (abono) */
export async function payDebtModal(member) {
  const bal = round2(Number(member.balance) || 0);
  if (!(bal > 0)) { toast('El socio no tiene deuda.', 'info'); return null; }
  return openPay({
    title: 'Cobrar deuda', sub: esc(member.name), amount: bal, editable: true, max: bal, printLabel: 'Imprimir recibo', confirmText: 'Abonar',
    onConfirm: async (res) => {
      const out = await payBalance(member, { amount: res.amount, payments: res.payments });
      if (res.print) printReceipt(out.sale);
      showPaid(out.sale, { title: 'Abono registrado', onPrint: () => printReceipt(out.sale) });
      return out;
    }
  });
}

/** Congelar la membresía (viaje, lesión, enfermedad): corre el vencimiento */
export async function freezeModal(member) {
  const ms = member.membership;
  if (!ms || ms.status === 'anulada') { toast('El socio no tiene membresía.', 'warning'); return null; }
  const t = todayKey();
  if (ms.frozenUntil && ms.frozenUntil >= t) {
    const unused = daysBetween(ms.frozenFrom && ms.frozenFrom > t ? ms.frozenFrom : t, ms.frozenUntil) + 1;
    if (!(await confirmDialog({ title: 'Reactivar membresía', message: `Está congelada hasta el <b>${fmtDate(ms.frozenUntil)}</b>. Si la reactivas hoy se devuelven <b>${unused} día(s)</b> no usados y el vencimiento queda en el ${fmtDate(dayKey(addDays(fromKey(ms.end), -unused)))}.`, confirmText: 'Reactivar' }))) return null;
    await unfreezeMembership(member); toast('Membresía reactivada'); return true;
  }
  const allowed = Math.max(0, (Number(ms.freezeDays) || 0) - (Number(ms.freezeUsed) || 0));
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: 'Congelar membresía', sub: `${esc(member.name)} · ${esc(ms.planName)} · vence ${fmtDate(ms.end)}`, size: 'sm',
      body: `<form class="stack" data-f>
        <div class="box small">${icon('snow')} Su plan permite <b>${allowed} día(s)</b> de congelamiento${ms.freezeUsed ? ` (ya usó ${ms.freezeUsed})` : ''}. Mientras esté congelada no podrá entrar y el vencimiento se corre esos días.</div>
        <div class="form-grid"><div class="field"><label>Desde</label><input class="input" type="date" name="from" value="${t}" min="${t}"></div>
        <div class="field"><label>Días</label><input class="input" name="days" inputmode="numeric" value="${Math.min(allowed || 7, 7)}"></div></div>
        <div class="field"><label>Motivo</label><select class="select" name="reason"><option>Viaje</option><option>Lesión</option><option>Enfermedad</option><option>Trabajo</option><option>Embarazo</option><option>Otro</option></select></div>
        <div class="summary-box" data-prev></div><div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('snow')} Congelar</button>`,
      onClose: () => resolve(ok)
    });
    const F = m.el.querySelector('[data-f]').elements;
    const prev = () => {
      const d = Math.round(parseNum(F.days.value));
      m.el.querySelector('[data-prev]').innerHTML = d > 0 ? `<div class="summary-row"><span>Congelada</span><b>${fmtDate(F.from.value)} al ${fmtDate(dayKey(addDays(fromKey(F.from.value || t), d - 1)))}</b></div><div class="summary-row"><span>Nuevo vencimiento</span><b>${fmtDate(dayKey(addDays(fromKey(ms.end), d)))}</b></div>${d > allowed ? `<div class="small text-warning">Supera lo que permite el plan: requiere PIN.</div>` : ''}` : '';
    };
    F.days.oninput = prev; F.from.onchange = prev; prev();
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const d = Math.round(parseNum(F.days.value));
      const force = d > allowed;
      if (force && !(await requirePin('Congelar más días de los permitidos'))) return;
      setBusy(e.currentTarget, true);
      try { await freezeMembership(member, { from: F.from.value || t, days: d, reason: F.reason.value, force }); ok = true; m.close(); toast('Membresía congelada'); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}

/** Ajuste manual del vencimiento o de las sesiones (con PIN) */
export async function adjustModal(member) {
  const ms = member.membership;
  if (!ms) { toast('El socio no tiene membresía.', 'warning'); return null; }
  if (!(await requirePin('Ajustar la membresía'))) return null;
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      title: 'Ajustar membresía', sub: `${esc(member.name)} · ${esc(ms.planName)}`, size: 'sm',
      body: `<form class="stack" data-f>
        <div class="field"><label>Vence</label><input class="input" type="date" name="end" value="${ms.end}"></div>
        ${ms.kind !== 'tiempo' ? `<div class="field"><label>Sesiones disponibles</label><input class="input" name="visits" inputmode="numeric" value="${ms.visitsLeft ?? 0}"></div>` : ''}
        <div class="field"><label>Motivo</label><input class="input" name="reason" placeholder="Ej.: compensación por mantenimiento" required></div>
        <div class="error-msg" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(ok)
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async () => {
      if (!F.reason.value.trim()) { m.el.querySelector('[data-err]').textContent = 'Indica el motivo del ajuste.'; return; }
      try { await adjustMembership(member, { end: F.end.value, visitsLeft: F.visits ? parseNum(F.visits.value) : null, reason: F.reason.value.trim() }); ok = true; m.close(); toast('Membresía ajustada'); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; }
    };
  });
}

/** Etiqueta corta del estado de la membresía para listas */
export function membershipLine(mb, withPlan = true) {
  const ms = mb.membership;
  if (!ms) return '<span class="faint">Sin membresía</span>';
  const t = todayKey();
  const d = daysBetween(t, ms.end);
  const st = memberStatus(mb, t);
  const when = st === 'congelado' ? `congelada hasta ${fmtDate(ms.frozenUntil)}` : d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `vence en ${d} d`;
  return `${withPlan ? esc(ms.planName) + ' · ' : ''}<span class="${d < 0 ? 'text-danger' : d <= 5 ? 'text-warning' : ''}">${when}</span>${ms.kind !== 'tiempo' ? ` · ${ms.visitsLeft ?? 0} ses.` : ''}`;
}
export { statusBadge };
