// Sano Gym — Kiosco de acceso: pantalla de autoservicio en la entrada (tablet o PC con lector QR)
import { store } from '../store.js';
import { checkAccess, registerCheckin } from '../ops.js';
import { esc, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { hydratePhotos, avatar } from '../member.js';
import { requirePin } from '../auth.js';
import { scanQR, cameraScanSupported } from '../access.js';
import { beep } from './checkin.js';
import { membershipLine } from '../membership.js';

const QUOTES = [
  'La constancia vence al talento cuando el talento no es constante.', 'Un entrenamiento a la vez.', 'El dolor de hoy es la fuerza de mañana.',
  'No cuentes los días, haz que los días cuenten.', 'Tu único rival es quien fuiste ayer.', 'Disciplina es elegir entre lo que quieres ahora y lo que más quieres.',
  'El cuerpo logra lo que la mente cree.', 'Pequeños progresos siguen siendo progresos.', 'Hoy también cuenta.'
];

export function mount(el, { navigate }) {
  let code = '';
  let resetT = null;
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  el.innerHTML = `<div class="kiosk">
    <button class="kiosk-exit" id="k-exit" title="Salir del kiosco">${icon('lock')}</button>
    <div class="kiosk-side">
      <div class="kiosk-brand"><img src="/assets/logo.svg" alt=""><div><b>${esc(store.businessName)}</b><span>Control de acceso</span></div></div>
      <div class="kiosk-clock" id="k-clock"></div>
      <div class="kiosk-date" id="k-date"></div>
      <p class="kiosk-quote">“${esc(quote)}”</p>
      <div class="kiosk-cap" id="k-cap"></div>
    </div>
    <div class="kiosk-main" id="k-main"></div>
    <input id="k-in" class="kiosk-hidden" autocomplete="off" inputmode="none" aria-label="Lector de carnet">
  </div>`;
  const $ = (s) => el.querySelector(s);
  const input = $('#k-in');

  function idle() {
    clearTimeout(resetT); code = '';
    $('#k-main').innerHTML = `<div class="kiosk-idle">
      <div class="kiosk-scan">${icon('scan')}</div>
      <h1>¡Bienvenido!</h1><p>Acerca tu <b>carnet</b> (QR) al lector o escribe tu <b>número de documento</b> o <b>N° de socio</b>.</p>
      <div class="kiosk-display" id="k-disp">&nbsp;</div>
      <div class="kiosk-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => `<button data-k="${k}" class="${k === 'ok' ? 'ok' : k === 'del' ? 'del' : ''}">${k === 'del' ? icon('chevronLeft') : k === 'ok' ? icon('check') : k}</button>`).join('')}</div>
      ${cameraScanSupported() ? `<button class="btn btn-secondary btn-lg mt" id="k-cam">${icon('camera')} Escanear con la cámara</button>` : ''}
    </div>`;
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'del') code = code.slice(0, -1);
      else if (k === 'ok') { submit(code); return; }
      else if (code.length < 14) code += k;
      $('#k-disp').innerHTML = code ? esc(code) : '&nbsp;';
      input.focus();
    });
    $('#k-cam')?.addEventListener('click', async () => { const v = await scanQR(); if (v) submit(v); else input.focus(); });
    input.value = ''; input.focus();
  }

  function show(m, r) {
    const ok = r.level !== 'deny';
    const ms = m?.membership;
    const birthday = m?.birthDate && m.birthDate.slice(5) === new Date().toISOString().slice(5, 10);
    $('#k-main').innerHTML = `<div class="kiosk-res ${r.level}">
      <div class="kiosk-res-ic">${icon(ok ? (r.level === 'warn' ? 'alert' : 'check') : 'x')}</div>
      ${m ? `<div class="kiosk-who">${avatar(m, 'avatar-xl')}<div><h1>${ok ? `¡Hola, ${esc(m.name.split(' ')[0])}!` : esc(m.name.split(' ')[0])}</h1>${ms ? `<p>${membershipLine(m)}</p>` : ''}</div></div>` : ''}
      <h2>${ok ? (birthday ? '¡Feliz cumpleaños! 🎂 Que lo disfrutes entrenando' : r.level === 'warn' ? 'Adelante, pasa por recepción cuando puedas' : '¡A entrenar! 💪') : 'Acércate a recepción, por favor'}</h2>
      ${r.reasons.length ? `<ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${ok && r.notes.length ? `<ul class="notes">${r.notes.filter((x) => !/cumple/i.test(x)).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${ok && ms?.end ? `<p class="faint">Tu plan vence el ${fmtDate(ms.end)}</p>` : ''}
    </div>`;
    hydratePhotos($('#k-main'));
    clearTimeout(resetT);
    resetT = setTimeout(idle, ok ? 4500 : 7000);
    input.value = ''; input.focus();
  }

  let busy = false;
  async function submit(raw) {
    const v = String(raw || '').trim();
    if (!v || busy) return;
    busy = true;
    try {
      const m = store.findMember(v);
      if (!m) { beep(false); show(null, { level: 'deny', reasons: ['No encontramos ese carnet o documento.'], notes: [] }); return; }
      const r = checkAccess(m);
      await registerCheckin(m, { via: 'kiosco', check: r });
      beep(r.level !== 'deny');
      show(store.member(m.id) || m, r);
    } finally { busy = false; }
  }

  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; submit(v); } };
  const keepFocus = () => { if (!document.querySelector('.modal-backdrop')) setTimeout(() => input.focus(), 0); };
  document.addEventListener('click', keepFocus);
  $('#k-exit').onclick = async () => { if (await requirePin('Salir del modo kiosco', { always: true })) navigate('recepcion'); else input.focus(); };

  const clock = () => {
    const d = new Date();
    $('#k-clock').textContent = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    $('#k-date').textContent = d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    const cap = Number(store.access.capacity) || 0; const n = store.inside.length;
    $('#k-cap').innerHTML = `<span class="live-dot"></span> ${n} entrenando ahora${cap ? ` · aforo ${Math.round((n / cap) * 100)} %` : ''}`;
  };
  clock(); idle();
  const tick = setInterval(clock, 15000);
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (_) {}
  return () => { clearInterval(tick); clearTimeout(resetT); document.removeEventListener('click', keepFocus); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {} };
}
