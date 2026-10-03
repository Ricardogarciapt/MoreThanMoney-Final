-- 103 — TIRA A FK DE `operador_educator_id` (INCIDENTE 16/09)
--
-- O QUE ACONTECEU
--
-- A migração 101 pôs uma SEGUNDA foreign key de `lms_streams` para `lms_educators`
-- (`educator_id` e `operador_educator_id`). O PostgREST deriva as relações a partir das FKs, e
-- com duas deixou de saber qual usar: todos os embeds `educator:lms_educators(...)` passaram a
-- responder «more than one relationship was found for 'lms_streams' and 'lms_educators'».
--
-- Esse embed é usado em ~12 rotas. Resultado: o LMS e o studio deixaram de listar salas nenhumas
-- — 500 em produção, com a base intacta. Nada foi apagado; era só a leitura que estava partida.
--
-- A REPOSIÇÃO
--
-- Cai a FK, fica a coluna. Perde-se a integridade referencial (um educador apagado deixa o id
-- pendurado) e ganha-se o serviço de volta IMEDIATAMENTE, sem deploy.
--
-- A alternativa — nomear a constraint em cada um dos ~12 embeds
-- (`educator:lms_educators!lms_streams_educator_id_fkey(...)`) — é a correcção «bonita», mas
-- obrigava a um build e a um deploy com o site em baixo entretanto. Com produção a dar 500, o
-- que manda é o tempo de reposição.
--
-- A validação de quem opera a sala não se perde: é feita em código por `podeOperarSala`
-- (lib/lms-sala-introducao.ts), que compara o id de quem age antes de qualquer escrita.
--
-- A LIÇÃO, para quem vier a seguir
--
-- Nesta base, acrescentar uma segunda FK para a mesma tabela PARTE todos os embeds do PostgREST
-- que não nomeiem a constraint — e parte-os em silêncio, longe da migração que os causou. Antes
-- de voltar a pôr esta FK: nomear primeiro os embeds existentes, deployar isso, e só depois
-- reintroduzir a chave.

begin;

alter table public.lms_streams
  drop constraint if exists lms_streams_operador_educator_id_fkey;

commit;

notify pgrst, 'reload schema';
