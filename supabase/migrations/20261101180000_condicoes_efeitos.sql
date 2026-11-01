-- Efeitos mecânicos das condições. Só acrescenta colunas às duas tabelas de condições.
alter table public.condicoes
  add column efeitos jsonb not null default '[]'::jsonb
  constraint condicoes_efeitos_lista check (jsonb_typeof(efeitos) = 'array' and jsonb_array_length(efeitos) <= 20);

alter table public.ficha_condicoes
  add column efeitos jsonb not null default '[]'::jsonb
  constraint ficha_condicoes_efeitos_lista check (jsonb_typeof(efeitos) = 'array' and jsonb_array_length(efeitos) <= 20);
