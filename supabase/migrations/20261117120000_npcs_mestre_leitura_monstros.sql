-- Projeto "Npcs Do Mestre" (deugjkzscsbmpahlrlpr) — NÃO é o Projeto Players.
-- Permite que contas autorizadas LEIAM (só leiam) os monstros de outra conta,
-- para o ajudante adicionar os monstros do Mestre no Gerenciador de Combate.
-- Não altera dados nem as políticas existentes; editar/excluir continua só do dono.
-- O Monstruário e a ficha de monstro filtram por owner_id, então a lista
-- própria de cada conta não muda.

create table public.monstros_leitores (
  leitor_id uuid not null references auth.users (id) on delete cascade,
  dono_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (leitor_id, dono_id),
  check (leitor_id <> dono_id)
);
alter table public.monstros_leitores enable row level security;

create policy monstros_leitores_ver_proprio on public.monstros_leitores
  for select to authenticated using (leitor_id = (select auth.uid()));

create policy monstros_select_leitor on public.monstros
  for select to authenticated using (
    exists (
      select 1 from public.monstros_leitores l
      where l.leitor_id = (select auth.uid()) and l.dono_id = monstros.owner_id
    )
  );

-- h (ajudante) lê os monstros do Mestre (matheus). NPCs continuam privados.
insert into public.monstros_leitores (leitor_id, dono_id)
select h.id, m.id from auth.users h, auth.users m
where h.email = 'h@mestre.rpg' and m.email = 'matheus@mestre.rpg';
