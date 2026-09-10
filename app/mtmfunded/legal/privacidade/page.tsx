import { PaginaLegal, Seccao, Lista } from '@/components/mtmfunded/pagina-legal'

export const metadata = { title: 'Política de Privacidade' }

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de Privacidade" atualizado="10 de Setembro de 2026">
      <Seccao titulo="Que dados recolhemos, e porquê">
        <p>
          Só o que é preciso para emitir a conta e para o torneio funcionar. Nada é recolhido
          «para o caso de».
        </p>
        <Lista
          itens={[
            <><b className="text-zinc-200">Nome e email</b> — identificam o participante, aparecem na classificação (o email sempre censurado) e são o canal por onde a conta é enviada.</>,
            <><b className="text-zinc-200">Telemóvel e data de nascimento</b> — exigidos pelo formulário da corretora para emitir a conta de demonstração. São enviados para lá e não são usados para marketing.</>,
            <><b className="text-zinc-200">Dados da conta e resultados</b> — número de conta, saldo, métricas e posição na classificação.</>,
            <><b className="text-zinc-200">Mensagens</b> — o que escreve no chat da comunidade e no apoio.</>,
          ]}
        />
      </Seccao>

      <Seccao titulo="O que fica público">
        <p>
          A classificação é pública, e mostra o nome que o participante escolheu na inscrição, o
          resultado em percentagem e o estado da conta. O email aparece <b className="text-zinc-200">censurado</b>,
          e a censura é feita no servidor — o email completo nunca chega ao browser de quem
          consulta a tabela.
        </p>
        <p>
          Nunca publicamos telemóvel, data de nascimento, credenciais de conta nem valores em
          euros de participantes.
        </p>
      </Seccao>

      <Seccao titulo="Credenciais">
        <p>
          A password da conta de negociação é guardada cifrada (AES-256-GCM) e não é visível no
          painel de administração — nem para nós. É enviada uma vez, por email, para o
          participante. Se for preciso reenviar, é gerada nova entrega; ninguém consulta a
          existente.
        </p>
      </Seccao>

      <Seccao titulo="Com quem partilhamos">
        <Lista
          itens={[
            <>A <b className="text-zinc-200">corretora / fornecedor da plataforma</b>, para emitir a conta: nome, email, telemóvel e data de nascimento.</>,
            <>A <b className="text-zinc-200">Stripe</b>, nos programas pagos, que processa o pagamento. Não recebemos nem guardamos dados de cartão.</>,
            <>Os <b className="text-zinc-200">fornecedores de infraestrutura</b> que alojam o serviço e enviam os emails.</>,
          ]}
        />
        <p>Não vendemos dados, e não os cedemos para publicidade de terceiros.</p>
      </Seccao>

      <Seccao titulo="Quanto tempo guardamos">
        <p>
          Os dados da participação ficam enquanto o torneio ou programa decorrer e durante o
          tempo necessário para responder por prémios e certificados emitidos. Certificados
          emitidos ficam verificáveis pelo seu código — é essa a sua utilidade. Pedindo o
          apagamento, apagamos o que não estivermos obrigados a conservar.
        </p>
      </Seccao>

      <Seccao titulo="Os seus direitos">
        <p>
          Pode pedir acesso, correcção, apagamento, limitação ou portabilidade dos seus dados, e
          opor-se a tratamentos baseados em interesse legítimo. Escreva para{' '}
          <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
            funded@morethanmoney.pt
          </a>
          . Tem também direito a apresentar reclamação junto da Comissão Nacional de Protecção
          de Dados.
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
