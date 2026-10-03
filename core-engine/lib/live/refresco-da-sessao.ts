/**
 * QUANDO É QUE SE VOLTA A PERGUNTAR PELA SESSÃO — e quando é que NÃO se toca no leitor.
 *
 * ═══ O DEFEITO QUE ISTO EXISTE PARA CORRIGIR ═══════════════════════════════════════════════
 *
 * No separador Aulas, quem abria uma aula GRAVADA via o vídeo a ser interrompido de poucos em
 * poucos segundos. A causa eram duas coisas somadas:
 *
 *  1. **A cadência estava ao contrário.** O código dizia `isLive ? 15000 : 5000` — ou seja,
 *     perguntava MAIS depressa quando NÃO estava ao vivo. E pior: lia o `is_live` de
 *     `window.__mtm_state`, um objecto que não existe em lado nenhum do repositório. Como nunca
 *     existiu, `isLive` era sempre falso e a cadência era sempre a de **5 segundos** — a mais
 *     rápida das duas, aplicada justamente ao caso em que nada muda.
 *
 *  2. **Substituía-se a sessão inteira a cada volta.** `setStream(novo)` punha lá um objecto
 *     novo mesmo quando nada tinha mudado, e o que vive por baixo — o leitor de HLS, o iframe, a
 *     faixa de áudio dobrado — volta a montar-se quando o que o alimenta troca de identidade.
 *
 * Uma gravação NÃO MUDA. Perguntar por ela de cinco em cinco segundos não traz informação
 * nenhuma; só interrompe quem está a ver. Por isso aqui a resposta para uma gravação é «não
 * perguntes mais»: `null`, e não um número grande.
 *
 * ═══ PORQUE É QUE ISTO É UM MÓDULO E NÃO TRÊS LINHAS NO COMPONENTE ═════════════════════════
 *
 * Porque erra em silêncio. Nada disto dá erro: a página funciona, os dados chegam, e o defeito
 * aparece como «o vídeo salta», que é o tipo de coisa que se atribui à rede. Um `window.__mtm_state`
 * que não existe sobreviveu precisamente por isso — `(window as any)` cala o compilador, e o ramo
 * morto continuou a decidir a cadência durante meses.
 */

/** O que basta saber da sessão para decidir a cadência. */
export interface EstadoDaSessao {
  /** `true` enquanto o educador está a transmitir. */
  aoVivo: boolean
  /** Há uma gravação a ser vista (`playback_url` ou HLS de gravação)? */
  temGravacao: boolean
}

/** De quanto em quanto tempo se volta a perguntar. `null` = não se pergunta mais. */
export function cadenciaDeRefresco(estado: EstadoDaSessao): number | null {
  // Ao vivo muda: o educador pode terminar, mudar o título, acabar a emissão. 20s chega — o chat
  // tem a sua própria sondagem, bem mais rápida, e é dele que vem a sensação de «está vivo».
  if (estado.aoVivo) return 20_000
  // Gravação não muda. Perguntar outra vez só serve para interromper quem está a ver.
  if (estado.temGravacao) return null
  // Nem ao vivo nem gravação: a sala está à espera de começar. Vale a pena saber quando começa,
  // sem pressa — é o único caso em que a espera é o próprio conteúdo.
  return 30_000
}

/**
 * O que muda numa sessão merece substituir o objecto que alimenta o leitor?
 *
 * Só os campos que mandam no que se vê. Se mudar um contador de espectadores ou uma data de
 * actualização, o leitor NÃO pode ser tocado: remontá-lo volta o vídeo ao início, e para quem
 * está a ver é indistinguível de uma avaria.
 */
const CAMPOS_QUE_MANDAM = ['id', 'is_live', 'playback_url', 'hls_manifest_url', 'title', 'status'] as const

export type SessaoComparavel = Partial<Record<(typeof CAMPOS_QUE_MANDAM)[number], unknown>> | null | undefined

export function mudouOQueImporta(anterior: SessaoComparavel, novo: SessaoComparavel): boolean {
  // Aparecer ou desaparecer é sempre mudança — e tem de ser tratado antes de se lerem campos.
  if (!anterior || !novo) return Boolean(anterior) !== Boolean(novo)
  for (const campo of CAMPOS_QUE_MANDAM) {
    // Comparação frouxa de nulidade de propósito: `null` e `undefined` vindos da API são a mesma
    // ausência, e tratá-los como diferentes fazia o leitor remontar a cada volta — que é
    // exactamente o defeito que este módulo existe para fechar.
    const a = anterior[campo] ?? null
    const b = novo[campo] ?? null
    if (a !== b) return true
  }
  return false
}

/**
 * A sessão que deve ficar no estado: a ANTIGA quando nada do que importa mudou, para a identidade
 * do objecto se manter e o leitor não ser tocado. Devolve-se o objecto, não um booleano, porque é
 * assim que quem chama não tem de repetir a decisão — e repetir é como as duas versões divergem.
 */
export function sessaoAGuardar<T extends SessaoComparavel>(anterior: T, novo: T): T {
  return mudouOQueImporta(anterior, novo) ? novo : anterior
}
