/**
 * CHAT DA SESSÃO AO VIVO — as decisões que erravam em silêncio.
 *
 * Tudo o que aqui está era antes decidido no meio de um componente ou de uma rota, e as três
 * decisões falhavam da mesma maneira: sem dizer nada a ninguém.
 *
 *   1. QUEM LÊ / QUEM ESCREVE. A rota do chat não perguntava nada: lia e escrevia sempre com a
 *      chave de serviço. Uma sala Premium tinha o chat aberto a qualquer pedido que soubesse o id
 *      — e qualquer conta com sessão escrevia lá dentro. A reprodução já tinha cadeado
 *      (`podeVerReproducaoDaSala`); o chat da mesma sala não tinha. Aqui o chat passa a usar a
 *      MESMA regra da reprodução: quem pode ver a sala pode ler e escrever no chat dela, e mais
 *      ninguém. Não se abre nada que já não estivesse aberto — fecha-se o que nunca devia estar.
 *
 *   2. SE A MENSAGEM SAIU. O cliente fazia `fetch`, ignorava o estado da resposta e limpava a
 *      caixa de texto. Com a rede a oscilar, ou com 401 por sessão caducada, o que a pessoa
 *      escreveu desaparecia do ecrã e nunca chegava a ninguém. É o pior defeito possível num chat
 *      ao vivo: não há erro, não há mensagem, não há nada. `classificarEnvio` obriga quem chama a
 *      olhar para a resposta, e `podeLimparCaixa` só diz sim quando a mensagem está GRAVADA.
 *
 *   3. A JUNÇÃO DAS MENSAGENS NOVAS. Com sondagem incremental (`?desde=`), duas respostas podem
 *      chegar fora de ordem ou repetidas. `juntarMensagens` junta por id e ordena por tempo, para
 *      que o atraso da rede nunca duplique nem engula uma linha.
 *
 * Módulo puro de propósito: nada de React, nada de Supabase. Ver a guarda em
 * `lib/__tests__/live-chat-sala.check.ts`.
 */
import { chavePerfilUi, contaAtivaUi, podeVerReproducaoDaSala, type PerfilUi } from '@/lib/perfil-ui'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. Quem lê e quem escreve
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface EspectadorDoChat {
  perfil: PerfilUi | null
  /** Educador com sessão própria, operador ou admin do site. */
  equipa: boolean
}

/**
 * Ler o chat da sala é o mesmo direito que ver a sala. Qualquer outra regra criava a situação
 * absurda de alguém ler a conversa de uma sessão a que não pode assistir.
 */
export function podeLerChatDaSala(quem: EspectadorDoChat, tier?: string | null): boolean {
  return podeVerReproducaoDaSala(quem.perfil, tier, { equipa: quem.equipa })
}

/**
 * Escrever exige o mesmo direito E uma conta identificada.
 *
 * A sala `free` é pública para VER (é a montra, a /FreeSession) — mas uma sala pública sem login
 * não pode ser pública para ESCREVER, ou qualquer visitante anónimo escreve na sessão com o nome
 * que quiser. A equipa (educador a transmitir) escreve sempre.
 *
 * E escrever exige a conta ATIVA. Ler a sala `free` dispensa-a (é pública, quem está em pausa não
 * vê menos do que um estranho vê), mas falar na sessão com o nome de membro é outra coisa: uma
 * conta fechada por pagamento continuava a publicar na casa. `contaAtivaUi` é a alavanca que
 * fecha tudo — pausa por pagamento, ativação pendente e trial expirado passam todos por aqui.
 */
export function podeEscreverNoChatDaSala(quem: EspectadorDoChat, tier?: string | null): boolean {
  if (quem.equipa) return true
  if (!quem.perfil) return false
  if (!contaAtivaUi(quem.perfil)) return false
  return podeLerChatDaSala(quem, tier)
}

/** O motivo da recusa, para a rota responder com texto em vez de uma lista vazia. */
export function motivoDeRecusaDoChat(quem: EspectadorDoChat, tier?: string | null): string {
  if (!quem.perfil && !quem.equipa) return 'Inicia sessão para ver o chat desta sessão.'
  // A conta em pausa tem de ouvir a razão certa. Dizer-lhe "nível de acesso acima do teu" a quem
  // já pagou Premium e está só com a subscrição em pausa manda-a para o upgrade errado.
  if (quem.perfil && !contaAtivaUi(quem.perfil)) {
    return 'A tua conta está inativa. Regulariza a subscrição para voltar a participar.'
  }
  return 'Esta sessão é de um nível de acesso acima do teu.'
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. A mensagem saiu ou não saiu
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type ResultadoEnvio =
  | { saiu: true }
  | { saiu: false; recuperavel: boolean; motivo: string }

/**
 * Traduz a resposta do servidor numa única verdade: saiu ou não saiu.
 *
 * `recuperavel` distingue o que vale a pena tentar outra vez (rede, 5xx, 429) do que não vale
 * (401 sem sessão, 403 sem direito, 400 mensagem inválida) — para o ecrã oferecer "Tentar
 * novamente" só quando tentar faz sentido.
 */
export function classificarEnvio(resposta: {
  /** `null` = o `fetch` nem chegou a responder (rede caiu, pedido abortado). */
  status: number | null
  corpo?: { success?: boolean; error?: string; data?: unknown } | null
}): ResultadoEnvio {
  const { status, corpo } = resposta

  if (status === null) {
    return { saiu: false, recuperavel: true, motivo: 'Sem rede. A mensagem não foi enviada.' }
  }

  if (status >= 200 && status < 300) {
    // 2xx não basta: a rota devolve 200 com `success:false` em casos de borda, e sem `data` não
    // há linha gravada. Tratar 2xx como sucesso cego foi o que fez mensagens desaparecerem.
    if (corpo?.success === false || !corpo?.data) {
      return {
        saiu: false,
        recuperavel: true,
        motivo: corpo?.error || 'O servidor aceitou o pedido mas não gravou a mensagem.',
      }
    }
    return { saiu: true }
  }

  if (status === 401) {
    return { saiu: false, recuperavel: false, motivo: 'A tua sessão expirou. Entra outra vez para escrever.' }
  }
  if (status === 403) {
    return { saiu: false, recuperavel: false, motivo: corpo?.error || 'Não tens acesso ao chat desta sessão.' }
  }
  if (status === 400) {
    return { saiu: false, recuperavel: false, motivo: corpo?.error || 'Mensagem inválida.' }
  }
  if (status === 429) {
    return { saiu: false, recuperavel: true, motivo: 'Demasiadas mensagens seguidas. Espera um instante.' }
  }

  return { saiu: false, recuperavel: true, motivo: corpo?.error || `Falhou o envio (${status}).` }
}

/**
 * A caixa de texto SÓ se limpa quando a mensagem está gravada. Limpar antes — como se fazia na
 * sala, na app e no ecrã nativo — é apagar o trabalho da pessoa sem que ela saiba.
 */
export function podeLimparCaixa(resultado: ResultadoEnvio): boolean {
  return resultado.saiu
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. Junção incremental das mensagens
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface MensagemDoChat {
  id: string
  sender_name: string
  sender_type: string
  sender_tier?: string | null
  message: string
  created_at: string
}

/**
 * Junta o que já estava no ecrã com o que a sondagem trouxe. Por id (nunca duplica) e por tempo
 * (nunca fica fora de ordem porque uma resposta chegou atrasada). Em empate de tempo, o id
 * decide, para a ordem ser estável entre sondagens.
 */
export function juntarMensagens(
  atuais: readonly MensagemDoChat[],
  novas: readonly MensagemDoChat[],
  limite = 300,
): MensagemDoChat[] {
  const porId = new Map<string, MensagemDoChat>()
  for (const m of atuais) porId.set(m.id, m)
  for (const m of novas) porId.set(m.id, m) // a versão nova manda: pode vir corrigida

  const juntas = [...porId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at)
    const tb = Date.parse(b.created_at)
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // Teto de memória: quem fica horas numa sessão não acumula mensagens sem fim.
  return juntas.length > limite ? juntas.slice(juntas.length - limite) : juntas
}

/**
 * O cursor da próxima sondagem: o instante da mensagem mais recente que já temos.
 *
 * Vai como `>` (exclusivo) na rota, e por isso devolve-se o instante EXACTO da última — tirar ou
 * somar milissegundos aqui era a forma garantida de repetir ou saltar uma mensagem.
 */
export function cursorDaProximaSondagem(mensagens: readonly MensagemDoChat[]): string | null {
  let maior: string | null = null
  let maiorMs = -Infinity
  for (const m of mensagens) {
    const ms = Date.parse(m.created_at)
    if (Number.isNaN(ms)) continue
    if (ms > maiorMs) {
      maiorMs = ms
      maior = m.created_at
    }
  }
  return maior
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. Quem é quem, e onde fica o scroll
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface EtiquetaDeAutor {
  texto: string
  /** Token de cor da casa. Ouro é do educador: ninguém mais o usa. */
  cor: string
}

/**
 * O nome do perfil no chat sai de `chavePerfilUi` — a mesma função que nomeia o perfil no resto
 * do site. Ter aqui uma segunda lista de nomes era garantir que a mesma pessoa é "VIP" num ecrã
 * e "Membro" noutro.
 */
export function etiquetaDeAutor(
  senderType: string | null | undefined,
  senderTier?: string | null,
): EtiquetaDeAutor | null {
  if (String(senderType).toLowerCase() === 'educator') {
    return { texto: 'Educador', cor: '#D2A63C' }
  }
  switch (String(senderTier || '').toLowerCase()) {
    case 'admin':
      return { texto: 'Equipa MTM', cor: '#E9C46A' }
    case 'vip':
      return { texto: 'VIP', cor: '#E9C46A' }
    case 'premium':
      return { texto: 'Premium', cor: '#D2A63C' }
    case 'iq':
      return { texto: 'Premium', cor: '#D2A63C' }
    case 'trial':
      return { texto: 'Experiência', cor: '#9CA3AF' }
    default:
      // Mensagens antigas (gravadas antes de haver `sender_tier`) não levam etiqueta nenhuma:
      // inventar "Membro" para quem talvez fosse Premium é pior do que não dizer nada.
      return null
  }
}

/** A etiqueta que se GRAVA com a mensagem, a partir do perfil de quem escreveu. */
export function tierParaGravar(perfil: PerfilUi | null | undefined): string {
  return chavePerfilUi(perfil)
}

/**
 * Colar no fundo, ou deixar a pessoa ler?
 *
 * O chat da sala nunca fazia scroll nenhum: quem entrava aos 20 minutos caía no TOPO das últimas
 * 80 mensagens e as novas nasciam fora do ecrã, invisíveis. Mas puxar sempre para o fundo é o
 * defeito oposto — arranca o histórico das mãos de quem está a ler para trás.
 *
 * A regra: cola-se ao fundo se a pessoa JÁ estava no fundo (ou quase: a margem absorve o
 * arredondamento sub-pixel do browser).
 */
export function deveColarNoFundo(
  caixa: { scrollTop: number; scrollHeight: number; clientHeight: number },
  margem = 48,
): boolean {
  const distanciaAoFundo = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight
  return distanciaAoFundo <= margem
}
