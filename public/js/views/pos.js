// Sano Gym — Vender: membresías, servicios de mostrador y tienda (suplementos, bebidas, accesorios)
import { store } from '../store.js';
import { chargeSale, cartTotals } from '../ops.js';
import { esc, usd, num, toast, normalize, debounce, emptyState, qtyFmt, parseNum, round2, promptDialog } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt, notifyLowStock } from '../shared.js';
import { openPay, showPaid } from '../pay.js';
import { pickMember } from '../member.js';
import { PLAN_KINDS, pricePerDay } from '../gym.js';

const PROD_ICON = (c = '') => /prote|suplem/i.test(c) ? 'flame' : /bebid/i.test(c) ? 'droplet' : /snack/i.test(c) ? 'box' : /ropa/i.test(c) ? 'tag' : /acces/i.test(c) ? 'dumbbell' : 'box';
const SVC_ICON = (n = '') => /toalla/i.test(n) ? 'droplet' : /locker|casillero/i.test(n) ? 'lock' : /clase/i.test(n) ? 'calendar' : /evalua/i.test(n) ? 'ruler' : /nutri/i.test(n) ? 'target' : /carnet/i.test(n) ? 'ticket' : 'star';

export function mount(el) {
  let tab = 'planes';
  let search = '';
  let cart = [];
  let member = null;

  el.innerHTML = `<div class="pos">
    <div class="pos-main">
      <div class="pos-head">
        <div class="row"><label class="search" style="flex:1">${icon('search')}<input id="pos-search" placeholder="Buscar plan, servicio, producto o código de barras…" autocomplete="off"></label></div>
        <div class="chips" id="pos-tabs" data-tour="pos-tabs"></div>
      </div>
      <div class="pos-grid-wrap"><div class="pgrid" id="pos-grid"></div></div>
    </div>
    <div class="cart-backdrop" id="cart-bd"></div>
    <aside class="cart" id="cart">
      <div class="cart-head"><div class="between"><b style="font-size:16px">Cobro</b><button class="btn btn-ghost btn-sm" id="c-clear">${icon('trash')} Vaciar</button></div>
        <div class="cart-ctx"><button class="btn btn-secondary btn-sm" id="c-pt">${icon('user')} <span class="ellipsis" id="c-pt-l">Cliente de mostrador</span></button></div></div>
      <div class="cart-list" id="c-list"></div>
      <div class="cart-foot">
        <div class="cart-grand"><span class="lbl">Total</span><div class="val"><b id="c-total">${usd(0)}</b></div></div>
        <button class="btn btn-success btn-xl btn-block" id="c-pay">${icon('check')} Cobrar</button>
      </div>
    </aside>
    <button class="cart-fab" id="cart-fab"><span><span class="cnt" id="fab-n">0</span>Ver cobro</span><b id="fab-t">$ 0,00</b></button>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const sellable = () => store.products.filter((p) => p.active !== false && p.sellable !== false);

  function renderTabs() {
    const cats = [...new Set(sellable().map((p) => p.category).filter(Boolean))];
    $('#pos-tabs').innerHTML = [['planes', 'Membresías'], ['servicios', 'Servicios'], ['all', 'Tienda'], ...cats.map((c) => [c, c])].map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-tab="${esc(k)}">${esc(l)}</button>`).join('');
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderTabs(); renderGrid(); });
  }

  const inCart = (key) => cart.find((l) => l.key === key)?.qty || 0;
  function renderGrid() {
    const t = normalize(search);
    const plans = store.activePlans.filter((p) => !t || normalize(p.name).includes(t));
    const svcs = (store.settings.services || []).filter((s) => s.name && (!t || normalize(s.name).includes(t)));
    const prods = sellable().filter((p) => (['all', 'planes', 'servicios'].includes(tab) ? true : p.category === tab) && (!t || normalize(`${p.name} ${p.sku || ''} ${p.category}`).includes(t)));
    const show = (k) => (t ? true : k === 'planes' ? tab === 'planes' : k === 'servicios' ? tab === 'servicios' : !['planes', 'servicios'].includes(tab));
    const best = Math.min(...store.activePlans.filter((p) => p.kind === 'tiempo' && planDays(p) >= 28).map((p) => pricePerDay(p) || 1e9));
    const planHTML = show('planes') ? plans.map((p) => `<button class="pcard pcard-plan" data-plan="${p.id}">${p.popular ? '<span class="pcard-flag badge badge-success">Más vendido</span>' : pricePerDay(p) === best ? '<span class="pcard-flag badge badge-info">Mejor precio</span>' : ''}
      <div class="pcard-media" style="--pc:var(--brand-soft)"><span class="pcard-ic">${icon(p.kind === 'pase' ? 'ticket' : p.kind === 'sesiones' ? 'target' : p.personal ? 'user' : 'dumbbell')}</span></div>
      <div class="pcard-name">${esc(p.name)}</div><div class="t-sub">${esc(PLAN_KINDS[p.kind]?.label || '')}${p.kind === 'sesiones' ? ` · ${p.visits} sesiones` : ''}</div>
      <div class="pcard-price"><b>${usd(p.price)}</b></div></button>`).join('') : '';
    const svcHTML = show('servicios') ? svcs.map((s) => `<button class="pcard" data-s="${esc(s.name)}">${inCart('s:' + s.name) ? `<span class="pcard-qty">${qtyFmt(inCart('s:' + s.name))}</span>` : ''}
      <div class="pcard-media" style="--pc:var(--surface-2)"><span class="pcard-ic">${icon(SVC_ICON(s.name))}</span></div><div class="pcard-name">${esc(s.name)}</div>
      <div class="pcard-price"><b>${usd(s.price)}</b></div></button>`).join('') : '';
    const prodHTML = show('tienda') ? prods.map((p) => {
      const stock = Number(p.stock) || 0; const tracked = p.trackStock !== false;
      const out = tracked && stock - inCart('p:' + p.id) <= 0;
      return `<button class="pcard" data-p="${p.id}" ${out ? 'disabled' : ''}>
        ${inCart('p:' + p.id) ? `<span class="pcard-qty">${qtyFmt(inCart('p:' + p.id))}</span>` : ''}
        ${tracked ? `<span class="pcard-flag badge ${stock <= 0 ? 'badge-danger' : stock <= (p.minStock || 0) ? 'badge-warning' : 'badge-neutral'}">${stock <= 0 ? 'Agotado' : qtyFmt(stock)}</span>` : ''}
        <div class="pcard-media" style="--pc:${p.color || 'var(--surface-2)'}">${p.image ? `<img src="${p.image}" alt="">` : `<span class="pcard-ic">${icon(PROD_ICON(p.category))}</span>`}</div>
        <div class="pcard-name">${esc(p.name)}</div>
        <div class="pcard-price"><b>${usd(p.price)}</b></div>
      </button>`;
    }).join('') : '';
    $('#pos-grid').innerHTML = planHTML + svcHTML + prodHTML || `<div style="grid-column:1/-1">${tab === 'planes' ? emptyState('ticket', 'Sin planes activos', 'Crea tus planes y precios en Configuración › Planes.') : tab === 'servicios' ? emptyState('star', 'Sin servicios', 'Agrega servicios de mostrador (toalla, locker, clase suelta…) en Configuración › Planes.') : emptyState('box', 'Sin productos para vender', 'Agrega suplementos, bebidas y accesorios en Tienda e inventario.')}</div>`;
    el.querySelectorAll('[data-plan]').forEach((b) => b.onclick = () => sellPlan(store.plan(b.dataset.plan)));
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { const s = store.settings.services.find((x) => x.name === b.dataset.s); if (s) addLine({ key: 's:' + s.name, productId: null, name: s.name, price: Number(s.price) || 0, cost: 0 }); });
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { const p = store.product(b.dataset.p); if (p) addLine({ key: 'p:' + p.id, productId: p.id, name: p.name, price: Number(p.price) || 0, cost: Number(p.cost) || 0 }, p); });
  }
  const planDays = (p) => (Number(p.months) > 0 ? p.months * 30 : Number(p.days) || 1);

  /** Las membresías se venden con su propio flujo (inicio, vencimiento, inscripción, abonos) */
  async function sellPlan(plan) {
    if (!plan) return;
    const m = member || await pickMember({ title: `Vender: ${plan.name}`, allowNew: true });
    if (!m) return;
    const { sellModal } = await import('../membership.js');
    const out = await sellModal(m, { planId: plan.id });
    if (out?.member) { member = null; renderCart(); }
  }

  function addLine(item, p = null, qty = 1) {
    const line = cart.find((l) => l.key === item.key);
    const have = (line?.qty || 0) + qty;
    if (p && p.trackStock !== false && have > (Number(p.stock) || 0)) { toast(`Solo quedan ${qtyFmt(p.stock || 0)} de ${p.name}`, 'warning'); return; }
    if (line) line.qty = have; else cart.push({ ...item, qty });
    renderCart(); renderGrid();
  }

  function renderCart() {
    const t = cartTotals(cart);
    $('#c-list').innerHTML = cart.length ? cart.map((l, i) => `<div class="cline">
      <div class="cline-name">${esc(l.name)}</div><div class="cline-total">${usd(l.price * l.qty)}</div>
      <div class="cline-meta"><button class="linkish" data-price="${i}">${usd(l.price)} c/u ${icon('edit')}</button></div>
      <div class="cline-actions"><div class="stepper"><button data-dec="${i}" aria-label="Menos">${icon('minus')}</button><span>${qtyFmt(l.qty)}</span><button data-inc="${i}" aria-label="Más">${icon('plus')}</button></div><button class="btn btn-ghost btn-icon btn-sm" data-del="${i}" aria-label="Quitar">${icon('x')}</button></div>
    </div>`).join('') : `<div class="empty">${icon('cart')}<b>Nada por cobrar</b><span>Toca un producto o servicio. Las membresías se venden con su propio flujo (fechas, inscripción y abonos).</span></div>`;
    $('#c-total').textContent = usd(t.total);
    $('#fab-n').textContent = cart.reduce((a, l) => a + l.qty, 0); $('#fab-t').textContent = usd(t.total);
    $('#c-pay').disabled = !cart.length;
    $('#c-pt-l').textContent = member ? `${member.name} · ${member.number}` : 'Cliente de mostrador';
    el.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { const l = cart[+b.dataset.inc]; addLine(l, l.productId ? store.product(l.productId) : null); });
    el.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const l = cart[+b.dataset.dec]; l.qty -= 1; if (l.qty <= 0) cart.splice(+b.dataset.dec, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { cart.splice(+b.dataset.del, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-price]').forEach((b) => b.onclick = async () => {
      const l = cart[+b.dataset.price];
      const v = await promptDialog({ title: 'Precio', label: `${l.name}`, value: num(l.price), confirmText: 'Aplicar' });
      if (v != null && parseNum(v) >= 0) { l.price = round2(parseNum(v)); renderCart(); }
    });
  }

  async function pay() {
    if (!cart.length) return;
    const t = cartTotals(cart);
    await openPay({
      title: 'Cobrar', sub: esc(member?.name || 'Cliente de mostrador'), amount: t.total, baseTotal: t.total, discount: true, printLabel: 'Imprimir recibo',
      onConfirm: async (res) => {
        const out = await chargeSale({ lines: cart.map(({ key, ...l }) => l), member, discount: res.discount, payments: res.payments });
        if (res.print) printReceipt(out.sale);
        notifyLowStock(out.low);
        showPaid(out.sale, { title: 'Venta registrada', onPrint: () => printReceipt(out.sale) });
        cart = []; member = null; closeCart(); renderCart(); renderGrid();
        return out;
      }
    });
  }

  const openCart = () => { $('#cart').classList.add('open'); $('#cart-bd').classList.add('open'); };
  const closeCart = () => { $('#cart').classList.remove('open'); $('#cart-bd').classList.remove('open'); };
  $('#cart-fab').onclick = openCart; $('#cart-bd').onclick = closeCart;
  $('#c-pay').onclick = pay;
  $('#c-pt').onclick = async () => { const p = await pickMember({ title: '¿A qué socio se le vende?', allowNew: false }); if (p) { member = p; renderCart(); } };
  $('#c-clear').onclick = () => { cart = []; member = null; renderCart(); renderGrid(); };
  const sInp = $('#pos-search');
  sInp.oninput = debounce((e) => { search = e.target.value; renderGrid(); }, 100);
  sInp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const v = sInp.value.trim().toLowerCase(); if (!v) return;
    const exact = sellable().find((p) => (p.sku || '').toLowerCase() === v);
    if (exact) { addLine({ key: 'p:' + exact.id, productId: exact.id, name: exact.name, price: Number(exact.price) || 0, cost: Number(exact.cost) || 0 }, exact); sInp.value = ''; search = ''; renderGrid(); }
  };
  renderTabs(); renderGrid(); renderCart();
  return store.on('*', (evt) => {
    if (evt === 'products') { renderTabs(); renderGrid(); }
    if (evt === 'settings') { renderGrid(); renderCart(); }
  });
}
