// Sano Gym — Evaluaciones físicas: medición, cálculos, progreso e informe
import { store } from './store.js';
import { saveEvaluation, deleteEvaluation } from './ops.js';
import { evalCalc, MEASURES, ACTIVITY, ageOf } from './gym.js';
import { openModal, esc, num, toast, setBusy, fmtDate, todayKey, emptyState, confirmDialog, parseNum } from './utils.js';
import { icon } from './icons.js';
import { printDoc, waMember } from './shared.js';
import { requirePin } from './auth.js';

const GROUPS = [
  ['Composición corporal', ['weight', 'height', 'fat', 'muscle', 'visceral']],
  ['Perímetros', ['neck', 'chest', 'waist', 'hip', 'arm', 'thigh', 'calf']],
  ['Signos', ['restHr', 'bp']]
];
const M = Object.fromEntries(MEASURES.map(([k, l, u]) => [k, { l, u }]));
const f1 = (v) => (v == null || v === '' ? '—' : num(v, 1));
const badge = (c) => (c ? `<span class="badge badge-${c.tone}">${esc(c.label)}</span>` : '');

/** Panel con los resultados calculados */
function resultsHTML(c, ev, prev = null, member = {}) {
  const d = (k, unit, invert = false) => {
    if (!prev || prev[k] == null || ev[k] == null) return '';
    const x = Math.round((ev[k] - prev[k]) * 10) / 10; if (!x) return '';
    const good = invert ? x > 0 : x < 0;
    return `<small class="${good ? 'text-success' : 'text-danger'}">${x > 0 ? '+' : ''}${num(x, 1)}${unit}</small>`;
  };
  const gain = /masa|fuerza/i.test(member.goal || '');
  return `<div class="ev-res">
    <div class="ev-box"><span>IMC</span><b>${f1(c.bmi)}</b>${badge(c.bmiClass)}${d('bmi', '')}</div>
    <div class="ev-box"><span>% grasa</span><b>${c.fat != null ? f1(c.fat) + ' %' : '—'}</b>${badge(c.fatClass)}${c.fatSource ? `<small class="faint">${esc(c.fatSource)}</small>` : '<small class="faint">mide cuello y cintura (y cadera)</small>'}</div>
    <div class="ev-box"><span>Masa magra</span><b>${c.lean != null ? f1(c.lean) + ' kg' : '—'}</b>${c.fatMass != null ? `<small>grasa ${f1(c.fatMass)} kg</small>` : ''}</div>
    <div class="ev-box"><span>Cintura</span><b>${ev.waist ? f1(ev.waist) + ' cm' : '—'}</b>${badge(c.risk)}${c.risk?.whr ? `<small>cintura/cadera ${num(c.risk.whr, 2)}</small>` : ''}${d('waist', ' cm')}</div>
    <div class="ev-box"><span>Peso</span><b>${f1(ev.weight)} kg</b>${c.ideal ? `<small>saludable: ${f1(c.ideal[0])}–${f1(c.ideal[1])} kg</small>` : ''}${d('weight', ' kg', gain)}</div>
    ${c.energy ? `<div class="ev-box ev-wide"><span>Energía diaria (${esc(c.energy.mode)})</span><b>${num(c.energy.target, 0)} kcal</b><small>Basal ${num(c.energy.bmr, 0)} · gasto ${num(c.energy.tdee, 0)} kcal · proteína ${c.energy.protein} g · agua ${num(c.energy.water, 1)} L</small></div>` : '<div class="ev-box ev-wide"><span>Energía diaria</span><small>Registra fecha de nacimiento, sexo, peso y estatura para calcular calorías y proteína.</small></div>'}
  </div>`;
}

/** Nueva evaluación (o editar) */
export function evalModal(member, ev = null, list = []) {
  const prev = [...list].filter((x) => x.id !== ev?.id && (!ev || x.date <= ev.date)).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const x = { date: todayKey(), height: member.height || prev?.height || '', activity: member.activity || 1.55, ...(ev || {}) };
  return new Promise((resolve) => {
    let saved = null;
    const m = openModal({
      title: ev ? 'Editar evaluación' : 'Evaluación física', sub: `${esc(member.name)}${ageOf(member.birthDate) != null ? ` · ${ageOf(member.birthDate)} años` : ''}${member.sex ? ` · ${member.sex === 'F' ? 'mujer' : 'hombre'}` : ''}${prev ? ` · anterior: ${fmtDate(prev.date)}` : ''}`, size: 'xl',
      body: `<div class="ev-form">
        <form class="stack" data-f>
          <div class="form-grid"><div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${x.date}"></div>
          <div class="field"><label>Actividad física</label><select class="select" name="activity">${ACTIVITY.map(([v, l]) => `<option value="${v}" ${Number(x.activity) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
          ${GROUPS.map(([g, keys]) => `<div class="section-title">${g}</div><div class="form-grid form-grid-3">${keys.map((k) => `<div class="field"><label>${M[k].l} <span class="faint">${M[k].u}</span></label><input class="input" name="${k}" ${k === 'bp' ? 'placeholder="120/80"' : 'inputmode="decimal"'} value="${esc(x[k] ?? '')}" ${prev?.[k] ? `placeholder="antes: ${esc(prev[k])}"` : ''}></div>`).join('')}</div>`).join('')}
          <div class="field"><label>Observaciones</label><textarea class="textarea" name="notes" rows="2" placeholder="Postura, movilidad, metas para la próxima evaluación…">${esc(x.notes || '')}</textarea></div>
          ${!member.birthDate || !member.sex ? `<div class="box small box-warn">${icon('info')} Completa la fecha de nacimiento y el sexo del socio para calcular % de grasa y calorías.</div>` : ''}
          <div class="error-msg" data-err></div>
        </form>
        <div class="ev-live"><div class="section-title">${icon('pulse')} Resultados</div><div data-res></div></div>
      </div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar evaluación</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    const read = () => {
      const o = { date: F.date.value, activity: Number(F.activity.value), bp: F.bp.value };
      for (const [k] of MEASURES) if (k !== 'bp') { const v = parseNum(F[k].value); if (v > 0) o[k] = v; }
      return o;
    };
    const live = () => { const o = read(); m.el.querySelector('[data-res]').innerHTML = o.weight ? resultsHTML(evalCalc(o, { ...member, activity: o.activity }), o, prev, member) : emptyState('scale', 'Escribe el peso', 'Los cálculos aparecen al instante.'); };
    m.el.querySelector('[data-f]').addEventListener('input', live);
    m.el.querySelector('[data-f]').addEventListener('change', live);
    live();
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      try { saved = await saveEvaluation({ ...member, activity: Number(F.activity.value) }, { ...read(), notes: F.notes.value }, ev?.id || null); m.close(); toast('Evaluación guardada'); }
      catch (ex) { m.el.querySelector('[data-err]').textContent = ex.message; setBusy(btn, false); }
    };
  });
}

/** Gráfica de línea simple en SVG */
export function lineChart(points, { color = 'var(--brand)', unit = '', h = 150 } = {}) {
  const pts = points.filter((p) => p.y != null);
  if (pts.length < 2) return `<div class="chart-empty small muted">Se necesitan al menos 2 evaluaciones para ver la tendencia.</div>`;
  const W = 520, H = h, P = 28;
  const ys = pts.map((p) => p.y); let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const X = (i) => P + (i * (W - P * 2)) / (pts.length - 1);
  const Y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - P * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  return `<svg class="lchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <path d="${path} L${X(pts.length - 1)} ${H - P} L${X(0)} ${H - P}Z" fill="${color}" opacity=".10"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="4" fill="${color}"><title>${esc(p.x)}: ${num(p.y, 1)}${unit}</title></circle><text x="${X(i)}" y="${Y(p.y) - 9}" text-anchor="middle" class="lc-t">${num(p.y, 1)}</text><text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="lc-x">${esc(p.x)}</text>`).join('')}
  </svg>`;
}

export function evalPanelHTML(member, list) {
  if (!list.length) return `<div class="between mb"><b>Sin evaluaciones</b><button class="btn btn-primary btn-sm" data-ev-new>${icon('plus')} Primera evaluación</button></div>${emptyState('ruler', 'Mide su punto de partida', 'Peso, estatura y perímetros: Sano Gym calcula IMC, % de grasa, masa magra, riesgo cardiometabólico, calorías y proteína según su objetivo.')}`;
  const last = list[list.length - 1]; const prev = list.length > 1 ? list[list.length - 2] : null; const first = list[0];
  const c = evalCalc(last, member);
  const lab = (e) => fmtDate(e.date).slice(0, 5);
  const fatOf = (e) => evalCalc(e, member).fat;
  return `<div class="between mb row-wrap"><b>${list.length} evaluación(es) · última ${fmtDate(last.date)}</b><div class="row row-wrap"><button class="btn btn-secondary btn-sm" data-ev-print>${icon('print')} Informe</button><button class="btn btn-whatsapp btn-sm" data-ev-wa>${icon('whatsapp')} Enviar</button><button class="btn btn-primary btn-sm" data-ev-new>${icon('plus')} Nueva evaluación</button></div></div>
    ${resultsHTML(c, last, prev, member)}
    ${list.length > 1 ? `<div class="box small mt">${icon('trend')} Desde el ${fmtDate(first.date)}: peso <b>${num(last.weight - first.weight, 1)} kg</b>${first.waist && last.waist ? ` · cintura <b>${num(last.waist - first.waist, 1)} cm</b>` : ''}${fatOf(first) != null && c.fat != null ? ` · grasa <b>${num(c.fat - fatOf(first), 1)} %</b>` : ''}</div>` : ''}
    <div class="grid-2 mt"><div class="card"><div class="card-title">${icon('scale')} Peso (kg)</div>${lineChart(list.map((e) => ({ x: lab(e), y: e.weight })), { unit: ' kg' })}</div>
    <div class="card"><div class="card-title">${icon('flame')} % de grasa</div>${lineChart(list.map((e) => ({ x: lab(e), y: fatOf(e) })), { color: '#f97316', unit: ' %' })}</div></div>
    <div class="table-wrap mt"><table class="table"><thead><tr><th>Fecha</th><th class="r">Peso</th><th class="r">IMC</th><th class="r">% grasa</th><th class="r hide-sm">Cintura</th><th class="r hide-sm">Cadera</th><th class="r hide-sm">Brazo</th><th></th></tr></thead><tbody>
      ${[...list].reverse().map((e) => `<tr><td>${fmtDate(e.date)}${e.notes ? `<div class="t-sub">${esc(e.notes)}</div>` : ''}</td><td class="r num">${f1(e.weight)}</td><td class="r num">${f1(e.bmi)}</td><td class="r num">${f1(fatOf(e))}</td><td class="r num hide-sm">${f1(e.waist)}</td><td class="r num hide-sm">${f1(e.hip)}</td><td class="r num hide-sm">${f1(e.arm)}</td><td class="r nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-ev-ed="${e.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" data-ev-del="${e.id}">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>`;
}

export function bindEvalPanel(body, member, list, onNew, onChange) {
  body.querySelectorAll('[data-ev-new]').forEach((b) => b.onclick = onNew);
  body.querySelector('[data-ev-print]')?.addEventListener('click', () => printEval(member, list));
  body.querySelector('[data-ev-wa]')?.addEventListener('click', () => waMember('progreso', { member, evalTxt: evalText(member, list) }));
  body.querySelectorAll('[data-ev-ed]').forEach((b) => b.onclick = async () => { if (await evalModal(member, list.find((e) => e.id === b.dataset.evEd), list)) onChange(); });
  body.querySelectorAll('[data-ev-del]').forEach((b) => b.onclick = async () => {
    if (!(await requirePin('Eliminar una evaluación'))) return;
    if (!(await confirmDialog({ title: 'Eliminar evaluación', message: '¿Eliminar esta evaluación?', confirmText: 'Eliminar', danger: true }))) return;
    await deleteEvaluation({ id: b.dataset.evDel }); toast('Evaluación eliminada', 'warning'); onChange();
  });
}

function evalText(member, list) {
  const last = list[list.length - 1]; const first = list[0];
  const c = evalCalc(last, member);
  const lines = [`📅 ${fmtDate(last.date)}`, `⚖️ Peso: ${num(last.weight, 1)} kg${list.length > 1 ? ` (${last.weight - first.weight > 0 ? '+' : ''}${num(last.weight - first.weight, 1)} kg desde el inicio)` : ''}`];
  if (c.bmi) lines.push(`📐 IMC: ${num(c.bmi, 1)} (${c.bmiClass.label})`);
  if (c.fat != null) lines.push(`🔥 Grasa corporal: ${num(c.fat, 1)} % (${c.fatClass.label})`);
  if (last.waist) lines.push(`📏 Cintura: ${num(last.waist, 1)} cm`);
  if (c.energy) lines.push(`🍽️ Meta diaria: ${num(c.energy.target, 0)} kcal · ${c.energy.protein} g de proteína · ${num(c.energy.water, 1)} L de agua`);
  return lines.join('\n');
}

export function printEval(member, list) {
  const last = list[list.length - 1]; const c = evalCalc(last, member);
  const row = (k) => `<tr><td>${M[k].l}</td>${list.slice(-5).map((e) => `<td class="r">${e[k] != null && e[k] !== '' ? esc(e[k]) : '—'}</td>`).join('')}</tr>`;
  printDoc(`Evaluación física · ${member.name}`, `
    <div class="kpis"><div class="kpi">Socio<b>${esc(member.name)}</b>${esc(member.number || '')}</div><div class="kpi">Edad<b>${c.age ?? '—'}</b></div><div class="kpi">Objetivo<b>${esc(member.goal || '—')}</b></div><div class="kpi">Fecha<b>${fmtDate(last.date)}</b></div></div>
    <h2>Resultados</h2><table><tbody>
      <tr><td>Índice de masa corporal</td><td class="r"><b>${f1(c.bmi)}</b> ${c.bmiClass ? esc(c.bmiClass.label) : ''}</td></tr>
      <tr><td>% de grasa corporal</td><td class="r"><b>${c.fat != null ? f1(c.fat) + ' %' : '—'}</b> ${c.fatClass ? esc(c.fatClass.label) : ''}</td></tr>
      <tr><td>Masa magra / masa grasa</td><td class="r">${c.lean != null ? `${f1(c.lean)} kg / ${f1(c.fatMass)} kg` : '—'}</td></tr>
      <tr><td>Riesgo por cintura</td><td class="r">${c.risk ? esc(c.risk.label) + (c.risk.whr ? ` (ICC ${num(c.risk.whr, 2)})` : '') : '—'}</td></tr>
      <tr><td>Peso saludable para su estatura</td><td class="r">${c.ideal ? `${f1(c.ideal[0])} – ${f1(c.ideal[1])} kg` : '—'}</td></tr>
      ${c.energy ? `<tr><td>Metabolismo basal / gasto diario</td><td class="r">${num(c.energy.bmr, 0)} / ${num(c.energy.tdee, 0)} kcal</td></tr><tr><td>Meta diaria (${esc(c.energy.mode)})</td><td class="r"><b>${num(c.energy.target, 0)} kcal · ${c.energy.protein} g proteína · ${num(c.energy.water, 1)} L agua</b></td></tr>` : ''}
    </tbody></table>
    <h2>Evolución</h2><table><thead><tr><th>Medida</th>${list.slice(-5).map((e) => `<th class="r">${fmtDate(e.date)}</th>`).join('')}</tr></thead><tbody>${MEASURES.map(([k]) => k).filter((k) => list.some((e) => e[k])).map(row).join('')}</tbody></table>
    ${last.notes ? `<h2>Observaciones</h2><p>${esc(last.notes)}</p>` : ''}
    <p class="muted" style="font-size:10px">Valores de referencia: OMS (IMC y perímetro de cintura), método de la Marina de EE. UU. (% de grasa por perímetros), Mifflin-St Jeor (metabolismo basal). Orientativos: no sustituyen la evaluación médica.</p>`);
}
