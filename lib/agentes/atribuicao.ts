/**
 * COMO É QUE O CÓDIGO DE UM AGENTE CHEGA A UMA COMPRA.
 *
 * ═══ O PROBLEMA, MEDIDO ════════════════════════════════════════════════════════════════════
 *
 * A 01/10 a primeira passagem real da equipa mediu 35 € de receita e atribuiu ZERO. Os sete
 * códigos existiam, estavam activos, e tinham zero utilizações: nada no site os aplicava. O motivo
 * escrito em cada venda foi `sem_codigo` — «não há como saber quem as trouxe».
 *
 * Isto não é um detalhe de relatório. A regra de vida julga cada agente por receita menos gasto na
 * janela; com receita zero para todos, ela pára a equipa inteira ao fim das 48 horas, e o motivo
 * em cada linha parece sólido a quem o ler depois. Não terá sido falta de trabalho — terá sido
 * falta de medição. Ver `lib/agentes/receita.ts`.
 *
 * ═══ PORQUE É QUE ISTO NÃO USA O CAMPO DO CUPÃO ════════════════════════════════════════════
 *
 * O reflexo era pôr o código do agente no campo do cupão, que já existe e já é gravado na compra.
 * Não serve, e o motivo custa dinheiro a quem compra:
 *
 * **o checkout só aceita UM cupão.** Campanha e cupão não se somam — vale o maior (ver
 * `descontoQueVale`). Um código de agente é de `type: 'atribuicao'` e vale 0% de desconto. Se ele
 * ocupasse o campo, um cliente que tivesse um código de desconto a sério ficava sem ele: pagava o
 * preço inteiro por ter entrado por um link de agente. O cliente não daria por nada, e nós
 * tínhamos medição a trocar-se por margem do cliente.
 *
 * Por isso o código do agente viaja num campo PRÓPRIO, lado a lado com o cupão. Quem entra por um
 * link de agente e tem um desconto usa os dois, e as duas coisas são gravadas separadas.
 *
 * ═══ A JANELA ══════════════════════════════════════════════════════════════════════════════
 *
 * Quem clica hoje raramente compra hoje. O código guarda-se no browser por 30 dias: menos do que
 * isso perde as vendas que demoram a decidir, e muito mais do que isso dá crédito a um agente por
 * uma compra que já nada tem a ver com o que ele fez.
 */

/** Quanto tempo um código de agente conta depois do clique. */
export const JANELA_DIAS = 30
export const JANELA_MS = JANELA_DIAS * 24 * 60 * 60 * 1000

/** O parâmetro que leva o código no link. Curto porque vai em links partilhados à mão. */
export const PARAMETRO = 'ag'

/** Onde fica guardado no browser. */
export const CHAVE_GUARDADA = 'mtm_agente_atribuicao'

/**
 * Isto parece um código de agente?
 *
 * ═══ O ERRO QUE ISTO EXISTE PARA TRAVAR ════════════════════════════════════════════════════
 *
 * Sem este teste, `?ag=BLACKFRIDAY50` passava um cupão de DESCONTO por um código de agente. O
 * checkout ia buscá-lo à tabela `coupons`, encontrava-o — porque existe mesmo — e gravava-o como
 * atribuição. A partir daí a receita de uma campanha de descontos era creditada a um agente que
 * não fez nada, e a regra de vida salvava-o com dinheiro que não era dele.
 *
 * A forma é a convenção da casa: `AG-` para os sub-agentes, `CEO-` para o topo. Nada mais entra.
 */
export function pareceCodigoDeAgente(codigo: unknown): boolean {
  const c = String(codigo ?? '').trim().toUpperCase()
  return /^(AG|CEO)-[A-Z0-9]{2,24}$/.test(c)
}

/**
 * Pontuação que vem colada ao código quando ele chega de um link escrito no meio de uma frase.
 *
 * ═══ O CASO MAU, QUE SÓ APARECE DEPOIS DE PUBLICADO ════════════════════════════════════════
 *
 * O código vai no FIM do endereço (`…/register?ag=AG-SAAS`), e numa legenda de Instagram esse
 * endereço está dentro de uma frase que acaba em ponto: `…/register?ag=AG-SAAS.`. Quem auto-liga
 * o texto — a rede social, o cliente de email, a pessoa que copia e cola — pode levar o ponto
 * para dentro da ligação. O browser abre a página (o caminho está certo), a pessoa vê o que veio
 * ver, e `ag` chega como `AG-SAAS.`: a forma falha, a atribuição desaparece, e não há erro em
 * sítio nenhum. Depois a regra de vida pára o agente por receita zero.
 *
 * Cortar esta pontuação NÃO afrouxa a guarda: o teste de forma continua ancorado nos dois lados e
 * continua a recusar `BLACKFRIDAY50`. O que muda é só que um ponto final deixa de custar um
 * agente. Ver `lib/agentes/marca-conteudo.ts`, que é quem escreve estes links.
 */
const PONTUACAO_COLADA = '.,;:!?)]}>"\'»'

/** A forma normalizada. Um sítio só, para o link, o browser e a base escreverem igual. */
export function normalizar(codigo: unknown): string | null {
  let c = String(codigo ?? '').trim().toUpperCase()
  while (c.length > 0 && PONTUACAO_COLADA.includes(c[c.length - 1])) c = c.slice(0, -1)
  return pareceCodigoDeAgente(c) ? c : null
}

export interface Guardado {
  codigo: string
  /** Milissegundos desde a época, de quando o clique aconteceu. */
  em: number
}

/**
 * O que se deve guardar depois de alguém chegar por um link.
 *
 * **O ÚLTIMO CLIQUE GANHA**, e é uma escolha, não um acidente. A alternativa — o primeiro ganha —
 * premiava quem apanhasse a pessoa primeiro mesmo que outro agente tivesse feito o trabalho que a
 * decidiu. Com o último, o crédito vai para quem trouxe a pessoa da vez que ela comprou.
 *
 * Devolve `null` quando não há nada a guardar, para quem chama não escrever lixo por cima do que
 * já lá estava: um link SEM código não apaga a atribuição de um clique anterior que ainda vale.
 */
export function oQueGuardar(doLink: unknown, agoraMs: number): Guardado | null {
  const c = normalizar(doLink)
  return c ? { codigo: c, em: agoraMs } : null
}

/**
 * O código que vale AGORA, dado o que está guardado.
 *
 * Fora da janela devolve `null`: um clique de há três meses não credita a compra de hoje. É aqui
 * que a janela se aplica, e não na gravação — assim um código guardado continua legível para o
 * painel poder dizer «havia um, mas já expirou» em vez de parecer que nunca existiu.
 */
export function codigoQueVale(guardado: Guardado | null | undefined, agoraMs: number): string | null {
  const c = normalizar(guardado?.codigo)
  if (!c) return null
  const em = Number(guardado?.em)
  if (!Number.isFinite(em) || em <= 0) return null
  // Um `em` no futuro é relógio trocado, não um clique válido. Trata-se como inválido em vez de
  // dar uma janela eterna a quem mexer na hora da máquina.
  if (em > agoraMs + 60_000) return null
  return agoraMs - em <= JANELA_MS ? c : null
}

/** O link de um agente para uma página qualquer do site. */
export function linkDoAgente(origem: string, caminho: string, codigo: string): string {
  const base = String(origem ?? '').trim().replace(/\/+$/, '')
  const c = normalizar(codigo)
  const p = `/${String(caminho ?? '').trim().replace(/^\/+/, '')}`
  if (!c) return `${base}${p}`
  const sep = p.includes('?') ? '&' : '?'
  return `${base}${p}${sep}${PARAMETRO}=${encodeURIComponent(c)}`
}
