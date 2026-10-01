/**
 * POR ONDE SE FALA COM ESTA PESSOA — os botões que abrem o canal já com o destino.
 *
 * Não é decoração: é a diferença entre «ligar ao João» e ligar ao João. Sem isto, quem trabalha o
 * lead lê o nome, abre o pipeline noutro separador, procura o negócio, copia o número, abre o
 * WhatsApp e cola. Seis passos por lead, cinquenta vezes ao dia — e é por isso que não se faz.
 *
 * A DECISÃO DE QUE CANAL MOSTRAR NÃO É DAQUI: vem de `lib/vendas/abordagem.ts`, que é pura e tem
 * guarda. Aqui só se desenha o que ela decidiu. Se a regra vivesse nos dois sítios, divergiriam —
 * e divergiriam no caso difícil, que é o único que importa.
 */
import { caminhos, type Canal, type PessoaDoNegocio } from '@/lib/vendas/abordagem'

const ROTULO: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  telefone: 'Ligar',
  email: 'Email',
  telegram: 'Telegram',
  instagram: 'Instagram',
}

/** O endereço que abre cada canal. Os números vão sem espaços nem sinais — é o que as apps aceitam. */
function abrir(canal: Canal, destino: string): string | null {
  const so = destino.replace(/[^\d+]/g, '').replace(/^\+/, '')
  switch (canal) {
    case 'whatsapp':
      return so ? `https://wa.me/${so}` : null
    case 'telefone':
      return `tel:${destino.replace(/\s/g, '')}`
    case 'email':
      return `mailto:${destino}`
    case 'telegram':
      return `https://t.me/${destino.replace(/^@/, '')}`
    case 'instagram':
      return `https://instagram.com/${destino.replace(/^@/, '')}`
    default:
      return null
  }
}

export function Contactar({ pessoa, limite = 3 }: { pessoa: PessoaDoNegocio; limite?: number }) {
  const vias = caminhos(pessoa).slice(0, limite)

  /**
   * Sem canal nenhum NÃO se mostra um espaço vazio: diz-se o que falta. Um lead sem contacto é
   * trabalho de quem o criou, e enquanto ninguém o disser em voz alta ele fica no pipeline a
   * fingir que é trabalhável. A 01/10 havia um assim em 111.
   */
  if (!vias.length) {
    return (
      <p className="text-xs text-amber-400/90">
        Sem telefone, email, Telegram ou Instagram — não há por onde falar com esta pessoa.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {vias.map((v) => {
        const href = abrir(v.canal, v.destino)
        if (!href) return null
        return (
          <a
            key={`${v.canal}-${v.destino}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={v.porque}
            className="rounded-md border border-gray-700 px-2 py-1 text-[11.5px] text-gray-300 transition-colors hover:border-[#D2A63C] hover:text-[#D2A63C]"
          >
            {ROTULO[v.canal]}
          </a>
        )
      })}
      <span className="text-[11px] text-gray-600">{vias[0].destino}</span>
    </div>
  )
}
