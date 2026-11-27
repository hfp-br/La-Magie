-- Combate de treino e o cargo "mestre de rodinhas" (Projeto Players).
--
-- O mestre de rodinhas só conduz combates de TREINO criados por ele:
-- cria/encerra o treino, põe cópias de jogadores e inimigos genéricos,
-- passa turno, mexe em iniciativa, PV e condições das cópias.
-- Não vê nem mexe no combate de verdade, em fichas, NPCs, monstros,
-- equipes ou ações. Participantes de treino são sempre cópias
-- (instancia = true), então nenhuma ficha é ligada a um treino.
--
-- Mudanças em coisas existentes:
--   - batalhas ganha a coluna treino (padrão false: combates atuais não mudam).
--   - a política batalhas_ler passa a esconder treinos de quem não é o
--     criador nem Mestre (antes: todo logado lia todas as batalhas).
-- O resto são tabelas, funções e políticas novas.

alter table public.batalhas add column treino boolean not null default false;

create table public.combate_rodinhas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.combate_rodinhas enable row level security;
revoke all on public.combate_rodinhas from anon, authenticated;
-- sem políticas: só o banco (funções abaixo) lê esta tabela

create function public.eh_rodinhas()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.combate_rodinhas r where r.user_id = (select auth.uid()));
$$;

-- o treino é deste mestre de rodinhas
create function public.eh_meu_treino(p_batalha uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.batalhas b
    where b.id = p_batalha and b.treino and b.criado_por = (select auth.uid())
  ) and exists (select 1 from public.combate_rodinhas r where r.user_id = (select auth.uid()));
$$;

-- nomes e retratos das fichas, para pôr cópias de jogadores no treino
create function public.fichas_treino()
returns table (id text, nome text, retrato text)
language sql stable security definer set search_path = '' as $$
  select f.id, coalesce(nullif(btrim(f.nome_personagem), ''), f.nome, f.id), coalesce(f.retrato_url, '')
  from public.fichas f
  where exists (select 1 from public.combate_rodinhas r where r.user_id = (select auth.uid()))
     or exists (select 1 from public.compendio_admins a where a.user_id = (select auth.uid()) and a.can_edit)
  order by 2;
$$;

revoke execute on function public.eh_rodinhas() from public, anon;
revoke execute on function public.eh_meu_treino(uuid) from public, anon;
revoke execute on function public.fichas_treino() from public, anon;
grant execute on function public.eh_rodinhas() to authenticated;
grant execute on function public.eh_meu_treino(uuid) to authenticated;
grant execute on function public.fichas_treino() to authenticated;

-- batalhas: treinos só para o criador e Mestres
drop policy batalhas_ler on public.batalhas;
create policy batalhas_ler on public.batalhas for select to authenticated
  using (not treino or criado_por = (select auth.uid()) or (select public.eh_mestre()));

create policy batalhas_treino_inserir on public.batalhas for insert to authenticated
  with check (treino and criado_por = (select auth.uid()) and (select public.eh_rodinhas()));
create policy batalhas_treino_atualizar on public.batalhas for update to authenticated
  using (treino and criado_por = (select auth.uid()) and (select public.eh_rodinhas()))
  with check (treino and criado_por = (select auth.uid()));
create policy batalhas_treino_excluir on public.batalhas for delete to authenticated
  using (treino and criado_por = (select auth.uid()) and (select public.eh_rodinhas()));

-- participantes do treino: só cópias
create policy participantes_treino_inserir on public.batalha_participantes for insert to authenticated
  with check (instancia and public.eh_meu_treino(batalha_id));
create policy participantes_treino_atualizar on public.batalha_participantes for update to authenticated
  using (public.eh_meu_treino(batalha_id))
  with check (instancia and public.eh_meu_treino(batalha_id));
create policy participantes_treino_excluir on public.batalha_participantes for delete to authenticated
  using (public.eh_meu_treino(batalha_id));

-- PV/PM das cópias do treino
create policy estado_privado_treino on public.batalha_estado_privado for all to authenticated
  using (exists (select 1 from public.batalha_participantes p
                 where p.id = participante_id and public.eh_meu_treino(p.batalha_id)))
  with check (exists (select 1 from public.batalha_participantes p
                      where p.id = participante_id and public.eh_meu_treino(p.batalha_id)));
