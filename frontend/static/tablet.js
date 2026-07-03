const tabletState={products:[],categories:[],toppings:[],cart:[],category:'all'};
const $t=(selector,root=document)=>root.querySelector(selector);
const $$t=(selector,root=document)=>[...root.querySelectorAll(selector)];
const money=value=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value||0)).replace('COP','$');
const MAIN_SKUS=new Set(['001','002','003','004','005','006','007','008','009','010','011','012','013','014','015','016','017']);
const POTENCIADORES=[
  {code:'booster_8',name:'Fórmula X 8 ml',price:3000,image:'/static/products/014.png'},
  {code:'booster_20',name:'Fórmula X Max 20 ml',price:5000,image:'/static/products/018.png'},
];

async function tabletApi(path,options={}){
  const response=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json'},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'No fue posible completar la solicitud');
  return data;
}
function esc(value){const d=document.createElement('div');d.textContent=String(value??'');return d.innerHTML}
function toastTablet(message,type=''){const n=document.createElement('div');n.className=`tablet-toast ${type}`;n.textContent=message;$t('#tablet-toast').append(n);setTimeout(()=>n.remove(),3200)}
function group(name){return tabletState.toppings.filter(x=>x.group===name&&x.available).map(x=>x.name)}

async function loadTabletApp(){
  const data=await tabletApi('/api/catalog');
  tabletState.products=data.products.filter(p=>MAIN_SKUS.has(String(p.sku))&&p.available&&p.price!==null);
  tabletState.categories=data.categories.filter(c=>tabletState.products.some(p=>p.category_id===c.id));
  tabletState.toppings=data.toppings;
  $t('#tablet-login').hidden=true;$t('#tablet-app').hidden=false;
  renderTabletCategories();renderTabletProducts();renderTabletCart();
}
async function initTablet(){
  bindTablet();
  $t('#tablet-login-form').onsubmit=async event=>{
    event.preventDefault();$t('#tablet-login-error').textContent='';
    const values=Object.fromEntries(new FormData(event.currentTarget));
    try{await tabletApi('/api/tablet/session',{method:'POST',body:JSON.stringify(values)});await loadTabletApp()}
    catch(error){$t('#tablet-login-error').textContent=error.message}
  };
  try{await loadTabletApp()}catch(_error){$t('#tablet-login').hidden=false;$t('#tablet-app').hidden=true}
}
function bindTablet(){
  $t('#tablet-categories').onclick=e=>{const b=e.target.closest('button');if(!b)return;tabletState.category=b.dataset.category;renderTabletCategories();renderTabletProducts()};
  $t('#open-cart').onclick=()=>$t('#tablet-cart').classList.add('open');
  $t('#lock-tablet').onclick=async()=>{await tabletApi('/api/auth/logout',{method:'POST'});tabletState.cart=[];$t('#tablet-app').hidden=true;$t('#tablet-login').hidden=false;$t('#tablet-login-form').reset();renderTabletCart()};
  $t('#close-cart').onclick=()=>$t('#tablet-cart').classList.remove('open');
  $t('#send-tablet-order').onclick=sendTabletOrder;
  $t('#tablet-modal').onclick=e=>{if(e.target.id==='tablet-modal')closeTabletModal()};
  $t('.modal-close').onclick=closeTabletModal;
  document.addEventListener('click',event=>{const button=event.target.closest('[data-voice-target]');if(button)startVoiceDictation(button.dataset.voiceTarget,button)});
}
function renderTabletCategories(){
  $t('#tablet-categories').innerHTML=[{id:'all',name:'Todos'},...tabletState.categories].map(c=>`<button data-category="${c.id}" class="${String(c.id)===String(tabletState.category)?'active':''}">${esc(c.name)}</button>`).join('');
}
function renderTabletProducts(){
  const products=tabletState.products.filter(p=>tabletState.category==='all'||String(p.category_id)===String(tabletState.category));
  $t('#tablet-products').innerHTML=products.map(p=>`<button class="tablet-product" data-product="${p.id}">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:''}<div><strong>${esc(p.name)}</strong><small>${esc(p.description||'')}</small><b>${money(p.price)}</b></div></button>`).join('');
  $$t('[data-product]').forEach(b=>b.onclick=()=>selectTabletProduct(Number(b.dataset.product)));
}
function baseSections(sku){
  const fruits=group('Frutas'),sauces=group('Salsas'),sweets=[...group('Dulces'),...group('Crunch'),...group('Perlas')];
  return ({
    '001':[{title:'Elige los 2 toppings incluidos',max:2,min:2,options:sweets},{title:'Elige la salsa incluida',max:1,min:1,options:sauces},{title:'Elige la paleta incluida',max:1,min:1,options:group('Paletas')}],
    '002':[{title:'Elige los 3 toppings incluidos',max:3,min:3,options:sweets},{title:'Elige la salsa incluida',max:1,min:1,options:sauces},{title:'Elige la paleta incluida',max:1,min:1,options:group('Paletas')}],
    '003':[{title:'Elige la Fórmula Frutal',max:1,min:1,options:fruits},{title:'Elige salsa o leche condensada',max:1,min:1,options:[...sauces,'Leche Condensada']},{title:'Elige la paleta incluida',max:1,min:1,options:group('Paletas')}],
    '004':[{title:'Elige el sabor del smoothie',max:1,min:1,options:group('Sabores smoothie')},{title:'Elige 3 toppings de frutas o dulces',max:3,min:3,options:[...fruits,...sweets]},{title:'Elige 1 salsa',max:1,min:1,options:sauces}],
    '005':[{title:'Elige la Fórmula Frutal',max:1,min:1,options:fruits}],
    '010':[{title:'Elige 5 frutas',max:5,min:5,options:fruits},{title:'Elige la base',max:1,min:1,options:['Yogur','Crema de Leche','Chamoy']},{title:'Elige 3 toppings',max:3,min:3,options:sweets},{title:'Elige hasta 2 salsas',max:2,min:1,options:sauces}],
    '011':[{title:'Elige 4 frutas premium',max:4,min:4,options:fruits},{title:'Elige hasta 3 toppings y gomitas',max:3,min:1,options:sweets},{title:'Elige hasta 2 salsas',max:2,min:1,options:sauces}],
    '015':[{title:'Elige la salsa incluida',max:1,min:1,options:sauces},{title:'Elige hasta 2 toppings',max:2,min:1,options:sweets}],
    '016':[{title:'Elige las 2 salsas incluidas',max:2,min:2,options:sauces},{title:'Elige hasta 3 toppings',max:3,min:1,options:sweets}],
    '017':[{title:'Elige la cerveza',max:1,min:1,options:group('Cervezas')}],
  })[sku]||[];
}
function selectTabletProduct(id){
  const product=tabletState.products.find(p=>p.id===id),sku=String(product.sku);
  const sections=baseSections(sku);
  openTabletCustomizer(product,sections);
}
function openTabletCustomizer(product,sections){
  $t('#tablet-modal-body').innerHTML=`<p class="eyebrow orange">PERSONALIZA PASO A PASO</p><h2>${esc(product.name)}</h2><p class="muted">${esc(product.description||'')}</p><form id="tablet-custom-form">${sections.map((s,i)=>choiceSection(s,i)).join('')}${potentiatorSection()}<label class="custom-note">Nota para este producto<span class="voice-field"><input id="tablet-product-note" name="product_note" maxlength="120" placeholder="Ej. sin picante o salsa aparte"><button type="button" class="voice-button" data-voice-target="#tablet-product-note">🎙 Hablar</button></span></label><div class="form-actions"><button type="button" class="button secondary" id="cancel-tablet-custom">Cancelar</button><button class="button primary">Agregar a mi pedido</button></div></form>`;
  $t('#tablet-modal').classList.add('open');$t('#tablet-modal').setAttribute('aria-hidden','false');
  $t('#cancel-tablet-custom').onclick=closeTabletModal;
  $$t('#tablet-custom-form input').forEach(input=>input.onchange=()=>{enforceTabletLimit(input);if(input.name==='tablet-syringe')renderTabletSyringeFlavor()});
  $t('#tablet-custom-form').onsubmit=e=>saveTabletCustomization(e,product,sections);
}
function choiceSection(section,index){
  return `<section class="tablet-choice-section custom-step" data-max="${section.max}"><h3><span class="tablet-step-number">${index+1}</span>${esc(section.title)} <small>${section.min===section.max?`elige ${section.max}`:`mín. ${section.min} · máx. ${section.max}`}</small></h3><div class="choice-grid">${section.options.map(x=>`<label class="choice-pill"><input type="${section.max===1?'radio':'checkbox'}" name="tablet-step-${index}" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div></section>`;
}
function potentiatorSection(){
  return `<section class="tablet-choice-section"><h3><span class="tablet-step-number">＋</span>Fórmula X <small>potenciador opcional</small></h3><p class="tablet-formulas-note">Puedes agregar un toque extra de sabor a tu preparación.</p><div class="choice-grid"><label class="choice-pill"><input type="radio" name="tablet-syringe" value="" checked><span>Sin Fórmula X</span></label>${POTENCIADORES.map(s=>`<label class="choice-pill paid addon-choice"><input type="radio" name="tablet-syringe" value="${s.code}" data-price="${s.price}"><span><img class="tablet-addon-image" src="${s.image}" alt="${esc(s.name)}"><b>${esc(s.name)}</b><small>+ ${money(s.price)}</small></span></label>`).join('')}</div><div id="tablet-syringe-flavor"></div></section>`;
}
function renderTabletSyringeFlavor(){
  const code=$t('[name="tablet-syringe"]:checked')?.value,target=$t('#tablet-syringe-flavor');
  if(!target)return;
  if(!code){target.innerHTML='';return}
  target.innerHTML=`<div class="formula-extra-head"><strong>Elige el sabor de la Fórmula X</strong></div><div class="choice-grid">${group('Boosters Lab').map(v=>`<label class="choice-pill"><input type="radio" name="tablet-syringe-flavor" value="${esc(v)}"><span>${esc(v.replace(' booster',''))}</span></label>`).join('')}</div>`;
}
function enforceTabletLimit(input){
  const section=input.closest('[data-max]');if(!section||input.type!=='checkbox')return;
  const max=Number(section.dataset.max),checked=$$t('input:checked',section);
  if(checked.length>max){input.checked=false;toastTablet(`Puedes elegir máximo ${max}`,'error')}
}
function saveTabletCustomization(event,product,sections){
  event.preventDefault();const labels=[],missing=[];
  sections.forEach((section,i)=>{const selected=$$t(`[name="tablet-step-${i}"]:checked`).map(x=>x.value);if(selected.length<section.min)missing.push(section.title);if(selected.length>section.max)missing.push(section.title);if(selected.length)labels.push(`${section.title}: ${selected.join(', ')}`)});
  const modifiers=[],syringeCode=$t('[name="tablet-syringe"]:checked')?.value,syringe=POTENCIADORES.find(s=>s.code===syringeCode);
  if(syringe){const flavor=$t('[name="tablet-syringe-flavor"]:checked')?.value;if(!flavor)missing.push('Sabor de la Fórmula X');else labels.push(`Sabor de Fórmula X: ${flavor.replace(' booster','')}`);modifiers.push({code:syringe.code,name:syringe.name,price:syringe.price})}
  const note=new FormData(event.currentTarget).get('product_note');if(note)labels.push(`Nota: ${note}`);
  if(missing.length){toastTablet(`Falta completar: ${missing.join(' · ')}`,'error');return}
  addTabletLine(product,labels,modifiers);closeTabletModal();
}
function addTabletLine(product,toppings,modifiers){
  const price=product.price+modifiers.reduce((sum,x)=>sum+x.price,0);
  tabletState.cart.push({product_id:product.id,name:product.name,quantity:1,price,toppings,modifiers});
  renderTabletCart();toastTablet(`${product.name} agregado`);
}
function renderTabletCart(){
  $t('#cart-count').textContent=tabletState.cart.reduce((s,x)=>s+x.quantity,0);
  $t('#tablet-cart-lines').innerHTML=tabletState.cart.length?tabletState.cart.map((x,i)=>`<div class="tablet-cart-line"><div><strong>${x.quantity} × ${esc(x.name)}</strong>${x.toppings.length?`<small>${x.toppings.map(esc).join('<br>')}</small>`:''}</div><div><b>${money(x.price*x.quantity)}</b><button data-remove="${i}">Quitar</button></div></div>`).join(''):'<div class="tablet-empty">Tu pedido está vacío.<br>Elige un producto para comenzar.</div>';
  $t('#tablet-total').textContent=money(tabletState.cart.reduce((s,x)=>s+x.price*x.quantity,0));
  $t('#send-tablet-order').disabled=!tabletState.cart.length;
  $$t('[data-remove]').forEach(b=>b.onclick=()=>{tabletState.cart.splice(Number(b.dataset.remove),1);renderTabletCart()});
}
async function sendTabletOrder(){
  const customer=$t('#customer-name').value.trim();if(!customer){toastTablet('Escribe tu nombre para poder llamar el pedido','error');return}
  const note=$t('#tablet-order-note').value.trim(),payload={notes:`Cliente: ${customer}${note?` · ${note}`:''}`,items:tabletState.cart.map(x=>({product_id:x.product_id,quantity:x.quantity,toppings:x.toppings,modifiers:x.modifiers}))};
  try{
    $t('#send-tablet-order').disabled=true;
    const {order}=await tabletApi('/api/tablet/orders',{method:'POST',body:JSON.stringify(payload)});
    tabletState.cart=[];renderTabletCart();$t('#tablet-cart').classList.remove('open');
    $t('#tablet-modal-body').innerHTML=`<div class="tablet-success"><span>✓</span><h2>¡Pedido enviado!</h2><p>Tu comanda ya apareció en la pantalla del equipo.</p><div class="order-number">${esc(order.number)}</div><p>Espera a que llamen a <strong>${esc(customer)}</strong>.</p><button class="button primary" id="new-tablet-order">Hacer otro pedido</button></div>`;
    $t('#tablet-modal').classList.add('open');$t('#new-tablet-order').onclick=()=>{closeTabletModal();$t('#customer-name').value='';$t('#tablet-order-note').value=''};
  }catch(error){toastTablet(error.message,'error');$t('#send-tablet-order').disabled=false}
}
function closeTabletModal(){$t('#tablet-modal').classList.remove('open');$t('#tablet-modal').setAttribute('aria-hidden','true')}
function startVoiceDictation(selector,button){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition,target=$t(selector);
  if(!SpeechRecognition){toastTablet('El dictado por voz necesita Google Chrome o Microsoft Edge','error');return}
  const recognition=new SpeechRecognition();recognition.lang='es-CO';recognition.interimResults=false;recognition.maxAlternatives=1;
  const original=button.textContent;button.textContent='Escuchando…';button.classList.add('listening');
  recognition.onresult=event=>{const spoken=event.results[0][0].transcript.trim();target.value=[target.value.trim(),spoken].filter(Boolean).join('. ');target.dispatchEvent(new Event('input',{bubbles:true}))};
  recognition.onerror=()=>toastTablet('No pude escuchar. Revisa el permiso del micrófono e inténtalo otra vez.','error');
  recognition.onend=()=>{button.textContent=original;button.classList.remove('listening')};
  recognition.start();
}
initTablet();
