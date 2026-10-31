// Sano Gym — Socios: lista con filtros por estado, búsqueda, importar y exportar
import { store, memberStatus, statusBadge, MEMBER_STATUS, daysLeft, SEX } from '../store.js';
import { saveMember } from '../ops.js';
import { esc, usd, normalize, debounce, emptyState, fmtDate, fmtAgo, toast, download, toCSV, parseCSV, openModal, setBusy, loc, todayKey } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos, openMember, memberForm } from '../member.js';
import { membershipLine } from '../membership.js';
import { ageOf } from '../gym.js';

const FILTERS = [
  ['vigentes', 'Vigentes'], ['por_vencer', 'Por vencer'], ['vencido', 'Vencidos'], ['congelado', 'Congelados'], ['deuda', 'Con deuda'],
  ['riesgo', 'Sin venir +10 días'], ['sin_plan', 'Sin membresía'], ['todos', 'Todos'], ['baja', 'De baja']
];
const PAGE = 60;

export function mount(el, { params = {} }) {
  let filter = params.filter || 'vigentes';
  let q = '';
  let sort = 'name';
  let shown = PAGE;
  let trainer = '';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Socios</h1><p class="view-sub" id="m-sub"></p></div>
      <div class="view-actions"><button class="btn btn-ghost" id="m-imp">${icon('upload')} Importar</button><button class="btn btn-ghost" id="m-exp">${icon('download')} Exportar</button><button class="btn btn-primary" id="m-new">${icon('userPlus')} Nuevo socio</button></div></div>
    <div class="card card-flush">
      <div class="toolbar" style="padding:14px 16px 0">
        <div class="search grow m-search"><span>${icon('search')}</span><input class="input" id="m-q" placeholder="Nombre, ${esc(loc().id.toLowerCase())}, N° de socio, teléfono o etiqueta…"></div>
        <select class="select" id="m-tr" style="max-width:190px"><option value="">Todos los entrenadores</option>${store.activeTrainers.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        <select class="select" id="m-sort" style="max-width:190px"><option value="name">Orden: nombre</option><option value="end">Vence primero</option><option value="last">Última visita</option><option value="new">Más recientes</option><option value="visits">Más asistencias</option><option value="debt">Mayor deuda</option></select>
      </div>
      <div class="chips" id="m-f" style="padding:12px 16px 0" data-tour="filters"></div>
      <div id="m-list" class="mt"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  function counts() {
    const t = todayKey(); const c = {};
    const risk = new Set(store.atRisk(10).map((m) => m.id));
    for (const m of store.members) {
      const s = memberStatus(m, t);
      c[s] = (c[s] || 0) + 1;
      if (s === 'activo' || s === 'por_vencer') c.vigentes = (c.vigentes || 0) + 1;
      if (m.active !== false) c.todos = (c.todos || 0) + 1;
      if (m.active !== false && (Number(m.balance) || 0) > 0.009) c.deuda = (c.deuda || 0) + 1;
      if (risk.has(m.id)) c.riesgo = (c.riesgo || 0) + 1;
    }
    c.vencido = (c.vencido || 0) + (c.agotado || 0);
    return { c, risk };
  }

  function rows() {
    const t = todayKey(); const { risk } = counts();
    const nq = normalize(q);
    let list = store.members.filter((m) => {
      const s = memberStatus(m, t);
      if (!nq) {
        if (filter === 'vigentes' && !['activo', 'por_vencer'].includes(s)) return false;
        if (filter === 'vencido' && !['vencido', 'agotado'].includes(s)) return false;
        if (['por_vencer', 'congelado', 'sin_plan', 'baja'].includes(filter) && s !== filter) return false;
        if (filter === 'deuda' && !(m.active !== false && (Number(m.balance) || 0) > 0.009)) return false;
        if (filter === 'riesgo' && !risk.has(m.id)) return false;
        if (filter === 'todos' && m.active === false) return false;
      }
      if (trainer && m.trainerId !== trainer && m.membership?.trainerId !== trainer) return false;
      if (nq && !normalize(`${m.name} ${m.idDoc || ''} ${m.number} ${m.phone || ''} ${m.email || ''} ${(m.tags || []).join(' ')} ${m.membership?.planName || ''}`).includes(nq)) return false;
      return true;
    });
    const S = {
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
      end: (a, b) => (a.membership?.end || '9').localeCompare(b.membership?.end || '9'),
      last: (a, b) => (b.lastCheckinAt || '').localeCompare(a.lastCheckinAt || ''),
      new: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
      visits: (a, b) => (b.visits || 0) - (a.visits || 0),
      debt: (a, b) => (b.balance || 0) - (a.balance || 0)
    };
    return list.sort(S[sort]);
  }

  function render() {
    const { c } = counts();
    $('#m-sub').textContent = `${store.activeMembers.length} activo(s) de ${store.liveMembers.length} socio(s) registrados`;
    $('#m-f').innerHTML = FILTERS.map(([k, v]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${v} <b>${c[k] || 0}</b></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; shown = PAGE; q = ''; $('#m-q').value = ''; render(); });
    const list = rows();
    if (!list.length) {
      $('#m-list').innerHTML = `<div style="padding:8px 16px 20px">${store.members.length ? emptyState('users', 'Nadie en este filtro', q ? 'Prueba con otra búsqueda.' : '') : emptyState('users', 'Aún no hay socios', 'Registra tu primer socio o importa tu lista desde Excel (CSV).')}</div>`;
      return;
    }
    const t = todayKey();
    $('#m-list').innerHTML = `<div class="table-wrap"><table class="table table-hover"><thead><tr><th>Socio</th><th>Membresía</th><th class="hide-sm">Última visita</th><th class="r hide-sm">Asist.</th><th class="r hide-sm">Estado</th></tr></thead><tbody>
      ${list.slice(0, shown).map((m) => {
        const s = memberStatus(m, t); const dl = daysLeft(m, t); const debt = Number(m.balance) || 0;
        return `<tr data-id="${m.id}" style="cursor:pointer"><td><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(m)}<div style="min-width:0"><b class="ellipsis">${esc(m.name)}</b><div class="t-sub">${esc(m.number)}${m.idDoc ? ' · ' + esc(m.idDoc) : ''}${m.birthDate ? ` · ${ageOf(m.birthDate)} años` : ''}</div></div></div></td>
          <td>${m.membership ? `<b class="small">${esc(m.membership.planName)}</b><div class="t-sub">${membershipLine(m, false)}</div>` : '<span class="faint small">—</span>'}${debt > 0.009 ? `<div class="small text-danger">Debe ${usd(debt)}</div>` : ''}</td>
          <td class="hide-sm small">${m.lastCheckinAt ? fmtAgo(m.lastCheckinAt) : '<span class="faint">nunca</span>'}</td>
          <td class="r hide-sm num">${m.visits || 0}</td>
          <td class="r hide-sm">${statusBadge(s)}${dl != null && s === 'por_vencer' ? `<div class="t-sub">${dl === 0 ? 'vence hoy' : `${dl} día(s)`}</div>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${list.length > shown ? `<div class="center" style="padding:14px"><button class="btn btn-ghost" id="m-more">Ver ${Math.min(PAGE, list.length - shown)} más (${list.length - shown} restantes)</button></div>` : `<div class="center small faint" style="padding:12px">${list.length} socio(s)</div>`}`;
    el.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => openMember(tr.dataset.id));
    $('#m-more')?.addEventListener('click', () => { shown += PAGE; render(); });
    hydratePhotos($('#m-list'), shown);
  }

  $('#m-q').oninput = debounce((e) => { q = e.target.value.trim(); shown = PAGE; render(); }, 150);
  $('#m-sort').onchange = (e) => { sort = e.target.value; render(); };
  $('#m-tr').onchange = (e) => { trainer = e.target.value; render(); };
  $('#m-new').onclick = async () => { const m = await memberForm(); if (m) { const { sellModal } = await import('../membership.js'); sellModal(m); } };
  $('#m-exp').onclick = () => exportCSV(rows());
  $('#m-imp').onclick = () => importCSV();
  render();
  const off = store.on('*', (e) => { if (e === 'members' || e === 'settings') render(); });
  return () => off();
}

function exportCSV(list) {
  const t = todayKey();
  const head = ['N° socio', 'Nombre', loc().id, 'Teléfono', 'Correo', 'Sexo', 'Nacimiento', 'Objetivo', 'Plan', 'Inicio', 'Vence', 'Estado', 'Deuda', 'Asistencias', 'Última visita', 'Registrado'];
  const data = list.map((m) => [m.number, m.name, m.idDoc || '', m.phone || '', m.email || '', SEX[m.sex] || '', m.birthDate || '', m.goal || '', m.membership?.planName || '', m.membership?.start || '', m.membership?.end || '',
    MEMBER_STATUS[memberStatus(m, t)]?.label || '', Number(m.balance) || 0, m.visits || 0, (m.lastCheckinAt || '').slice(0, 10), (m.createdAt || '').slice(0, 10)]);
  download(`socios-${t}.csv`, '﻿' + toCSV([head, ...data]), 'text/csv;charset=utf-8');
  toast(`${data.length} socio(s) exportados`);
}

/** Importa socios desde CSV (Excel → Guardar como CSV). Detecta columnas por su nombre. */
function importCSV() {
  const m = openModal({
    title: 'Importar socios', sub: 'Desde Excel o Google Sheets guardado como CSV', size: 'md',
    body: `<div class="stack"><p class="small" style="margin:0">La primera fila debe tener los títulos. Se reconocen: <b>Nombre</b> (obligatorio), <b>Cédula/Documento</b>, <b>Teléfono</b>, <b>Correo</b>, <b>Nacimiento</b> (AAAA-MM-DD o DD/MM/AAAA), <b>Sexo</b> (F/M), <b>Objetivo</b>, <b>Notas</b>. Los documentos repetidos se omiten.</p>
      <input type="file" accept=".csv,text/csv" class="input" data-file><div data-prev></div><div class="error-msg" data-err></div></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('upload')} Importar</button>`
  });
  let parsed = [];
  const pick = (h, ...keys) => h.findIndex((x) => keys.some((k) => normalize(x).includes(k)));
  const toDate = (v) => {
    const s = String(v || '').trim(); if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
    if (!d) return '';
    const y = d[3].length === 2 ? (Number(d[3]) > 30 ? '19' : '20') + d[3] : d[3];
    return `${y}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  };
  m.el.querySelector('[data-file]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rowsIn = parseCSV(await f.text()).filter((r) => r.some((x) => String(x).trim()));
    const h = rowsIn.shift() || [];
    const ix = { name: pick(h, 'nombre', 'name', 'socio', 'cliente'), idDoc: pick(h, 'cedula', 'documento', 'dni', 'ci', 'rut', 'curp', 'id'), phone: pick(h, 'telefono', 'celular', 'whatsapp', 'movil', 'phone'), email: pick(h, 'correo', 'email', 'mail'), birthDate: pick(h, 'nacimiento', 'fecha nac', 'cumple', 'birth'), sex: pick(h, 'sexo', 'genero'), goal: pick(h, 'objetivo', 'meta'), notes: pick(h, 'nota', 'observ') };
    if (ix.name < 0) { m.el.querySelector('[data-err]').textContent = 'No encontré una columna “Nombre”.'; return; }
    const seen = new Set();
    parsed = rowsIn.map((r) => {
      const g = (k) => (ix[k] >= 0 ? String(r[ix[k]] ?? '').trim() : '');
      const sx = normalize(g('sex'))[0];
      return { name: g('name'), idDoc: g('idDoc'), phone: g('phone'), email: g('email'), birthDate: toDate(g('birthDate')), sex: sx === 'f' ? 'F' : sx === 'm' ? 'M' : '', goal: g('goal'), notes: g('notes') };
    }).filter((x) => {
      if (!x.name) return false;
      const k = x.idDoc.replace(/\D/g, '');
      if (k.length >= 5) { if (seen.has(k) || store.members.some((y) => String(y.idDoc || '').replace(/\D/g, '') === k)) return false; seen.add(k); }
      return true;
    });
    m.el.querySelector('[data-prev]').innerHTML = `<div class="box small"><b>${parsed.length}</b> socio(s) nuevos listos para importar${rowsIn.length - parsed.length ? ` · ${rowsIn.length - parsed.length} omitido(s) por estar repetidos o sin nombre` : ''}.<div class="t-sub mt-xs">${parsed.slice(0, 4).map((x) => esc(x.name)).join(' · ')}${parsed.length > 4 ? '…' : ''}</div></div>`;
    m.el.querySelector('[data-ok]').disabled = !parsed.length;
  };
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const btn = e.currentTarget; setBusy(btn, true, 'Importando…');
    let ok = 0;
    for (const x of parsed) {
      try { await saveMember(x); ok++; btn.textContent = `Importando ${ok}/${parsed.length}…`; } catch (err) { console.warn(err.message); }
    }
    m.close(); toast(`${ok} socio(s) importados`);
  };
}
