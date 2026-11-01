// Efeitos mecânicos das condições: formato, descrição e editor.
// Usa os mesmos campos dos efeitos de características da ficha.
window.CondicoesEfeitos = (() => {
  const TIPOS = {
    skill: "Perícia", attack: "Ataque", ac: "CA", maxHp: "PV Máximo", hpPerLevel: "PV por nível",
    attribute: "Atributo", spell: "Conjuração", movement: "Movimento", carryCapacity: "Peso carregável"
  };
  const ATRIBUTOS = { str: "FOR", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" };
  const PERICIAS = ["Acrobacia", "Adestramento", "Atletismo", "Atuação", "Cavalgar", "Conhecimento", "Cura", "Diplomacia", "Enganação", "Fortitude", "Furtividade", "Guerra", "Iniciativa", "Intimidação", "Intuição", "Investigação", "Jogatina", "Ladinagem", "Luta", "Misticismo", "Nobreza", "Ofício", "Percepção", "Pilotagem", "Pontaria", "Reflexos", "Religião", "Sobrevivência", "Vontade"];
  const FISICAS = ["Acrobacia", "Atletismo", "Cavalgar", "Fortitude", "Furtividade", "Iniciativa", "Ladinagem", "Luta", "Pilotagem", "Pontaria", "Reflexos"];
  const MENTAIS = PERICIAS.filter(p => !FISICAS.includes(p));
  const GRUPOS = {
    "grupo:todas": { nome: "Todas as perícias", skills: PERICIAS },
    "grupo:fisicas": { nome: "Perícias de FOR, DES e CON", skills: FISICAS },
    "grupo:mentais": { nome: "Perícias de INT, SAB e CAR", skills: MENTAIS }
  };
  const grupoDe = skills => Object.keys(GRUPOS).find(g => GRUPOS[g].skills.length === skills?.length && GRUPOS[g].skills.every(p => skills.includes(p)));
  const numero = valor => Number.isFinite(Number(valor)) ? Number(valor) : 0;
  const sinal = valor => `${valor >= 0 ? "+" : ""}${valor}`;

  // Vale para tudo que vem do banco: efeitos enviados por um jogador rodam na ficha de outro.
  function normalizar(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, 20).flatMap(bruto => {
      const type = bruto?.type;
      if (!Object.hasOwn(TIPOS, type)) return [];
      if (type === "skill" && Array.isArray(bruto.skills)) {
        const skills = bruto.skills.filter(p => PERICIAS.includes(p));
        return skills.length ? [{ type, skills, bonus: numero(bruto.bonus) }] : [];
      }
      if (type === "skill") return [{ type, skill: PERICIAS.includes(bruto.skill) ? bruto.skill : "Iniciativa", bonus: numero(bruto.bonus) }];
      if (type === "attribute") return [{ type, stat: Object.hasOwn(ATRIBUTOS, bruto.stat) ? bruto.stat : "str", bonus: numero(bruto.bonus) }];
      if (type === "spell") return [{ type, dcBonus: numero(bruto.dcBonus), attackBonus: numero(bruto.attackBonus) }];
      if (type === "attack") {
        const dano = String(bruto.bonusDamage ?? "").trim();
        return [{ type, bonusHit: numero(bruto.bonusHit), bonusDamage: /^[+-]?[\dd\s+-]{0,30}$/i.test(dano) ? dano : "" }];
      }
      return [{ type, bonus: numero(bruto.bonus) }];
    });
  }

  function descrever(efeito) {
    if (efeito.skills) return `${GRUPOS[grupoDe(efeito.skills)]?.nome ?? efeito.skills.join(", ")} ${sinal(efeito.bonus)}`;
    if (efeito.type === "skill") return `${efeito.skill} ${sinal(efeito.bonus)}`;
    if (efeito.type === "attribute") return `${ATRIBUTOS[efeito.stat]} ${sinal(efeito.bonus)}`;
    if (efeito.type === "spell") return `CD ${sinal(efeito.dcBonus)}, ataque mágico ${sinal(efeito.attackBonus)}`;
    if (efeito.type === "attack") return `Acerto ${sinal(efeito.bonusHit)}${efeito.bonusDamage ? `, dano ${efeito.bonusDamage}` : ""}`;
    return `${TIPOS[efeito.type]} ${sinal(efeito.bonus)}`;
  }

  const descreverLista = lista => normalizar(lista).map(descrever).join(" · ");

  function campo(rotulo, entrada) {
    const label = document.createElement("label");
    label.append(rotulo, entrada);
    return label;
  }

  function entrada(valor, tipo = "number") {
    const input = document.createElement("input");
    input.type = tipo;
    input.value = valor;
    input.dataset.gameplay = "true";
    return input;
  }

  function seletor(opcoes, valor) {
    const select = document.createElement("select");
    select.dataset.gameplay = "true";
    opcoes.forEach(([v, texto]) => select.add(new Option(texto, v)));
    select.value = valor;
    return select;
  }

  // Monta o editor em `recipiente`. Retorna coletar() e definir(lista).
  function criarEditor(recipiente) {
    recipiente.classList.add("cond-efeitos");
    const linhas = document.createElement("div");
    const adicionar = document.createElement("button");
    adicionar.type = "button";
    adicionar.className = "btn cond-efeito-add";
    adicionar.textContent = "+ Efeito mecânico";
    recipiente.append(linhas, adicionar);

    function adicionarLinha(efeito) {
      const linha = document.createElement("div");
      linha.className = "cond-efeito-linha";
      const tipo = seletor(Object.entries(TIPOS), efeito.type);
      tipo.setAttribute("aria-label", "Tipo do efeito");
      const campos = document.createElement("div");
      campos.className = "cond-efeito-campos";
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "btn danger";
      remover.textContent = "Remover";
      remover.onclick = () => linha.remove();
      let ler;

      function montarCampos(atual) {
        campos.replaceChildren();
        const t = atual.type;
        if (t === "skill") {
          const opcoes = [...Object.entries(GRUPOS).map(([g, v]) => [g, v.nome]), ...PERICIAS.map(p => [p, p])];
          const skill = seletor(opcoes, atual.skills ? grupoDe(atual.skills) ?? "grupo:todas" : atual.skill), bonus = entrada(atual.bonus ?? 0);
          campos.append(campo("Perícia", skill), campo("Bônus", bonus));
          ler = () => GRUPOS[skill.value]
            ? { type: t, skills: GRUPOS[skill.value].skills, bonus: bonus.value }
            : { type: t, skill: skill.value, bonus: bonus.value };
        } else if (t === "attribute") {
          const stat = seletor(Object.entries(ATRIBUTOS), atual.stat), bonus = entrada(atual.bonus ?? 0);
          campos.append(campo("Atributo", stat), campo("Bônus", bonus));
          ler = () => ({ type: t, stat: stat.value, bonus: bonus.value });
        } else if (t === "spell") {
          const cd = entrada(atual.dcBonus ?? 0), ataque = entrada(atual.attackBonus ?? 0);
          campos.append(campo("Bônus de CD", cd), campo("Ataque mágico", ataque));
          ler = () => ({ type: t, dcBonus: cd.value, attackBonus: ataque.value });
        } else if (t === "attack") {
          const acerto = entrada(atual.bonusHit ?? 0), dano = entrada(atual.bonusDamage ?? "", "text");
          dano.placeholder = "Ex.: +1d6";
          campos.append(campo("Acerto", acerto), campo("Dano", dano));
          ler = () => ({ type: t, bonusHit: acerto.value, bonusDamage: dano.value });
        } else {
          const bonus = entrada(atual.bonus ?? 0);
          campos.append(campo("Bônus", bonus));
          ler = () => ({ type: t, bonus: bonus.value });
        }
      }
      tipo.onchange = () => montarCampos(normalizar([{ type: tipo.value }])[0]);
      montarCampos(efeito);
      linha.append(campo("Tipo", tipo), campos, remover);
      linha.ler = () => ler();
      linhas.appendChild(linha);
    }

    adicionar.onclick = () => {
      if (linhas.children.length < 20) adicionarLinha(normalizar([{ type: "skill" }])[0]);
    };
    return {
      coletar: () => normalizar([...linhas.children].map(l => l.ler())),
      definir: lista => { linhas.replaceChildren(); normalizar(lista).forEach(adicionarLinha); }
    };
  }

  return { normalizar, descreverLista, criarEditor };
})();
