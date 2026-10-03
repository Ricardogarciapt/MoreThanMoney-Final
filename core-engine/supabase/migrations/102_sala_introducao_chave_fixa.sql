-- 102 — A SALA «INTRODUÇÃO» PASSA A USAR A CHAVE FIXA DO EDUCADOR
--
-- Decisão do dono (16/09): não quer trocar a chave no OBS entre gravar a introdução e dar uma
-- aula normal. A sala passa a usar a MESMA chave fixa do educador Ricardo Garcia que as outras
-- salas dele (`lms_educators.stream_key_fixed`), em vez da chave própria `mtm_introducao_…`.
--
-- O QUE ISTO QUEBRAVA, E PORQUE É QUE JÁ NÃO QUEBRA
--
-- Essa chave é partilhada por várias salas (Live Trading, Live Trading VIP, Mentoria VIP,
-- MoreThanMoney Basics). Quando o ficheiro chega ao DVR, o `on_dvr` só tem a chave para saber a
-- que sala pertence, e desempatava pela sala que estivesse AO VIVO. Uma sala de gravação nunca
-- está ao vivo — logo perdia sempre o desempate, e a gravação da introdução seria atribuída a
-- outra sala do educador, indo parar à playlist do curso errado.
--
-- O desempate passou a ter um degrau no meio: ao vivo > A GRAVAR > mais recente. A coluna
-- `gravacao_iniciada_em` (migração 101) só está preenchida enquanto o dono carregou em «Iniciar
-- transmissão», por isso identifica a sala certa sem ambiguidade. Ver
-- `app/api/live-sessions/dvr/on-dvr/route.ts` e os testes em
-- `lib/__tests__/sala-introducao.check.ts` (secção 7e) — se aquela ordenação desaparecer, isto
-- volta a partir em silêncio.
--
-- O ingest continua MTM directo (101): por Restream o ficheiro não cairia no nosso SRS e não
-- haveria gravação nenhuma para enviar.
--
-- Idempotente: se a sala já estiver com a chave fixa, não faz nada. Se o educador não tiver chave
-- fixa definida, também não faz nada — mais vale a sala ficar com a chave própria, que funciona,
-- do que ficar sem chave.

begin;

update public.lms_streams s
   set stream_key = e.stream_key_fixed
  from public.lms_educators e
 where s.chave_sistema = 'introducao'
   and e.id = s.operador_educator_id
   and e.stream_key_fixed is not null
   and s.stream_key is distinct from e.stream_key_fixed;

commit;
