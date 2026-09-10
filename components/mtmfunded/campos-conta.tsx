'use client'

import { PAISES } from '@/lib/mtmfunded/paises'

/**
 * Os campos que a CORRETORA exige para emitir a conta — os mesmos no torneio e no checkout.
 *
 * Um componente só, porque os dois formulários alimentam o mesmo formulário do MetaTrader.
 * Duplicá-los levava a que um pedisse o país e o outro não, e as contas de um dos caminhos
 * saíam com o indicativo errado sem nada a explicar a diferença.
 *
 * Diz-se em cada campo PORQUE é pedido. Um formulário que pede a data de nascimento sem
 * explicar porquê é um formulário que as pessoas abandonam a meio.
 */
export interface DadosConta {
  primeiroNome: string
  apelido: string
  pais: string
  telefone: string
  dataNascimento: string
}

export const DADOS_CONTA_VAZIOS: DadosConta = {
  primeiroNome: '', apelido: '', pais: 'PT', telefone: '', dataNascimento: '',
}

export function dadosContaCompletos(d: DadosConta): boolean {
  const anos = d.dataNascimento
    ? (Date.now() - new Date(d.dataNascimento).getTime()) / (365.25 * 24 * 3600 * 1000)
    : 0
  return (
    d.primeiroNome.trim().length >= 2 &&
    d.apelido.trim().length >= 2 &&
    d.telefone.replace(/\D/g, '').length >= 6 &&
    anos >= 18 && anos <= 100
  )
}

export function CamposConta({
  dados, onChange, cor = '#D2A63C',
}: { dados: DadosConta; onChange: (d: DadosConta) => void; cor?: string }) {
  const campo = (
    chave: keyof DadosConta,
    rotulo: string,
    nota: string,
    tipo = 'text',
  ) => (
    <label className="block">
      <span className="text-sm text-zinc-300">{rotulo}</span>
      <span className="mt-0.5 block text-xs text-zinc-600">{nota}</span>
      <input
        type={tipo}
        value={dados[chave]}
        onChange={(e) => onChange({ ...dados, [chave]: e.target.value })}
        className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none"
        style={{ borderColor: undefined }}
        onFocus={(e) => (e.currentTarget.style.borderColor = cor)}
        onBlur={(e) => (e.currentTarget.style.borderColor = '')}
      />
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {campo('primeiroNome', 'Primeiro nome', 'Como consta no teu documento.')}
        {campo('apelido', 'Apelido', 'O último apelido chega.')}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <label className="block">
          <span className="text-sm text-zinc-300">País</span>
          <span className="mt-0.5 block text-xs text-zinc-600">Define o indicativo.</span>
          <select
            value={dados.pais}
            onChange={(e) => onChange({ ...dados, pais: e.target.value })}
            className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none"
          >
            {PAISES.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nome} ({p.indicativo})
              </option>
            ))}
          </select>
        </label>
        {campo('telefone', 'Telemóvel', 'Sem o indicativo — esse vem do país.', 'tel')}
      </div>

      {campo(
        'dataNascimento',
        'Data de nascimento',
        'Exigida pela corretora. Tens de ser maior de idade.',
        'date',
      )}
    </div>
  )
}
