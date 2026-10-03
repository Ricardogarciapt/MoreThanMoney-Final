/**
 * AS AUTOMAÇÕES DE SAÍDA DA MESTRE — break-even, trailing stop e «deixar o alvo correr».
 *
 * ═══ PORQUE SÓ ESTAS CINCO CHAVES ═══════════════════════════════════════════════════════════
 *
 * `sinais_config` tem uma dúzia de chaves. Este ficheiro expõe CINCO, e é uma escolha, não um
 * esquecimento: são as cinco que a auditoria de 29/09 provou serem lidas E aplicadas no caminho
 * sinal → mestre (`lib/mtmfunded/estrategias-sinais/calculo.ts:320-331` → `gestaoDoSinal` → o motor
 * simulado do VPS, que move o SL a sério em `lib/mtmfunded/simulado/avancadas.ts:257,270`).
 *
 * As que ficaram de fora ficaram de propósito:
 *  · `trailing_passo_pips` — lida e descartada: `avancadas.ts:99` impõe max(pip, distância/10);
 *  · `be_gatilho` (coluna) — tem dois sentidos na casa («TP nº N» e «pips») e o caminho da mestre
 *    ignora-a de propósito (`calculo.ts:315-317`);
 *  · `perfil`, `modo`, `amostraFina` — etiquetas, sem motor;
 *  · `lotePor1000`, `saidasFracaoDoRisco` — mexem no LOTE e nas parciais, não nas saídas de
 *    protecção; têm dono noutro ecrã e passá-las por aqui era dar-lhes uma segunda porta.
 *
 * Um editor que mostrasse as doze sugeria que as doze funcionam. É o defeito que se estava a
 * corrigir, não a repetir.
 *
 * ═══ PORQUE É EM FRACÇÃO DO RISCO E NÃO EM PIPS ═════════════════════════════════════════════
 *
 * «BE aos 30 pips» quer dizer coisas diferentes num sinal com stop de 20 pips e num com stop de 200:
 * no primeiro é lucro a mais de um risco, no segundo é ruído. Em fracção do risco a mesma regra
 * serve o ouro e o forex sem se reescrever por símbolo — e é assim que o GoldKiller e o Aurum Flow
 * já estão configurados hoje (`beFracaoDoRisco: 0.3` / `1.25`).
 *
 * Puro. Testado em `lib/copia-contas/__tests__/mestre-travas.check.ts`.
 */

export interface GestaoMestre {
  /** BE quando o lucro atinge N × o risco inicial. 1,0 = lucro igual ao risco. */
  beFracaoDoRisco: number | null
  /** folga do BE (entrada + taxas), em fracção do risco. */
  beOffsetFracaoDoRisco: number | null
  /** o trailing arranca a N × o risco de lucro. */
  trailingInicioFracaoDoRisco: number | null
  /** distância a que o SL segue, em fracção do risco. */
  trailingFracaoDoRisco: number | null
  /** true = fecha no TP fixo, sem trailing. false = o alvo flutua atrás da tendência. */
  semTrailing: boolean
}

export const GESTAO_VAZIA: GestaoMestre = {
  beFracaoDoRisco: null, beOffsetFracaoDoRisco: null,
  trailingInicioFracaoDoRisco: null, trailingFracaoDoRisco: null, semTrailing: false,
}

/** As chaves, tal e qual como vivem no jsonb. */
export const CHAVES_GESTAO = [
  'beFracaoDoRisco', 'beOffsetFracaoDoRisco', 'trailingInicioFracaoDoRisco', 'trailingFracaoDoRisco',
] as const

/**
 * Limites de sanidade. Não são gosto: um BE a 0,05 do risco põe o stop na entrada antes de a trade
 * respirar e fecha-a em BE por ruído — foi o que motivou o `beFracaoDoRisco: 0.3` do GoldKiller em
 * vez de um número mais pequeno. E acima de 10 riscos o BE nunca chega, o que é o mesmo que não ter.
 */
export const LIMITES_GESTAO: Record<(typeof CHAVES_GESTAO)[number], { min: number; max: number }> = {
  beFracaoDoRisco: { min: 0.1, max: 10 },
  beOffsetFracaoDoRisco: { min: 0.01, max: 1 },
  trailingInicioFracaoDoRisco: { min: 0.1, max: 20 },
  trailingFracaoDoRisco: { min: 0.1, max: 10 },
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** O jsonb → as cinco chaves. Fora dos limites conta como NÃO configurado (nunca como o limite). */
export function lerGestaoMestre(sinaisConfig: unknown): GestaoMestre {
  const c = sinaisConfig && typeof sinaisConfig === 'object' ? (sinaisConfig as Record<string, unknown>) : {}
  const dentro = (k: (typeof CHAVES_GESTAO)[number]): number | null => {
    const n = num(c[k])
    if (n == null) return null
    const l = LIMITES_GESTAO[k]
    // Um valor fora dos limites é configuração que o motor não vai honrar como o ecrã a mostra.
    // Lê-se como ausente, para o ecrã não prometer uma regra que o motor arredonda por sua conta.
    return n >= l.min && n <= l.max ? n : null
  }
  return {
    beFracaoDoRisco: dentro('beFracaoDoRisco'),
    beOffsetFracaoDoRisco: dentro('beOffsetFracaoDoRisco'),
    trailingInicioFracaoDoRisco: dentro('trailingInicioFracaoDoRisco'),
    trailingFracaoDoRisco: dentro('trailingFracaoDoRisco'),
    semTrailing: c.semTrailing === true,
  }
}

export interface ErroGestao { campo: string; erro: string }

/**
 * O que o browser pediu → as chaves a fundir no jsonb, ou os erros.
 *
 * `undefined` = não foi tocado e MANTÉM o que estava. `null`/`''` = apagar aquela chave. A diferença
 * importa: gravar o formulário inteiro apagava afinações que o admin não abriu, que é como um stop
 * mínimo desaparece e a estratégia deixa de abrir (o defeito que `normalizarOpcoes` já documenta).
 */
export function normalizarGestaoMestre(
  pedido: Record<string, unknown>,
  antes: unknown,
): { ok: true; chaves: Record<string, unknown> } | { ok: false; erros: ErroGestao[] } {
  const base = lerGestaoMestre(antes)
  const erros: ErroGestao[] = []
  const chaves: Record<string, unknown> = {}

  for (const k of CHAVES_GESTAO) {
    if (!Object.prototype.hasOwnProperty.call(pedido, k)) {
      if (base[k] != null) chaves[k] = base[k]
      continue
    }
    const v = pedido[k]
    if (v == null || v === '') continue // apagar: a chave não vai no jsonb
    const n = Number(v)
    const l = LIMITES_GESTAO[k]
    if (!Number.isFinite(n)) { erros.push({ campo: k, erro: `${k}: tem de ser um número.` }); continue }
    if (n < l.min || n > l.max) { erros.push({ campo: k, erro: `${k}: entre ${l.min} e ${l.max}.` }); continue }
    chaves[k] = n
  }

  const semTrailing = Object.prototype.hasOwnProperty.call(pedido, 'semTrailing') ? pedido.semTrailing === true : base.semTrailing
  if (semTrailing) chaves.semTrailing = true

  /**
   * A folga do BE tem de ser MENOR do que o gatilho. Com a folga maior, o «break-even» punha o stop
   * acima do lucro já alcançado — a corretora recusa a modificação, ou pior, aceita-a e fecha a trade
   * na hora. É a mesma regra que `validarGestao` impõe no WebTrader, repetida aqui porque este
   * caminho não passa por lá.
   */
  const gat = chaves.beFracaoDoRisco as number | undefined
  const off = chaves.beOffsetFracaoDoRisco as number | undefined
  if (gat != null && off != null && off >= gat) {
    erros.push({ campo: 'beOffsetFracaoDoRisco', erro: `a folga do BE (${off}) tem de ser menor do que o gatilho (${gat}).` })
  }

  /**
   * O trailing não pode arrancar ANTES do break-even. Se arrancasse, o stop começava a seguir o preço
   * enquanto ainda estava no prejuízo — e um trailing que aperta um stop ainda negativo transforma
   * uma trade com espaço numa perda pequena e certa, sem nunca chegar ao BE.
   */
  const ini = chaves.trailingInicioFracaoDoRisco as number | undefined
  if (gat != null && ini != null && ini < gat) {
    erros.push({ campo: 'trailingInicioFracaoDoRisco', erro: `o trailing arranca a ${ini} riscos, antes do break-even (${gat}) — o stop apertava ainda no prejuízo.` })
  }

  return erros.length ? { ok: false, erros } : { ok: true, chaves }
}

/** «BE a 1,25× o risco · folga 0,1 · trailing a 2× a 1,25 de distância» — para a auditoria e o ecrã. */
export function textoDaGestao(g: GestaoMestre): string {
  const n = (v: number | null) => (v == null ? '—' : String(v).replace('.', ','))
  if (g.semTrailing) return `BE a ${n(g.beFracaoDoRisco)}× (folga ${n(g.beOffsetFracaoDoRisco)}) · SEM trailing: fecha no alvo fixo`
  return `BE a ${n(g.beFracaoDoRisco)}× (folga ${n(g.beOffsetFracaoDoRisco)}) · trailing arranca a ${n(g.trailingInicioFracaoDoRisco)}× e segue a ${n(g.trailingFracaoDoRisco)}×`
}
