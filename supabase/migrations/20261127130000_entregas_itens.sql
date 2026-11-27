-- Entregas de itens entre fichas da mesma equipe (Projeto Players).
-- Uso atual: a Cozinha do Deserto manda pratos para a equipe do cozinheiro.
-- Só cria uma tabela e duas funções novas. Não altera fichas nem equipes.
--
-- Nada é escrito direto na ficha de outra pessoa: o item fica nesta caixa de
-- entrega e a própria ficha do destinatário o põe no inventário quando abre
-- (e apaga a entrega). Assim nenhuma ficha aberta é sobrescrita.
--   destino_tipo 'jogador' -> fichas.id   (lê/apaga: o dono da ficha)
--   destino_tipo 'npc'     -> npcs.id em "Npcs Do Mestre" (lê/apaga: Mestres)

create table public.entregas_itens (
  id uuid primary key default gen_random_uuid(),
  destino_tipo text not null check (destino_tipo in ('jogador', 'npc')),
  destino_id text not null check (char_length(destino_id) between 1 and 200),
  item jsonb not null check (jsonb_typeof(item) = 'object' and pg_column_size(item) <= 30000),
  remetente_ficha text references public.fichas (id) on delete set null,
  remetente_nome text not null default '' check (char_length(remetente_nome) <= 200),
  equipe_id uuid references public.equipes (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index entregas_itens_destino_idx on public.entregas_itens (destino_tipo, destino_id);

alter table public.entregas_itens enable row level security;
revoke all on public.entregas_itens from anon, authenticated;
-- inserir só pela função enviar_item_equipe
grant select, delete on public.entregas_itens to authenticated;

create policy entregas_itens_ler on public.entregas_itens for select to authenticated
  using (
    (destino_tipo = 'jogador' and exists (select 1 from public.fichas f
       where f.id = destino_id and f.owner_id = (select auth.uid())))
    or (destino_tipo = 'npc' and (select public.eh_mestre()))
  );
create policy entregas_itens_apagar on public.entregas_itens for delete to authenticated
  using (
    (destino_tipo = 'jogador' and exists (select 1 from public.fichas f
       where f.id = destino_id and f.owner_id = (select auth.uid())))
    or (destino_tipo = 'npc' and (select public.eh_mestre()))
  );

-- Equipes de que uma ficha do jogador logado faz parte (equipes só são legíveis por Mestres).
create function public.minhas_equipes(p_ficha text)
returns table (id uuid, nome text, membros jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nome, e.membros
  from public.equipes e
  where exists (select 1 from public.fichas f where f.id = p_ficha and f.owner_id = (select auth.uid()))
    and e.membros @> jsonb_build_array(jsonb_build_object('tipo', 'jogador', 'id', p_ficha))
  order by e.nome;
$$;

-- Manda uma cópia do item para cada membro da equipe, menos a ficha que enviou.
-- Só funciona se quem chama é dono de p_ficha e p_ficha está na equipe.
create function public.enviar_item_equipe(p_equipe uuid, p_ficha text, p_item jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_membros jsonb;
  v_total integer;
begin
  select coalesce(nullif(btrim(f.nome_personagem), ''), f.nome, f.id) into v_nome
  from public.fichas f where f.id = p_ficha and f.owner_id = (select auth.uid());
  if v_nome is null then raise exception 'ficha não pertence a quem envia'; end if;

  select e.membros into v_membros from public.equipes e
  where e.id = p_equipe
    and e.membros @> jsonb_build_array(jsonb_build_object('tipo', 'jogador', 'id', p_ficha));
  if v_membros is null then raise exception 'a ficha não está nesta equipe'; end if;

  if jsonb_typeof(p_item) <> 'object' then raise exception 'item inválido'; end if;

  insert into public.entregas_itens (destino_tipo, destino_id, item, remetente_ficha, remetente_nome, equipe_id)
  select m ->> 'tipo', m ->> 'id', p_item, p_ficha, left(v_nome, 200), p_equipe
  from jsonb_array_elements(v_membros) m
  where m ->> 'tipo' in ('jogador', 'npc')
    and coalesce(m ->> 'id', '') <> ''
    and not (m ->> 'tipo' = 'jogador' and m ->> 'id' = p_ficha);
  get diagnostics v_total = row_count;
  return v_total;
end $$;

revoke execute on function public.minhas_equipes(text) from public, anon;
revoke execute on function public.enviar_item_equipe(uuid, text, jsonb) from public, anon;
grant execute on function public.minhas_equipes(text) to authenticated;
grant execute on function public.enviar_item_equipe(uuid, text, jsonb) to authenticated;

