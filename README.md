# Mobirelli — site próprio

Este é o mesmo app que você já vinha usando dentro do Claude, adaptado pra rodar
como um site independente, com domínio próprio e um banco de dados de verdade
(Supabase) no lugar do armazenamento interno do Claude.

Peça pro Claude Code seguir os passos abaixo — cada um é rápido.

## 1. Criar o projeto no Supabase

1. Crie uma conta grátis em https://supabase.com e um novo projeto.
2. No menu **SQL Editor**, cole todo o conteúdo do arquivo `supabase/schema.sql`
   deste projeto e clique em **Run**. Isso cria a tabela de dados, as permissões
   e o espaço pra guardar arquivos (notas fiscais, contratos, logo).
3. No menu **Project Settings > API**, copie a **Project URL** e a **anon public key**.

## 2. Configurar as variáveis de ambiente

Copie `.env.example` para um novo arquivo `.env` e preencha com os dados do passo 1:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-aqui
```

## 3. Rodar localmente pra testar

```
npm install
npm run dev
```

Abre em `http://localhost:5173`. Os dados da planilha (motos, clientes e fluxo de
caixa) carregam sozinhos na primeira vez que o app abre vazio — nada pra clicar.

## 4. Publicar (deploy)

O jeito mais simples é a Vercel (gratuita pro tamanho deste app):

1. Crie uma conta em https://vercel.com (dá pra entrar com GitHub).
2. Suba este projeto pra um repositório no GitHub (o Claude Code pode fazer isso).
3. Na Vercel, clique em **Add New > Project**, escolha o repositório.
4. Em **Environment Variables**, adicione as mesmas duas variáveis do passo 2.
5. Clique em **Deploy**. Em ~1 minuto o site está no ar num link tipo
   `mobirelli-site.vercel.app`.

## 5. Conectar o domínio próprio

1. Registre o domínio (ex: `mobirelli.com.br`) no https://registro.br — R$ 40/ano.
2. Na Vercel, abra o projeto > **Settings > Domains** > adicione o domínio.
3. A Vercel mostra um ou dois registros de DNS pra configurar. Copie-os pro painel
   do Registro.br (seção "DNS" do domínio).
4. Leva de alguns minutos a algumas horas pra propagar. Depois disso, o site abre
   direto em `www.mobirelli.com.br` (ou o domínio que você escolher), em qualquer
   aparelho, sem precisar do Claude.

## O que mudou em relação à versão de dentro do Claude

- Os dados agora ficam no Supabase (banco de dados de verdade) em vez do
  armazenamento do Claude — funciona fora do Claude, com backup de verdade.
- Upload de nota fiscal/contrato/logo agora é envio de arquivo real (bucket
  `arquivos` do Supabase), sem limite artificial de tamanho (~20MB por arquivo).
- Você e seu pai veem as mudanças um do outro na hora (tempo real), sem precisar
  recarregar a página.
- O app já vem com ícone e nome próprios — no celular, o navegador oferece
  "Adicionar à tela de início" / "Instalar app", e ele abre com cara de aplicativo.

## Se quiser evoluir depois

- Trocar as políticas do Supabase (`supabase/schema.sql`) por um login de verdade
  com senha, se quiser mais segurança além do link.
- Separar `src/App.jsx` (hoje um arquivo único, de propósito, pra ficar fácil de
  ajustar) em vários arquivos menores, se o projeto crescer muito.
