const menu=document.querySelector('.editorial-menu');
const links=document.querySelector('#editorial-links');
const closeMenu=()=>{links?.classList.remove('open');menu?.setAttribute('aria-expanded','false')};
menu?.addEventListener('click',()=>{const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
links?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&links?.classList.contains('open')){closeMenu();menu?.focus()}});
document.addEventListener('pointerdown',e=>{if(!document.querySelector('#nav')?.contains(e.target))closeMenu()});
const anchors=[...document.querySelectorAll('#editorial-links a[href^="#"]')];
const sections=anchors.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
let scheduled=false;
const update=()=>{scheduled=false;let current=null;for(const s of sections)if(s.getBoundingClientRect().top<innerHeight*.35)current=s.id;anchors.forEach(a=>a.setAttribute('aria-current',String(a.hash==='#'+current)))};
addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update)}},{passive:true});update();
const viewer=document.createElement('dialog');viewer.className='image-viewer';viewer.setAttribute('aria-label','Imagem ampliada');viewer.innerHTML='<button type="button" aria-label="Fechar imagem">Fechar ×</button><img alt=""><p></p>';document.body.append(viewer);
viewer.querySelector('button').addEventListener('click',()=>viewer.close());
viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close()});
document.querySelectorAll('[data-name="Perspectiva do trecho"] img,[data-node-id="6:180"] img,.profile-graphic img,.budget-map img').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Ampliar: '+img.alt);const open=()=>{viewer.querySelector('img').src=img.src;viewer.querySelector('img').alt=img.alt;viewer.querySelector('p').textContent=img.alt;viewer.showModal()};img.addEventListener('click',open);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})});

for(const card of document.querySelectorAll('.reference-card')){
 const slides=[...card.querySelectorAll('.reference-slide')],counter=card.querySelector('.reference-counter'),play=card.querySelector('[data-gallery-action="play"]'),gallery=card.querySelector('.reference-carousel');let index=0,timer=null,startX=0;
 const show=n=>{index=(n+slides.length)%slides.length;slides.forEach((img,i)=>img.hidden=i!==index);counter.textContent=`${index+1} / ${slides.length}`};
 const stop=()=>{clearInterval(timer);timer=null;play.textContent='Reproduzir';play.setAttribute('aria-label','Reproduzir apresentação de imagens');counter.setAttribute('aria-live','polite')};
 card.querySelector('[data-gallery-action="prev"]').addEventListener('click',()=>{stop();show(index-1)});card.querySelector('[data-gallery-action="next"]').addEventListener('click',()=>{stop();show(index+1)});
 play.addEventListener('click',()=>{if(timer){stop();return}play.textContent='Pausar';play.setAttribute('aria-label','Pausar apresentação de imagens');counter.setAttribute('aria-live','off');timer=setInterval(()=>show(index+1),5000)});
 gallery.addEventListener('pointerdown',e=>startX=e.clientX);gallery.addEventListener('pointerup',e=>{if(Math.abs(e.clientX-startX)>40){stop();show(index+(e.clientX<startX?1:-1))}});
 card.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stop();show(index+(e.key==='ArrowRight'?1:-1))}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop()},{threshold:.1}).observe(card);
}
