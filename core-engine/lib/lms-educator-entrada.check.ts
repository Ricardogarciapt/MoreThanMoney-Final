/**
 * A GUARDA DA ENTRADA NO ESTÚDIO.
 *
 *   npx tsx lib/lms-educator-entrada.check.ts
 *
 * O caso mau é a razão de tudo isto existir: credenciais do site válidas, mas de OUTRA pessoa.
 */
import { pareceHashUtilizavel, podeEntrarPelaContaDoSite } from './lms-educator-entrada'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const MAFALDA = {
  id: 'edu-1',
  email: 'mafaldamaria.costa@icloud.com',
  is_active: true,
  profile_id: '9c2c08ed-fdd0-4689-9cab-77a4aa8f243f',
}

// ── O caso bom ──────────────────────────────────────────────────────────────
{
  const v = podeEntrarPelaContaDoSite(MAFALDA, MAFALDA.profile_id)
  teste('a própria entra com a conta do site', v.pode && v.codigo === 'ok')
}

// ── O CASO MAU: credenciais boas, pessoa errada ─────────────────────────────
{
  /**
   * Um membro qualquer autentica-se no site com a SUA password — o Supabase diz que sim, porque as
   * credenciais são verdadeiras — e pede o estúdio da Mafalda. Se isto passasse, qualquer pessoa
   * com conta no site entrava no estúdio de qualquer educador.
   */
  const v = podeEntrarPelaContaDoSite(MAFALDA, 'outro-membro-qualquer')
  teste('outro utilizador autenticado NÃO entra', !v.pode)
  teste('e o motivo diz que a conta não é a dele', v.codigo === 'outro_utilizador')
}

// ── Educador sem conta do site ligada ───────────────────────────────────────
{
  const semLigacao = { ...MAFALDA, profile_id: null }
  teste('sem profile_id, a porta do site não existe',
    !podeEntrarPelaContaDoSite(semLigacao, MAFALDA.profile_id).pode)
  teste('e explica que entra pela password própria',
    podeEntrarPelaContaDoSite(semLigacao, MAFALDA.profile_id).codigo === 'sem_perfil_ligado')

  // Vazio e espaços são o mesmo que não ter: um `profile_id` em branco não pode casar com nada.
  teste('profile_id vazio não casa com utilizador vazio',
    !podeEntrarPelaContaDoSite({ ...MAFALDA, profile_id: '   ' }, '   ').pode)
}

// ── Os outros caminhos de recusa ────────────────────────────────────────────
{
  teste('educador inactivo não entra',
    !podeEntrarPelaContaDoSite({ ...MAFALDA, is_active: false }, MAFALDA.profile_id).pode)
  teste('sem sessão no site não entra',
    !podeEntrarPelaContaDoSite(MAFALDA, null).pode)
  teste('email que não é de educador nenhum não entra',
    !podeEntrarPelaContaDoSite(null, MAFALDA.profile_id).pode)
  teste('há sempre um motivo escrito',
    [podeEntrarPelaContaDoSite(MAFALDA, null), podeEntrarPelaContaDoSite(null, 'x')]
      .every((v) => v.porque.length > 15))
}

// ── O hash de marcador ──────────────────────────────────────────────────────
{
  teste('bcrypt real é utilizável',
    pareceHashUtilizavel('$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0'))
  teste('o marcador da migração 168 NÃO é utilizável',
    !pareceHashUtilizavel('sem-password-definida'))
  teste('vazio não é utilizável', !pareceHashUtilizavel(''))
  teste('nulo não é utilizável', !pareceHashUtilizavel(null))
  teste('bcrypt truncado não é utilizável', !pareceHashUtilizavel('$2b$10$curto'))
}

if (falhas.length) {
  console.error(`lms/educador-entrada: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('lms/educador-entrada: a conta do site só abre o estúdio do próprio ✓')
