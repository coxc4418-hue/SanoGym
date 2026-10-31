// Sano Gym — Recepción: control de acceso con lector QR, búsqueda y aforo en vivo
import { store, memberStatus, statusBadge } from '../store.js';
import { checkAccess, registerCheckin, checkout } from '../ops.js';
import { esc, normalize, debounce, emptyState, fmtAgo, toast, fmtTime } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos, openMember } from '../member.js';
import { accessCardHTML, guestPass, scanQR, cameraScanSupported } from '../access.js';
import { requirePin } from '../auth.js';
import { membershipLine } from '../membership.js';

let actx = null;
/** Pitido de confirmación (agudo) o de rechazo (grave) */
export function beep(ok = true) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const tones = ok ? [[880, 0], [1320, 0.11]] : [[220, 0], [180, 0.18]];
    for (const [f, t] of tones) {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = ok ? 'sine' : 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.16);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.18);
    }
  } catch (_) {}
}

export function mount(el, { navigate }) {
  let filter = 'all';
  let last = null;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Recepción y acceso</h1><p class="view-sub">Escanea el carnet con el lector o la cámara, o escribe el código, el documento o el nombre.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="r-guest">${icon('ticket')} Pase diario</button>${cameraScanSupported() ? `<button class="btn btn-secondary" id="r-cam">${icon('camera')} Cámara</button>` : ''}<button class="btn btn-secondary" id="r-kiosk">${icon('kiosk')} Modo kiosco</button></div></div>
    <div class="reception">
      <div class="stack">
        <form class="scan-input" id="r-form" data-tour="scan" autocomplete="off">
          <span class="scan-ic">${icon('scan')}</span>
          <input id="r-q" placeholder="Código del carnet, ${'documento'}, N° de socio o nombre…" autofocus>
          <button class="btn btn-success btn-lg">${icon('userCheck')} Registrar</button>
        </form>
        <div id="r-sugg"></div>
        <div id="r-result">${emptyState('scan', 'Listo para registrar entradas', 'Con un lector USB de códigos QR, solo apunta al carnet: entra solo. Atajo: F1 abre esta pantalla.')}</div>
      </div>
      <div class="stack">
        <div class="card" data-tour="inside"><div class="card-head"><div class="card-title">${icon('flame')} Dentro ahora <span class="badge badge-success" id="r-in-n">0</span></div><span class="small muted" id="r-cap"></span></div><div id="r-inside"></div></div>
        <div class="card card-flush"><div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('clock')} Entradas de hoy</div><div class="chips" id="r-f"></div></div><div id="r-today"></div></div>
      </div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const input = $('#r-q');

  async function process(m, via = 'recepcion') {
    $('#r-sugg').innerHTML = '';
    input.value = '';
    const r = checkAccess(m);
    const res = await registerCheckin(m, { via, check: r });
    last = { m: store.member(m.id) || m, r, res };
    beep(r.level !== 'deny');
    renderResult();
    input.focus();
  }

  function renderResult() {
    if (!last) return;
    const { m, r } = last;
    $('#r-result').innerHTML = `${accessCardHTML(store.member(m.id) || m, r)}
      <div class="row row-wrap mt">${r.level === 'deny' ? `<button class="btn btn-primary" data-x="renew">${icon('refresh')} Renovar</button>${m.membership?.kind !== 'pase' ? `<button class="btn btn-secondary" data-x="pass">${icon('ticket')} Pase diario</button>` : ''}<button class="btn btn-ghost" data-x="force">${icon('unlock')} Autorizar (PIN)</button>` : `${(Number(m.balance) || 0) > 0.009 ? `<button class="btn btn-secondary" data-x="debt">${icon('dollar')} Cobrar deuda</button>` : ''}${m.membership && memberStatus(m) === 'por_vencer' ? `<button class="btn btn-secondary" data-x="renew">${icon('refresh')} Renovar ya</button>` : ''}`}<button class="btn btn-ghost" data-x="open">${icon('user')} Ficha</button></div>`;
    hydratePhotos($('#r-result'));
    el.querySelectorAll('[data-x]').forEach((b) => b.onclick = async () => {
      const a = b.dataset.x; const mm = store.member(m.id) || m;
      if (a === 'open') openMember(mm.id);
      if (a === 'debt') { const { payDebtModal } = await import('../membership.js'); payDebtModal(mm); }
      if (a === 'renew' || a === 'pass') {
        const { sellModal } = await import('../membership.js');
        const pase = a === 'pass' ? store.activePlans.find((p) => p.kind === 'pase') : null;
        if (a === 'pass' && !pase) { toast('Crea un plan de tipo “Pase diario” en Configuración.', 'warning'); return; }
        const out = await sellModal(mm, pase ? { planId: pase.id } : {});
        if (out && r.level === 'deny') setTimeout(() => process(store.member(mm.id) || out.member), 300);
      }
      if (a === 'force') {
        if (!(await requirePin('Autorizar la entrada'))) return;
        await registerCheckin(mm, { force: true, check: r, note: 'Autorizado por el personal' });
        last = { m: mm, r: { ...r, level: 'warn', notes: ['Entrada autorizada por el personal.', ...r.reasons], reasons: [] } };
        beep(true); renderResult(); toast('Entrada autorizada', 'warning');
      }
      input.focus();
    });
  }

  function suggest(q) {
    const t = normalize(q);
    if (t.length < 2) { $('#r-sugg').innerHTML = ''; return; }
    const list = store.members.filter((m) => m.active !== false && normalize(`${m.name} ${m.idDoc || ''} ${m.number} ${m.phone || ''}`).includes(t)).slice(0, 6);
    $('#r-sugg').innerHTML = list.length ? `<div class="card card-flush sugg">${list.map((m) => `<button class="list-item" data-s="${m.id}">${avatar(m)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(m.name)}</b><div class="t-sub">${esc(m.number)} · ${membershipLine(m)}</div></div>${statusBadge(memberStatus(m))}</button>`).join('')}</div>` : '';
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => process(store.member(b.dataset.s)));
    hydratePhotos($('#r-sugg'), 6);
  }

  $('#r-form').onsubmit = (e) => {
    e.preventDefault();
    const q = input.value.trim(); if (!q) return;
    const m = store.findMember(q);
    if (m) { process(m); return; }
    const t = normalize(q);
    const byName = store.members.filter((x) => x.active !== false && normalize(x.name).includes(t));
    if (byName.length === 1) { process(byName[0]); return; }
    if (byName.length > 1) { suggest(q); return; }
    beep(false);
    $('#r-result').innerHTML = accessCardHTML(null, { level: 'deny', reasons: [`No hay ningún socio con “${q}”.`], notes: ['Verifica el código o registra al socio nuevo.'] }) + `<div class="row mt"><button class="btn btn-primary" id="r-new">${icon('userPlus')} Registrar socio nuevo</button></div>`;
    $('#r-new').onclick = async () => { const { memberForm } = await import('../member.js'); const m2 = await memberForm(null, /\d{5,}/.test(q) ? { idDoc: q } : { name: q }); if (m2) { const { sellModal } = await import('../membership.js'); sellModal(m2); } };
    input.select();
  };
  input.oninput = debounce((e) => { const v = e.target.value.trim(); if (/^[A-Z0-9]{8}$/.test(v) || /^\d+$/.test(v)) { $('#r-sugg').innerHTML = ''; return; } suggest(v); }, 120);
  $('#r-guest').onclick = () => guestPass();
  $('#r-kiosk').onclick = () => navigate('kiosco');
  $('#r-cam')?.addEventListener('click', async () => { const code = await scanQR(); if (code) { const m = store.findMember(code); if (m) process(m, 'qr'); else toast('Código no reconocido', 'danger'); } });

  function side() {
    const cap = Number(store.access.capacity) || 0;
    const ins = store.inside;
    $('#r-in-n').textContent = ins.length;
    $('#r-cap').textContent = cap ? `Aforo ${ins.length}/${cap} · ${Math.round((ins.length / cap) * 100)} %` : '';
    $('#r-inside').innerHTML = ins.length ? `<div class="list">${ins.slice(0, 40).map((c) => `<div class="list-item">${avatar(store.member(c.memberId) || { name: c.memberName })}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.memberName)}</b><div class="t-sub">desde ${fmtTime(c.date)} · ${fmtAgo(c.date)}</div></div><button class="btn btn-ghost btn-sm" data-out="${c.id}" title="Marcar salida">${icon('logout')}</button></div>`).join('')}</div>`
      : emptyState('flame', 'Nadie entrenando', `Las entradas cuentan como “dentro” durante ${store.access.stayMinutes} min o hasta marcar la salida.`);
    el.querySelectorAll('[data-out]').forEach((b) => b.onclick = async () => { await checkout({ id: b.dataset.out }); toast('Salida registrada'); });
    const F = { all: 'Todas', ok: 'Entraron', denied: 'Rechazadas' };
    $('#r-f').innerHTML = Object.entries(F).map(([k, v]) => `<button class="chip ${filter === k ? 'on' : ''}" data-ff="${k}">${v}</button>`).join('');
    el.querySelectorAll('[data-ff]').forEach((b) => b.onclick = () => { filter = b.dataset.ff; side(); });
    const list = store.todayCheckins.filter((c) => filter === 'all' || (filter === 'denied' ? c.result === 'denied' : c.result !== 'denied'));
    $('#r-today').innerHTML = list.length ? `<div class="table-wrap"><table class="table"><tbody>${list.slice(0, 80).map((c) => `<tr data-m="${c.memberId || ''}" style="cursor:pointer"><td class="nowrap small num">${fmtTime(c.date)}</td><td><b>${esc(c.memberName)}</b><div class="t-sub">${esc(c.planName || '')}${c.via === 'kiosco' ? ' · kiosco' : c.via === 'qr' ? ' · QR' : ''}</div></td><td class="r">${c.result === 'denied' ? `<span class="badge badge-danger" title="${esc(c.reason)}">Rechazado</span>` : c.result === 'forced' ? '<span class="badge badge-warning">Autorizado</span>' : '<span class="badge badge-success">Entró</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div style="padding:12px">${emptyState('clock', 'Sin registros')}</div>`;
    el.querySelectorAll('tr[data-m]').forEach((tr) => tr.onclick = () => tr.dataset.m && openMember(tr.dataset.m));
    hydratePhotos($('#r-inside'), 40);
  }
  side();
  const keepFocus = (e) => { if (!document.querySelector('.modal-backdrop') && !e.target.closest('input,select,textarea,button,a')) input.focus(); };
  document.addEventListener('click', keepFocus);
  const tick = setInterval(side, 60000);
  const off = store.on('*', (evt) => { if (evt === 'checkins' || evt === 'members' || evt === 'settings') side(); if (evt === 'members' && last) renderResult(); });
  setTimeout(() => input.focus(), 80);
  return () => { off(); clearInterval(tick); document.removeEventListener('click', keepFocus); };
}
