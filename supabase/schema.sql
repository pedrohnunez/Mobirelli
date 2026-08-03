-- Rode este script inteiro no SQL Editor do seu projeto Supabase (Menu "SQL Editor" > "New query").

-- Tabela única de armazenamento (guarda motos, clientes, fluxo de caixa e configurações
-- como uma lista/objeto JSON por "chave", igual ao app já usava dentro do Claude).
create table if not exists kv_store (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita Row Level Security (padrão do Supabase) e libera leitura/escrita
-- pra chave anônima (anon key) — como é um app privado (só você e seu pai usam o link),
-- isso é suficiente. Se no futuro vocês quiserem login com senha, dá pra trocar essas
-- políticas por regras que exigem usuário autenticado.
alter table kv_store enable row level security;

drop policy if exists "kv_store select" on kv_store;
create policy "kv_store select" on kv_store for select using (true);

drop policy if exists "kv_store insert" on kv_store;
create policy "kv_store insert" on kv_store for insert with check (true);

drop policy if exists "kv_store update" on kv_store;
create policy "kv_store update" on kv_store for update using (true);

-- Habilita realtime (pra você e seu pai verem as mudanças um do outro na hora)
alter publication supabase_realtime add table kv_store;

-- Bucket de arquivos (notas fiscais, contratos, logo). Crie manualmente em
-- Storage > "New bucket" com o nome "arquivos" e marque como público — ou rode isto:
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', true)
on conflict (id) do nothing;

drop policy if exists "arquivos select" on storage.objects;
create policy "arquivos select" on storage.objects for select using (bucket_id = 'arquivos');

drop policy if exists "arquivos insert" on storage.objects;
create policy "arquivos insert" on storage.objects for insert with check (bucket_id = 'arquivos');

drop policy if exists "arquivos update" on storage.objects;
create policy "arquivos update" on storage.objects for update using (bucket_id = 'arquivos');
