-- ============================================================================
-- 148 — O STOP PUBLICADO DEIXA DE SER APAGADO, E O DESFECHO PASSA A TER DONO
-- ============================================================================
--
-- ORDEM: correr ESTA MIGRAÇÃO ANTES do deploy do código que a acompanha.
--
-- O `signal-tracker` passa a gravar `sl_original` na admissão de cada sinal. O código aguenta
-- a coluna ainda não existir — se o insert for recusado por causa dela, repete sem o campo e
-- continua a admitir sinais (fica só sem o stop original nessa janela, como nas linhas antigas).
-- Por isso a ordem trocada NÃO parte nada; mas correr a migração primeiro é o caminho limpo,
-- e evita um dia de linhas novas sem o número que esta migração existe para preservar.
--
-- Idempotente: `add column if not exists` e um backfill que só toca em `sl_original is null`.
-- Pode correr duas vezes sem efeito diferente.
--
-- DUAS COISAS, pela mesma razão: havia números na base que já não queriam dizer o que
-- quem os lê julga que querem dizer.
--
-- 1) `mtmcopy_signal_tracking.sl_original`
--
-- O acompanhamento move o stop para a entrada quando o primeiro alvo é atingido — é a
-- proteção a funcionar, e está certo. O que estava errado era fazê-lo com um
-- `update sl = entry`: o stop que a FONTE publicou desaparecia da linha, por cima.
--
-- Medido a 2026-09-29: 165 linhas com `sl = entry`, 163 delas já com uma parcial feita.
-- Em todas essas, quem for à tabela perguntar «qual era o risco desta trade?» recebe
-- ZERO. E não é só uma leitura: era daqui que saía o `slOriginal` que o cartão precisa
-- para distinguir um trailing fechado em lucro de um stop do lado errado.
--
-- `sl` continua a ser o stop VIVO (move-se). `sl_original` é o publicado (não se mexe).
-- Ninguém que lê a coluna de hoje deixa de a ter.
--
-- O backfill copia `sl` para `sl_original` SÓ onde o original ainda lá está. Nas linhas
-- onde já foi apagado fica NULL de propósito: o número perdeu-se e inventá-lo a partir
-- da entrada seria gravar uma distância de risco que nunca existiu. NULL diz
-- «não se sabe», que é a verdade.
--
-- 2) `chat_messages.outcome.origem`
--
-- Sem alteração de esquema (é jsonb), mas fica aqui escrito porque é uma regra de dados:
-- o campo tem três escritores (conta-mestre, motor de preço, leitor de texto) e passa a
-- carregar QUEM o mediu, para que o de grau mais baixo não escreva por cima do mais alto.
-- Ver lib/mtmcopy/desfecho-unico.ts.

alter table public.mtmcopy_signal_tracking
  add column if not exists sl_original numeric;

comment on column public.mtmcopy_signal_tracking.sl_original is
  'Stop que a FONTE publicou, intocado. `sl` move-se para a entrada no primeiro alvo e não serve para medir risco. NULL = linha anterior a esta migração cujo original já tinha sido apagado.';

comment on column public.mtmcopy_signal_tracking.sl is
  'Stop VIVO: sobe para a entrada no primeiro alvo. Para medir o risco do sinal usar sl_original.';

comment on column public.chat_messages.outcome is
  'Desfecho ÚNICO da trade: {label, pips, pct, origem}. `origem` é quem mediu — mestre (fecho real) > tracker (cotação) > texto (anunciado no chat). Escreve-se por lib/mtmcopy/desfecho-unico.ts, que recusa a escrita de um grau inferior.';

-- Backfill: só onde o stop original ainda não foi por cima.
-- A condição é a mesma que o motor usa para detetar break-even (distância desprezável
-- entre stop e entrada) mais a prova de que houve parcial — sem ela seria um sinal que
-- já nasceu com o stop na entrada, e esses passam a ser recusados na admissão.
update public.mtmcopy_signal_tracking
   set sl_original = sl
 where sl_original is null
   and sl is not null
   and not (
     entry is not null
     and exits_done >= 1
     and abs(sl - entry) < 1e-9
   );
