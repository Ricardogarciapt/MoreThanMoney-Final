/**
 * A GUARDA DO AGENTE TRADER.
 *
 *   npx tsx lib/agentes/trader.check.ts
 *
 * Duas decisões vivem aqui, e as duas erram em silêncio:
 *
 *  · **o portão de segurança.** Se ele deixar passar uma conta que já não é papel, este agente
 *    manda ordens com dinheiro real. Não há erro no ecrã — há uma posição aberta numa corretora.
 *    É o limite nº 3 do dono, e é o primeiro bloco deste ficheiro;
 *  · **a escolha de sinais.** Abrir duas vezes o mesmo sinal, ou abrir um de ontem ao preço de
 *    hoje, não rebenta: estraga a medição, que é o único produto desta conta.
 */
import {
  CONTA_PAPEL_LOGIN,
  PREFIXO_CHAVE,
  chaveDoAgente,
  FRESCURA_MINUTOS,
  MAX_ABERTAS,
  MAX_POR_SIMBOLO,
  TECTO_POR_PASSAGEM,
  contaSegura,
  decidirOperacoes,
  type AbertaDoTrader,
  type ContaDoTrader,
  type SinalDoTrader,
} from './trader'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-10-03T12:00:00Z')
const haMinutos = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString()

/** A conta como ela está HOJE na base — verificado a 01/10/2026 antes de se escrever uma linha. */
const contaBoa = (p: Partial<ContaDoTrader> = {}): ContaDoTrader => ({
  id: '52070492-d269-48e8-96e5-334e8064d305',
  mt5_login: CONTA_PAPEL_LOGIN,
  motor: 'sim',
  metaapi_account_id: null,
  estado: 'ativa',
  sim_saldo: 1076.27,
  pausada_em: null,
  ...p,
});
// O ponto e vírgula acima não é estilo: sem ele, `=> ({…})` seguido do bloco `{` de um teste faz o
// parser do TypeScript ler o objecto como lista de parâmetros de outra arrow — e o ficheiro deixa
// de compilar com «Identifier expected». Um formatador que o apague parte o build.

/**
 * ═══ O PORTÃO ═══════════════════════════════════════════════════════════════
 *
 * O caso bom tem de passar — um portão que recusa tudo é tão inútil como um que aceita tudo.
 */
{
  const r = contaSegura(contaBoa())
  teste('a conta de papel real passa', r.seguro)
  teste('e diz porque é que é papel', r.porque.includes("motor='sim'") && r.porque.includes('sem MetaApi'))
}

/**
 * ── O CASO QUE ESTE PORTÃO EXISTE PARA APANHAR ──────────────────────────────
 *
 * A conta passou a real, ou foi ligada à MetaApi. Nenhuma das duas coisas muda este código — muda
 * uma linha na base de dados. Por isso é que isto se verifica a cada passagem e não uma vez.
 */
{
  const real = contaSegura(contaBoa({ motor: 'real' }))
  teste("motor='real' NÃO passa", !real.seguro)
  teste('e manda parar em maiúsculas', real.porque.includes('PARAR'))
  teste('e manda avisar o Ricardo', real.porque.includes('Ricardo'))

  const comCorretora = contaSegura(contaBoa({ metaapi_account_id: 'abc-123' }))
  teste('com metaapi_account_id NÃO passa', !comCorretora.seguro)
  teste('e diz que há dinheiro real', comCorretora.porque.includes('dinheiro real'))
  teste('e identifica a conta ligada', comCorretora.porque.includes('abc-123'))

  // As duas ao mesmo tempo, que é o cenário mais provável de uma conversão a sério.
  teste('motor real E metaapi não passa', !contaSegura(contaBoa({ motor: 'real', metaapi_account_id: 'x' })).seguro)
}

/**
 * ── O PORTÃO DIZ «NÃO» POR OMISSÃO ──────────────────────────────────────────
 *
 * Qualquer campo em falta, vazio ou inesperado trava. Um portão que deixa passar o que não
 * reconhece não é um portão — e um `motor` que venha nulo depois de uma migração é exactamente o
 * tipo de coisa que acontece.
 */
{
  teste('conta nula não passa', !contaSegura(null).seguro)
  teste('conta indefinida não passa', !contaSegura(undefined).seguro)
  teste('motor vazio não passa', !contaSegura(contaBoa({ motor: '' })).seguro)
  teste('motor nulo não passa', !contaSegura(contaBoa({ motor: null })).seguro)
  teste('metaapi com espaços em branco passa', contaSegura(contaBoa({ metaapi_account_id: '   ' })).seguro)
  teste('estado inactivo não passa', !contaSegura(contaBoa({ estado: 'quebrada' })).seguro)
  teste('estado vazio não passa', !contaSegura(contaBoa({ estado: '' })).seguro)
  teste('conta pausada pelo admin não passa', !contaSegura(contaBoa({ pausada_em: haMinutos(10) })).seguro)

  /**
   * O engano mais fácil de todos: apontar isto à conta errada. Um login diferente é recusado
   * mesmo que seja uma conta simulada perfeitamente válida — este agente tem UMA conta.
   */
  const outra = contaSegura(contaBoa({ mt5_login: '99999999' }))
  teste('outra conta simulada não passa', !outra.seguro)
  teste('e diz qual esperava', outra.porque.includes(CONTA_PAPEL_LOGIN))
  teste('login vazio não passa', !contaSegura(contaBoa({ mt5_login: '' })).seguro)

  // `'SIM'` em maiúsculas é o mesmo motor — não se perde a conta por causa de capitalização.
  teste("motor 'SIM' é aceite", contaSegura(contaBoa({ motor: 'SIM' })).seguro)
}

/**
 * ═══ A ESCOLHA DE SINAIS ════════════════════════════════════════════════════
 */
const sinal = (p: Partial<SinalDoTrader> = {}): SinalDoTrader => ({
  chave: 'sensei:s1', estrategia: 'sensei', symbol: 'XAUUSD', direcao: 'buy',
  entrada: 2650, sl: 2640, tps: [2660], criadoEm: haMinutos(2), ...p,
}); // ver a nota sobre o ponto e vírgula em `contaBoa`

// ── O caso bom ──────────────────────────────────────────────────────────────
{
  const d = decidirOperacoes({ sinais: [sinal()], abertas: [], agora: AGORA })
  teste('um sinal fresco com SL abre', d[0].abrir)
  teste('e o motivo diz o que vai abrir', d[0].porque.includes('XAUUSD'))
  teste('sem motivo de recusa', d[0].motivo === null)
}

/**
 * ── SEM STOP LOSS NÃO SE ABRE ───────────────────────────────────────────────
 * Numa conta de papel não parte nada; mas a medição que sai de uma posição sem SL não se parece
 * com nada que se possa fazer a sério, e a medição é o único produto desta conta.
 */
{
  teste('sinal sem SL não abre', !decidirOperacoes({ sinais: [sinal({ sl: null })], abertas: [], agora: AGORA })[0].abrir)
  teste('SL ilegível não abre', !decidirOperacoes({ sinais: [sinal({ sl: Number.NaN })], abertas: [], agora: AGORA })[0].abrir)
  teste('e o motivo é sem_sl', decidirOperacoes({ sinais: [sinal({ sl: null })], abertas: [], agora: AGORA })[0].motivo === 'sem_sl')
}

/**
 * ── UM SINAL VELHO NÃO SE ABRE ──────────────────────────────────────────────
 * Entrar hoje num sinal de ontem é entrar a um preço onde ninguém entrou — e depois publicar isso
 * como desempenho. A casa já foi mordida por entradas melhores do que o mercado ofereceu.
 */
{
  teste('sinal velho não abre',
    !decidirOperacoes({ sinais: [sinal({ criadoEm: haMinutos(FRESCURA_MINUTOS + 5) })], abertas: [], agora: AGORA })[0].abrir)
  teste('à beira do limite ainda abre',
    decidirOperacoes({ sinais: [sinal({ criadoEm: haMinutos(FRESCURA_MINUTOS - 1) })], abertas: [], agora: AGORA })[0].abrir)

  // Data ilegível conta como velha: na dúvida não se abre.
  teste('data ilegível não abre', !decidirOperacoes({ sinais: [sinal({ criadoEm: 'ontem' })], abertas: [], agora: AGORA })[0].abrir)
  teste('data vazia não abre', !decidirOperacoes({ sinais: [sinal({ criadoEm: '' })], abertas: [], agora: AGORA })[0].abrir)
}

/**
 * ── O ANTI-DUPLICADO ────────────────────────────────────────────────────────
 *
 * Esta conta JÁ tem quem a alimente (`todos-os-sinais.ts`). Abrir o mesmo sinal outra vez duplicava
 * a posição e estragava a medição — é a razão de ser deste bloco.
 */
{
  const abertas: AbertaDoTrader[] = [{ symbol: 'XAUUSD', direcao: 'buy', chave: 'sensei:s1' }]
  teste('sinal já aberto não reabre', !decidirOperacoes({ sinais: [sinal()], abertas, agora: AGORA })[0].abrir)
  teste('e o motivo é ja_aberto', decidirOperacoes({ sinais: [sinal()], abertas, agora: AGORA })[0].motivo === 'ja_aberto')

  /**
   * O DEFEITO ENCONTRADO NA REVISÃO (01/10): o trader ESCREVIA `agente-trader:sensei:s1` e depois
   * perguntava se já tinha aberto `sensei:s1`. Nunca batia, por isso nunca reconhecia as suas
   * próprias posições.
   *
   * Andou escondido atrás do `MAX_POR_SIMBOLO = 1`, que apanhava a segunda abertura por outro
   * caminho e a registava como «símbolo cheio» — um diagnóstico errado sobre um problema real. No
   * dia em que alguém pusesse esse limite a 2 para permitir reforços, duplicava a sério.
   */
  const comPrefixo: AbertaDoTrader[] = [
    { symbol: 'XAUUSD', direcao: 'buy', chave: chaveDoAgente('sensei:s1') },
  ]
  const r = decidirOperacoes({ sinais: [sinal()], abertas: comPrefixo, agora: AGORA })[0]
  teste('reconhece as SUAS posições, com prefixo', !r.abrir)
  teste('e diz ja_aberto, não simbolo_cheio', r.motivo === 'ja_aberto')
  teste('o prefixo é o mesmo que se escreve', chaveDoAgente('x') === `${PREFIXO_CHAVE}x`)

  // Uma posição de OUTRO escritor, sem prefixo, continua a travar — não se abre por cima de
  // ninguém só porque a chave não é nossa.
  teste('posição alheia também trava',
    !decidirOperacoes({ sinais: [sinal()], abertas: [{ symbol: 'XAUUSD', direcao: 'buy', chave: 'sensei:s1' }], agora: AGORA })[0].abrir)

  // O mesmo sinal duas vezes na MESMA leitura: só uma abre.
  const duas = decidirOperacoes({ sinais: [sinal(), sinal()], abertas: [], agora: AGORA })
  teste('o mesmo sinal repetido na leitura abre uma vez', duas.filter((d) => d.abrir).length === 1)
  teste('e o segundo diz que é repetido', duas.find((d) => !d.abrir)?.motivo === 'repetido_no_lote')
}

/**
 * ── EXPOSIÇÃO: UM POR SÍMBOLO E DIRECÇÃO ────────────────────────────────────
 * Duas compras de XAUUSD ao mesmo tempo é dobrar a aposta, não diversificar.
 */
{
  const abertas: AbertaDoTrader[] = [{ symbol: 'XAUUSD', direcao: 'buy', chave: 'outro:x' }]
  teste('segundo buy no mesmo símbolo não abre',
    !decidirOperacoes({ sinais: [sinal()], abertas, agora: AGORA })[0].abrir)
  teste('e o motivo é simbolo_cheio',
    decidirOperacoes({ sinais: [sinal()], abertas, agora: AGORA })[0].motivo === 'simbolo_cheio')

  // A direcção contrária é outra coisa, e passa.
  teste('o sell contrário abre',
    decidirOperacoes({ sinais: [sinal({ chave: 'sensei:s2', direcao: 'sell' })], abertas, agora: AGORA })[0].abrir)

  // Minúsculas no símbolo são o mesmo símbolo — senão o limite contornava-se com 'xauusd'.
  teste('símbolo em minúsculas conta para o limite',
    !decidirOperacoes({ sinais: [sinal({ chave: 'sensei:s3', symbol: 'xauusd' })], abertas, agora: AGORA })[0].abrir)
}

// ── A conta cheia ───────────────────────────────────────────────────────────
{
  const cheia: AbertaDoTrader[] = Array.from({ length: MAX_ABERTAS }, (_, i) => ({
    symbol: `SIM${i}`, direcao: 'buy' as const, chave: `x:${i}`,
  }))
  const d = decidirOperacoes({ sinais: [sinal()], abertas: cheia, agora: AGORA })
  teste('com a conta cheia não abre', !d[0].abrir)
  teste('e o motivo é conta_cheia', d[0].motivo === 'conta_cheia')
}

/**
 * ── O TECTO DA PASSAGEM ─────────────────────────────────────────────────────
 *
 * O travão que faz uma decisão enganada parar no tecto em vez de encher a conta antes de alguém
 * acordar. Dez sinais bons de símbolos diferentes só abrem `TECTO_POR_PASSAGEM`.
 */
{
  const muitos = Array.from({ length: 10 }, (_, i) =>
    sinal({ chave: `sensei:m${i}`, symbol: `PAR${i}`, criadoEm: haMinutos(1 + i) }),
  )
  const d = decidirOperacoes({ sinais: muitos, abertas: [], agora: AGORA })
  teste('o tecto da passagem corta', d.filter((x) => x.abrir).length === TECTO_POR_PASSAGEM)
  teste('e os cortados dizem porquê', d.some((x) => x.motivo === 'tecto_da_passagem'))

  /**
   * E corta os MAIS VELHOS: os recentes decidem-se primeiro, porque o preço deles é o menos
   * estragado. Sem a ordenação, o tecto deixava passar o sinal mais antigo por acaso da leitura.
   */
  const abertos = d.filter((x) => x.abrir).map((x) => x.sinal.chave)
  teste('abre os mais recentes', abertos.includes('sensei:m0') && !abertos.includes('sensei:m9'))
}

// ── Dados incompletos ───────────────────────────────────────────────────────
{
  teste('sem símbolo não abre', !decidirOperacoes({ sinais: [sinal({ symbol: '' })], abertas: [], agora: AGORA })[0].abrir)
  teste('direcção inválida não abre',
    !decidirOperacoes({ sinais: [sinal({ direcao: 'talvez' as unknown as 'buy' })], abertas: [], agora: AGORA })[0].abrir)
  teste('e o motivo é dados_incompletos',
    decidirOperacoes({ sinais: [sinal({ symbol: '' })], abertas: [], agora: AGORA })[0].motivo === 'dados_incompletos')
}

// ── Nada não rebenta ────────────────────────────────────────────────────────
{
  teste('sem sinais não decide nada', decidirOperacoes({ sinais: [], abertas: [], agora: AGORA }).length === 0)
  teste('toda a decisão traz motivo escrito',
    decidirOperacoes({ sinais: [sinal(), sinal({ chave: 'x:2', sl: null })], abertas: [], agora: AGORA })
      .every((d) => d.porque.length > 10))
}

// ── Os limites são os declarados ────────────────────────────────────────────
{
  teste('um por símbolo e direcção', MAX_POR_SIMBOLO === 1)
  teste('o tecto da passagem é menor que o máximo de abertas', TECTO_POR_PASSAGEM < MAX_ABERTAS)
  teste('a conta é a 77549217', CONTA_PAPEL_LOGIN === '77549217')
}

if (falhas.length) {
  console.error(`agentes/trader: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/trader: o portão trava motor real e MetaApi, e nada abre duas vezes nem fora de prazo ✓',
)
