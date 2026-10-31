// Sano Gym — Control de acceso: resultado de la entrada, pase diario y escáner QR
import { store, memberStatus, statusBadge } from './store.js';
import { checkAccess, registerCheckin, sellMembership, toMin } from './ops.js';
import { openModal, esc, usd, toast, setBusy, fmtDate, todayKey, loc } from './utils.js';
import { icon } from './icons.js';
import { avatar, hydratePhotos, memberPhoto } from './member.js';
import { requirePin } from './auth.js';
import { membershipLine } from './membership.js';

/** Tarjeta grande con el resultado del acceso */
export function accessCardHTML(m, r, { compact = false } = {}) {
  const cls = r.level === 'deny' ? 'deny' : r.level === 'warn' ? 'warn' : 'ok';
  const ms = m?.membership;
  return `<div class="access ${cls} ${compact ? 'compact' : ''}">
    <div class="access-top"><span class="access-ic">${icon(cls === 'deny' ? 'x' : cls === 'warn' ? 'alert' : 'check')}</span><div><div class="access-title">${cls === 'deny' ? 'ACCESO DENEGADO' : cls === 'warn' ? 'ADELANTE, CON AVISO' : 'ACCESO PERMITIDO'}</div><div class="access-time">${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div></div></div>
    ${m ? `<div class="access-who">${avatar(m, 'avatar-xl')}<div class="grow" style="min-width:0"><div class="access-name">${esc(m.name)}</div><div class="t-sub">${esc(m.number)}${m.idDoc ? ' · ' + esc(m.idDoc) : ''}</div><div class="mt-xs">${statusBadge(memberStatus(m))}</div></div></div>
    ${ms ? `<div class="access-plan"><b>${esc(ms.planName)}</b><span>${membershipLine(m, false)}</span><span class="faint">Vigencia ${fmtDate(ms.start)} al ${fmtDate(ms.end)}</span></div>` : ''}` : ''}
    ${r.reasons.length ? `<ul class="access-list deny">${r.reasons.map((x) => `<li>${icon('x')}${esc(x)}</li>`).join('')}</ul>` : ''}
    ${r.notes.length ? `<ul class="access-list">${r.notes.map((x) => `<li>${icon('info')}${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/**
 * Flujo completo de entrada desde la recepción: evalúa, registra y muestra el resultado.
 * Si se deniega, ofrece renovar, vender pase diario o autorizar con PIN.
 */
export async function doCheckin(m, { via = 'recepcion', auto = false } = {}) {
  if (!m) return null;
  const r = checkAccess(m);
  let res = null;
  if (r.level !== 'deny') res = await registerCheckin(m, { via, check: r });
  else res = await registerCheckin(m, { via, check: r }); // queda registrado el intento rechazado
  const fresh = store.member(m.id) || m;
  return new Promise((resolve) => {
    const md = openModal({
      size: 'md',
      body: accessCardHTML(fresh, r),
      footer: r.level === 'deny'
        ? `<button class="btn btn-ghost" data-force>${icon('unlock')} Autorizar (PIN)</button><span class="grow"></span>${fresh.membership?.kind !== 'pase' ? `<button class="btn btn-secondary" data-pass>${icon('ticket')} Pase diario</button>` : ''}<button class="btn btn-primary" data-renew>${icon('refresh')} Renovar</button>`
        : `<button class="btn btn-secondary" data-open>${icon('user')} Ver ficha</button>${(Number(fresh.balance) || 0) > 0.009 ? `<button class="btn btn-secondary" data-debt>${icon('dollar')} Cobrar deuda</button>` : ''}<button class="btn btn-primary" data-close autofocus>Listo</button>`,
      onClose: () => resolve(res)
    });
    hydratePhotos(md.el);
    const q = (s) => md.el.querySelector(s);
    q('[data-open]')?.addEventListener('click', async () => { md.close(); const { openMember } = await import('./member.js'); openMember(fresh.id); });
    q('[data-debt]')?.addEventListener('click', async () => { md.close(); const { payDebtModal } = await import('./membership.js'); payDebtModal(fresh); });
    q('[data-renew]')?.addEventListener('click', async () => {
      md.close();
      const { sellModal } = await import('./membership.js');
      const out = await sellModal(fresh);
      if (out?.member) setTimeout(() => doCheckin(store.member(fresh.id) || out.member, { via }), 300);
    });
    q('[data-pass]')?.addEventListener('click', async () => {
      md.close();
      const pase = store.activePlans.find((p) => p.kind === 'pase');
      if (!pase) { toast('Crea un plan de tipo “Pase diario” en Configuración.', 'warning'); return; }
      const { sellModal } = await import('./membership.js');
      const out = await sellModal(fresh, { planId: pase.id });
      if (out?.member) setTimeout(() => doCheckin(store.member(fresh.id) || out.member, { via }), 300);
    });
    q('[data-force]')?.addEventListener('click', async () => {
      if (!(await requirePin('Autorizar la entrada'))) return;
      await registerCheckin(fresh, { via, force: true, check: r, note: 'Autorizado por el personal' });
      md.close(); toast(`Entrada autorizada: ${fresh.name}`, 'warning');
    });
    if (auto && r.level === 'ok') setTimeout(() => md.close(), 3500);
  });
}

/** Visitante: registra rápido, le vende el pase diario y lo deja entrar */
export async function guestPass() {
  const pase = store.activePlans.find((p) => p.kind === 'pase');
  if (!pase) { toast('Crea un plan de tipo “Pase diario” en Configuración › Planes.', 'warning'); return; }
  const m = openModal({
    title: 'Pase diario / visitante', sub: `${esc(pase.name)} · ${usd(pase.price)}`, size: 'sm',
    body: `<form class="stack" data-f><div class="field"><label>Nombre y apellido *</label><input class="input" name="name" autofocus></div>
      <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc"></div>
      <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel"></div>
      <p class="hint" style="margin:0">Queda registrado como socio: si vuelve, ya tienes sus datos para inscribirlo.</p><div class="error-msg" data-err></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('ticket')} Cobrar pase</button>`
  });
  const F = m.el.querySelector('[data-f]').elements;
  m.el.querySelector('[data-ok]').onclick = async () => {
    const name = F.name.value.trim();
    if (!name) { m.el.querySelector('[data-err]').textContent = 'Escribe el nombre.'; return; }
    const ex = F.idDoc.value.trim() && store.findMember(F.idDoc.value.trim());
    m.close();
    const { openPay } = await import('./pay.js');
    const { printReceipt } = await import('./shared.js');
    const out = await openPay({
      title: 'Pase diario', sub: esc(name), amount: Number(pase.price) || 0, printLabel: 'Imprimir recibo',
      onConfirm: async (res) => { const r = await sellMembership({ member: ex || { name, idDoc: F.idDoc.value, phone: F.phone.value, tags: ['Visitante'] }, plan: pase, start: todayKey(), enroll: false, payments: res.payments }); if (res.print && r.sale) printReceipt(r.sale); return r; }
    });
    if (out?.member) setTimeout(() => doCheckin(store.member(out.member.id) || out.member), 400);
  };
}

// ======================================================================
// ESCÁNER QR CON LA CÁMARA (BarcodeDetector; los lectores USB escriben el código + Enter)
// ======================================================================
export const cameraScanSupported = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
export function scanQR({ title = 'Escanear carnet' } = {}) {
  return new Promise((resolve) => {
    let stream = null; let stop = false; let found = null;
    const m = openModal({
      title, sub: 'Apunta la cámara al código QR del carnet', size: 'md',
      body: `<div class="scan-box"><video playsinline muted></video><div class="scan-frame"></div></div><div class="error-msg mt" data-err></div>`,
      footer: '<button class="btn btn-secondary" data-close>Cancelar</button>',
      onClose: () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); resolve(found); }
    });
    const video = m.el.querySelector('video');
    (async () => {
      try {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; await video.play();
        const loop = async () => {
          if (stop) return;
          try { const codes = await det.detect(video); if (codes[0]?.rawValue) { found = codes[0].rawValue; m.close(); return; } } catch (_) {}
          setTimeout(loop, 180);
        };
        loop();
      } catch (e) { m.el.querySelector('[data-err]').textContent = 'No se pudo abrir la cámara: ' + (e.message || e); }
    })();
  });
}
export { memberPhoto, toMin };
