-- Rode este script inteiro no SQL Editor do seu projeto Supabase (Menu "SQL Editor" > "New query").
-- Cria uma tabela simples com uma única linha, que guarda todo o estado do checklist da Bibi
-- (datas marcadas, data de início do tratamento e os registros do medicamento "se necessário").

create table if not exists checklist (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita Row Level Security e libera leitura/escrita pra chave anônima (anon key) —
-- como é um checklist privado (só quem tem o link acessa), isso é suficiente.
alter table checklist enable row level security;

drop policy if exists "checklist select" on checklist;
create policy "checklist select" on checklist for select using (true);

drop policy if exists "checklist insert" on checklist;
create policy "checklist insert" on checklist for insert with check (true);

drop policy if exists "checklist update" on checklist;
create policy "checklist update" on checklist for update using (true);

-- Habilita realtime (pra qualquer aparelho que estiver com a página aberta
-- ver a marcação de dose feita em outro aparelho, na hora, sem precisar recarregar).
alter publication supabase_realtime add table checklist;
