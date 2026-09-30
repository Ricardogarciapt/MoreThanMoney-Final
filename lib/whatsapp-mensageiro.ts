/**
 * ENVIAR PELO WHATSAPP — a parte que toca na rede e na base.
 *
 * A decisão de SE se pode escrever a alguém, e de se é texto livre ou template, está toda em
 * `whatsapp-envio.ts` e é pura. Este ficheiro faz o resto, e apenas o resto: lê o estado da pessoa,
 * pede a decisão, e só depois — se ela passar — fala com a Meta. Em qualquer dos casos escreve uma
 * linha em `whatsapp_mensagens`.
 *
 * O QUE ESTE FICHEIRO SE PROÍBE DE FAZER
 *   · Falhar em silêncio. O envio antigo terminava em `.catch(() => {})`: quem chamava não tinha como
 *     saber que a mensagem não saiu. Aqui devolve-se sempre um resultado que diz o que aconteceu, e
 *     grava-se a razão.
 *   · Tentar texto livre fora da janela. Isso leva erro da Meta, e um número que acumula tentativas
 *     falhadas e mensagens a quem não as espera é um número que a Meta marca como spam.
 *   · Presumir permissão. Sem origem conhecida não se envia. O silêncio é não.
 *
 * ESTADO A 27/09: INERTE, E DE PROPÓSITO.
 * `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_VERIFY_TOKEN` não existem na Vercel nem
 * no `.env.local` — foi verificado, não é suposição. Sem elas, `enviarWhatsApp` recusa com
 * `sem_credenciais` e grava a recusa. O que falta é do lado da Meta e só o dono o pode fazer:
 * `docs/whatsapp-setup.md`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { BaseLegal } from '@/lib/captacao-consentimento'
import {
  corpoParaCloudApi,
  decidirEnvio,
  normalizarE164,
  variantesDoNumero,
  type CorpoTemplate,
  type Decisao,
  type EstadoDoContacto,
  type Finalidade,
} from '@/lib/whatsapp-envio'

/** Versão da Graph API. Fixa de propósito: a Meta muda comportamento entre versões. */
const GRAPH = 'v21.0'

export interface Credenciais {
  token: string
  phoneNumberId: string
  /** Relay próprio no VPS, quando existir. Substitui a chamada directa à Meta. */
  relayUrl: string | null
}

/**
 * As credenciais, ou a razão exacta de não haver.
 *
 * Devolve a razão em vez de um booleano porque «não está configurado» é uma resposta inútil quando
 * falta apenas uma das duas variáveis — e é sempre uma delas.
 */
export function credenciaisWhatsApp(): { creds: Credenciais | null; falta: string } {
  const token = (process.env.WHATSAPP_TOKEN ?? '').trim()
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()
  const relayUrl = (process.env.WHATSAPP_RELAY_URL ?? '').trim() || null

  /**
   * O RELAY NÃO DISPENSA A DECISÃO, SÓ O TRANSPORTE.
   *
   * `WHATSAPP_RELAY_URL` manda o pedido para um serviço nosso no VPS em vez de falar directamente
   * com a Meta. Serve para ter o token num sítio só. O que NÃO faz é mudar as regras: a janela das
   * 24 horas e os templates são da Meta, e o relay acaba a falar com a mesma API. Por isso o relay é
   * escolhido depois de a decisão estar tomada, nunca antes — um relay a receber texto livre fora da
   * janela leva o mesmo erro, só mais longe de onde se consegue ler.
   */
  if (relayUrl) return { creds: { token, phoneNumberId, relayUrl }, falta: '' }

  const emFalta = [!token && 'WHATSAPP_TOKEN', !phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID'].filter(Boolean)
  if (emFalta.length) return { creds: null, falta: emFalta.join(' e ') }
  return { creds: { token, phoneNumberId, relayUrl: null }, falta: '' }
}

// ── Ler o estado da pessoa ───────────────────────────────────────────────────────────────────────

/**
 * O que se sabe deste número: quando é que ela escreveu pela última vez, e o que o livro do
 * consentimento diz.
 *
 * SOBRE O LIVRO E O TELEFONE — o que serve e o que não serve.
 * `captacao_consentimento` é o livro certo e usa-se: tem a coluna `telefone`, tem `base_legal`, tem
 * `prova` e tem `retirado_em`, que é tudo o que aqui é preciso. Duas coisas dele NÃO servem, e não
 * se contornam em silêncio:
 *   · A vista `captacao_permissao_email` resolve o histórico POR EMAIL. Para telefone não existe
 *     vista equivalente, por isso o histórico resolve-se aqui, com a mesma regra: qualquer
 *     `retirado_em` bloqueia, e o `consentimento` só vale se nunca foi retirado.
 *   · A coluna `telefone` é texto livre — nasceu antes de haver normalização. Procura-se por todas
 *     as escritas do mesmo número (`variantesDoNumero`), porque procurar só pelo E.164 era declarar
 *     «não deu consentimento» a quem deu.
 */
export async function lerEstadoDoContacto(e164: string): Promise<EstadoDoContacto> {
  const db = getSupabaseAdmin()

  const { data: entrada } = await db
    .from('whatsapp_mensagens')
    .select('criado_em')
    // `telefone`, não `numero` — a coluna chama-se assim. Este filtro nunca acertava em nada, e um
    // filtro que não acerta devolve «nunca escreveu», que é a resposta que FECHA a janela das 24
    // horas. Ou seja: mesmo que o livro gravasse, o sistema continuaria a recusar texto livre a
    // quem tinha acabado de nos escrever.
    .eq('telefone', e164)
    .eq('direcao', 'entrada')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: linhas } = await db
    .from('captacao_consentimento')
    .select('base_legal, canal, retirado_em, pedido_em')
    .in('telefone', variantesDoNumero(e164))
    .order('pedido_em', { ascending: false })

  const registos = linhas ?? []
  // Qualquer retirada bloqueia, seja em que linha for. A mesma regra da vista dos emails.
  const retirou = registos.some((l) => !!l.retirado_em)
  const vivo = registos.find((l) => !l.retirado_em) ?? registos[0] ?? null

  return {
    baseLegal: (vivo?.base_legal as BaseLegal | undefined) ?? null,
    retirou,
    canal: vivo?.canal ?? null,
    ultimaEntradaIso: (entrada?.criado_em as string | undefined) ?? null,
  }
}

// ── Escrever no livro ────────────────────────────────────────────────────────────────────────────

interface LinhaDoLivro {
  numero: string
  direcao: 'entrada' | 'saida'
  tipo: 'texto' | 'template'
  template?: string | null
  corpo?: string | null
  estado: 'recebida' | 'enviada' | 'recusada' | 'falhou'
  codigo?: string | null
  motivo?: string | null
  waMessageId?: string | null
}

/**
 * Gravar nunca deita o envio abaixo.
 *
 * Se o livro falhar, a mensagem que já saiu não deve ser tratada como não enviada — e uma recusa não
 * deve virar excepção por causa de um `insert`. O erro fica no `console` para não desaparecer.
 */
/**
 * OS NOMES DAS COLUNAS SÃO OS DA TABELA, e isto teve de ser aprendido à força.
 *
 * Até 30/09/2026 esta função escrevia `numero`, `corpo` e `codigo`. A tabela chama-lhes `telefone`
 * e `texto`, e `codigo` não existe de todo. Ou seja: o insert falhava SEMPRE, desde o primeiro dia,
 * e o `catch` mandava o erro para uma consola que ninguém lê. O livro do WhatsApp esteve vazio
 * durante meses sem uma única queixa — porque não havia nada a que se queixar: tudo respondia 200.
 *
 * Foi descoberto porque a primeira mensagem real não apareceu na base. Sem essa mensagem, o erro
 * podia ter ficado lá mais uns meses.
 *
 * `whatsapp-mensageiro.check.ts` compara estes nomes com os da tabela. Se alguém voltar a mexer
 * num, a guarda cai antes do deploy.
 */
async function gravar(l: LinhaDoLivro): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from('whatsapp_mensagens').insert({
      telefone: l.numero,
      direcao: l.direcao,
      tipo: l.tipo,
      template: l.template ?? null,
      texto: l.corpo ?? null,
      estado: l.estado,
      // `codigo` não existe na tabela; o código curto da decisão vive em `motivo`, junto com a
      // frase em português — que é o que se lê quando se vai perceber porque é que algo não saiu.
      motivo: [l.codigo, l.motivo].filter(Boolean).join(' · ') || null,
      wa_message_id: l.waMessageId ?? null,
    })
    /**
     * O erro é ENGOLIDO de propósito — um livro que não grava não pode fazer cair um webhook nem
     * impedir uma mensagem de sair — mas passa a ser BARULHENTO. O `console.error` de antes era
     * indistinguível de silêncio; este diz o que tentou escrever, para o próximo não ter de
     * adivinhar como eu tive.
     */
    if (error) {
      console.error(
        `[whatsapp] LIVRO NÃO GRAVOU (${l.direcao} ${l.numero}): ${error.message}` +
        (error.details ? ` · ${error.details}` : '') +
        ' — confere os nomes das colunas contra a tabela.',
      )
    }
  } catch (e) {
    console.error('[whatsapp] livro não gravou:', e instanceof Error ? e.message : e)
  }
}

/**
 * Registar uma mensagem RECEBIDA. É isto que abre a janela das 24 horas.
 *
 * Tem de ser chamado pelo webhook a cada entrada, incluindo as que o funil ignora: a janela é um
 * facto do lado da Meta, não uma consequência de nós termos respondido. Um número cuja entrada não
 * ficou registada é um número a quem o sistema vai recusar texto livre por achar que a janela está
 * fechada quando ela está aberta.
 */
export async function registarEntrada(args: { numero: string; texto: string; waMessageId?: string | null }): Promise<string | null> {
  const { e164 } = normalizarE164(args.numero)
  if (!e164) {
    console.warn('[whatsapp] entrada com número não normalizável:', args.numero)
    return null
  }
  await gravar({
    numero: e164,
    direcao: 'entrada',
    tipo: 'texto',
    corpo: args.texto.slice(0, 4000),
    estado: 'recebida',
    waMessageId: args.waMessageId ?? null,
  })
  return e164
}

// ── Enviar ───────────────────────────────────────────────────────────────────────────────────────

export interface PedidoDeEnvio {
  para: string
  finalidade: Finalidade
  /** Texto livre — só dentro da janela. */
  texto?: string
  /** Template aprovado — a única coisa que passa fora da janela. */
  template?: CorpoTemplate
  /** Estado já lido (evita uma ida à base quando quem chama acabou de o ler). */
  estado?: EstadoDoContacto
}

export interface ResultadoEnvio {
  enviado: boolean
  decisao: Decisao
  /** Código curto para registo e para quem chama decidir o que fazer a seguir. */
  codigo: string
  /** Em português. É isto que vai para o livro e para os logs. */
  porque: string
  waMessageId?: string | null
}

/**
 * O único caminho por onde sai uma mensagem de WhatsApp desta casa.
 *
 * Passa sempre pelos mesmos três passos, nesta ordem, e é a ordem que importa: decidir, depois
 * enviar, depois gravar. Ao contrário — enviar e decidir a seguir — é o que faz uma mensagem sair
 * para quem pediu para não receber mais.
 */
export async function enviarWhatsApp(p: PedidoDeEnvio): Promise<ResultadoEnvio> {
  const agoraMs = Date.now()
  const tipo: 'texto' | 'template' = p.template ? 'template' : 'texto'
  const { e164 } = normalizarE164(p.para)

  const estado = p.estado ?? (e164 ? await lerEstadoDoContacto(e164) : { baseLegal: null, retirou: false, canal: null, ultimaEntradaIso: null })

  const decisao = decidirEnvio(
    { para: p.para, tipo, templateNome: p.template?.nome ?? null, finalidade: p.finalidade },
    estado,
    agoraMs,
  )

  const corpoParaLivro = p.template
    ? `[${p.template.nome}/${p.template.idioma}] ${(p.template.parametros ?? []).join(' | ')}`
    : (p.texto ?? '')

  if (!decisao.pode) {
    // A recusa fica escrita. Uma recusa que não se grava é um silêncio sem explicação no dia em que
    // alguém perguntar porque é que a mensagem não chegou.
    if (decisao.para) {
      await gravar({
        numero: decisao.para,
        direcao: 'saida',
        tipo,
        template: p.template?.nome ?? null,
        corpo: corpoParaLivro.slice(0, 4000),
        estado: 'recusada',
        codigo: decisao.codigo,
        motivo: decisao.porque,
      })
    }
    console.warn(`[whatsapp] recusado (${decisao.codigo}): ${decisao.porque}`)
    return { enviado: false, decisao, codigo: decisao.codigo, porque: decisao.porque }
  }

  // Daqui para baixo `decisao.para` é um E.164 válido (foi a decisão que o validou).
  const para = decisao.para as string

  if (tipo === 'texto' && !(p.texto ?? '').trim()) {
    const porque = 'mensagem de texto vazia — não se manda'
    await gravar({ numero: para, direcao: 'saida', tipo, estado: 'recusada', codigo: 'texto_vazio', motivo: porque })
    return { enviado: false, decisao, codigo: 'texto_vazio', porque }
  }

  const { creds, falta } = credenciaisWhatsApp()
  if (!creds) {
    const porque = `${falta} em falta — nada foi enviado (ver docs/whatsapp-setup.md)`
    await gravar({
      numero: para,
      direcao: 'saida',
      tipo,
      template: p.template?.nome ?? null,
      corpo: corpoParaLivro.slice(0, 4000),
      estado: 'recusada',
      codigo: 'sem_credenciais',
      motivo: porque,
    })
    console.warn(`[whatsapp] ${porque}`)
    return { enviado: false, decisao, codigo: 'sem_credenciais', porque }
  }

  const corpo = corpoParaCloudApi(
    para,
    p.template ? { tipo: 'template', template: p.template } : { tipo: 'texto', texto: p.texto ?? '' },
  )

  const url = creds.relayUrl ?? `https://graph.facebook.com/${GRAPH}/${creds.phoneNumberId}/messages`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (creds.relayUrl) headers.authorization = `Bearer ${(process.env.CRON_SECRET ?? '').trim()}`
  else headers.authorization = `Bearer ${creds.token}`

  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(corpo) })
    const txt = await r.text()
    if (!r.ok) {
      // O corpo do erro da Meta é o que diz se foi a janela, o template ou o token. Guarda-se, porque
      // é a diferença entre corrigir em dez minutos e adivinhar durante uma semana.
      const porque = `a Meta recusou (HTTP ${r.status}): ${txt.slice(0, 500)}`
      await gravar({
        numero: para,
        direcao: 'saida',
        tipo,
        template: p.template?.nome ?? null,
        corpo: corpoParaLivro.slice(0, 4000),
        estado: 'falhou',
        codigo: `http_${r.status}`,
        motivo: porque,
      })
      console.error(`[whatsapp] ${porque}`)
      return { enviado: false, decisao, codigo: `http_${r.status}`, porque }
    }

    let waId: string | null = null
    try {
      waId = (JSON.parse(txt) as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null
    } catch {
      /* relay próprio pode responder outra coisa; a mensagem saiu de igual maneira */
    }
    await gravar({
      numero: para,
      direcao: 'saida',
      tipo,
      template: p.template?.nome ?? null,
      corpo: corpoParaLivro.slice(0, 4000),
      estado: 'enviada',
      codigo: decisao.codigo,
      motivo: decisao.porque,
      waMessageId: waId,
    })
    return { enviado: true, decisao, codigo: 'ok', porque: decisao.porque, waMessageId: waId }
  } catch (e) {
    const porque = `rede falhou: ${e instanceof Error ? e.message : String(e)}`
    await gravar({
      numero: para,
      direcao: 'saida',
      tipo,
      template: p.template?.nome ?? null,
      corpo: corpoParaLivro.slice(0, 4000),
      estado: 'falhou',
      codigo: 'rede',
      motivo: porque,
    })
    console.error(`[whatsapp] ${porque}`)
    return { enviado: false, decisao, codigo: 'rede', porque }
  }
}
