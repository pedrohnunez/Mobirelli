-- Rode este script inteiro no SQL Editor do seu projeto Supabase (Menu "SQL Editor" > "New query").
-- Se você já rodou uma versão anterior deste arquivo, pode rodar de novo sem medo — os
-- "create table if not exists" e "drop policy if exists" tornam ele seguro pra reexecutar.

-- Tabela única de armazenamento (guarda motos, clientes, fluxo de caixa e configurações
-- como uma lista/objeto JSON por "chave", igual ao app já usava dentro do Claude).
create table if not exists kv_store (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Tabela de usuários do app (login por usuário/senha). A senha em si NUNCA fica aqui —
-- ela vive protegida dentro de auth.users, gerenciada pelo próprio Supabase Auth. Essa
-- tabela só guarda o nome de usuário escolhido, se é administrador, e se o acesso está
-- ativo. Só o "primeiro acesso" (quando essa tabela ainda está vazia) pode virar
-- administrador sozinho — todos os outros logins só são criados pelo administrador, pela
-- tela de Usuários do app (que chama a função serverless api/admin-usuarios.js).
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'usuario' check (role in ('admin', 'usuario')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table perfis enable row level security;

-- leitura pública (só usuário/role/ativo, nunca a senha) — precisa ser pública porque a
-- própria tela de login usa isso pra saber se já existe algum administrador ou se deve
-- mostrar a tela de "criar administrador"
drop policy if exists "perfis select" on perfis;
create policy "perfis select" on perfis for select using (true);

-- de propósito, SEM política de insert/update/delete pra "anon"/"authenticated" — toda
-- alteração (criar usuário, redefinir senha, desativar) passa pela função serverless
-- api/admin-usuarios.js, que usa a service role key (essa sim ignora RLS, mas só roda no
-- servidor, nunca no navegador)

-- Habilita Row Level Security e exige estar autenticado (logado) pra ler ou escrever —
-- antes disso era liberado pra qualquer um que tivesse a chave anônima (que é pública,
-- vai dentro do JavaScript do site), então isso é o que de fato tranca o acesso agora
alter table kv_store enable row level security;

drop policy if exists "kv_store select" on kv_store;
create policy "kv_store select" on kv_store for select to authenticated using (true);

drop policy if exists "kv_store insert" on kv_store;
create policy "kv_store insert" on kv_store for insert to authenticated with check (true);

drop policy if exists "kv_store update" on kv_store;
create policy "kv_store update" on kv_store for update to authenticated using (true);

-- Habilita realtime (pra você e sua equipe verem as mudanças um do outro na hora) — o
-- Supabase Realtime respeita as políticas de RLS acima automaticamente. Se você já rodou
-- esse script antes, essa linha pode dar erro dizendo que a tabela já está na
-- publicação — pode ignorar esse erro específico e continuar rodando o resto.
alter publication supabase_realtime add table kv_store;

-- Bucket de arquivos (notas fiscais, contratos, logo). Crie manualmente em
-- Storage > "New bucket" com o nome "arquivos" e marque como público — ou rode isto:
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', true)
on conflict (id) do nothing;

-- mesma troca: só quem está logado pode enviar/ver arquivos agora
drop policy if exists "arquivos select" on storage.objects;
create policy "arquivos select" on storage.objects for select to authenticated using (bucket_id = 'arquivos');

drop policy if exists "arquivos insert" on storage.objects;
create policy "arquivos insert" on storage.objects for insert to authenticated with check (bucket_id = 'arquivos');

drop policy if exists "arquivos update" on storage.objects;
create policy "arquivos update" on storage.objects for update to authenticated using (bucket_id = 'arquivos');
