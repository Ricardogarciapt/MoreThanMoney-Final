'use client'

/**
 * LANÇAR UM LEAD, do ecrã de quem o encontrou.
 *
 * Antes disto, um contacto só entrava no sistema se o Ricardo o lançasse à mão. Quem prospecta
 * trabalhava numa lista paralela — no telemóvel, no caderno — e o sistema acabava por saber
 * exactamente dos negócios que já tinham fechado, ou seja, dos que não precisavam de ajuda.
 *
 * O PAPEL NÃO É OPCIONAL, e é a parte que parece burocracia e não é: o pipeline mostra os negócios
 * em que a pessoa PARTICIPA, por isso um negócio criado sem ninguém atribuído desaparecia no
 * instante em que era criado, e ninguém lhe conseguia mexer depois. O papel só oferece os papéis
 * que a pessoa tem — o servidor recusa os outros (`validarNegocioNovo`), e o que se mostra aqui é
 * só para ela não ter de adivinhar o que vai ser recusado.
 *
 * Não finge que guardou. Enquanto o servidor não responder, o botão diz «a criar…»; se falhar, o
 * formulário fica com o que estava escrito. Um optimismo que desfaz sozinho faz a pessoa fechar a
 * página convencida de que o lead ficou lá.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PAPEL_NOME, type Papel, PAPEIS } from '@/lib/backoffice-papeis'

const CAMPO =
  'w-full rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none'

export function NegocioNovo({ papeis, ehDono }: { papeis: Papel[]; ehDono: boolean }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  // O dono não tem papéis atribuídos (tem tudo por ser dono) e continua a ter de escolher um: é o
  // papel que fica gravado no negócio, e um negócio sem papel de quem o trabalha não paga a ninguém.
  const disponiveis: Papel[] = ehDono ? [...PAPEIS] : papeis
  const [papel, setPapel] = useState<Papel | ''>(disponiveis[0] ?? '')

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setAGuardar(true)
    setErro(null)
    try {
      const r = await fetch('/api/backoffice/negocios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.get('nome'),
          email: form.get('email'),
          telefone: form.get('telefone'),
          origem: form.get('origem'),
          pack_previsto: form.get('pack_previsto'),
          nota: form.get('nota'),
          papel,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.error || 'Não consegui criar o negócio.')
        return
      }
      setAberto(false)
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(false)
    }
  }

  if (disponiveis.length === 0) {
    // Sem nenhum dos cinco papéis não há coluna onde pôr a pessoa — e um negócio órfão é um negócio
    // que ela não voltava a ver. Dizê-lo é melhor do que oferecer um botão que dá erro.
    return (
      <p className="text-xs text-gray-500">
        Para lançares negócios precisas de um dos papéis de vendas (prospector, setter, closer,
        responsável ou afiliado). Fala com o Ricardo.
      </p>
    )
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90"
      >
        + Lançar um lead
      </button>
    )
  }

  return (
    <form onSubmit={criar} className="space-y-3 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Nome *</span>
          <input name="nome" required autoFocus className={CAMPO} placeholder="Como se chama" />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Entras como *</span>
          <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)} className={CAMPO}>
            {disponiveis.map((p) => (
              <option key={p} value={p}>
                {PAPEL_NOME[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Email</span>
          <input name="email" type="email" className={CAMPO} placeholder="opcional" />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Telefone</span>
          <input name="telefone" className={CAMPO} placeholder="opcional" />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Origem</span>
          <input name="origem" className={CAMPO} placeholder="instagram, indicação, evento…" />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          <span className="uppercase tracking-wide text-gray-500">Pack previsto</span>
          <input name="pack_previsto" className={CAMPO} placeholder="o que se espera vender" />
        </label>
      </div>
      <label className="block space-y-1 text-xs text-gray-400">
        <span className="uppercase tracking-wide text-gray-500">Nota</span>
        <textarea name="nota" rows={2} className={CAMPO} placeholder="o que já sabes desta pessoa" />
      </label>

      <p className="text-xs leading-relaxed text-gray-500">
        O negócio nasce em «Lead» e com o teu nome na atribuição de {papel ? PAPEL_NOME[papel] : '—'}.
        Fechá-lo mais tarde como «ganho» não cria venda nem comissão: isso nasce do pagamento
        confirmado.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={aGuardar}
          className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {aGuardar ? 'a criar…' : 'Criar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-gray-400 underline hover:text-gray-200">
          cancelar
        </button>
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>
    </form>
  )
}
