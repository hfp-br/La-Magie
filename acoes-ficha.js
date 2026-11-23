/* Ações da ficha (players e NPCs)
   Procura, nas habilidades, magias e itens da ficha, o tipo de ação de cada um:
   - magias: pelo campo "Tempo" (castingTime);
   - habilidades e itens: por palavras-chave no texto ("ação padrão", "ação bônus", "reação"...).
   Cada habilidade/magia/item pode guardar o campo opcional `acao`:
     ausente  → automático (scan)
     "padrao" | "movimento" | "completa" | "livre" | "bonus" | "reacao" → tipo escolhido à mão
     "nenhuma" → scan desativado (não aparece como ação)
   Nada mais da ficha é alterado. */
(function(){
  const TIPOS=[
    ['padrao','Padrão','Ação padrão'],
    ['movimento','Movimento','Ação de movimento'],
    ['completa','Completa','Ação completa'],
    ['livre','Livre','Ação livre'],
    ['bonus','Bônus','Ação bônus'],
    ['reacao','Reação','Reação']
  ];
  const TIPO=Object.fromEntries(TIPOS.map(t=>[t[0],t]));
  const FONTES=[
    ['classe','Classe'],['talentos','Talento'],['raca','Raça'],['origem','Origem'],['antecedente','Antecedente'],['obsidiana','Obsidiana']
  ];

  const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  // ordem importa só para o trecho mostrado; todos os tipos achados entram
  const PADROES={
    padrao:/\bacao padrao\b/,
    movimento:/\bacao de movimento\b/,
    completa:/\bacao completa\b/,
    livre:/\bacao livre\b/,
    bonus:/\bacao (de )?bonus\b/,
    reacao:/\breacao\b/
  };

  // campo "Tempo" das magias (T20 e D&D): "Padrão", "1 ação", "Ação bônus", "Reação"...
  function tipoDoTempo(tempo){
    const t=norm(tempo).trim();
    if(!t)return null;
    if(/bonus/.test(t))return'bonus';
    if(/reac/.test(t))return'reacao';
    if(/complet/.test(t))return'completa';
    if(/moviment/.test(t))return'movimento';
    if(/livre/.test(t))return'livre';
    if(/padrao/.test(t)||/^(1\s*)?acao\.?$/.test(t))return'padrao';
    return null;
  }

  // Um texto pode citar vários tipos ("recebe uma ação padrão ou de movimento...").
  // Vale o tipo dito de forma direta ("como uma ação livre", "é uma reação",
  // "gastar uma ação de movimento", "Ativação: ação de movimento"); sem isso, o primeiro citado.
  const FORTE=/(?:\bcomo|\beh|\bcom|\busar|\busa|\butilizar|\bgastar|\bgasta|\bativacao|\bexecucao|\btempo|\bexige|\brequer)\s*:?\s+(?:uma\s+|sua\s+|um\s+|a\s+)?$/;
  function tiposNoTexto(texto){
    // "é" vira "eh" para não confundir com o "e" de "isto e aquilo"
    const n=norm(String(texto??'').replace(/(^|[\s,(])[éÉ](?=\s)/g,'$1eh'));
    const achados=[];
    TIPOS.forEach(([k])=>{
      const re=new RegExp(PADROES[k].source,'g');let m;
      while((m=re.exec(n))){achados.push({k,i:m.index,forte:FORTE.test(n.slice(Math.max(0,m.index-30),m.index))})}
    });
    if(!achados.length)return[];
    achados.sort((a,b)=>a.i-b.i);
    const fortes=[...new Set(achados.filter(a=>a.forte).map(a=>a.k))];
    return fortes.length?fortes:[achados[0].k];
  }

  // frase do texto original que contém a palavra-chave
  function trecho(texto,tipo){
    const src=String(texto??'');
    const frases=src.split(/(?<=[.!?;\n])\s+/);
    const f=frases.find(fr=>PADROES[tipo]?.test(norm(fr)));
    const s=(f||'').trim();
    return s.length>220?s.slice(0,217)+'…':s;
  }

  // tipos automáticos de um objeto (sem olhar o campo `acao`)
  function tiposAuto(obj,fonte){
    if(fonte==='magia'){
      const t=tipoDoTempo(obj.castingTime);
      return t?[t]:[];
    }
    if(fonte==='item')return tiposNoTexto(obj.descricao);
    return tiposNoTexto([obj.subtitle,obj.description].filter(Boolean).join('\n'));
  }

  function tiposDe(obj,fonte){
    const escolha=obj?.acao;
    if(escolha==='nenhuma')return{tipos:[],manual:true};
    if(escolha&&TIPO[escolha])return{tipos:[escolha],manual:true};
    return{tipos:tiposAuto(obj,fonte),manual:false};
  }

  function detectar(conteudo,{ataques=false}={}){
    const out=[];
    if(!conteudo)return out;
    const push=(obj,fonte,fonteNome,nome,texto,resumoFixo)=>{
      const{tipos,manual}=tiposDe(obj,fonte);
      tipos.forEach(tipo=>out.push({
        tipo,nome:String(nome||'').trim()||'(sem nome)',fonte:fonteNome,manual,
        resumo:resumoFixo||trecho(texto,tipo)||'',texto:String(texto||'')
      }));
    };
    FONTES.forEach(([k,rotulo])=>{
      (Array.isArray(conteudo[k])?conteudo[k]:[]).forEach(f=>{
        if(f&&typeof f==='object')push(f,'caracteristica',rotulo,f.name,f.description);
      });
    });
    (Array.isArray(conteudo.magias)?conteudo.magias:[]).forEach(m=>{
      if(!m||typeof m!=='object')return;
      const info=[m.level!=null&&m.level!==''?`${m.level}º nível`:'',m.castingTime,m.range].filter(Boolean).join(' · ');
      push(m,'magia','Magia',m.name,m.description,m.quickText||info);
    });
    // ataques da aba Combate: Agredir é ação padrão (só na aba Ações, para poder enviar)
    if(ataques)(Array.isArray(conteudo.ataques)?conteudo.ataques:[]).forEach(at=>{
      if(!at||typeof at!=='object')return;
      const info=[at.subtitle,at.die?`dano ${at.die}`:'',at.weaponRange?`alcance ${at.weaponRange}`:''].filter(Boolean).join(' · ');
      out.push({tipo:'padrao',nome:String(at.name||'').trim()||'Ataque',fonte:'Ataque',manual:false,resumo:info,texto:info});
    });
    (Array.isArray(conteudo.inventario)?conteudo.inventario:[]).forEach(i=>{
      if(!i||typeof i!=='object')return;
      if(Number(i.quantidade??1)<=0&&!i.acao)return;
      push(i,'item','Item',i.nome,i.descricao);
    });
    return out;
  }

  /* ---------- seletor pequenino (modo edição) ---------- */
  function seletor(obj,fonte,onChange){
    const wrap=document.createElement('label');
    wrap.className='acf-sel';
    wrap.title='Tipo de ação desta entrada na aba Ações. "auto" procura no texto; "não detectar" desliga o scan.';
    const sel=document.createElement('select');
    sel.setAttribute('aria-label','Tipo de ação');
    const auto=tiposAuto(obj,fonte).map(k=>TIPO[k][1]).join(', ');
    const opts=[['',`Ação: auto${auto?` (${auto})`:''}`],...TIPOS.map(t=>[t[0],`Ação: ${t[1]}`]),['nenhuma','Ação: não detectar']];
    opts.forEach(([v,txt])=>{const o=document.createElement('option');o.value=v;o.textContent=txt;sel.append(o)});
    sel.value=obj.acao&&(TIPO[obj.acao]||obj.acao==='nenhuma')?obj.acao:'';
    sel.addEventListener('change',()=>{
      if(sel.value)obj.acao=sel.value;else delete obj.acao;
      onChange&&onChange();
    });
    wrap.append(sel);
    return wrap;
  }

  /* ---------- aba Ações: "Ações da ficha" ---------- */
  let getConteudo=()=>null,ultimaLista=[];
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function renderAba(){
    const host=document.getElementById('acFicha');
    if(!host)return;
    const lista=detectar(getConteudo(),{ataques:true});
    ultimaLista=lista;
    const T=window.AcoesTurno;
    if(!lista.length){
      host.innerHTML='<p class="acf-vazio">Nenhuma ação encontrada nas habilidades, magias e itens desta ficha. No modo edição, escolha o tipo de ação na própria habilidade para ela aparecer aqui.</p>';
      return;
    }
    host.innerHTML=TIPOS.map(([k,curto,longo])=>{
      const doTipo=lista.map((a,idx)=>({...a,idx})).filter(a=>a.tipo===k);
      const podeEnviar=Boolean(T?.pode?.(k));
      if(!doTipo.length)return'';
      return `<div class="acf-grupo"><h3 class="acf-titulo ac-cor-${k}">${esc(longo)}<span class="ac-n">${doTipo.length}</span></h3>
        <div class="ac-lista">${doTipo.map((a,i)=>`
          <details class="ac-card ac-cor-${k}" style="animation-delay:${Math.min(i,12)*30}ms">
            <summary>
              <span class="ac-nome">${esc(a.nome)}${podeEnviar?`<button type="button" class="acf-enviar${k==='reacao'?' reacao':''}" data-acf-enviar="${a.idx}" title="Enviar esta ação ao Mestre">Enviar</button>`:''}</span>
              ${a.resumo?`<span class="ac-resumo">${esc(a.resumo)}</span>`:''}
              <span class="ac-selos"><span class="ac-selo">${esc(a.fonte)}</span>${a.manual?'<span class="ac-selo">marcada à mão</span>':''}</span>
            </summary>
            <div class="ac-texto">${a.texto?esc(a.texto):'<i>Sem descrição.</i>'}</div>
          </details>`).join('')}</div></div>`;
    }).join('');
  }

  /* ---------- lista "Ações de combate" (aba Combate) ---------- */
  // junta as achadas com as manuais antigas (conteudo.acoesCombate), sem repetir nomes
  function gruposCombate(conteudo){
    const grupos=new Map();
    const add=(rotulo,nome)=>{
      if(!grupos.has(rotulo))grupos.set(rotulo,[]);
      const g=grupos.get(rotulo);
      if(!g.some(n=>norm(n).trim()===norm(nome).trim()))g.push(nome);
    };
    TIPOS.forEach(t=>grupos.set(t[2],[]));
    detectar(conteudo).forEach(a=>add(TIPO[a.tipo][2],a.nome));
    (Array.isArray(conteudo?.acoesCombate)?conteudo.acoesCombate:[]).forEach(a=>{
      const tipo=tipoDoTempo(a?.type);
      add(tipo?TIPO[tipo][2]:(String(a?.type||'').trim()||'Outros'),String(a?.name||'').trim()||'Ação');
    });
    return[...grupos].filter(([,nomes])=>nomes.length);
  }

  function init(getter){
    getConteudo=getter;
    document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-tab="acoes"]'))renderAba();
      const env=e.target.closest?.('[data-acf-enviar]');
      if(env){
        e.preventDefault();e.stopPropagation();
        const a=ultimaLista[Number(env.dataset.acfEnviar)];
        if(a)window.AcoesTurno?.enviar({tipo:a.tipo,nome:a.nome,descricao:a.texto||a.resumo,fonte:a.fonte});
      }
    },true);
    renderAba();
  }

  const css=document.createElement('style');
  css.id='acoes-ficha-style';
  css.textContent=`
#acoes .acf-secao{margin:0 0 22px}
#acoes .acf-cab{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;margin:4px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
#acoes .acf-cab h2{margin:0;font-size:1.3rem;color:var(--sand-5)}
#acoes .acf-cab small{color:var(--muted);font-style:italic}
#acoes .acf-grupo{margin:0 0 14px}
#acoes .acf-titulo{margin:0 0 8px;font-size:1rem;color:var(--sand-5);border-left:5px solid var(--gold);padding-left:8px;display:flex;align-items:center;gap:6px}
#acoes .acf-titulo .ac-n{display:inline-block;min-width:1.4em;padding:0 6px;border-radius:999px;background:var(--sand-1);font-size:.78em;text-align:center}
#acoes .acf-vazio{color:var(--muted);font-style:italic;border:1px dashed var(--line);border-radius:12px;padding:14px;margin:0}
#acoes .ac-cor-bonus{border-left-color:#4f7a73}
#acoes .ac-texto{white-space:pre-wrap;overflow-wrap:anywhere}
.acf-sel{display:inline-flex;align-items:center;margin-right:auto}
.acf-sel select{font:inherit;font-size:.78rem;padding:2px 6px;border-radius:999px;border:1px solid var(--line,#c9b48c);background:var(--sand-1,#f3e8d0);color:var(--sand-5,#3d2b1d);cursor:pointer;max-width:210px}
.acf-nota{font-size:.8rem;color:var(--muted,#7a6650);font-style:italic;margin:2px 0 6px}
`;
  (document.head||document.documentElement).append(css);

  window.AcoesFicha={TIPOS,detectar,seletor,renderAba,gruposCombate,init,tipoDoTempo};
})();
