# Mobirelli

SPA em React + Vite pra gestão de uma empresa de aluguel de motos (motos,
clientes, fluxo de caixa, rastreio por GPS, usuários com login).

## Arquitetura

- **Frontend**: tudo em `src/App.jsx` (arquivo grande, ~6-7 mil linhas — todas
  as telas/abas do app vivem ali). `src/lib/` tem só 3 arquivos, e são os
  únicos que sabem que o Supabase existe:
  - `supabaseClient.js` — cria o client do Supabase a partir de
    `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  - `storage.js` — `getKV`/`setKV`/`subscribeKV` (dados de motos/clientes/
    caixa/config, guardados como JSON na tabela `kv_store`) e upload de
    arquivo (bucket `arquivos`).
  - `auth.js` — login/logout, `useAuth()` (sessão + perfil + se já existe
    admin), `chamarAdminApi()` (chama a function serverless de baixo).
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage), schema em
  `supabase/schema.sql` — rode esse arquivo inteiro no SQL Editor do projeto
  Supabase pra montar/atualizar o banco (é seguro rodar de novo, é
  idempotente).
- **Funções serverless da Vercel** (`api/`):
  - `admin-usuarios.js` — cria/gerencia login (usuário+senha), usando a
    `SUPABASE_SERVICE_ROLE_KEY` (nunca vai pro navegador). Ações:
    `bootstrap-admin`, `criar`, `definir-role`, `redefinir-senha`,
    `definir-ativo`, `excluir`.
  - `consulta-placa.js` — consulta de placa via ApiBrasil.
- **Login**: usuário/senha por cima do Supabase Auth (email/senha) escondendo
  o email — cada "usuário" vira `usuario@mobirelli.local` por baixo dos
  panos (`DOMINIO_EMAIL` em `auth.js` e nas duas functions).
- **Níveis de acesso** (tabela `perfis`, coluna `role`): `admin` (só um,
  criado no primeiro acesso via `bootstrap-admin`, fixo pra sempre) >
  `editor` (vê e edita tudo) > `visualizador` (só vê). **Não existe nível
  "master" aqui** — isso só existe no projeto irmão `motoprime` (ver abaixo).

## Deploy

- Produção: **https://mobirelliproapp-blush.vercel.app** (o domínio
  `mobirelli-site.vercel.app` citado no README é antigo/não existe mais —
  confira sempre em Vercel > projeto `mobirelli` > Domains qual é o atual
  antes de assumir uma URL).
- Deploy automático a partir do `main` no GitHub.
- **Fluxo de trabalho**: desenvolver na branch
  `claude/react-vite-setup-deploy-412rp8`, testar (`npm run build` +
  Playwright), então: `git push` nessa branch e DEPOIS
  `git push origin claude/react-vite-setup-deploy-412rp8:main` (fast-forward)
  pra disparar o deploy. Sempre `git fetch` antes pra conferir que não há
  divergência.
- Variáveis de ambiente na Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (tipo "Config", não "Secret" — são `VITE_`, vão pro navegador de qualquer
  jeito) e `SUPABASE_SERVICE_ROLE_KEY` (tipo "Secret", só servidor).
  Mudança de env var só entra em vigor com um novo deploy/build (Vite
  embute em build time).

## Projeto irmão: motoprime

Existe uma cópia zerada deste site pro sócio do dono, num repositório
**separado**: `github.com/pedrohnunez/motoprime` (clone local, quando
presente nesta sessão, em `/home/user/motoprime`), deploy em
**https://motoprime-khaki.vercel.app**. É o mesmo código-base, mas:

- Tem um nível extra, `master` (dono da conta, único que promove alguém a
  `admin`, invisível pra quem é só `admin`) — 4 níveis:
  `master > admin > editor > visualizador`.
- Sem branch de trabalho separada — commit direto na `main`.
- Sem nenhum dado real (motos/clientes/caixa zerados, sem logo, sem link de
  rastreio).

**IMPORTANTE**: os dois códigos NÃO são sincronizados automaticamente — uma
mudança feita aqui não aparece lá, e vice-versa. Se o usuário pedir "faz
isso pro Mobirelli e pro motoprime também", é preciso editar, buildar,
testar e commitar os dois repositórios separadamente.

## Gotchas conhecidos (já debugados nesta conversa)

- **Legacy vs novas chaves do Supabase**: este projeto está preso em
  `@supabase/supabase-js@^2.45`, que só entende as chaves antigas
  (`anon`/`service_role`, formato JWT `eyJ...`). Nunca usar as novas
  (`sb_publishable_...`/`sb_secret_...`) — pegar sempre na aba "Legacy" da
  página de API Keys do Supabase.
- **URL do Supabase**: `VITE_SUPABASE_URL` deve ser só
  `https://xxxxx.supabase.co`, sem sufixo (`/rest/v1` etc. — fácil de colar
  errado a partir da tela "Data API" do Supabase). Um sufixo colado quebra
  login com `Invalid path specified in request URL`.
- **DDL do Postgres** (mudar CHECK CONSTRAINT, por exemplo) não dá pra fazer
  via client JS/REST do Supabase, nem com a service_role key — só rodando
  SQL direto no SQL Editor.
- **Testes locais com Playwright**: rodar `npm run dev`, criar um `.env`
  local com `VITE_SUPABASE_URL=http://localhost:<porta>` (sem sufixo de
  caminho) e `VITE_SUPABASE_ANON_KEY` qualquer, e mockar as chamadas via
  `page.route()` (`**/auth/v1/token**`, `**/auth/v1/user**`,
  `**/rest/v1/perfis**`, `**/rest/v1/kv_store**`, `**/api/admin-usuarios**`
  etc.) em vez de um projeto Supabase de verdade. Sempre apagar o `.env` de
  teste e derrubar o dev server depois.
  - Nesta sandbox, o Chromium do Playwright NÃO alcança a internet real
    através do proxy configurado — diagnóstico de site já publicado deve
    ser feito com `curl` (baixando o `index.html`, achando o bundle JS
    hasheado, baixando e dando grep nele), não com Playwright.
  - Pra rodar o Chromium localmente (mock de backend) é preciso apontar o
    executável: `chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`.
  - `window.confirm()`/`window.alert()` são auto-rejeitados pelo Playwright
    a menos que registre `page.on("dialog", d => d.accept())` — necessário
    pra testar qualquer exclusão (o padrão do app pra ações destrutivas é
    `window.confirm(...)` antes de seguir).
- Sempre buildar (`npm run build`) os dois projetos depois de mexer em
  `App.jsx` ou nas functions de `api/` antes de commitar — é fácil deixar
  import não usado (ex.: ícone do `lucide-react`) ou erro de sintaxe passar
  batido.
