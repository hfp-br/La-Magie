-- Compêndio de condições + gerenciador do Mestre.
-- Só cria tabelas novas. Não altera fichas, compendio_admins nem dados existentes.

create table public.condicoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  descricao text not null default '' check (char_length(descricao) <= 5000),
  origem text not null default 'jogador' check (origem in ('compendio', 'jogador')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  no_gerenciador boolean not null default false,
  liberada boolean not null default false,
  enviado_por uuid references auth.users (id) on delete set null,
  enviado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Só o que está aprovado entra no gerenciador; só o que está nele fica disponível nas fichas.
  constraint condicoes_gerenciador_aprovada check (not no_gerenciador or status = 'aprovada'),
  constraint condicoes_liberada_no_gerenciador check (not liberada or no_gerenciador),
  constraint condicoes_compendio_aprovada check (origem <> 'compendio' or status = 'aprovada')
);

create index condicoes_status_idx on public.condicoes (status);
create index condicoes_enviado_por_idx on public.condicoes (enviado_por);

-- Cópia da condição em cada ficha. Fica fora de fichas.conteudo_dinamico porque
-- normalizarConteudo() do index.html descarta chaves desconhecidas ao salvar.
create table public.ficha_condicoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id text not null references public.fichas (id) on delete cascade,
  -- Removida do gerenciador: a cópia continua na ficha, só perde o vínculo.
  condicao_id uuid references public.condicoes (id) on delete set null,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  descricao text not null default '' check (char_length(descricao) <= 5000),
  notas text not null default '' check (char_length(notas) <= 2000),
  criado_em timestamptz not null default now(),
  unique (ficha_id, condicao_id)
);

create index ficha_condicoes_condicao_id_idx on public.ficha_condicoes (condicao_id);

-- O remetente vem da sessão, nunca do navegador, para ninguém enviar em nome de outro.
create function public.condicoes_definir_remetente()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.enviado_por := auth.uid();
  new.enviado_por_nome := split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1);
  return new;
end $$;

create function public.condicoes_ao_atualizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.enviado_por := old.enviado_por;
  new.enviado_por_nome := old.enviado_por_nome;
  new.criado_em := old.criado_em;
  new.atualizado_em := now();
  return new;
end $$;

create trigger condicoes_definir_remetente before insert on public.condicoes
  for each row execute function public.condicoes_definir_remetente();
create trigger condicoes_ao_atualizar before update on public.condicoes
  for each row execute function public.condicoes_ao_atualizar();

alter table public.condicoes enable row level security;
alter table public.ficha_condicoes enable row level security;

revoke all on public.condicoes, public.ficha_condicoes from anon, authenticated;
grant select on public.condicoes to anon;
grant select, insert, update, delete on public.condicoes to authenticated;
grant select, insert, update, delete on public.ficha_condicoes to authenticated;

-- Aprovadas ficam legíveis mesmo desativadas: o Realtime só entrega um UPDATE a
-- quem pode ler a linha, e as fichas precisam saber que ela foi desativada.
create policy condicoes_ler_compendio on public.condicoes for select to anon
  using (origem = 'compendio');

create policy condicoes_ler on public.condicoes for select to authenticated
  using (
    status = 'aprovada'
    or enviado_por = (select auth.uid())
    or exists (select 1 from public.compendio_admins a
               where a.user_id = (select auth.uid()) and a.can_edit)
  );

create policy condicoes_inserir on public.condicoes for insert to authenticated
  with check (
    (origem = 'jogador' and status = 'pendente' and not no_gerenciador and not liberada)
    or exists (select 1 from public.compendio_admins a
               where a.user_id = (select auth.uid()) and a.can_edit)
  );

create policy condicoes_atualizar on public.condicoes for update to authenticated
  using (exists (select 1 from public.compendio_admins a
                 where a.user_id = (select auth.uid()) and a.can_edit))
  with check (exists (select 1 from public.compendio_admins a
                      where a.user_id = (select auth.uid()) and a.can_edit));

create policy condicoes_excluir on public.condicoes for delete to authenticated
  using (exists (select 1 from public.compendio_admins a
                 where a.user_id = (select auth.uid()) and a.can_edit));

create policy ficha_condicoes_ler on public.ficha_condicoes for select to authenticated
  using (exists (select 1 from public.fichas f
                 where f.id = ficha_id and f.owner_id = (select auth.uid())));

-- Só entra na ficha o que o Mestre deixou disponível.
create policy ficha_condicoes_inserir on public.ficha_condicoes for insert to authenticated
  with check (
    exists (select 1 from public.fichas f
            where f.id = ficha_id and f.owner_id = (select auth.uid()))
    and exists (select 1 from public.condicoes c
                where c.id = condicao_id and c.liberada)
  );

create policy ficha_condicoes_atualizar on public.ficha_condicoes for update to authenticated
  using (exists (select 1 from public.fichas f
                 where f.id = ficha_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.fichas f
                      where f.id = ficha_id and f.owner_id = (select auth.uid())));

create policy ficha_condicoes_excluir on public.ficha_condicoes for delete to authenticated
  using (exists (select 1 from public.fichas f
                 where f.id = ficha_id and f.owner_id = (select auth.uid())));

alter publication supabase_realtime add table public.condicoes, public.ficha_condicoes;
