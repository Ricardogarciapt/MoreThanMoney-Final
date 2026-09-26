/**
 * QUEM ENTRA NO GRUPO PASSA A EXISTIR — registar, acolher uma vez, e levar ao pipeline.
 *
 * O DEFEITO QUE ISTO CORRIGE
 * O grupo "MTM System" tinha 62 membros e o pipeline não conhecia nenhum. Duas causas, e as duas
 * tinham de cair:
 *
 *  1. O webhook não recebia updates `chat_member`, que é o ÚNICO sinal de quem entra por link de
 *    convite num supergrupo. Isso trata-se em `lib/telegram-grupo-membros.ts` (a leitura) e em
 *    `allowed_updates` na API do Telegram (ver a nota no fim da migração 140 — é um passo do dono).
 *  2. O acolhimento publicava a mensagem e ESQUECIA a pessoa. Quem não carregasse no botão
 *    desaparecia para sempre: não ficava lead, não entrava no pipeline, ninguém lhe voltava a falar.
 *
 * A segunda é a que este ficheiro resolve. A partir de agora quem entra fica em
 * `telegram_grupo_membros` (o registo) E em `telegram_leads` (o lead), e a ingestão da manhã
 * (`lib/backoffice-dia-ingestao.ts`, fonte 'telegram') leva-o ao pipeline sozinho.
 *
 * ACOLHER UMA VEZ, E SÓ UMA
 * Agora que os dois tipos de update são lidos, os dois podem chegar para a MESMA entrada. A
 * desduplicação não é um `if` a ler antes de escrever — é a chave primária de
 * `telegram_grupo_membros`: insere-se com `ignoreDuplicates` e a base diz se fomos os primeiros.
 * Um `select` seguido de um `insert` tem uma janela entre os dois, e dois updates que chegam ao
 * mesmo tempo passam os dois por ela.
 *
 * O BOT NÃO PODE INICIAR UMA DM
 * Não há aqui — nem pode haver — caminho nenhum que mande mensagem privada a quem acabou de entrar:
 * o Telegram responde 403 a quem nunca escreveu ao bot. O acolhimento é NO GRUPO, com um botão que
 * leve a pessoa a abrir ela a conversa. Há uma guarda a varrer este ficheiro para o provar.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken, MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'
import {
  STAGE_MEMBRO_DE_GRUPO,
  origemDoGrupo,
  type MudancaDeMembro,
} from '@/lib/telegram-grupo-membros'

type Supa = ReturnType<typeof getSupabaseAdmin>

const T_MEMBROS = 'telegram_grupo_membros'

export interface ResumoDeEntradas {
  vistos: number
  novos: number
  acolhidos: number
  leadsCriados: number
  saidas: number
}

/** O grupo que conta como funil de leads. `null` = ainda não foi escolhido no /admin. */
async function grupoDeLeads(db: Supa): Promise<string | null> {
  try {
    const { data } = await db
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_leads_group_id')
      .maybeSingle()
    const id = (data?.value as { chat_id?: string } | null)?.chat_id
    return id ? String(id) : null
  } catch {
    return null
  }
}

/**
 * A mensagem de boas-vindas, NO GRUPO, com o botão que abre a conversa.
 *
 * O texto vive em `lib/mensagens-funil.ts` (`boas_vindas_grupo`) e é editável no /admin/social —
 * mudar uma vírgula aqui obrigava a um commit e a um deploy, e por isso ninguém a mudava. O nome do
 * bot vem de uma fonte só (`MTMCOPY_BOT_USERNAME`): o link do botão é a coisa que mais custa ter
 * errada, porque falha em silêncio para todos.
 */
async function acolherNoGrupo(grupoId: string, nome: string | null): Promise<boolean> {
  const token = getMtmcopyBotToken()
  if (!token) return false
  const { lerMensagem } = await import('@/lib/mensagens-funil')
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: grupoId,
        text: await lerMensagem('boas_vindas_grupo', { nome: nome ? `, ${nome.split(' ')[0]}` : '' }),
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Falar com o assistente MTM', url: `https://t.me/${MTMCOPY_BOT_USERNAME()}?start=lead` }],
          ],
        },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Escreve o lead — sem NUNCA pisar o que já existe.
 *
 * `chat_id` é o id do UTILIZADOR e não do grupo, de propósito: numa conversa privada o Telegram usa
 * o id do utilizador como id do chat, por isso esta é a mesma chave que o funil usa quando a pessoa
 * escrever ao bot. As duas linhas fundem-se naturalmente em vez de se duplicarem.
 *
 * Se JÁ existe linha, não se toca no `stage` nem na `source`: alguém que já é `granted` (cliente com
 * acesso dado) e volta a entrar no grupo não pode ser rebaixado a lead — mandava a equipa abordar um
 * cliente como se fosse desconhecido, que é a forma mais rápida de lhe perder a confiança.
 */
async function escreverLead(db: Supa, m: MudancaDeMembro): Promise<boolean> {
  try {
    const { data: existe } = await db
      .from('telegram_leads')
      .select('chat_id')
      .eq('chat_id', m.tgUserId)
      .maybeSingle()

    const agora = new Date().toISOString()
    if (existe) {
      await db
        .from('telegram_leads')
        .update({ first_name: m.nome, username: m.username, updated_at: agora })
        .eq('chat_id', m.tgUserId)
      return false
    }

    const { error } = await db.from('telegram_leads').insert({
      chat_id: m.tgUserId,
      first_name: m.nome,
      username: m.username,
      // Ver `STAGE_MEMBRO_DE_GRUPO`: este estado é escolhido para NÃO cair na lista do follow-up
      // por DM. O bot não pode escrever primeiro a quem nunca lhe escreveu.
      stage: STAGE_MEMBRO_DE_GRUPO,
      source: origemDoGrupo(m.tituloGrupo),
      message_count: 0,
      followup_count: 0,
      updated_at: agora,
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Trata um lote de alterações de pertença, venham elas de `chat_member` ou da mensagem de serviço.
 *
 * Nunca lança: isto corre dentro do webhook, e um erro aqui dava 500 a TODOS os updates do bot — o
 * Telegram passaria a reenviar tudo e o funil inteiro parava por causa de uma entrada num grupo.
 */
export async function registarMudancasDeMembros(
  db: Supa,
  mudancas: readonly MudancaDeMembro[],
): Promise<ResumoDeEntradas> {
  const resumo: ResumoDeEntradas = { vistos: 0, novos: 0, acolhidos: 0, leadsCriados: 0, saidas: 0 }
  if (!mudancas.length) return resumo

  const leads = await grupoDeLeads(db)
  const agora = new Date().toISOString()

  for (const m of mudancas) {
    resumo.vistos++
    try {
      if (m.motivo === 'saiu') {
        await db
          .from(T_MEMBROS)
          .update({ saiu_em: agora, nome: m.nome, username: m.username })
          .eq('grupo_id', m.grupoId)
          .eq('tg_user_id', m.tgUserId)
        resumo.saidas++
        await radar(db, m)
        continue
      }

      /**
       * FOMOS OS PRIMEIROS A VER ESTA ENTRADA?
       *
       * `ignoreDuplicates` + `select`: a base responde com a linha quando a inseriu e com nada
       * quando já existia. É a pergunta e a escrita no mesmo movimento — é isto que impede o
       * acolhimento a dobrar quando o `chat_member` e a mensagem de serviço chegam os dois.
       */
      const { data: inserido } = await db
        .from(T_MEMBROS)
        .upsert(
          {
            grupo_id: m.grupoId,
            tg_user_id: m.tgUserId,
            nome: m.nome,
            username: m.username,
            via: m.via,
            primeira_entrada: agora,
            ultima_entrada: agora,
          },
          { onConflict: 'grupo_id,tg_user_id', ignoreDuplicates: true },
        )
        .select('grupo_id')

      const primeiraVez = Array.isArray(inserido) && inserido.length > 0
      if (primeiraVez) resumo.novos++
      else {
        // Já cá esteve. Actualiza-se a passagem e limpa-se a saída — e NÃO se acolhe outra vez:
        // dar boas-vindas a quem já as levou lê-se como avaria, e num grupo lê-no todos.
        await db
          .from(T_MEMBROS)
          .update({ ultima_entrada: agora, saiu_em: null, nome: m.nome, username: m.username })
          .eq('grupo_id', m.grupoId)
          .eq('tg_user_id', m.tgUserId)
      }

      await radar(db, m)

      /**
       * O LEAD escreve-se sempre que ainda não estiver escrito — e não só na primeira entrada.
       *
       * É o que repara o passado: as pessoas que já estão no grupo desde antes disto existir ficam
       * conhecidas na primeira vez que o bot as vir a entrar ou a sair. Marcar-se apenas na primeira
       * entrada deixava os 62 de fora para sempre.
       */
      const { data: linha } = await db
        .from(T_MEMBROS)
        .select('lead_criado_em')
        .eq('grupo_id', m.grupoId)
        .eq('tg_user_id', m.tgUserId)
        .maybeSingle()

      if (!(linha as { lead_criado_em?: string | null } | null)?.lead_criado_em) {
        const criou = await escreverLead(db, m)
        if (criou) resumo.leadsCriados++
        // Marca-se mesmo quando o lead já existia com outra origem: a pergunta desta coluna é «já
        // tratei do lead desta pessoa?», e a resposta passou a ser sim das duas maneiras.
        await db
          .from(T_MEMBROS)
          .update({ lead_criado_em: agora })
          .eq('grupo_id', m.grupoId)
          .eq('tg_user_id', m.tgUserId)
      }

      // O acolhimento é só no grupo de leads e só na primeira vez. Nos outros grupos (sinais,
      // Premium) uma mensagem de boas-vindas do funil não faz sentido nenhum.
      if (primeiraVez && leads && m.grupoId === leads) {
        const ok = await acolherNoGrupo(m.grupoId, m.nome)
        if (ok) {
          resumo.acolhidos++
          await db
            .from(T_MEMBROS)
            .update({ acolhido_em: agora })
            .eq('grupo_id', m.grupoId)
            .eq('tg_user_id', m.tgUserId)
        }
      }
    } catch (e) {
      console.error('[telegram-grupo-entradas]', e)
    }
  }

  return resumo
}

/**
 * O radar da prospeção, que já existia e já sabia contar entradas e saídas — mas só as que chegavam
 * por mensagem de serviço. Chamá-lo também daqui é o que o põe a ver quem entra por convite.
 */
async function radar(db: Supa, m: MudancaDeMembro): Promise<void> {
  try {
    const { registarContacto } = await import('@/lib/prospecao/radar-contactos')
    await registarContacto(db, {
      tgUserId: m.tgUserId,
      username: m.username,
      firstName: m.nome,
      chatId: m.grupoId,
      motivo: m.motivo,
    })
  } catch {
    /* o registo do grupo não pode falhar por causa do radar */
  }
}
