import { supabase } from "./supabaseClient";

/**
 * Lê um valor da tabela kv_store pela chave. Retorna null se não existir.
 */
export async function getKV(key) {
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

/**
 * Grava (cria ou substitui) um valor na tabela kv_store. Retorna true/false.
 */
export async function setKV(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return !error;
}

/**
 * Assina mudanças em tempo real numa chave (ex: quando seu pai edita algo em outro
 * aparelho, você vê a atualização sem precisar recarregar a página).
 * Retorna uma função de "unsubscribe" pra chamar no cleanup do useEffect.
 */
export function subscribeKV(key, onChange) {
  const channel = supabase
    .channel(`kv-${key}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "kv_store", filter: `key=eq.${key}` },
      (payload) => {
        const row = payload.new && Object.keys(payload.new).length ? payload.new : null;
        onChange(row ? row.value : null);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Envia um arquivo (logo, nota fiscal, contrato) pro bucket "arquivos" do Supabase Storage
 * e devolve a URL pública dele — ou null se der erro. Sem limite artificial de tamanho
 * (fica sujeito só ao limite do seu projeto Supabase, bem mais generoso que os 1,5–3MB
 * do armazenamento dentro do Claude).
 */
export async function uploadArquivo(path, file) {
  const { error } = await supabase.storage.from("arquivos").upload(path, file, {
    upsert: true,
    cacheControl: "3600",
  });
  if (error) return null;
  const { data } = supabase.storage.from("arquivos").getPublicUrl(path);
  return data.publicUrl;
}
