import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env — copie .env para .env e preencha com os dados do seu projeto Supabase."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // guarda a sessão no sessionStorage (dura só enquanto a aba/navegador fica
    // aberto) em vez do localStorage (que ficava valendo pra sempre) — assim,
    // ao fechar o site de verdade, o login não continua guardado no aparelho
    storage: window.sessionStorage,
  },
});
