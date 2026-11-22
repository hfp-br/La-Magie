/* Fases da lua de Malkharya (La Magie)
   - Ciclo lunar de ~29,53 dias, contado sobre o índice de dia das timelines
     (ano*360 + mês*30 + dia-1).
   - Âncora: lua cheia em 11 de Pharstyth de 5001 DE (próxima: 10 de Véu).
   - Avança sozinha com a data: qualquer dia do calendário tem sua fase. */
(function(){
  const CICLO=29.53;
  // instante da lua cheia de 11 de Pharstyth de 5001 (fração 0.2 dentro do dia),
  // escolhido para a cheia seguinte cair em 10 de Véu
  const CHEIA=5001*360+9*30+(11-1)+0.2;
  const NOVA=CHEIA-CICLO/2;
  const NOMES=['Lua Nova','Lua Crescente','Quarto Crescente','Gibosa Crescente','Lua Cheia','Gibosa Minguante','Quarto Minguante','Lua Minguante'];
  const mod=(a,b)=>((a%b)+b)%b;

  // fase do dia t: as quatro fases principais valem no dia em que o instante cai;
  // os demais dias recebem a fase intermediária pelo meio do dia
  function fase(t){
    const idade=mod(t+0.5-NOVA,CICLO);
    const inicio=mod(t-NOVA,CICLO);
    let principal=-1;
    for(let k=0;k<4;k++){
      const alvo=k*CICLO/4;
      const dist=mod(alvo-inicio,CICLO);
      if(dist<1){principal=k;break}
    }
    let i;
    if(principal>=0)i=principal*2;
    else{const q=idade/CICLO*4;i=Math.floor(q)*2+1}
    const ang=2*Math.PI*idade/CICLO;
    const luz=(1-Math.cos(ang))/2;
    return{indice:i,nome:NOMES[i],principal:principal>=0,idade,luz,ang,crescente:idade<CICLO/2};
  }

  const NS='http://www.w3.org/2000/svg';
  // desenho: disco escuro + parte iluminada (limbo + terminador elíptico)
  function svg(t,cls){
    const f=fase(t);
    const s=document.createElementNS(NS,'svg');
    s.setAttribute('viewBox','-1.15 -1.15 2.3 2.3');
    s.setAttribute('class','lua-fase'+(cls?' '+cls:'')+(f.indice===4?' lua-cheia':'')+(f.indice===0?' lua-nova':''));
    s.setAttribute('role','img');
    s.setAttribute('aria-label',f.nome);
    const titulo=document.createElementNS(NS,'title');
    titulo.textContent=`${f.nome} · ${Math.round(f.luz*100)}% iluminada`;
    s.append(titulo);
    const disco=document.createElementNS(NS,'circle');
    disco.setAttribute('r','1');disco.setAttribute('class','lua-sombra');s.append(disco);
    if(f.indice===4){
      const c=document.createElementNS(NS,'circle');c.setAttribute('r','1');c.setAttribute('class','lua-luz');s.append(c);
    }else if(f.indice!==0){
      const rx=Math.abs(Math.cos(f.ang)).toFixed(3);
      const cosPos=Math.cos(f.ang)>0;
      const d=f.crescente
        ?`M0,-1A1,1 0 0 1 0,1A${rx},1 0 0 ${cosPos?0:1} 0,-1Z`
        :`M0,-1A1,1 0 0 0 0,1A${rx},1 0 0 ${cosPos?1:0} 0,-1Z`;
      const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('class','lua-luz');s.append(p);
    }
    const aro=document.createElementNS(NS,'circle');
    aro.setAttribute('r','1');aro.setAttribute('class','lua-aro');s.append(aro);
    return s;
  }

  // aparência compartilhada pelas duas timelines (usa as cores do tema da página)
  const css=document.createElement('style');
  css.id='lua-malkharya-style';
  css.textContent=`
.lua-fase{width:15px;height:15px;flex:none;display:inline-block;vertical-align:middle;overflow:visible}
.lua-fase .lua-sombra{fill:color-mix(in srgb,var(--ink,#3a2a1a) 58%,var(--panel,#f3e8d0))}
.lua-fase .lua-luz{fill:#fffaeb}
.lua-fase .lua-aro{fill:none;stroke:color-mix(in srgb,var(--ink,#3a2a1a) 60%,transparent);stroke-width:.1}
.lua-fase.lua-cheia{filter:drop-shadow(0 0 3px rgba(230,190,90,.9))}
.lua-fase.lua-nova .lua-sombra{fill:color-mix(in srgb,var(--ink,#3a2a1a) 75%,var(--panel,#f3e8d0))}
.lua-dia{margin-left:auto;display:inline-flex;align-items:center;opacity:.92}
.lua-dia.lua-principal .lua-fase{width:17px;height:17px}
.lua-legenda{display:inline-flex;align-items:center;gap:6px;color:var(--mut,#7a6a55);font-size:12px;font-weight:400}
.lua-legenda .lua-fase{width:19px;height:19px}
@media(max-width:700px){.lua-fase{width:11px;height:11px}.lua-dia.lua-principal .lua-fase{width:13px;height:13px}}
`;
  (document.head||document.documentElement).append(css);

  // ícone pequeno para a célula do dia
  function dia(t){
    const f=fase(t);
    const w=document.createElement('span');
    w.className='lua-dia'+(f.principal?' lua-principal':'');
    w.title=`${f.nome} · ${Math.round(f.luz*100)}% iluminada`;
    w.append(svg(t));
    return w;
  }
  // ícone + nome, para o cabeçalho da agenda
  function legenda(t){
    const f=fase(t);
    const w=document.createElement('span');w.className='lua-legenda';
    const txt=document.createElement('span');txt.textContent=f.nome;
    w.append(svg(t),txt);
    return w;
  }

  window.LuaMalkharya={CICLO,fase,svg,dia,legenda};
})();
