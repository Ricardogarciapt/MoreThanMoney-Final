/**
 * Os dados da corretora: ler o export da PU Prime, saber se ainda valem, e dizer quem não casa.
 *
 * Porque é que isto existe (medido a 2026-09-24): o `broker_clients` tinha 59 clientes, 58 deles
 * lidos a 2026-07-20 — 66 dias antes — e com `deposits_usd` a zero em 58 dos 59. Como o acesso se
 * concede exigindo depósito E saldo acima do mínimo, com a coluna dos depósitos a zero a condição
 * era impossível de cumprir: a rota da corretora estava a zero não por falta de gente, mas porque
 * o sistema não conseguia VER quem tinha depositado.
 *
 * Três lições ficaram escritas em código aqui:
 *
 *  1. Um importador que não encontra a coluna dos depósitos tem de RECUSAR, não escrever zeros.
 *     Zeros escritos parecem dados; dados em falta dão erro. Foi a confusão entre as duas coisas
 *     que custou dois meses.
 *  2. Uma célula vazia não é um zero. Se o ficheiro não traz o valor, o que já lá está fica —
 *     um export parcial não pode apagar o que um export completo trouxe.
 *  3. Dados velhos têm de gritar. O cron da renovação dá "grace" a dados com mais de 40 dias, o
 *     que é o comportamento certo — mas em silêncio significa que ninguém dá por eles.
 *
 * Tudo aqui é função pura, para poder ser testado sem base de dados: `npx tsx
 * lib/broker/__tests__/dados-corretora.check.ts`.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// UIDs
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Limites do que é um UID de corretora. São os MESMOS de `looksLikeBrokerUid` no gate do
 * Telegram, de propósito: se o bot aceita um número e o importador o rejeita (ou ao contrário),
 * volta-se a ter pessoas em limbo sem ninguém perceber porquê.
 */
export const UID_MIN_DIGITOS = 5
export const UID_MAX_DIGITOS = 12

export type UidValidado = { ok: true; uid: string } | { ok: false; motivo: string }

/** Limpa e valida um UID escrito à mão (o lead escreve-o no Telegram; engana-se). */
export function validarUidBroker(bruto: unknown): UidValidado {
  const texto = String(bruto ?? '').trim()
  if (!texto) return { ok: false, motivo: 'vazio' }
  // #12345, "12 345", 12345.0 (o Excel transforma números em floats) e aspas do CSV.
  const limpo = texto.replace(/^['"#]+|['"]+$/g, '').replace(/[\s ]/g, '').replace(/\.0+$/, '')
  if (!/^\d+$/.test(limpo)) return { ok: false, motivo: `não é só dígitos: "${texto}"` }
  if (limpo.length < UID_MIN_DIGITOS) return { ok: false, motivo: `curto de mais (${limpo.length} dígitos)` }
  if (limpo.length > UID_MAX_DIGITOS) return { ok: false, motivo: `longo de mais (${limpo.length} dígitos)` }
  return { ok: true, uid: limpo }
}

/**
 * O UID que o lead enviou parece um dos nossos?
 *
 * Não chega saber que é um número. A 2026-09-24 os dois únicos leads com acesso tinham UIDs de 7
 * e 9 dígitos, e NENHUM dos dois existia em `broker_clients` (os do export têm 8 ou 9 dígitos e
 * começam todos por "10"). Ambos ficaram em grace permanente — nunca renováveis por mérito, nunca
 * revogáveis — e ninguém soube durante semanas. Isto devolve o aviso que faltava.
 */
export function avaliarUidLead(
  uid: string,
  uidsConhecidos: Iterable<string>,
): { casa: boolean; comprimentoTipico: boolean; aviso: string | null } {
  const conhecidos = new Set<string>()
  const comprimentos = new Set<number>()
  for (const u of uidsConhecidos) {
    const c = String(u ?? '').trim()
    if (!c) continue
    conhecidos.add(c)
    comprimentos.add(c.length)
  }
  const casa = conhecidos.has(String(uid ?? '').trim())
  const comprimentoTipico = comprimentos.size === 0 || comprimentos.has(String(uid ?? '').trim().length)
  if (casa) return { casa, comprimentoTipico, aviso: null }
  const esperados = [...comprimentos].sort((a, b) => a - b).join('/')
  return {
    casa: false,
    comprimentoTipico,
    aviso: comprimentoTipico
      ? `UID ${uid} não existe em broker_clients (os dados do broker podem estar velhos).`
      : `UID ${uid} não existe em broker_clients e tem ${String(uid).length} dígitos — os nossos têm ${esperados}. Provável engano a escrever.`,
  }
}

/** Leads com UID que não casa com nenhum cliente do broker — os que ficam em grace para sempre. */
export function leadsSemCorrespondencia<T extends { broker_uid?: string | null }>(
  leads: readonly T[],
  uidsConhecidos: Iterable<string>,
): Array<T & { aviso: string }> {
  const conhecidos = new Set([...uidsConhecidos].map((u) => String(u ?? '').trim()).filter(Boolean))
  const fora: Array<T & { aviso: string }> = []
  for (const l of leads) {
    const uid = String(l.broker_uid ?? '').trim()
    if (!uid) continue
    const v = avaliarUidLead(uid, conhecidos)
    if (!v.casa) fora.push({ ...l, aviso: v.aviso ?? `UID ${uid} sem correspondência` })
  }
  return fora
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Frescura
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Dias a partir dos quais o cron `broker-gate-renew` deixa de acreditar nos dados e passa toda a
 * gente a grace. É o número DELE — está aqui repetido porque este ficheiro não pode importar uma
 * rota, mas o teste garante que não se afastam.
 */
export const DIAS_LIMITE_FRESCURA = 40
/** Avisa-se antes do precipício, não em cima dele. */
export const DIAS_AVISO_FRESCURA = 30

export type EstadoFrescura = 'sem_dados' | 'fresco' | 'a_envelhecer' | 'velho'

export function avaliarFrescura(
  maisRecente: string | Date | null | undefined,
  agoraMs: number = Date.now(),
  opcoes: { aviso?: number; limite?: number } = {},
): { estado: EstadoFrescura; dias: number | null; mensagem: string } {
  const aviso = opcoes.aviso ?? DIAS_AVISO_FRESCURA
  const limite = opcoes.limite ?? DIAS_LIMITE_FRESCURA
  const t = maisRecente ? new Date(maisRecente).getTime() : NaN
  if (!Number.isFinite(t)) {
    return { estado: 'sem_dados', dias: null, mensagem: 'Nunca foi importado nenhum export da corretora.' }
  }
  const dias = Math.floor((agoraMs - t) / 86_400_000)
  if (dias >= limite) {
    return {
      estado: 'velho',
      dias,
      mensagem:
        `Os dados da corretora têm ${dias} dias (limite: ${limite}). O cron da renovação já não ` +
        `acredita neles: ninguém é validado por mérito nem revogado — está tudo em grace.`,
    }
  }
  if (dias >= aviso) {
    return {
      estado: 'a_envelhecer',
      dias,
      mensagem: `Os dados da corretora têm ${dias} dias. Aos ${limite} deixam de contar — importa um export novo.`,
    }
  }
  return { estado: 'fresco', dias, mensagem: `Dados da corretora com ${dias} dias.` }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Nomes que o export pode dar a cada coluna.
 *
 * A comparação é feita sem acentos, sem espaços e sem pontuação (`chaveColuna`), por isso
 * "Total Deposit (USD)", "total_deposits" e "TOTAL DEPOSIT" são a mesma chave. A lista é generosa
 * de propósito: é mais barato aceitar um nome a mais do que obrigar alguém a editar o CSV à mão
 * antes de o poder importar — que é exatamente o atrito que fez isto ficar dois meses por fazer.
 *
 * A ORDEM importa: a primeira que aparecer no ficheiro ganha. Nos depósitos, o valor que o gate
 * quer é o BRUTO acumulado ("Gross Deposit"), não o líquido de levantamentos ("Net Deposit") —
 * quem depositou 500 e levantou 200 depositou mesmo, e o gate pergunta pelo depósito.
 *
 * Os nomes no topo de cada lista são os literais do Funds/Rebate Report do portal de IB da PU
 * Prime (`ibportal.puprime.org`), conferidos em 2026-09-24. Um aviso que vem com eles: os números
 * do portal só sincronizam às 08:00 do servidor, por isso um export tirado a meio do dia não bate
 * certo com o que o cliente vê na conta dele — não é bug do importador.
 */
export const ALIASES: Record<string, string[]> = {
  uid: [
    'uid', 'clientuid', 'client uid', 'customeruid', 'accountuid', 'userid', 'clientid',
    'client id', 'customerid', 'account', 'accountno', 'accountnumber', 'mt4account',
    'mt5account', 'tradingaccount', 'login', 'conta', 'numerodeconta',
  ],
  deposits_usd: [
    // Os nomes literais do portal de IB da PU Prime vêm primeiro (Funds/Rebate Report).
    'grossdeposit', 'grossdeposits',
    'totaldeposit', 'totaldeposits', 'totaldepositusd', 'totaldepositamount',
    'depositusd', 'depositamount', 'deposits', 'deposit', 'depositos', 'deposito',
    'accumulateddeposit',
    // O líquido fica para o fim: `Net Deposit = Total Deposits − Total Withdrawals`, e quem
    // depositou 500 e levantou 200 depositou mesmo. O gate pergunta pelo depósito, não pelo saldo
    // de movimentos. Só se usa se o ficheiro não trouxer o bruto.
    'netdeposit', 'netdeposits', 'netfunding',
  ],
  balance_usd: [
    'balance', 'balanceusd', 'accountbalance', 'currentbalance', 'closingbalance', 'saldo',
    // `Account Equity` é o nome do portal da PU Prime. Fica depois do saldo: com posições
    // abertas a equity oscila, e o gate quer dinheiro parado, não flutuação.
    'equity', 'accountequity',
  ],
  first_name: ['firstname', 'givenname', 'name', 'clientname', 'fullname', 'nome', 'primeironome'],
  last_name: ['lastname', 'surname', 'familyname', 'apelido', 'ultimonome'],
  email: ['email', 'emailaddress', 'clientemail', 'correio'],
}

/** "Total Deposit (USD)" → "totaldepositusd". Tira acentos, espaços, moeda e pontuação. */
export function chaveColuna(bruto: string): string {
  return String(bruto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Números como os exports os dão: "1,234.56", "1.234,56", "$350.00", "350 USD", "-", "".
 *
 * Com os dois separadores presentes, o ÚLTIMO é o decimal — é a única regra que funciona nas duas
 * convenções sem adivinhar a localização de quem exportou. Devolve `null` para célula vazia: uma
 * célula vazia não é um zero, e tratá-la como zero foi exatamente o que apagou os depósitos.
 */
export function lerNumero(bruto: unknown): number | null {
  if (bruto == null) return null
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null
  let t = String(bruto).trim()
  if (!t || t === '-' || t === '—' || t === 'N/A' || t === 'n/a' || t === 'null') return null
  const negativo = /^\(.*\)$/.test(t) || t.startsWith('-')
  t = t.replace(/[()\s ]/g, '').replace(/^[-+]/, '')
  t = t.replace(/(usd|eur|gbp|\$|€|£)/gi, '')
  const ultimaVirgula = t.lastIndexOf(',')
  const ultimoPonto = t.lastIndexOf('.')
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // O último dos dois é o decimal; o outro é separador de milhares.
    if (ultimaVirgula > ultimoPonto) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else if (ultimaVirgula >= 0) {
    // Só vírgulas: decimal se sobrarem 1–2 dígitos depois dela ("350,5"), senão milhares ("1,234").
    const depois = t.length - ultimaVirgula - 1
    t = depois > 0 && depois <= 2 && t.indexOf(',') === ultimaVirgula ? t.replace(',', '.') : t.replace(/,/g, '')
  }
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/** Divide uma linha de CSV respeitando aspas e aspas duplicadas (""). */
export function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++ } else dentroDeAspas = false
      } else atual += c
    } else if (c === '"') dentroDeAspas = true
    else if (c === separador) { campos.push(atual); atual = '' }
    else atual += c
  }
  campos.push(atual)
  return campos.map((c) => c.trim())
}

/** O separador que o ficheiro usa. Os exports europeus saem com ';' e partem um parser fixo em ','. */
export function detetarSeparador(amostra: string): string {
  const candidatos = [',', ';', '\t', '|']
  let melhor = ','
  let melhorContagem = -1
  for (const s of candidatos) {
    // Conta só fora de aspas, e só nas primeiras linhas (o cabeçalho e as duas seguintes).
    const linhas = amostra.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5)
    const contagens = linhas.map((l) => dividirLinha(l, s).length)
    const minimo = contagens.length ? Math.min(...contagens) : 0
    if (minimo > melhorContagem) { melhorContagem = minimo; melhor = s }
  }
  return melhor
}

export interface LinhaBroker {
  uid: string
  first_name: string | null
  last_name: string | null
  email: string | null
  /** `null` = a coluna existe mas a célula veio vazia → NÃO mexer no que já está guardado. */
  deposits_usd: number | null
  balance_usd: number | null
}

export interface LinhaIgnorada {
  /** Número da linha no ficheiro, como o Excel a mostra (1 = primeira linha do ficheiro). */
  linha: number
  motivo: string
  amostra: string
}

export interface ResultadoAnalise {
  ok: boolean
  erro: string | null
  /** Que coluna do ficheiro alimentou cada campo — é isto que se lê para confirmar o mapeamento. */
  mapeamento: Partial<Record<keyof LinhaBroker, string>>
  cabecalhos: string[]
  separador: string
  linhas: LinhaBroker[]
  ignoradas: LinhaIgnorada[]
  duplicados: string[]
}

/**
 * Lê o CSV como a PU Prime o dá — com BOM, com preâmbulo antes do cabeçalho, com ';' ou ','.
 *
 * Se não encontrar a coluna dos depósitos, RECUSA o ficheiro inteiro e devolve os cabeçalhos que
 * viu. Escrever zeros em silêncio é o defeito que este ficheiro existe para não repetir: um
 * `deposits_usd` a 0 torna o gate impossível de passar e parece, a quem olha para a tabela, um
 * cliente que simplesmente não depositou.
 */
export function analisarCsvCorretora(
  texto: string,
  opcoes: { exigirDepositos?: boolean } = {},
): ResultadoAnalise {
  const exigirDepositos = opcoes.exigirDepositos ?? true
  const vazio: ResultadoAnalise = {
    ok: false, erro: null, mapeamento: {}, cabecalhos: [], separador: ',',
    linhas: [], ignoradas: [], duplicados: [],
  }
  const cru = String(texto ?? '').replace(/^﻿/, '')
  if (!cru.trim()) return { ...vazio, erro: 'ficheiro vazio' }

  const todasAsLinhas = cru.split(/\r?\n/)
  const separador = detetarSeparador(cru)

  // O cabeçalho nem sempre é a primeira linha: os exports costumam trazer título, datas e uma
  // linha em branco antes. Procura-se a primeira linha que tenha uma coluna de UID reconhecível.
  let indiceCabecalho = -1
  let cabecalhos: string[] = []
  for (let i = 0; i < Math.min(todasAsLinhas.length, 30); i++) {
    if (!todasAsLinhas[i].trim()) continue
    const campos = dividirLinha(todasAsLinhas[i], separador)
    if (campos.length < 2) continue
    const chaves = campos.map(chaveColuna)
    if (chaves.some((k) => ALIASES.uid.map(chaveColuna).includes(k))) {
      indiceCabecalho = i
      cabecalhos = campos
      break
    }
  }
  if (indiceCabecalho < 0) {
    return {
      ...vazio,
      separador,
      erro:
        'não encontrei a coluna do UID. Nomes aceites: ' +
        ALIASES.uid.join(', ') +
        '. Se a PU Prime lhe chama outra coisa, diz qual e acrescenta-se à lista.',
    }
  }

  // Que coluna do ficheiro alimenta cada campo nosso.
  const chavesCabecalho = cabecalhos.map(chaveColuna)
  const mapeamento: Partial<Record<keyof LinhaBroker, string>> = {}
  const indices: Partial<Record<keyof LinhaBroker, number>> = {}
  for (const [campo, nomes] of Object.entries(ALIASES) as [keyof LinhaBroker, string[]][]) {
    for (const nome of nomes) {
      const alvo = chaveColuna(nome)
      const idx = chavesCabecalho.indexOf(alvo)
      if (idx >= 0) { indices[campo] = idx; mapeamento[campo] = cabecalhos[idx]; break }
    }
  }

  if (indices.uid == null) {
    return { ...vazio, separador, cabecalhos, erro: 'não encontrei a coluna do UID' }
  }
  if (exigirDepositos && indices.deposits_usd == null) {
    return {
      ...vazio,
      separador,
      cabecalhos,
      mapeamento,
      erro:
        'não encontrei a coluna dos DEPÓSITOS — e sem ela o ficheiro não entra. Escrever zeros ' +
        'tornaria o acesso impossível de conceder (é o que está a acontecer desde julho). ' +
        `Colunas vistas: ${cabecalhos.join(' | ')}. Diz qual é a dos depósitos e acrescenta-se aos aliases.`,
    }
  }

  const linhas: LinhaBroker[] = []
  const ignoradas: LinhaIgnorada[] = []
  const vistos = new Map<string, number>()
  const duplicados: string[] = []

  const texto0 = (campos: string[], i: number | undefined): string | null => {
    if (i == null) return null
    const v = (campos[i] ?? '').trim()
    return v ? v : null
  }

  for (let i = indiceCabecalho + 1; i < todasAsLinhas.length; i++) {
    const bruta = todasAsLinhas[i]
    if (!bruta.trim()) continue
    const campos = dividirLinha(bruta, separador)
    // Linhas de total/rodapé: sem UID válido, e não vale a pena assustar ninguém com elas.
    const uidV = validarUidBroker(campos[indices.uid as number])
    if (!uidV.ok) {
      ignoradas.push({ linha: i + 1, motivo: `UID inválido (${uidV.motivo})`, amostra: bruta.slice(0, 120) })
      continue
    }
    const anterior = vistos.get(uidV.uid)
    if (anterior != null) {
      duplicados.push(uidV.uid)
      // Fica a ÚLTIMA ocorrência (é a que o export costuma ter mais atualizada), mas diz-se.
      const j = linhas.findIndex((l) => l.uid === uidV.uid)
      if (j >= 0) linhas.splice(j, 1)
    }
    vistos.set(uidV.uid, i)
    linhas.push({
      uid: uidV.uid,
      first_name: texto0(campos, indices.first_name),
      last_name: texto0(campos, indices.last_name),
      email: texto0(campos, indices.email),
      deposits_usd: indices.deposits_usd == null ? null : lerNumero(campos[indices.deposits_usd]),
      balance_usd: indices.balance_usd == null ? null : lerNumero(campos[indices.balance_usd]),
    })
  }

  return { ok: true, erro: null, mapeamento, cabecalhos, separador, linhas, ignoradas, duplicados: [...new Set(duplicados)] }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Fundir com o que já está guardado
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ClienteGuardado {
  uid: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  deposits_usd?: number | string | null
  balance_usd?: number | string | null
}

export interface LinhaFundida {
  uid: string
  first_name: string | null
  last_name: string | null
  email: string | null
  deposits_usd: number
  balance_usd: number
  /** 'novo' = não existia; 'alterado' = existia e algum valor mudou; 'igual' = nada a fazer. */
  estado: 'novo' | 'alterado' | 'igual'
  alteracoes: string[]
}

export interface Fusao {
  paraGravar: LinhaFundida[]
  novos: number
  alterados: number
  iguais: number
  /** UIDs que estão na base e NÃO vinham no ficheiro. Ficam intocados — nunca se apagam. */
  ausentesDoFicheiro: string[]
}

const n0 = (v: unknown): number => {
  const x = typeof v === 'number' ? v : lerNumero(v)
  return x == null ? 0 : x
}

/**
 * Junta o ficheiro com o que já está guardado, sem apagar nada.
 *
 * Duas regras, ambas pagas com sangue:
 *  - célula vazia não sobrepõe valor guardado (um export parcial não pode zerar depósitos);
 *  - UID que não vem no ficheiro fica como está (um export parcial não pode revogar acessos).
 */
export function fundirComGuardados(
  doFicheiro: readonly LinhaBroker[],
  guardados: readonly ClienteGuardado[],
): Fusao {
  const porUid = new Map<string, ClienteGuardado>()
  for (const g of guardados) porUid.set(String(g.uid).trim(), g)

  const paraGravar: LinhaFundida[] = []
  const noFicheiro = new Set<string>()

  for (const l of doFicheiro) {
    noFicheiro.add(l.uid)
    const antigo = porUid.get(l.uid)
    const alteracoes: string[] = []

    const escolherTexto = (novo: string | null, velho: string | null | undefined, campo: string) => {
      const v = velho == null || velho === '' ? null : String(velho)
      const final = novo ?? v
      if (antigo && final !== v) alteracoes.push(campo)
      return final
    }
    const escolherNumero = (novo: number | null, velho: unknown, campo: string) => {
      const v = n0(velho)
      const final = novo == null ? v : novo
      if (antigo && final !== v) alteracoes.push(`${campo} ${v}→${final}`)
      return final
    }

    const fundida: LinhaFundida = {
      uid: l.uid,
      first_name: escolherTexto(l.first_name, antigo?.first_name, 'first_name'),
      last_name: escolherTexto(l.last_name, antigo?.last_name, 'last_name'),
      email: escolherTexto(l.email, antigo?.email, 'email'),
      deposits_usd: escolherNumero(l.deposits_usd, antigo?.deposits_usd, 'depósitos'),
      balance_usd: escolherNumero(l.balance_usd, antigo?.balance_usd, 'saldo'),
      estado: !antigo ? 'novo' : alteracoes.length ? 'alterado' : 'igual',
      alteracoes,
    }
    paraGravar.push(fundida)
  }

  const ausentesDoFicheiro = [...porUid.keys()].filter((u) => !noFicheiro.has(u))
  return {
    paraGravar,
    novos: paraGravar.filter((l) => l.estado === 'novo').length,
    alterados: paraGravar.filter((l) => l.estado === 'alterado').length,
    iguais: paraGravar.filter((l) => l.estado === 'igual').length,
    ausentesDoFicheiro,
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// O que é que esta importação muda na vida das pessoas
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LeadComAcesso {
  chat_id: string
  broker_uid: string | null
  username?: string | null
  first_name?: string | null
}

export interface ImpactoNoAcesso {
  /** Passariam a poder ser REVOGADOS pelo cron: saldo abaixo do mínimo com dados agora frescos. */
  passamASerRevogaveis: Array<{ chat_id: string; uid: string; quem: string; saldo: number }>
  /** Passariam a validar por mérito (hoje dependem de print screen aprovado à mão). */
  passamAValidar: Array<{ chat_id: string; uid: string; quem: string; deposito: number; saldo: number }>
  /** Continuam sem correspondência no broker — grace permanente, ninguém sabe. */
  continuamSemCorrespondencia: Array<{ chat_id: string; uid: string; quem: string }>
}

/**
 * O aviso antes de gravar: quem é que fica diferente por causa deste ficheiro.
 *
 * Importar dados frescos não é neutro. Hoje toda a gente está em grace porque os dados têm 66
 * dias; no minuto em que entrar um export novo, o cron passa a poder revogar — e do outro lado
 * há pessoas com acesso a grupos pagos. Isto calcula-se ANTES de escrever, para a decisão ser
 * tomada por uma pessoa e não descoberta por um cron às 3 da manhã.
 *
 * Os dois mínimos entram separados porque HOJE são números diferentes: o gate valida a $350
 * (`MIN_DEPOSIT`) e o cron da renovação revoga abaixo de $300. Juntá-los num só parâmetro seria
 * esconder esse desalinhamento dentro de uma função — e há uma tarefa à parte a tratar dele.
 */
export function impactoNoAcesso(
  leads: readonly LeadComAcesso[],
  paraGravar: readonly LinhaFundida[],
  minimos: { revogacao: number; validacao: number },
): ImpactoNoAcesso {
  const porUid = new Map(paraGravar.map((l) => [l.uid, l]))
  const r: ImpactoNoAcesso = { passamASerRevogaveis: [], passamAValidar: [], continuamSemCorrespondencia: [] }
  for (const l of leads) {
    const uid = String(l.broker_uid ?? '').trim()
    if (!uid) continue
    const quem = l.username ? `@${String(l.username).replace(/^@/, '')}` : l.first_name || l.chat_id
    const c = porUid.get(uid)
    if (!c) { r.continuamSemCorrespondencia.push({ chat_id: l.chat_id, uid, quem }); continue }
    if (c.balance_usd < minimos.revogacao) {
      r.passamASerRevogaveis.push({ chat_id: l.chat_id, uid, quem, saldo: c.balance_usd })
    }
    if (c.deposits_usd >= minimos.validacao && c.balance_usd >= minimos.validacao) {
      r.passamAValidar.push({ chat_id: l.chat_id, uid, quem, deposito: c.deposits_usd, saldo: c.balance_usd })
    }
  }
  return r
}
