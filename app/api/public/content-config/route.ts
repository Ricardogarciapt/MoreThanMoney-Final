import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { defaultContentConfig, type ContentConfig } from "@/lib/content-config"

/**
 * A leitura PÚBLICA do que o admin edita em «Vídeos e links (config)».
 *
 * Esta rota estava morta e partida ao mesmo tempo: ninguém a chamava, e a query pedia uma coluna
 * (`content_config`) e uma chave (`key`) que a tabela `admin_settings` nunca teve — dava sempre
 * erro e devolvia sempre o default. Entretanto o `/mtm` lia a rota de ADMIN, que desde 2026-08-28
 * exige sessão de administrador: um visitante levava 403 e a página caía nos valores do código.
 * Ou seja, tudo o que era editado naquele painel era invisível para quem visita o site.
 *
 * Apagá-la fechava o buraco pelo lado errado — o painel continuaria a escrever para algo que
 * ninguém lê. Foi corrigida (colunas certas) e é agora ela que o `/mtm` consome.
 *
 * Só leitura, e só de conteúdo que já é público (links, vídeos e imagens das páginas). A escrita
 * continua na rota de admin, com `requireAdmin`.
 */
export const revalidate = 60

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "site_content")
      .maybeSingle()

    if (error || !data?.setting_value) return NextResponse.json(defaultContentConfig)

    return NextResponse.json(JSON.parse(data.setting_value as string) as ContentConfig)
  } catch (error) {
    console.error("[PUBLIC_CONTENT_CONFIG_GET]", error)
    return NextResponse.json(defaultContentConfig)
  }
}
