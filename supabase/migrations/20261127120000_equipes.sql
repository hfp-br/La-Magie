-- Equipes do Gerenciador de Combate (Projeto Players).
-- Só cria uma tabela nova. Não altera nenhuma tabela ou dado existente.
--
-- Uma equipe é um grupo nomeado de jogadores (fichas) e NPCs (Npcs Do Mestre).
-- No Gerenciador de Combate, "Adicionar equipe" põe todos os membros de uma vez.
-- Só Mestres (eh_mestre) veem, criam, editam e excluem equipes.
--
-- membros: [{ "tipo": "jogador" | "npc", "id": "<id de origem>", "nome": "...", "retrato": "..." }]
-- nome e retrato são uma cópia para exibir mesmo quando a ficha não está acessível
-- (ex.: NPC de outro Mestre). O combate sempre usa o id.

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  membros jsonb not null default '[]'::jsonb
    check (jsonb_typeof(membros) = 'array' and jsonb_array_length(membros) <= 60),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.equipes enable row level security;

create policy equipes_mestre_ler on public.equipes
  for select to authenticated using ((select public.eh_mestre()));
create policy equipes_mestre_inserir on public.equipes
  for insert to authenticated with check ((select public.eh_mestre()));
create policy equipes_mestre_atualizar on public.equipes
  for update to authenticated using ((select public.eh_mestre())) with check ((select public.eh_mestre()));
create policy equipes_mestre_excluir on public.equipes
  for delete to authenticated using ((select public.eh_mestre()));

revoke all on public.equipes from anon;
grant select, insert, update, delete on public.equipes to authenticated;
