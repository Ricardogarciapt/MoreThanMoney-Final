import { findExistingAccount, formatMetaApiProvisionError } from '@/lib/mtmcopy/metaapi-provision'

/**
 * Liga uma conta do MTM Funded à MetaApi — para ser LIDA, e mais nada.
 *
 * Sem isto, o site tem o login e a password de uma conta e não sabe nada sobre ela: nem
 * equity, nem drawdown, nem se alguém quebrou uma regra. As regras publicadas só valem
 * alguma coisa se houver quem as meça, e é este ficheiro que abre essa porta.
 *
 * NÃO é o provisionamento do MTM Copy. Aquele liga contas à CopyFactory para copiarem
 * ordens; aqui não se atribui papel nenhum de cópia. Uma conta de avaliação que aparecesse na
 * CopyFactory podia acabar a copiar sinais — exactamente o que as regras proíbem.
 */

export interface LigacaoMetaApi {
  ok: boolean
  accountId?: string
  erro?: string
}

export async function ligarContaMetaApi(dados: {
  login: string
  password: string
  servidor: string
  /** Nome visível na MetaApi. Ver `etiquetaDaConta`. */
  nome: string
}): Promise<LigacaoMetaApi> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, erro: 'METAAPI_TOKEN em falta' }

  const login = String(dados.login).replace(/\D/g, '')
  const servidor = dados.servidor?.trim()
  if (!login || !dados.password || !servidor) {
    return { ok: false, erro: 'login, password e servidor são obrigatórios' }
  }

  try {
    const MetaApi = (await import('metaapi.cloud-sdk')).default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new (MetaApi as any)(token)

    // A mesma conta pode já lá estar de uma tentativa anterior. Criar outra deixava duas
    // entradas para o mesmo login, e a leitura passava a depender de qual delas se apanhava.
    const existente = await findExistingAccount(login, servidor)
    if (existente) {
      const conta = await api.metatraderAccountApi.getAccount(existente.id)
      await conta.update?.({ password: dados.password, server: servidor, name: dados.nome })
      await conta.deploy?.().catch(() => undefined)
      return { ok: true, accountId: existente.id }
    }

    // `METAAPI_REGION` quando existir; senão Londres, que é onde o resto do sistema vive.
    const regiao = process.env.METAAPI_REGION?.trim() || 'london'

    const conta = await api.metatraderAccountApi.createAccount({
      name: dados.nome,
      type: 'cloud-g2',
      login,
      password: dados.password,
      server: servidor,
      platform: 'mt5',
      magic: 0,
      // `low` porque isto só lê: uma conta de leitura não precisa da fiabilidade (mais cara)
      // que se paga para executar ordens.
      reliability: 'regular',
      region: regiao,
      // Sem papéis de CopyFactory. De propósito — ver o comentário do topo.
      copyFactoryRoles: [],
    })

    const accountId = conta.id ?? (conta as { _id?: string })._id
    if (!accountId) return { ok: false, erro: 'a MetaApi não devolveu id da conta' }

    await conta.deploy?.().catch(() => undefined)
    return { ok: true, accountId }
  } catch (e) {
    return { ok: false, erro: formatMetaApiProvisionError(e) }
  }
}

/**
 * O nome com que a conta aparece na corretora, na MetaApi e no painel.
 *
 * O APELIDO carrega o tipo: «Ricardo Garcia Torneio», «Ricardo Garcia Desafio», «Ricardo
 * Garcia Funded». A corretora não tem campo para o tipo de conta, e sem ele um operador a
 * olhar para uma lista de contas não distingue um participante de torneio de um trader
 * financiado — que têm regras, contratos e pagamentos diferentes.
 */
export type TipoConta = 'torneio' | 'desafio' | 'funded' | string

/**
 * Quantas fases tem o programa, e em qual delas está esta conta.
 *
 * Um desafio de duas fases é DUAS contas ao longo do tempo — passa-se a primeira e emite-se
 * outra para a segunda. Sem isto na etiqueta, as duas apareciam na corretora com o mesmo
 * nome, e quem olhasse para a lista não sabia qual estava a valer.
 */
export interface FaseDoDesafio {
  /** Fases do programa: 1 ou 2. */
  fases?: number | null
  /** Em que fase está esta conta. Por omissão, a primeira. */
  fase?: number | null
}

export function etiquetaDoTipo(tipo: TipoConta, f?: FaseDoDesafio): string {
  if (tipo === 'torneio') return 'Torneio'
  if (tipo === 'funded' || tipo === 'financiada') return 'Funded'
  if (tipo === 'desafio') {
    const fases = Number(f?.fases ?? 0)
    // Uma fase: «Desafio 1 fase» — diz-se o formato, porque é o que o distingue do outro.
    if (fases === 1) return 'Desafio 1 fase'
    // Duas fases: diz-se em QUAL se está, que é a informação que muda ao longo do caminho.
    if (fases >= 2) return `Desafio fase ${Number(f?.fase ?? 1) >= 2 ? 2 : 1}`
    // Programa desconhecido: fica a etiqueta genérica, que ainda distingue o tipo de conta.
    return 'Desafio'
  }
  return 'MTM'
}

export function apelidoComTipo(apelido: string, tipo: TipoConta, f?: FaseDoDesafio): string {
  const base = (apelido || '').trim()
  const etiqueta = etiquetaDoTipo(tipo, f)
  if (!base) return etiqueta
  // O campo da corretora aceita 30 caracteres; corta-se o apelido, nunca a etiqueta — é ela
  // que distingue o tipo de conta e a fase, e é isso que não pode desaparecer.
  const espaco = 30 - etiqueta.length - 1
  return `${base.slice(0, Math.max(espaco, 1))} ${etiqueta}`
}
