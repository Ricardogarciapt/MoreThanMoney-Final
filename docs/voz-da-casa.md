# A voz da casa (`lib/voz`)

Regra MTM: **todo o áudio AI da MTM fala na voz clonada Fish "ricardogarcia"**, nunca uma voz
genérica. A voz deixou de viver dentro da dobragem do LMS (`lib/lms-captions/tts.ts`) e passou a
ser uma peça partilhada: qualquer parte do sistema — bot, emails, vídeos, avisos na app — pode
falar com a voz do Ricardo sem arrastar o LMS atrás.

## Usar

```ts
import { falar, falarParaStorage } from '@/lib/voz'

// 1) áudio em memória (ex.: devolver num route handler)
const r = await falar('Bom dia, sou o Ricardo.', { cache: supabase })
if (!r.ok) {
  // motivo: 'sem-configuracao' | 'api-falhou' | 'texto-invalido' | 'texto-longo'
  //         | 'voz-nao-autorizada' | 'storage-falhou'
  console.error('[voz]', r.motivo, r.detalhe)
} else {
  return new Response(new Uint8Array(r.buffer), { headers: { 'Content-Type': r.contentType } })
}

// 2) publicar no bucket público `lms-tts` e ficar com um URL
const pub = await falarParaStorage(supabase, 'Bem-vindo à MTM.', 'avisos/boas-vindas.mp3')
if (pub.ok) console.log(pub.url)
```

`cache` recebe o cliente Supabase (service role ou anon com direito de escrita no bucket
`lms-tts`). Passar a cache é **recomendado sempre**: a mesma frase não se paga duas vezes.

## O que a peça garante

| Peça | Comportamento | Porquê |
| --- | --- | --- |
| **Voz** | Sem `voiceId`, fala sempre o clone do Ricardo. Um `voiceId` diferente é **recusado** (`voz-nao-autorizada`) a menos que se passe `motivoVozAlternativa: 'porquê'`. `FISH_VOICE_ID` no ambiente só se sobrepõe com `FISH_VOZ_ALTERNATIVA_OK=1`. | A assinatura sonora da marca não se perde por descuido nem por uma variável mal posta. |
| **Cache** | Storage Supabase, bucket `lms-tts`, caminho `voz-cache/<aa>/<bb>/<sha256>.<fmt>` derivado de **texto + voz + modelo + formato**. | Crédito Fish não se gasta duas vezes na mesma frase. A cache em baixo nunca impede a fala. |
| **Limites** | Até 2 000 caracteres = 1 pedido. Entre 2 000 e 10 000 = **parte** por fim de frase (e por palavras se a frase for gigante) e junta o áudio. Acima de 10 000 = **recusa** (`texto-longo`). | Partir um texto enorme em centenas de pedidos seria uma fatura silenciosa; acima do tecto quem chama decide. |
| **Erros** | Resultado etiquetado (`{ ok: false, motivo, detalhe, status? }`), nunca `null`. | Antes, um deploy sem `FISH_API_KEY` era indistinguível de uma falha de rede. |

## Ficheiros

- `lib/voz/nucleo.ts` — puro: identidade da voz, porta da voz alternativa, limites, chave de cache.
- `lib/voz/index.ts` — `falar()`, `falarParaStorage()` e o cliente Fish (injectável via `cliente`).
- `lib/__tests__/voz-da-casa.check.ts` — guarda (`npx tsx lib/__tests__/voz-da-casa.check.ts`).
  **Nunca chama a Fish**: o cliente é falso. Falha se alguém puser uma voz genérica ou um
  `voiceId` diferente do clone sem passar pela porta explícita.
- `lib/lms-captions/tts.ts` — adaptador fino para a dobragem ao vivo; mantém as assinaturas
  antigas (`synthesizeSpeech` / `synthesizeToStorage`, `null` em falha) e usa a voz do educador
  do stream através da porta explícita.

## Ambiente

- `FISH_API_KEY` — obrigatória (existe em Production e Preview na Vercel).
- `FISH_MODEL` — opcional, default `speech-1.6`.
- `FISH_VOICE_ID` / `FISH_VOZ_ALTERNATIVA_OK` — só para trocar deliberadamente de clone.
