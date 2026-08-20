// Função serverless da Vercel — cria/gerencia logins do app (usuário e senha).
// Fica no servidor de propósito: usa a "service role key" do Supabase, que consegue
// criar/alterar contas de outras pessoas sem precisar do email/senha delas — essa chave
// nunca pode ir pro código do site (senão qualquer um que abrisse o site conseguiria
// se tornar administrador). Configure na Vercel (Project Settings > Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase > Project Settings > API > service_role secret)
// VITE_SUPABASE_URL já existe (não é segredo, só o endereço do projeto).

import { createClient } from "@supabase/supabase-js";

const DOMINIO_EMAIL = "mobirelli.local";
const emailDoUsuario = (username) => `${username.trim().toLowerCase()}@${DOMINIO_EMAIL}`;

function clienteAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// confere quem está chamando: pega o usuário dono do token, busca o perfil dele e
// confirma que é administrador ativo — usado em toda ação exceto o bootstrap
async function exigirAdmin(admin, token) {
  if (!token) return { erro: "Não autenticado." };
  const { data: userData, error: userErro } = await admin.auth.getUser(token);
  if (userErro || !userData?.user) return { erro: "Sessão inválida." };
  const { data: perfil, error: perfilErro } = await admin.from("perfis").select("role, ativo").eq("id", userData.user.id).maybeSingle();
  if (perfilErro || !perfil) return { erro: "Perfil não encontrado." };
  if (perfil.role !== "admin" || !perfil.ativo) return { erro: "Só o administrador pode fazer isso." };
  return { uid: userData.user.id };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido." });
    return;
  }

  const admin = clienteAdmin();
  if (!admin) {
    res.status(503).json({
      erro: "Login ainda não configurado no servidor. Peça pro administrador cadastrar SUPABASE_SERVICE_ROLE_KEY na Vercel.",
    });
    return;
  }

  const { action, username, senha, userId, ativo, role } = req.body || {};
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  // "admin" nunca é atribuível por aqui — só existe o admin criado no bootstrap
  // (primeiro acesso). Quem cria por essa tela só escolhe entre esses dois níveis.
  const NIVEIS_ATRIBUIVEIS = ["editor", "visualizador"];

  try {
    if (action === "bootstrap-admin") {
      const { count, error: contagemErro } = await admin.from("perfis").select("id", { count: "exact", head: true });
      if (contagemErro) throw contagemErro;
      if (count > 0) {
        res.status(409).json({ erro: "Já existe um administrador cadastrado — peça o login pra ele." });
        return;
      }
      if (!username?.trim() || !senha || senha.length < 6) {
        res.status(400).json({ erro: "Informe um usuário e uma senha com pelo menos 6 caracteres." });
        return;
      }
      const { data: criado, error: criarErro } = await admin.auth.admin.createUser({
        email: emailDoUsuario(username),
        password: senha,
        email_confirm: true,
      });
      if (criarErro) throw criarErro;
      const { error: perfilErro } = await admin.from("perfis").insert({ id: criado.user.id, username: username.trim(), role: "admin" });
      if (perfilErro) throw perfilErro;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "criar") {
      const verificacao = await exigirAdmin(admin, token);
      if (verificacao.erro) {
        res.status(403).json({ erro: verificacao.erro });
        return;
      }
      if (!username?.trim() || !senha || senha.length < 6) {
        res.status(400).json({ erro: "Informe um usuário e uma senha com pelo menos 6 caracteres." });
        return;
      }
      const nivel = NIVEIS_ATRIBUIVEIS.includes(role) ? role : "editor";
      const { data: criado, error: criarErro } = await admin.auth.admin.createUser({
        email: emailDoUsuario(username),
        password: senha,
        email_confirm: true,
      });
      if (criarErro) throw criarErro;
      const { error: perfilErro } = await admin.from("perfis").insert({ id: criado.user.id, username: username.trim(), role: nivel });
      if (perfilErro) throw perfilErro;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "definir-role") {
      const verificacao = await exigirAdmin(admin, token);
      if (verificacao.erro) {
        res.status(403).json({ erro: verificacao.erro });
        return;
      }
      if (!userId || !NIVEIS_ATRIBUIVEIS.includes(role)) {
        res.status(400).json({ erro: "Escolha um nível válido (editor ou visualizador)." });
        return;
      }
      const { data: alvo, error: alvoErro } = await admin.from("perfis").select("role").eq("id", userId).maybeSingle();
      if (alvoErro || !alvo) {
        res.status(400).json({ erro: "Usuário não encontrado." });
        return;
      }
      if (alvo.role === "admin") {
        res.status(400).json({ erro: "Não é possível alterar o nível do administrador." });
        return;
      }
      const { error: updateErro } = await admin.from("perfis").update({ role }).eq("id", userId);
      if (updateErro) throw updateErro;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "redefinir-senha") {
      const verificacao = await exigirAdmin(admin, token);
      if (verificacao.erro) {
        res.status(403).json({ erro: verificacao.erro });
        return;
      }
      if (!userId || !senha || senha.length < 6) {
        res.status(400).json({ erro: "Informe a nova senha (pelo menos 6 caracteres)." });
        return;
      }
      const { error: senhaErro } = await admin.auth.admin.updateUserById(userId, { password: senha });
      if (senhaErro) throw senhaErro;
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "definir-ativo") {
      const verificacao = await exigirAdmin(admin, token);
      if (verificacao.erro) {
        res.status(403).json({ erro: verificacao.erro });
        return;
      }
      if (!userId) {
        res.status(400).json({ erro: "Usuário não informado." });
        return;
      }
      if (userId === verificacao.uid && ativo === false) {
        res.status(400).json({ erro: "Você não pode desativar seu próprio acesso." });
        return;
      }
      const { error: updateErro } = await admin.from("perfis").update({ ativo: !!ativo }).eq("id", userId);
      if (updateErro) throw updateErro;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ erro: "Ação inválida." });
  } catch (e) {
    const mensagem = e?.message || "";
    if (mensagem.toLowerCase().includes("already been registered") || mensagem.toLowerCase().includes("duplicate")) {
      res.status(409).json({ erro: "Esse nome de usuário já está em uso." });
      return;
    }
    res.status(500).json({ erro: "Não foi possível completar a ação agora. Tente de novo." });
  }
}
