import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { defaultContentConfig, type ContentConfig } from "@/lib/content-config"
import { comTecto, TECTO_PAGINA_MS } from "@/lib/com-tecto"

/**
 * A leitura PÚBLICA da config de vídeos/links/imagens (admin_settings.site_content).
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
 * Só leitura, e só de conteúdo que já é público (links, vídeos e imagens das páginas).
 *
 * 2026-09-16: o cartão «Vídeos e links (config)» e a rota /api/admin/content-config foram removidos
 * (nenhuma entrada tinha page='/mtm', por isso nada do que lá estava chegava ao site; cópia em
 * docs/arquivo/content-config-2026-09-16.json). Esta rota fica porque o /mtm ainda a lê — sem ela o
 * /mtm só perdia os extras, mas pedia um 404 a cada visita. A única escrita que resta é a da API do
 * agente (/api/agent/v1/content-config).
 */
export const revalidate = 60

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    /**
     * TECTO. Com `revalidate = 60` esta rota é pré-gerada DURANTE A COMPILAÇÃO — e a 25/09 foi ela
     * que fez o deploy do site inteiro falhar:
     *
     *   Failed to build /api/public/content-config after 3 attempts (>60s cada)
     *   Export encountered an error, exiting the build.
     *
     * Com a base de dados lenta, a leitura não voltava, o Next desistia aos 60s e não havia forma
     * de publicar nada — nem as correcções para o próprio problema. O recuo é o mesmo que já
     * existia para erro e para linha vazia: a configuração por omissão.
     */
    const { data, error } = await comTecto(
      supabase
        .from("admin_settings")
        .select("setting_value")
        .eq("setting_key", "site_content")
        .maybeSingle()
        .then((r) => ({ data: r.data, error: r.error })),
      { data: null, error: null },
      TECTO_PAGINA_MS,
    )

    if (error || !data?.setting_value) return NextResponse.json(defaultContentConfig)

    return NextResponse.json(JSON.parse(data.setting_value as string) as ContentConfig)
  } catch (error) {
    console.error("[PUBLIC_CONTENT_CONFIG_GET]", error)
    return NextResponse.json(defaultContentConfig)
  }
}
