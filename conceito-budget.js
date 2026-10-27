const form=document.querySelector('#budget-form');
if(form){
 const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2});
 const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
 const rows=[...form.querySelectorAll('[data-cost-row]')];
 const feedback=document.querySelector('#budget-feedback');
 const value=input=>Number(input.value);
 const sliders=[];
 for(const input of form.querySelectorAll('input[type="number"]')){
  const base=Number(input.defaultValue),field=input.closest('.budget-field');
  const container=document.createElement('div');container.className=field.className;
  while(field.firstChild)container.append(field.firstChild);field.replaceWith(container);
  const title=container.querySelector('span');title.id=input.id+'-label';input.setAttribute('aria-labelledby',title.id);
  const range=document.createElement('input');range.type='range';range.id=input.id+'-slider';range.min='0';
  range.max=String(input.id==='budget-reserve'?30:input.id==='budget-other'?1000000:Math.ceil(base*2));
  range.step=input.id==='budget-other'?'1000':input.id==='budget-reserve'?'.5':input.dataset.field==='width'&&input.step==='1'?'1':input.dataset.field==='rate'?'1':'.1';
  range.setAttribute('aria-labelledby',title.id);range.className='budget-range';
  const note=document.createElement('small');note.className='budget-slider-base';note.textContent='Base: '+number.format(base);
  container.insertBefore(range,input);container.append(note);
  range.addEventListener('input',()=>{input.value=range.value;});
  sliders.push({input,range,base});
 }
 const groups=[...form.querySelectorAll('.cost-group')];
 const breakdown=document.createElement('div');breakdown.className='budget-group-breakdown';
 document.querySelector('.budget-summary dl').prepend(breakdown);
 for(const [index,group] of groups.entries()){
  const total=document.createElement('output');total.className='budget-group-total';total.setAttribute('aria-label','Subtotal do grupo');group.querySelector('summary').append(total);
  const line=document.createElement('div');const label=document.createElement('dt');label.textContent=['Passeios e ciclovia','Pavimentação nova','Drenagem de referência'][index];const amount=document.createElement('dd');line.append(label,amount);breakdown.append(line);
 }
 const update=()=>{
  for(const {input,range,base} of sliders){
   const current=value(input);range.max=String(Math.max(Number(range.max),Number.isFinite(current)?current:base));range.value=input.value;
   range.style.setProperty('--fill',100*Number(range.value)/Number(range.max)+'%');
   range.setAttribute('aria-valuetext',number.format(Number(range.value)));
  }
  let paving=0,drainage=0,valid=true;
  for(const input of form.querySelectorAll('input')){const ok=input.validity.valid&&Number.isFinite(value(input));input.setAttribute('aria-invalid',String(!ok));if(!ok)valid=false;}
  for(const row of rows){
   const fields=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(i=>[i.dataset.field,i]));
   const ok=Object.values(fields).every(i=>i.getAttribute('aria-invalid')==='false');
   const quantity=ok?value(fields.length)*value(fields.width):0;
   const subtotal=quantity*(ok?value(fields.rate):0);
   row.querySelector('[data-quantity]').textContent=ok?number.format(quantity)+(row.dataset.kind==='area'?' m²':' m de rede'):'Revise os valores';
   row.querySelector('[data-subtotal]').textContent=ok?money.format(subtotal):'—';
   if(row.dataset.kind==='area')paving+=subtotal;else drainage+=subtotal;
  }
  groups.forEach((group,index)=>{
   const inputs=[...group.querySelectorAll('input[type="number"]')];const ok=inputs.every(i=>i.validity.valid&&Number.isFinite(value(i)));
   const subtotal=[...group.querySelectorAll('[data-cost-row]')].reduce((sum,row)=>sum+[...row.querySelectorAll('[data-field]')].reduce((a,i)=>a*value(i),1),0);
   const formatted=ok?money.format(subtotal):'—';group.querySelector('.budget-group-total').textContent=formatted;breakdown.children[index].querySelector('dd').textContent=formatted;
  });
  const other=value(form.querySelector('#budget-other'))||0;
  const reserve=(paving+drainage+other)*(value(form.querySelector('#budget-reserve'))||0)/100;
  for(const [id,total] of Object.entries({'budget-paving':paving,'budget-drainage':drainage,'budget-other-total':other,'budget-reserve-total':reserve,'budget-total':paving+drainage+other+reserve}))document.getElementById(id).textContent=valid?money.format(total):'—';
  feedback.classList.toggle('is-error',!valid);feedback.textContent=valid?'':'Revise os campos destacados. Use valores numéricos dentro dos limites indicados.';
 };
 form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',update);
 document.querySelector('#apply-corridor').addEventListener('click',()=>{const input=form.querySelector('#corridor-length');if(!input.checkValidity()){input.reportValidity();return;}for(const id of ['walk-north-length','walk-south-length','cycle-length'])document.getElementById(id).value=input.value;update();feedback.textContent='Comprimento aplicado às duas calçadas e à faixa cicloviária.';});
 document.querySelector('#reset-budget').addEventListener('click',()=>{form.reset();update();feedback.textContent='Cenário inicial restaurado.';});
 update();
}
