const state = { user:null, store:null, categories:[], products:[], toppings:[], cart:[], category:'all', search:'', cash:null, reports:null, chart:null };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const fmt = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value || 0)).replace('COP','$');
const dateFmt = value => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(value));
const FORMULAS_LAB = [
  {code:'formula_1', name:'Fórmula 1 — 2 toppings + 1 salsa', price:3000},
  {code:'formula_2', name:'Fórmula 2 — 3 toppings + 2 salsas', price:5000},
  {code:'formula_3', name:'Fórmula 3 — 4 toppings + 2 salsas', price:7000},
  {code:'formula_x', name:'Fórmula X — 5 toppings premium + 3 salsas + booster 8 ml', price:10000},
];
const FORMULA_EXTRAS = {
  formula_1:{toppings:2,sauces:1,boosters:0},
  formula_2:{toppings:3,sauces:2,boosters:0},
  formula_3:{toppings:4,sauces:2,boosters:0},
  formula_x:{toppings:5,sauces:3,boosters:1},
};
const BOOSTERS_LAB = [
  {code:'booster_8', name:'Booster 8 ml', price:3000},
  {code:'booster_20', name:'Booster 20 ml', price:5000},
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
  $('#new-worker')?.addEventListener('click',showWorkerForm);
  $$('[data-refresh="orders"]').forEach(x=>x.onclick=loadOrders);
  $('#daily-date')?.addEventListener('change',loadDailySummary);
}

async function navigate(view) {
  const allowed=['pos','orders','cash',...(state.user.role==='superadmin'?['dashboard','daily','products','workers','reports']:[])];
  if(!allowed.includes(view))view='pos';
  location.hash=view;
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${view}`));
  $$('#nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  const names={pos:['OPERACIÓN','Punto de venta'],orders:['OPERACIÓN','Pedidos'],cash:['OPERACIÓN','Caja'],dashboard:['GESTIÓN','Resumen'],daily:['GESTIÓN','Resumen diario'],products:['CATÁLOGO','Productos'],workers:['EQUIPO','Trabajadores'],reports:['ANÁLISIS','Informes']};
  $('#page-kicker').textContent=names[view][0];$('#page-title').textContent=names[view][1];$('.sidebar').classList.remove('open');
  if(view==='orders')await loadOrders();
  if(view==='cash')await loadCash();
  if(view==='products')renderProductTable();
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
  const products=state.products.filter(p=>(state.category==='all'||String(p.category_id)===String(state.category))&&(`${p.name} ${p.sku||''}`.toLowerCase().includes(state.search)));
  $('#product-grid').innerHTML=products.length?products.map(p=>`<button class="product-card" data-product="${p.id}" ${p.price===null||!p.available?'disabled':''}><div class="product-visual">${p.image_url?`<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}">`:state.categories.find(x=>x.id===p.category_id)?.icon||'🧪'}</div><div class="product-info"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category)}</small><span class="price">${p.price===null?'Precio pendiente':fmt(p.price)}</span></div></button>`).join(''):`<div class="empty-state"><div class="empty-icon">⚗️</div><h3>${state.products.length?'Sin coincidencias':'El catálogo está listo para comenzar'}</h3><p>${state.products.length?'Prueba otra búsqueda o categoría.':'Los productos y sus precios serán agregados por el superusuario desde Gestión → Productos.'}</p></div>`;
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
  const fruits=toppingsByGroup('Frutas'), sauces=toppingsByGroup('Salsas'), sweets=[...toppingsByGroup('Dulces'),...toppingsByGroup('Crunch'),...toppingsByGroup('Perlas')], salts=toppingsByGroup('Sales');
  const schemas={
    '001':[{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets},{title:'Elige 1 salsa',type:'single',min:1,options:sauces},{title:'Elige 1 paleta',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '002':[{title:'Elige 2 siropes',type:'multi',max:2,min:2,options:toppingsByGroup('Siropes')},{title:'Toque final',type:'single',min:1,options:['Leche Condensada']}],
    '003':[{title:'Elige el sabor del smoothie',type:'single',min:1,options:toppingsByGroup('Sabores smoothie')}],
    '004':[{title:'Elige 5 frutas',type:'multi',max:5,min:5,options:fruits},{title:'Base cremosa',type:'single',min:1,options:['Yogur','Crema de Leche']},{title:'Chamoy',type:'single',min:1,options:['Chamoy']},{title:'Sales',type:'single',min:1,options:salts}],
    '005':[{title:'Elige 4 frutas',type:'multi',max:4,min:4,options:fruits},{title:'Base cremosa',type:'single',min:1,options:['Yogur','Crema de Leche']},{title:'Chamoy',type:'single',min:1,options:['Chamoy']},{title:'Sales',type:'single',min:1,options:salts}],
    '006':[{title:'Tipo de Lab Roll',type:'single',min:1,options:['Dulce','Salado']},{title:'Proteína o proyecto',type:'single',min:1,options:toppingsByGroup('Proteínas')},{title:'Toppings del roll',type:'multi',max:3,min:0,options:[...fruits,...sweets]}],
    '011':[{title:'Sabor de temporada',type:'single',min:1,options:['Fresa','Mango','Maracuyá','Cereza','Uva','Limón']}],
    '012':[{title:'Preparación',type:'single',min:1,options:['Clásica','Mango biche','Maracuyá','Picante']},{title:'Borde',type:'single',min:0,options:['Chamoy','Sales picantes','Miguelito']}],
    '013':[{title:'Elige frutas enchiladas',type:'multi',max:5,min:3,options:fruits},{title:'Chamoy',type:'single',min:1,options:['Chamoy']},{title:'Sales',type:'multi',max:2,min:1,options:salts}],
    '014':[{title:'Sabor booster',type:'single',min:1,options:toppingsByGroup('Boosters Lab')},{title:'Tamaño',type:'paid',min:1,options:BOOSTERS_LAB}],
  };
  return schemas[sku]||[{title:'Elige ingredientes',type:'multi',max:5,min:0,options:[...fruits,...sweets,...sauces]}];
}
function showProductCustomizer(product) {
  const schema=customizationSchema(product);
  const sku=String(product.sku||''),allowFormula=sku==='001',allowBooster=['001','002','003'].includes(sku);
  openModal(`<div class="customizer"><p class="eyebrow orange">CREA TU EXPERIMENTO</p><h2>${escapeHtml(product.name)}</h2><p class="muted">${escapeHtml(product.description||'')}</p><div class="custom-total"><span>Base ${fmt(product.price)}</span><strong id="custom-total">${fmt(product.price)}</strong></div><form id="custom-form">${schema.map((section,i)=>customSection(section,i)).join('')}${allowFormula?`<section class="custom-step"><h3>Potencia tu granizado <small>opcional · se suma a lo incluido</small></h3><div class="choice-grid formulas"><label class="choice-pill"><input type="radio" name="formula" value="" checked><span>Sin fórmula<br><small>+ ${fmt(0)}</small></span></label>${FORMULAS_LAB.map(x=>`<label class="choice-pill paid"><input type="radio" name="formula" value="${escapeAttr(x.code)}" data-label="${escapeAttr(x.name)}" data-price="${x.price}"><span>${escapeHtml(x.name)}<br><small>+ ${fmt(x.price)}</small></span></label>`).join('')}</div></section><div id="formula-extras"></div>`:''}${allowBooster?`<section class="custom-step"><h3>Jeringa de sabor <small>opcional y adicional</small></h3><div class="choice-grid"><label class="choice-pill"><input type="radio" name="booster" value="" checked><span>Sin jeringa</span></label>${BOOSTERS_LAB.map(x=>`<label class="choice-pill paid"><input type="radio" name="booster" value="${escapeAttr(x.code)}" data-label="${escapeAttr(x.name)}" data-price="${x.price}"><span>${escapeHtml(x.name)}<br><small>+ ${fmt(x.price)}</small></span></label>`).join('')}</div><div id="booster-flavor"></div></section>`:''}<label class="custom-note">Nota para preparación<input name="note" placeholder="Ej. sin picante, más hielo, separar salsa…"></label><div class="form-actions"><button type="button" class="button secondary" onclick="document.querySelector('.modal-close').click()">Cancelar</button><button class="button primary">Agregar al pedido</button></div></form></div>`);
  const updateTotal=()=>{$('#custom-total').textContent=fmt(product.price+selectedModifiers().reduce((s,x)=>s+x.price,0))};
  const selectedModifiers=()=>$$('#custom-form [data-price]:checked').map(x=>({code:x.value,name:x.dataset.label||x.value,price:Number(x.dataset.price||0)})).filter(x=>x.code||x.name);
  const renderFormulaExtras=()=>{
    const code=$('[name="formula"]:checked')?.value||'',config=FORMULA_EXTRAS[code],target=$('#formula-extras');
    if(!target)return;
    if(!config){target.innerHTML='';return}
    const toppingOptions=[...toppingsByGroup('Frutas'),...toppingsByGroup('Dulces'),...toppingsByGroup('Crunch'),...toppingsByGroup('Perlas')];
    target.innerHTML=`<div class="formula-extra-head"><strong>Adiciones de la fórmula</strong><small>Estas elecciones son extra y no reemplazan las incluidas en el producto.</small></div>${extraChoiceSection('Toppings extra','formula-extra-topping',config.toppings,toppingOptions)}${extraChoiceSection('Salsas extra','formula-extra-sauce',config.sauces,toppingsByGroup('Salsas'))}${config.boosters?extraChoiceSection('Booster 8 ml incluido','formula-extra-booster',config.boosters,toppingsByGroup('Boosters Lab')):''}`;
    $$('#formula-extras input').forEach(x=>x.onchange=()=>enforceLimits(x));
  };
  const renderBoosterFlavor=()=>{const target=$('#booster-flavor'),code=$('[name="booster"]:checked')?.value;if(!target)return;target.innerHTML=code?`<div class="formula-extra-head"><strong>Elige el sabor de la jeringa</strong></div>${customSection({title:'Sabor de jeringa',type:'single',min:1,options:toppingsByGroup('Boosters Lab')},'booster-flavor')}`:''};
  $$('#custom-form input').forEach(x=>x.onchange=()=>{enforceLimits(x);if(x.name==='formula')renderFormulaExtras();if(x.name==='booster')renderBoosterFlavor();updateTotal()});
  $('#custom-form').onsubmit=e=>{e.preventDefault();const selected=[],missing=[];schema.forEach((section,i)=>{const picked=$$(`[name="step-${i}"]:checked`).map(x=>x.value);if((section.min||0)>picked.length)missing.push(section.title);picked.forEach(x=>selected.push(`${section.title}: ${x}`))});const formulaCode=$('[name="formula"]:checked')?.value||'',formulaConfig=FORMULA_EXTRAS[formulaCode];if(formulaConfig){[['formula-extra-topping','Toppings extra',formulaConfig.toppings],['formula-extra-sauce','Salsas extra',formulaConfig.sauces],['formula-extra-booster','Booster incluido',formulaConfig.boosters]].forEach(([name,title,required])=>{if(!required)return;const picked=$$(`[name="${name}"]:checked`).map(x=>x.value);if(picked.length!==required)missing.push(`${title} (${required})`);else selected.push(`${title}: ${picked.join(', ')}`)})}const boosterCode=$('[name="booster"]:checked')?.value;if(boosterCode){const flavor=$('[name="step-booster-flavor"]:checked')?.value;if(!flavor)missing.push('Sabor de jeringa');else selected.push(`Sabor de jeringa: ${flavor}`)}if(missing.length){toast(`Falta completar: ${missing.join(', ')}`,'error');return}const note=new FormData(e.currentTarget).get('note');if(note)selected.push(`Nota: ${note}`);const modifiers=selectedModifiers();const finalPrice=product.price+modifiers.reduce((s,x)=>s+x.price,0);addCartLine({product_id:product.id,name:product.name,price:finalPrice,quantity:1,toppings:selected,modifiers});closeModal();toast('Experimento agregado')};
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
  $('#image-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000){toast('La imagen no puede superar 2 MB','error');e.target.value='';return}uploadedImage=await fileToDataUrl(file);$('#image-preview').innerHTML=`<img src="${uploadedImage}" alt="Vista previa">`};
  $('#product-form').onsubmit=async e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));raw.image_url=uploadedImage||raw.image_url||null;raw.available=raw.available==='true';raw.customizable=raw.customizable==='true';raw.price=raw.price===''?null:Number(raw.price);try{await api(product?`/api/products/${product.id}`:'/api/products',{method:product?'PUT':'POST',body:JSON.stringify(raw)});await loadCatalog();renderProductTable();closeModal();toast('Producto guardado')}catch(error){toast(error.message,'error')}};
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
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function escapeAttr(value){return escapeHtml(value)}

init().catch(error=>{console.error(error);toast(error.message,'error')});
