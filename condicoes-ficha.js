// Condições na ficha. Carregado só pelo beta_index.html, depois do script principal,
// cujas variáveis globais (sb, FICHA_ID, isOwner) ele usa.
(() => {
  const estilo = document.createElement("style");
  estilo.textContent = `
    #condicoesPainel{margin:0 0 22px}
    #condicoesPainel .cond-beta{padding:1px 7px;border:1px solid var(--sand-3);border-radius:999px;font-size:11px;letter-spacing:0;text-transform:none;color:var(--muted)}
    #condicoesPainel select,#condicoesPainel input,#condicoesPainel textarea{width:100%;min-height:36px;padding:6px 9px;border:1px solid var(--sand-3);border-radius:7px;background:rgba(255,255,255,.42);color:var(--ink);font:inherit}
    #condicoesPainel button,.cond-enviar-ataque{min-height:36px;padding:5px 11px;border:1px solid var(--sand-3);border-radius:7px;background:var(--panel);color:var(--ink);font:inherit;font-size:13px;cursor:pointer}
    .cond-adicionar{display:flex;gap:8px;margin-bottom:10px}
    .cond-item{padding:9px 0;border-top:1px solid rgba(104,75,43,.25);overflow-wrap:anywhere}
    .cond-topo{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px}
    .cond-acoes{display:flex;flex-wrap:wrap;gap:6px}
    .cond-descricao{margin:5px 0;color:var(--muted);font-size:13px;white-space:pre-wrap}
    .cond-aviso{margin-left:6px;font-size:11px;color:#8f493d}
    .cond-vazio,.cond-msg{margin:6px 0;color:var(--muted);font-size:13px}
    .cond-msg:empty{display:none}
    .cond-envio{margin-top:10px}
    .cond-envio summary{cursor:pointer;font-size:13px}
    .cond-envio form{display:grid;gap:8px;margin-top:8px}
    .cond-enviar-ataque{grid-column:1/-1;justify-self:start}
    .cond-efeitos-texto{margin:4px 0;font-size:13px;color:#546547}
    .cond-efeito-linha{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,2fr) auto;align-items:end;gap:8px;padding:7px 0;border-top:1px solid rgba(104,75,43,.25)}
    .cond-efeito-linha label{display:grid;gap:3px;font-size:11px;color:var(--muted)}
    #condicoesPainel .cond-efeito-linha input,#condicoesPainel .cond-efeito-linha select{font-size:14px}
    .cond-efeito-campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:8px}
    @media(max-width:560px){.cond-efeito-linha{grid-template-columns:1fr}}
  `;
  document.head.appendChild(estilo);

  const painel = document.createElement("section");
  painel.id = "condicoesPainel";
  painel.hidden = true;
  painel.innerHTML = `
    <div class="section-title">Condições <span class="cond-beta">beta</span></div>
    <div class="cond-adicionar">
      <select id="condSeletor" data-gameplay="true" aria-label="Condição disponível"></select>
      <button type="button" id="condAplicar">Aplicar</button>
    </div>
    <div id="condLista"></div>
    <p class="cond-msg" id="condMsg" role="status"></p>
    <details class="cond-envio">
      <summary>Enviar condição ao gerenciador</summary>
      <form id="condEnvioForm">
        <input id="condEnvioNome" data-gameplay="true" maxlength="120" placeholder="Nome da condição" required>
        <textarea id="condEnvioDescricao" data-gameplay="true" rows="3" maxlength="5000" placeholder="O que ela faz"></textarea>
        <div id="condEnvioEfeitos"></div>
        <div><button>Enviar</button></div>
      </form>
    </details>`;
  document.getElementById("combatToggleList").after(painel);

  const datalist = document.createElement("datalist");
  datalist.id = "condicoesDisponiveis";
  document.body.appendChild(datalist);

  const el = id => document.getElementById(id);
  const editorEnvio = CondicoesEfeitos.criarEditor(el("condEnvioEfeitos"));
  let todas = [], naFicha = [], fichaAtual = null, canalFicha = null;
  const disponiveis = () => todas.filter(c => c.liberada);
  const msg = texto => { el("condMsg").textContent = texto; };

  // Efeitos das condições aplicadas, no formato que a ficha já soma.
  // O nome vem de outro jogador e aparece em tooltips, então vai sem caracteres de HTML.
  function efeitosDasCondicoes(tipo) {
    return naFicha.flatMap(aplicada =>
      CondicoesEfeitos.normalizar(aplicada.efeitos)
        .filter(efeito => efeito.type === tipo)
        .map((efeito, i) => ({
          ...efeito,
          id: `condicao-${aplicada.id}-${i}`,
          source: aplicada.nome.replace(/[<>&"']/g, ""),
          requiresToggle: ""
        })));
  }

  // Ataque fica de fora da coleta geral para não virar opção marcável nos ataques:
  // uma condição vale para todos os ataques, inclusive os de armas.
  const coletarOriginal = coletarEfeitosCaracteristicas;
  coletarEfeitosCaracteristicas = tipo => {
    const efeitos = coletarOriginal(tipo);
    return tipo === "attack" ? efeitos : [...efeitos, ...efeitosDasCondicoes(tipo)];
  };
  const efeitosAtaqueOriginal = getAttackEffects;
  getAttackEffects = ataque => [...efeitosAtaqueOriginal(ataque), ...efeitosDasCondicoes("attack")];

  function renderizar() {
    const usadas = new Set(naFicha.map(c => c.condicao_id));
    const opcoes = disponiveis().filter(c => !usadas.has(c.id));
    const seletor = el("condSeletor");
    seletor.replaceChildren(...(opcoes.length ? opcoes : [{ id: "", nome: "Nenhuma condição disponível" }]).map(c => new Option(c.nome, c.id)));
    seletor.disabled = el("condAplicar").disabled = !opcoes.length;
    datalist.replaceChildren(...disponiveis().map(c => new Option("", c.nome)));

    const lista = el("condLista");
    lista.replaceChildren();
    if (!naFicha.length) {
      const vazio = document.createElement("p");
      vazio.className = "cond-vazio";
      vazio.textContent = "Nenhuma condição aplicada.";
      lista.appendChild(vazio);
    }
    naFicha.forEach(aplicada => {
      const original = todas.find(c => c.id === aplicada.condicao_id);
      const item = document.createElement("div");
      item.className = "cond-item";
      const topo = document.createElement("div");
      topo.className = "cond-topo";
      const titulo = document.createElement("strong");
      titulo.textContent = aplicada.nome;
      if (!original?.liberada) {
        const aviso = document.createElement("span");
        aviso.className = "cond-aviso";
        aviso.textContent = "Desativada pelo Mestre";
        titulo.appendChild(aviso);
      }
      const acoes = document.createElement("div");
      acoes.className = "cond-acoes";
      const desatualizada = original && (original.nome !== aplicada.nome || original.descricao !== aplicada.descricao
        || JSON.stringify(CondicoesEfeitos.normalizar(original.efeitos)) !== JSON.stringify(CondicoesEfeitos.normalizar(aplicada.efeitos)));
      if (desatualizada) {
        const atualizar = document.createElement("button");
        atualizar.type = "button";
        atualizar.textContent = "Atualizar";
        atualizar.onclick = () => alterar(aplicada.id, { nome: original.nome, descricao: original.descricao, efeitos: CondicoesEfeitos.normalizar(original.efeitos) });
        acoes.appendChild(atualizar);
      }
      const remover = document.createElement("button");
      remover.type = "button";
      remover.textContent = "Remover";
      remover.onclick = async () => {
        const { error } = await sb.from("ficha_condicoes").delete().eq("id", aplicada.id);
        if (error) { console.error(error); msg("Não foi possível remover a condição."); return; }
        await carregarFicha();
      };
      acoes.appendChild(remover);
      topo.append(titulo, acoes);
      const descricao = document.createElement("p");
      descricao.className = "cond-descricao";
      descricao.textContent = aplicada.descricao;
      const notas = document.createElement("input");
      notas.dataset.gameplay = "true";
      notas.placeholder = "Notas (ex.: 3 rodadas)";
      notas.maxLength = 2000;
      notas.value = aplicada.notas;
      notas.setAttribute("aria-label", `Notas de ${aplicada.nome}`);
      notas.onchange = () => alterar(aplicada.id, { notas: notas.value });
      const efeitos = document.createElement("p");
      efeitos.className = "cond-efeitos-texto";
      efeitos.textContent = CondicoesEfeitos.descreverLista(aplicada.efeitos);
      item.append(topo, descricao);
      if (efeitos.textContent) item.append(efeitos);
      item.append(notas);
      lista.appendChild(item);
    });
  }

  async function alterar(id, dados) {
    const { error } = await sb.from("ficha_condicoes").update(dados).eq("id", id);
    if (error) { console.error(error); msg("Não foi possível salvar a condição."); return; }
    await carregarFicha();
  }

  async function carregarLista() {
    const { data, error } = await sb.from("condicoes").select("id,nome,descricao,efeitos,liberada").eq("status", "aprovada");
    if (error) { console.error(error); msg("Não foi possível carregar as condições."); return; }
    todas = data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    renderizar();
  }

  async function carregarFicha() {
    if (!fichaAtual) return;
    const { data, error } = await sb.from("ficha_condicoes").select("*").eq("ficha_id", fichaAtual);
    if (error) { console.error(error); msg("Não foi possível carregar as condições da ficha."); return; }
    naFicha = data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    renderizar();
    updateSheet();
  }

  el("condAplicar").onclick = async () => {
    const condicao = todas.find(c => c.id === el("condSeletor").value);
    if (!condicao) return;
    const { error } = await sb.from("ficha_condicoes").insert({ ficha_id: fichaAtual, condicao_id: condicao.id, nome: condicao.nome, descricao: condicao.descricao, efeitos: CondicoesEfeitos.normalizar(condicao.efeitos) });
    if (error) {
      console.error(error);
      msg(error.code === "42501"
        ? "Este navegador entrou com outra conta depois de abrir a ficha. Recarregue a página e entre com a conta da ficha."
        : `Não foi possível aplicar “${condicao.nome}”.`);
      return;
    }
    msg("");
    await carregarFicha();
  };

  async function enviar(nome, descricao, efeitos = []) {
    const { error } = await sb.from("condicoes").insert({ nome, descricao, efeitos, origem: "jogador" });
    if (error) { console.error(error); return false; }
    return true;
  }

  el("condEnvioForm").onsubmit = async event => {
    event.preventDefault();
    const nome = el("condEnvioNome").value.trim();
    if (!nome) return;
    if (!await enviar(nome, el("condEnvioDescricao").value.trim(), editorEnvio.coletar())) { msg("Não foi possível enviar a condição."); return; }
    event.target.reset();
    editorEnvio.definir([]);
    msg(`“${nome}” enviada ao gerenciador. Aguardando aprovação do Mestre.`);
  };

  // Liga o campo "Condição aplicada" dos ataques à lista e ao envio.
  function ligarAtaques(raiz) {
    raiz.querySelectorAll?.(".attack-condition-edit").forEach(bloco => {
      if (bloco.querySelector(".cond-enviar-ataque")) return;
      const campo = bloco.querySelector(".attack-edit-condition");
      const notas = bloco.querySelector(".attack-edit-condition-notes");
      campo.setAttribute("list", datalist.id);
      campo.addEventListener("input", () => {
        const condicao = disponiveis().find(c => c.nome === campo.value);
        if (condicao && !notas.value) {
          notas.value = condicao.descricao;
          notas.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cond-enviar-ataque";
      botao.textContent = "Enviar condição ao gerenciador";
      botao.onclick = async () => {
        const nome = campo.value.trim();
        if (!nome) { botao.textContent = "Preencha a condição primeiro"; return; }
        botao.disabled = true;
        const ok = await enviar(nome, notas.value.trim());
        botao.disabled = false;
        botao.textContent = ok ? `“${nome}” enviada. Aguardando o Mestre.` : "Não foi possível enviar";
      };
      bloco.appendChild(botao);
    });
  }
  ligarAtaques(document);
  new MutationObserver(mudancas => mudancas.forEach(m => m.addedNodes.forEach(ligarAtaques)))
    .observe(document.body, { childList: true, subtree: true });

  // O script principal não avisa quando a ficha carrega ou sai, então acompanhamos FICHA_ID.
  function acompanharFicha() {
    const ficha = isOwner ? FICHA_ID : null;
    if (ficha === fichaAtual) return;
    fichaAtual = ficha;
    naFicha = [];
    updateSheet();
    painel.hidden = !ficha;
    if (canalFicha) { sb.removeChannel(canalFicha); canalFicha = null; }
    if (!ficha) return;
    canalFicha = sb.channel(`ficha-condicoes-${ficha}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ficha_condicoes", filter: `ficha_id=eq.${ficha}` }, carregarFicha)
      .on("postgres_changes", { event: "*", schema: "public", table: "condicoes" }, carregarLista)
      .subscribe();
    carregarLista();
    carregarFicha();
  }
  setInterval(acompanharFicha, 1000);
  acompanharFicha();
})();
