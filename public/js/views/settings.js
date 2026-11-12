// Sano Gym — Configuración del gimnasio
import { store, updateTenant, DAYS, DEFAULT_SERVICES } from '../store.js';
import { requirePin, changePassword, authErrorMessage, session } from '../auth.js';
import { esc, num, toast, parseNum, setBusy, toggleTheme, download, nowISO, round2, openModal, shortId, confirmDialog, emptyState, loc, flagImg, usd, scaleUSD } from '../utils.js';
import { icon } from '../icons.js';
import { fxSectionHTML, bindFxSection } from '../bcv.js';
import { openCountryPicker, salesWa, SALES_PHONE_FMT } from '../shared.js';
import { isStandalone, bindInstallButtons } from '../install.js';
import { PLAN_KINDS, planDuration, CLASS_TYPES, CLASS_COLORS, SAMPLE_CLASSES } from '../gym.js';

const SECTIONS = { gimnasio: 'Gimnasio', moneda: 'Moneda y tasa', planes: 'Planes y precios', clases: 'Clases y horario', entrenadores: 'Entrenadores', acceso: 'Reglas de acceso', recibos: 'Recibos', seguridad: 'Seguridad', apps: 'Instalar y respaldo' };
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function mount(el, { params = {} }) {
  let sec = SECTIONS[params.tab || params.sec] ? (params.tab || params.sec) : 'gimnasio';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Personaliza Sano Gym para tu gimnasio: planes, clases, entrenadores y reglas.</p></div></div>
    <div class="tabs">${Object.entries(SECTIONS).map(([k, v]) => `<button data-s="${k}">${v}</button>`).join('')}</div>
    <div id="s-body" style="max-width:960px"></div>`;
  const $ = (q) => el.querySelector(q);
  const s = () => store.settings;

  function render() {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#s-body');

    if (sec === 'gimnasio') {
      body.innerHTML = `<form class="card stack" id="f-biz">
        <div class="form-grid">
          <div class="field full"><label>Nombre del gimnasio</label><input class="input" name="businessName" value="${esc(s().businessName || store.tenant?.name || '')}" placeholder="Ej.: Iron Fit Gym"></div>
          <div class="field"><label>${esc(loc().tax)} (identificación fiscal)</label><input class="input" name="rif" value="${esc(s().rif)}"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s().phone)}"></div>
          <div class="field"><label>WhatsApp del gimnasio</label><input class="input" name="whatsapp" value="${esc(s().whatsapp || '')}"><span class="hint">Aparece en el carnet digital para que el socio te escriba.</span></div>
          <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${esc(s().email || '')}"></div>
          <div class="field"><label>Instagram</label><input class="input" name="instagram" value="${esc(s().instagram)}" placeholder="@tugimnasio"></div>
          <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s().address)}"></div>
          <div class="field full"><label>Normas del gimnasio</label><textarea class="textarea" name="rules" style="min-height:70px">${esc(s().rules || '')}</textarea><span class="hint">Se envían en el mensaje de bienvenida y aparecen en el carnet.</span></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div>
      </form>
      <div class="card mt-lg between row-wrap"><div class="row" style="gap:12px"><span class="flag">${flagImg(loc().code, 30)}</span><div><div class="bold">País: ${esc(loc().name)} · ${esc(loc().curName)} (${esc(loc().sym)})</div><div class="small muted">Moneda, formas de pago, documento de identidad y prefijo de WhatsApp.</div></div></div><button class="btn btn-secondary" id="s-rate">${icon('globe')} Cambiar país</button></div>
      <div class="card mt-lg between row-wrap"><div><div class="bold">Tema de la aplicación</div><div class="small muted">Claro u oscuro, según tu preferencia.</div></div><button class="btn btn-secondary" id="s-theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')} Cambiar tema</button></div>`;
      $('#f-biz').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        const patch = {}; for (const k of ['businessName', 'rif', 'phone', 'whatsapp', 'email', 'address', 'instagram', 'rules']) patch[k] = F[k].value.trim();
        await store.saveSettings(patch);
        if (patch.businessName && patch.businessName !== store.tenant?.name && !store.isDemo) updateTenant(store.tenantId, { name: patch.businessName, updatedAt: nowISO() }).catch(() => {});
        toast('Datos del gimnasio guardados');
      };
      $('#s-rate').onclick = async () => { if (!(await requirePin('Cambiar el país y la moneda'))) return; if (await openCountryPicker()) location.reload(); };
      $('#s-theme').onclick = (e) => { const n = toggleTheme(); e.currentTarget.innerHTML = `${icon(n === 'dark' ? 'sun' : 'moon')} Cambiar tema`; };
    }

    if (sec === 'planes') {
      const plans = s().plans; const svcs = s().services || [];
      body.innerHTML = `<div class="card stack">
        <div class="between row-wrap"><div><div class="card-title">${icon('ticket')} Planes de membresía</div><p class="small muted" style="margin:4px 0 0">Por tiempo (semana, mes, año), por sesiones (12 clases, 8 de entrenador) o pase diario. Puedes limitar el horario y si incluye clases.</p></div><button class="btn btn-primary" id="p-add">${icon('plus')} Nuevo plan</button></div>
        <div class="list">${plans.map((p) => `<div class="list-item" style="${p.active === false ? 'opacity:.5' : ''}"><span class="plan-dot" style="background:${p.color || 'var(--brand)'}"></span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}${p.popular ? ' <span class="badge badge-success">Más vendido</span>' : ''}${p.active === false ? ' <span class="badge badge-neutral">Inactivo</span>' : ''}</b><div class="t-sub">${esc(PLAN_KINDS[p.kind]?.label || '')} · ${esc(planDuration(p))}${p.timeFrom ? ` · ${p.timeFrom}–${p.timeTo}` : ''}${p.classes === false ? ' · sin clases' : ''}${p.freezeDays ? ` · congela hasta ${p.freezeDays} días` : ''}${p.personal ? ' · con entrenador' : ''}</div></div><b class="num">${usd(p.price)}</b><button class="btn btn-ghost btn-sm" data-ep="${esc(p.id)}">${icon('edit')}</button></div>`).join('')}</div>
      </div>
      <div class="grid-2 mt-lg">
        <form class="card stack" id="f-enroll"><div class="card-title">${icon('userPlus')} Inscripción</div>
          <div class="field"><label>Costo de inscripción (${esc(loc().sym)})</label><input class="input" name="enrollFee" inputmode="decimal" value="${num(s().access.enrollFee || 0, loc().dec)}"><span class="hint">Se cobra en la primera membresía. 0 = sin inscripción.</span></div>
          <div class="field"><label>Se vuelve a cobrar si estuvo vencido más de (días)</label><input class="input" name="reenrollDays" inputmode="numeric" value="${esc(s().access.reenrollDays ?? 60)}"><span class="hint">0 = nunca se vuelve a cobrar.</span></div>
          <button class="btn btn-primary">${icon('check')} Guardar</button></form>
        <div class="card stack"><div class="between"><div class="card-title">${icon('star')} Servicios de mostrador</div><button class="btn btn-ghost btn-sm" id="sv-add">${icon('plus')} Agregar</button></div>
          <p class="small muted" style="margin:0">Se venden en <b>Vender › Servicios</b>: toalla, locker, clase suelta, evaluación…</p>
          ${svcs.length ? `<div class="list">${svcs.map((x, i) => `<div class="list-item"><div class="grow"><b>${esc(x.name)}</b></div><b class="num">${usd(x.price)}</b><button class="btn btn-ghost btn-sm" data-sv="${i}">${icon('edit')}</button></div>`).join('')}</div>` : emptyState('star', 'Sin servicios')}</div>
      </div>`;
      $('#p-add').onclick = () => planForm();
      body.querySelectorAll('[data-ep]').forEach((b) => b.onclick = () => planForm(plans.find((p) => p.id === b.dataset.ep)));
      $('#f-enroll').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ access: { ...s().access, enrollFee: round2(parseNum(F.enrollFee.value)), reenrollDays: Math.max(0, Math.round(parseNum(F.reenrollDays.value))) } });
        toast('Inscripción guardada');
      };
      $('#sv-add').onclick = () => serviceForm(null);
      body.querySelectorAll('[data-sv]').forEach((b) => b.onclick = () => serviceForm(Number(b.dataset.sv)));
    }

    if (sec === 'clases') {
      const list = [...s().classes].sort((a, b) => a.time.localeCompare(b.time));
      body.innerHTML = `<div class="card stack">
        <div class="between row-wrap"><div><div class="card-title">${icon('calendar')} Clases grupales</div><p class="small muted" style="margin:4px 0 0">Cada clase con sus días, hora, duración, cupo, sala e instructor. Los socios se reservan y, si se llena, entran en lista de espera.</p></div>
          <div class="row">${list.length ? '' : `<button class="btn btn-secondary" id="c-sample">${icon('star')} Usar horario de ejemplo</button>`}<button class="btn btn-primary" id="c-add">${icon('plus')} Nueva clase</button></div></div>
        ${list.length ? `<div class="list">${list.map((c) => `<div class="list-item cls-item" style="--cc:${c.color || 'var(--brand)'};${c.active === false ? 'opacity:.5' : ''}"><span class="cls-time">${esc(c.time)}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.name)}</b><div class="t-sub">${(c.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d].slice(0, 3)).join(', ')} · ${c.minutes} min · cupo ${c.capacity || '∞'}${c.room ? ' · ' + esc(c.room) : ''}${store.trainer(c.trainerId) ? ' · ' + esc(store.trainer(c.trainerId).name) : ''}</div></div><button class="btn btn-ghost btn-sm" data-ec="${c.id}">${icon('edit')}</button></div>`).join('')}</div>`
          : emptyState('calendar', 'Sin clases', 'Crea tus clases o carga un horario de ejemplo (Spinning, Funcional, Zumba, Yoga, Pilates, CrossFit…) y luego ajústalo.')}
      </div>
      <form class="card stack mt-lg" id="f-sch"><div class="card-title">${icon('clock')} Horario de apertura</div>
        <div class="form-grid">
          <div class="field"><label>Lunes a viernes: abre</label><input class="input" type="time" name="open" value="${esc(s().schedule.open)}"></div>
          <div class="field"><label>Cierra</label><input class="input" type="time" name="close" value="${esc(s().schedule.close)}"></div>
          <div class="field"><label>Sábado: abre (vacío = cerrado)</label><input class="input" type="time" name="satOpen" value="${esc(s().schedule.satOpen || '')}"></div>
          <div class="field"><label>Cierra</label><input class="input" type="time" name="satClose" value="${esc(s().schedule.satClose || '')}"></div>
          <div class="field"><label>Domingo: abre (vacío = cerrado)</label><input class="input" type="time" name="sunOpen" value="${esc(s().schedule.sunOpen || '')}"></div>
          <div class="field"><label>Cierra</label><input class="input" type="time" name="sunClose" value="${esc(s().schedule.sunClose || '')}"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar horario</button></div></form>`;
      $('#c-add').onclick = () => classForm();
      body.querySelectorAll('[data-ec]').forEach((b) => b.onclick = () => classForm(s().classes.find((c) => c.id === b.dataset.ec)));
      $('#c-sample')?.addEventListener('click', async () => {
        const tr = store.activeTrainers;
        const classes = SAMPLE_CLASSES.map(([name, days, time, minutes, capacity, room, ci], i) => ({ id: shortId(6), name, days, time, minutes, capacity, room, color: CLASS_COLORS[ci], trainerId: tr.length ? tr[i % tr.length].id : null, active: true }));
        await store.saveSettings({ classes }); toast('Horario de ejemplo cargado: ajústalo a tu gimnasio');
      });
      $('#f-sch').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        const sch = { ...s().schedule }; for (const k of ['open', 'close', 'satOpen', 'satClose', 'sunOpen', 'sunClose']) sch[k] = F[k].value;
        sch.days = [1, 2, 3, 4, 5, ...(sch.satOpen ? [6] : []), ...(sch.sunOpen ? [0] : [])];
        await store.saveSettings({ schedule: sch }); toast('Horario guardado');
      };
    }

    if (sec === 'entrenadores') {
      const list = s().trainers || [];
      body.innerHTML = `<div class="card stack">
        <div class="between row-wrap"><div><div class="card-title">${icon('user')} Entrenadores e instructores</div><p class="small muted" style="margin:4px 0 0">Se asignan a socios, rutinas, clases y planes personalizados. Su comisión se calcula en Reportes.</p></div><button class="btn btn-primary" id="t-add">${icon('plus')} Agregar</button></div>
        ${list.length ? `<div class="list">${list.map((t) => `<div class="list-item" style="${t.active === false ? 'opacity:.5' : ''}"><span class="avatar" style="background:${t.color || 'var(--brand)'}">${esc((t.name || '?').split(' ').map((x) => x[0]).slice(0, 2).join(''))}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(t.name)}</b><div class="t-sub">${esc(t.specialty || 'Entrenador')}${t.phone ? ' · ' + esc(t.phone) : ''}${t.commission ? ` · comisión ${t.commission}%` : ''} · ${store.members.filter((m) => m.trainerId === t.id && m.active !== false).length} socio(s)</div></div><button class="btn btn-ghost btn-sm" data-et="${t.id}">${icon('edit')}</button></div>`).join('')}</div>`
          : emptyState('user', 'Sin entrenadores', 'Agrega a tu equipo: entrenadores de sala, instructores de clases y entrenadores personales.')}
      </div>`;
      $('#t-add').onclick = () => trainerForm();
      body.querySelectorAll('[data-et]').forEach((b) => b.onclick = () => trainerForm(list.find((t) => t.id === b.dataset.et)));
    }

    if (sec === 'acceso') {
      const a = s().access;
      const sw = (name, on, title, sub) => `<label class="check box box-white"><span class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></span><span><b>${title}</b><br><small class="muted">${sub}</small></span></label>`;
      body.innerHTML = `<form class="card stack" id="f-acc"><div class="card-title">${icon('shieldCheck')} Reglas de acceso en recepción</div>
        <div class="form-grid">
          <div class="field"><label>Días de gracia después del vencimiento</label><input class="input" name="graceDays" inputmode="numeric" value="${esc(a.graceDays ?? 0)}"><span class="hint">Puede entrar con aviso estos días; luego se rechaza.</span></div>
          <div class="field"><label>Avisar “por vencer” desde (días antes)</label><input class="input" name="remindDays" inputmode="numeric" value="${esc(s().remindDays ?? 5)}"></div>
          <div class="field"><label>Aforo máximo (personas a la vez)</label><input class="input" name="capacity" inputmode="numeric" value="${esc(a.capacity ?? 0)}"><span class="hint">0 = sin límite.</span></div>
          <div class="field"><label>Tiempo promedio de entrenamiento (min)</label><input class="input" name="stayMinutes" inputmode="numeric" value="${esc(a.stayMinutes ?? 180)}"><span class="hint">Para calcular quién está dentro si no marcan salida.</span></div>
          <div class="field"><label>Faltas a clases para marcar al socio</label><input class="input" name="noShowLimit" inputmode="numeric" value="${esc(a.noShowLimit ?? 3)}"></div>
        </div>
        ${sw('blockDebt', a.blockDebt, 'Bloquear la entrada si tiene deuda', 'Si está apagado, entra con aviso para cobrarle.')}
        ${sw('requireParq', a.requireParq, 'Exigir constancia médica si el PAR-Q tiene riesgo', 'El cuestionario de salud indica si debe consultar a un médico antes de entrenar.')}
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar reglas</button></div></form>`;
      $('#f-acc').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const n = (k) => Math.max(0, Math.round(parseNum(F[k].value)) || 0);
        await store.saveSettings({ remindDays: n('remindDays'), access: { ...a, graceDays: n('graceDays'), capacity: n('capacity'), stayMinutes: n('stayMinutes') || 180, noShowLimit: n('noShowLimit') || 3, blockDebt: F.blockDebt.checked, requireParq: F.requireParq.checked } });
        toast('Reglas de acceso guardadas');
      };
    }

    if (sec === 'recibos') {
      body.innerHTML = `<form class="card stack" id="f-docs">
        <div class="form-grid">
          <div class="field"><label>Título del recibo</label><input class="input" name="docTitle" value="${esc(s().docTitle || 'RECIBO')}"><span class="hint">Ej.: RECIBO, NOTA DE COBRO, FACTURA.</span></div>
          <div class="field"><label>Formato</label><select class="select" name="receiptFormat">${[['80mm', 'Ticket 80 mm'], ['58mm', 'Ticket 58 mm'], ['carta', 'Hoja carta']].map(([v, l]) => `<option value="${v}" ${s().receiptFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Prefijo de numeración</label><input class="input" name="invoicePrefix" value="${esc(s().invoicePrefix || 'F')}" maxlength="4"></div>
          <div class="field"><label>Impuesto incluido en los precios (%)</label><input class="input" name="iva" inputmode="decimal" value="${num(s().iva || 0, 0)}"><span class="hint">Solo se muestra desglosado. 0 para no mostrarlo.</span></div>
          <div class="field full"><label>Mensaje al pie del recibo</label><input class="input" name="receiptFooter" value="${esc(s().receiptFooter)}"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div></form>`;
      $('#f-docs').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ docTitle: F.docTitle.value.trim().toUpperCase() || 'RECIBO', receiptFormat: F.receiptFormat.value, invoicePrefix: F.invoicePrefix.value.trim().toUpperCase() || 'F', iva: parseNum(F.iva.value), receiptFooter: F.receiptFooter.value.trim() });
        toast('Recibos guardados');
      };
    }

    if (sec === 'moneda') { body.innerHTML = fxSectionHTML(); bindFxSection(body, render); }

    if (sec === 'seguridad') {
      body.innerHTML = `<div class="grid-2">
        <form class="card stack" id="f-pin"><div class="card-title">${icon('lock')} PIN de administrador</div><p class="small muted" style="margin:0">Protege reportes, anulaciones, descuentos, ventas a crédito, ajustes de membresía, autorizar entradas, salir del kiosco, gastos y cierre de caja.</p>
          <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <div class="field"><label>Repetir PIN</label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <button class="btn btn-primary">${icon('check')} Cambiar PIN</button></form>
        ${session.user?.isAnonymous ? `<div class="card stack"><div class="card-title">${icon('shield')} Contraseña</div><p class="muted" style="margin:0">En la demo no hay contraseña. Contrata Sano Gym para tener tu propia cuenta.</p><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>`
          : `<form class="card stack" id="f-pass"><div class="card-title">${icon('shield')} Contraseña de acceso</div>
          <div class="field"><label>Contraseña actual</label><input class="input" name="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña (mínimo 8)</label><input class="input" name="next" type="password" autocomplete="new-password"></div>
          <div class="error-msg" data-err></div>
          <button class="btn btn-primary">${icon('check')} Cambiar contraseña</button></form>`}
      </div>
      <div class="box small mt-lg">${icon('shieldCheck')} Los datos de tus socios solo son visibles con tu usuario. Cada sede tiene su información completamente aislada. El carnet digital público muestra solo nombre, plan, vigencia y rutina.</div>`;
      $('#f-pin').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        if (store.isDemo) { toast('En la demo el PIN siempre es 1234.', 'info'); return; }
        if (!/^\d{4,12}$/.test(F.pin.value)) { toast('El PIN debe tener de 4 a 12 dígitos', 'warning'); return; }
        if (F.pin.value !== F.pin2.value) { toast('Los PIN no coinciden', 'warning'); return; }
        if (store.hasPin() && !(await requirePin('Cambiar el PIN'))) return;
        await store.setPin(F.pin.value); e.target.reset(); toast('PIN actualizado');
      };
      const fp = $('#f-pass');
      if (fp) fp.onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const err = fp.querySelector('[data-err]'); err.textContent = '';
        if (F.next.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
        const btn = fp.querySelector('button'); setBusy(btn, true);
        try { await changePassword(F.cur.value, F.next.value); e.target.reset(); toast('Contraseña actualizada'); }
        catch (ex) { err.textContent = authErrorMessage(ex); }
        setBusy(btn, false);
      };
    }

    if (sec === 'apps') {
      body.innerHTML = `<div class="grid-2">
        <div class="card stack"><div class="card-title">${icon('install')} Instalar la app</div>
          <p class="small muted" style="margin:0">Instala Sano Gym en la computadora de recepción, la tablet del kiosco de acceso y el teléfono de los entrenadores. Todo conectado en tiempo real.</p>
          ${isStandalone() ? `<div class="pay-status ok"><span>${icon('check')} Estás usando la app instalada</span><span></span></div>` : `<button class="btn btn-primary btn-lg" data-install>${icon('install')} Instalar en este equipo</button>`}
          <div class="list">
            <div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>Android</b><div class="t-sub">Chrome › menú ⋮ › Instalar app</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('laptop')}</span><div class="grow"><b>Computadora</b><div class="t-sub">Chrome o Edge › ícono de instalar en la barra de direcciones</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>iPhone / iPad</b><div class="t-sub">Safari › Compartir › Agregar a inicio</div></div></div>
          </div>
          <div class="box small">${icon('scan')} <b>Lector de códigos:</b> cualquier lector USB de QR funciona en Recepción y en el Kiosco: lee el carnet y registra la entrada solo.</div></div>
        <div class="card stack"><div class="card-title">${icon('download')} Respaldo de datos</div>
          <p class="small muted" style="margin:0">Descarga una copia de socios, membresías, asistencias, reservas, rutinas, evaluaciones, ventas, productos y configuración (archivo JSON). Protegido con PIN.</p>
          <button class="btn btn-secondary" id="s-backup">${icon('download')} Descargar respaldo completo</button>
          <div class="divider"></div>
          <div class="card-title">${icon('whatsapp')} Soporte</div>
          <p class="small muted" style="margin:0">¿Dudas o sugerencias? Escríbenos.</p>
          <a class="btn btn-whatsapp" href="${salesWa('Hola, necesito soporte con Sano Gym.')}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>
      </div>`;
      bindInstallButtons(body);
      $('#s-backup').onclick = async (e) => {
        const btn = e.currentTarget;
        if (!(await requirePin('Descargar el respaldo'))) return;
        setBusy(btn, true, 'Preparando…');
        try {
          const { getDocs } = await import('../firebase.js');
          const all = async (n) => (await getDocs(store.col(n))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const [memberships, checkins, bookings, routines, evaluations, sales, cashShifts, cashMovements] = await Promise.all(['memberships', 'checkins', 'bookings', 'routines', 'evaluations', 'sales', 'cash_shifts', 'cash_movements'].map(all));
          const data = { app: 'Sano Gym', exportedAt: nowISO(), business: store.businessName, settings: store.settings, members: store.members, memberships, checkins, bookings, routines, evaluations, sales, products: store.products, cashShifts, cashMovements };
          download(`respaldo-${(store.businessName || 'sano-gym').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
          toast('Respaldo descargado');
        } catch (ex) { toast('No se pudo generar el respaldo: ' + ex.message, 'danger'); }
        setBusy(btn, false);
      };
    }
  }

  // ---------- Planes ----------
  function planForm(p = null) {
    const x = p || { id: '', name: '', kind: 'tiempo', months: 1, days: 30, visits: 12, price: 0, color: CLASS_COLORS[0], classes: true, freezeDays: 0 };
    const unit = Number(x.months) > 0 ? 'months' : 'days';
    const m = openModal({
      title: p ? 'Editar plan' : 'Nuevo plan', size: 'md',
      body: `<form class="stack" data-f><div class="form-grid">
        <div class="field full"><label>Nombre *</label><input class="input" name="name" value="${esc(x.name)}" placeholder="Ej.: Mensual, Pareja, Corporativo" autofocus></div>
        <div class="field"><label>Tipo</label><select class="select" name="kind">${Object.entries(PLAN_KINDS).map(([k, v]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div class="field"><label>Precio (${esc(loc().sym)}) *</label><input class="input" name="price" inputmode="decimal" value="${num(x.price || 0, loc().dec)}"></div>
        <div class="field" data-k="dur"><label>Duración / vigencia</label><div class="row" style="flex-wrap:nowrap"><input class="input" name="len" inputmode="numeric" value="${unit === 'months' ? x.months : x.days || 30}" style="max-width:90px"><select class="select" name="unit"><option value="months" ${unit === 'months' ? 'selected' : ''}>meses</option><option value="days" ${unit === 'days' ? 'selected' : ''}>días</option></select></div></div>
        <div class="field" data-k="ses"><label>Número de sesiones</label><input class="input" name="visits" inputmode="numeric" value="${esc(x.visits || 12)}"></div>
        <div class="field"><label>Horario permitido: desde</label><input class="input" type="time" name="timeFrom" value="${esc(x.timeFrom || '')}"></div>
        <div class="field"><label>hasta (vacío = todo el día)</label><input class="input" type="time" name="timeTo" value="${esc(x.timeTo || '')}"></div>
        <div class="field"><label>Días de congelamiento permitidos</label><input class="input" name="freezeDays" inputmode="numeric" value="${esc(x.freezeDays || 0)}"></div>
        <div class="field"><label>Color</label><div class="row">${CLASS_COLORS.map((c) => `<label class="color-dot"><input type="radio" name="color" value="${c}" ${x.color === c ? 'checked' : ''} hidden><span style="background:${c}"></span></label>`).join('')}</div></div>
        <div class="field full"><label>Nota (condiciones)</label><input class="input" name="note" value="${esc(x.note || '')}" placeholder="Ej.: Presentar carnet estudiantil"></div>
      </div>
      <label class="check"><input type="checkbox" name="classes" ${x.classes !== false ? 'checked' : ''}> Incluye clases grupales</label>
      <label class="check"><input type="checkbox" name="personal" ${x.personal ? 'checked' : ''}> Con entrenador personal (se asigna al vender y cuenta para su comisión)</label>
      <label class="check"><input type="checkbox" name="popular" ${x.popular ? 'checked' : ''}> Destacar como “más vendido”</label>
      <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Activo (se ofrece al vender)</label>
      <div class="error-msg" data-err></div></form>`,
      footer: `${p ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Eliminar</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    const sync = () => { m.el.querySelector('[data-k="ses"]').hidden = F.kind.value !== 'sesiones'; m.el.querySelector('[data-k="dur"]').hidden = F.kind.value === 'pase'; };
    F.kind.onchange = sync; sync();
    m.el.querySelector('[data-ok]').onclick = async () => {
      const name = F.name.value.trim(); const err = m.el.querySelector('[data-err]');
      if (!name) { err.textContent = 'Escribe el nombre del plan.'; return; }
      const len = Math.max(1, Math.round(parseNum(F.len.value)) || 1);
      const plan = { ...(p || {}), id: p?.id || shortId(6), name, kind: F.kind.value, price: round2(parseNum(F.price.value)), color: F.color.value || CLASS_COLORS[0],
        months: F.kind.value !== 'pase' && F.unit.value === 'months' ? len : 0, days: F.kind.value === 'pase' ? 1 : F.unit.value === 'days' ? len : 0,
        visits: F.kind.value === 'sesiones' ? Math.max(1, Math.round(parseNum(F.visits.value)) || 1) : F.kind.value === 'pase' ? 1 : null,
        timeFrom: F.timeFrom.value, timeTo: F.timeTo.value, freezeDays: Math.max(0, Math.round(parseNum(F.freezeDays.value)) || 0), note: F.note.value.trim(),
        classes: F.classes.checked, personal: F.personal.checked, popular: F.popular.checked, active: F.active.checked };
      const plans = p ? s().plans.map((y) => (y.id === p.id ? plan : y)) : [...s().plans, plan];
      await store.saveSettings({ plans }); m.close(); toast('Plan guardado');
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      const used = store.members.some((mb) => mb.membership?.planId === p.id && mb.active !== false);
      if (!(await confirmDialog({ title: 'Eliminar plan', message: used ? `Hay socios con el plan “${p.name}”. Sus membresías actuales no cambian, pero ya no podrás venderlo. ¿Eliminar?` : `¿Eliminar el plan “${p.name}”?`, confirmText: 'Eliminar', danger: true }))) return;
      await store.saveSettings({ plans: s().plans.filter((y) => y.id !== p.id) }); m.close(); toast('Plan eliminado');
    });
  }

  async function serviceForm(i) {
    const svcs = [...(s().services || [])]; const x = i == null ? { name: '', price: 0 } : svcs[i];
    const m = openModal({
      title: i == null ? 'Nuevo servicio' : 'Editar servicio', size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>Nombre</label><input class="input" name="name" value="${esc(x.name)}" autofocus></div><div class="field"><label>Precio (${esc(loc().sym)})</label><input class="input" name="price" inputmode="decimal" value="${num(x.price || 0, loc().dec)}"></div></form>`,
      footer: `${i != null ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')}</button>` : `<button class="btn btn-ghost" data-def>Restaurar sugeridos</button>`}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async () => {
      if (!F.name.value.trim()) return;
      const item = { name: F.name.value.trim(), price: round2(parseNum(F.price.value)) };
      if (i == null) svcs.push(item); else svcs[i] = item;
      await store.saveSettings({ services: svcs }); m.close(); toast('Servicio guardado');
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => { svcs.splice(i, 1); await store.saveSettings({ services: svcs }); m.close(); });
    m.el.querySelector('[data-def]')?.addEventListener('click', async () => { await store.saveSettings({ services: DEFAULT_SERVICES.map((y) => ({ ...y, price: scaleUSD(y.price) })) }); m.close(); toast('Servicios sugeridos restaurados'); });
  }

  // ---------- Clases ----------
  function classForm(c = null) {
    const x = c || { name: '', days: [1, 3, 5], time: '18:00', minutes: 60, capacity: 20, room: '', color: CLASS_COLORS[0], trainerId: '', active: true };
    const m = openModal({
      title: c ? 'Editar clase' : 'Nueva clase', size: 'md',
      body: `<form class="stack" data-f><div class="form-grid">
        <div class="field full"><label>Clase *</label><input class="input" name="name" list="cls-types" value="${esc(x.name)}" placeholder="Spinning, Funcional, Yoga…" autofocus><datalist id="cls-types">${CLASS_TYPES.map((t) => `<option>${esc(t)}</option>`).join('')}</datalist></div>
        <div class="field full"><label>Días</label><div class="chips chips-wrap">${WEEK.map((d) => `<label class="chip ${x.days.includes(d) ? 'on' : ''}"><input type="checkbox" name="d${d}" ${x.days.includes(d) ? 'checked' : ''} hidden>${DAYS[d].slice(0, 3)}</label>`).join('')}</div></div>
        <div class="field"><label>Hora de inicio</label><input class="input" type="time" name="time" value="${esc(x.time)}"></div>
        <div class="field"><label>Duración (min)</label><input class="input" name="minutes" inputmode="numeric" value="${esc(x.minutes)}"></div>
        <div class="field"><label>Cupo máximo</label><input class="input" name="capacity" inputmode="numeric" value="${esc(x.capacity)}"><span class="hint">0 = sin límite.</span></div>
        <div class="field"><label>Sala</label><input class="input" name="room" value="${esc(x.room || '')}" placeholder="Salón principal"></div>
        <div class="field"><label>Instructor</label><select class="select" name="trainerId"><option value="">—</option>${store.activeTrainers.map((t) => `<option value="${t.id}" ${x.trainerId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Color</label><div class="row">${CLASS_COLORS.map((c2) => `<label class="color-dot"><input type="radio" name="color" value="${c2}" ${x.color === c2 ? 'checked' : ''} hidden><span style="background:${c2}"></span></label>`).join('')}</div></div>
      </div><label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Activa</label><div class="error-msg" data-err></div></form>`,
      footer: `${c ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Eliminar</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    m.el.querySelectorAll('label.chip input').forEach((i) => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async () => {
      const err = m.el.querySelector('[data-err]');
      const days = WEEK.filter((d) => F['d' + d].checked);
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre de la clase.'; return; }
      if (!days.length) { err.textContent = 'Elige al menos un día.'; return; }
      if (!F.time.value) { err.textContent = 'Indica la hora.'; return; }
      const cls = { ...(c || {}), id: c?.id || shortId(6), name: F.name.value.trim(), days, time: F.time.value, minutes: Math.max(10, Math.round(parseNum(F.minutes.value)) || 60), capacity: Math.max(0, Math.round(parseNum(F.capacity.value)) || 0), room: F.room.value.trim(), trainerId: F.trainerId.value || null, color: F.color.value || CLASS_COLORS[0], active: F.active.checked };
      const classes = c ? s().classes.map((y) => (y.id === c.id ? cls : y)) : [...s().classes, cls];
      await store.saveSettings({ classes }); m.close(); toast('Clase guardada');
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminar clase', message: `¿Eliminar ${c.name} de las ${c.time}? Las reservas ya hechas se conservan en el historial.`, confirmText: 'Eliminar', danger: true }))) return;
      await store.saveSettings({ classes: s().classes.filter((y) => y.id !== c.id) }); m.close(); toast('Clase eliminada');
    });
  }

  // ---------- Entrenadores ----------
  function trainerForm(t = null) {
    const x = t || { name: '', specialty: '', phone: '', commission: 0, color: CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)], active: true };
    const m = openModal({
      title: t ? 'Editar entrenador' : 'Nuevo entrenador', size: 'sm',
      body: `<form class="stack" data-f>
        <div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(x.name)}" autofocus></div>
        <div class="field"><label>Especialidad</label><input class="input" name="specialty" value="${esc(x.specialty || '')}" placeholder="Musculación, Spinning, Funcional, Yoga…"></div>
        <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(x.phone || '')}"></div>
        <div class="field"><label>Comisión sobre planes personalizados (%)</label><input class="input" name="commission" inputmode="decimal" value="${esc(x.commission || 0)}"></div>
        <label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Activo</label>
        <div class="error-msg" data-err></div></form>`,
      footer: `${t ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')}</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-ok]').onclick = async () => {
      if (!F.name.value.trim()) { m.el.querySelector('[data-err]').textContent = 'Escribe el nombre.'; return; }
      const tr = { ...(t || {}), id: t?.id || shortId(6), name: F.name.value.trim(), specialty: F.specialty.value.trim(), phone: F.phone.value.trim(), commission: Math.max(0, Math.min(100, parseNum(F.commission.value))), color: x.color, active: F.active.checked };
      const trainers = t ? s().trainers.map((y) => (y.id === t.id ? tr : y)) : [...s().trainers, tr];
      await store.saveSettings({ trainers }); m.close(); toast('Entrenador guardado');
    };
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Eliminar entrenador', message: `¿Eliminar a ${t.name}? Mejor desactívalo si tiene historial.`, confirmText: 'Eliminar', danger: true }))) return;
      await store.saveSettings({ trainers: s().trainers.filter((y) => y.id !== t.id) }); m.close();
    });
  }

  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sec = b.dataset.s; render(); });
  render();
  return store.on('*', (evt) => { if (evt === 'settings' && ['planes', 'clases', 'entrenadores'].includes(sec)) render(); });
}
