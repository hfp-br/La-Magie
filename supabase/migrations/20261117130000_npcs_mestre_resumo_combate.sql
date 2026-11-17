-- Projeto "Npcs Do Mestre" (deugjkzscsbmpahlrlpr) — NÃO é o Projeto Players.
-- Resumo de combate que a ficha de NPC publica (PV máximo calculado no
-- navegador, mana e iniciativa), lido pelo Gerenciador de Combate.
-- Tabela nova e separada: não altera npcs nem os dados existentes.

create table public.npc_resumo_combate (
  npc_id uuid primary key references public.npcs (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pv_max integer,
  pm_atual integer,
  pm_max integer,
  bonus_iniciativa integer,
  atualizado_em timestamptz not null default now()
);
alter table public.npc_resumo_combate enable row level security;

-- Só o dono do NPC lê e grava o resumo (NPCs continuam privados).
create policy npc_resumo_ler on public.npc_resumo_combate
  for select to authenticated using (owner_id = (select auth.uid()));
create policy npc_resumo_inserir on public.npc_resumo_combate
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.npcs n where n.id = npc_resumo_combate.npc_id and n.owner_id = (select auth.uid()))
  );
create policy npc_resumo_atualizar on public.npc_resumo_combate
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.npcs n where n.id = npc_resumo_combate.npc_id and n.owner_id = (select auth.uid()))
  );

alter publication supabase_realtime add table public.npc_resumo_combate;
