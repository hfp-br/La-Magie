/* Pontos de Mana (ficha de jogador e de NPC)
   Painel próprio para o PM, ligado ao recurso de PM que a ficha já usa
   (o primeiro recurso chamado "PM", "Mana", "Pontos de Mana"...). Assim o
   Gerenciador de Combate e a lista de Recursos continuam iguais.

   Configuração em conteudo.pmConfig:
     modo: "manual" (padrão: você digita o máximo) | "auto" (Tormenta20)
     classe, porNivel, bonus, somarAtributo
   Modo automático (Tormenta20 Jogo do Ano): PM por nível da classe × nível
   + bônus fixo (+ atributo de conjuração, se marcado). O PM atual nunca é
   mexido sozinho; só o máximo, e só no modo automático. */
(function(){
  // Tormenta20 Jogo do Ano, tabela de classes (PM por nível)
  const CLASSES=[
    ['arcanista','Arcanista',6],['barbaro','Bárbaro',3],['bardo','Bardo',4],['bucaneiro','Bucaneiro',3],
    ['cacador','Caçador',4],['cavaleiro','Cavaleiro',3],['clerigo','Clérigo',5],['druida','Druida',4],
    ['guerreiro','Guerreiro',3],['inventor','Inventor',4],['ladino','Ladino',4],['lutador','Lutador',3],
    ['nobre','Nobre',4],['paladino','Paladino',3]
  ];
  const ATR={str:'Força',dex:'Destreza',con:'Constituição',int:'Inteligência',wis:'Sabedoria',cha:'Carisma'};
  const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,p=0)=>{const n=Number(v);return Number.isFinite(n)?n:p};

  const ehRecursoPM=r=>/(^|[^a-z])(pm|mana)([^a-z]|$)/.test(norm(r?.name??r?.nome));
  const recursoPM=()=>(Array.isArray(conteudo?.recursos)?conteudo.recursos:[]).find(ehRecursoPM)||null;
  const editando=()=>Boolean(typeof isOwner!=='undefined'&&isOwner&&document.getElementById('editModeToggle')?.checked);
  const nivel=()=>Math.max(1,num(document.getElementById('level')?.value,1));
  const modDe=a=>{try{return num(getMods()?.[a],0)}catch{return 0}};
  // efeitos mecânicos ativos (habilidades, magias, itens, condições): "PM Máximo" e "PM por nível"
  function efeitos(){
    const soma=t=>{try{return typeof somarEfeitos==='function'?num(somarEfeitos(t),0):0}catch{return 0}};
    const fixo=soma('maxPm'),porNivel=soma('pmPerLevel');
    return{fixo,porNivel,total:fixo+porNivel*nivel()};
  }

  function classeDoNome(){
    const n=norm(document.getElementById('configClassName')?.value);
    const achada=CLASSES.find(([k])=>n.includes(k.slice(0,6)));
    return achada?achada[0]:'outra';
  }

  function config(){
    const padrao={modo:'manual',classe:classeDoNome(),porNivel:null,bonus:0,somarAtributo:false,atributo:null,maxManual:null};
    const c=conteudo.pmConfig&&typeof conteudo.pmConfig==='object'?conteudo.pmConfig:{};
    return{...padrao,...c};
  }
  const atributoDe=cfg=>ATR[cfg.atributo]?cfg.atributo:(ATR[atributoConjuracao]?atributoConjuracao:'int');
  function porNivelDe(cfg){
    const c=CLASSES.find(x=>x[0]===cfg.classe);
    return cfg.classe==='outra'||!c?num(cfg.porNivel,0):c[2];
  }
  // máximo sem os efeitos
  function base(cfg){
    if(cfg.modo==='auto')return porNivelDe(cfg)*nivel()+num(cfg.bonus,0)+(cfg.somarAtributo?modDe(atributoDe(cfg)):0);
    if(cfg.maxManual!=null)return num(cfg.maxManual,0);
    const r=recursoPM();return r?num(r.max,0):0;
  }
  const maximo=cfg=>base(cfg)+efeitos().total;

  // cria o recurso de PM só quando a pessoa mexe no painel
  function garantirRecurso(max){
    let r=recursoPM();
    if(!r){
      if(!Array.isArray(conteudo.recursos))conteudo.recursos=[];
      r={id:criarId(),name:'PM',current:max,max,showCombat:true,showNormal:true};
      conteudo.recursos.push(r);
    }
    return r;
  }

  function salvar(){agendarSalvamentoConteudo();renderizarRecursos()}

  // acerta o máximo quando nível, classe, atributo ou efeitos mudam (só o dono salva).
  // Ficha sem configuração e sem efeitos de PM: nada muda.
  function recalcular(){
    if(typeof conteudo==='undefined'||!(typeof isOwner!=='undefined'&&isOwner))return;
    const r=recursoPM();if(!r)return;
    const ef=efeitos().total;
    if(!conteudo.pmConfig){
      if(!ef)return;
      // primeira vez com efeito de PM: o máximo de hoje vira a base manual
      conteudo.pmConfig={...config(),modo:'manual',maxManual:num(r.max,0)};
    }
    const cfg=config();
    if(cfg.modo!=='auto'&&cfg.maxManual==null)conteudo.pmConfig.maxManual=num(r.max,0)-ef;
    const max=maximo(config());
    if(num(r.max,NaN)!==max){r.max=max;salvar()}
  }

  function sinal(v,rot){return v?` ${v>0?'+':'−'} ${Math.abs(v)}${rot?` ${rot}`:''}`:''}

  function desenhar(){
    const host=document.getElementById('pmPanel');
    if(!host||typeof conteudo==='undefined')return;
    const r=recursoPM(),cfg=config(),ed=editando(),dono=Boolean(typeof isOwner!=='undefined'&&isOwner);
    const ef=efeitos();
    const max=r?num(r.max,0):maximo(cfg);
    const atual=r?num(r.current,max):max;
    const pct=max>0?Math.max(0,Math.min(100,atual/max*100)):0;
    const txtEf=ef.total?sinal(ef.total,'(efeitos)'):'';
    const atr=atributoDe(cfg);
    const formula=cfg.modo==='auto'
      ?`${porNivelDe(cfg)} PM × nível ${nivel()}${sinal(num(cfg.bonus,0),'bônus')}${cfg.somarAtributo?sinal(modDe(atr),`(${ATR[atr]})`)||` + 0 (${ATR[atr]})`:''}${txtEf} = ${maximo(cfg)}`
      :(ef.total||cfg.maxManual!=null?`Base ${base(cfg)}${txtEf} = ${maximo(cfg)}`:'Máximo digitado à mão');

    let html=`<div class="pm-topo">
      <div class="pm-valor"><span class="pm-atual">${atual}</span><span class="pm-sep">/</span><span class="pm-max">${max}</span><small>PM</small></div>
      ${dono?`<div class="pm-botoes">
        <button type="button" class="pm-btn" data-pm="-1" title="Gastar 1 PM">−1</button>
        <button type="button" class="pm-btn" data-pm="+1" title="Recuperar 1 PM">+1</button>
        <input type="number" class="pm-delta" placeholder="±PM" title="Gastar (negativo) ou recuperar (positivo)" aria-label="Quantidade de PM">
        <button type="button" class="pm-btn" data-pm="aplicar">Aplicar</button>
        <button type="button" class="pm-btn" data-pm="cheio" title="Voltar ao máximo (descanso)">Encher</button>
      </div>`:''}</div>
      <div class="pm-barra" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${atual}" aria-label="Pontos de mana"><span style="width:${pct}%"></span></div>
      <div class="pm-formula">${esc(formula)}${r?'':' · ainda sem recurso de PM: será criado ao usar'}</div>`;

    if(ed){
      const cls=CLASSES.map(([k,n,p])=>`<option value="${k}"${cfg.classe===k?' selected':''}>${n} (${p}/nível)</option>`).join('');
      const atrs=Object.entries(ATR).map(([k,n])=>`<option value="${k}"${atr===k?' selected':''}>${n}</option>`).join('');
      html+=`<div class="pm-config">
        <label>Cálculo
          <select data-pmc="modo"><option value="manual"${cfg.modo!=='auto'?' selected':''}>Manual: eu digito o máximo</option><option value="auto"${cfg.modo==='auto'?' selected':''}>Automático (Tormenta20)</option></select>
        </label>
        ${cfg.modo==='auto'?`
        <label>Classe
          <select data-pmc="classe">${cls}<option value="outra"${cfg.classe==='outra'?' selected':''}>Outra: digitar PM por nível</option></select>
        </label>
        ${cfg.classe==='outra'?`<label>PM por nível<input type="number" min="0" data-pmc="porNivel" value="${esc(cfg.porNivel??'')}"></label>`:''}
        <label>Bônus fixo<input type="number" data-pmc="bonus" value="${esc(cfg.bonus??0)}" title="Raça, outras classes (multiclasse) ou qualquer ajuste"></label>
        <label class="pm-check"><input type="checkbox" data-pmc="somarAtributo"${cfg.somarAtributo?' checked':''}> Somar atributo</label>
        ${cfg.somarAtributo?`<label>Atributo<select data-pmc="atributo">${atrs}</select></label>`:''}
        `:`<label>PM máximo${ef.total?' (sem efeitos)':''}<input type="number" min="0" data-pmc="max" value="${base(cfg)}"></label>`}
      </div>
      <div class="pm-dica">Habilidades, magias e itens podem mudar o PM com os efeitos <b>PM Máximo</b> e <b>PM por nível</b>.</div>`;
    }
    host.innerHTML=html;
    animar(host,atual,max);
  }

  /* Barra e número andam até o valor novo em vez de pular.
     Duração cresce devagar com o tamanho da mudança (raiz quadrada), então a
     velocidade cresce: ±1 leva ~0,45 s; +20 leva ~0,9 s, bem mais rápido por ponto. */
  const reduzir=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let mostrado=null,quadro=0;
  function animar(host,atual,max){
    const barra=host.querySelector('.pm-barra span'),num=host.querySelector('.pm-atual');
    const pinta=v=>{
      if(barra)barra.style.width=(max>0?Math.max(0,Math.min(100,v/max*100)):0)+'%';
      if(num)num.textContent=Math.round(v);
    };
    cancelAnimationFrame(quadro);
    const de=mostrado??atual,delta=Math.abs(atual-de);
    if(reduzir||!delta){mostrado=atual;pinta(atual);return}
    const dur=Math.min(1400,300+140*Math.sqrt(delta));
    const t0=performance.now();
    pinta(de);
    host.querySelector('.pm-barra')?.classList.toggle('subindo',atual>de);
    host.querySelector('.pm-barra')?.classList.toggle('descendo',atual<de);
    const passo=t=>{
      const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3); // desacelera no fim
      mostrado=de+(atual-de)*e;pinta(mostrado);
      if(k<1)quadro=requestAnimationFrame(passo);
      else{mostrado=atual;host.querySelector('.pm-barra')?.classList.remove('subindo','descendo')}
    };
    quadro=requestAnimationFrame(passo);
  }

  function mudarAtual(delta,cheio){
    const cfg=config();
    const r=garantirRecurso(maximo(cfg));
    const max=num(r.max,0);
    r.current=cheio?max:Math.max(0,num(r.current,max)+delta);
    salvar();desenhar();
  }

  function mudarConfig(campo,el){
    const antes=config(),cfg={...antes};
    const ef=efeitos().total;
    if(campo==='max'){
      cfg.modo='manual';cfg.maxManual=Math.max(0,Math.trunc(num(el.value,0)));
    }else if(campo==='modo'){
      cfg.modo=el.value;
      // voltar ao manual mantém o máximo que está na ficha
      if(cfg.modo!=='auto'){const r=recursoPM();cfg.maxManual=r?num(r.max,0)-ef:base(antes)}
    }
    else if(campo==='somarAtributo')cfg.somarAtributo=el.checked;
    else if(campo==='bonus')cfg.bonus=Math.trunc(num(el.value,0));
    else if(campo==='porNivel')cfg.porNivel=Math.max(0,Math.trunc(num(el.value,0)));
    else cfg[campo]=el.value;
    if(cfg.somarAtributo&&!ATR[cfg.atributo])cfg.atributo=atributoDe(cfg);
    conteudo.pmConfig=cfg;
    const r=garantirRecurso(maximo(cfg));r.max=maximo(cfg);
    salvar();desenhar();
  }

  function ligar(){
    const host=document.getElementById('pmPanel');if(!host)return;
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-pm]');if(!b)return;
      if(!(typeof isOwner!=='undefined'&&isOwner))return;
      const v=b.dataset.pm;
      if(v==='cheio')mudarAtual(0,true);
      else if(v==='aplicar'){const i=host.querySelector('.pm-delta');const d=Math.trunc(num(i?.value,0));if(d)mudarAtual(d)}
      else mudarAtual(Number(v));
    });
    host.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList.contains('pm-delta'))host.querySelector('[data-pm="aplicar"]')?.click()});
    host.addEventListener('change',e=>{const c=e.target.dataset.pmc;if(c)mudarConfig(c,e.target)});
    document.getElementById('editModeToggle')?.addEventListener('change',()=>setTimeout(desenhar,0));
    // recursos mudaram (edição, outra aba, Supabase): redesenha
    if(typeof renderizarRecursos==='function'){
      const original=renderizarRecursos;
      renderizarRecursos=function(){const r=original.apply(this,arguments);desenhar();return r};
    }
    // nível, atributos, classe: recalcula no modo automático
    if(typeof updateSheet==='function'){
      const original=updateSheet;
      updateSheet=function(){const r=original.apply(this,arguments);recalcular();desenhar();return r};
    }
    ['level','configSpellAttribute','configClassName'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(()=>{recalcular();desenhar()},50)));
    desenhar();
  }

  const css=document.createElement('style');
  css.id='pm-ficha-style';
  css.textContent=`
#pmPanel{display:grid;gap:8px}
#pmPanel .pm-topo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
#pmPanel .pm-valor{display:flex;align-items:baseline;gap:4px;font-weight:bold;color:var(--sand-5,#3d2b1d)}
#pmPanel .pm-atual{font-size:2rem;line-height:1;color:#2f5a8a}
#pmPanel .pm-sep{font-size:1.3rem;opacity:.5}#pmPanel .pm-max{font-size:1.3rem}
#pmPanel .pm-valor small{margin-left:4px;font-size:.8rem;letter-spacing:.08em;color:var(--muted,#7a6650)}
#pmPanel .pm-botoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#pmPanel .pm-btn{font:inherit;font-size:.82rem;font-weight:bold;border-radius:999px;border:1px solid var(--line,#c9a96b);background:var(--sand-1,#f3e4c4);color:var(--sand-5,#3d2b1d);padding:4px 11px;cursor:pointer}
#pmPanel .pm-btn:hover{background:var(--sand-0,#fbf3e2)}
#pmPanel .pm-delta{width:70px;font:inherit;padding:4px 8px;border-radius:999px;border:1px solid var(--line,#c9a96b);background:#fffaf0}
#pmPanel .pm-barra{height:12px;border-radius:999px;background:rgba(47,90,138,.14);border:1px solid rgba(47,90,138,.35);overflow:hidden}
#pmPanel .pm-barra span{display:block;height:100%;background:linear-gradient(90deg,#3b6fa6,#6fa3d8);box-shadow:0 0 8px rgba(111,163,216,.6)}
#pmPanel .pm-barra.subindo span{box-shadow:0 0 12px rgba(140,190,240,.95)}
#pmPanel .pm-barra.descendo span{filter:saturate(.8) brightness(.95)}
#pmPanel .pm-formula{font-size:.8rem;color:var(--muted,#7a6650);font-style:italic}
#pmPanel .pm-config{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;border-top:1px dashed var(--line,#c9a96b);padding-top:8px}
#pmPanel .pm-config label{display:grid;gap:3px;font-size:.78rem;font-weight:bold;color:var(--sand-5,#3d2b1d)}
#pmPanel .pm-config select,#pmPanel .pm-config input[type=number]{font:inherit;font-weight:normal;padding:4px 8px;border-radius:8px;border:1px solid var(--line,#c9a96b);background:#fffaf0;min-width:90px}
#pmPanel .pm-config .pm-check{display:flex;align-items:center;gap:6px}
#pmPanel .pm-dica{font-size:.76rem;color:var(--muted,#7a6650)}
`;
  document.head.append(css);

  // o script fica no fim da página: se o painel já existe, liga na hora
  if(document.getElementById('pmPanel')||document.readyState!=='loading')ligar();else document.addEventListener('DOMContentLoaded',ligar);
  window.PMFicha={desenhar,recalcular,CLASSES};
})();
