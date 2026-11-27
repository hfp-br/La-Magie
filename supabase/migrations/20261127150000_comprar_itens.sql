-- Loja do Compêndio (Projeto Players): comprar itens com o dinheiro da ficha.
-- Só cria uma função nova. Usa as colunas de dinheiro que a ficha já tem
-- (dinheiro_pc/pp/po/pl) e a caixa de entrega entregas_itens.
--
-- Valores em peças de cobre: PC = 1, PP = 10, PO = 100, PL = 1000
-- (mesma tabela do Câmbio: 1 PP = 1 T$).
-- Pagamento: gasta primeiro as moedas menores; se faltar, quebra a menor
-- moeda maior que ainda houver e devolve o troco em moedas menores.
-- Os itens não são escritos direto na ficha: vão para entregas_itens e a
-- ficha do dono os põe no inventário quando abre (nada sobrescreve uma ficha aberta).

create function public.comprar_itens(p_ficha text, p_itens jsonb, p_custo_pc integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_val constant integer[] := array[1, 10, 100, 1000];
  c integer[];
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
               greatest(0, coalesce(f.dinheiro_po, 0)), greatest(0, coalesce(f.dinheiro_pl, 0))]
    into c
  from public.fichas f
  where f.id = p_ficha and f.owner_id = (select auth.uid())
  for update;
  if c is null then raise exception 'ficha não pertence a quem compra'; end if;

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

  return jsonb_build_object('pc', c[1], 'pp', c[2], 'po', c[3], 'pl', c[4]);
end $$;

revoke execute on function public.comprar_itens(text, jsonb, integer) from public, anon;
grant execute on function public.comprar_itens(text, jsonb, integer) to authenticated;
