/**
 * QUEM PODE ENTREGAR PREÇOS — e a prova de que o corpo do pedido não foi mexido.
 *
 * Um endpoint que aceita cotações e um `Bearer` fixo é um endpoint que qualquer pessoa com esse
 * token (um log, um histórico de shell, um proxy) usa para mover stops nossos. Por isso:
 *
 *  · cada fonte tem o SEU segredo (`mac-ricardo`, `vps`, …) e um segredo não serve outra fonte;
 *  · o que se assina é o CORPO INTEIRO, e o corpo traz dentro a fonte, o número de sequência e a
 *    hora — assim não se pode reetiquetar um lote válido nem trocar-lhe os preços;
 *  · a assinatura é HMAC-SHA256 comparada em tempo constante (`timingSafeEqual`): uma comparação
 *    normal com `===` deixa medir o segredo byte a byte;
 *  · a hora tem de estar dentro de uma janela curta e a sequência tem de SUBIR. Sem isto, gravar
 *    um lote legítimo e reenviá-lo mais tarde era um preço velho entregue como novo — que é
 *    exactamente o ataque mais barato contra quem decide por frescura.
 *
 * O que NÃO se faz aqui: TLS. Isso é do nginx (stream.morethanmoney.pt, já com certificado). A
 * assinatura existe por cima do TLS porque o que ela protege não é a escuta, é a AUTORIA.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** A janela em que um lote é aceitável, para os dois lados (relógios nunca batem ao ms). */
export const JANELA_MS = 30_000

export function assinar(segredo: string, corpo: string): string {
  return createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex')
}

/** Comparação em tempo constante de duas assinaturas hex. Comprimentos diferentes → falso. */
export function conferirAssinatura(segredo: string, corpo: string, dada: string): boolean {
  const esperada = assinar(segredo, corpo)
  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from((dada ?? '').trim().toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** O cabeçalho que vem DENTRO do corpo assinado. */
export interface Lote {
  fonte: string
  /** sobe sempre; o receptor só aceita maior do que o último visto */
  seq: number
  /** hora do agente quando fechou o lote, em ms */
  em: number
  /** true = fotografia completa (repõe o retrato); false/ausente = só o que mudou */
  cheio?: boolean
  /**
   * O desvio da hora da CORRETORA desta fonte face a UTC, em ms (ver lib/precos-entrada/desvio.ts).
   * Vai dentro do corpo assinado de propósito: é uma declaração que o receptor confere e aplica, e
   * ninguém a pode mexer a caminho. Ausente = 0 (corretora já à hora de Greenwich).
   */
  desvioMs?: number
  /** quantas medições sustentam o desvio declarado — só para se VER no estado */
  desvioMedicoes?: number
  p: unknown
}

export type VeredictoLote = { ok: true } | { ok: false; razao: string }

/**
 * O lote é aceitável, antes de se olhar para um único preço?
 *
 * Três coisas, e a ORDEM entre elas é o que interessa:
 *
 *  1. a hora do lote tem de estar dentro da janela do relógio DESTE lado — e este relógio não é de
 *     quem envia, o que torna a janela o limite de tudo o que se segue;
 *  2. a hora não pode RECUAR face ao último lote aceite: um lote gravado e reenviado traz a hora de
 *     quando foi gravado, e por aí não volta a entrar;
 *  3. dentro do mesmo milissegundo, decide a sequência.
 *
 * Porque não é só a sequência (era, e estava mal): um lote com um `seq` absurdamente alto — um
 * relógio que salta com o NTP, ou alguém com o segredo a fazê-lo de propósito — trancava o agente
 * legítimo PARA SEMPRE, porque nada dele voltava a ser «maior». Numa peça que existe para ser
 * redundância, um bloqueio permanente é a pior falha possível. Com a hora a mandar, o pior caso é
 * ficar de fora enquanto a janela não passar, e depois recompõe-se sozinho.
 *
 * `ultimoEm`/`ultimoSeq` = os do último lote aceite desta fonte (0 se é o primeiro). Um receptor que
 * reinicia começa em 0 e aceita o lote seguinte — o agente não tem de saber que o outro lado
 * reiniciou.
 */
export function aceitarLote(
  l: Lote,
  agora: number,
  ultimoSeq: number,
  janelaMs: number = JANELA_MS,
  ultimoEm = 0,
): VeredictoLote {
  if (!l || typeof l.fonte !== 'string' || !l.fonte.trim()) return { ok: false, razao: 'fonte' }
  if (!Number.isFinite(l.seq) || l.seq <= 0) return { ok: false, razao: 'seq' }
  if (!Number.isFinite(l.em)) return { ok: false, razao: 'em' }
  if (Math.abs(agora - l.em) > janelaMs) return { ok: false, razao: 'fora da janela' }
  if (l.em < ultimoEm) return { ok: false, razao: 'em recuado' }
  if (l.em === ultimoEm && l.seq <= ultimoSeq) return { ok: false, razao: 'seq repetida' }
  if (!Array.isArray(l.p)) return { ok: false, razao: 'p' }
  return { ok: true }
}

/** Nome de fonte → segredo, lido de `PRECOS_ENTRADA_FONTES=mac-ricardo:segredo,outra:segredo`. */
export function lerFontes(texto: string | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const par of (texto ?? '').split(',')) {
    const i = par.indexOf(':')
    if (i <= 0) continue
    const nome = par.slice(0, i).trim()
    const segredo = par.slice(i + 1).trim()
    // Segredos curtos não são segredos: 32 caracteres é o mínimo para isto não ser adivinhável.
    if (nome && segredo.length >= 32) m.set(nome, segredo)
  }
  return m
}
