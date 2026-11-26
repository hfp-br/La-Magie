/* Botão "Portal": leva ao portal que reúne todas as páginas do La Magie.
   Funciona em qualquer pasta: o endereço é calculado a partir deste arquivo. */
(function(){
  if(document.getElementById('laMagiePortalLink'))return;
  const base=document.currentScript?.src||location.href;
  const destino=new URL('portal/',base).href;
  const a=document.createElement('a');
  a.id='laMagiePortalLink';
  a.href=destino;
  a.title='Ir ao Portal (todas as páginas)';
  a.innerHTML='<span aria-hidden="true">←</span> Portal';
  const css=document.createElement('style');
  css.textContent=`
#laMagiePortalLink{position:fixed;left:12px;bottom:12px;z-index:9990;display:inline-flex;align-items:center;gap:6px;
  font:600 13px/1 Georgia,"Times New Roman",serif;letter-spacing:.03em;text-decoration:none;color:#f6e7c4;
  background:linear-gradient(180deg,#5a3d20,#3b2714);border:1px solid #b8863b;border-radius:999px;padding:8px 14px;
  box-shadow:0 4px 14px rgba(30,18,8,.35);opacity:.82;transition:opacity .2s,transform .2s,box-shadow .2s}
#laMagiePortalLink:hover,#laMagiePortalLink:focus-visible{opacity:1;transform:translateY(-2px);box-shadow:0 6px 18px rgba(30,18,8,.45),0 0 0 2px rgba(212,165,90,.45)}
@media print{#laMagiePortalLink{display:none}}
`;
  const pôr=()=>{document.head.append(css);document.body.append(a)};
  if(document.body)pôr();else document.addEventListener('DOMContentLoaded',pôr);
})();
