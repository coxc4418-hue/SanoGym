// Sano Gym — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a Sano Gym! 💪', text: 'En un minuto te mostramos cómo manejar tu gimnasio aquí: socios, entradas, membresías, clases, rutinas y caja. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetirlo desde el menú › Ayuda.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Recepción, socios, renovaciones, clases, rutinas, ventas, facturación, caja, tienda, reportes y configuración. Los números de colores son avisos: membresías por vencer, deudas y productos agotados.' },
      { route: 'inicio', sel: ['#sb-search', '#tb-search'], title: 'Búsqueda rápida', text: 'Encuentra a cualquier socio por nombre, documento, teléfono, N° de socio (S-0012) o código del carnet; o un recibo (F-000045). En la computadora: Ctrl + K.' },
      { route: 'inicio', sel: ['[data-tour="quick"]'], title: 'Accesos rápidos', text: 'Registra una entrada, inscribe a un socio nuevo o vende una membresía con un toque. Atajos: F1 recepción, F2 nuevo socio, F3 socios, F4 vender.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Tu gimnasio en vivo', text: 'Socios activos, cuántos están entrenando ahora frente al aforo, entradas de hoy, lo cobrado y las membresías que vencen esta semana.' },
      { route: 'inicio', sel: ['[data-tour="classes"]'], title: 'Clases de hoy', text: 'Spinning, Funcional, Yoga… con su instructor y cupos ocupados. Toca para ver la lista, pasar asistencia o agregar socios.' },
      { route: 'recepcion', sel: ['[data-tour="scan"]'], title: 'Recepción y control de acceso', text: 'Escanea el QR del carnet con un lector USB o la cámara, o escribe el documento o nombre. El sistema decide al instante: verde entra, amarillo entra con aviso (vence pronto, debe dinero, días de gracia) y rojo no entra, con el motivo y el botón para renovar ahí mismo.' },
      { route: 'recepcion', sel: ['[data-tour="inside"]'], title: 'Quién está dentro', text: 'Aforo en tiempo real y el registro de entradas del día, incluso las rechazadas: cada rechazo es una venta por hacer.' },
      { route: 'socios', sel: ['[data-tour="filters"]'], title: 'Socios', text: 'Filtra por vigentes, por vencer, vencidos, congelados, con deuda o los que dejaron de venir. Cada ficha tiene membresías, asistencia, clases, rutina, evaluaciones físicas, pagos y salud (PAR-Q).' },
      { route: 'renovaciones', sel: ['[data-tour="ret-tabs"]'], title: 'Renovaciones y cobranza', text: 'Tu tablero de retención: avisa por WhatsApp antes del vencimiento, recupera a los que se fueron, cobra deudas y felicita cumpleaños, con el mensaje ya escrito.' },
      { route: 'clases', sel: ['[data-tour="week"]'], title: 'Clases grupales', text: 'Horario semanal con cupos, reservas y lista de espera automática: si alguien cancela, el primero en espera toma el cupo y le avisas por WhatsApp.' },
      { route: 'cobrar', sel: ['[data-tour="pos-tabs"]', '#pos-grid'], title: 'Vender', text: 'Membresías (con inscripción, descuentos, abonos o crédito), servicios como toalla o locker y la tienda de suplementos y bebidas, que se descuenta del inventario.' },
      { route: 'cobrar', sel: ['#c-pay', '#cart-fab'], title: 'Formas de pago', text: 'Varias formas de pago a la vez (efectivo, tarjeta, transferencia y los medios de tu país) con cálculo del vuelto, todo en la moneda del país que elegiste.' },
      { route: 'caja', sel: ['.sb-nav [data-nav="reportes"]', '#view'], title: 'Reportes', text: 'Ingresos por plan, tasa de renovación, horas pico, ocupación de clases, comisiones de entrenadores y gastos. Protegidos con el PIN (en la demo: 1234).' },
      { route: 'caja', sel: ['.sb-foot [data-install]', '.topbar [data-install]'], title: 'Instala la app', text: 'Instálala en la PC de recepción, en una tablet como kiosco de entrada y en el teléfono de tus entrenadores: todo se sincroniza al instante.' },
      { route: 'inicio', title: '¡A entrenar! 🎉', text: 'Prueba ahora: ve a Recepción y escribe “Valeria” para registrar su entrada, o “Natalia” para ver un acceso rechazado y renovarla. Más recorridos en el menú › Ayuda.', final: true }
    ]
  },
  recepcion: {
    name: 'Control de acceso y kiosco', desc: 'Lector QR, reglas de entrada, pase diario y modo kiosco', icon: 'scan',
    steps: [
      { route: 'recepcion', sel: ['[data-tour="scan"]'], title: 'Registrar entradas', text: 'Con un lector USB de códigos QR no tocas nada: el lector escribe el código del carnet y se registra solo. También puedes escribir el documento, el N° de socio o parte del nombre.' },
      { route: 'recepcion', title: 'Reglas automáticas', text: 'Se rechaza si está vencido (con días de gracia configurables), congelado, sin sesiones o fuera del horario de su plan (ej. mañanero). Avisa si debe dinero, si cumple años, si vence pronto o si le falta la constancia médica.' },
      { route: 'recepcion', sel: ['#r-guest'], title: 'Pase diario', text: 'Para visitantes: nombre, documento y cobro del pase en segundos. Queda registrado para ofrecerle la inscripción después.' },
      { route: 'recepcion', sel: ['#r-kiosk'], title: 'Modo kiosco', text: 'Convierte una tablet o PC de la entrada en un punto de autoservicio: el socio pasa su carnet o teclea su documento y ve su resultado. Para salir del kiosco se pide el PIN.' },
      { route: 'recepcion', sel: ['[data-tour="inside"]'], title: 'Aforo', text: 'Cuenta quién está dentro según la hora de entrada y el tiempo promedio de entrenamiento (o marcando la salida). Te avisa cuando se llena.', final: true }
    ]
  },
  socio: {
    name: 'Inscribir y vender una membresía', desc: 'Ficha, PAR-Q, planes, abonos y carnet digital', icon: 'userPlus',
    steps: [
      { route: 'socios', sel: ['#m-new'], title: 'Nuevo socio', text: 'Foto (con la cámara), datos, objetivo y nivel, contacto de emergencia y el cuestionario de salud PAR-Q: si responde “sí” a alguna pregunta, el sistema pide la constancia médica.' },
      { route: 'socios', title: 'Vender el plan', text: 'Elige el plan (te marca el de mejor precio por día y el más vendido), la fecha de inicio y si cobra inscripción. Puede pagar completo, abonar una parte o quedar a crédito (con PIN).' },
      { route: 'socios', title: 'Renovación sin perder días', text: 'Si renueva antes de vencer, el nuevo período empieza al día siguiente del vencimiento actual: no pierde ningún día.' },
      { route: 'socios', title: 'Carnet digital con QR', text: 'Cada socio recibe por WhatsApp su carnet digital: código QR para entrar, estado de su plan, su rutina del día y su progreso. Puedes imprimirlo en tamaño tarjeta.' },
      { route: 'socios', title: 'Congelar y ajustar', text: 'Congela la membresía por viaje o lesión (los días se suman al vencimiento, con el límite de cada plan), reactiva antes de tiempo o ajusta fechas y sesiones con PIN.', final: true }
    ]
  },
  entreno: {
    name: 'Rutinas y evaluaciones', desc: 'Plantillas, biblioteca de ejercicios y progreso físico', icon: 'dumbbell',
    steps: [
      { route: 'rutinas', sel: ['#rt-tabs'], title: 'Plantillas listas', text: 'Rutinas profesionales por objetivo y nivel: inicio, quema de grasa, hipertrofia, fuerza 5×5, glúteos y adulto mayor. Crea las tuyas con la biblioteca de ejercicios.' },
      { route: 'rutinas', sel: ['#rt-assign'], title: 'Asignar en segundos', text: 'Elige al socio: el sistema recomienda la plantilla según su objetivo y nivel. Ajusta series, repeticiones, carga y descanso, e imprímela o envíala: queda en su carnet digital.' },
      { route: 'rutinas', title: 'Evaluación física', text: 'Desde la ficha del socio: peso, talla, perímetros y presión. Calcula IMC, % de grasa (fórmula de la Marina de EE. UU.), masa magra, riesgo por cintura, metabolismo basal y calorías según su objetivo, con gráficas de progreso.', final: true }
    ]
  },
  caja: {
    name: 'Caja, tienda y reportes', desc: 'Apertura, gastos, cierre, inventario y reportes', icon: 'wallet',
    steps: [
      { route: 'caja', sel: ['#view'], title: 'Caja', text: 'Abre la caja con el fondo inicial; cada cobro suma por forma de pago. Registra gastos (limpieza, mantenimiento, servicios) y al cerrar compara lo contado con lo esperado.' },
      { route: 'inventario', sel: ['#view'], title: 'Tienda e inventario', text: 'Suplementos, bebidas, snacks y accesorios con costo, precio, existencia mínima y vencimiento. Te avisa de lo que se está agotando.' },
      { route: 'facturas', sel: ['#view'], title: 'Facturación', text: 'Todos los recibos del gimnasio. Reimprime o anula con PIN: al anular una membresía, el socio vuelve a su plan anterior y la caja y el inventario se ajustan solos.', final: true }
    ]
  }
};

let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sg_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-gym-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar Sano Gym, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
