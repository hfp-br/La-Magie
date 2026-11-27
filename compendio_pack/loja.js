/* Loja do Compêndio (compendio.html e lista.html)

   - Login de jogador (mesmas contas da ficha) e bolsa com o dinheiro da ficha.
   - Comprar: escolhe quantidade, vê o total na moeda que quiser e a bolsa
     antes/depois. A função comprar_itens (Projeto Players) desconta o dinheiro
     e põe os itens na caixa de entrega; a ficha os põe no inventário ao abrir
     (nada é escrito por cima de uma ficha aberta).
   - Moedas: PC = 1, PP = 10, PO = 100, PL = 1000 peças de cobre
     (tabela do Câmbio: 1 PP = 1 T$). Pagamento gasta primeiro as moedas
     menores e devolve troco, igual ao banco.

   API: Loja.iniciar({ chip }), Loja.comprar([{ item, qtd }]), Loja.abrirLogin(),
        Loja.sair(), Loja.custoPc(preco), Loja.converterPc(pc, moeda), Loja.estado */
(function () {
  const URL = "https://drkcfrhjgkztdtneuofr.supabase.co";
  const KEY = "sb_publishable_qza2ryuCGa1OznotsuKjUw_i2uH1IlY";
  // reaproveita o cliente da página (const sb do compêndio) para não abrir duas sessões
  let existente = null;
  try { existente = (0, eval)("typeof sb !== 'undefined' && sb && sb.auth ? sb : null"); } catch {}
  const sb = existente || window.supabase.createClient(URL, KEY);

  // em tibares (T$); mesma tabela do Câmbio / "Preços em"
  const EM_TIBARES = { "T$": 1, "PC": 0.1, "PP": 1, "PE": 5, "PO": 10, "PL": 100, "TC": 0.1, "TP": 1, "TO": 10, "¥O": 10, "¥P": 1, "¥": 0.1 };
  const MOEDAS_EXIBIR = ["T$", "PC", "PP", "PO", "PL"];
  const MOEDAS = [["pl", "PL", 1000], ["po", "PO", 100], ["pp", "PP", 10], ["pc", "PC", 1]];
  const CHAVE_FICHA = "laMagie.lojaFicha";
  const CHAVE_MOEDA = "laMagie.lojaMoeda";
  const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);

  /* ---------- dinheiro ---------- */
  function custoPc(preco) {
    const v = Number(String(preco?.valor ?? "").replace(",", "."));
    const taxa = EM_TIBARES[String(preco?.moeda || "").trim().toUpperCase()];
    if (!Number.isFinite(v) || v < 0 || !taxa) return null;
    return Math.ceil(v * taxa * 10 - 1e-9);
  }
  const converterPc = (pc, moeda) => pc / ((EM_TIBARES[moeda] || 1) * 10);
  const totalPc = c => c.pc + c.pp * 10 + c.po * 100 + c.pl * 1000;
  const bolsaTexto = c => MOEDAS.filter(([k]) => c[k]).map(([k, s]) => `${c[k]} ${s}`).join(" · ") || "vazia";

  // mesmo algoritmo de comprar_itens: moedas menores primeiro, troco em moedas menores
  function pagar(carteira, custo) {
    const val = [1, 10, 100, 1000], c = [carteira.pc, carteira.pp, carteira.po, carteira.pl].map(n => Math.max(0, n | 0));
    if (c[0] + c[1] * 10 + c[2] * 100 + c[3] * 1000 < custo) return null;
    let resto = custo;
    for (let i = 0; i < 4; i++) { const usar = Math.min(c[i], Math.floor(resto / val[i])); c[i] -= usar; resto -= usar * val[i]; }
    if (resto > 0) {
      const i = c.findIndex(n => n > 0);
      if (i < 0) return null;
      c[i]--; let troco = val[i] - resto; resto = 0;
      for (let j = i - 1; j >= 0; j--) { c[j] += Math.floor(troco / val[j]); troco %= val[j]; }
    }
    return { pc: c[0], pp: c[1], po: c[2], pl: c[3] };
  }

  /* ---------- estado ---------- */
  const estado = { sessao: null, fichas: [], ficha: null, carteira: null, mestre: false };
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach(f => { try { f(estado); } catch (e) { console.warn(e); } });
  const fichaAtual = () => estado.fichas.find(f => f.id === estado.ficha) || null;
  const carteiraDe = f => f ? { pc: f.dinheiro_pc | 0, pp: f.dinheiro_pp | 0, po: f.dinheiro_po | 0, pl: f.dinheiro_pl | 0 } : null;

  let canal = null;
  async function atualizar() {
    const { data } = await sb.auth.getSession();
    estado.sessao = data?.session || null;
    estado.fichas = []; estado.ficha = null; estado.carteira = null;
    if (estado.sessao) {
      const { data: fs } = await sb.from("fichas")
        .select("id,nome_personagem,retrato_url,dinheiro_pc,dinheiro_pp,dinheiro_po,dinheiro_pl")
        .eq("owner_id", estado.sessao.user.id).order("nome_personagem");
      estado.fichas = fs || [];
      let salva = ""; try { salva = localStorage.getItem(CHAVE_FICHA) || ""; } catch {}
      estado.ficha = (estado.fichas.find(f => f.id === salva) || estado.fichas[0])?.id || null;
      estado.carteira = carteiraDe(fichaAtual());
    }
    ligarTempoReal();
    avisar();
  }
  function escolherFicha(id) {
    if (!estado.fichas.some(f => f.id === id)) return;
    estado.ficha = id; estado.carteira = carteiraDe(fichaAtual());
    try { localStorage.setItem(CHAVE_FICHA, id); } catch {}
    ligarTempoReal(); avisar();
  }
  // dinheiro mudou na ficha (outra aba, Mestre, outra compra): a bolsa acompanha
  function ligarTempoReal() {
    if (canal) { sb.removeChannel(canal); canal = null; }
    if (!estado.ficha) return;
    canal = sb.channel("loja-" + estado.ficha + "-" + Math.random().toString(36).slice(2, 7))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fichas", filter: `id=eq.${estado.ficha}` }, p => {
        const f = fichaAtual(); if (!f) return;
        ["dinheiro_pc", "dinheiro_pp", "dinheiro_po", "dinheiro_pl"].forEach(k => { if (k in p.new) f[k] = p.new[k]; });
        estado.carteira = carteiraDe(f); avisar();
      }).subscribe();
  }

  /* ---------- login ---------- */
  async function entrar(usuario, senha) {
    const nome = String(usuario || "").trim().toLowerCase();
    const emails = nome.includes("@") ? [nome] : [`${nome}@players.rpg`, `${nome}@mestre.rpg`];
    for (const email of emails) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (!error) { await atualizar(); return true; }
    }
    throw new Error("Usuário ou senha inválidos.");
  }
  async function sair() { await sb.auth.signOut(); await atualizar(); }

  /* ---------- interface ---------- */
  const CSS = `
.loja-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 5px;border:1px solid rgba(104,75,43,.35);border-radius:999px;
  background:linear-gradient(180deg,#fff8e6,#f1dfb8);color:#322619;font:13px Georgia,serif;cursor:pointer;box-shadow:0 3px 10px rgba(60,35,10,.12);
  transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s}
.loja-chip:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(60,35,10,.18)}
.loja-chip.entrar{padding:7px 13px}
.loja-chip .ret{width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(104,75,43,.4);background:#e9d5aa;display:grid;place-items:center;font-weight:700;font-size:11px;color:#705233;overflow:hidden}
.loja-chip .nm{font-weight:700;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.loja-moedas{display:inline-flex;gap:6px;font-variant-numeric:tabular-nums}
.loja-moeda{display:inline-flex;align-items:center;gap:3px;font-weight:700}
.loja-moeda i{width:13px;height:13px;border-radius:50%;display:inline-block;box-shadow:inset 0 -2px 0 rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.2)}
.loja-moeda[data-m=PL] i{background:radial-gradient(circle at 35% 30%,#fff,#cfd8e3 45%,#8b98a8)}
.loja-moeda[data-m=PO] i{background:radial-gradient(circle at 35% 30%,#fff3c4,#e3b350 45%,#a7701f)}
.loja-moeda[data-m=PP] i{background:radial-gradient(circle at 35% 30%,#fff,#c9c9c9 45%,#8a8a8a)}
.loja-moeda[data-m=PC] i{background:radial-gradient(circle at 35% 30%,#ffd9b8,#c27a44 45%,#7f4419)}
.loja-moeda.muda{animation:lojaPulo .55s cubic-bezier(.34,1.56,.64,1)}
@keyframes lojaPulo{40%{transform:translateY(-4px) scale(1.15)}}
.loja-chip.pulsa{animation:lojaBrilho .9s ease}
@keyframes lojaBrilho{30%{box-shadow:0 0 0 6px rgba(212,165,90,.45),0 6px 16px rgba(60,35,10,.18)}}
.loja-fundo{position:fixed;inset:0;z-index:10050;background:rgba(35,24,14,.55);backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}
.loja-fundo.on{opacity:1}
.loja-caixa{position:fixed;z-index:10051;left:50%;top:50%;width:min(560px,calc(100vw - 20px));max-height:calc(100vh - 30px);overflow:auto;
  transform:translate(-50%,-46%) scale(.96);opacity:0;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .2s;
  border:1px solid rgba(79,52,28,.45);border-radius:16px;background:linear-gradient(180deg,#fbf4e2,#f1e3c3);color:#322619;
  font:14px Georgia,serif;box-shadow:0 30px 80px rgba(30,18,6,.45)}
.loja-caixa.on{transform:translate(-50%,-50%) scale(1);opacity:1}
.loja-caixa::before{content:"";display:block;height:6px;border-radius:16px 16px 0 0;background:linear-gradient(90deg,#3d2b1d,#aa7735,#3d2b1d)}
.loja-cab{display:flex;justify-content:space-between;align-items:center;padding:14px 18px 8px}
.loja-cab h2{margin:0;font-size:21px}
.loja-x{border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.5);border-radius:50%;width:30px;height:30px;cursor:pointer}
.loja-corpo{padding:4px 18px 16px}
.loja-linha{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px dashed rgba(112,82,51,.2)}
.loja-linha .nome{font-weight:700}
.loja-linha small{display:block;color:#7d684d;font-size:12px}
.loja-linha.sem{opacity:.55}
.loja-qtd{display:inline-flex;align-items:center;border:1px solid rgba(104,75,43,.35);border-radius:999px;overflow:hidden;background:rgba(255,255,255,.5)}
.loja-qtd button{border:0;background:none;width:28px;height:28px;cursor:pointer;font-size:16px;color:#705233}
.loja-qtd span{min-width:24px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
.loja-preco{font-weight:700;font-variant-numeric:tabular-nums;min-width:86px;text-align:right}
.loja-moedabar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:12px 0 4px;font-size:12px;color:#7d684d}
.loja-moedabar button{border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.45);border-radius:999px;padding:3px 10px;cursor:pointer;font:inherit;font-size:12px;color:#322619}
.loja-moedabar button[aria-pressed=true]{background:#705233;color:#fbf3df;border-color:#3d2b1d}
.loja-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(170,119,53,.12);border:1px solid rgba(170,119,53,.3)}
.loja-total strong{font-size:22px;font-variant-numeric:tabular-nums}
.loja-bolsas{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-top:12px;font-size:13px}
.loja-bolsas div{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.4);border:1px solid rgba(104,75,43,.18)}
.loja-bolsas small{display:block;color:#7d684d;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.loja-bolsas .seta{background:none;border:0;font-size:18px;color:#aa7735}
.loja-bolsas .falta{color:#8f493d;font-weight:700}
.loja-ficha{display:flex;align-items:center;gap:8px;margin:2px 0 6px;font-size:13px;color:#7d684d}
.loja-ficha select{font:inherit;padding:4px 8px;border-radius:8px;border:1px solid rgba(104,75,43,.35);background:rgba(255,255,255,.6)}
.loja-pe{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px}
.loja-btn{border:1px solid rgba(104,75,43,.4);border-radius:10px;padding:9px 15px;background:rgba(255,248,228,.95);color:#322619;font:inherit;cursor:pointer;
  transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.loja-btn:hover:not(:disabled){transform:translateY(-1px)}
.loja-btn.pri{background:linear-gradient(180deg,#8a6640,#705233);color:#fbf3df;border-color:#3d2b1d;font-weight:700}
.loja-btn:disabled{opacity:.5;cursor:not-allowed}
.loja-btn.treme{animation:lojaTreme .4s}
@keyframes lojaTreme{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.loja-erro{color:#8f493d;font-size:13px;min-height:18px;margin-top:8px}
.loja-ok{text-align:center;padding:26px 18px 10px}
.loja-ok .selo{font-size:46px;display:inline-block;animation:lojaSelo .7s cubic-bezier(.34,1.56,.64,1)}
@keyframes lojaSelo{0%{transform:scale(.2) rotate(-25deg);opacity:0}100%{transform:none;opacity:1}}
.loja-form{display:grid;gap:10px}
.loja-form input{font:inherit;padding:9px 10px;border:1px solid rgba(104,75,43,.35);border-radius:8px;background:rgba(255,255,255,.6)}
.loja-voa{position:fixed;z-index:10060;width:16px;height:16px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 35% 30%,#fff3c4,#e3b350 45%,#a7701f);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.loja-comprar{white-space:nowrap}
@media (prefers-reduced-motion:reduce){.loja-chip,.loja-caixa,.loja-btn,.loja-moeda,.loja-ok .selo{animation:none!important;transition:none!important}}`;
  function css() {
    if (document.getElementById("loja-css")) return;
    const s = document.createElement("style"); s.id = "loja-css"; s.textContent = CSS; document.head.append(s);
  }

  const moedasHtml = (c, mostrar = k => c[k]) => `<span class="loja-moedas">${MOEDAS.filter(([k]) => mostrar(k)).map(([k, s]) => `<span class="loja-moeda" data-m="${s}"><i></i><b>${c[k]}</b> ${s}</span>`).join("") || "<span>bolsa vazia</span>"}</span>`;
  const iniciais = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  // números da bolsa sobem/descem até o valor novo
  function contar(el, de, ate) {
    if (reduzir || de === ate) { el.textContent = ate; return; }
    const t0 = performance.now(), dur = Math.min(1200, 350 + 90 * Math.sqrt(Math.abs(ate - de)));
    const passo = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(de + (ate - de) * e); if (k < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  }

  let chipHost = null, mostrada = null, timerChip = 0, chipEntrar = true;
  function desenharChip() {
    if (!chipHost) return;
    const f = fichaAtual();
    if (!estado.sessao) { chipHost.innerHTML = chipEntrar ? `<button type="button" class="loja-chip entrar" data-loja="login">🪙 Entrar para comprar</button>` : ""; mostrada = null; return; }
    if (!f) { chipHost.innerHTML = `<button type="button" class="loja-chip entrar" data-loja="sair" title="Sair">Sem ficha nesta conta · sair</button>`; mostrada = null; return; }
    const c = estado.carteira;
    const antes = mostrada && mostrada.id === f.id ? mostrada.c : null;
    const mudou = antes ? MOEDAS.filter(([k]) => antes[k] !== c[k]).map(([k]) => k) : [];
    const ret = f.retrato_url ? `<img class="ret" src="${esc(f.retrato_url)}" alt="">` : `<span class="ret">${esc(iniciais(f.nome_personagem))}</span>`;
    // durante a animação mostra também as moedas que vão sumir ou aparecer
    const moedas = mudou.length ? moedasHtml(antes, k => antes[k] || c[k]) : moedasHtml(c);
    chipHost.innerHTML = `<button type="button" class="loja-chip" data-loja="bolsa" title="Bolsa de ${esc(f.nome_personagem)} (clique para trocar de ficha ou sair)">${ret}<span class="nm">${esc(f.nome_personagem)}</span>${moedas}</button>`;
    mostrada = { id: f.id, c: { ...c } };
    if (!mudou.length) return;
    mudou.forEach(k => {
      const s = MOEDAS.find(m => m[0] === k)[1];
      const el = chipHost.querySelector(`.loja-moeda[data-m="${s}"] b`);
      if (el) { contar(el, antes[k], c[k]); el.parentElement.classList.add("muda"); }
    });
    chipHost.firstElementChild.classList.add("pulsa");
    clearTimeout(timerChip);
    timerChip = setTimeout(desenharChip, reduzir ? 0 : 1400); // depois tira as moedas zeradas
  }

  /* ---------- janelas ---------- */
  function janela(titulo, corpo, pe) {
    fechar();
    const fundo = document.createElement("div"); fundo.className = "loja-fundo";
    const caixa = document.createElement("div"); caixa.className = "loja-caixa"; caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true");
    caixa.innerHTML = `<div class="loja-cab"><h2>${titulo}</h2><button type="button" class="loja-x" aria-label="Fechar">✕</button></div><div class="loja-corpo">${corpo}</div>${pe ? `<div class="loja-pe">${pe}</div>` : ""}`;
    document.body.append(fundo, caixa);
    requestAnimationFrame(() => { fundo.classList.add("on"); caixa.classList.add("on"); });
    fundo.addEventListener("click", fechar);
    caixa.querySelector(".loja-x").addEventListener("click", fechar);
    document.addEventListener("keydown", escFecha);
    return caixa;
  }
  function escFecha(e) { if (e.key === "Escape") fechar(); }
  function fechar() {
    document.removeEventListener("keydown", escFecha);
    document.querySelectorAll(".loja-fundo,.loja-caixa").forEach(el => { el.classList.remove("on"); setTimeout(() => el.remove(), 220); });
  }

  function abrirLogin(depois) {
    const caixa = janela("Entrar", `<p style="margin:0 0 12px;color:#7d684d">Use o mesmo usuário e senha da sua ficha. O dinheiro da ficha vira sua bolsa aqui.</p>
      <form class="loja-form"><input name="u" autocomplete="username" placeholder="Usuário" required><input name="s" type="password" autocomplete="current-password" placeholder="Senha" required>
      <button class="loja-btn pri" type="submit">Entrar</button><div class="loja-erro"></div></form>`);
    const form = caixa.querySelector("form");
    form.u.focus();
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const erro = form.querySelector(".loja-erro"); erro.textContent = "Entrando…";
      try { await entrar(form.u.value, form.s.value); fechar(); if (depois) setTimeout(depois, 250); }
      catch (err) { erro.textContent = err.message; form.querySelector("button").classList.add("treme"); setTimeout(() => form.querySelector("button").classList.remove("treme"), 400); }
    });
  }

  function abrirBolsa() {
    const f = fichaAtual(); if (!f) return;
    const caixa = janela("Bolsa", `
      ${estado.fichas.length > 1 ? `<label class="loja-ficha">Personagem <select>${estado.fichas.map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? "selected" : ""}>${esc(x.nome_personagem)}</option>`).join("")}</select></label>` : `<div class="loja-ficha">${esc(f.nome_personagem)}</div>`}
      <div class="loja-total"><span>Dinheiro na ficha</span>${moedasHtml(estado.carteira)}</div>
      <p style="color:#7d684d;font-size:13px">Equivale a ${fmt(converterPc(totalPc(estado.carteira), "T$"))} T$. Compras descontam daqui e os itens entram no inventário da ficha.</p>`,
      `<button class="loja-btn" type="button" data-sair>Sair da conta</button><button class="loja-btn pri" type="button" data-ok>Fechar</button>`);
    caixa.querySelector("select")?.addEventListener("change", e => { escolherFicha(e.target.value); abrirBolsa(); });
    caixa.querySelector("[data-sair]").addEventListener("click", async () => { fechar(); await sair(); });
    caixa.querySelector("[data-ok]").addEventListener("click", fechar);
  }

  // item do compêndio -> item de inventário (mesmos campos de "Adicionar" na ficha)
  function itemInventario(base, qtd) {
    const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
    return {
      compendioId: base.id || "", nome: base.nome || "Item do Compêndio", quantidade: qtd,
      peso: Number(base.peso || 0), descricao: base.descricao || "", categoria: base.categoria || "", subtipo: base.subtipo || "",
      fonte: base.fonte || "", tags: clone(Array.isArray(base.tags) ? base.tags : []), preco: clone(base.preco || { valor: 0, moeda: "" }),
      ativo: false, effects: clone(Array.isArray(base.efeitos) ? base.efeitos : (Array.isArray(base.effects) ? base.effects : [])),
      weaponAttack: clone(base.weaponAttack || base.ataqueArma || null), estado: "normal",
      consumable: clone(base.consumable || base.consumivel || { enabled: false, amountPerUse: 1, label: "Usar" }),
      defenses: clone(base.defenses || base.defesas || { resistances: "", immunities: "" }),
      resources: clone(Array.isArray(base.resources) ? base.resources : (Array.isArray(base.recursos) ? base.recursos : [])),
      compradoNoCompendio: new Date().toISOString()
    };
  }

  let moedaVer = "T$";
  try { const m = localStorage.getItem(CHAVE_MOEDA); if (MOEDAS_EXIBIR.includes(m)) moedaVer = m; } catch {}

  function comprar(linhasEntrada, opcoes = {}) {
    if (!estado.sessao) { abrirLogin(() => comprar(linhasEntrada, opcoes)); return; }
    if (MOEDAS_EXIBIR.includes(opcoes.moeda)) moedaVer = opcoes.moeda;
    if (!fichaAtual()) { alert("Esta conta não tem ficha de personagem."); return; }
    const linhas = linhasEntrada.map(l => ({ item: l.item, qtd: Math.max(1, l.qtd | 0), unit: custoPc(l.item?.preco) }));
    const caixa = janela(linhas.length === 1 ? "Comprar" : `Comprar ${linhas.length} itens`, "", `<button class="loja-btn" type="button" data-cancelar>Cancelar</button><button class="loja-btn pri" type="button" data-pagar>Comprar</button>`);
    const corpo = caixa.querySelector(".loja-corpo");
    const desenhar = () => {
      const f = fichaAtual(), c = estado.carteira;
      const validas = linhas.filter(l => l.unit !== null);
      const total = validas.reduce((a, l) => a + l.unit * l.qtd, 0);
      const depois = pagar(c, total);
      corpo.innerHTML = `
        ${estado.fichas.length > 1 ? `<label class="loja-ficha">Para <select data-ficha>${estado.fichas.map(x => `<option value="${esc(x.id)}" ${x.id === f.id ? "selected" : ""}>${esc(x.nome_personagem)}</option>`).join("")}</select></label>` : `<div class="loja-ficha">Para ${esc(f.nome_personagem)}</div>`}
        ${linhas.map((l, i) => `<div class="loja-linha${l.unit === null ? " sem" : ""}">
          <div><span class="nome">${esc(l.item.nome)}</span><small>${l.unit === null ? "sem preço: não entra na compra" : `${esc(String(l.item.preco.valor))} ${esc(l.item.preco.moeda || "")} cada`}</small></div>
          <span class="loja-qtd"><button type="button" data-q="${i}" data-d="-1" aria-label="Menos">−</button><span>${l.qtd}</span><button type="button" data-q="${i}" data-d="1" aria-label="Mais">+</button></span>
          <span class="loja-preco">${l.unit === null ? "—" : `${fmt(converterPc(l.unit * l.qtd, moedaVer))} ${moedaVer}`}</span></div>`).join("")}
        <div class="loja-moedabar"><span>Ver em</span>${MOEDAS_EXIBIR.map(m => `<button type="button" data-moeda="${m}" aria-pressed="${m === moedaVer}">${m}</button>`).join("")}</div>
        <div class="loja-total"><span>Total</span><strong data-total>${fmt(converterPc(total, moedaVer))} ${moedaVer}</strong></div>
        <div class="loja-bolsas"><div><small>Bolsa agora</small>${moedasHtml(c)}</div><button class="seta" type="button" tabindex="-1">➜</button>
          <div><small>Depois</small>${depois ? moedasHtml(depois) : `<span class="falta">Faltam ${fmt(converterPc(total - totalPc(c), moedaVer))} ${moedaVer}</span>`}</div></div>
        <div class="loja-erro"></div>`;
      const btn = caixa.querySelector("[data-pagar]");
      btn.disabled = !validas.length || !depois;
      btn.textContent = !validas.length ? "Nada com preço" : depois ? `Comprar por ${fmt(converterPc(total, moedaVer))} ${moedaVer}` : "Dinheiro insuficiente";
      return { validas, total };
    };
    let atual = desenhar();
    corpo.addEventListener("click", e => {
      const q = e.target.closest("[data-q]");
      if (q) { const l = linhas[+q.dataset.q]; l.qtd = Math.max(1, Math.min(99, l.qtd + Number(q.dataset.d))); atual = desenhar(); return; }
      const m = e.target.closest("[data-moeda]");
      if (m) { moedaVer = m.dataset.moeda; try { localStorage.setItem(CHAVE_MOEDA, moedaVer); } catch {} atual = desenhar(); }
    });
    corpo.addEventListener("change", e => { if (e.target.matches("[data-ficha]")) { escolherFicha(e.target.value); atual = desenhar(); } });
    const pe = caixa.querySelector(".loja-pe");
    const rodapeCompra = pe.innerHTML;
    function religar() {
      pe.querySelector("[data-cancelar]").addEventListener("click", fechar);
      pe.querySelector("[data-pagar]").addEventListener("click", e => { if (!e.currentTarget.disabled) confirmar(); });
    }
    religar();
    // toda compra passa por esta confirmação
    function confirmar() {
      const f = fichaAtual(), depois = pagar(estado.carteira, atual.total);
      if (!depois) return;
      corpo.innerHTML = `<div class="loja-confirma">
        <p style="margin:6px 0 10px">Confirmar a compra para <b>${esc(f.nome_personagem)}</b>?</p>
        <ul style="margin:0 0 10px;padding-left:18px">${atual.validas.map(l => `<li>${l.qtd}× ${esc(l.item.nome)}</li>`).join("")}</ul>
        <div class="loja-total"><span>Total</span><strong>${fmt(converterPc(atual.total, moedaVer))} ${moedaVer}</strong></div>
        <div class="loja-bolsas"><div><small>Bolsa agora</small>${moedasHtml(estado.carteira)}</div><button class="seta" type="button" tabindex="-1">➜</button><div><small>Depois</small>${moedasHtml(depois)}</div></div>
        <p style="color:#7d684d;font-size:12px;margin:10px 0 0">O dinheiro sai da ficha na hora e os itens entram no inventário. Os Mestres veem o registro das compras.</p>
        <div class="loja-erro"></div></div>`;
      pe.innerHTML = `<button class="loja-btn" type="button" data-voltar>Voltar</button><button class="loja-btn pri" type="button" data-sim>Sim, comprar</button>`;
      pe.querySelector("[data-voltar]").addEventListener("click", () => { pe.innerHTML = rodapeCompra; religar(); atual = desenhar(); });
      pe.querySelector("[data-sim]").addEventListener("click", e => pagarAgora(e.currentTarget));
      pe.querySelector("[data-sim]").focus();
    }
    async function pagarAgora(btn) {
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = "Pagando…";
      const itens = atual.validas.map(l => itemInventario(l.item, l.qtd));
      const { data, error } = await sb.rpc("comprar_itens", { p_ficha: estado.ficha, p_itens: itens, p_custo_pc: atual.total });
      if (error) {
        console.error(error);
        const msg = /saldo/.test(error.message) ? "Dinheiro insuficiente na ficha." : "Não foi possível comprar. Tente de novo.";
        pe.innerHTML = rodapeCompra; religar(); atual = desenhar();
        corpo.querySelector(".loja-erro").textContent = msg;
        const b = pe.querySelector("[data-pagar]"); b.classList.add("treme"); setTimeout(() => b.classList.remove("treme"), 400);
        return;
      }
      voarMoedas(btn);
      const f = fichaAtual();
      Object.assign(f, { dinheiro_pc: data.pc, dinheiro_pp: data.pp, dinheiro_po: data.po, dinheiro_pl: data.pl });
      estado.carteira = carteiraDe(f);
      setTimeout(avisar, reduzir ? 0 : 650);
      ouvintesCompra.forEach(fn => { try { fn(atual.validas); } catch {} });
      corpo.innerHTML = `<div class="loja-ok"><span class="selo">🛍️</span><h3 style="margin:10px 0 4px">Comprado!</h3>
        <p style="color:#7d684d;margin:0">${atual.validas.map(l => `${l.qtd}× ${esc(l.item.nome)}`).join(", ")}<br>entra${itens.length > 1 ? "m" : ""} no inventário de ${esc(f.nome_personagem)} em instantes.</p></div>`;
      pe.innerHTML = `<button class="loja-btn pri" type="button">Fechar</button>`;
      pe.querySelector("button").addEventListener("click", fechar);
    }
  }
  const ouvintesCompra = new Set();

  // moedas saem do botão e voam para a bolsa
  function voarMoedas(origem) {
    if (reduzir || !chipHost) return;
    const a = origem.getBoundingClientRect(), b = chipHost.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const m = document.createElement("div"); m.className = "loja-voa"; document.body.append(m);
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + 30 + Math.random() * Math.max(10, b.width - 60), y1 = b.top + b.height / 2;
      const meioX = (x0 + x1) / 2 + (Math.random() - .5) * 160, meioY = Math.min(y0, y1) - 80 - Math.random() * 80;
      m.animate([
        { transform: `translate(${x0}px,${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${meioX}px,${meioY}px) scale(1.1) rotate(180deg)`, opacity: 1, offset: .5 },
        { transform: `translate(${x1}px,${y1}px) scale(.5) rotate(360deg)`, opacity: .2 }
      ], { duration: 700 + i * 60, easing: "cubic-bezier(.45,0,.2,1)", delay: i * 35 }).onfinish = () => m.remove();
      m.style.left = "-8px"; m.style.top = "-8px";
    }
  }

  /* ---------- registro de compras (só Mestres; a tabela só deixa Mestre ler) ---------- */
  async function abrirRegistro() {
    const caixa = janela("Registro de compras", `<div class="loja-erro">Carregando…</div>`);
    const corpo = caixa.querySelector(".loja-corpo");
    const { data, error } = await sb.from("compras_registro").select("*").order("criado_em", { ascending: false }).limit(300);
    if (error) { corpo.innerHTML = `<div class="loja-erro">Não foi possível carregar o registro.</div>`; return; }
    const lista = data || [];
    let filtro = "";
    const pessoas = [...new Set(lista.map(r => r.personagem))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const desenhar = () => {
      const vis = lista.filter(r => !filtro || r.personagem === filtro);
      const total = vis.reduce((a, r) => a + r.custo_pc, 0);
      corpo.innerHTML = `
        <div class="loja-moedabar"><span>Personagem</span><select data-filtro style="font:inherit;padding:3px 8px;border-radius:8px;border:1px solid rgba(104,75,43,.35)"><option value="">Todos</option>${pessoas.map(p => `<option ${p === filtro ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
        <div class="loja-moedabar"><span>Ver em</span>${MOEDAS_EXIBIR.map(m => `<button type="button" data-moeda="${m}" aria-pressed="${m === moedaVer}">${m}</button>`).join("")}</div>
        ${vis.length ? vis.map(r => `<div class="loja-linha" style="grid-template-columns:minmax(0,1fr) auto">
          <div><span class="nome">${esc(r.personagem)}</span> <small style="display:inline">· ${new Date(r.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
            <small>${(r.itens || []).map(i => `${i.quantidade ?? 1}× ${esc(i.nome)}`).join(", ")}</small>
            <small>Bolsa: ${esc(bolsaTexto(r.bolsa_antes || {}))} → ${esc(bolsaTexto(r.bolsa_depois || {}))}</small></div>
          <span class="loja-preco">${fmt(converterPc(r.custo_pc, moedaVer))} ${moedaVer}</span></div>`).join("") : `<p style="color:#7d684d">Nenhuma compra ainda.</p>`}
        <div class="loja-total"><span>${vis.length} compra${vis.length === 1 ? "" : "s"}</span><strong>${fmt(converterPc(total, moedaVer))} ${moedaVer}</strong></div>`;
    };
    desenhar();
    corpo.addEventListener("click", e => { const m = e.target.closest("[data-moeda]"); if (m) { moedaVer = m.dataset.moeda; desenhar(); } });
    corpo.addEventListener("change", e => { if (e.target.matches("[data-filtro]")) { filtro = e.target.value; desenhar(); } });
  }

  // entrar: false quando a página já tem o próprio botão "Entrar" (Compêndio)
  function iniciar({ chip, entrar: mostrarEntrar = true } = {}) {
    css();
    chipHost = chip || null;
    chipEntrar = mostrarEntrar;
    chipHost?.addEventListener("click", e => {
      const b = e.target.closest("[data-loja]"); if (!b) return;
      if (b.dataset.loja === "login") abrirLogin();
      else if (b.dataset.loja === "sair") sair();
      else abrirBolsa();
    });
    ouvintes.add(desenharChip);
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") atualizar(); });
    atualizar();
  }

  window.Loja = { iniciar, comprar, abrirLogin, abrirRegistro, sair, entrar, atualizar, custoPc, converterPc, pagar, estado, EM_TIBARES, MOEDAS_EXIBIR,
    aoMudar: fn => ouvintes.add(fn), aoComprar: fn => ouvintesCompra.add(fn), cliente: sb };
})();
