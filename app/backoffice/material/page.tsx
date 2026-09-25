/**
 * MATERIAIS — o código de afiliado da pessoa, os links que ela usa, e um gerador de peças.
 *
 * O CÓDIGO E OS LINKS
 * O código de afiliado é o `referral_code` do perfil dela, que é o mesmo que o site já usa no
 * `?ref=`. Não se inventa aqui um segundo código para o backoffice: dois códigos para a mesma
 * pessoa dão duas contagens diferentes da mesma indicação, e nenhuma das duas se consegue provar.
 *
 * O GERADOR
 * Escreve peças com o tom e a oferta da casa. É apoio à escrita: não contacta ninguém, não publica
 * nada e não escreve na base. As regras da marca e a revisão do resultado vivem no SERVIDOR
 * (`/api/backoffice/material` e `lib/backoffice-material-ia.ts`) — postas aqui, seriam regras que
 * qualquer pessoa lê no JavaScript da página e contorna com um pedido à mão.
 *
 * O QUE A PÁGINA NÃO INVENTA
 * Não há hoje nenhuma biblioteca de materiais prontos na base. A página diz isso com uma frase, em
 * vez de mostrar uma grelha de cartões vazios que se leria como avaria.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getOrCreateReferralCode } from '@/lib/referral'
import { escadaNumaLinha, bonusNumaLinha } from '@/lib/escada-precos'
import { TIPOS_MATERIAL } from '@/lib/backoffice-material-ia'
import { abrirPagina, SemAcesso } from '../_partes/acesso'
import { Cabecalho, Falhou, Vazio } from '../_partes/blocos'
import { Gerador } from './gerador'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Materiais · Backoffice MTM' }

const SITE = 'https://www.morethanmoney.pt'

export default async function MaterialPage() {
  const acesso = await abrirPagina('bo.material')
  if (!acesso.ok) {
    return <SemAcesso motivo={acesso.motivo} oQue="Os materiais de divulgação são para quem divulga: todos os papéis da equipa têm acesso." />
  }
  const { ctx } = acesso

  /**
   * O código é o da própria pessoa, criado à primeira visita se ainda não existir — é a única
   * escrita desta página, é na linha dela, e a id vem da sessão. Sem isto, a página que existe
   * para lhe dar o link seria a página que lhe diz que não tem link.
   */
  let codigo: string | null = null
  let falhouCodigo = false
  try {
    codigo = await getOrCreateReferralCode(getSupabaseAdmin(), ctx.userId)
  } catch {
    falhouCodigo = true
  }

  const linkRegisto = codigo ? `${SITE}/register?ref=${codigo}` : `${SITE}/register`

  const links: Array<{ nome: string; url: string; quando: string }> = [
    {
      nome: 'O teu link de registo',
      url: linkRegisto,
      quando: 'O principal. Quem se registar por aqui fica ligado a ti.',
    },
    { nome: 'Site', url: SITE, quando: 'Para quem quer ver a casa antes de decidir.' },
    {
      nome: 'App iOS',
      url: 'https://apps.apple.com/pt/app/id6778558643',
      quando: 'Quem está no iPhone subscreve DENTRO da app — nunca lhe mandes um link de pagamento.',
    },
    {
      nome: 'App Android',
      url: `${SITE}/downloads/MoreThanMoney.apk`,
      quando: 'Android e web: a subscrição faz-se no site.',
    },
    { nome: 'Planos', url: `${SITE}/upgrade`, quando: 'Onde se compra, em Android e web.' },
    {
      nome: 'Abrir conta na corretora',
      url: `${SITE}/abrir-conta`,
      quando: 'A rota da corretora. Vem sempre no fim — não se lidera com o que não tem mensalidade.',
    },
  ]

  return (
    <div className="space-y-8">
      <Cabecalho
        titulo="Materiais"
        sub="O teu código, os links que podes partilhar, e um gerador de peças com o tom da casa."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">O teu código</h2>
        {falhouCodigo || !codigo ? (
          <Falhou oQue="Não consegui obter o teu código de afiliado." />
        ) : (
          <div className="rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-5">
            <div className="font-mono text-2xl font-bold tracking-wider text-[#D2A63C]">{codigo}</div>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              É o mesmo código que o site usa. Quem se registar pelo teu link fica ligado a ti — e é
              essa ligação que faz nascer as linhas do teu extracto quando houver uma venda.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Links</h2>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.nome} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
              <div className="font-medium text-white">{l.nome}</div>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all font-mono text-xs text-[#D2A63C] hover:underline"
              >
                {l.url}
              </a>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{l.quando}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* O que se pode dizer sobre a oferta, lido da fonte. Está aqui para a pessoa não ter de
          decorar preços: um preço decorado sobrevive à campanha que o criou. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">A oferta, como ela é hoje</h2>
        <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm leading-relaxed text-gray-300">
          <p>{escadaNumaLinha()}</p>
          <p className="text-gray-400">{bonusNumaLinha()}</p>
          <p className="text-xs text-gray-500">
            Estes valores são lidos do sistema no momento em que abres a página. Não os decores nem
            os copies para nenhum texto guardado — se mudarem, o que ficou escrito passa a estar
            errado sem ninguém dar por isso.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Escrever uma peça</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
          Escolhe o que queres e diz sobre o quê. O texto sai com o tom da casa e com a oferta certa,
          e é revisto antes de te chegar: se trouxer um número que não venha do sistema, ou uma
          promessa de ganhos, é recusado e não o vês. É um rascunho — lê antes de publicar.
        </p>
        <Gerador tipos={TIPOS_MATERIAL.map((t) => ({ chave: t.chave, nome: t.nome, descricao: t.descricao }))} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Peças prontas</h2>
        <Vazio
          titulo="Ainda não há materiais gráficos guardados no sistema."
          seguinte="Quando houver uma biblioteca (cartazes, vídeos, carrosséis), aparece aqui. Até lá, o gerador acima escreve o texto e o visual pede-se ao Ricardo."
        />
      </section>
    </div>
  )
}
