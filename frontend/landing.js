/* Silk Styling: WhatsApp enquiries and gentle section reveals. */
(() => {
  'use strict';
  const config=typeof globalThis.SILK_CONFIG==='object'?globalThis.SILK_CONFIG:{};
  const phone=String(config.whatsapp||'').replace(/^https:\/\/wa\.me\//,'').replace(/[^0-9]/g,'');
  const validPhone=/^[1-9][0-9]{7,14}$/.test(phone);
  const message=String(config.purchaseMessage||'Здравствуйте! Хочу получить доступ к видеоуроку Silk Styling.');
  document.querySelectorAll('[data-whatsapp]').forEach(link=>{
    if(validPhone)link.href='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
    else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.title='Контакт для обучения пока не указан.';link.addEventListener('click',event=>event.preventDefault());}
  });
  for(const [selector,key] of [['[data-course]','courseUrl'],['[data-receipt]','receiptUrl']]){
    const link=document.querySelector(selector);if(!link)continue;
    try{const url=new URL(config[key]);if(url.protocol!=='https:')throw Error();link.href=url.href;}catch{link.hidden=true;}
  }
  const rewatch=document.querySelector('[data-rewatch]');
  if(rewatch)rewatch.hidden=config.canRewatch!==true;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced && 'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
    }),{threshold:0,rootMargin:'0px 0px -25px 0px'});
    document.querySelectorAll('.section:not(.hero) .section-heading,.step,.audience-list,.price-panel,.format-art').forEach(element=>{element.classList.add('reveal-ready');observer.observe(element);});
  }
})();
