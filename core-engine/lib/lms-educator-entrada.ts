/**
 * QUEM PODE ENTRAR NO ESTÚDIO, E POR QUE PORTA — a decisão, sem rede.
 *
 * ═══ DUAS PORTAS, E PORQUÊ ═════════════════════════════════════════════════════════════════
 *
 * O estúdio sempre teve password própria (`lms_educators.password_hash`, bcrypt). O site tem a
 * dele (Supabase Auth). Para um educador que também é membro, isso são duas passwords para a mesma
 * pessoa — e a segunda esquece-se sempre.
 *
 * A porta nova aceita a password DO SITE. Não se copia hash nenhum entre os dois sistemas: o
 * Supabase valida as credenciais dele, e aqui só se pergunta se a pessoa autenticada é mesmo este
 * educador. Copiar o hash parecia mais simples e criava um laço invisível — no dia em que ela
 * mudasse a password do site, o estúdio ficava com a antiga e ninguém percebia porquê.
 *
 * ═══ O ERRO QUE ISTO EXISTE PARA TRAVAR ════════════════════════════════════════════════════
 *
 * Aceitar a password do site **sem verificar de quem é**. Qualquer membro com conta válida entrava
 * no estúdio de qualquer educador escrevendo o email dele e a password dela — e o Supabase diria
 * que sim, porque as credenciais são boas: são apenas de outra pessoa.
 *
 * Por isso a ligação tem de ser EXACTA e nos dois sentidos: o educador tem de ter `profile_id`, e
 * esse `profile_id` tem de ser o do utilizador que acabou de se autenticar. Sem `profile_id`, esta
 * porta não existe para aquele educador — fica só com a password própria, como antes.
 */

export interface EducadorParaEntrada {
  id: string
  email: string
  is_active?: boolean | null
  /** O perfil do site ligado a este educador. Sem ele, a porta do site está fechada. */
  profile_id?: string | null
}

export interface Veredicto {
  pode: boolean
  codigo: 'ok' | 'inactivo' | 'sem_perfil_ligado' | 'outro_utilizador' | 'sem_sessao'
  /** Em português, para os registos — ao utilizador diz-se sempre «credenciais inválidas». */
  porque: string
}

/**
 * A pessoa autenticada no site pode entrar no estúdio deste educador?
 *
 * `utilizadorId` é quem o Supabase disse que é, depois de validar a password. Nunca é o que o
 * cliente afirmou ser.
 */
export function podeEntrarPelaContaDoSite(
  educador: EducadorParaEntrada | null,
  utilizadorId: string | null | undefined,
): Veredicto {
  if (!educador) {
    return { pode: false, codigo: 'sem_sessao', porque: 'Não há educador com esse email.' }
  }
  if (educador.is_active === false) {
    return { pode: false, codigo: 'inactivo', porque: `Educador ${educador.email} está inactivo.` }
  }
  const perfil = String(educador.profile_id ?? '').trim()
  if (!perfil) {
    return {
      pode: false,
      codigo: 'sem_perfil_ligado',
      porque: `O educador ${educador.email} não tem conta do site ligada — entra pela password própria.`,
    }
  }
  const quem = String(utilizadorId ?? '').trim()
  if (!quem) {
    return { pode: false, codigo: 'sem_sessao', porque: 'As credenciais do site não foram aceites.' }
  }
  if (quem !== perfil) {
    /**
     * Credenciais boas, pessoa errada. É o caso que separa «entrar com a minha conta» de «entrar
     * na conta de outro» — e o que o impede é esta comparação, não a validação da password.
     */
    return {
      pode: false,
      codigo: 'outro_utilizador',
      porque: `A conta autenticada (${quem}) não é a deste educador (${perfil}).`,
    }
  }
  return { pode: true, codigo: 'ok', porque: 'Entrou com a conta do site.' }
}

/**
 * Um `password_hash` que não é bcrypt nunca corresponde a password nenhuma.
 *
 * É assim que um educador nasce SEM acesso enquanto ninguém lhe define uma password — em vez de
 * nascer com uma password fraca que alguém se esquece de trocar. O `bcrypt.compare` devolveria
 * falso de qualquer maneira; isto serve para o código poder DIZER porquê, em vez de responder
 * «credenciais inválidas» a quem tem as credenciais certas e ainda não tem acesso.
 */
export function pareceHashUtilizavel(hash: string | null | undefined): boolean {
  const h = String(hash ?? '')
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(h)
}
