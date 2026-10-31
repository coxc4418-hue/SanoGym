// Sano Gym — Rutinas: plantillas del gimnasio, biblioteca de ejercicios y rutinas asignadas
import { store } from '../store.js';
import { deleteRoutine } from '../ops.js';
import { EXERCISES, MUSCLE_GROUPS } from '../gym.js';
import { esc, emptyState, normalize, debounce, toast, confirmDialog, fmtAgo } from '../utils.js';
import { icon } from '../icons.js';
import { allTemplates, routineEditor, printRoutine, routineCardHTML } from '../routine.js';
import { avatar, hydratePhotos, openMember, pickMember } from '../member.js';
import { openModal } from '../utils.js';

export function mount(el) {
  let tab = 'plantillas';
  let group = ''; let q = '';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Rutinas y ejercicios</h1><p class="view-sub">Plantillas listas para asignar en segundos, y una biblioteca de ${EXERCISES.length} ejercicios.</p></div>
      <div class="view-actions"><button class="btn btn-secondary" id="rt-assign">${icon('userCheck')} Asignar a un socio</button><button class="btn btn-primary" id="rt-new">${icon('plus')} Nueva plantilla</button></div></div>
    <div class="card card-flush"><div class="tabs" id="rt-tabs" style="padding:0 12px"></div><div id="rt-b" style="padding:16px"></div></div>`;
  const $ = (s) => el.querySelector(s);

  const viewTpl = (t) => {
    const md = openModal({
      title: t.name, sub: `${esc(t.goal || '')}${t.level ? ' · ' + esc(t.level) : ''}${t.custom ? ' · plantilla del gimnasio' : ' · plantilla Sano Gym'}`, size: 'lg', body: routineCardHTML(t),
      footer: `${t.custom ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Eliminar</button>` : ''}<span class="grow"></span><button class="btn btn-ghost" data-print>${icon('print')} Imprimir</button><button class="btn btn-secondary" data-edit>${icon('edit')} ${t.custom ? 'Editar' : 'Copiar y personalizar'}</button><button class="btn btn-primary" data-assign>${icon('userCheck')} Asignar</button>`
    });
    const q2 = (s) => md.el.querySelector(s);
    q2('[data-print]').onclick = () => printRoutine(t);
    q2('[data-edit]').onclick = () => { md.close(); const copy = JSON.parse(JSON.stringify(t)); if (!t.custom) { delete copy.id; copy.name = `${t.name} (mi versión)`; } routineEditor(copy, { fresh: !t.custom }); };
    q2('[data-assign]').onclick = () => { md.close(); assign(t); };
    q2('[data-del]')?.addEventListener('click', async () => { if (!(await confirmDialog({ title: 'Eliminar plantilla', message: `¿Eliminar “${t.name}”? Las rutinas ya asignadas no cambian.`, confirmText: 'Eliminar', danger: true }))) return; await deleteRoutine(t); md.close(); toast('Plantilla eliminada'); });
  };

  async function assign(t = null) {
    const m = await pickMember({ title: t ? `Asignar: ${t.name}` : 'Asignar rutina', allowNew: false });
    if (!m) return;
    if (!t) { const { assignTemplate } = await import('../routine.js'); return assignTemplate(m); }
    const copy = JSON.parse(JSON.stringify({ name: t.name, goal: t.goal, level: t.level, weeks: t.weeks, note: t.note, days: t.days }));
    return routineEditor(copy, { member: m, fresh: true });
  }

  function render() {
    const assigned = store.members.filter((m) => m.active !== false && m.routineId);
    const T = { plantillas: `Plantillas (${allTemplates().length})`, ejercicios: `Biblioteca (${EXERCISES.length})`, asignadas: `Asignadas (${assigned.length})` };
    $('#rt-tabs').innerHTML = Object.entries(T).map(([k, v]) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${v}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); });
    const B = $('#rt-b');
    if (tab === 'plantillas') {
      const list = allTemplates();
      B.innerHTML = `<div class="tpl-grid">${list.map((t, i) => `<button type="button" class="tpl" data-i="${i}">${t.custom ? '<span class="plan-flag alt">Del gimnasio</span>' : ''}<b>${esc(t.name)}</b><small>${esc(t.goal || '')} · ${esc(t.level || '')}${t.weeks ? ` · ${t.weeks} sem.` : ''}</small><span class="t-sub">${(t.days || []).length} día(s) · ${(t.days || []).reduce((a, d) => a + (d.items || []).length, 0)} ejercicios</span></button>`).join('')}</div>`;
      B.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => viewTpl(list[Number(b.dataset.i)]));
    } else if (tab === 'ejercicios') {
      B.innerHTML = `<div class="stack"><div class="search">${icon('search')}<input class="input" id="ex-q" placeholder="Buscar ejercicio o equipo…" value="${esc(q)}"></div><div class="chips chips-wrap" id="ex-g"></div><div class="ex-grid" id="ex-l"></div></div>`;
      const draw = () => {
        B.querySelector('#ex-g').innerHTML = ['', ...MUSCLE_GROUPS].map((g) => `<button class="chip ${g === group ? 'on' : ''}" data-g="${esc(g)}">${g || 'Todos'}</button>`).join('');
        B.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { group = b.dataset.g; draw(); });
        const t = normalize(q);
        const list = EXERCISES.filter((e) => (!group || e.group === group) && (!t || normalize(`${e.name} ${e.eq} ${e.group}`).includes(t)));
        B.querySelector('#ex-l').innerHTML = list.map((e) => `<div class="ex"><b>${esc(e.name)}</b><small>${esc(e.group)} · ${esc(e.eq)}</small></div>`).join('') || emptyState('search', 'Sin resultados');
      };
      B.querySelector('#ex-q').oninput = debounce((e) => { q = e.target.value; draw(); }, 100);
      draw();
    } else {
      B.innerHTML = assigned.length ? `<div class="list">${assigned.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map((m) => `<button class="list-item" data-m="${m.id}">${avatar(m)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(m.name)}</b><div class="t-sub">${icon('dumbbell')} ${esc(m.routineName || 'Rutina')}${m.goal ? ' · ' + esc(m.goal) : ''}${store.trainer(m.trainerId) ? ' · ' + esc(store.trainer(m.trainerId).name) : ''}</div></div><span class="small muted">${m.updatedAt ? fmtAgo(m.updatedAt) : ''}</span></button>`).join('')}</div>`
        : emptyState('dumbbell', 'Ningún socio tiene rutina asignada', 'Asigna una plantilla desde aquí o desde la ficha del socio (pestaña Rutina). Queda en su carnet digital.');
      B.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => openMember(b.dataset.m, { tab: 'rutina' }));
      hydratePhotos(B);
    }
  }
  $('#rt-new').onclick = () => routineEditor(null);
  $('#rt-assign').onclick = () => assign();
  render();
  const off = store.on('*', (e) => { if (e === 'templates' || (e === 'members' && tab === 'asignadas')) render(); });
  return () => off();
}
