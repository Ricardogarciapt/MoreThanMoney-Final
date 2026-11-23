import { NextRequest, NextResponse } from 'next/server'
import { runLeadFunnelReply } from '@/lib/telegram-lead-funnel'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { enviarWhatsApp, lerEstadoDoContacto, registarEntrada } from '@/lib/whatsapp-mensageiro'
import { talvezAudioWhatsApp } from '@/lib/whatsapp/audio'

/**
 * Webhook do WhatsApp (Meta Cloud API) — funil de vendas MTM no WhatsApp, reutilizando o MESMO
 * cérebro closer do Telegram (runLeadFunnelReply), e por isso a escada que anuncia é sempre a de
 * `lib/escada-precos.ts`. Este comentário dizia «PU Prime 300$» muito depois de o mínimo ter
 * passado a 350 — um comentário errado é a próxima pessoa a escrever o número errado.
 *
 * PREPARADO mas inerte até configurares no VPS/Meta — verificado a 27/09: nenhuma destas variáveis
 * existe na Vercel nem no `.env.local`.
 *  - WHATSAPP_VERIFY_TOKEN     → token de verificação do webhook (GET hub.verify_token)
 *  - WHATSAPP_TOKEN            → token de acesso (permanente/system-user) para enviar mensagens
 *  - WHATSAPP_PHONE_NUMBER_ID  → id do número de WhatsApp Business (Cloud API)
 *  Alternativa VPS: WHATSAPP_RELAY_URL (+ CRON_SECRET) para enviar via um relay próprio no VPS.
 * Os passos do lado da Meta, que só o dono pode fazer, estão em `docs/whatsapp-setup.md`.
 *
 * O ENVIO NÃO VIVE AQUI (27/09). Vive em `lib/whatsapp-mensageiro.ts`, por cima das regras puras de
 * `lib/whatsapp-envio.ts`. O `sendWhatsApp()` que estava neste ficheiro mandava sempre texto livre e
 * engolia o erro num `.catch(() => {})`: fora da janela de 24 horas da Meta isso é um pedido recusado
 * que ninguém vê, e tentativas recusadas a acumular são o caminho para o número ser marcado como
 * spam. Cada entrada passa a ficar registada (`whatsapp_mensagens`) porque é a última mensagem DELA
 * que define a janela — sem esse registo, o sistema não sabe se pode responder com texto livre.
 */
export const dynamic = 'force-dynamic'

// 1) Verificação do webhook (Meta faz um GET com hub.challenge ao configurar)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode = p.get('hub.mode')
  const token = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ ok: false, error: 'verify failed' }, { status: 403 })
}

interface WAMessage {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  /** Toque num botão de resposta rápida de um TEMPLATE. */
  button?: { text?: string; payload?: string }
  /** Toque num botão ou numa linha de lista de uma mensagem interativa. */
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }
}

/** O que a pessoa escreveu ou tocou, e o id do botão/linha quando tocou. Puro. */
/** A confirmação de saída na língua do contacto (a que escolheu, ou a do indicativo). */
async function textoDeSaida(from: string, numero: string): Promise<string> {
  const { ehLingua, linguaDoIndicativo } = await import('@/lib/whatsapp/linguas')
  const { data } = await getSupabaseAdmin().from('telegram_leads').select('lang').eq('chat_id', `wa:${from}`).maybeSingle()
  const l = ehLingua(data?.lang) ? data!.lang : linguaDoIndicativo(numero)
  return {
    pt: 'Feito, não voltas a receber mensagens nossas por aqui. Se um dia quiseres voltar, é só escreveres. 🙏',
    en: "Done, you won't get any more messages from us here. If you ever want to come back, just write. 🙏",
    fr: "C'est fait, tu ne recevras plus de messages de notre part ici. Si un jour tu veux revenir, écris-nous. 🙏",
    de: 'Erledigt, du bekommst hier keine Nachrichten mehr von uns. Wenn du irgendwann zurückkommen willst, schreib einfach. 🙏',
    es: 'Hecho, no volverás a recibir mensajes nuestros por aquí. Si algún día quieres volver, solo escríbenos. 🙏',
  }[l as 'pt' | 'en' | 'fr' | 'de' | 'es']
}

function lerEntrada(m: WAMessage): { texto: string; botao: string | null } {
  const br = m.interactive?.button_reply
  const lr = m.interactive?.list_reply
  if (br) return { texto: (br.title ?? br.id ?? '').trim(), botao: (br.id ?? br.title ?? '').trim() || null }
  if (lr) return { texto: (lr.title ?? lr.id ?? '').trim(), botao: (lr.id ?? lr.title ?? '').trim() || null }
  if (m.button) return { texto: (m.button.text ?? '').trim(), botao: (m.button.payload || m.button.text || '').trim() || null }
  return { texto: (m.text?.body ?? '').trim(), botao: null }
}

/**
 * O funil de WhatsApp só trata LEADS NOVOS — nunca contactos/clientes já existentes.
 * "Existente" = já é utilizador registado (profiles.phone/whatsapp ou users.phone) OU já tem
 * um registo de lead com outra origem que não o próprio bot de WhatsApp (ex.: contacto humano).
 * Um número novo (ou já iniciado por este bot) continua o funil normalmente.
 */
async function isNewWhatsAppLead(phone: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const digits = phone.replace(/\D/g, '')
  const last9 = digits.slice(-9)
  // 1) Já é cliente/utilizador registado? → NÃO é lead novo (não abordar).
  const like = `%${last9}`
  const { data: prof } = await supabase
    .from('profiles')
    .select('id')
    .or(`phone.ilike.${like},whatsapp.ilike.${like}`)
    .limit(1)
  if (prof?.length) return false
  const { data: usr } = await supabase.from('users').select('id').ilike('phone', like).limit(1)
  if (usr?.length) return false
  // 2) Já existe lead com origem diferente do bot de WhatsApp (contacto humano/outro canal)?
  const { data: lead } = await supabase
    .from('telegram_leads')
    .select('source')
    .eq('chat_id', `wa:${phone}`)
    .maybeSingle()
  if (lead && lead.source && lead.source !== 'whatsapp') return false
  return true
}

// 2) Mensagens recebidas → cérebro do funil → resposta
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  try {
    const changes = body?.entry?.[0]?.changes ?? []
    for (const ch of changes) {
      const value = ch?.value ?? {}
      const contactName = value?.contacts?.[0]?.profile?.name ?? null
      for (const m of (value?.messages ?? []) as WAMessage[]) {
        const from = m.from
        const { texto: text, botao } = lerEntrada(m)
        if (!from || !text) continue

        /**
         * REGISTAR A ENTRADA PRIMEIRO, ANTES DE QUALQUER DECISÃO.
         *
         * A janela de 24 horas é um facto do lado da Meta: abre porque ela escreveu, não porque nós
         * respondemos. Se este registo ficasse depois do filtro de leads, os contactos que o funil
         * ignora (clientes, contactos humanos) ficavam sem janela registada — e no dia em que o dono
         * quisesse falar com um deles pela app, o sistema recusava texto livre a jurar que a janela
         * estava fechada, quando estava aberta há dez minutos.
         */
        const numero = await registarEntrada({ numero: from, texto: text, waMessageId: m.id ?? null, nome: contactName })

        /**
         * SAIR / PARAR — o template de seguimento promete isto, por isso tem de funcionar (19/11).
         * Grava na exclusão global e marca o consentimento retirado; responde uma vez (janela aberta,
         * grátis) e não passa pelo funil.
         */
        if (
          (/^(sair|parar|stop|cancelar|unsubscribe|arr[eê]ter|abmelden|baja)[.!]?$/i.test(text) ||
            /^(n[aã]o quero receber|stop messages|ne plus recevoir|nicht mehr erhalten|no quiero recibir)/i.test(text)) &&
          numero
        ) {
          const db = getSupabaseAdmin()
          const agora = new Date().toISOString()
          const { data: ja } = await db.from('contacto_exclusao').select('identificador').eq('identificador', numero).limit(1)
          if (!ja?.length) {
            await db.from('contacto_exclusao').insert({ identificador: numero, canal_origem: 'whatsapp', pedido_em: agora, nota: `respondeu «${text}» no WhatsApp` })
          }
          await db.from('captacao_consentimento').insert({
            telefone: numero, canal: 'whatsapp', base_legal: 'sem_base', prova: `mensagem WhatsApp «${text}»`,
            retirado_em: agora, retirado_por: 'whatsapp:sair', origem: 'whatsapp',
          })
          const estadoSair = await lerEstadoDoContacto(numero)
          await enviarWhatsApp({
            para: from,
            finalidade: 'resposta',
            texto: await textoDeSaida(from, numero),
            estado: { ...estadoSair, retirou: false, ultimaEntradaIso: estadoSair.ultimaEntradaIso ?? agora },
          })
          continue
        }

        /**
         * FUNIL HÍBRIDO (19/11): quem tocou num botão, ou está a meio do guião (stage `wa_*`), segue o
         * guião texto → áudio → lista → áudio → link (`lib/whatsapp/fluxo.ts`). Vem ANTES do filtro de
         * leads novos porque o reencontro é precisamente com contactos que o Ricardo já tem.
         */
        const { data: est } = await getSupabaseAdmin().from('telegram_leads').select('stage').eq('chat_id', `wa:${from}`).maybeSingle()
        const noGuiao = typeof est?.stage === 'string' && est.stage.startsWith('wa_') && est.stage !== 'wa_humano'
        if (numero) {
          if (botao || noGuiao) {
            try {
              const { tratarFluxoWhatsApp } = await import('@/lib/whatsapp/fluxo')
              if (await tratarFluxoWhatsApp({ from, e164: numero, texto: text, botao, nome: contactName })) continue
            } catch (e) {
              console.error('[whatsapp] fluxo falhou, segue o closer:', e instanceof Error ? e.message : e)
            }
          }
        }

        // SÓ leads novos — nunca contactos/clientes existentes.
        // Quem está no guião (reencontro) é contacto do Ricardo de propósito: o closer continua com ele.
        if (!noGuiao && !(await isNewWhatsAppLead(from))) {
          console.log('[whatsapp] contacto existente — funil ignorado:', from)
          continue
        }
        // Mesmo funil do Telegram + MESMAS tags (source='whatsapp') — estado por chat_id 'wa:<n>'.
        const reply = await runLeadFunnelReply({
          chatId: `wa:${from}`,
          firstName: contactName,
          username: from,
          userText: text,
          source: 'whatsapp',
        })

        /**
         * `finalidade: 'resposta'` e não 'campanha', porque é isso que isto é: ela escreveu agora e
         * está à espera. A origem é o acto dela, e a janela acabou de abrir nesta mesma iteração —
         * por isso passa-se o estado já lido, com a entrada que se acabou de gravar, em vez de deixar
         * o mensageiro ir buscá-lo outra vez e correr o risco de ler antes de a escrita assentar.
         */
        const estado = numero ? await lerEstadoDoContacto(numero) : undefined
        /**
         * O CÓDIGO DO AGENTE SEGUE O LEAD, mesmo quando ele muda de canal.
         *
         * O estado deste lead vive em `telegram_leads` com `chat_id = 'wa:<numero>'` — é a mesma
         * tabela, de propósito (ver `runLeadFunnelReply`). Logo, se ele chegou por um deep-link de
         * agente, o código está lá e aplica-se aqui: os links da resposta levam `?ag=`, e a
         * conversa de WhatsApp que acabar numa compra liga-se a quem a começou.
         *
         * Sem código, a mensagem sai exactamente igual — só fica escrita como não atribuível. A
         * capacidade de responder nunca depende de haver atribuição.
         */
        const { data: leadWa } = await getSupabaseAdmin()
          .from('telegram_leads')
          .select('agente_codigo')
          .eq('chat_id', `wa:${from}`)
          .maybeSingle()
        const r = await enviarWhatsApp({
          para: from,
          finalidade: 'resposta',
          texto: reply || 'Diz-me só: procuras aprender, copiar sinais prontos ou algo automático? 🙂',
          estado: estado ? { ...estado, ultimaEntradaIso: estado.ultimaEntradaIso ?? new Date().toISOString() } : undefined,
          agente: {
            funil: 'whatsapp:funil',
            codigoExplicito: (leadWa as { agente_codigo?: string | null } | null)?.agente_codigo ?? undefined,
          },
        })
        if (!r.enviado) console.warn(`[whatsapp] resposta ao lead não saiu (${r.codigo}): ${r.porque}`)
        else if (reply) {
          // Áudio na voz do Ricardo (quebra-gelo ou fecho), se o interruptor `whatsapp_audio` deixar.
          const a = await talvezAudioWhatsApp({ para: from, resposta: reply, referencia: m.id ?? `${from}-${Date.now()}` })
          if (!a.enviado && a.motivo !== 'desligado' && a.motivo !== 'travas') console.warn('[whatsapp] áudio não saiu:', a.motivo)
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] webhook erro:', e instanceof Error ? e.message : e)
  }
  // Responder 200 sempre (a Meta reenviaria em erro).
  return NextResponse.json({ ok: true })
}
