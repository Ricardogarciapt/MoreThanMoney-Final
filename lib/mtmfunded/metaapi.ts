import { findExistingAccount, formatMetaApiProvisionError } from '@/lib/mtmcopy/metaapi-provision'
import { tipoCurto } from './etiquetas'

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
  /**
   * PROVIDER da CopyFactory — só para as contas MESTRE das estratégias.
   *
   * As contas de cliente ligam-se SEM papéis, e isso é uma decisão de segurança explicada no
   * topo deste ficheiro: uma conta de avaliação com papel de CopyFactory podia acabar a copiar
   * sinais, que é precisamente o que as regras proíbem.
   *
   * As contas mestre são o contrário — existem para serem copiadas. Sem este papel, a
   * CopyFactory recusa criar a estratégia e os subscritores não têm de onde copiar.
   */
  papelProvider?: boolean
}): Promise<LigacaoMetaApi> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, erro: 'METAAPI_TOKEN em falta' }

  const login = String(dados.login).replace(/\D/g, '')
  const servidor = dados.servidor?.trim()
  if (!login || !dados.password || !servidor) {
    return { ok: false, erro: 'login, password e servidor são obrigatórios' }
  }

  try {
    /**
     * O build NODE do SDK, não o web.
     *
     * `metaapi.cloud-sdk` resolve para o bundle de browser, que assume `window` e rebenta com
     * «window is not defined» assim que corre fora de um pedido do Next — num script, numa
     * rotina de manutenção, em qualquer sítio sem DOM. O `esm-node` é o mesmo SDK compilado
     * para Node; o `webpackIgnore` existe porque ele usa builtins que o webpack não resolve
     * ao empacotar o cliente, e esta função só corre no servidor.
     *
     * Fica o fallback para o build web: em runtimes onde o `esm-node` não resolve (edge), o
     * outro funciona — e o que não pode acontecer é não haver SDK nenhum.
     */
    let MetaApi: unknown
    try {
      const mod = (await import(/* webpackIgnore: true */ 'metaapi.cloud-sdk/esm-node')) as { default?: unknown }
      MetaApi = mod.default ?? mod
    } catch {
      MetaApi = (await import('metaapi.cloud-sdk')).default
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new (MetaApi as any)(token)

    // A mesma conta pode já lá estar de uma tentativa anterior. Criar outra deixava duas
    // entradas para o mesmo login, e a leitura passava a depender de qual delas se apanhava.
    const existente = await findExistingAccount(login, servidor)
    if (existente) {
      const conta = await api.metatraderAccountApi.getAccount(existente.id)
      await conta.update?.({
        password: dados.password,
        server: servidor,
        name: dados.nome,
        // Uma conta reaproveitada de uma tentativa anterior pode ter sido criada sem o papel.
        ...(dados.papelProvider ? { copyFactoryRoles: ['PROVIDER'] } : {}),
      })
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
      // Uma conta de LEITURA não precisa da fiabilidade (mais cara) que se paga para executar
      // ordens. Uma conta MESTRE precisa: é dela que saem as ordens de toda a gente, e uma
      // desconexão dela é uma desconexão de todos os subscritores ao mesmo tempo.
      reliability: dados.papelProvider ? 'high' : 'regular',
      region: regiao,
      // Sem papéis de CopyFactory por omissão — ver o comentário do topo. A excepção são as
      // contas MESTRE, que existem exactamente para ser copiadas.
      copyFactoryRoles: dados.papelProvider ? ['PROVIDER'] : [],
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
  // As MESMAS palavras que o cliente vê no WebTrader e no painel (lib/mtmfunded/etiquetas.ts).
  //
  // Isto escrevia «Desafio 1 fase» e «Desafio fase 2» enquanto a fonte única dizia F1 e F2 — e
  // como este texto vai para o NOME DA CONTA na corretora, a mesma conta tinha um nome no ecrã e
  // outro na lista da MetaApi. Quem comparava os dois não sabia se estava a ver a mesma coisa.
  // Decisão do dono (24/09): alinhar pelas etiquetas do cliente.
  if (tipo === 'torneio') return 'Torneio'
  if (tipo === 'funded' || tipo === 'financiada') return 'Funded'
  if (tipo === 'real') return 'Real'
  if (tipo === 'desafio') {
    // A fase é o que muda ao longo do caminho; o número de fases do programa não entra no nome.
    return tipoCurto('desafio', { fase: Number(f?.fase ?? 1) })
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
