// Sano Gym — Búsqueda global (Ctrl + K): socios, recibos, clases y productos
import { store, memberStatus, statusBadge } from '../store.js';
import { openModal, esc, usd, normalize, debounce, qtyFmt, fmtDate, fmtAgo } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, hydratePhotos } from '../member.js';
import { membershipLine } from '../membership.js';

export function openSearch() {
  if (document.querySelector('.search-modal')) return;
  const m = openModal({
    size: 'lg',
    body: `<div class="search search-big">${icon('search')}<input data-q placeholder="Socio, documento, teléfono, N° de socio (S-0012), código del carnet o recibo (F-000045)…" autofocus autocomplete="off"><kbd>Esc</kbd></div><div data-res class="search-results"></div>`
  });
  m.el.querySelector('.modal').classList.add('search-modal');
  const input = m.el.querySelector('[data-q]');
  const res = m.el.querySelector('[data-res]');
  let token = 0;

  async function run() {
    const raw = input.value.trim();
    const t = normalize(raw);
    const digits = raw.replace(/\D/g, '');
    const my = ++token;
    if (!t) { res.innerHTML = hint(); bind(); return; }
    const exact = store.findMember(raw);
    const mems = [...(exact ? [exact] : []), ...store.members.filter((p) => p !== exact && (normalize(`${p.name} ${p.number} ${p.email || ''} ${(p.tags || []).join(' ')}`).includes(t)
      || (digits.length >= 3 && (`${p.idDoc || ''}`.replace(/\D/g, '').includes(digits) || `${p.phone || ''}`.replace(/\D/g, '').includes(digits)))))].slice(0, 8);
    const sales = store.recentSales.filter((s) => normalize(`${s.number} ${s.memberName}`).includes(t)).slice(0, 5);
    const cls = store.settings.classes.filter((c) => c.active !== false && normalize(c.name).includes(t)).slice(0, 4);
    const prods = store.products.filter((p) => normalize(`${p.name} ${p.sku || ''}`).includes(t)).slice(0, 5);
    draw(mems, sales, cls, prods);
    // Recibos antiguos: búsqueda exacta por número
    const up = raw.toUpperCase().replace(/\s/g, '');
    const pre = (store.settings.invoicePrefix || 'F').toUpperCase();
    let num = null;
    if (new RegExp(`^${pre}-?\\d+$`).test(up)) num = `${pre}-` + up.replace(/\D/g, '').padStart(6, '0');
    if (!num) return;
    let found = [];
    try { found = await store.listEq('sales', 'number', num); } catch (_) {}
    if (my !== token) return;
    const extra = found.filter((s) => !sales.some((x) => x.id === s.id));
    if (extra.length) draw(mems, [...extra, ...sales], cls, prods);
  }

  function draw(mems, sales, cls, prods) {
    res.innerHTML = (mems.length || sales.length || cls.length || prods.length) ? `
      ${mems.length ? `<div class="section-title">Socios</div>${mems.map((p) => `<button class="sitem" data-m="${p.id}">${avatar(p)}<span class="grow"><b>${esc(p.name)}</b><small>${esc(p.number)}${p.idDoc ? ' · ' + esc(p.idDoc) : ''} · ${membershipLine(p)}</small></span>${statusBadge(memberStatus(p))}</button>`).join('')}` : ''}
      ${sales.length ? `<div class="section-title">Recibos</div>${sales.map((s) => `<button class="sitem" data-s="${s.id}"><span class="kpi-icon tone-violet" style="width:36px;height:36px">${icon('file')}</span><span class="grow"><b>${esc(s.number)} · ${esc(s.memberName)}</b><small>${fmtDate(s.date)} · ${esc((s.items || []).map((i) => i.name).join(' + ')).slice(0, 80)}</small></span><b>${usd(s.total)}</b></button>`).join('')}` : ''}
      ${cls.length ? `<div class="section-title">Clases</div>${cls.map((c) => `<button class="sitem" data-c="${c.id}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon('calendar')}</span><span class="grow"><b>${esc(c.name)} · ${esc(c.time)}</b><small>${esc(store.trainer(c.trainerId)?.name || '')}${c.room ? ' · ' + esc(c.room) : ''}</small></span></button>`).join('')}` : ''}
      ${prods.length ? `<div class="section-title">Tienda</div>${prods.map((p) => `<button class="sitem" data-p="${p.id}"><span class="kpi-icon tone-info" style="width:36px;height:36px">${icon('box')}</span><span class="grow"><b>${esc(p.name)}</b><small>${p.trackStock !== false ? `Existencia: ${qtyFmt(p.stock || 0)}` : 'Sin control de existencia'}</small></span><b>${usd(p.price)}</b></button>`).join('')}` : ''}`
      : `<div class="empty">${icon('search')}<b>Sin resultados</b><span>Para recibos antiguos escribe el número exacto (ej. F-000045).</span></div>`;
    bind();
  }

  function hint() {
    const list = store.members.filter((p) => p.lastCheckinAt).sort((a, b) => b.lastCheckinAt.localeCompare(a.lastCheckinAt)).slice(0, 6);
    return list.length ? `<div class="section-title">Entraron recientemente</div>${list.map((p) => `<button class="sitem" data-m="${p.id}">${avatar(p)}<span class="grow"><b>${esc(p.name)}</b><small>${fmtAgo(p.lastCheckinAt)} · ${membershipLine(p)}</small></span>${statusBadge(memberStatus(p))}</button>`).join('')}`
      : `<div class="empty">${icon('search')}<b>Busca en todo el gimnasio</b><span>Socios, recibos, clases y productos.</span></div>`;
  }

  function bind() {
    hydratePhotos(res, 14);
    res.querySelectorAll('[data-m]').forEach((b) => b.onclick = async () => { m.close(); (await import('../member.js')).openMember(b.dataset.m); });
    res.querySelectorAll('[data-s]').forEach((b) => b.onclick = async () => { m.close(); (await import('../main.js')).navigate('facturas', { params: { q: b.querySelector('b').textContent.split(' · ')[0] } }); });
    res.querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => { m.close(); (await import('../main.js')).navigate('clases'); });
    res.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { m.close(); (await import('../main.js')).navigate('inventario', { params: { q: store.product(b.dataset.p)?.name || '' } }); });
  }

  input.oninput = debounce(run, 140);
  input.onkeydown = (e) => { if (e.key === 'Enter') { const first = res.querySelector('.sitem'); if (first) first.click(); } };
  res.innerHTML = hint(); bind();
}
