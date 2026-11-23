-- Tracker de ações do combate (Projeto Players).
-- Só cria a tabela nova batalha_acoes, uma função, políticas e tempo real.
-- Não altera colunas nem dados existentes.
--
-- Cada linha é uma ação enviada pela ficha (origem 'ficha') ou uma marcação do
-- Mestre no Gerenciador (origem 'mestre'). `slots` diz quais espaços do turno a
-- ação gastou (completa = padrão + movimento). tipo 'extra' DÁ espaços a mais
-- (ex.: Emboscar). Nada é bloqueado: o tracker só mostra o que já foi usado.
--
-- Quem vê: o Mestre vê tudo; o jogador vê só as linhas do próprio personagem.

create table public.batalha_acoes (
  id uuid primary key default gen_random_uuid(),
  batalha_id uuid not null references public.batalhas (id) on delete cascade,
  participante_id uuid not null references public.batalha_participantes (id) on delete cascade,
  rodada integer not null check (rodada >= 1),
  tipo text not null check (tipo in ('padrao', 'movimento', 'completa', 'livre', 'bonus', 'reacao', 'extra')),
  slots text[] not null default '{}'
    check (slots <@ array['padrao', 'movimento', 'bonus', 'reacao']::text[] and coalesce(array_length(slots, 1), 0) <= 4),
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  descricao text not null default '' check (char_length(descricao) <= 4000),
  fonte text not null default '' check (char_length(fonte) <= 60),
  origem text not null default 'ficha' check (origem in ('ficha', 'mestre')),
  status text not null default 'enviada' check (status in ('enviada', 'vista', 'recusada')),
  enviado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index batalha_acoes_batalha_rodada_idx on public.batalha_acoes (batalha_id, rodada);
create index batalha_acoes_participante_idx on public.batalha_acoes (participante_id);

-- O usuário logado é dono da ficha deste participante (jogador, não cópia)?
create function public.eh_dono_participante(p_participante uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.batalha_participantes p
    join public.fichas f on f.id = p.origem_id
    where p.id = p_participante
      and p.tipo = 'jogador'
      and not p.instancia
      and f.owner_id = (select auth.uid())
  );
$$;
revoke execute on function public.eh_dono_participante(uuid) from public, anon;
grant execute on function public.eh_dono_participante(uuid) to authenticated;

alter table public.batalha_acoes enable row level security;

create policy acoes_ler on public.batalha_acoes
  for select to authenticated
  using ((select public.eh_mestre()) or public.eh_dono_participante(participante_id));

create policy acoes_mestre_inserir on public.batalha_acoes
  for insert to authenticated with check ((select public.eh_mestre()));

-- jogador envia só pelo próprio personagem, num combate ativo, na rodada atual
create policy acoes_jogador_inserir on public.batalha_acoes
  for insert to authenticated with check (
    origem = 'ficha'
    and status = 'enviada'
    and tipo <> 'extra'
    and enviado_por = (select auth.uid())
    and public.eh_dono_participante(participante_id)
    and exists (
      select 1
      from public.batalhas b
      join public.batalha_participantes p on p.batalha_id = b.id
      where b.id = batalha_acoes.batalha_id
        and p.id = batalha_acoes.participante_id
        and b.ativa
        and b.rodada = batalha_acoes.rodada
    )
  );

create policy acoes_mestre_atualizar on public.batalha_acoes
  for update to authenticated
  using ((select public.eh_mestre())) with check ((select public.eh_mestre()));

create policy acoes_mestre_excluir on public.batalha_acoes
  for delete to authenticated using ((select public.eh_mestre()));

-- "Desfazer": o jogador apaga o próprio envio por até 60 segundos
create policy acoes_jogador_desfazer on public.batalha_acoes
  for delete to authenticated using (
    origem = 'ficha'
    and enviado_por = (select auth.uid())
    and criado_em > now() - interval '60 seconds'
  );

alter publication supabase_realtime add table public.batalha_acoes;
