/* Refeições da Cozinha do Deserto nas fichas (jogador: index.html; NPC: npcsync.html)

   1) Comer: um prato com "refeicao" (feito pela Cozinha do Deserto) gasta 1
      unidade, como antes, e cria no inventário a entrada "Em efeito: <prato>"
      com os bônus valendo na ficha. Só um bônus de alimentação por dia: comer
      outro prato pergunta se troca. O botão "Acabou" dessa entrada tira o efeito.
      PV temporários do prato entram no campo de PV temporário (fica o maior).

   2) Entregas: pratos mandados para a equipe ficam em entregas_itens
      (Projeto Players). A ficha aberta pelo dono busca as entregas dela,
      põe os itens no inventário e apaga a entrega. Nada é escrito por fora
      numa ficha aberta. NPC: precisa de sessão de Mestre no Projeto Players
      (a mesma do Gerenciador de Combate ou da ficha de jogador). */
(function () {
  const URL_PLAYERS = "https://drkcfrhjgkztdtneuofr.supabase.co";
  const KEY_PLAYERS = "sb_publishable_qza2ryuCGa1OznotsuKjUw_i2uH1IlY";
  const ehNpc = typeof NPC_ID !== "undefined" && !!NPC_ID;
  const num = (v, p = 0) => { const n = Number(v); return Number.isFinite(n) ? n : p; };

  /* ---------- aviso ---------- */
  function avisar(texto) {
    let t = document.getElementById("refeicaoToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "refeicaoToast";
      t.setAttribute("role", "status");
      t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);z-index:99999;max-width:min(92vw,520px);" +
        "padding:10px 16px;border-radius:12px;background:#3d2b1d;color:#fbf3e2;font:14px Georgia,serif;box-shadow:0 8px 24px rgba(0,0,0,.3);" +
        "opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;text-align:center";
      document.body.append(t);
    }
    t.textContent = texto;
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
    clearTimeout(avisar.timer);
    avisar.timer = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%) translateY(20px)"; }, 4200);
  }

  // efeitos vindos de outra ficha: só tipos conhecidos, números limitados
  const PERICIAS = ["Acrobacia","Adestramento","Atletismo","Atuação","Cavalgar","Conhecimento","Cura","Diplomacia","Enganação","Fortitude","Furtividade","Guerra","Iniciativa","Intimidação","Intuição","Investigação","Jogatina","Ladinagem","Luta","Misticismo","Nobreza","Ofício","Percepção","Pilotagem","Pontaria","Reflexos","Religião","Sobrevivência","Vontade"];
  const ATRIBUTOS = ["str","dex","con","int","wis","cha"];
  const lim = v => Math.max(-20, Math.min(20, num(v)));
  function limparEfeitos(lista) {
    return (Array.isArray(lista) ? lista.slice(0, 20) : []).flatMap(e => {
      const t = e?.type;
      if (t === "skill") {
        if (Array.isArray(e.skills)) { const sk = e.skills.filter(p => PERICIAS.includes(p)); return sk.length ? [{ type: t, skills: sk, bonus: lim(e.bonus) }] : []; }
        return PERICIAS.includes(e.skill) ? [{ type: t, skill: e.skill, bonus: lim(e.bonus) }] : [];
      }
      if (t === "attribute") return ATRIBUTOS.includes(e.stat) ? [{ type: t, stat: e.stat, bonus: lim(e.bonus) }] : [];
      if (t === "ac" || t === "movement") return [{ type: t, bonus: lim(e.bonus) }];
      if (t === "spell") return [{ type: t, dcBonus: lim(e.dcBonus), attackBonus: lim(e.attackBonus) }];
      if (t === "attack") {
        const dano = String(e.bonusDamage ?? "").trim();
        return [{ type: t, bonusHit: lim(e.bonusHit), bonusDamage: /^[+-]?\d{1,2}$/.test(dano) ? dano : "" }];
      }
      return [];
    }).map(e => ({ ...e, mode: "always" }));
  }

  const novoId = () => (typeof criarId === "function" ? criarId() : "it-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const inventario = () => (Array.isArray(conteudo?.inventario) ? conteudo.inventario : (conteudo.inventario = []));

  async function redesenharESalvar() {
    try { renderizarInventario(); } catch (e) { console.warn(e); }
    try { updateSheet(); } catch (e) { console.warn(e); }
    await salvarConteudo();
  }

  /* ---------- 1) comer ---------- */
  function entradaEmEfeito(prato) {
    const ref = prato.refeicao || {};
    const quando = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const partes = [...(ref.textos || []), ...(ref.notas || [])].filter(Boolean);
    return {
      id: novoId(), nome: `Em efeito: ${prato.nome}`, peso: 0, estado: "normal",
      categoria: "outro", subtipo: "refeição em efeito", tags: ["refeicao em efeito", "cozinha do deserto"],
      fonte: prato.fonte || "", sistema: "tormenta20", preco: { valor: 0, moeda: "T$" },
      descricao: `${partes.join(" · ")}${partes.length ? ". " : ""}Comido em ${quando}. ` +
        "Só vale um bônus de alimentação por dia: clique em “Acabou” quando o efeito terminar.",
      effects: limparEfeitos(ref.efeitos).map(e => ({ ...e, source: prato.nome })),
      resources: [], defenses: { immunities: "", resistances: "" },
      consumable: { label: "Acabou", enabled: true, amountPerUse: 1 },
      quantidade: 1, schemaVersion: 4, refeicaoAtiva: true, pratoOrigem: prato.nome
    };
  }

  function somarPvTemporario(valor) {
    const campo = document.getElementById("hpTemp");
    if (!campo || !(valor > 0)) return false;
    // PV temporários não se acumulam: fica o maior
    if (num(campo.value) >= valor) return false;
    campo.value = valor;
    const combate = document.getElementById("combatTempHP");
    if (combate) combate.value = valor;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function ligarComer() {
    if (typeof usarItemConsumivelV4 !== "function") return;
    const original = usarItemConsumivelV4;
    usarItemConsumivelV4 = async function (itemId) {
      const item = inventario().find(i => i.id === itemId);
      // "Acabou": tira a refeição em efeito
      if (item?.refeicaoAtiva) {
        if (!isOwner) return;
        conteudo.inventario = inventario().filter(i => i.id !== itemId);
        await redesenharESalvar();
        avisar(`O efeito de ${item.pratoOrigem || "a refeição"} acabou.`);
        return;
      }
      if (!item?.refeicao) return original.apply(this, arguments);

      const ativa = inventario().find(i => i.refeicaoAtiva);
      if (ativa && !confirm(`${ativa.pratoOrigem || ativa.nome} ainda está em efeito. Só vale um bônus de alimentação por dia.\n\nTrocar pelo efeito de ${item.nome}?`)) return;
      const antes = num(item.quantidade);
      await original.apply(this, arguments);
      if (num(item.quantidade) >= antes) return; // não comeu (sem quantidade, quebrado...)

      conteudo.inventario = inventario().filter(i => !i.refeicaoAtiva);
      conteudo.inventario.push(entradaEmEfeito(item));
      const ref = item.refeicao;
      const pv = somarPvTemporario(num(ref.pvTemp));
      await redesenharESalvar();
      const lembretes = [pv ? `${ref.pvTemp} PV temporários` : "", num(ref.pmTemp) > 0 ? `some ${ref.pmTemp} PM temporários` : ""].filter(Boolean);
      avisar(`${item.nome}: bônus em efeito${lembretes.length ? ` · ${lembretes.join(" · ")}` : ""}.`);
    };
  }

  /* ---------- 2) entregas ---------- */
  let clientes = null;
  function clientesPlayers() {
    if (clientes) return clientes;
    if (!window.supabase) return (clientes = []);
    if (!ehNpc) return (clientes = typeof sb !== "undefined" ? [sb] : []);
    // NPC: a ficha usa o projeto "Npcs Do Mestre"; a sessão de Mestre no
    // Projeto Players vem do Gerenciador de Combate ou da ficha de jogador.
    clientes = [
      window.supabase.createClient(URL_PLAYERS, KEY_PLAYERS, { auth: { storageKey: "la-magie-combate" } }),
      window.supabase.createClient(URL_PLAYERS, KEY_PLAYERS)
    ];
    return clientes;
  }
  async function clienteComSessao() {
    for (const c of clientesPlayers()) {
      const { data } = await c.auth.getSession();
      if (data?.session) return c;
    }
    return null;
  }

  const destino = () => ehNpc ? (typeof npcAtual !== "undefined" && npcAtual ? String(NPC_ID) : null)
    : (typeof FICHA_ID !== "undefined" && FICHA_ID && typeof currentFichaOwnerId !== "undefined" && currentFichaOwnerId ? String(FICHA_ID) : null);

  function receber(bruto, remetente) {
    if (!bruto || typeof bruto !== "object" || !bruto.nome) return null;
    const item = JSON.parse(JSON.stringify(bruto));
    item.effects = []; // pratos não dão bônus parados na bolsa, só ao comer
    if (item.refeicao) item.refeicao.efeitos = limparEfeitos(item.refeicao.efeitos);
    item.quantidade = Math.min(99, Math.max(1, Math.trunc(num(item.quantidade, 1))));
    const ja = inventario().find(i => i.cozinhaDoDeserto && !i.refeicaoAtiva && i.nome === item.nome);
    if (ja) { ja.quantidade = num(ja.quantidade) + item.quantidade; return item.nome; }
    item.id = novoId();
    if (remetente) item.descricao = `${item.descricao || ""} Enviado por ${remetente}.`.trim();
    inventario().push(item);
    return item.nome;
  }

  let buscando = false;
  async function buscarEntregas() {
    if (buscando || document.hidden || typeof conteudo === "undefined" || !isOwner) return;
    const id = destino();
    if (!id) return;
    buscando = true;
    try {
      const cli = await clienteComSessao();
      if (!cli) return;
      const { data, error } = await cli.from("entregas_itens").select("id")
        .eq("destino_tipo", ehNpc ? "npc" : "jogador").eq("destino_id", id).order("criado_em");
      if (error || !data?.length) return;
      const recebidos = [];
      for (const { id: entregaId } of data) {
        // apaga e recebe a linha de uma vez: duas abas abertas não duplicam o item
        const { data: apagadas, error: e2 } = await cli.from("entregas_itens").delete().eq("id", entregaId).select();
        if (e2 || !apagadas?.length) continue;
        const nome = receber(apagadas[0].item, apagadas[0].remetente_nome);
        if (nome) recebidos.push(nome);
      }
      if (!recebidos.length) return;
      await redesenharESalvar();
      avisar(recebidos.length === 1 ? `Chegou no inventário: ${recebidos[0]}.` : `Chegaram ${recebidos.length} itens no inventário: ${recebidos.join(", ")}.`);
    } catch (e) {
      console.warn("Entregas:", e);
    } finally {
      buscando = false;
    }
  }

  ligarComer();
  setTimeout(buscarEntregas, 2500);
  setInterval(buscarEntregas, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(buscarEntregas, 500); });
  window.RefeicoesFicha = { buscarEntregas };
})();
