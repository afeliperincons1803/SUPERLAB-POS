const state = { user:null, store:null, categories:[], products:[], toppings:[], inventory:[], cart:[], category:'all', search:'', cash:null, reports:null, chart:null };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const fmt = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value || 0)).replace('COP','$');
const dateFmt = value => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(value));
const POTENCIADORES_LAB = [
  {code:'booster_8', name:'Fórmula X 8 ml', price:3000},
  {code:'booster_20', name:'Fórmula X Max 20 ml', price:5000},
];

async function api(path, options={}) {
  const response = await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data = await response.json().catch(()=>({}));
  if (response.status === 401) { location.href='/'; throw new Error('Sesión vencida'); }
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la acción');
  return data;
}

function toast(message, type='success') {
  const node = document.createElement('div');
  node.className = `toast ${type}`; node.textContent = message;
  Object.assign(node.style,{position:'fixed',right:'22px',bottom:'22px',background:type==='error'?'#e5484d':'#15233f',color:'#fff',padding:'13px 17px',borderRadius:'10px',zIndex:100,fontSize:'12px',boxShadow:'0 12px 35px rgba(0,0,0,.2)'});
  $('#toast-root').append(node); setTimeout(()=>node.remove(),3200);
}

function openModal(html) { $('#modal-body').innerHTML=html; $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden','false'); }
function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden','true'); }

async function init() {
  const {user,store} = await api('/api/me');
  state.user=user; state.store=store;
  $('#sidebar-name').textContent=user.name; $('#sidebar-role').textContent=user.role==='superadmin'?'Superusuario':'Trabajador';
  $('#avatar').textContent=user.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  if(user.role!=='superadmin') $$('.admin-nav').forEach(x=>x.remove());
  await Promise.all([loadCatalog(),loadCash()]);
  bind();
  navigate(location.hash.slice(1)||'pos');
  const updateClock=()=>$('#clock').textContent=`Bogotá · ${new Intl.DateTimeFormat('es-CO',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}).format(new Date())}`;
  updateClock(); setInterval(updateClock,1000);
  setInterval(()=>{if(location.hash==='#orders')loadOrders()},8000);
}

function bind() {
  $('#nav').addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(button)navigate(button.dataset.view)});
  $('#mobile-menu').onclick=()=>$('.sidebar').classList.toggle('open');
  $('#logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/'};
  $('.modal-close').onclick=closeModal; $('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
  $('#product-search').oninput=e=>{state.search=e.target.value.toLowerCase();renderProducts()};
  $('#category-tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.category=b.dataset.category;renderCategoryTabs();renderProducts()};
  $('#clear-cart').onclick=()=>{state.cart=[];renderCart()};
  $('#discount').oninput=renderCart;
  $('#checkout').onclick=showCheckout;
  $('#hold-order').onclick=()=>submitOrder('held');
  $('#new-product')?.addEventListener('click',()=>showProductForm());
  $('#new-stock-item')?.addEventListener('click',()=>showStockForm());
  $('#new-worker')?.addEventListener('click',showWorkerForm);
  $$('[data-refresh="orders"]').forEach(x=>x.onclick=loadOrders);
  $('#daily-date')?.addEventListener('change',loadDailySummary);
}

async function navigate(view) {
  const allowed=['pos','orders','cash',...(state.user.role==='superadmin'?['dashboard','daily','products','inventory','workers','reports']:[])];
  if(!allowed.includes(view))view='pos';
  location.hash=view;
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${view}`));
  $$('#nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  const names={pos:['OPERACIÓN','Punto de venta'],orders:['OPERACIÓN','Pedidos'],cash:['OPERACIÓN','Caja'],dashboard:['GESTIÓN','Resumen'],daily:['GESTIÓN','Resumen diario'],products:['CATÁLOGO','Productos'],inventory:['INVENTARIO','Stock y alertas'],workers:['EQUIPO','Trabajadores'],reports:['ANÁLISIS','Informes']};
  $('#page-kicker').textContent=names[view][0];$('#page-title').textContent=names[view][1];$('.sidebar').classList.remove('open');
  if(view==='orders')await loadOrders();
  if(view==='cash')await loadCash();
  if(view==='products')renderProductTable();
  if(view==='inventory')await loadInventory();
  if(view==='daily')await loadDailySummary();
  if(view==='workers')await loadWorkers();
  if(['dashboard','reports'].includes(view))await loadReports(view);
}

async function loadCatalog() {
  const data=await api('/api/catalog');Object.assign(state,data);renderCategoryTabs();renderProducts();renderCart();
}
function renderCategoryTabs() {
  $('#category-tabs').innerHTML=[{id:'all',name:'Todos'},...state.categories].map(x=>`<button class="${String(x.id)===String(state.category)?'active':''}" data-category="${x.id}">${x.icon||''} ${x.name}</button>`).join('');
}
function renderProducts() {
  const products=state.products.filter(p=>!['018','019'].includes(String(p.sku))&&(state.category==='all'||String(p.category_id)===String(state.category))&&(`${p.name} ${p.sku||''}`.toLowerCase().includes(state.search)));
  $('#product-grid').innerHTML=products.length?products.map(p=>`<button class="product-card" data-product="${p.id}" ${p.price===null||!p.available?'disabled':''}><div class="product-visual">${p.image_url?`<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}" loading="lazy" decoding="async">`:state.categories.find(x=>x.id===p.category_id)?.icon||'🧪'}</div><div class="product-info"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category)}</small><span class="price">${p.price===null?'Precio pendiente':fmt(p.price)}</span></div></button>`).join(''):`<div class="empty-state"><div class="empty-icon">⚗️</div><h3>${state.products.length?'Sin coincidencias':'El catálogo está listo para comenzar'}</h3><p>${state.products.length?'Prueba otra búsqueda o categoría.':'Los productos y sus precios serán agregados por el superusuario desde Gestión → Productos.'}</p></div>`;
  $$('.product-card').forEach(x=>x.onclick=()=>addProduct(Number(x.dataset.product)));
}
function addProduct(id) {
  const product=state.products.find(x=>x.id===id); if(!product||product.price===null)return;
  if(product.customizable)return showProductCustomizer(product);
  addCartLine({product_id:id,name:product.name,price:product.price,quantity:1,toppings:[],modifiers:[]});
}
function addCartLine(line) {
  const key=line.key||`${line.product_id}|${line.price}|${(line.toppings||[]).join('~')}|${(line.modifiers||[]).map(x=>x.name).join('~')}`;
  const current=state.cart.find(x=>x.key===key);
  if(current)current.quantity+=line.quantity||1;else state.cart.push({...line,key});
  renderCart();
}
function toppingsByGroup(group){return state.toppings.filter(x=>x.group===group&&x.available).map(x=>x.name)}
function customizationSchema(product) {
  const sku=String(product.sku||'');
  const fruits=toppingsByGroup('Frutas'), sauces=toppingsByGroup('Salsas'), sweets=[...toppingsByGroup('Dulces'),...toppingsByGroup('Crunch'),...toppingsByGroup('Perlas')];
  const schemas={
    '001':[{title:'Elige los 2 toppings incluidos',type:'multi',max:2,min:2,options:sweets},{title:'Elige la salsa incluida',type:'single',min:1,options:sauces},{title:'Elige la paleta incluida',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '002':[{title:'Elige los 3 toppings incluidos',type:'multi',max:3,min:3,options:sweets},{title:'Elige la salsa incluida',type:'single',min:1,options:sauces},{title:'Elige la paleta incluida',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '003':[{title:'Elige la Fórmula Frutal',type:'single',min:1,options:fruits},{title:'Elige salsa o leche condensada',type:'single',min:1,options:[...sauces,'Leche Condensada']},{title:'Elige la paleta incluida',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '004':[{title:'Elige el sabor del smoothie',type:'single',min:1,options:toppingsByGroup('Sabores smoothie')},{title:'Elige 3 toppings de frutas o dulces',type:'multi',max:3,min:3,options:[...fruits,...sweets]},{title:'Elige 1 salsa',type:'single',min:1,options:sauces}],
    '005':[{title:'Elige la Fórmula Frutal',type:'single',min:1,options:fruits}],
    '010':[{title:'Elige 5 frutas',type:'multi',max:5,min:5,options:fruits},{title:'Elige la base',type:'single',min:1,options:['Yogur','Crema de Leche','Chamoy']},{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets},{title:'Elige hasta 2 salsas',type:'multi',max:2,min:1,options:sauces}],
    '011':[{title:'Elige 4 frutas premium',type:'multi',max:4,min:4,options:fruits},{title:'Elige hasta 3 toppings y gomitas',type:'multi',max:3,min:1,options:sweets},{title:'Elige hasta 2 salsas',type:'multi',max:2,min:1,options:sauces}],
    '015':[{title:'Elige la salsa incluida',type:'single',min:1,options:sauces},{title:'Elige hasta 2 toppings',type:'multi',max:2,min:1,options:sweets}],
    '016':[{title:'Elige las 2 salsas incluidas',type:'multi',max:2,min:2,options:sauces},{title:'Elige hasta 3 toppings',type:'multi',max:3,min:1,options:sweets}],
    '017':[{title:'Elige la cerveza',type:'single',min:1,options:toppingsByGroup('Cervezas')}],
  };
  return schemas[sku]||[];
}
function showProductCustomizer(product) {
  const schema=customizationSchema(product);
  openModal(`<div class="customizer"><p class="eyebrow orange">PREPARA EL PEDIDO</p><h2>${escapeHtml(product.name)}</h2><p class="muted">${escapeHtml(product.description||'')}</p><div class="custom-total"><span>Base ${fmt(product.price)}</span><strong id="custom-total">${fmt(product.price)}</strong></div><form id="custom-form">${schema.map((section,i)=>customSection(section,i)).join('')}<section class="custom-step"><h3>Fórmula X <small>potenciador opcional</small></h3><div class="choice-grid"><label class="choice-pill"><input type="radio" name="booster" value="" checked><span>Sin Fórmula X</span></label>${POTENCIADORES_LAB.map(x=>`<label class="choice-pill paid"><input type="radio" name="booster" value="${escapeAttr(x.code)}" data-label="${escapeAttr(x.name)}" data-price="${x.price}"><span>${escapeHtml(x.name)}<br><small>+ ${fmt(x.price)}</small></span></label>`).join('')}</div><div id="booster-flavor"></div></section><label class="custom-note">Nota para preparación<input name="note" placeholder="Ej. sin picante, más hielo, separar salsa…"></label><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Agregar al pedido</button></div></form></div>`);
  const updateTotal=()=>{$('#custom-total').textContent=fmt(product.price+selectedModifiers().reduce((s,x)=>s+x.price,0))};
  const selectedModifiers=()=>$$('#custom-form [data-price]:checked').map(x=>({code:x.value,name:x.dataset.label||x.value,price:Number(x.dataset.price||0)})).filter(x=>x.code||x.name);
  const renderBoosterFlavor=()=>{const target=$('#booster-flavor'),code=$('[name="booster"]:checked')?.value;if(!target)return;target.innerHTML=code?`<div class="formula-extra-head"><strong>Elige el sabor de la Fórmula X</strong></div>${customSection({title:'Sabor de Fórmula X',type:'single',min:1,options:toppingsByGroup('Boosters Lab')},'booster-flavor')}`:''};
  $$('#custom-form input').forEach(x=>x.onchange=()=>{enforceLimits(x);if(x.name==='booster')renderBoosterFlavor();updateTotal()});
  $('#custom-form').onsubmit=e=>{e.preventDefault();const selected=[],missing=[];schema.forEach((section,i)=>{const picked=$$(`[name="step-${i}"]:checked`).map(x=>x.value);if((section.min||0)>picked.length)missing.push(section.title);picked.forEach(x=>selected.push(`${section.title}: ${x}`))});const boosterCode=$('[name="booster"]:checked')?.value;if(boosterCode){const flavor=$('[name="step-booster-flavor"]:checked')?.value;if(!flavor)missing.push('Sabor de Fórmula X');else selected.push(`Sabor de Fórmula X: ${flavor}`)}if(missing.length){toast(`Falta completar: ${missing.join(', ')}`,'error');return}const note=new FormData(e.currentTarget).get('note');if(note)selected.push(`Nota: ${note}`);const modifiers=selectedModifiers();const finalPrice=product.price+modifiers.reduce((s,x)=>s+x.price,0);addCartLine({product_id:product.id,name:product.name,price:finalPrice,quantity:1,toppings:selected,modifiers});closeModal();toast('Producto agregado')};
}
function customSection(section,index){return `<section class="custom-step" data-step="${index}" data-max="${section.max||1}"><h3>${escapeHtml(section.title)} ${section.max?`<small>máx. ${section.max}</small>`:''}</h3><div class="choice-grid">${section.options.map(opt=>{const value=typeof opt==='string'?opt:opt.name,price=typeof opt==='string'?0:opt.price;return `<label class="choice-pill ${price?'paid':''}"><input type="${section.type==='single'||section.type==='paid'?'radio':'checkbox'}" name="step-${index}" value="${escapeAttr(value)}" ${price?`data-price="${price}"`:''}><span>${escapeHtml(value)}${price?`<br><small>+ ${fmt(price)}</small>`:''}</span></label>`}).join('')}</div></section>`}
function extraChoiceSection(title,name,max,options){return `<section class="custom-step formula-extra-step" data-max="${max}"><h3>${escapeHtml(title)} <small>elige ${max}</small></h3><div class="choice-grid">${options.map(value=>`<label class="choice-pill"><input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div></section>`}
function enforceLimits(input){const step=input.closest('.custom-step');if(!step||input.type!=='checkbox')return;const max=Number(step.dataset.max||0);if(!max)return;const checked=$$('input:checked',step);if(checked.length>max){input.checked=false;toast(`Máximo ${max} opciones en este paso`,'error')}}
function renderCart() {
  const subtotal=state.cart.reduce((sum,x)=>sum+x.price*x.quantity,0),discount=Math.min(Number($('#discount')?.value||0),subtotal),total=subtotal-discount;
  $('#cart-items').innerHTML=state.cart.length?state.cart.map((x,i)=>`<div class="cart-line"><div><strong>${escapeHtml(x.name)}</strong>${x.toppings.length?`<small>${x.toppings.join(', ')}</small>`:''}<div class="qty-control"><button data-action="minus" data-index="${i}">−</button><span>${x.quantity}</span><button data-action="plus" data-index="${i}">＋</button><button data-action="remove" data-index="${i}">×</button></div></div><span class="cart-line-price">${fmt(x.price*x.quantity)}</span></div>`).join(''):`<div class="empty-cart"><span>🧪</span><h3>El experimento está vacío</h3><p>Selecciona productos para comenzar una nueva mezcla.</p></div>`;
  $('#subtotal').textContent=fmt(subtotal);$('#total').textContent=fmt(total);$('#checkout').disabled=!state.cart.length;
  $$('#cart-items button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index);if(b.dataset.action==='plus')state.cart[i].quantity++;if(b.dataset.action==='minus')state.cart[i].quantity=Math.max(1,state.cart[i].quantity-1);if(b.dataset.action==='remove')state.cart.splice(i,1);renderCart()});
}
function showCheckout() {
  if(!state.cart.length)return;
  const subtotal=state.cart.reduce((s,x)=>s+x.price*x.quantity,0),discount=Math.min(Number($('#discount').value||0),subtotal),total=subtotal-discount;
  openModal(`<p class="eyebrow orange">FINALIZAR VENTA</p><h2>Cobrar ${fmt(total)}</h2><p class="muted">Selecciona un método o divide el total entre varios.</p><div class="payment-options four"><button type="button" class="payment-option active" data-payment="cash">💵<br>Efectivo</button><button type="button" class="payment-option" data-payment="qr">▦<br>Consignación QR</button><button type="button" class="payment-option" data-payment="card">💳<br>Tarjeta</button><button type="button" class="payment-option" data-payment="mixed">◒<br>Mixto</button></div><form id="payment-form" class="form-grid"><label class="full" id="received-label">Efectivo recibido<input id="received" type="number" min="${total}" value="${total}" required></label><div class="full cash-change">Cambio: <strong id="change">${fmt(0)}</strong></div><div id="mixed-fields" class="full mixed-fields"><p>Distribuye exactamente ${fmt(total)}</p><div><label>Efectivo<input id="cash-amount" type="number" min="0" value="0"></label><label>Consignación QR<input id="qr-amount" type="number" min="0" value="0"></label><label>Tarjeta<input id="card-amount" type="number" min="0" value="0"></label></div><strong id="mixed-balance">Falta asignar ${fmt(total)}</strong></div><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Validar pago</button></div></form>`);
  let payment='cash';
  const updateMixed=()=>{const assigned=Number($('#cash-amount').value||0)+Number($('#qr-amount').value||0)+Number($('#card-amount').value||0),difference=total-assigned;$('#mixed-balance').textContent=difference===0?'Total distribuido correctamente':difference>0?`Falta asignar ${fmt(difference)}`:`Excede el total por ${fmt(Math.abs(difference))}`;$('#mixed-balance').className=difference===0?'ok':'error'};
  $$('.payment-option').forEach(b=>b.onclick=()=>{payment=b.dataset.payment;$$('.payment-option').forEach(x=>x.classList.toggle('active',x===b));$('#received-label').style.display=payment==='cash'?'grid':'none';$('.cash-change').style.display=payment==='cash'?'block':'none';$('#mixed-fields').style.display=payment==='mixed'?'block':'none'});
  $('#received').oninput=e=>$('#change').textContent=fmt(Math.max(0,Number(e.target.value)-total));
  ['#cash-amount','#qr-amount','#card-amount'].forEach(id=>$(id).oninput=updateMixed);
  $('#payment-form').onsubmit=async e=>{e.preventDefault();await submitOrder('paid',payment,payment==='cash'?Number($('#received').value):null,payment==='mixed'?{cash_amount:Number($('#cash-amount').value||0),qr_amount:Number($('#qr-amount').value||0),card_amount:Number($('#card-amount').value||0)}:{})};
}
async function submitOrder(status,payment='cash',received=null,paymentParts={}) {
  try{
    const payload={status,payment_method:payment,received,...paymentParts,discount:Number($('#discount').value||0),notes:$('#order-notes').value,items:state.cart.map(x=>({product_id:x.product_id,quantity:x.quantity,toppings:x.toppings,modifiers:x.modifiers||[]}))};
    const {order}=await api('/api/orders',{method:'POST',body:JSON.stringify(payload)});
    state.cart=[];$('#discount').value=0;$('#order-notes').value='';renderCart();closeModal();toast(status==='paid'?'Venta registrada':'Pedido pausado');
    if(status==='paid')showReceipt(order);
  }catch(error){toast(error.message,'error')}
}
function showReceipt(order) {
  const parts=[['Efectivo',order.cash_amount],['Consignación QR',order.qr_amount],['Tarjeta',order.card_amount]].filter(x=>Number(x[1])>0);
  openModal(`<div class="receipt"><div class="receipt-head"><h2>SUPERLAB ✦</h2><div>Mix and Chill</div><small>Sucursal principal · Bogotá UTC−5</small></div><div class="receipt-lines"><div class="receipt-row"><span>Pedido</span><span>${order.number}</span></div><div class="receipt-row"><span>Fecha y hora</span><span>${dateFmt(order.created_at)}</span></div><div class="receipt-row"><span>Cajero</span><span>${escapeHtml(order.cashier)}</span></div></div><div class="receipt-lines">${order.items.map(x=>`<div class="receipt-row"><span>${x.quantity} × ${escapeHtml(x.name)}</span><span>${fmt(x.subtotal)}</span></div>${x.toppings?`<small>${escapeHtml(x.toppings)}</small>`:''}`).join('')}</div><div class="receipt-lines"><div class="receipt-row"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div><div class="receipt-row"><span>Descuento</span><span>− ${fmt(order.discount)}</span></div><div class="receipt-row receipt-total"><span>TOTAL</span><span>${fmt(order.total)}</span></div><div class="receipt-row"><span>Pago</span><span>${paymentName(order.payment_method)}</span></div>${parts.map(x=>`<div class="receipt-row"><span>${x[0]}</span><span>${fmt(x[1])}</span></div>`).join('')}${order.payment_method==='cash'&&order.received!==null?`<div class="receipt-row"><span>Recibido</span><span>${fmt(order.received)}</span></div><div class="receipt-row"><span>Cambio</span><span>${fmt(Math.max(0,order.received-order.total))}</span></div>`:''}</div><div class="receipt-foot">Más que un postre.<br>Un laboratorio para experimentar.</div></div><div class="form-actions"><button class="button secondary" onclick="window.print()">Imprimir</button><button class="button primary" onclick="document.querySelector('.modal-close').click()">Nuevo pedido</button></div>`);
}

async function loadOrders() {
  const {orders}=await api('/api/orders');
  const active=orders.filter(o=>o.source==='tablet'&&['queued','preparing','ready'].includes(o.status));
  $('#command-board').innerHTML=active.length?active.map(o=>`<article class="command-card ${o.status}"><header><div><small>${statusName(o.status)}</small><h3>${escapeHtml(o.number)}</h3></div><time>${dateFmt(o.created_at)}</time></header><div class="command-items">${o.items.map(x=>`<div><strong>${x.quantity} × ${escapeHtml(x.name)}</strong>${x.toppings?`<p>${escapeHtml(x.toppings)}</p>`:''}</div>`).join('')}</div>${o.notes?`<p class="command-note"><strong>Nota:</strong> ${escapeHtml(o.notes)}</p>`:''}<footer><strong>${fmt(o.total)}</strong><button class="button primary" data-command="${o.id}" data-next="${nextOrderStatus(o.status)}">${nextOrderAction(o.status)}</button></footer></article>`).join(''):`<div class="empty-commands">No hay comandas pendientes de la tablet.</div>`;
  $$('[data-command]').forEach(b=>b.onclick=async()=>{try{await api(`/api/orders/${b.dataset.command}/status`,{method:'PUT',body:JSON.stringify({status:b.dataset.next})});await loadOrders();toast('Comanda actualizada')}catch(error){toast(error.message,'error')}});
  $('#orders-table').innerHTML=orders.length?orders.map((o,i)=>`<tr><td><strong>${o.number}</strong><br><small>${o.source==='tablet'?'Tablet · ':''}${o.items.length} líneas</small></td><td>${dateFmt(o.created_at)}</td><td>${escapeHtml(o.cashier)}</td><td><span class="status-badge ${o.status}">${statusName(o.status)}</span></td><td>${paymentName(o.payment_method)}</td><td><strong>${fmt(o.total)}</strong></td><td><div class="row-actions"><button data-receipt="${i}">Detalle</button></div></td></tr>`).join(''):`<tr><td colspan="7">Todavía no hay pedidos.</td></tr>`;
  $$('[data-receipt]').forEach(b=>b.onclick=()=>showReceipt(orders[Number(b.dataset.receipt)]));
}
function statusName(status){return ({paid:'Pagado',held:'Pausado',queued:'Nuevo',preparing:'En preparación',ready:'Listo para entregar',completed:'Entregado'})[status]||status}
function nextOrderStatus(status){return ({queued:'preparing',preparing:'ready',ready:'completed'})[status]||''}
function nextOrderAction(status){return ({queued:'Comenzar preparación',preparing:'Marcar listo',ready:'Marcar entregado'})[status]||'Actualizar'}

async function loadCash() {
  const {cash_session}=await api('/api/cash-session');state.cash=cash_session;renderCash();
}
function renderCash() {
  const x=state.cash;$('#cash-status').textContent=x?.status==='open'?'Caja abierta':'Caja cerrada';$('#cash-status').className=`status-badge ${x?.status==='open'?'':'closed'}`;
  $('#cash-content').innerHTML=x?`<div class="cash-grid"><div class="cash-card"><p>Base inicial</p><strong>${fmt(x.opening_cash)}</strong><small>Abierta ${dateFmt(x.opened_at)}</small></div><div class="cash-card"><p>Ventas de la sesión</p><strong>${fmt(x.sales)}</strong><small>${x.orders} pedidos pagados</small></div><div class="cash-card"><p>Efectivo esperado</p><strong>${fmt(x.expected_cash)}</strong><small>Base + porción pagada en efectivo</small></div></div><div class="cash-action"><div><p class="eyebrow">CIERRE DE TURNO</p><h3>Registra el monto físico real</h3><p>Puedes cerrar con cualquier monto, sea mayor o menor al esperado. La diferencia quedará registrada con fecha y hora de Bogotá.</p></div><form id="close-cash"><input name="closing_cash" type="number" min="0" placeholder="Monto exacto al cerrar" required><input name="notes" placeholder="Explicación o nota de cierre (opcional)"><button class="button primary wide">Cerrar caja</button></form></div>`:`<div class="cash-action"><div><p class="eyebrow">INICIO DE TURNO</p><h3>Abre la caja con un monto específico</h3><p>Indica el valor físico exacto con el que comienza la caja. Se registrará con fecha y hora de Bogotá UTC−5.</p></div><form id="open-cash"><input name="opening_cash" type="number" min="0" value="0" placeholder="Monto inicial exacto" required><button class="button primary wide">Abrir caja</button></form></div>`;
  $('#open-cash')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/cash-session/open',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});await loadCash();toast('Caja abierta')}catch(error){toast(error.message,'error')}});
  $('#close-cash')?.addEventListener('submit',async e=>{e.preventDefault();try{const {cash_session}=await api('/api/cash-session/close',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});state.cash=null;renderCash();toast(`Caja cerrada. Diferencia: ${fmt(cash_session.difference)}`)}catch(error){toast(error.message,'error')}});
}

function renderProductTable() {
  $('#products-table').innerHTML=state.products.length?state.products.map(p=>`<tr><td><div class="product-cell">${p.image_url?`<img src="${escapeAttr(p.image_url)}" alt="">`:`<span>🧪</span>`}<div><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.description||'Sin descripción')}</small></div></div></td><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.sku||'—')}</td><td><strong>${p.price===null?'Pendiente':fmt(p.price)}</strong></td><td><span class="status-badge ${p.available?'':'inactive'}">${p.available?'Sí':'No'}</span></td><td><div class="row-actions"><button data-edit-product="${p.id}">Editar</button><button class="delete-row" data-delete-product="${p.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="6">No hay productos. Crea el primero cuando tengas nombres y precios definitivos.</td></tr>`;
  $$('[data-edit-product]').forEach(b=>b.onclick=()=>showProductForm(state.products.find(x=>x.id===Number(b.dataset.editProduct))));
  $$('[data-delete-product]').forEach(b=>b.onclick=async()=>{const product=state.products.find(x=>x.id===Number(b.dataset.deleteProduct));if(!confirm(`¿Eliminar "${product.name}" del catálogo?`))return;try{await api(`/api/products/${product.id}`,{method:'DELETE'});await loadCatalog();renderProductTable();toast('Producto eliminado')}catch(error){toast(error.message,'error')}});
}
function showProductForm(product=null) {
  openModal(`<p class="eyebrow orange">CATÁLOGO</p><h2>${product?'Editar':'Nuevo'} producto</h2><form id="product-form" class="form-grid"><label>Nombre<input name="name" value="${escapeAttr(product?.name||'')}" required></label><label>Categoría<select name="category_id">${state.categories.map(x=>`<option value="${x.id}" ${x.id===product?.category_id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></label><label>Precio COP <small>Puede quedar vacío</small><input name="price" type="number" min="0" value="${product?.price??''}"></label><label>Código numérico<input name="sku" inputmode="numeric" pattern="[0-9]*" maxlength="18" value="${escapeAttr(product?.sku||'')}" placeholder="Ej. 015"></label><label class="full">Imagen por URL<input name="image_url" value="${product?.image_url?.startsWith('data:')?'':escapeAttr(product?.image_url||'')}" placeholder="https://..."></label><label class="full">O subir imagen <small>JPG, PNG o WebP · máximo 2 MB</small><input id="image-file" type="file" accept="image/jpeg,image/png,image/webp"></label><div id="image-preview" class="full image-preview">${product?.image_url?`<img src="${escapeAttr(product.image_url)}" alt="Vista previa">`:'Sin imagen seleccionada'}</div><label class="full">Descripción<textarea name="description">${escapeHtml(product?.description||'')}</textarea></label><label><span>Disponible</span><select name="available"><option value="true" ${product?.available!==false?'selected':''}>Sí</option><option value="false" ${product?.available===false?'selected':''}>No</option></select></label><label><span>Personalizable</span><select name="customizable"><option value="false">No</option><option value="true" ${product?.customizable?'selected':''}>Sí</option></select></label><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Guardar producto</button></div></form>`);
  let uploadedImage=product?.image_url?.startsWith('data:')?product.image_url:null;
  $('#image-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>10_000_000){toast('La imagen no puede superar 10 MB','error');e.target.value='';return}uploadedImage=await optimizeImage(file);$('#image-preview').innerHTML=`<img src="${uploadedImage}" alt="Vista previa">`;toast('Imagen optimizada para carga rápida')};
  $('#product-form').onsubmit=async e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));raw.image_url=uploadedImage||raw.image_url||null;raw.available=raw.available==='true';raw.customizable=raw.customizable==='true';raw.price=raw.price===''?null:Number(raw.price);try{await api(product?`/api/products/${product.id}`:'/api/products',{method:product?'PUT':'POST',body:JSON.stringify(raw)});await loadCatalog();renderProductTable();closeModal();toast('Producto guardado')}catch(error){toast(error.message,'error')}};
}

async function loadInventory() {
  const {items}=await api('/api/inventory');state.inventory=items;renderInventory();
}
function stockNumber(value){return Number(value||0).toLocaleString('es-CO',{maximumFractionDigits:3})}
function renderInventory() {
  const counts={ok:0,low:0,critical:0};state.inventory.forEach(x=>counts[x.status]++);
  $('#inventory-kpis').innerHTML=[
    ['Total de insumos',state.inventory.length,'▦','#edf3ff'],
    ['Stock suficiente',counts.ok,'✓','#eaf8f1'],
    ['Próximos a acabarse',counts.low,'!','#fff4df'],
    ['Críticos o en cero',counts.critical,'×','#ffe8e8'],
  ].map(x=>`<article class="kpi" style="--accent:${x[3]}"><span class="kpi-icon">${x[2]}</span><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('');
  $('#inventory-table').innerHTML=state.inventory.length?state.inventory.map(x=>`<tr><td><span class="stock-status ${x.status}"><i></i>${x.status==='ok'?'Bien':x.status==='low'?'Próximo':'Crítico'}</span></td><td><strong>${escapeHtml(x.name)}</strong>${x.notes?`<br><small>${escapeHtml(x.notes)}</small>`:''}</td><td>${escapeHtml(x.category)}</td><td><strong>${stockNumber(x.quantity)} ${escapeHtml(x.unit)}</strong></td><td>${stockNumber(x.critical_level)} ${escapeHtml(x.unit)}</td><td>${stockNumber(x.low_level)} ${escapeHtml(x.unit)}</td><td>${dateFmt(x.updated_at)}</td><td><div class="row-actions"><button data-edit-stock="${x.id}">Editar</button><button class="delete-row" data-delete-stock="${x.id}">Eliminar</button></div></td></tr>`).join(''):'<tr><td colspan="8">Todavía no hay insumos registrados.</td></tr>';
  $$('[data-edit-stock]').forEach(b=>b.onclick=()=>showStockForm(state.inventory.find(x=>x.id===Number(b.dataset.editStock))));
  $$('[data-delete-stock]').forEach(b=>b.onclick=async()=>{const item=state.inventory.find(x=>x.id===Number(b.dataset.deleteStock));if(!confirm(`¿Eliminar "${item.name}" del inventario?`))return;try{await api(`/api/inventory/${item.id}`,{method:'DELETE'});await loadInventory();toast('Insumo eliminado')}catch(error){toast(error.message,'error')}});
}
function showStockForm(item=null) {
  const units=['g','kg','ml','l','unidad','paquete'];
  openModal(`<p class="eyebrow orange">INVENTARIO</p><h2>${item?'Editar':'Nuevo'} insumo</h2><p class="muted">El stock informativo puede quedar en cero y nunca bloqueará una venta.</p><form id="stock-form" class="form-grid"><label>Nombre<input name="name" value="${escapeAttr(item?.name||'')}" required></label><label>Categoría<input name="category" value="${escapeAttr(item?.category||'General')}" placeholder="Frutas, salsas…"></label><label>Cantidad actual<input name="quantity" type="number" min="0" step="0.001" value="${item?.quantity??0}" required></label><label>Unidad<select name="unit">${units.map(x=>`<option value="${x}" ${x===item?.unit?'selected':''}>${x}</option>`).join('')}</select></label><label>Alerta roja desde<input name="critical_level" type="number" min="0" step="0.001" value="${item?.critical_level??0}" required><small>Crítico si queda esta cantidad o menos.</small></label><label>Alerta amarilla desde<input name="low_level" type="number" min="0" step="0.001" value="${item?.low_level??0}" required><small>Próximo a acabarse si queda esta cantidad o menos.</small></label><label class="full">Notas<textarea name="notes" placeholder="Proveedor, presentación, ubicación…">${escapeHtml(item?.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Guardar insumo</button></div></form>`);
  $('#stock-form').onsubmit=async e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));['quantity','critical_level','low_level'].forEach(key=>raw[key]=Number(raw[key]||0));try{await api(item?`/api/inventory/${item.id}`:'/api/inventory',{method:item?'PUT':'POST',body:JSON.stringify(raw)});closeModal();await loadInventory();toast('Inventario actualizado')}catch(error){toast(error.message,'error')}};
}

async function loadWorkers() {
  const {users}=await api('/api/users');
  $('#workers-table').innerHTML=users.map(u=>`<tr><td><strong>${escapeHtml(u.name)}</strong>${u.immutable?'<br><small>Cuenta protegida</small>':''}</td><td>${escapeHtml(u.email)}</td><td>${u.role==='superadmin'?'Superusuario':u.role==='tablet'?'Tablet de pedidos':'Trabajador'}</td><td>${dateFmt(u.created_at)}</td><td><span class="status-badge ${u.active?'':'inactive'}">${u.active?'Activo':'Inactivo'}</span></td><td><div class="row-actions">${u.immutable?'🔒':`<button data-toggle-worker="${u.id}" data-active="${u.active}">${u.active?'Desactivar':'Activar'}</button>`}</div></td></tr>`).join('');
  $$('[data-toggle-worker]').forEach(b=>b.onclick=async()=>{try{await api(`/api/users/${b.dataset.toggleWorker}`,{method:'PUT',body:JSON.stringify({active:b.dataset.active!=='true'})});await loadWorkers();toast('Trabajador actualizado')}catch(error){toast(error.message,'error')}});
}
function showWorkerForm() {
  openModal(`<p class="eyebrow orange">EQUIPO</p><h2>Nuevo trabajador</h2><p class="muted">Tendrá acceso al POS, pedidos propios y caja; nunca al panel de administración.</p><form id="worker-form" class="form-grid"><label>Nombre completo<input name="name" required></label><label>Correo<input name="email" type="email" required></label><label>Contraseña temporal<input name="password" type="password" minlength="8" required></label><label>PIN de caja<input name="pin" inputmode="numeric" minlength="4" placeholder="Opcional"></label><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Crear acceso</button></div></form>`);
  $('#worker-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});closeModal();await loadWorkers();toast('Trabajador creado')}catch(error){toast(error.message,'error')}};
}

async function loadDailySummary() {
  const input=$('#daily-date');
  if(!input.value)input.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const data=await api(`/api/reports/daily-cash?date=${encodeURIComponent(input.value)}`);
  const s=data.summary;
  $('#daily-kpis').innerHTML=[
    ['Ventas del día',fmt(s.sales),'↗','#fff1eb'],
    ['Veces que abrió',s.session_count,'◷','#edf3ff'],
    ['Total de aperturas',fmt(s.opening_total),'▣','#f3edff'],
    ['Total de cierres',fmt(s.closing_total),'✓','#eaf8f1'],
  ].map(x=>`<article class="kpi" style="--accent:${x[3]}"><span class="kpi-icon">${x[2]}</span><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('');
  const maxPayment=Math.max(1,s.cash_sales,s.qr_sales,s.card_sales);
  $('#daily-payments').innerHTML=[
    ['Efectivo',s.cash_sales],['Consignación QR',s.qr_sales],['Tarjeta',s.card_sales],
  ].map(x=>metricRow(x[0],fmt(x[1]),x[1]/maxPayment*100)).join('');
  $('#daily-balance').innerHTML=[
    ['Monto total al abrir',fmt(s.opening_total),100],
    ['Monto total al cerrar',fmt(s.closing_total),s.opening_total?Math.min(100,s.closing_total/s.opening_total*100):0],
    ['Diferencia acumulada',fmt(s.difference_total),Math.min(100,Math.abs(s.difference_total)/(Math.max(1,s.opening_total))*100)],
  ].map(x=>metricRow(x[0],x[1],x[2])).join('');
  $('#daily-session-caption').textContent=`${s.closed_count} cerradas · ${s.open_count} abiertas · ${dateFmt(`${data.date}T12:00:00-05:00`)}`;
  $('#daily-sessions').innerHTML=data.sessions.length?data.sessions.map(x=>`<tr><td><strong>#${x.id}</strong></td><td>${dateFmt(x.opened_at)}</td><td>${x.closed_at?dateFmt(x.closed_at):'—'}</td><td>${escapeHtml(x.opened_by)}</td><td>${fmt(x.opening_cash)}</td><td>${fmt(x.sales)}</td><td>${x.closing_cash===null?'—':fmt(x.closing_cash)}</td><td class="${Number(x.difference)<0?'negative':Number(x.difference)>0?'positive':''}">${x.difference===null?'—':fmt(x.difference)}</td><td><span class="status-badge ${x.status==='open'?'held':'closed'}">${x.status==='open'?'Abierta':'Cerrada'}</span></td></tr>`).join(''):`<tr><td colspan="9">No hubo aperturas de caja en esta fecha.</td></tr>`;
}

async function loadReports(view) {
  state.reports=await api('/api/reports/summary');renderDashboard();
  if(view==='reports')renderFullReport();
}
function renderDashboard() {
  const r=state.reports,k=r.kpis;
  $('#kpi-grid').innerHTML=[['Ventas totales',fmt(k.revenue),'↗','#fff1eb'],['Pedidos pagados',k.orders,'▤','#edf3ff'],['Ticket promedio',fmt(k.average),'⌁','#eaf8f1'],['Productos',k.products,'◇','#f3edff']].map(x=>`<article class="kpi" style="--accent:${x[3]}"><span class="kpi-icon">${x[2]}</span><small>${x[0]}</small><strong>${x[1]}</strong></article>`).join('');
  const maxMethod=Math.max(1,...Object.values(r.by_method));
  $('#payment-list').innerHTML=Object.keys(r.by_method).length?Object.entries(r.by_method).map(([name,value])=>metricRow(paymentName(name),fmt(value),value/maxMethod*100)).join(''):'<small>Aún no hay pagos registrados.</small>';
  $('#top-products').innerHTML=r.top_products.length?r.top_products.map((x,i)=>`<div class="rank-item"><span class="rank-number">0${i+1}</span><div><strong>${escapeHtml(x.name)}</strong><small>${x.quantity} unidades</small></div><strong>${fmt(x.sales)}</strong></div>`).join(''):'<small>Aún no hay productos vendidos.</small>';
  const maxWorker=Math.max(1,...r.workers.map(x=>x.sales));
  $('#worker-stats').innerHTML=r.workers.map(x=>metricRow(x.name,fmt(x.sales),x.sales/maxWorker*100)).join('');
  if(state.chart)state.chart.destroy();
  const ctx=$('#sales-chart');
  state.chart=new Chart(ctx,{type:'line',data:{labels:r.by_day.map(x=>x.date),datasets:[{data:r.by_day.map(x=>x.value),borderColor:'#ed4b16',backgroundColor:'rgba(237,75,22,.08)',fill:true,tension:.35,pointRadius:3}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)},grid:{color:'#eef1f5'}},x:{grid:{display:false}}},maintainAspectRatio:false}});
}
function renderFullReport() {
  const r=state.reports;
  $('#report-body').innerHTML=`<div class="kpi-grid">${[['Ingresos',fmt(r.kpis.revenue)],['Órdenes',r.kpis.orders],['Ticket promedio',fmt(r.kpis.average)],['Productos activos',r.kpis.products]].map(x=>`<div class="kpi"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('')}</div><div class="table-card"><table><thead><tr><th>Trabajador</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${r.workers.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.orders}</td><td>${fmt(x.sales)}</td></tr>`).join('')}</tbody></table></div>`;
}
function metricRow(name,value,width){return `<div class="metric-row"><div><strong>${escapeHtml(name)}</strong><div class="metric-bar"><i style="width:${Math.max(2,width)}%"></i></div></div><strong>${value}</strong></div>`}
function paymentName(value){return ({cash:'Efectivo',qr:'Consignación QR',card:'Tarjeta',mixed:'Mixto',transfer:'Consignación QR',pending:'Pendiente en caja'})[value]||value}
function optimizeImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const image=new Image();image.onerror=reject;image.onload=()=>{const max=1200,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/webp',.82))};image.src=reader.result};reader.readAsDataURL(file)})}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function escapeAttr(value){return escapeHtml(value)}

init().catch(error=>{console.error(error);toast(error.message,'error')});
