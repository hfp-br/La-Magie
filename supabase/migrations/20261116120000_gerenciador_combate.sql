-- Gerenciador de Combate (Projeto Players).
-- Só cria tabelas, funções e políticas novas. Não altera colunas nem dados
-- existentes de fichas, ficha_condicoes ou compendio_admins.
--
-- Quem é Mestre: contas com compendio_admins.can_edit (mesma regra do Códice).
-- Jogadores: veem a ordem de iniciativa e as condições; nunca PV/PM.

create function public.eh_mestre()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.compendio_admins a
    where a.user_id = (select auth.uid()) and a.can_edit
  );
$$;
revoke execute on function public.eh_mestre() from public, anon;
grant execute on function public.eh_mestre() to authenticated;

-- ---------------------------------------------------------------------------
-- Batalhas
-- ---------------------------------------------------------------------------
create table public.batalhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Combate' check (char_length(btrim(nome)) between 1 and 120),
  rodada integer not null default 1 check (rodada >= 1),
  turno_participante_id uuid,
  ativa boolean not null default true,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Cada entidade na ordem de iniciativa. Linhas de NPC/monstro apontam para a
-- ficha original (em "Npcs Do Mestre"); cópias de monstro têm instancia = true
-- e NUNCA alteram a original: o PV delas fica em batalha_estado_privado.
create table public.batalha_participantes (
  id uuid primary key default gen_random_uuid(),
  batalha_id uuid not null references public.batalhas (id) on delete cascade,
  tipo text not null check (tipo in ('jogador', 'npc', 'monstro')),
  origem_id text,
  instancia boolean not null default false,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  retrato text not null default '' check (char_length(retrato) <= 2000),
  iniciativa integer,
  bonus_iniciativa integer not null default 0,
  ordem integer not null default 0,
  oculto boolean not null default false,
  -- condições de NPC/monstro (as de jogador vêm de ficha_condicoes)
  condicoes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(condicoes) = 'array' and jsonb_array_length(condicoes) <= 30),
  criado_em timestamptz not null default now()
);
create index batalha_participantes_batalha_idx on public.batalha_participantes (batalha_id);

alter table public.batalhas
  add constraint batalhas_turno_fk foreign key (turno_participante_id)
  references public.batalha_participantes (id) on delete set null;

-- PV/PM que só o Mestre vê (cópias de monstro e anotações).
create table public.batalha_estado_privado (
  participante_id uuid primary key references public.batalha_participantes (id) on delete cascade,
  pv_atual integer,
  pv_max integer,
  pm_atual integer,
  pm_max integer,
  notas text not null default '' check (char_length(notas) <= 2000),
  atualizado_em timestamptz not null default now()
);

-- Resumo de combate que a ficha do jogador publica ao salvar (PV máximo é
-- calculado no navegador e não existe em fichas). Tabela separada porque
-- normalizarConteudo() descarta chaves desconhecidas de conteudo_dinamico.
create table public.ficha_resumo_combate (
  ficha_id text primary key references public.fichas (id) on delete cascade,
  pv_max integer,
  pm_atual integer,
  pm_max integer,
  bonus_iniciativa integer,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.batalhas enable row level security;
alter table public.batalha_participantes enable row level security;
alter table public.batalha_estado_privado enable row level security;
alter table public.ficha_resumo_combate enable row level security;

create policy batalhas_ler on public.batalhas
  for select to authenticated using (true);
create policy batalhas_mestre_inserir on public.batalhas
  for insert to authenticated with check ((select public.eh_mestre()));
create policy batalhas_mestre_atualizar on public.batalhas
  for update to authenticated using ((select public.eh_mestre())) with check ((select public.eh_mestre()));
create policy batalhas_mestre_excluir on public.batalhas
  for delete to authenticated using ((select public.eh_mestre()));

create policy participantes_ler on public.batalha_participantes
  for select to authenticated using (not oculto or (select public.eh_mestre()));
create policy participantes_mestre_inserir on public.batalha_participantes
  for insert to authenticated with check ((select public.eh_mestre()));
create policy participantes_mestre_atualizar on public.batalha_participantes
  for update to authenticated using ((select public.eh_mestre())) with check ((select public.eh_mestre()));
create policy participantes_mestre_excluir on public.batalha_participantes
  for delete to authenticated using ((select public.eh_mestre()));

create policy estado_privado_mestre on public.batalha_estado_privado
  for all to authenticated using ((select public.eh_mestre())) with check ((select public.eh_mestre()));

-- dono da ficha grava o próprio resumo; Mestre lê todos
create policy resumo_ler on public.ficha_resumo_combate
  for select to authenticated using (
    (select public.eh_mestre())
    or exists (select 1 from public.fichas f where f.id = ficha_resumo_combate.ficha_id and f.owner_id = (select auth.uid()))
  );
create policy resumo_dono_inserir on public.ficha_resumo_combate
  for insert to authenticated with check (
    exists (select 1 from public.fichas f where f.id = ficha_resumo_combate.ficha_id and f.owner_id = (select auth.uid()))
  );
create policy resumo_dono_atualizar on public.ficha_resumo_combate
  for update to authenticated
  using (exists (select 1 from public.fichas f where f.id = ficha_resumo_combate.ficha_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.fichas f where f.id = ficha_resumo_combate.ficha_id and f.owner_id = (select auth.uid())));

-- Mestre passa a LER (só ler) as fichas e condições de todos os jogadores.
-- As políticas existentes de jogador não mudam.
create policy fichas_mestre_ler on public.fichas
  for select to authenticated using ((select public.eh_mestre()));
create policy ficha_condicoes_mestre_ler on public.ficha_condicoes
  for select to authenticated using ((select public.eh_mestre()));

-- Jogadores veem as condições dos participantes visíveis de uma batalha ativa.
-- Só nome, descrição e efeitos: as notas pessoais da ficha nunca saem daqui.
create function public.condicoes_da_batalha(p_batalha uuid)
returns table (participante_id uuid, nome text, descricao text, efeitos jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, fc.nome, fc.descricao, fc.efeitos
  from public.batalha_participantes p
  join public.batalhas b on b.id = p.batalha_id and b.ativa
  join public.ficha_condicoes fc on fc.ficha_id = p.origem_id
  where p.batalha_id = p_batalha
    and p.tipo = 'jogador'
    and (not p.oculto or (select public.eh_mestre()))
    and (select auth.uid()) is not null
  order by fc.nome;
$$;
revoke execute on function public.condicoes_da_batalha(uuid) from public, anon;
grant execute on function public.condicoes_da_batalha(uuid) to authenticated;

-- tempo real
alter publication supabase_realtime add table
  public.batalhas, public.batalha_participantes, public.batalha_estado_privado, public.ficha_resumo_combate;
