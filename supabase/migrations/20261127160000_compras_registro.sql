-- Registro das compras da Loja do Compêndio (Projeto Players).
-- Cria a tabela compras_registro (só Mestres leem) e troca a função
-- comprar_itens por uma versão igual que também anota cada compra.
-- O mestre de rodinhas não é Mestre (eh_mestre), então não vê o registro.

create table public.compras_registro (
  id uuid primary key default gen_random_uuid(),
  ficha_id text references public.fichas (id) on delete set null,
  personagem text not null default '',
  comprado_por uuid references auth.users (id) on delete set null,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  custo_pc integer not null check (custo_pc >= 0),
  bolsa_antes jsonb not null,
  bolsa_depois jsonb not null,
  criado_em timestamptz not null default now()
);
create index compras_registro_criado_idx on public.compras_registro (criado_em desc);

alter table public.compras_registro enable row level security;
revoke all on public.compras_registro from anon, authenticated;
grant select on public.compras_registro to authenticated;
create policy compras_registro_mestre on public.compras_registro for select to authenticated
  using ((select public.eh_mestre()));

create or replace function public.comprar_itens(p_ficha text, p_itens jsonb, p_custo_pc integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_val constant integer[] := array[1, 10, 100, 1000];
  c integer[];
  v_antes jsonb;
  v_nome text;
  v_resto integer;
  v_usar integer;
  v_troco integer;
  i integer;
  j integer;
  v_item jsonb;
begin
  if p_custo_pc is null or p_custo_pc < 0 then raise exception 'custo inválido'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then
    raise exception 'lista de itens inválida';
  end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'nome', '') = '' then raise exception 'item inválido'; end if;
  end loop;

  select array[greatest(0, coalesce(f.dinheiro_pc, 0)), greatest(0, coalesce(f.dinheiro_pp, 0)),
               greatest(0, coalesce(f.dinheiro_po, 0)), greatest(0, coalesce(f.dinheiro_pl, 0))],
         coalesce(nullif(btrim(f.nome_personagem), ''), f.nome, f.id)
    into c, v_nome
  from public.fichas f
  where f.id = p_ficha and f.owner_id = (select auth.uid())
  for update;
  if c is null then raise exception 'ficha não pertence a quem compra'; end if;
  v_antes := jsonb_build_object('pc', c[1], 'pp', c[2], 'po', c[3], 'pl', c[4]);

  if c[1] + c[2] * 10 + c[3] * 100 + c[4] * 1000 < p_custo_pc then raise exception 'saldo insuficiente'; end if;

  v_resto := p_custo_pc;
  for i in 1..4 loop
    v_usar := least(c[i], v_resto / v_val[i]);
    c[i] := c[i] - v_usar;
    v_resto := v_resto - v_usar * v_val[i];
  end loop;
  if v_resto > 0 then
    for i in 1..4 loop
      if c[i] > 0 then
        c[i] := c[i] - 1;
        v_troco := v_val[i] - v_resto;
        v_resto := 0;
        for j in reverse i - 1..1 loop
          c[j] := c[j] + v_troco / v_val[j];
          v_troco := v_troco % v_val[j];
        end loop;
        exit;
      end if;
    end loop;
  end if;
  if v_resto > 0 then raise exception 'saldo insuficiente'; end if;

  update public.fichas
     set dinheiro_pc = c[1], dinheiro_pp = c[2], dinheiro_po = c[3], dinheiro_pl = c[4], updated_at = now()
   where id = p_ficha;

  insert into public.entregas_itens (destino_tipo, destino_id, item, remetente_ficha, remetente_nome)
  select 'jogador', p_ficha, value, p_ficha, '' from jsonb_array_elements(p_itens);

  insert into public.compras_registro (ficha_id, personagem, comprado_por, itens, custo_pc, bolsa_antes, bolsa_depois)
  values (p_ficha, left(v_nome, 200), (select auth.uid()),
    (select coalesce(jsonb_agg(jsonb_build_object('nome', value ->> 'nome', 'quantidade', value -> 'quantidade',
       'compendioId', value ->> 'compendioId', 'preco', value -> 'preco')), '[]'::jsonb) from jsonb_array_elements(p_itens)),
    p_custo_pc, v_antes, jsonb_build_object('pc', c[1], 'pp', c[2], 'po', c[3], 'pl', c[4]));

  return jsonb_build_object('pc', c[1], 'pp', c[2], 'po', c[3], 'pl', c[4]);
end $$;
