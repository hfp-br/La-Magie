/* Tracker de ações do turno (ficha do jogador + Gerenciador de Combate)
   Tabela: batalha_acoes (Projeto Players). Nada é bloqueado de verdade:
   o tracker só mostra o que já foi gasto e pede confirmação quando passar do normal.

   Espaços por rodada: 1 Padrão, 1 Movimento, 1 Bônus, 1 Reação (+ extras do Mestre).
   - completa gasta Padrão + Movimento;
   - movimento sem espaço de Movimento usa a Padrão (regra do T20);
   - livre não gasta nada;
   - reação pode ser enviada fora do próprio turno. */
(function(){
  const SLOTS=[['padrao','Padrão'],['movimento','Movimento'],['bonus','Bônus'],['reacao','Reação']];
  const ROTULO={padrao:'Ação padrão',movimento:'Ação de movimento',completa:'Ação completa',livre:'Ação livre',bonus:'Ação bônus',reacao:'Reação',extra:'Ação extra'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- regras (compartilhadas) ---------- */
  function estado(linhas){
    const total={padrao:1,movimento:1,bonus:1,reacao:1},usados={padrao:0,movimento:0,bonus:0,reacao:0};
    (linhas||[]).forEach(r=>{
      if(!r||r.status==='recusada')return;
      const s=Array.isArray(r.slots)?r.slots:[];
      if(r.tipo==='extra')s.forEach(k=>{if(k in total)total[k]++});
      else s.forEach(k=>{if(k in usados)usados[k]++});
    });
    return{total,usados,resta:k=>total[k]-usados[k]};
  }

  // quais espaços a ação vai gastar e se precisa de aviso
  function planejar(tipo,est){
    const resta=k=>est.resta(k);
    switch(tipo){
      case'padrao':return{slots:['padrao'],aviso:resta('padrao')>0?'':'Você já usou sua ação padrão nesta rodada.'};
      case'movimento':
        if(resta('movimento')>0)return{slots:['movimento'],aviso:''};
        if(resta('padrao')>0)return{slots:['padrao'],aviso:'',nota:'Sua ação de movimento já foi usada: esta vai usar a ação padrão no lugar (Tormenta20: dá para trocar a padrão por uma de movimento).'};
        return{slots:['movimento'],aviso:'Você já usou a ação de movimento e a padrão nesta rodada.'};
      case'completa':{
        const falta=['padrao','movimento'].filter(k=>resta(k)<=0).map(k=>k==='padrao'?'a padrão':'a de movimento');
        return{slots:['padrao','movimento'],aviso:falta.length?`A ação completa gasta a padrão e a de movimento, e você já usou ${falta.join(' e ')} nesta rodada.`:''};
      }
      case'bonus':return{slots:['bonus'],aviso:resta('bonus')>0?'':'Você já usou sua ação bônus nesta rodada.'};
      case'reacao':return{slots:['reacao'],aviso:resta('reacao')>0?'':'Você já usou sua reação nesta rodada.'};
      default:return{slots:[],aviso:''};
    }
  }

  // bolinhas: cheias = disponíveis, cinzas = usadas, vermelhas = além do normal
  function bolinhasHtml(est,{clicavel=false,pid=''}={}){
    return `<div class="at-slots">${SLOTS.map(([k,rot])=>{
      const n=Math.max(est.total[k],est.usados[k]);
      let dots='';
      for(let i=0;i<n;i++){
        const usado=i<est.usados[k],alem=i>=est.total[k],extra=i>=1&&i<est.total[k];
        const cls='at-dot'+(usado?' usado':'')+(alem?' alem':'')+(extra?' extra':'');
        const tit=`${rot}: ${usado?(alem?'usada além do normal':'usada'):'disponível'}${extra?' (extra)':''}`;
        dots+=clicavel
          ?`<button type="button" class="${cls}" data-at-slot="${k}" data-at-usado="${usado?1:0}" data-at-pid="${esc(pid)}" title="${esc(tit)} — clique para ${usado?'desfazer':'marcar como usada'}"></button>`
          :`<span class="${cls}" title="${esc(tit)}"></span>`;
      }
      return `<span class="at-slot${est.resta(k)<=0?' gasto':''}"><span class="at-rot">${rot}</span>${dots}</span>`;
    }).join('')}</div>`;
  }

  /* ---------- aparência ---------- */
  const css=document.createElement('style');
  css.id='acoes-turno-style';
  css.textContent=`
.at-slots{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}
.at-slot{display:inline-flex;align-items:center;gap:4px;font-size:.78rem;font-weight:bold;color:var(--sand-5,var(--ink,#3d2b1d))}
.at-slot.gasto .at-rot{opacity:.5;text-decoration:line-through}
.at-dot{width:13px;height:13px;border-radius:50%;display:inline-block;padding:0;border:1.5px solid #8a6a2e;background:radial-gradient(circle at 35% 30%,#ffe9a8,#d1a043 60%,#9b7020);box-shadow:0 0 4px rgba(209,160,67,.55);transition:transform .15s,filter .2s}
button.at-dot{cursor:pointer}button.at-dot:hover{transform:scale(1.25)}
.at-dot.extra{border-style:dashed}
.at-dot.usado{background:#b9b1a4;border-color:#8f877b;box-shadow:none;filter:grayscale(1)}
.at-dot.alem{background:#b5523f;border-color:#7d2f22;filter:none}
.at-toasts{position:fixed;right:14px;bottom:14px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:min(380px,92vw)}
.at-toast{background:#fbf3e2;color:#3d2b1d;border:1px solid #c9a96b;border-left:5px solid #b8863b;border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(40,25,10,.3);font-size:.92rem;animation:atEntra .25s ease}
.at-toast b{display:block;margin-bottom:2px}
.at-toast .at-t-acoes{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
.at-toast.turno{border-left-color:#3f7a4f;font-size:1.05rem}
@keyframes atEntra{from{opacity:0;transform:translateY(10px)}}
.at-btn{font:inherit;font-size:.8rem;font-weight:bold;border-radius:999px;border:1px solid #a9824d;background:#f3e4c4;color:#3d2b1d;padding:4px 12px;cursor:pointer}
.at-btn:hover{background:#ead3a2}.at-btn.pri{background:#7a5428;color:#fff4dc;border-color:#5c3d1b}.at-btn.pri:hover{background:#8d6330}
.at-modal{position:fixed;inset:0;z-index:100000;background:rgba(30,18,8,.45);display:grid;place-items:center;padding:14px}
.at-modal-box{background:#fbf3e2;color:#3d2b1d;border:1px solid #c9a96b;border-radius:16px;max-width:520px;width:100%;max-height:88vh;overflow:auto;padding:18px 20px;box-shadow:0 18px 50px rgba(30,18,8,.45)}
.at-modal-box h3{margin:0 0 4px;font-size:1.25rem}
.at-modal-box .at-m-tipo{color:#7a6650;font-size:.85rem;margin-bottom:10px}
.at-modal-box .at-m-desc{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.92rem;line-height:1.5;background:#f3e8d0;border-radius:10px;padding:10px 12px;max-height:40vh;overflow:auto}
.at-modal-box .at-m-aviso{margin-top:10px;padding:9px 12px;border-radius:10px;background:#f6dcd2;border:1px solid #c98b7a;color:#6d261a;font-weight:bold}
.at-modal-box .at-m-nota{margin-top:10px;padding:9px 12px;border-radius:10px;background:#e7ecd9;border:1px solid #a8b98c;color:#3e4f2a}
.at-modal-box .at-m-botoes{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.at-modal-box label{display:block;font-size:.82rem;font-weight:bold;margin-top:8px}
.at-modal-box input,.at-modal-box select,.at-modal-box textarea{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #c9a96b;border-radius:8px;background:#fffaf0;color:#3d2b1d}
.at-modal-box textarea{min-height:90px;resize:vertical}
#atBanner{margin:0 0 16px;border:1px solid var(--line,#c9a96b);border-radius:14px;padding:12px 16px;background:var(--panel-strong,#fbf3e2);box-shadow:var(--shadow,0 4px 14px rgba(40,25,10,.12))}
#atBanner.meu-turno{border-color:#3f7a4f;box-shadow:0 0 0 2px rgba(63,122,79,.35),var(--shadow,0 4px 14px rgba(40,25,10,.12))}
#atBanner .at-b-topo{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
#atBanner .at-b-titulo{font-weight:bold;font-size:1.05rem;color:var(--sand-5,#3d2b1d)}
#atBanner .at-b-sub{font-size:.82rem;color:var(--muted,#7a6650)}
#atBanner .at-log{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:4px}
#atBanner .at-log li{display:flex;align-items:center;gap:8px;font-size:.85rem;flex-wrap:wrap}
#atBanner .at-log .at-st{font-size:.72rem;padding:1px 8px;border-radius:999px;background:var(--sand-1,#f3e4c4)}
#atBanner .at-log .at-st.recusada{background:#f6dcd2;color:#6d261a}
#atBanner .at-log .at-st.vista{background:#dfe6d2;color:#3e4f2a}
#atBanner .at-log li.recusada span:first-child{text-decoration:line-through;opacity:.6}
.acf-enviar{margin-left:auto;font:inherit;font-size:.74rem;font-weight:bold;border-radius:999px;border:1px solid #5c3d1b;background:#7a5428;color:#fff4dc;padding:2px 10px;cursor:pointer;flex:none}
.acf-enviar:hover{background:#8d6330}
.acf-enviar.reacao{background:#6a4f7a;border-color:#4b3758}
`;
  (document.head||document.documentElement).append(css);

  /* ---------- toasts e modal ---------- */
  function caixaToasts(){
    let c=document.querySelector('.at-toasts');
    if(!c){c=document.createElement('div');c.className='at-toasts';c.setAttribute('aria-live','polite');document.body.append(c)}
    return c;
  }
  // botoes: [{texto, pri, acao}] ; ms = 0 fica até fechar
  function toast(html,{botoes=[],ms=6000,cls=''}={}){
    const t=document.createElement('div');t.className='at-toast '+cls;t.innerHTML=html;
    const fechar=()=>t.remove();
    if(botoes.length){
      const bar=document.createElement('div');bar.className='at-t-acoes';
      botoes.forEach(b=>{const el=document.createElement('button');el.type='button';el.className='at-btn'+(b.pri?' pri':'');el.textContent=b.texto;el.onclick=async()=>{el.disabled=true;try{await b.acao?.()}finally{fechar()}};bar.append(el)});
      t.append(bar);
    }
    caixaToasts().append(t);
    const lista=caixaToasts().children;while(lista.length>6)lista[0].remove();
    if(ms)setTimeout(fechar,ms);
    return t;
  }

  function modal(conteudoHtml,botoes){
    return new Promise(resolve=>{
      const fundo=document.createElement('div');fundo.className='at-modal';
      const box=document.createElement('div');box.className='at-modal-box';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
      box.innerHTML=conteudoHtml;
      const bar=document.createElement('div');bar.className='at-m-botoes';
      const fim=v=>{fundo.remove();document.removeEventListener('keydown',tecla);resolve(v)};
      const tecla=e=>{if(e.key==='Escape')fim(null)};
      botoes.forEach(b=>{const el=document.createElement('button');el.type='button';el.className='at-btn'+(b.pri?' pri':'');el.textContent=b.texto;el.onclick=()=>fim(b.valor===undefined?null:(typeof b.valor==='function'?b.valor(box):b.valor));bar.append(el)});
      box.append(bar);fundo.append(box);
      fundo.addEventListener('click',e=>{if(e.target===fundo)fim(null)});
      document.addEventListener('keydown',tecla);
      document.body.append(fundo);
      (box.querySelector('input,textarea,select')||bar.lastChild)?.focus();
    });
  }

  /* ---------- ficha do jogador ---------- */
  const F={sb:null,fichaId:()=>null,dono:()=>false,
    batalha:null,eu:null,turnoNome:'',linhas:[],turnoAnterior:undefined,canal:null,timer:null,assinatura:''};

  function emCombate(){return Boolean(F.batalha&&F.eu&&F.dono())}
  function meuTurno(){return emCombate()&&F.batalha.turno_participante_id===F.eu.id}
  // pode mostrar o botão Enviar para este tipo?
  function pode(tipo){
    if(!emCombate()||!tipo||!ROTULO[tipo]||tipo==='extra')return false;
    return meuTurno()||tipo==='reacao';
  }

  async function atualizar(){
    const id=F.fichaId();
    if(!F.sb||!id||!F.dono()){F.batalha=null;F.eu=null;desenhar();return}
    try{
      const{data:ps,error}=await F.sb.from('batalha_participantes').select('id,batalha_id,nome').eq('tipo','jogador').eq('origem_id',id).eq('instancia',false);
      if(error)throw error;
      let b=null,eu=null;
      if(ps?.length){
        const{data:bs,error:e2}=await F.sb.from('batalhas').select('*').in('id',[...new Set(ps.map(p=>p.batalha_id))]).eq('ativa',true).order('criado_em',{ascending:false}).limit(1);
        if(e2)throw e2;
        b=bs?.[0]||null;
        eu=b?ps.find(p=>p.batalha_id===b.id):null;
      }
      F.batalha=b;F.eu=eu;F.linhas=[];F.turnoNome='';
      if(b&&eu){
        const[{data:ls},{data:tp}]=await Promise.all([
          F.sb.from('batalha_acoes').select('*').eq('participante_id',eu.id).eq('rodada',b.rodada).order('criado_em'),
          b.turno_participante_id?F.sb.from('batalha_participantes').select('nome').eq('id',b.turno_participante_id).maybeSingle():Promise.resolve({data:null})
        ]);
        F.linhas=ls||[];F.turnoNome=tp?.nome||'';
        const agora=b.turno_participante_id===eu.id;
        if(agora&&F.turnoAnterior!==undefined&&F.turnoAnterior!==true){
          toast(`<b>É seu turno!</b>${esc(b.nome||'Combate')} · Rodada ${b.rodada}`,{cls:'turno',ms:9000});
        }
        F.turnoAnterior=agora;
      }else F.turnoAnterior=undefined;
    }catch(e){console.warn('Tracker de ações:',e?.message||e)}
    desenhar();
  }
  const agendar=()=>{clearTimeout(F.timer);F.timer=setTimeout(atualizar,300)};

  function desenhar(){
    let host=document.getElementById('atBanner');
    const secao=document.getElementById('acoes');
    if(!host&&secao){
      host=document.createElement('div');host.id='atBanner';
      const ancora=secao.querySelector('.acf-secao')||secao.querySelector('.ac-abas');
      ancora?ancora.before(host):secao.prepend(host);
    }
    if(host){
      if(!emCombate()){host.hidden=true;host.innerHTML=''}
      else{
        host.hidden=false;
        const est=estado(F.linhas),meu=meuTurno(),b=F.batalha;
        host.className=meu?'meu-turno':'';
        const agora=Date.now();
        const log=F.linhas.filter(r=>r.tipo!=='extra'||r.origem==='mestre').map(r=>{
          const novo=r.origem==='ficha'&&r.status!=='recusada'&&agora-new Date(r.criado_em).getTime()<55000;
          const st=r.status==='recusada'?'<span class="at-st recusada">recusada pelo mestre</span>':r.status==='vista'?'<span class="at-st vista">vista pelo mestre</span>':r.origem==='mestre'?'<span class="at-st">marcada pelo mestre</span>':'';
          return `<li class="${r.status==='recusada'?'recusada':''}"><span><b>${esc(r.nome)}</b> · ${esc(ROTULO[r.tipo]||r.tipo)}</span>${st}${novo?`<button type="button" class="at-btn" data-at-desfazer="${esc(r.id)}">Desfazer</button>`:''}</li>`;
        }).join('');
        host.innerHTML=`<div class="at-b-topo"><div><div class="at-b-titulo">${meu?'É seu turno!':`Turno de ${esc(F.turnoNome||'outro participante')}`}</div>
          <div class="at-b-sub">${esc(b.nome||'Combate')} · Rodada ${b.rodada}${meu?'':' · fora do seu turno, só reações'}</div></div>
          <button type="button" class="at-btn" data-at-outra>+ Outra ação</button></div>
          ${bolinhasHtml(est)}
          ${log?`<ul class="at-log">${log}</ul>`:''}`;
      }
    }
    // só redesenha os cards quando muda o que dá para enviar (não fecha cards abertos à toa)
    const assinatura=`${emCombate()}|${meuTurno()}`;
    if(assinatura!==F.assinatura){
      F.assinatura=assinatura;
      window.AcoesFicha?.renderAba?.();
      document.dispatchEvent(new CustomEvent('acoes-turno'));
    }
  }

  async function enviar({tipo,nome,descricao='',fonte=''}){
    if(!emCombate())return false;
    if(!pode(tipo)){toast('<b>Não é seu turno.</b>Fora do seu turno só dá para enviar reações.');return false}
    // estado mais novo antes de decidir o aviso
    await atualizar();
    if(!emCombate())return false;
    const est=estado(F.linhas),plano=planejar(tipo,est);
    const html=`<h3>${esc(nome)}</h3><div class="at-m-tipo">${esc(ROTULO[tipo]||tipo)}${fonte?` · ${esc(fonte)}`:''} · para o Mestre</div>
      ${descricao?`<div class="at-m-desc">${esc(descricao)}</div>`:''}
      ${plano.nota?`<div class="at-m-nota">${esc(plano.nota)}</div>`:''}
      ${plano.aviso?`<div class="at-m-aviso">${esc(plano.aviso)} Tem certeza que pode usar essa habilidade?</div>`:''}`;
    const ok=await modal(html,[{texto:'Cancelar',valor:false},{texto:plano.aviso?'Enviar mesmo assim':'Enviar ao Mestre',pri:true,valor:true}]);
    if(!ok)return false;
    const{data:{session}}=await F.sb.auth.getSession();
    const linha={batalha_id:F.batalha.id,participante_id:F.eu.id,rodada:F.batalha.rodada,tipo,slots:plano.slots,
      nome:String(nome||'Ação').trim().slice(0,160)||'Ação',descricao:String(descricao||'').slice(0,4000),fonte:String(fonte||'').slice(0,60),
      origem:'ficha',status:'enviada',enviado_por:session?.user?.id};
    const{data,error}=await F.sb.from('batalha_acoes').insert(linha).select().single();
    if(error){console.error(error);toast('<b>Não foi possível enviar.</b>'+esc(error.message||''));return false}
    F.linhas.push(data);desenhar();
    toast(`<b>Enviado ao Mestre</b>${esc(linha.nome)} · ${esc(ROTULO[tipo])}`,{ms:20000,botoes:[{texto:'Desfazer',acao:()=>desfazer(data.id)},{texto:'Ok',pri:true}]});
    return true;
  }

  async function desfazer(id){
    const{data,error}=await F.sb.from('batalha_acoes').delete().eq('id',id).select('id');
    if(error||!data?.length){toast('<b>Não deu para desfazer.</b>Passou de 1 minuto ou o Mestre já mexeu nela. Fale com o Mestre.');return}
    F.linhas=F.linhas.filter(r=>r.id!==id);desenhar();
    toast('Envio desfeito.',{ms:3000});
  }

  async function outraAcao(){
    if(!emCombate())return;
    const meu=meuTurno();
    const opcoes=Object.entries(ROTULO).filter(([k])=>k!=='extra'&&(meu||k==='reacao')).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
    const r=await modal(`<h3>Outra ação</h3><div class="at-m-tipo">Algo que não está na ficha</div>
      <label>Tipo<select class="at-o-tipo">${opcoes}</select></label>
      <label>Nome<input class="at-o-nome" maxlength="160" placeholder="Ex.: Empurrar a mesa"></label>
      <label>Descrição (opcional)<textarea class="at-o-desc" maxlength="4000"></textarea></label>`,
      [{texto:'Cancelar',valor:null},{texto:'Continuar',pri:true,valor:box=>({tipo:box.querySelector('.at-o-tipo').value,nome:box.querySelector('.at-o-nome').value.trim(),descricao:box.querySelector('.at-o-desc').value.trim()})}]);
    if(!r)return;
    if(!r.nome){toast('Dê um nome para a ação.');return}
    enviar({...r,fonte:'Outra'});
  }

  function ligarFicha({sb,fichaId,dono}){
    F.sb=sb;F.fichaId=fichaId;F.dono=dono;
    document.addEventListener('click',e=>{
      const d=e.target.closest?.('[data-at-desfazer]');if(d){d.disabled=true;desfazer(d.dataset.atDesfazer);return}
      if(e.target.closest?.('[data-at-outra]'))outraAcao();
    });
    const ligarCanal=()=>{
      if(F.canal||!F.fichaId())return;
      F.canal=sb.channel('ficha-turno-'+F.fichaId()+'-'+Math.random().toString(36).slice(2,8))
        .on('postgres_changes',{event:'*',schema:'public',table:'batalhas'},agendar)
        .on('postgres_changes',{event:'*',schema:'public',table:'batalha_participantes'},agendar)
        .on('postgres_changes',{event:'*',schema:'public',table:'batalha_acoes'},agendar)
        .subscribe();
    };
    // a ficha carrega depois do login: tenta ligar até ter id e dono
    let tentativas=0;
    const iniciar=setInterval(()=>{
      tentativas++;
      if(F.fichaId()&&F.dono()){ligarCanal();atualizar();clearInterval(iniciar)}
      else if(tentativas>120)clearInterval(iniciar);
    },1000);
    setInterval(()=>{if(!document.hidden&&F.fichaId()&&F.dono())atualizar()},20000);
    // trocou de ficha/conta: recalcula
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)agendar()});
  }

  window.AcoesTurno={SLOTS,ROTULO,estado,planejar,bolinhasHtml,toast,modal,pode,enviar,ligarFicha,atualizar:agendar,emCombate,meuTurno};
})();
