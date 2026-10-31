// Sano Gym — Carnet digital público del socio: /carnet/CODIGO (sin sesión)
import { getCard } from '../store.js';
import { esc, fmtDate, todayKey, fromKey, waLink, applyLocale } from '../utils.js';
import { icon } from '../icons.js';
import { qrDataURL } from '../shared.js';

const days = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
function statusOf(c) {
  const t = todayKey(); const p = c.plan;
  if (!c.active) return ['baja', 'Inactivo', 'neutral'];
  if (!p || p.status === 'anulada') return ['sin', 'Sin membresía', 'neutral'];
  if (p.frozenUntil && p.frozenUntil >= t && (!p.frozenFrom || p.frozenFrom <= t)) return ['frz', `Congelado hasta ${fmtDate(p.frozenUntil)}`, 'info'];
  if (p.start > t) return ['pen', `Inicia el ${fmtDate(p.start)}`, 'violet'];
  if (p.end < t) return ['ven', 'Vencido', 'danger'];
  if (p.kind !== 'tiempo' && Number(p.visitsLeft ?? 1) <= 0) return ['ago', 'Sin sesiones', 'danger'];
  const d = days(t, p.end);
  return d <= 5 ? ['pv', d === 0 ? 'Vence hoy' : `Vence en ${d} día(s)`, 'warning'] : ['ok', 'Activo', 'success'];
}

export async function mount(root) {
  document.title = 'Mi carnet · Sano Gym';
  const code = (/\/carnet\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="pcard-page"><div class="empty"><div class="spinner"></div></div></div>';
  let c = null;
  try { c = code ? await getCard(code) : null; } catch (e) { console.error(e); }
  if (!c) {
    root.innerHTML = `<div class="pcard-page"><div class="mcard mcard-err"><img src="/assets/logo.svg" alt="" width="64"><h1>Carnet no encontrado</h1><p>El código <b>${esc(code || '—')}</b> no existe o fue renovado. Pide tu carnet actualizado en la recepción de tu gimnasio.</p><a class="btn btn-primary" href="/">Ir a Sano Gym</a></div></div>`;
    return;
  }
  try { applyLocale(c.country || 'VE'); } catch (_) {}
  const [st, label, tone] = statusOf(c);
  const p = c.plan;
  const qr = await qrDataURL(location.origin + '/carnet/' + code, 6);
  const total = p && p.start && p.end ? Math.max(1, days(p.start, p.end) + 1) : 0;
  const used = p && total ? Math.min(total, Math.max(0, days(p.start, todayKey()) + 1)) : 0;
  const tabs = { carnet: 'Carnet', ...(c.routine ? { rutina: 'Mi rutina' } : {}), ...(c.lastEval ? { progreso: 'Mi progreso' } : {}) };
  let tab = 'carnet';
  const wa = c.gymPhone ? waLink(c.gymPhone, `Hola, soy ${c.name} (${c.number}).`) : '';

  const draw = () => {
    root.innerHTML = `<div class="pcard-page">
      <div class="mcard st-${st}">
        <div class="mcard-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(c.gym || 'Mi gimnasio')}</b><small>Carnet de socio</small></div><span class="mcard-badge tone-${tone}">${esc(label)}</span></div>
        <div class="mcard-name">${esc(c.name)}</div>
        <div class="mcard-num">${esc(c.number)} · ${esc(code)}</div>
        ${tab === 'carnet' ? `
          <div class="mcard-qr"><img src="${qr}" alt="QR del carnet"></div>
          <p class="mcard-hint">Muestra este código en la recepción o en el lector de la entrada. Sube el brillo de la pantalla.</p>
          ${p ? `<div class="mcard-plan"><div><small>Plan</small><b>${esc(p.name)}</b></div><div><small>Vigencia</small><b>${fmtDate(p.start)} – ${fmtDate(p.end)}</b></div>${p.kind !== 'tiempo' && p.visitsLeft != null ? `<div><small>Sesiones</small><b>${p.visitsLeft} de ${p.visits}</b></div>` : ''}</div>
            ${total > 1 ? `<div class="mcard-prog"><i style="width:${(used / total) * 100}%"></i></div>` : ''}` : '<p class="mcard-hint">Sin membresía activa. Renueva en la recepción.</p>'}
          ${c.debt ? `<div class="mcard-warn">${icon('alert')} Tienes un saldo pendiente. Pásate por recepción.</div>` : ''}
          <div class="mcard-stats"><div><b>${c.visits || 0}</b><small>entrenamientos</small></div><div><b>${c.lastCheckinAt ? fmtDate(c.lastCheckinAt.slice(0, 10)) : '—'}</b><small>última visita</small></div>${c.goal ? `<div><b>${esc(c.goal)}</b><small>objetivo</small></div>` : ''}</div>` : ''}
        ${tab === 'rutina' && c.routine ? `<div class="mcard-routine"><h2>${esc(c.routine.name)}</h2>${c.routine.trainer ? `<p class="faint">Entrenador: ${esc(c.routine.trainer)}</p>` : ''}${c.routine.note ? `<p class="mcard-note">${esc(c.routine.note)}</p>` : ''}
          ${(c.routine.days || []).map((d, di) => `<details ${di === 0 ? 'open' : ''}><summary>${icon('dumbbell')} ${esc(d.name)} <small>${d.items.length} ejercicios</small></summary>${d.items.map((x, i) => `<label class="mex"><input type="checkbox" data-ck="${di}-${i}"><span class="mex-n">${i + 1}</span><span class="grow"><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</span><span class="mex-sr">${x.sets ? x.sets + '×' : ''}${esc(x.reps)}${x.weight ? `<small>${esc(x.weight)}</small>` : ''}</span></label>`).join('')}</details>`).join('')}
          <p class="mcard-hint">Marca los ejercicios a medida que los completes (se reinicia cada día).</p></div>` : ''}
        ${tab === 'progreso' && c.lastEval ? `<div class="mcard-plan"><div><small>Última evaluación</small><b>${fmtDate(c.lastEval.date)}</b></div><div><small>Peso</small><b>${c.lastEval.weight ?? '—'} kg</b></div>${c.lastEval.bmi ? `<div><small>IMC</small><b>${c.lastEval.bmi}</b></div>` : ''}${c.lastEval.fat ? `<div><small>% grasa</small><b>${c.lastEval.fat} %</b></div>` : ''}</div><p class="mcard-hint">Pide a tu entrenador tu próxima evaluación para ver tu avance.</p>` : ''}
        ${Object.keys(tabs).length > 1 ? `<div class="mcard-tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${v}</button>`).join('')}</div>` : ''}
        <div class="mcard-foot">${wa ? `<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir al gimnasio</a>` : ''}${c.gymAddress ? `<small>${icon('pin')} ${esc(c.gymAddress)}</small>` : ''}</div>
      </div>
      <p class="pcard-by">Hecho con <b>Sano Gym</b> · Agrega esta página a tu pantalla de inicio para tenerla siempre a mano.</p>
    </div>`;
    root.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const key = `sg_ck_${code}_${todayKey()}`;
    let done = {}; try { done = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) {}
    root.querySelectorAll('[data-ck]').forEach((i) => { i.checked = !!done[i.dataset.ck]; i.onchange = () => { done[i.dataset.ck] = i.checked; try { localStorage.setItem(key, JSON.stringify(done)); } catch (_) {} }; });
  };
  draw();
}
