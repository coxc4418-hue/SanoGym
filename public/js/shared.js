// Sano Gym — Componentes compartidos: país y moneda, QR, WhatsApp al socio e impresión
import { store, memberStatus, daysBetween } from './store.js';
import { openModal, toast, num, esc, fmtDateTime, fmtDate, setBusy, usd, bs, methodLabel, qtyFmt, printHTML, todayKey, waLink, COUNTRIES, loc, flagImg, fmtTime } from './utils.js';
import { icon } from './icons.js';

export const APP_NAME = 'Sano Gym';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa Sano Gym para mi gimnasio. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// PAÍS DE TRABAJO (se elige una sola vez, al entrar por primera vez)
// ======================================================================
/** Selector de país. force: no se puede cerrar sin elegir. Resuelve con el código del país. */
export function openCountryPicker({ force = false } = {}) {
  return new Promise((resolve) => {
    let picked = store.settings.country || '';
    let cur = store.settings.currency || '';
    const list = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    const m = openModal({
      title: force ? '¿En qué país está tu gimnasio?' : 'País y moneda', size: 'md', dismissible: !force,
      sub: 'Según el país, Sano Gym trabaja con su moneda, sus formas de pago y el código telefónico para WhatsApp.',
      body: `<div class="stack"><label class="search"><svg></svg><input data-q placeholder="Buscar país…" autocomplete="off"></label><div class="country-grid" data-l></div><div data-cur></div><div class="error-msg" data-err></div></div>`,
      footer: `${force ? '' : '<button class="btn btn-secondary" data-close>Cancelar</button>'}<button class="btn btn-primary btn-lg" data-ok disabled>Continuar</button>`,
      onClose: () => resolve(picked && store.settings.country === picked ? picked : null)
    });
    m.el.querySelector('.search svg').outerHTML = icon('search');
    const draw = (qv = '') => {
      const t = qv.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      m.el.querySelector('[data-l]').innerHTML = list.filter(([, c]) => !t || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)).map(([k, c]) =>
        `<button type="button" class="country ${picked === k ? 'on' : ''}" data-c="${k}"><span class="flag">${flagImg(k, 24)}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.curName)} · ${esc(c.sym)}</small></span></button>`).join('');
      m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { picked = b.dataset.c; cur = COUNTRIES[picked].cur; draw(m.el.querySelector('[data-q]').value); });
      const c = COUNTRIES[picked];
      m.el.querySelector('[data-cur]').innerHTML = c ? `<div class="card stack" style="padding:12px 14px"><div class="row" style="gap:10px"><span class="flag">${flagImg(picked, 30)}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">Formas de pago: Efectivo, tarjetas, transferencia${(c.extra || []).length ? ' y otras locales' : ''} · WhatsApp +${esc(c.dial)}</div></div></div>
        ${c.alt ? `<div class="field"><label>Moneda con la que cobras</label><div class="seg seg-block">${[[c.cur, c.curName + ' (' + c.sym + ')'], [c.alt.cur, c.alt.curName + ' (' + c.alt.sym + ')']].map(([k, l]) => `<button type="button" data-mc="${k}" class="${cur === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>` : `<div class="small">Moneda: <b>${esc(c.curName)} (${esc(c.sym)})</b></div>`}
        ${store.settings.country && store.settings.country !== picked ? `<div class="vital-alert warning">Los montos ya registrados no se convierten: revisa los precios de los planes después de cambiar de país.</div>` : ''}</div>` : '';
      m.el.querySelectorAll('[data-mc]').forEach((b) => b.onclick = () => { cur = b.dataset.mc; draw(m.el.querySelector('[data-q]').value); });
      m.el.querySelector('[data-ok]').disabled = !picked;
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      if (!picked) return;
      setBusy(e.currentTarget, true, 'Guardando…');
      try { await store.setCountry(picked, cur); toast(`Listo: trabajarás en ${loc().curName} (${loc().sym})`); m.close(); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    draw();
  });
}

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
/** Imagen (data URL) con el código QR del texto */
export async function qrDataURL(text, cell = 4) {
  try {
    const q = await loadQR();
    const qr = q(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL SOCIO
// ======================================================================
const CARD_URL = (m) => (m?.cardCode ? `https://sano-gym.web.app/carnet/${m.cardCode}` : '');
export function memberMessage(kind, { member = {}, booking = null, extra = '', evalTxt = '' } = {}) {
  const name = String(member.name || booking?.memberName || '').split(' ')[0];
  const biz = store.businessName;
  const ms = member.membership || {};
  const addr = store.settings.address ? `\n📍 ${store.settings.address}` : '';
  const card = CARD_URL(member);
  const h = `Hola ${name} 👋, te escribimos de *${biz}*.`;
  const left = ms.end ? daysBetween(todayKey(), ms.end) : null;
  const T = {
    bienvenida: () => `¡Bienvenido a *${biz}*, ${name}! 💪🎉\n\nTu plan *${ms.planName || ''}* está activo hasta el *${fmtDate(ms.end)}*${ms.kind === 'sesiones' ? ` (${ms.visitsLeft} sesiones)` : ''}.${card ? `\n\n📲 Tu carnet digital (muéstralo en recepción): ${card}` : ''}${addr}\n\n${store.settings.rules ? '📋 ' + store.settings.rules + '\n\n' : ''}¡A darlo todo!`,
    renovacion: () => `${h}\n\n✅ ¡Gracias por renovar! Tu plan *${ms.planName || ''}* ahora vence el *${fmtDate(ms.end)}*.${card ? `\nTu carnet: ${card}` : ''}\n\n¡Seguimos entrenando! 💪`,
    por_vencer: () => `${h}\n\n⏰ Tu plan *${ms.planName || ''}* vence ${left === 0 ? '*hoy*' : left === 1 ? '*mañana*' : `el *${fmtDate(ms.end)}* (en ${left} días)`}.\n\nRenueva a tiempo y no pierdas el ritmo que llevas. Puedes pagar en recepción o por transferencia. ¿Te lo dejamos listo?`,
    vencido: () => `${h}\n\n¡Te extrañamos en el gym! 🏋️ Tu plan venció el ${fmtDate(ms.end)}.\n\nVuelve esta semana y retoma tus objetivos; con constancia los resultados llegan. ¿Te reservamos tu renovación?${extra ? `\n\n🎁 ${extra}` : ''}`,
    inactivo: () => `${h}\n\nHace ${extra || 'unos'} días que no te vemos por el gym 😅. ¿Todo bien?\n\nTu plan sigue activo hasta el ${fmtDate(ms.end)}. Aunque sea una sesión corta, ¡vuelve! Si necesitas, ajustamos tu rutina u horario. 💪`,
    deuda: () => `${h}\n\nTe recordamos que tienes un saldo pendiente de *${usd(member.balance || extra)}* de tu membresía. Puedes cancelarlo en recepción o por transferencia. ¡Gracias!`,
    cumple: () => `🎉 ¡Feliz cumpleaños, ${name}! 🎂\n\nTodo el equipo de *${biz}* te desea un año lleno de salud, energía y nuevas marcas personales. 💪`,
    rutina: () => `${h}\n\n📋 Tu rutina *${extra || ''}* ya está lista.${card ? `\nLa tienes siempre en tu carnet digital: ${card}` : ''}\n\nRecuerda calentar antes de empezar y pedir ayuda si tienes dudas con algún ejercicio. 💪`,
    clase: () => `${h}\n\n✅ Tienes reservada la clase de *${booking?.className}* el ${booking?.date === todayKey() ? '*hoy*' : fmtDate(booking?.date)} a las *${booking?.time}*${booking?.trainer ? ` con ${booking.trainer}` : ''}.${addr}\n\nSi no puedes asistir, avísanos para liberar el cupo.`,
    cupo: () => `${h}\n\n🎉 ¡Se liberó un cupo! Ya tienes lugar en *${booking?.className}* el ${booking?.date === todayKey() ? 'hoy' : fmtDate(booking?.date)} a las *${booking?.time}*. ¡Te esperamos!`,
    progreso: () => `${h}\n\n📊 *Resultados de tu evaluación*\n${evalTxt}\n\n¡Sigue así! La constancia es la clave. 💪`,
    libre: () => `${h}\n\n${extra || ''}`
  };
  return (T[kind] || T.libre)();
}
export function waMember(kind, ctx = {}) {
  const phone = ctx.member?.phone || ctx.booking?.memberPhone || '';
  const text = memberMessage(kind, ctx);
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
/** Mensaje sugerido según el estado del socio */
export function suggestedMessage(m) {
  const st = memberStatus(m);
  if ((Number(m.balance) || 0) > 0.009) return 'deuda';
  return { por_vencer: 'por_vencer', vencido: 'vencido', agotado: 'vencido', sin_plan: 'vencido' }[st] || 'libre';
}

// ======================================================================
// IMPRESIÓN: recibos y documentos genéricos
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
function ticketCSS(fmt) {
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  return `@page { margin: ${fmt === 'carta' ? '12mm' : '2mm'}; }
    body { font-family: ${fmt === 'carta' ? 'Arial, Helvetica, sans-serif' : "'Courier New', monospace"}; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; white-space: nowrap; padding-left: 6px; }
    .big { font-size: 1.25em; font-weight: bold; } .sm { font-size: .85em; }`;
}
function headerHTML() {
  const s = store.settings;
  return `<div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">${esc(loc().tax)}: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}`;
}

/** Recibo de cobro (ticket o carta) */
export function receiptHTML(sale) {
  const s = store.settings;
  const ivaPct = Number(s.iva) || 0;
  const iva = ivaPct > 0 ? (sale.total - sale.total / (1 + ivaPct / 100)) : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td colspan="2">${esc(methodLabel(p.method))}</td><td class="r">${usd(p.amount)}</td></tr>`).join('');
  const m = sale.memberId ? store.member(sale.memberId) : null;
  return `<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(sale.number)}</title><style>${ticketCSS(s.receiptFormat)}</style></head><body>
    ${headerHTML()}
    <div class="hr"></div>
    <div class="c big">${esc(s.docTitle || 'RECIBO')}</div>
    <div class="c b">N° ${esc(sale.number)}</div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Socio: ${esc(sale.memberName || 'Cliente de mostrador')}${sale.memberNumber ? ` (${esc(sale.memberNumber)})` : ''}</div>
    ${sale.memberIdDoc ? `<div>${esc(loc().id)}: ${esc(sale.memberIdDoc)}</div>` : ''}
    ${sale.status === 'voided' ? '<div class="c b">*** DOCUMENTO ANULADO ***</div>' : ''}
    <div class="hr"></div>
    <table>${(sale.items || []).map((it) => `<tr><td colspan="2" style="padding-top:3px">${qtyFmt(it.qty)} x ${esc(it.name)}</td><td class="r">${usd(it.total ?? it.price * it.qty)}</td></tr>`).join('')}</table>
    <div class="hr"></div>
    <table>
      <tr><td colspan="2">Subtotal</td><td class="r">${usd(sale.subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td colspan="2">Descuento</td><td class="r">-${usd(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td colspan="2">TOTAL</td><td class="r">${usd(sale.total)}</td></tr>
      ${iva > 0.009 ? `<tr><td colspan="2">Impuesto ${num(ivaPct, 0)}% incluido</td><td class="r">${usd(iva)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${usd(sale.changeUSD)}</div>` : ''}
    ${m?.membership && sale.membershipId === m.membership.id ? `<div class="hr"></div><div class="b">Plan: ${esc(m.membership.planName)}</div><div>Vigencia: ${fmtDate(m.membership.paidFrom || m.membership.start)} al ${fmtDate(m.membership.end)}</div>${(Number(m.balance) || 0) > 0.009 ? `<div class="b">Saldo pendiente: ${usd(m.balance)}</div>` : ''}` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por entrenar con nosotros!')}</div>
    <div class="c sm" style="margin-top:4px">Sano Gym</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

/** Documento imprimible genérico (reportes, cierres, listas, rutinas) */
export function printDoc(title, inner, { accent = '#4d7c0f' } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: ${accent}; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; } .c { text-align: center; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
    .day { page-break-inside: avoid; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">Sano Gym — Gestión inteligente para tu gimnasio</p>
  </body></html>`);
}

export function notifyLowStock(list) {
  if (!list?.length) return;
  const names = list.slice(0, 3).map((i) => `${i.name} (${qtyFmt(i.stock)})`).join(', ');
  toast(`Productos por agotarse: ${names}${list.length > 3 ? ` y ${list.length - 3} más` : ''}`, 'warning', 6000);
}

export { usd, bs, fmtTime };
