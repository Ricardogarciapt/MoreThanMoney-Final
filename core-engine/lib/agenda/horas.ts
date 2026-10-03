/**
 * AS HORAS LIVRES — a conta, sem base de dados e sem rede.
 *
 * Isto é o coração de uma agenda: dadas as janelas semanais de alguém, o que já está marcado, o que
 * está bloqueado e o que o Google diz estar ocupado, quais são as horas que se podem oferecer.
 *
 * ═══ PORQUE É PURO ═════════════════════════════════════════════════════════════════════════
 *
 * Porque um erro aqui não dá erro: dá uma chamada marcada em cima de outra, ou uma agenda que
 * parece vazia num dia cheio. Nenhuma das duas coisas aparece nos registos — aparece numa pessoa
 * que ficou à espera. Sendo puro, `horas.check.ts` consegue atirar-lhe mudanças de hora, fusos
 * diferentes e marcações sobrepostas sem uma única linha na base.
 *
 * ═══ FUSOS: A PARTE QUE TODA A GENTE ERRA ══════════════════════════════════════════════════
 *
 * As janelas («terça, 15h–18h») estão no fuso DO ANFITRIÃO. As marcações estão em UTC. Entre os
 * dois há duas armadilhas:
 *
 *  1. O fuso não é um número fixo. Lisboa é UTC+0 em Janeiro e UTC+1 em Julho. Somar uma constante
 *     dá uma agenda certa metade do ano — e a metade errada é a que tem mais procura.
 *  2. Nos dias de mudança da hora, um instante local pode não existir (o relógio salta das 1h para
 *     as 2h) ou existir duas vezes. Uma agenda que não conta com isso oferece uma hora que não
 *     chega a acontecer.
 *
 * A saída é não converter à mão: pergunta-se ao próprio sistema (`Intl`) qual era o desvio NAQUELE
 * instante. É o que `instanteDe` faz, e faz duas passagens porque o desvio que se procura depende
 * do instante que se está a calcular — a primeira aproxima, a segunda acerta.
 */

export interface JanelaSemanal {
  /** 0 = domingo … 6 = sábado (igual ao `getDay()` do JavaScript). */
  dia: number
  /** 'HH:MM' no fuso do anfitrião. */
  inicio: string
  fim: string
}

export interface Intervalo {
  inicio: Date
  fim: Date
}

export interface RegrasDoAnfitriao {
  fuso: string
  janelas: JanelaSemanal[]
  duracaoMin: number
  /** Minutos de respiro DEPOIS de cada chamada. */
  intervaloMin: number
  /** Quanto tempo antes é que ainda se pode marcar. */
  antecedenciaHoras: number
  horizonteDias: number
  maxPorDia: number
}

/** O desvio do fuso, em minutos, NAQUELE instante — lido do sistema, não adivinhado. */
function desvioMin(fuso: string, instante: Date): number {
  // 'en-US' com todos os campos numéricos dá uma data que se volta a ler sem ambiguidade.
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const parte of f.formatToParts(instante)) if (parte.type !== 'literal') p[parte.type] = parte.value
  // `hour` pode vir '24' à meia-noite em algumas versões — normaliza-se.
  const hora = p.hour === '24' ? '00' : p.hour
  const comoUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(hora), Number(p.minute), Number(p.second),
  )
  return (comoUtc - instante.getTime()) / 60_000
}

/**
 * O instante UTC de uma hora local. Duas passagens: a primeira usa o desvio de uma aproximação, a
 * segunda confirma-o já no instante certo. É o que faz a conta continuar certa nos dias de mudança
 * da hora, em vez de escorregar sessenta minutos duas vezes por ano.
 */
export function instanteDe(fuso: string, ano: number, mes: number, dia: number, horas: number, minutos: number): Date {
  const comoSeFosseUtc = Date.UTC(ano, mes - 1, dia, horas, minutos, 0)
  const primeiro = new Date(comoSeFosseUtc - desvioMin(fuso, new Date(comoSeFosseUtc)) * 60_000)
  return new Date(comoSeFosseUtc - desvioMin(fuso, primeiro) * 60_000)
}

/** O dia do calendário (ano, mês, dia, e o dia da semana) de um instante, no fuso pedido. */
export function diaNoFuso(fuso: string, instante: Date): { ano: number; mes: number; dia: number; semana: number; chave: string } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const p: Record<string, string> = {}
  for (const parte of f.formatToParts(instante)) if (parte.type !== 'literal') p[parte.type] = parte.value
  const semanas = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const ano = Number(p.year)
  const mes = Number(p.month)
  const dia = Number(p.day)
  return { ano, mes, dia, semana: Math.max(0, semanas.indexOf(p.weekday)), chave: `${p.year}-${p.month}-${p.day}` }
}

/** 'HH:MM' → minutos desde a meia-noite. Devolve `null` quando o texto não serve. */
export function minutosDoRelogio(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto).trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** Duas coisas no tempo tocam-se? Encostadas (o fim de uma é o início da outra) NÃO se tocam. */
export function chocam(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime()
}

/**
 * AS HORAS QUE SE PODEM OFERECER.
 *
 * `ocupado` é tudo junto — marcações nossas, bloqueios à mão e o que o Google disser. São tratados
 * da mesma maneira de propósito: a origem de uma ocupação não muda nada para quem procura uma hora
 * livre, e separá-las dava três caminhos para o mesmo erro.
 *
 * A duração inclui o intervalo ao verificar choques, mas NÃO ao mostrar a hora: quem marca às 15h
 * de uma chamada de 30 minutos vê «15:00», e o que se protege é até às 15:45.
 */
export function horasLivres(p: {
  regras: RegrasDoAnfitriao
  agora: Date
  de: Date
  ate: Date
  ocupado: Intervalo[]
}): Date[] {
  const { regras, agora } = p
  const passo = 15 * 60_000
  const duracaoMs = regras.duracaoMin * 60_000
  const respiroMs = regras.intervaloMin * 60_000

  /**
   * O RESPIRO VALE DOS DOIS LADOS, e a primeira versão disto só o punha a seguir à chamada nova.
   * O resultado era o defeito exacto que o respiro existe para evitar: com uma chamada marcada das
   * 15h00 às 15h30, oferecia-se outra às 15h30 — encostada, sem um minuto entre as duas.
   *
   * Em vez de esticar a chamada nova (que a faria transbordar da janela), estica-se o que JÁ está
   * marcado, quinze minutos para cada lado. Fica simétrico, e é a mesma conta para uma marcação
   * nossa, um bloqueio à mão ou um evento do Google.
   */
  const ocupadoComRespiro = p.ocupado.map((o) => ({
    inicio: new Date(o.inicio.getTime() - respiroMs),
    fim: new Date(o.fim.getTime() + respiroMs),
  }))

  const naoAntesDe = agora.getTime() + regras.antecedenciaHoras * 3_600_000
  const naoDepoisDe = agora.getTime() + regras.horizonteDias * 86_400_000
  const inicioBusca = Math.max(p.de.getTime(), naoAntesDe)
  const fimBusca = Math.min(p.ate.getTime(), naoDepoisDe)
  if (!(inicioBusca < fimBusca)) return []

  // Quantas chamadas já há em cada dia (no fuso do anfitrião), para o tecto diário.
  const porDia = new Map<string, number>()
  for (const o of p.ocupado) {
    const d = diaNoFuso(regras.fuso, o.inicio)
    porDia.set(d.chave, (porDia.get(d.chave) ?? 0) + 1)
  }

  const livres: Date[] = []
  const vistos = new Set<number>()

  // Percorrem-se os DIAS (com uma folga de um dia para trás e para a frente, porque uma janela
  // pode cair de um lado da fronteira do dia noutro fuso), e dentro de cada dia as janelas dele.
  for (let t = inicioBusca - 86_400_000; t <= fimBusca + 86_400_000; t += 86_400_000) {
    const d = diaNoFuso(regras.fuso, new Date(t))
    const janelasDoDia = regras.janelas.filter((j) => Number(j.dia) === d.semana)
    if (!janelasDoDia.length) continue
    if ((porDia.get(d.chave) ?? 0) >= regras.maxPorDia) continue

    let jaNesteDia = porDia.get(d.chave) ?? 0

    for (const janela of janelasDoDia) {
      const abre = minutosDoRelogio(janela.inicio)
      const fecha = minutosDoRelogio(janela.fim)
      if (abre == null || fecha == null || fecha <= abre) continue

      for (let m = abre; m + regras.duracaoMin <= fecha; m += passo / 60_000) {
        if (jaNesteDia >= regras.maxPorDia) break
        const inicio = instanteDe(regras.fuso, d.ano, d.mes, d.dia, Math.floor(m / 60), m % 60)
        const quando = inicio.getTime()
        if (quando < inicioBusca || quando >= fimBusca) continue
        if (vistos.has(quando)) continue

        const alvo = { inicio, fim: new Date(quando + duracaoMs) }
        if (ocupadoComRespiro.some((o) => chocam(alvo, o))) continue

        // A hora tem de caber inteira dentro da janela. O respiro pode transbordar para depois do
        // fim do expediente — a chamada não.
        if (quando + duracaoMs > instanteDe(regras.fuso, d.ano, d.mes, d.dia, Math.floor(fecha / 60), fecha % 60).getTime()) continue

        vistos.add(quando)
        livres.push(inicio)
      }
    }
  }

  return livres.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Quem atende esta chamada.
 *
 * Distribui pelo que tem MENOS marcado no horizonte, e desempata pela ordem. Não é um sorteio: um
 * sorteio distribui por igual no infinito e desequilibra numa semana, que é o prazo que interessa a
 * quem tem de atender. E não é «o primeiro da lista», que era o que punha tudo em cima do dono.
 */
export function escolherAnfitriao<T extends { id: string; ordem: number }>(
  candidatos: T[],
  marcacoesPorAnfitriao: Map<string, number>,
): T | null {
  if (!candidatos.length) return null
  return [...candidatos].sort((a, b) => {
    const ca = marcacoesPorAnfitriao.get(a.id) ?? 0
    const cb = marcacoesPorAnfitriao.get(b.id) ?? 0
    return ca - cb || a.ordem - b.ordem || a.id.localeCompare(b.id)
  })[0]
}
