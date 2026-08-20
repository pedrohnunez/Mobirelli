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
-- tabela só guarda o nome de usuário escolhido, o nível de acesso, e se o acesso está
-- ativo. Só o "primeiro acesso" (quando essa tabela ainda está vazia) pode virar
-- administrador sozinho — todos os outros logins só são criados pelo administrador, pela
-- tela de Usuários do app (que chama a função serverless api/admin-usuarios.js), e nunca
-- como "admin" — esse nível fica travado pra sempre com quem fez o primeiro acesso.
--
-- três níveis:
--   admin        — acesso completo, é o único que gerencia login de outras pessoas
--   editor       — pode ver e editar motos/clientes/caixa, mas não mexe em usuários
--   visualizador — só pode ver, nenhuma tela de cadastro/edição fica disponível
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'editor',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- se essa tabela já existia de uma versão anterior (só "admin"/"usuario"), atualiza pro
-- novo esquema de 3 níveis sem perder ninguém: quem já tinha o antigo "usuario" (que só
-- existia como "edita tudo, não é admin") vira "editor", o novo nível equivalente.
-- IMPORTANTE: a trava (constraint) precisa ser removida ANTES do update — senão o
-- update tenta gravar "editor" enquanto a trava antiga (só admin/usuario) ainda está
-- valendo, e a trava antiga barra o próprio update que ia corrigir os dados
alter table perfis drop constraint if exists perfis_role_check;
update perfis set role = 'editor' where role = 'usuario';
alter table perfis add constraint perfis_role_check check (role in ('admin', 'editor', 'visualizador'));

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

-- qualquer pessoa logada pode VER (os 3 níveis, incluindo visualizador)
drop policy if exists "kv_store select" on kv_store;
create policy "kv_store select" on kv_store for select to authenticated using (true);

-- só admin/editor podem gravar — "visualizador" não consegue, mesmo tentando por fora
-- da tela (essa é a trava de verdade; a tela só esconde os botões de editar)
drop policy if exists "kv_store insert" on kv_store;
create policy "kv_store insert" on kv_store for insert to authenticated
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'editor') and ativo));

drop policy if exists "kv_store update" on kv_store;
create policy "kv_store update" on kv_store for update to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'editor') and ativo));

-- Habilita realtime (pra você e sua equipe verem as mudanças um do outro na hora) — o
-- Supabase Realtime respeita as políticas de RLS acima automaticamente. Em bloco
-- "DO" com tratamento de erro pra nunca falhar ao rodar de novo (o Supabase roda o
-- script inteiro como uma coisa só — um erro aqui cancelava tudo que vinha antes)
do $$
begin
  alter publication supabase_realtime add table kv_store;
exception when duplicate_object then
  null; -- já estava na publicação, não tem problema
end $$;

-- Bucket de arquivos (notas fiscais, contratos, logo). Crie manualmente em
-- Storage > "New bucket" com o nome "arquivos" e marque como público — ou rode isto:
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', true)
on conflict (id) do nothing;

-- mesma ideia: qualquer logado vê, só admin/editor enviam ou substituem arquivo
drop policy if exists "arquivos select" on storage.objects;
create policy "arquivos select" on storage.objects for select to authenticated using (bucket_id = 'arquivos');

drop policy if exists "arquivos insert" on storage.objects;
create policy "arquivos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'editor') and ativo));

drop policy if exists "arquivos update" on storage.objects;
create policy "arquivos update" on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'editor') and ativo));
