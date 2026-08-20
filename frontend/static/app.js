const state = { user:null, store:null, categories:[], products:[], toppings:[], inventory:[], orders:[], cart:[], category:'all', search:'', orderFilter:'queued', cash:null, reports:null, chart:null };
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const fmt = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value || 0)).replace('COP','$');
const dateFmt = value => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(value));
const BOOSTER_LAB = {code:'booster_8', name:'Booster Lab', price:3000};
let modalTrigger = null;

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

function openModal(html,wide=false) { modalTrigger=document.activeElement; $('#modal-body').innerHTML=html; $('.modal-card').classList.toggle('wide',wide); $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden','false'); setTimeout(()=>$('.modal-close')?.focus(),0); }
function closeModal() { $('#modal').classList.remove('open'); $('.modal-card').classList.remove('wide'); $('#modal').setAttribute('aria-hidden','true'); $('#modal-body').innerHTML=''; modalTrigger?.focus?.(); modalTrigger=null; }

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
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal'||e.target.closest('[data-close-modal]'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal').classList.contains('open'))closeModal()});
  $('#product-search').oninput=e=>{state.search=e.target.value.toLowerCase();renderProducts()};
  $('#category-tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.category=b.dataset.category;renderCategoryTabs();renderProducts()};
  $('#clear-cart').addEventListener('click',()=>clearCart(true));
  $('#discount').oninput=renderCart;
  $('#checkout').onclick=showCheckout;
  $('#hold-order').onclick=()=>submitOrder('held');
  $('#new-product')?.addEventListener('click',()=>showProductForm());
  $('#new-stock-item')?.addEventListener('click',()=>showStockForm());
  $('#new-worker')?.addEventListener('click',showWorkerForm);
  $$('[data-refresh="orders"]').forEach(x=>x.onclick=loadOrders);
  $('#order-filters')?.addEventListener('click',e=>{const button=e.target.closest('[data-order-filter]');if(!button)return;state.orderFilter=button.dataset.orderFilter;renderOrders()});
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
  const products=state.products.filter(p=>(state.category==='all'||String(p.category_id)===String(state.category))&&(`${p.name} ${p.sku||''}`.toLowerCase().includes(state.search)));
  $('#product-grid').innerHTML=products.length?products.map(p=>`<button class="product-card" data-product="${p.id}" ${p.price===null||!p.available?'disabled':''}><div class="product-visual">${p.image_url?`<img src="${escapeAttr(p.image_url)}" alt="${escapeAttr(p.name)}" loading="lazy" decoding="async">`:state.categories.find(x=>x.id===p.category_id)?.icon||'🧪'}</div><div class="product-info"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category)}</small><div class="product-meta"><span class="price">${p.price===null?'Precio pendiente':fmt(p.price)}</span><em>${p.price===null?'Solo información':p.customizable?'Personalizar':'Agregar directo'}</em></div></div></button>`).join(''):`<div class="empty-state"><div class="empty-icon">⚗️</div><h3>${state.products.length?'Sin coincidencias':'El catálogo está listo para comenzar'}</h3><p>${state.products.length?'Prueba otra búsqueda o categoría.':'Los productos y sus precios serán agregados por el superusuario desde Gestión → Productos.'}</p></div>`;
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
function clearCart(notify=false) {
  const hadItems=state.cart.length>0;
  state.cart=[];
  if($('#discount'))$('#discount').value=0;
  if($('#customer-name'))$('#customer-name').value='';
  if($('#order-notes'))$('#order-notes').value='';
  renderCart();
  if(notify)toast(hadItems?'Pedido limpiado':'El pedido ya está vacío',hadItems?'success':'error');
}
function clampPercent(value){return Math.min(100,Math.max(0,Number(value)||0))}
function cartTotals(){
  const subtotal=state.cart.reduce((sum,x)=>sum+(x.price*x.quantity)*(1-clampPercent(x.discount_percent)/100),0);
  const discountPercent=clampPercent($('#discount')?.value);
  const discount=Math.round(subtotal*discountPercent/100);
  return {subtotal:Math.round(subtotal),discountPercent,discount,total:Math.max(0,Math.round(subtotal)-discount)};
}
function toppingsByGroup(group){return state.toppings.filter(x=>x.group===group&&x.available).map(x=>x.name)}
function canUseBooster(product){return new Set(['001','002','004','005','006','007','008','009','017','018','019','020','021','022','028']).has(String(product.sku||''))}
function customizationSchema(product) {
  const sku=String(product.sku||'');
  const fruits=toppingsByGroup('Frutas'), sauces=toppingsByGroup('Salsas'), sweets=[...new Set([...toppingsByGroup('Dulces'),...toppingsByGroup('Crunch'),...toppingsByGroup('Perlas')])], bar=[...new Set([...fruits,...sweets])];
  const finish=['Dulce','Picante','Combinar dulce y picante'];
  const schemas={
    '001':[{title:'Elige 3 ingredientes de la barra',type:'multi',max:3,min:3,options:bar},{title:'Elige 1 salsa',type:'single',min:1,options:sauces},{title:'Elige 1 paleta',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '002':[{title:'Elige 3 ingredientes de la barra',type:'multi',max:3,min:3,options:bar},{title:'Elige 1 salsa',type:'single',min:1,options:sauces},{title:'Elige 1 paleta',type:'single',min:1,options:toppingsByGroup('Paletas')}],
    '003':[{title:'Elige 1 salsa artesanal',type:'single',min:1,options:sauces},{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets}],
    '029':[{title:'Elige 1 salsa artesanal',type:'single',min:1,options:sauces},{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets}],
    '030':[{title:'Elige 1 salsa artesanal',type:'single',min:1,options:sauces},{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets}],
    '004':[{title:'Elige el sabor del smoothie',type:'single',min:1,options:toppingsByGroup('Sabores smoothie')}],
    '005':[{title:'Elige el sabor de la soda',type:'single',min:1,options:['Frutos Amarillos','Frutos Rojos','Liche y Mora Azul']}],
    '006':[{title:'Elige la salsa',type:'single',min:1,options:['Salsa de Chocolate','Salsa de Caramelo']}],
    '007':[{title:'Elige la salsa',type:'single',min:1,options:['Salsa de Chocolate','Salsa de Caramelo']}],
    '009':[{title:'Elige el sabor de la chamoyada',type:'single',min:1,options:['Mango','Fresa','Sandía']}],
    '010':[{title:'Elige 5 frutas de la barra',type:'multi',max:5,min:5,options:fruits},{title:'Elige 1 salsa',type:'single',min:1,options:sauces},{title:'Elige 3 toppings',type:'multi',max:3,min:3,options:sweets},{title:'Elige el acabado',type:'single',min:1,options:finish}],
    '011':[{title:'Elige 4 frutas de la barra',type:'multi',max:4,min:4,options:fruits},{title:'Elige 1 salsa',type:'single',min:1,options:sauces},{title:'Elige 4 toppings',type:'multi',max:4,min:4,options:sweets},{title:'Elige el acabado',type:'single',min:1,options:finish}],
    '017':[{title:'Elige la cerveza',type:'single',min:1,options:toppingsByGroup('Cervezas')},{title:'Indica el nivel de picante',type:'text',min:1,placeholder:'Ej. poco picante o bastante picante'},{title:'Elige las frutas favoritas',type:'multi',max:fruits.length,min:0,options:fruits}],
    '018':[{title:'Elige la cerveza',type:'single',min:1,options:toppingsByGroup('Cervezas')},{title:'Elige la familia de frutas',type:'single',min:1,options:['Frutos Rojos','Frutos Amarillos']}],
    '020':[{title:'Elige la versión',type:'single',min:1,options:[{name:'Sin licor',value:'Sin licor'},{name:'Con licor + $5.000',value:'with_liquor',modifierCode:'with_liquor',modifierName:'Con licor',price:5000}]}],
    '021':[{title:'Elige la versión',type:'single',min:1,options:[{name:'Sin licor',value:'Sin licor'},{name:'Con licor + $5.000',value:'with_liquor',modifierCode:'with_liquor',modifierName:'Con licor',price:5000}]}],
    '022':[{title:'Elige la versión',type:'single',min:1,options:[{name:'Sin licor',value:'Sin licor'},{name:'Con licor + $5.000',value:'with_liquor',modifierCode:'with_liquor',modifierName:'Con licor',price:5000}]}],
    '028':[{title:'Indica el sabor disponible',type:'text',min:1,placeholder:'Escribe el sabor solicitado'},{title:'Elige el escarchado premium',type:'single',min:1,options:['Picante','Dulce']},{title:'Elige las frutas favoritas',type:'multi',max:fruits.length,min:0,options:fruits}],
  };
  return schemas[sku]||[];
}
function showProductCustomizer(product) {
  const schema=customizationSchema(product);
  const boosterSection=canUseBooster(product)?`<section class="custom-step booster-step"><h3><span class="custom-step-number">＋</span><span>Booster Lab <small>opcional · desde ${fmt(BOOSTER_LAB.price)}</small></span></h3><div class="choice-grid"><label class="choice-pill"><input type="radio" name="booster" value="" checked><span>Sin booster</span></label><label class="choice-pill paid"><input type="radio" name="booster" value="${BOOSTER_LAB.code}" data-label="${BOOSTER_LAB.name}" data-modifier-code="${BOOSTER_LAB.code}" data-price="${BOOSTER_LAB.price}"><span>Agregar Booster Lab<br><small>+ ${fmt(BOOSTER_LAB.price)}</small></span></label></div><div id="booster-flavor"></div></section>`:'';
  openModal(`<div class="customizer"><div class="customizer-product-head">${product.image_url?`<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name)}">`:''}<div><p class="eyebrow orange">PREPARA EL PEDIDO</p><h2>${escapeHtml(product.name)}</h2><p class="muted">${escapeHtml(product.description||'')}</p></div></div><div class="custom-flow"><span>1. Producto</span><span>2. Decisiones</span><span>3. Agregar</span></div><div class="custom-total"><span>Base ${fmt(product.price)}</span><strong id="custom-total">${fmt(product.price)}</strong></div><form id="custom-form">${schema.map((section,i)=>customSection(section,i)).join('')}${boosterSection}<label class="custom-note">Nota para preparación <small>opcional</small><input name="note" placeholder="Ej. sin picante, más hielo, separar salsa…"></label><div class="form-actions sticky-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary">Agregar al pedido</button></div></form></div>`,true);
  const updateTotal=()=>{$('#custom-total').textContent=fmt(product.price+selectedModifiers().reduce((s,x)=>s+x.price,0))};
  const selectedModifiers=()=>$$('#custom-form [data-price]:checked').map(x=>({code:x.dataset.modifierCode||x.value,name:x.dataset.label||x.dataset.choiceLabel||x.value,price:Number(x.dataset.price||0)})).filter(x=>x.code||x.name);
  const renderBoosterFlavor=()=>{const target=$('#booster-flavor'),code=$('[name="booster"]:checked')?.value;if(!target)return;const options=toppingsByGroup('Boosters Lab').map(value=>({name:value.replace(' booster',''),value}));target.innerHTML=code?customSection({title:'Elige el booster',type:'single',min:1,options},'booster-flavor'):''};
  $$('#custom-form input').forEach(x=>{const refresh=()=>{enforceLimits(x);if(x.name==='booster')renderBoosterFlavor();updateTotal()};x.onchange=refresh;if(x.type==='text')x.oninput=refresh});
  $('#custom-form').onsubmit=e=>{e.preventDefault();const selected=[],missing=[];schema.forEach((section,i)=>{const picked=section.type==='text'?[$(`[name="step-${i}"]`)?.value.trim()].filter(Boolean):$$(`[name="step-${i}"]:checked`).map(x=>x.dataset.choiceLabel||x.value);if((section.min||0)>picked.length)missing.push(section.title);picked.forEach(x=>selected.push(`${section.title}: ${x}`))});const boosterCode=$('[name="booster"]:checked')?.value;if(boosterCode){const flavor=$('[name="step-booster-flavor"]:checked');if(!flavor)missing.push('Booster Lab');else selected.push(`Booster Lab: ${flavor.dataset.choiceLabel||flavor.value.replace(' booster','')}`)}if(missing.length){toast(`Falta completar: ${missing.join(', ')}`,'error');return}const note=new FormData(e.currentTarget).get('note');if(note)selected.push(`Nota: ${note}`);const modifiers=selectedModifiers();const finalPrice=product.price+modifiers.reduce((s,x)=>s+x.price,0);addCartLine({product_id:product.id,name:product.name,price:finalPrice,quantity:1,toppings:selected,modifiers});closeModal();toast('Producto agregado')};
}
function customSection(section,index){const max=section.max||1,number=Number.isInteger(index)?index+1:'＋',helper=section.type==='text'?'respuesta requerida':section.min===0?'opcional':`elige ${max}`;if(section.type==='text')return `<section class="custom-step" data-step="${index}" data-max="1"><h3><span class="custom-step-number">${number}</span><span>${escapeHtml(section.title)} <small>${helper}</small></span></h3><input class="custom-open-input" name="step-${index}" maxlength="80" placeholder="${escapeAttr(section.placeholder||'Escribe la elección')}"></section>`;return `<section class="custom-step" data-step="${index}" data-max="${max}"><h3><span class="custom-step-number">${number}</span><span>${escapeHtml(section.title)} <small>${helper}</small></span></h3><div class="choice-grid">${section.options.map(opt=>{const object=typeof opt==='object',value=object?(opt.value??opt.code??opt.name):opt,label=object?(opt.name??value):opt,price=object?Number(opt.price||0):0,modifierCode=object?(opt.modifierCode||''):'';return `<label class="choice-pill ${price?'paid':''}"><input type="${section.type==='single'||section.type==='paid'?'radio':'checkbox'}" name="step-${index}" value="${escapeAttr(value)}" data-choice-label="${escapeAttr(label)}" ${modifierCode?`data-modifier-code="${escapeAttr(modifierCode)}" data-label="${escapeAttr(opt.modifierName||label)}"`:''} ${price?`data-price="${price}"`:''}><span>${escapeHtml(label)}${price?`<br><small>+ ${fmt(price)}</small>`:''}</span></label>`}).join('')}</div></section>`}
function extraChoiceSection(title,name,max,options){return `<section class="custom-step formula-extra-step" data-max="${max}"><h3>${escapeHtml(title)} <small>elige ${max}</small></h3><div class="choice-grid">${options.map(value=>`<label class="choice-pill"><input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div></section>`}
function enforceLimits(input){const step=input.closest('.custom-step');if(!step||input.type!=='checkbox')return;const max=Number(step.dataset.max||0);if(!max)return;const checked=$$('input:checked',step);if(checked.length>max){input.checked=false;toast(`Máximo ${max} opciones en este paso`,'error')}}
function renderCart() {
  const {subtotal,discount,total}=cartTotals();
  $('#cart-items').innerHTML=state.cart.length?state.cart.map((x,i)=>{const percent=clampPercent(x.discount_percent),gross=x.price*x.quantity,net=Math.round(gross*(1-percent/100));return `<div class="cart-line"><div><strong>${escapeHtml(x.name)}</strong>${x.toppings.length?`<small>${x.toppings.join(', ')}</small>`:''}<div class="qty-control"><button data-action="minus" data-index="${i}">−</button><span>${x.quantity}</span><button data-action="plus" data-index="${i}">＋</button><button data-action="remove" data-index="${i}">×</button></div><label class="line-discount">Descuento <input data-item-discount="${i}" type="number" min="0" max="100" step="0.01" value="${percent}"> %</label></div><span class="cart-line-price">${percent?`<small><s>${fmt(gross)}</s> · −${percent}%</small>`:''}${fmt(net)}</span></div>`}).join(''):`<div class="empty-cart"><span>🧪</span><h3>El experimento está vacío</h3><p>Selecciona productos para comenzar una nueva mezcla.</p></div>`;
  $('#subtotal').textContent=fmt(subtotal);$('#total').textContent=fmt(total);$('#checkout').disabled=!state.cart.length;
  $$('#cart-items button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index);if(b.dataset.action==='plus')state.cart[i].quantity++;if(b.dataset.action==='minus')state.cart[i].quantity=Math.max(1,state.cart[i].quantity-1);if(b.dataset.action==='remove')state.cart.splice(i,1);renderCart()});
  $$('[data-item-discount]').forEach(input=>input.oninput=()=>{const i=Number(input.dataset.itemDiscount),percent=clampPercent(input.value),line=input.closest('.cart-line'),gross=state.cart[i].price*state.cart[i].quantity;state.cart[i].discount_percent=percent;line.querySelector('.cart-line-price').innerHTML=`${percent?`<small><s>${fmt(gross)}</s> · −${percent}%</small>`:''}${fmt(Math.round(gross*(1-percent/100)))}`;const totals=cartTotals();$('#subtotal').textContent=fmt(totals.subtotal);$('#total').textContent=fmt(totals.total)});
}
async function showCheckout() {
  if(!state.cart.length){toast('Agrega al menos un producto antes de cobrar','error');return}
  try{
    const {cash_session}=await api('/api/cash-session');state.cash=cash_session;
  }catch(error){toast(error.message,'error');return}
  if(!state.cash){showQuickCashOpening();return}
  renderCheckout();
}
function showQuickCashOpening() {
  openModal(`<p class="eyebrow orange">PASO NECESARIO</p><h2>Abre la caja para cobrar</h2><p class="muted">La caja está cerrada. Registra el efectivo inicial y continuarás automáticamente con el cobro, sin perder el pedido.</p><form id="quick-open-cash" class="form-grid"><label class="full">Base inicial de efectivo<input name="opening_cash" type="number" min="0" value="0" required></label><div class="form-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary">Abrir caja y continuar</button></div></form>`);
  $('#quick-open-cash').onsubmit=async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('button[type="submit"],button:not([type])');submit.disabled=true;submit.textContent='Abriendo caja…';try{const {cash_session}=await api('/api/cash-session/open',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});state.cash=cash_session;closeModal();toast('Caja abierta');renderCheckout()}catch(error){submit.disabled=false;submit.textContent='Abrir caja y continuar';toast(error.message,'error')}};
}
function cartNeedsCommand(){return state.cart.some(x=>state.products.find(p=>p.id===x.product_id)?.send_to_command)}
function renderCheckout() {
  const {total}=cartTotals();
  const customer=$('#customer-name').value.trim();
  if(cartNeedsCommand()&&!customer){toast('Este pedido lleva preparación: escribe el nombre para poder llamarlo','error');$('#customer-name').focus();return}
  openModal(`<p class="eyebrow orange">FINALIZAR VENTA</p><h2>Cobrar ${fmt(total)}</h2><div class="checkout-ready"><span>✓ Caja abierta</span><small>El pedido solo se registra cuando confirmes el pago.</small></div><p class="muted">Selecciona un método o divide el total entre varios.</p><div class="payment-options four"><button type="button" class="payment-option active" data-payment="cash">💵<br>Efectivo</button><button type="button" class="payment-option" data-payment="qr">▦<br>Consignación QR</button><button type="button" class="payment-option" data-payment="card">💳<br>Tarjeta</button><button type="button" class="payment-option" data-payment="mixed">◒<br>Mixto</button></div><form id="payment-form" class="form-grid"><label class="full" id="received-label">Efectivo recibido<input id="received" type="number" min="${total}" value="${total}" required></label><div class="full cash-change">Cambio: <strong id="change">${fmt(0)}</strong></div><div id="mixed-fields" class="full mixed-fields"><p>Distribuye exactamente ${fmt(total)}</p><div><label>Efectivo<input id="cash-amount" type="number" min="0" value="0"></label><label>Consignación QR<input id="qr-amount" type="number" min="0" value="0"></label><label>Tarjeta<input id="card-amount" type="number" min="0" value="0"></label></div><strong id="mixed-balance">Falta asignar ${fmt(total)}</strong></div><div class="form-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary" id="confirm-payment">Confirmar pago</button></div></form>`);
  let payment='cash';
  const updateMixed=()=>{const assigned=Number($('#cash-amount').value||0)+Number($('#qr-amount').value||0)+Number($('#card-amount').value||0),difference=total-assigned;$('#mixed-balance').textContent=difference===0?'Total distribuido correctamente':difference>0?`Falta asignar ${fmt(difference)}`:`Excede el total por ${fmt(Math.abs(difference))}`;$('#mixed-balance').className=difference===0?'ok':'error'};
  $$('.payment-option').forEach(b=>b.onclick=()=>{payment=b.dataset.payment;$$('.payment-option').forEach(x=>x.classList.toggle('active',x===b));$('#received-label').style.display=payment==='cash'?'grid':'none';$('.cash-change').style.display=payment==='cash'?'block':'none';$('#mixed-fields').style.display=payment==='mixed'?'block':'none'});
  $('#received').oninput=e=>$('#change').textContent=fmt(Math.max(0,Number(e.target.value)-total));
  ['#cash-amount','#qr-amount','#card-amount'].forEach(id=>$(id).oninput=updateMixed);
  $('#payment-form').onsubmit=async e=>{e.preventDefault();const parts=payment==='mixed'?{cash_amount:Number($('#cash-amount').value||0),qr_amount:Number($('#qr-amount').value||0),card_amount:Number($('#card-amount').value||0)}:{};if(payment==='mixed'&&parts.cash_amount+parts.qr_amount+parts.card_amount!==total){toast('Distribuye exactamente el total antes de confirmar','error');return}await submitOrder('paid',payment,payment==='cash'?Number($('#received').value):null,parts)};
}
async function submitOrder(status,payment='cash',received=null,paymentParts={}) {
  const submitButton=status==='paid'?$('#confirm-payment'):$('#hold-order');
  const originalText=submitButton?.textContent;
  try{
    if(submitButton){submitButton.disabled=true;submitButton.textContent=status==='paid'?'Procesando pago…':'Guardando…'}
    const payload={status,payment_method:payment,received,...paymentParts,customer_name:$('#customer-name').value.trim(),discount_percent:clampPercent($('#discount').value),notes:$('#order-notes').value,items:state.cart.map(x=>({product_id:x.product_id,quantity:x.quantity,toppings:x.toppings,modifiers:x.modifiers||[],discount_percent:clampPercent(x.discount_percent)}))};
    const {order}=await api('/api/orders',{method:'POST',body:JSON.stringify(payload)});
    clearCart(false);closeModal();await loadCash();toast(status==='paid'?'Venta registrada correctamente':'Pedido pausado');
    if(status==='paid')showReceipt(order,true);
  }catch(error){if(submitButton){submitButton.disabled=false;submitButton.textContent=originalText}toast(error.message,'error')}
}
function showReceipt(order,checkoutFlow=false) {
  const parts=[['Efectivo',order.cash_amount],['Consignación QR',order.qr_amount],['Tarjeta',order.card_amount]].filter(x=>Number(x[1])>0);
  const flowActions=checkoutFlow?`<button class="button secondary" id="print-receipt">Impresión del navegador</button><button class="button primary" id="flow-next" ${order.invoice_printed_at?'':'disabled'}>${order.has_command?'Siguiente: comandera':'Siguiente'}</button>`:`${order.has_command?'<button class="button secondary" id="view-command">Ver comandera</button>':''}<button class="button secondary" id="print-receipt">Impresión del navegador</button><button class="button primary" data-close-modal>Cerrar</button>`;
  openModal(`<div class="print-flow-head"><span>Paso 1 de ${order.has_command?3:2}</span><strong>Imprime la factura y retírala de la impresora</strong></div><div class="thermal-preview"><div class="thermal-ticket receipt" data-ticket="invoice"><div class="receipt-head"><h2>SUPERLAB ✦</h2><div>Mix and Chill</div><small>Sucursal principal · Bogotá UTC−5</small></div><div class="receipt-lines"><div class="receipt-row"><span>Factura / pedido</span><span>${order.number}</span></div><div class="receipt-row"><span>Cliente</span><strong>${escapeHtml(order.customer_name||'Consumidor final')}</strong></div><div class="receipt-row"><span>Fecha y hora</span><span>${dateFmt(order.created_at)}</span></div><div class="receipt-row"><span>Cajero</span><span>${escapeHtml(order.cashier)}</span></div></div><div class="receipt-lines">${order.items.map(x=>`<div class="receipt-row"><span>${x.quantity} × ${escapeHtml(x.name)}</span><span>${fmt(x.subtotal)}</span></div>${Number(x.discount_percent)>0?`<small>Descuento de producto: ${x.discount_percent}% (− ${fmt(x.discount)})</small>`:''}`).join('')}</div><div class="receipt-lines"><div class="receipt-row"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>${Number(order.discount)>0?`<div class="receipt-row"><span>Descuento total ${order.discount_percent||0}%</span><span>− ${fmt(order.discount)}</span></div>`:''}<div class="receipt-row receipt-total"><span>TOTAL</span><span>${fmt(order.total)}</span></div><div class="receipt-row"><span>Pago</span><span>${paymentName(order.payment_method)}</span></div>${parts.map(x=>`<div class="receipt-row"><span>${x[0]}</span><span>${fmt(x[1])}</span></div>`).join('')}${order.payment_method==='cash'&&order.received!==null?`<div class="receipt-row"><span>Recibido</span><span>${fmt(order.received)}</span></div><div class="receipt-row"><span>Cambio</span><span>${fmt(Math.max(0,order.received-order.total))}</span></div>`:''}</div><div class="receipt-foot">Conserva esta factura.<br>${order.has_command?`Te llamaremos como <strong>${escapeHtml(order.customer_name||'cliente')}</strong>.`:'Tu pedido se entrega de inmediato en la barra. ¡Gracias por tu compra!'}</div></div>${printerPreviewPanel('invoice')}</div><div class="form-actions">${flowActions}</div>`);
  const printed=async()=>{const updated=await recordTicketPrint(order,'invoice');Object.assign(order,updated);if(checkoutFlow)$('#flow-next').disabled=false};
  $('#print-receipt').onclick=async()=>{printThermal('invoice');await printed()};
  $('#view-command')?.addEventListener('click',()=>showCommandTicket(order));
  $('#flow-next')?.addEventListener('click',()=>order.has_command?showCommandTicket(order,true):showOrderCompletion(order));
  setupPrinterPreview(order,'invoice',printed);
}

function printThermal(kind){document.body.dataset.printTicket=kind;window.print();setTimeout(()=>delete document.body.dataset.printTicket,300)}
function showCommandTicket(order,checkoutFlow=false) {
  if(!order.has_command){toast('Este pedido no necesita comandera','error');return}
  const items=order.command_items||order.items.filter(x=>x.send_to_command);
  const flowActions=checkoutFlow?`<button class="button secondary" id="print-command">Impresión del navegador</button><button class="button primary" id="flow-next" ${order.command_printed_at?'':'disabled'}>Siguiente</button>`:'<button class="button secondary" data-close-modal>Cerrar</button><button class="button secondary" id="print-command">Impresión del navegador</button>';
  openModal(`<div class="print-flow-head"><span>Paso 2 de 3</span><strong>Imprime la comandera y retírala de la impresora</strong></div><div class="thermal-preview"><div class="thermal-ticket command-ticket" data-ticket="command"><div class="command-ticket-head"><strong>COMANDA · ${preparationName(order.preparation_status).toUpperCase()}</strong><h2>${escapeHtml(order.number)}</h2><div class="call-name">LLAMAR A<br><b>${escapeHtml(order.customer_name||'SIN NOMBRE')}</b></div><small>${dateFmt(order.created_at)} · Caja</small><div class="command-estimate">APROX. ${order.estimated_wait_minutes} MIN · ${order.estimated_ready_at?timeFmt(order.estimated_ready_at):''}</div></div><div class="command-ticket-items">${items.map(x=>`<section><h3>${x.quantity} × ${escapeHtml(x.name)}</h3>${x.toppings?`<p>${escapeHtml(x.toppings)}</p>`:''}</section>`).join('')}</div>${order.notes?`<div class="command-ticket-note"><strong>NOTA GENERAL</strong><p>${escapeHtml(order.notes)}</p></div>`:''}<footer>Preparar y marcar como hecha en el POS</footer></div>${printerPreviewPanel('command')}</div><div class="form-actions">${flowActions}</div>`);
  const printed=async()=>{const updated=await recordTicketPrint(order,'command');Object.assign(order,updated);if(checkoutFlow)$('#flow-next').disabled=false};
  $('#print-command').onclick=async()=>{printThermal('command');await printed()};
  $('#flow-next')?.addEventListener('click',()=>showOrderCompletion(order));
  setupPrinterPreview(order,'command',printed);
}

function timeFmt(value){return new Intl.DateTimeFormat('es-CO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Bogota'}).format(new Date(value))}
async function recordTicketPrint(order,kind){const {order:updated}=await api(`/api/orders/${order.id}/print-status`,{method:'PUT',body:JSON.stringify({ticket_type:kind})});return updated}
function showOrderCompletion(order){
  openModal(`<div class="checkout-complete"><span class="checkout-complete-icon">✓</span><p class="eyebrow orange">VENTA FINALIZADA</p><h2>${escapeHtml(order.customer_name||'Cliente')}</h2>${order.has_command?`<p>Tu pedido estará listo aproximadamente en</p><strong>${order.estimated_wait_minutes} minutos</strong>${order.estimated_ready_at?`<small>Hora estimada: ${timeFmt(order.estimated_ready_at)}</small>`:''}`:'<p>Todo el pedido se prepara y entrega directamente en la barra.</p><strong>Entrega inmediata</strong>'}<button class="button primary wide" data-close-modal>Nuevo pedido</button></div>`);
}

// El botón de imprimir NUNCA nace deshabilitado: la conexión se resuelve al
// momento de pulsarlo (ver el manejador de #direct-print). Antes se
// deshabilitaba según el resultado del chequeo previo y, si ese chequeo
// fallaba o quedaba con datos viejos, el cajero se quedaba sin poder
// imprimir y sin explicación.
function printerPreviewPanel(kind){return `<aside class="printer-bubble"><div class="printer-bubble-head"><span class="printer-dot checking"></span><div><strong>Impresora térmica 80 mm</strong><small id="printer-status" role="status">Verificando conexión…</small></div></div><label class="printer-select-label">Impresora detectada<select id="printer-select" disabled><option>Buscando…</option></select></label><div class="printer-bubble-actions"><button type="button" class="button secondary" id="check-printer">Revisar conexión</button><button type="button" class="button primary" id="direct-print">Imprimir ${kind==='invoice'?'factura':'comandera'}</button></div><p class="printer-help">Impresión directa mediante QZ Tray. Si no está disponible, usa la impresión del navegador.</p></aside>`}

// Nombre de la última impresora vista. Sirve para preseleccionarla, pero
// NUNCA como prueba de que siga conectada: el socket con QZ Tray se cae al
// cerrar el modal, al dormirse el equipo o al reiniciarse QZ Tray, y un
// caché usado como "está conectada" termina mintiendo en pantalla.
let lastDetectedPrinter=null;
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

// Toda escritura de estado pasa por aquí. Si el modal ya se cerró (o se
// abrió otro distinto), los nodos quedan huérfanos y se descarta la
// escritura en vez de pintar sobre un DOM que ya nadie ve.
function paintPrinter(state,message,options={}){
  const status=$('#printer-status'),dot=$('.printer-dot'),select=$('#printer-select');
  if(!status||!dot||!select)return;
  dot.className=`printer-dot ${state}`;
  status.textContent=message;
  if(options.printers)select.innerHTML=options.printers.map(name=>`<option ${name===options.selected?'selected':''}>${escapeHtml(name)}</option>`).join('');
  if(options.empty)select.innerHTML='<option>Sin impresora</option>';
  select.disabled=state!=='connected';
}

// Enlace vivo con QZ Tray. Se llama también justo antes de imprimir, así
// que si el socket se cayó se vuelve a levantar en ese instante.
async function ensureQzConnected(){
  if(typeof qz==='undefined')throw new Error('QZ Tray no está instalado o no cargó en este equipo');
  if(qz.websocket.isActive())return;
  await Promise.race([
    qz.websocket.connect(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('No responde QZ Tray. Ábrelo en este equipo — si aparece una ventana pidiendo permiso, acéptala')),6000)),
  ]);
}

async function findPrinters(){
  await ensureQzConnected();
  const found=await Promise.race([
    qz.printers.find(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('QZ Tray no terminó de buscar las impresoras. Revisa que esté encendida, con papel y el cable bien puesto')),9000)),
  ]);
  const printers=(Array.isArray(found)?found:[found]).filter(Boolean);
  if(!printers.length)throw new Error('QZ Tray está conectado, pero no detectó impresoras');
  return printers;
}

// Siempre consulta de verdad (nunca desde caché) y reintenta un par de
// veces: la primera búsqueda tras un rato inactiva a veces no responde a
// tiempo, pero la segunda o tercera sí.
async function verifyPrinterConnection(attempt=1){
  const maxAttempts=3;
  paintPrinter('checking',attempt>1?`Reintentando conexión (${attempt}/${maxAttempts})…`:'Conectando con QZ Tray…');
  try{
    const printers=await findPrinters();
    const preferred=printers.find(name=>/sat|q22u|posprinter|pos[-\s]?80|thermal|ticket/i.test(name))||printers[0];
    lastDetectedPrinter=preferred;
    paintPrinter('connected',`Conectada · ${preferred}`,{printers,selected:preferred});
    return preferred;
  }catch(error){
    if(attempt<maxAttempts){await sleep(600);return verifyPrinterConnection(attempt+1)}
    lastDetectedPrinter=null;
    paintPrinter('disconnected',`Sin conexión · ${error.message||'Abre QZ Tray'}`,{empty:true});
    return null;
  }
}

function setupPrinterPreview(order,kind,onPrinted=()=>{}){
  const label=`Imprimir ${kind==='invoice'?'factura':'comandera'}`;
  $('#check-printer').onclick=()=>verifyPrinterConnection();
  $('#printer-select').onchange=e=>{lastDetectedPrinter=e.target.value;paintPrinter('connected',`Conectada · ${e.target.value}`)};
  $('#direct-print').onclick=async()=>{
    const button=$('#direct-print');
    button.disabled=true;button.textContent='Enviando…';
    try{
      // Se reconecta y se resuelve la impresora en el momento del clic: así
      // el botón funciona aunque el chequeo previo haya fallado o el enlace
      // con QZ Tray se haya caído mientras el modal estaba abierto.
      paintPrinter('checking','Conectando con la impresora…');
      await ensureQzConnected();
      const chosen=$('#printer-select')?.value;
      let printer=(chosen&&chosen!=='Sin impresora'&&chosen!=='Buscando…')?chosen:(lastDetectedPrinter||await verifyPrinterConnection());
      if(!printer)throw new Error('No se encontró ninguna impresora conectada');
      paintPrinter('checking','Generando ticket ESC/POS…');
      const ticket=await api(`/api/orders/${order.id}/escpos?type=${kind}`);
      paintPrinter('checking',`Enviando a ${printer}…`);
      await qz.print(qz.configs.create(printer),[{type:'raw',format:'base64',data:ticket.escpos_base64}]);
      await onPrinted();
      lastDetectedPrinter=printer;
      paintPrinter('connected',`Impresión enviada · ${printer}`);
      toast('Ticket enviado a la impresora');
    }catch(error){
      lastDetectedPrinter=null;
      paintPrinter('disconnected',`No se pudo imprimir · ${error.message}`);
      toast(error.message,'error');
    }finally{
      const current=$('#direct-print');
      if(current){current.disabled=false;current.textContent=label}
    }
  };
  setTimeout(verifyPrinterConnection,50);
}

async function loadOrders() {
  const {orders}=await api('/api/orders');
  state.orders=orders;renderOrders();
}
function renderOrders(){
  const orders=state.orders;
  $$('#order-filters [data-order-filter]').forEach(button=>button.classList.toggle('active',button.dataset.orderFilter===state.orderFilter));
  const filtered=orders.filter(order=>{
    if(state.orderFilter==='paid')return order.status==='paid';
    if(state.orderFilter==='queued')return order.status==='paid'&&order.has_command&&['queued','preparing'].includes(order.preparation_status);
    return order.status==='paid'&&order.has_command&&order.preparation_status===state.orderFilter;
  });
  $('#command-board').innerHTML=filtered.length?filtered.map(o=>{const index=orders.indexOf(o),items=o.has_command?o.command_items:o.items,next=nextOrderStatus(o.preparation_status);return `<article class="command-card ${o.preparation_status}"><header><div><small>${state.orderFilter==='paid'?'Facturado':preparationName(o.preparation_status)}</small><h3>${escapeHtml(o.number)}</h3><b class="command-customer">${escapeHtml(o.customer_name||'Sin nombre')}</b></div><time>${dateFmt(o.created_at)}</time></header>${o.has_command?`<div class="order-estimate"><strong>${o.estimated_wait_minutes} min</strong><span>${o.estimated_ready_at?`Entrega aprox. ${timeFmt(o.estimated_ready_at)}`:'Tiempo por calcular'}</span></div>`:'<div class="order-estimate immediate"><strong>Inmediato</strong><span>Preparado en la barra</span></div>'}<div class="command-items">${items.map(x=>`<div><strong>${x.quantity} × ${escapeHtml(x.name)}</strong>${x.toppings?`<p>${escapeHtml(x.toppings)}</p>`:''}</div>`).join('')}</div>${o.notes?`<p class="command-note"><strong>Nota:</strong> ${escapeHtml(o.notes)}</p>`:''}<footer><div class="command-buttons"><button class="button secondary" data-receipt="${index}">Factura</button>${o.has_command?`<button class="button secondary" data-view-command="${index}">Comanda</button>`:''}${state.orderFilter!=='paid'&&next?`<button class="button primary" data-command="${o.id}" data-next="${next}">${nextOrderAction(o.preparation_status)}</button>`:''}</div></footer></article>`}).join(''):`<div class="empty-commands">No hay pedidos en esta sección.</div>`;
  $$('[data-command]').forEach(b=>b.onclick=async()=>{try{await api(`/api/orders/${b.dataset.command}/status`,{method:'PUT',body:JSON.stringify({status:b.dataset.next})});await loadOrders();toast('Comanda actualizada')}catch(error){toast(error.message,'error')}});
  $$('[data-view-command]').forEach(b=>b.onclick=()=>showCommandTicket(orders[Number(b.dataset.viewCommand)]));
  $$('[data-print-command]').forEach(b=>b.onclick=()=>{const order=orders[Number(b.dataset.printCommand)];showCommandTicket(order);setTimeout(()=>printThermal('command'),50)});
  $('#orders-table').innerHTML=orders.length?orders.map((o,i)=>`<tr><td><strong>${o.number}</strong><br><small>${escapeHtml(o.customer_name||'Sin nombre')} · ${o.source==='tablet'?'Autoservicio':'Caja'} · ${o.items.length} líneas</small></td><td>${dateFmt(o.created_at)}</td><td>${escapeHtml(o.cashier)}</td><td><span class="status-badge ${o.preparation_status}">${o.status==='paid'?preparationName(o.preparation_status):statusName(o.status)}</span></td><td>${paymentName(o.payment_method)}</td><td><strong>${fmt(o.total)}</strong></td><td><div class="row-actions">${o.status==='paid'?`<button data-receipt="${i}">Factura</button>`:''}${o.has_command?`<button data-view-command="${i}">Comanda</button>`:''}</div></td></tr>`).join(''):`<tr><td colspan="7">Todavía no hay pedidos.</td></tr>`;
  $$('[data-receipt]').forEach(b=>b.onclick=()=>showReceipt(orders[Number(b.dataset.receipt)]));
  $$('[data-view-command]').forEach(b=>b.onclick=()=>showCommandTicket(orders[Number(b.dataset.viewCommand)]));
}
function statusName(status){return ({paid:'Pagado',held:'Pausado',queued:'Nuevo',preparing:'En preparación',ready:'Listo para entregar',completed:'Entregado'})[status]||status}
function preparationName(status){return ({held:'Pausado',queued:'Por hacer',preparing:'En preparación',ready:'Listo para llamar',completed:'Entregado'})[status]||status}
function nextOrderStatus(status){return ({queued:'ready',preparing:'ready',ready:'completed'})[status]||''}
function nextOrderAction(status){return ({queued:'Marcar hecho',preparing:'Marcar hecho',ready:'Marcar entregado'})[status]||'Actualizar'}

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
  $('#products-table').innerHTML=state.products.length?state.products.map(p=>`<tr data-product-row="${p.id}"><td class="drag-cell"><button type="button" draggable="true" class="drag-handle" title="Arrastra o pulsa para cambiar el orden" aria-label="Mover ${escapeAttr(p.name)}">☰</button></td><td><div class="product-cell">${p.image_url?`<img src="${escapeAttr(p.image_url)}" alt="">`:`<span>🧪</span>`}<div><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.description||'Sin descripción')}</small></div></div></td><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.sku||'—')}</td><td><strong>${p.price===null?'Pendiente':fmt(p.price)}</strong></td><td>${p.send_to_command?`<span class="prep-badge command">Comandera · ${p.prep_minutes} min · tanda ${p.batch_capacity}</span>`:'<span class="prep-badge immediate">En barra</span>'}</td><td><span class="status-badge ${p.available?'':'inactive'}">${p.available?'Sí':'No'}</span></td><td><div class="row-actions"><button data-edit-product="${p.id}">Editar</button><button class="delete-row" data-delete-product="${p.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="8">No hay productos. Crea el primero cuando tengas nombres y precios definitivos.</td></tr>`;
  bindProductOrdering();
  $$('[data-edit-product]').forEach(b=>b.onclick=()=>showProductForm(state.products.find(x=>x.id===Number(b.dataset.editProduct))));
  $$('[data-delete-product]').forEach(b=>b.onclick=async()=>{const product=state.products.find(x=>x.id===Number(b.dataset.deleteProduct));if(!confirm(`¿Eliminar "${product.name}" del catálogo?`))return;try{await api(`/api/products/${product.id}`,{method:'DELETE'});await loadCatalog();renderProductTable();toast('Producto eliminado')}catch(error){toast(error.message,'error')}});
}
function bindProductOrdering(){let dragged=null,selected=null,saving=false;const save=async()=>{if(saving)return;saving=true;const ids=$$('[data-product-row]').map(x=>Number(x.dataset.productRow));try{const data=await api('/api/products/reorder',{method:'PUT',body:JSON.stringify({product_ids:ids})});state.products=data.products;renderProducts();renderProductTable();toast('Orden de productos guardado')}catch(error){toast(error.message,'error');await loadCatalog();renderProductTable()}finally{saving=false}};$$('[data-product-row]').forEach(row=>{const handle=$('.drag-handle',row);handle.ondragstart=e=>{dragged=row;row.classList.add('dragging');e.dataTransfer.effectAllowed='move'};row.ondragover=e=>{if(!dragged||dragged===row)return;e.preventDefault();const box=row.getBoundingClientRect(),after=e.clientY>box.top+box.height/2;row.parentNode.insertBefore(dragged,after?row.nextSibling:row)};handle.ondragend=async()=>{if(!dragged)return;dragged.classList.remove('dragging');dragged=null;await save()};handle.onclick=e=>{e.stopPropagation();if(selected===row){row.classList.remove('ordering');selected=null;return}if(selected){row.parentNode.insertBefore(selected,row);selected.classList.remove('ordering');selected=null;save();return}selected=row;row.classList.add('ordering');toast('Ahora pulsa las tres líneas del producto donde quieres colocarlo')};row.onclick=e=>{if(!selected||selected===row||e.target.closest('button'))return;row.parentNode.insertBefore(selected,row);selected.classList.remove('ordering');selected=null;save()}})}
function showProductForm(product=null) {
  openModal(`<p class="eyebrow orange">CATÁLOGO</p><h2>${product?'Editar':'Nuevo'} producto</h2><form id="product-form" class="form-grid">
    <label>Nombre<input name="name" value="${escapeAttr(product?.name||'')}" required></label>
    <label>Categoría<select name="category_id">${state.categories.map(x=>`<option value="${x.id}" ${x.id===product?.category_id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></label>
    <label>Precio COP <small>Puede quedar vacío</small><input name="price" type="number" min="0" value="${product?.price??''}"></label>
    <label>Código numérico<input name="sku" inputmode="numeric" pattern="[0-9]*" maxlength="18" value="${escapeAttr(product?.sku||'')}" placeholder="Ej. 015"></label>
    <label class="full">Imagen por URL<input name="image_url" value="${product?.image_url?.startsWith('data:')?'':escapeAttr(product?.image_url||'')}" placeholder="https://..."></label>
    <label class="full">O subir imagen <small>JPG, PNG o WebP · máximo 2 MB</small><input id="image-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <div id="image-preview" class="full image-preview">${product?.image_url?`<img src="${escapeAttr(product.image_url)}" alt="Vista previa">`:'Sin imagen seleccionada'}</div>
    <label class="full">Descripción<textarea name="description">${escapeHtml(product?.description||'')}</textarea></label>
    <label><span>Disponible</span><select name="available"><option value="true" ${product?.available!==false?'selected':''}>Sí</option><option value="false" ${product?.available===false?'selected':''}>No</option></select></label>
    <label><span>Personalizable</span><select name="customizable"><option value="false">No</option><option value="true" ${product?.customizable?'selected':''}>Sí</option></select></label>
    <label class="full"><span>¿Se prepara aparte y sale en comandera?</span><select name="send_to_command" id="send-to-command"><option value="false">No, se entrega en la barra</option><option value="true" ${product?.send_to_command?'selected':''}>Sí, enviar a la comandera</option></select></label>
    <div id="prep-settings" class="full prep-settings"><label>Tiempo por tanda (minutos)<input name="prep_minutes" type="number" min="1" max="180" value="${product?.prep_minutes||5}"></label><label>Productos iguales por tanda<input name="batch_capacity" type="number" min="1" max="100" value="${product?.batch_capacity||1}"><small>Ejemplo: 3 bebidas iguales se preparan en el mismo tiempo.</small></label></div>
    <div class="form-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary">Guardar producto</button></div>
  </form>`);
  let uploadedImage=product?.image_url?.startsWith('data:')?product.image_url:null;
  const updatePrepFields=()=>{$('#prep-settings').classList.toggle('visible',$('#send-to-command').value==='true')};
  $('#send-to-command').onchange=updatePrepFields;updatePrepFields();
  $('#image-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>10_000_000){toast('La imagen no puede superar 10 MB','error');e.target.value='';return}uploadedImage=await optimizeImage(file);$('#image-preview').innerHTML=`<img src="${uploadedImage}" alt="Vista previa">`;toast('Imagen optimizada para carga rápida')};
  $('#product-form').onsubmit=async e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));raw.image_url=uploadedImage||raw.image_url||null;raw.available=raw.available==='true';raw.customizable=raw.customizable==='true';raw.send_to_command=raw.send_to_command==='true';raw.prep_minutes=raw.send_to_command?Number(raw.prep_minutes):0;raw.batch_capacity=raw.send_to_command?Number(raw.batch_capacity):1;raw.price=raw.price===''?null:Number(raw.price);try{await api(product?`/api/products/${product.id}`:'/api/products',{method:product?'PUT':'POST',body:JSON.stringify(raw)});await loadCatalog();renderProductTable();closeModal();toast('Producto guardado')}catch(error){toast(error.message,'error')}};
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
  openModal(`<p class="eyebrow orange">INVENTARIO</p><h2>${item?'Editar':'Nuevo'} insumo</h2><p class="muted">El stock informativo puede quedar en cero y nunca bloqueará una venta.</p><form id="stock-form" class="form-grid"><label>Nombre<input name="name" value="${escapeAttr(item?.name||'')}" required></label><label>Categoría<input name="category" value="${escapeAttr(item?.category||'General')}" placeholder="Frutas, salsas…"></label><label>Cantidad actual<input name="quantity" type="number" min="0" step="0.001" value="${item?.quantity??0}" required></label><label>Unidad<select name="unit">${units.map(x=>`<option value="${x}" ${x===item?.unit?'selected':''}>${x}</option>`).join('')}</select></label><label>Alerta roja desde<input name="critical_level" type="number" min="0" step="0.001" value="${item?.critical_level??0}" required><small>Crítico si queda esta cantidad o menos.</small></label><label>Alerta amarilla desde<input name="low_level" type="number" min="0" step="0.001" value="${item?.low_level??0}" required><small>Próximo a acabarse si queda esta cantidad o menos.</small></label><label class="full">Notas<textarea name="notes" placeholder="Proveedor, presentación, ubicación…">${escapeHtml(item?.notes||'')}</textarea></label><div class="form-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary">Guardar insumo</button></div></form>`);
  $('#stock-form').onsubmit=async e=>{e.preventDefault();const raw=Object.fromEntries(new FormData(e.currentTarget));['quantity','critical_level','low_level'].forEach(key=>raw[key]=Number(raw[key]||0));try{await api(item?`/api/inventory/${item.id}`:'/api/inventory',{method:item?'PUT':'POST',body:JSON.stringify(raw)});closeModal();await loadInventory();toast('Inventario actualizado')}catch(error){toast(error.message,'error')}};
}

async function loadWorkers() {
  const {users}=await api('/api/users');
  $('#workers-table').innerHTML=users.map(u=>`<tr><td><strong>${escapeHtml(u.name)}</strong>${u.immutable?'<br><small>Cuenta protegida</small>':''}</td><td>${escapeHtml(u.email)}</td><td>${u.role==='superadmin'?'Superusuario':u.role==='tablet'?'Tablet de pedidos':'Trabajador'}</td><td>${dateFmt(u.created_at)}</td><td><span class="status-badge ${u.active?'':'inactive'}">${u.active?'Activo':'Inactivo'}</span></td><td><div class="row-actions">${u.immutable?'🔒':`<button data-toggle-worker="${u.id}" data-active="${u.active}">${u.active?'Desactivar':'Activar'}</button>`}</div></td></tr>`).join('');
  $$('[data-toggle-worker]').forEach(b=>b.onclick=async()=>{try{await api(`/api/users/${b.dataset.toggleWorker}`,{method:'PUT',body:JSON.stringify({active:b.dataset.active!=='true'})});await loadWorkers();toast('Trabajador actualizado')}catch(error){toast(error.message,'error')}});
}
function showWorkerForm() {
  openModal(`<p class="eyebrow orange">EQUIPO</p><h2>Nuevo trabajador</h2><p class="muted">Tendrá acceso al POS, pedidos propios y caja; nunca al panel de administración.</p><form id="worker-form" class="form-grid"><label>Nombre completo<input name="name" required></label><label>Correo<input name="email" type="email" required></label><label>Contraseña temporal<input name="password" type="password" minlength="8" required></label><label>PIN de caja<input name="pin" inputmode="numeric" minlength="4" placeholder="Opcional"></label><div class="form-actions"><button type="button" class="button secondary" data-close-modal>Cancelar</button><button class="button primary">Crear acceso</button></div></form>`);
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
