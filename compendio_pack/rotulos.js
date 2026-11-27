/* Tags e categorias do Compêndio, em massa (só modo edição).
   Lista todas as categorias e tags com quantos itens usam cada uma.
   - Renomear: troca em todos os itens. Se o nome novo já existe, junta as duas.
   - Excluir tag: tira a tag de todos os itens.
   - Categoria não se exclui (todo item precisa de uma): renomeie ou junte com outra.
   Só mexe em categoria/categorias/tags; o resto do item fica igual.
   Salva tudo de uma vez pela ação "bulk" do compendio-commit (um commit por arquivo). */
(function () {
  const canon = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lista = () => (typeof items !== "undefined" && Array.isArray(items) ? items : []);
  const catsDe = i => (Array.isArray(i.categorias) && i.categorias.length ? i.categorias : [i.categoria]).map(canon).filter(Boolean);
  const tagsDe = i => (Array.isArray(i.tags) ? i.tags : []).map(canon).filter(Boolean);

  function contar(tipo) {
    const mapa = new Map();
    lista().forEach(i => new Set(tipo === "cat" ? catsDe(i) : tagsDe(i)).forEach(n => {
      if (!mapa.has(n)) mapa.set(n, []);
      mapa.get(n).push(i);
    }));
    return [...mapa.entries()].map(([nome, its]) => ({ nome, itens: its })).sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  // item novo com a troca feita; devolve null se nada mudou
  function trocar(item, tipo, de, para) {
    const novo = JSON.parse(JSON.stringify(item));
    const troca = arr => { const out = []; arr.forEach(v => { const r = canon(v) === de ? para : v; if (r && !out.some(x => canon(x) === canon(r))) out.push(r); }); return out; };
    if (tipo === "tag") {
      if (!tagsDe(item).includes(de)) return null;
      novo.tags = troca(Array.isArray(item.tags) ? item.tags : []);
    } else {
      if (!catsDe(item).includes(de)) return null;
      if (canon(item.categoria) === de) novo.categoria = para;
      if (Array.isArray(item.categorias) && item.categorias.length) novo.categorias = troca(item.categorias);
      if (Array.isArray(novo.categorias) && novo.categorias.length && !novo.categorias.some(c => canon(c) === canon(novo.categoria))) novo.categorias.unshift(novo.categoria);
    }
    return novo;
  }

  const CSS = `
.rot-fundo{position:fixed;inset:0;z-index:10050;background:rgba(35,24,14,.55);backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}
.rot-fundo.on{opacity:1}
.rot-caixa{position:fixed;z-index:10051;left:50%;top:50%;width:min(640px,calc(100vw - 20px));height:min(720px,calc(100vh - 30px));display:flex;flex-direction:column;
  transform:translate(-50%,-46%) scale(.96);opacity:0;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .2s;
  border:1px solid rgba(79,52,28,.45);border-radius:16px;background:linear-gradient(180deg,#fbf4e2,#f1e3c3);color:#322619;font:14px Georgia,serif;box-shadow:0 30px 80px rgba(30,18,6,.45);overflow:hidden}
.rot-caixa.on{transform:translate(-50%,-50%) scale(1);opacity:1}
.rot-caixa::before{content:"";display:block;height:6px;background:linear-gradient(90deg,#3d2b1d,#aa7735,#3d2b1d);flex:none}
.rot-cab{display:flex;justify-content:space-between;align-items:center;padding:14px 18px 6px}
.rot-cab h2{margin:0;font-size:21px}
.rot-x{border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.5);border-radius:50%;width:30px;height:30px;cursor:pointer}
.rot-topo{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:4px 18px 10px;border-bottom:1px solid rgba(112,82,51,.15)}
.rot-abas button{border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.45);border-radius:999px;padding:4px 12px;cursor:pointer;font:inherit;font-size:13px}
.rot-abas button[aria-pressed=true]{background:#705233;color:#fbf3df;border-color:#3d2b1d}
.rot-topo input{flex:1;min-width:140px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.6)}
.rot-lista{flex:1;overflow:auto;padding:8px 18px 16px}
.rot-linha{border-bottom:1px dashed rgba(112,82,51,.2);padding:7px 0;animation:rotEntra .3s ease both}
@keyframes rotEntra{from{opacity:0;transform:translateY(4px)}}
.rot-l1{display:flex;align-items:center;gap:8px}
.rot-nome{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.rot-n{font-size:11px;padding:1px 8px;border-radius:99px;background:rgba(170,119,53,.15);color:#7d684d;font-variant-numeric:tabular-nums}
.rot-btn{border:1px solid rgba(104,75,43,.35);background:rgba(255,248,228,.95);border-radius:8px;padding:3px 9px;cursor:pointer;font:inherit;font-size:12px;transition:transform .15s}
.rot-btn:hover{transform:translateY(-1px)}
.rot-btn.pri{background:linear-gradient(180deg,#8a6640,#705233);color:#fbf3df;border-color:#3d2b1d}
.rot-btn.perigo{color:#8f493d}
.rot-btn:disabled{opacity:.5;cursor:not-allowed}
.rot-itens{font-size:12px;color:#7d684d;margin:5px 0 0 2px}
.rot-edit{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;padding:8px;border-radius:10px;background:rgba(255,255,255,.4);border:1px solid rgba(104,75,43,.18)}
.rot-edit input{flex:1;min-width:140px;font:inherit;padding:5px 8px;border-radius:8px;border:1px solid rgba(104,75,43,.35)}
.rot-edit .aviso{flex-basis:100%;font-size:12px;color:#7d684d}
.rot-edit .aviso b{color:#705233}
.rot-status{padding:8px 18px;font-size:13px;color:#7d684d;border-top:1px solid rgba(112,82,51,.15);min-height:36px}
.rot-status.erro{color:#8f493d}.rot-status.ok{color:#546547}
@media (prefers-reduced-motion:reduce){.rot-caixa,.rot-linha{animation:none!important;transition:none!important}}`;

  let aba = "cat", busca = "", aberto = null, salvando = false, caixa = null, fundo = null;

  function abrir() {
    if (!document.getElementById("rot-css")) { const s = document.createElement("style"); s.id = "rot-css"; s.textContent = CSS; document.head.append(s); }
    fechar();
    fundo = document.createElement("div"); fundo.className = "rot-fundo";
    caixa = document.createElement("div"); caixa.className = "rot-caixa"; caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true");
    caixa.innerHTML = `<div class="rot-cab"><h2>🏷 Tags e categorias</h2><button class="rot-x" type="button" aria-label="Fechar">✕</button></div>
      <div class="rot-topo"><span class="rot-abas"><button type="button" data-aba="cat">Categorias</button> <button type="button" data-aba="tag">Tags</button></span>
      <input type="search" placeholder="Buscar…" aria-label="Buscar"></div>
      <div class="rot-lista"></div><div class="rot-status">Renomear para um nome que já existe junta os dois.</div>`;
    document.body.append(fundo, caixa);
    requestAnimationFrame(() => { fundo.classList.add("on"); caixa.classList.add("on"); });
    fundo.addEventListener("click", fechar);
    caixa.querySelector(".rot-x").addEventListener("click", fechar);
    caixa.querySelector("input[type=search]").addEventListener("input", e => { busca = canon(e.target.value); desenhar(); });
    caixa.querySelector(".rot-abas").addEventListener("click", e => { const b = e.target.closest("[data-aba]"); if (b) { aba = b.dataset.aba; aberto = null; desenhar(); } });
    caixa.querySelector(".rot-lista").addEventListener("click", clique);
    caixa.querySelector(".rot-lista").addEventListener("input", e => { if (e.target.matches("[data-novo]")) previa(e.target); });
    caixa.querySelector(".rot-lista").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-novo]")) caixa.querySelector("[data-aplicar]")?.click(); });
    document.addEventListener("keydown", esc_);
    desenhar();
  }
  function esc_(e) { if (e.key === "Escape" && !salvando) fechar(); }
  function fechar() {
    document.removeEventListener("keydown", esc_);
    [fundo, caixa].forEach(el => { if (!el) return; el.classList.remove("on"); setTimeout(() => el.remove(), 220); });
    fundo = caixa = null; aberto = null;
  }
  const status = (txt, tipo = "") => { const s = caixa?.querySelector(".rot-status"); if (s) { s.textContent = txt; s.className = "rot-status " + tipo; } };

  function desenhar() {
    if (!caixa) return;
    caixa.querySelectorAll("[data-aba]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.aba === aba)));
    const todos = contar(aba).filter(x => !busca || x.nome.includes(busca));
    caixa.querySelector(".rot-lista").innerHTML = todos.length ? todos.map(x => {
      const ab = aberto && aberto.nome === x.nome;
      return `<div class="rot-linha" data-nome="${esc(x.nome)}">
        <div class="rot-l1"><span class="rot-nome" data-ver title="Ver itens">${esc(x.nome)}</span><span class="rot-n">${x.itens.length}</span>
        <button class="rot-btn" type="button" data-renomear>Renomear</button>${aba === "tag" ? `<button class="rot-btn perigo" type="button" data-excluir>Excluir</button>` : ""}</div>
        ${ab && aberto.modo === "ver" ? `<div class="rot-itens">${x.itens.slice(0, 12).map(i => esc(i.nome)).join(", ")}${x.itens.length > 12 ? ` e mais ${x.itens.length - 12}` : ""}</div>` : ""}
        ${ab && aberto.modo === "renomear" ? `<div class="rot-edit"><input data-novo value="${esc(x.nome)}" aria-label="Novo nome"><button class="rot-btn pri" type="button" data-aplicar>Aplicar</button><button class="rot-btn" type="button" data-cancelar>Cancelar</button><span class="aviso"></span></div>` : ""}
        ${ab && aberto.modo === "excluir" ? `<div class="rot-edit"><span class="aviso">Tirar a tag <b>${esc(x.nome)}</b> de <b>${x.itens.length}</b> ${x.itens.length === 1 ? "item" : "itens"}?</span><button class="rot-btn perigo" type="button" data-aplicar>Excluir a tag</button><button class="rot-btn" type="button" data-cancelar>Cancelar</button></div>` : ""}
      </div>`;
    }).join("") : `<p style="color:#7d684d">Nada encontrado.</p>`;
    const input = caixa.querySelector("[data-novo]");
    if (input) { input.focus(); input.select(); previa(input); }
  }

  function previa(input) {
    const nome = input.closest(".rot-linha").dataset.nome, novo = canon(input.value);
    const aviso = input.parentElement.querySelector(".aviso"), btn = input.parentElement.querySelector("[data-aplicar]");
    const qtd = contar(aba).find(x => x.nome === nome)?.itens.length || 0;
    const existe = novo && novo !== nome && contar(aba).find(x => x.nome === novo);
    btn.disabled = !novo || novo === nome;
    aviso.innerHTML = !novo ? "Digite um nome." : novo === nome ? "Igual ao atual." :
      existe ? `Já existe <b>${esc(novo)}</b> (${existe.itens.length}): os ${qtd} itens de <b>${esc(nome)}</b> passam para ela. Fica uma só.` :
      `Muda em <b>${qtd}</b> ${qtd === 1 ? "item" : "itens"}. Nomes ficam em minúsculas e sem acento, como o resto do Compêndio.`;
    btn.textContent = existe ? "Juntar" : "Aplicar";
  }

  async function clique(e) {
    if (salvando) return;
    const linha = e.target.closest(".rot-linha"); if (!linha) return;
    const nome = linha.dataset.nome;
    if (e.target.closest("[data-ver]")) { aberto = aberto?.nome === nome && aberto.modo === "ver" ? null : { nome, modo: "ver" }; return desenhar(); }
    if (e.target.closest("[data-renomear]")) { aberto = { nome, modo: "renomear" }; return desenhar(); }
    if (e.target.closest("[data-excluir]")) { aberto = { nome, modo: "excluir" }; return desenhar(); }
    if (e.target.closest("[data-cancelar]")) { aberto = null; return desenhar(); }
    if (e.target.closest("[data-aplicar]")) {
      const para = aberto.modo === "excluir" ? "" : canon(linha.querySelector("[data-novo]").value);
      if (aberto.modo !== "excluir" && (!para || para === nome)) return;
      await aplicar(nome, para, aberto.modo === "excluir");
    }
  }

  async function aplicar(de, para, excluir) {
    const tipo = aba === "cat" ? "cat" : "tag";
    const mudados = lista().map(i => trocar(i, tipo, de, para)).filter(Boolean);
    if (!mudados.length) return;
    const rotulo = tipo === "cat" ? "categoria" : "tag";
    const mensagem = excluir ? `Excluir a tag ${de} (${mudados.length} itens)` : `${rotulo[0].toUpperCase() + rotulo.slice(1)} ${de} → ${para} (${mudados.length} itens)`;
    salvando = true;
    caixa.querySelectorAll("button,input").forEach(b => b.disabled = true);
    status(`Salvando ${mudados.length} ${mudados.length === 1 ? "item" : "itens"} no GitHub…`);
    try {
      const r = await invokeCommit({ action: "bulk", items: mudados, mensagem });
      const porId = new Map(mudados.map(i => [i.id, i]));
      items = items.map(i => porId.get(i.id) || i);
      try { refreshFilters(); render(); } catch (e) { console.warn(e); }
      aberto = null; salvando = false;
      desenhar();
      caixa.querySelectorAll("button,input").forEach(b => b.disabled = false);
      status(`✓ ${mensagem}. ${r?.files ? `${r.files} arquivo${r.files === 1 ? "" : "s"} no GitHub.` : ""}`, "ok");
    } catch (e) {
      console.error(e);
      salvando = false;
      caixa.querySelectorAll("button,input").forEach(b => b.disabled = false);
      status(`Não foi possível salvar: ${e.message}. Recarregue a página para ver o que ficou salvo.`, "erro");
    }
  }

  function iniciar() {
    const actions = document.querySelector(".top .actions");
    if (!actions || document.getElementById("rotulosBtn")) return;
    const b = document.createElement("button");
    b.id = "rotulosBtn"; b.type = "button"; b.className = "btn admin-only";
    b.textContent = "🏷 Tags e categorias";
    b.title = "Renomear, juntar ou excluir tags e categorias em todos os itens";
    b.addEventListener("click", abrir);
    actions.append(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true }); else iniciar();
  window.Rotulos = { abrir, trocar, contar };
})();
