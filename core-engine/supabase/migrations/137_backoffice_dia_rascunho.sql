-- 137 — O rascunho da mensagem, ao lado da tarefa
--
-- Uma tarefa que diz «segue a proposta do João» ainda deixa o trabalho todo por fazer: a pessoa tem
-- de ir buscar o contexto, decidir o tom e escrever do zero. É nesse atrito que o follow-up morre —
-- não por preguiça, por custar quinze minutos cada um. Doze tarefas dessas são três horas.
--
-- Com o rascunho ao lado, o trabalho passa a ser ler, corrigir e enviar. A IA redige; quem envia é
-- sempre a pessoa, e o texto passa pelos olhos dela antes de sair.
alter table public.vendas_tarefas add column if not exists rascunho text;
