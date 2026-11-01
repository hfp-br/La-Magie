-- Cópia na ficha das condições que o jogador enviou. Sobrevive à remoção pelo Mestre,
-- para o jogador poder reenviar sem refazer a condição.
create table public.ficha_condicoes_enviadas (
  id uuid primary key default gen_random_uuid(),
  ficha_id text not null references public.fichas (id) on delete cascade,
  -- Fica nulo quando o Mestre remove a condição enviada.
  condicao_id uuid references public.condicoes (id) on delete set null,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  descricao text not null default '' check (char_length(descricao) <= 5000),
  efeitos jsonb not null default '[]'::jsonb
    constraint ficha_condicoes_enviadas_efeitos_lista check (jsonb_typeof(efeitos) = 'array' and jsonb_array_length(efeitos) <= 20),
  criado_em timestamptz not null default now()
);

create index ficha_condicoes_enviadas_ficha_id_idx on public.ficha_condicoes_enviadas (ficha_id);
create index ficha_condicoes_enviadas_condicao_id_idx on public.ficha_condicoes_enviadas (condicao_id);

alter table public.ficha_condicoes_enviadas enable row level security;

revoke all on public.ficha_condicoes_enviadas from anon, authenticated;
grant select, insert, update, delete on public.ficha_condicoes_enviadas to authenticated;

create policy ficha_condicoes_enviadas_dono on public.ficha_condicoes_enviadas for all to authenticated
  using (exists (select 1 from public.fichas f
                 where f.id = ficha_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.fichas f
                      where f.id = ficha_id and f.owner_id = (select auth.uid())));
