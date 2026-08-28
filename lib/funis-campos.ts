import type { TipoDeNo } from '@/lib/funis'

/**
 * O que cada tipo de bloco tem para configurar.
 *
 * Até aqui um bloco só tinha título, detalhe e para onde ia. Dava para desenhar o funil, não para
 * o definir: um bloco "Espera" não dizia quanto, um "Condição" não dizia a condição, e um
 * "Automação" não dizia o que chamava. Quem abria o mapa via a forma e tinha de ir ao código
 * saber o conteúdo.
 *
 * ── Porque é um registo e não um formulário por tipo ──────────────────────────────────────────
 * A alternativa era um `switch` com dez formulários escritos à mão. Custa o mesmo a escrever da
 * primeira vez e muito mais em todas as seguintes: cada tipo novo obrigava a mexer no editor, e
 * dez formulários independentes derivam uns dos outros até nenhum se parecer com o vizinho.
 *
 * Assim os campos são DADOS. O editor sabe desenhar seis tipos de campo e mais nada; acrescentar
 * um bloco é acrescentar uma entrada nesta tabela.
 *
 * ── As opções são as REAIS ───────────────────────────────────────────────────────────────────
 * As etapas, os interesses e os passos que aparecem nas escolhas são os que o código do Telegram
 * escreve mesmo (`telegram_leads.stage`, `.interesse`, `.mtmauto_passo`). Inventar uma lista
 * bonita faria o mapa descrever um funil que não existe — que é o problema que ele veio resolver.
 */

export type TipoDeCampo =
  | 'texto'
  | 'texto_longo'
  | 'numero'
  | 'escolha'
  | 'booleano'
  /** Escolhe uma das mensagens editáveis do funil, em vez de duplicar o texto aqui. */
  | 'mensagem'
  /** Escolhe outro funil do mapa. */
  | 'funil'
  /**
   * Uma LISTA de linhas iguais — os botões de uma mensagem, os casos de uma condição.
   *
   * É o `fixedCollection` do n8n, reduzido ao caso que precisamos: um só grupo, várias linhas,
   * todas com a mesma forma. O n8n suporta vários grupos com formas diferentes dentro do mesmo
   * campo; isso duplica a complexidade do desenho para resolver um problema que nenhum bloco
   * nosso tem.
   */
  | 'lista'
  /** Um aviso no meio do formulário. Não guarda valor — explica. */
  | 'aviso'

export interface Campo {
  chave: string
  rotulo: string
  tipo: TipoDeCampo
  /** Explicação longa, por baixo do campo. */
  ajuda?: string
  /** Uma linha curta, colada ao campo — o que a pessoa do outro lado vai ver, por exemplo. */
  dica?: string
  /** O texto cinzento dentro do campo vazio. */
  exemplo?: string
  /** Sem isto preenchido, o bloco fica marcado como incompleto. */
  obrigatorio?: boolean
  opcoes?: Array<{ valor: string; rotulo: string }>
  sufixo?: string
  padrao?: string | number | boolean
  /** Para `tipo: 'lista'` — a forma de cada linha. */
  linha?: Campo[]
  /** Para `tipo: 'lista'` — o texto do botão que acrescenta uma linha. */
  rotuloAcrescentar?: string
  /**
   * Quando é que este campo aparece.
   *
   * Cada chave é outro campo, e o valor são os valores que servem. Várias chaves ao mesmo tempo
   * é E (todas têm de bater); vários valores na mesma chave é OU. `esconder` ganha sempre a
   * `mostrar` — é a regra do n8n, e é a certa: quem escreve uma regra de esconder está a tratar
   * de uma excepção, e uma excepção que não ganha não é excepção.
   *
   * Um formulário que mostra sempre tudo obriga a ler dez campos para preencher dois, e os oito
   * que ficam vazios parecem por preencher em vez de não se aplicarem.
   */
  mostrar?: Record<string, Array<string | number | boolean>>
  esconder?: Record<string, Array<string | number | boolean>>
}

/**
 * Este campo deve aparecer, dados os valores que já lá estão?
 *
 * Fica aqui e não dentro do editor de propósito: a mesma regra decide o que se desenha E o que
 * conta para "o bloco está completo". Se vivesse no React, a validação teria de a repetir — e
 * duas cópias de uma regra de visibilidade divergem em silêncio.
 */
export function campoVisivel(c: Campo, valores: Record<string, unknown>): boolean {
  const bate = (regra: Record<string, Array<string | number | boolean>>) =>
    Object.entries(regra).every(([chave, aceites]) => {
      const atual = valores[chave]
      return aceites.some((v) => String(v) === String(atual))
    })

  if (c.mostrar && !bate(c.mostrar)) return false
  // Esconder ganha: quem escreve uma regra de esconder está a tratar de uma excepção.
  if (c.esconder && Object.entries(c.esconder).some(([chave, aceites]) =>
    aceites.some((v) => String(v) === String(valores[chave])))) return false
  return true
}

/** Os campos por preencher de um bloco. Vazio = está pronto. */
export function camposEmFalta(campos: Campo[], valores: Record<string, unknown>): string[] {
  return campos
    .filter((c) => c.obrigatorio && c.tipo !== 'aviso' && campoVisivel(c, valores))
    .filter((c) => {
      const v = valores[c.chave]
      return v == null || v === '' || (Array.isArray(v) && v.length === 0)
    })
    .map((c) => c.rotulo)
}

/** As etapas que o funil do Telegram escreve mesmo. */
const ETAPAS = [
  { valor: 'new', rotulo: 'Acabou de entrar' },
  { valor: 'qualifying', rotulo: 'A perceber o que quer' },
  { valor: 'routed', rotulo: 'Encaminhado' },
  { valor: 'awaiting_proof', rotulo: 'À espera do comprovativo' },
  { valor: 'pending_review', rotulo: 'À espera de validação' },
  { valor: 'granted', rotulo: 'Com acesso' },
  { valor: 'rejected', rotulo: 'Recusado' },
]

const CANAIS = [
  { valor: 'telegram', rotulo: 'Telegram' },
  { valor: 'instagram_dm', rotulo: 'Instagram · mensagem' },
  { valor: 'instagram_comentario', rotulo: 'Instagram · comentário' },
  { valor: 'email', rotulo: 'Email' },
  { valor: 'push', rotulo: 'Notificação na app' },
]

export const CAMPOS_POR_TIPO: Record<TipoDeNo, Campo[]> = {
  entrada: [
    {
      chave: 'origem',
      rotulo: 'Por onde entra',
      tipo: 'escolha',
      opcoes: [
        { valor: 'grupo_telegram', rotulo: 'Entra no grupo do Telegram' },
        { valor: 'dm_telegram', rotulo: 'Escreve ao bot em privado' },
        { valor: 'comentario_ig', rotulo: 'Comenta um post no Instagram' },
        { valor: 'dm_ig', rotulo: 'Manda mensagem no Instagram' },
        { valor: 'registo_site', rotulo: 'Regista-se no site' },
        { valor: 'manual', rotulo: 'Metido à mão' },
      ],
    },
    { chave: 'palavra', rotulo: 'Palavra que dispara', tipo: 'texto', ajuda: 'Vazio = qualquer coisa serve', mostrar: { origem: ['comentario_ig', 'dm_ig', 'dm_telegram'] } },
  ],

  mensagem: [
    { chave: 'canal', rotulo: 'Por onde se envia', tipo: 'escolha', opcoes: CANAIS, padrao: 'telegram' },
    { chave: 'mensagem', rotulo: 'Usa uma mensagem do funil', tipo: 'mensagem', ajuda: 'Escolhe uma das mensagens editáveis — assim há um só texto, e edita-se num sítio' },
    { chave: 'texto', rotulo: 'Ou escreve aqui', tipo: 'texto_longo', ajuda: 'Só usado quando não escolhes uma mensagem acima' },
    {
      chave: 'botoes',
      rotulo: 'Botões',
      tipo: 'lista',
      rotuloAcrescentar: 'Acrescentar botão',
      ajuda: 'Cada botão pode levar a um caminho diferente — é assim que o funil deixa a pessoa escolher',
      linha: [
        { chave: 'texto', rotulo: 'O que diz', tipo: 'texto', obrigatorio: true, exemplo: 'Quero automático' },
        {
          chave: 'faz', rotulo: 'O que faz', tipo: 'escolha', padrao: 'seguir',
          opcoes: [
            { valor: 'seguir', rotulo: 'Segue para o passo seguinte' },
            { valor: 'link', rotulo: 'Abre um link' },
            { valor: 'marcar', rotulo: 'Marca o interesse e segue' },
          ],
        },
        { chave: 'url', rotulo: 'Link', tipo: 'texto', mostrar: { faz: ['link'] } },
      ],
    },
    {
      chave: 'alternativas',
      rotulo: 'Versões que rodam',
      tipo: 'lista',
      rotuloAcrescentar: 'Acrescentar versão',
      dica: 'Usa-se à vez, uma por pessoa',
      ajuda: 'Responder a cinquenta comentários com a mesma frase faz a conta parecer um robô — e o Instagram despromove respostas repetidas',
      linha: [{ chave: 'texto', rotulo: 'Texto', tipo: 'texto_longo', obrigatorio: true }],
      mostrar: { canal: ['instagram_comentario', 'instagram_dm'] },
    },
  ],

  espera: [
    { chave: 'minutos', rotulo: 'Espera', tipo: 'numero', sufixo: 'minutos', padrao: 1440, ajuda: '1440 = um dia' },
    { chave: 'so_se_calado', rotulo: 'Só se a pessoa não responder entretanto', tipo: 'booleano', padrao: true, ajuda: 'Continuar a insistir com quem já respondeu é a forma mais rápida de perder um lead' },
  ],

  condicao: [
    {
      chave: 'campo',
      rotulo: 'O que se verifica',
      tipo: 'escolha',
      opcoes: [
        { valor: 'stage', rotulo: 'Etapa do lead' },
        { valor: 'interesse', rotulo: 'O que disse que quer' },
        { valor: 'mtmauto_passo', rotulo: 'Passo do MTM Auto' },
        { valor: 'broker_uid', rotulo: 'Tem conta de corretora' },
        { valor: 'granted_at', rotulo: 'Já tem acesso' },
        { valor: 'respondeu', rotulo: 'Respondeu alguma coisa' },
        { valor: 'tem_conta_site', rotulo: 'Está registado no site' },
        { valor: 'subscricao', rotulo: 'Tem subscrição ativa' },
      ],
    },
    {
      chave: 'operador',
      rotulo: 'Compara',
      tipo: 'escolha',
      padrao: 'e',
      opcoes: [
        { valor: 'e', rotulo: 'é igual a' },
        { valor: 'nao_e', rotulo: 'não é' },
        { valor: 'existe', rotulo: 'está preenchido' },
        { valor: 'vazio', rotulo: 'está vazio' },
      ],
    },
    { chave: 'valor_stage', rotulo: 'Valor', tipo: 'escolha', opcoes: ETAPAS, mostrar: { campo: ['stage'] } },
    {
      chave: 'valor_interesse', rotulo: 'Valor', tipo: 'escolha',
      opcoes: [
        { valor: 'mtmauto', rotulo: 'Só a app MTM Auto' },
        { valor: 'ecossistema', rotulo: 'O ecossistema todo' },
      ],
      mostrar: { campo: ['interesse'] },
    },
    {
      chave: 'valor_passo', rotulo: 'Valor', tipo: 'escolha',
      opcoes: [
        { valor: 'corretora', rotulo: 'Falta abrir a conta' },
        { valor: 'validado', rotulo: 'Conta validada' },
        { valor: 'app_instalada', rotulo: 'App instalada' },
        { valor: 'a_operar', rotulo: 'Já a operar' },
      ],
      mostrar: { campo: ['mtmauto_passo'] },
    },
    { chave: 'valor', rotulo: 'Valor', tipo: 'texto', mostrar: { campo: ['respondeu', 'subscricao', 'tem_conta_site'] } },
    {
      chave: 'mais',
      rotulo: 'E também',
      tipo: 'lista',
      rotuloAcrescentar: 'Acrescentar verificação',
      ajuda: 'Todas têm de se verificar para o caminho do "sim" ser tomado',
      linha: [
        {
          chave: 'campo', rotulo: 'O quê', tipo: 'escolha', obrigatorio: true,
          opcoes: [
            { valor: 'stage', rotulo: 'Etapa do lead' },
            { valor: 'interesse', rotulo: 'O que disse que quer' },
            { valor: 'mtmauto_passo', rotulo: 'Passo do MTM Auto' },
            { valor: 'broker_uid', rotulo: 'Tem conta de corretora' },
            { valor: 'granted_at', rotulo: 'Já tem acesso' },
            { valor: 'subscricao', rotulo: 'Tem subscrição ativa' },
          ],
        },
        {
          chave: 'operador', rotulo: 'Compara', tipo: 'escolha', padrao: 'e',
          opcoes: [
            { valor: 'e', rotulo: 'é igual a' },
            { valor: 'nao_e', rotulo: 'não é' },
            { valor: 'existe', rotulo: 'está preenchido' },
            { valor: 'vazio', rotulo: 'está vazio' },
          ],
        },
        { chave: 'valor', rotulo: 'Valor', tipo: 'texto', esconder: { operador: ['existe', 'vazio'] } },
      ],
    },
  ],

  acao: [
    {
      chave: 'acao',
      rotulo: 'O que se faz',
      tipo: 'escolha',
      opcoes: [
        { valor: 'etiquetar', rotulo: 'Pôr uma etiqueta no lead' },
        { valor: 'mudar_etapa', rotulo: 'Mudar a etapa' },
        { valor: 'marcar_interesse', rotulo: 'Marcar o que a pessoa quer' },
        { valor: 'marcar_passo', rotulo: 'Marcar o passo do MTM Auto' },
        { valor: 'dar_cupao', rotulo: 'Dar um cupão' },
        { valor: 'dar_grupos', rotulo: 'Libertar os grupos de sinais' },
        { valor: 'avisar_admin', rotulo: 'Avisar-nos a nós' },
      ],
    },
    {
      chave: 'etiquetas', rotulo: 'Etiquetas', tipo: 'lista', rotuloAcrescentar: 'Acrescentar etiqueta',
      linha: [{ chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true }],
      mostrar: { acao: ['etiquetar'] },
    },
    { chave: 'etapa', rotulo: 'Etapa', tipo: 'escolha', opcoes: ETAPAS, mostrar: { acao: ['mudar_etapa'] } },
    { chave: 'cupao', rotulo: 'Código do cupão', tipo: 'texto', ajuda: 'Ex.: 14DAYTRIAL', mostrar: { acao: ['dar_cupao'] } },
  ],

  webhook: [
    { chave: 'metodo', rotulo: 'Método', tipo: 'escolha', padrao: 'POST', opcoes: [{ valor: 'GET', rotulo: 'GET' }, { valor: 'POST', rotulo: 'POST' }] },
    { chave: 'url', rotulo: 'Endereço', tipo: 'texto', obrigatorio: true, exemplo: 'https://…', ajuda: 'O n8n, o nosso próprio endpoint, o que for' },
    { chave: 'corpo', rotulo: 'O que se envia', tipo: 'texto_longo', ajuda: 'JSON. Podes usar {{chat_id}}, {{nome}}, {{etapa}}' },
    {
      chave: 'cabecalhos', rotulo: 'Cabeçalhos', tipo: 'lista', rotuloAcrescentar: 'Acrescentar cabeçalho',
      linha: [
        { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, exemplo: 'Authorization' },
        { chave: 'valor', rotulo: 'Valor', tipo: 'texto', obrigatorio: true },
      ],
    },
    { chave: 'esperar', rotulo: 'Esperar pela resposta antes de seguir', tipo: 'booleano', padrao: false },
    {
      chave: '_aviso_segredo', rotulo: '', tipo: 'aviso',
      ajuda: 'Não ponhas chaves nem passwords nos cabeçalhos daqui: este desenho é lido por qualquer administrador e vai no que se exporta.',
    },
  ],

  divisao: [
    { chave: 'percentagem_a', rotulo: 'Vai pelo primeiro caminho', tipo: 'numero', sufixo: '%', padrao: 50, ajuda: 'O resto segue o segundo' },
    { chave: 'nome_a', rotulo: 'Nome do caminho A', tipo: 'texto', padrao: 'A' },
    { chave: 'nome_b', rotulo: 'Nome do caminho B', tipo: 'texto', padrao: 'B' },
  ],

  irpara: [
    { chave: 'funil', rotulo: 'Salta para', tipo: 'funil' },
    { chave: 'no', rotulo: 'Bloco desse funil', tipo: 'texto', ajuda: 'Vazio = começa do início' },
  ],

  destino: [
    {
      chave: 'conta_como',
      rotulo: 'O que conta como chegada',
      tipo: 'escolha',
      opcoes: [
        { valor: 'registo', rotulo: 'Criou conta no site' },
        { valor: 'app', rotulo: 'Instalou a app' },
        { valor: 'corretora', rotulo: 'Abriu conta na corretora' },
        { valor: 'deposito', rotulo: 'Depositou' },
        { valor: 'conta_ligada', rotulo: 'Ligou a conta de trading' },
        { valor: 'pagou', rotulo: 'Pagou uma subscrição' },
      ],
    },
  ],

  saida: [
    { chave: 'motivo', rotulo: 'Porque se perde aqui', tipo: 'texto_longo', ajuda: 'Escrever o motivo é metade de o resolver' },
    { chave: 'recuperavel', rotulo: 'Dá para tentar recuperar', tipo: 'booleano', padrao: true },
  ],
}

/**
 * Um resumo de uma linha do que o bloco está configurado a fazer.
 *
 * Vai por baixo do título, no próprio bloco. Sem isto, um mapa com trinta caixas obriga a clicar
 * em cada uma para saber o que faz — e a razão de haver um mapa é não ter de o fazer.
 */
export function resumoDoNo(tipo: TipoDeNo, config: Record<string, unknown> | undefined): string {
  const c = config ?? {}
  const v = (k: string) => (c[k] == null || c[k] === '' ? null : String(c[k]))
  const rotuloDe = (campo: string, valor: string | null) => {
    if (!valor) return null
    const def = CAMPOS_POR_TIPO[tipo]?.find((x) => x.chave === campo)
    return def?.opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor
  }

  switch (tipo) {
    case 'espera': {
      const m = Number(v('minutos') ?? 0)
      if (!m) return ''
      return m >= 1440 ? `espera ${Math.round(m / 1440)} dia(s)` : m >= 60 ? `espera ${Math.round(m / 60)}h` : `espera ${m} min`
    }
    case 'mensagem':
      return v('mensagem') ? `mensagem "${v('mensagem')}"` : v('texto') ? String(v('texto')).slice(0, 44) : ''
    case 'condicao': {
      const campo = rotuloDe('campo', v('campo'))
      if (!campo) return ''
      const op = rotuloDe('operador', v('operador') ?? 'e')
      const val = v('valor_stage') ?? v('valor_interesse') ?? v('valor_passo') ?? v('valor')
      return [campo, op, val].filter(Boolean).join(' ')
    }
    case 'acao':
      return rotuloDe('acao', v('acao')) ?? ''
    case 'webhook':
      return v('url') ? `${v('metodo') ?? 'POST'} ${String(v('url')).replace(/^https?:\/\//, '').slice(0, 34)}` : ''
    case 'divisao':
      return v('percentagem_a') ? `${v('percentagem_a')}% / ${100 - Number(v('percentagem_a'))}%` : ''
    case 'entrada':
      return rotuloDe('origem', v('origem')) ?? ''
    case 'destino':
      return rotuloDe('conta_como', v('conta_como')) ?? ''
    case 'irpara':
      return v('funil') ? `→ ${v('funil')}` : ''
    case 'saida':
      return v('motivo') ? String(v('motivo')).slice(0, 44) : ''
    default:
      return ''
  }
}

/**
 * Como se chamam os caminhos que saem de um bloco.
 *
 * Numa condição as duas setas não são iguais — uma é o "sim" e a outra o "não". Mostrá-las sem
 * nome deixa o mapa a mentir por omissão: vê-se que se parte em dois, não se vê para onde vai cada
 * caso, que é a única coisa que interessa saber de uma condição.
 */
export function nomesDosRamos(tipo: TipoDeNo, config: Record<string, unknown> | undefined): string[] {
  if (tipo === 'condicao') return ['sim', 'não']
  if (tipo === 'divisao') {
    const c = config ?? {}
    return [String(c.nome_a ?? 'A'), String(c.nome_b ?? 'B')]
  }
  return []
}

/**
 * Os valores com que um bloco novo nasce.
 *
 * Um bloco acrescentado em branco obriga a preencher tudo antes de fazer alguma coisa, e o que
 * fica por preencher parece esquecido em vez de propositado. Nascer com o razoável já lá dentro
 * é o que faz a diferença entre acrescentar um passo e configurar um passo.
 */
export function valoresPorOmissao(tipo: TipoDeNo): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of CAMPOS_POR_TIPO[tipo] ?? []) {
    if (c.padrao !== undefined) out[c.chave] = c.padrao
  }
  return out
}

export interface Problema {
  noId: string | null
  gravidade: 'erro' | 'aviso'
  texto: string
}

/**
 * O que está partido no desenho.
 *
 * Um mapa que só desenha aceita qualquer coisa — incluindo um bloco para onde ninguém vai, uma
 * seta para um bloco apagado, ou um ciclo que anda à volta para sempre. Nenhuma destas se vê a
 * olho num mapa com trinta caixas, e as três já aconteceram aqui.
 *
 * Distingue-se erro de aviso porque não são a mesma coisa: uma seta para o nada está partida, um
 * bloco sem saída pode ser mesmo o fim do caminho.
 */
export function problemasDoFunil(nos: Array<{
  id: string
  tipo: TipoDeNo
  titulo: string
  seguintes: string[]
}>): Problema[] {
  const problemas: Problema[] = []
  const porId = new Map(nos.map((n) => [n.id, n]))

  for (const n of nos) {
    for (const s of n.seguintes) {
      if (!porId.has(s)) {
        problemas.push({ noId: n.id, gravidade: 'erro', texto: `"${n.titulo}" aponta para um bloco que já não existe` })
      }
    }
    if (!n.seguintes.length && n.tipo !== 'saida' && n.tipo !== 'destino') {
      problemas.push({ noId: n.id, gravidade: 'aviso', texto: `"${n.titulo}" não leva a lado nenhum` })
    }
    // Uma condição com um só caminho não é uma condição: é um passo com uma pergunta decorativa.
    if (n.tipo === 'condicao' && n.seguintes.length < 2) {
      problemas.push({ noId: n.id, gravidade: 'aviso', texto: `"${n.titulo}" é uma condição com um só caminho` })
    }
  }

  // Alcançáveis a partir das entradas. Sem entrada nenhuma, o funil inteiro é inalcançável — e
  // vale mais dizê-lo uma vez do que repeti-lo por cada bloco.
  const entradas = nos.filter((n) => n.tipo === 'entrada')
  if (!entradas.length && nos.length) {
    problemas.push({ noId: null, gravidade: 'erro', texto: 'Não há nenhum bloco de entrada — ninguém chega a este funil' })
  } else {
    const vistos = new Set<string>()
    const porVer = entradas.map((n) => n.id)
    while (porVer.length) {
      const id = porVer.pop() as string
      if (vistos.has(id)) continue
      vistos.add(id)
      for (const s of porId.get(id)?.seguintes ?? []) porVer.push(s)
    }
    for (const n of nos) {
      if (!vistos.has(n.id)) {
        problemas.push({ noId: n.id, gravidade: 'aviso', texto: `Não há caminho da entrada até "${n.titulo}"` })
      }
    }
  }

  // Ciclos: percorre-se cada caminho a marcar por onde se vai passando. Voltar a um bloco que já
  // está no caminho ATUAL é um ciclo; voltar a um já fechado é só dois caminhos que convergem.
  const emCurso = new Set<string>()
  const fechados = new Set<string>()
  const jaDito = new Set<string>()
  const andar = (id: string) => {
    if (emCurso.has(id)) {
      if (!jaDito.has(id)) {
        jaDito.add(id)
        problemas.push({ noId: id, gravidade: 'erro', texto: `"${porId.get(id)?.titulo ?? id}" fecha um ciclo — o funil anda à volta` })
      }
      return
    }
    if (fechados.has(id)) return
    emCurso.add(id)
    for (const s of porId.get(id)?.seguintes ?? []) if (porId.has(s)) andar(s)
    emCurso.delete(id)
    fechados.add(id)
  }
  for (const n of nos) andar(n.id)

  return problemas
}
