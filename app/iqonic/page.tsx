import ParticleBackground from "@/components/particle-background"
import YouTubeEmbed from "@/components/youtube-embed"

export default function IQONICPage() {
  return (
    <main className="min-h-screen bg-black text-white relative">
      <ParticleBackground />
      <section className="container mx-auto px-4 py-12 relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            <span className="text-mtm-primary">IQONIC</span> - A Tua Porta para o Sucesso Global
          </h1>
          <p className="text-xl text-gray-300 mb-6">
            Olá! Queres mesmo transformar a tua vida financeira? A IQONIC é a plataforma que vai fazer isso acontecer. 
            Aqui podes criar um negócio global e atingir resultados incríveis!
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="bg-mtm-primary/10 border border-mtm-primary/30 rounded-lg px-4 py-2">
              <span className="text-mtm-primary font-semibold">Educação Premium</span>
            </div>
            <div className="bg-mtm-primary/10 border border-mtm-primary/30 rounded-lg px-4 py-2">
              <span className="text-mtm-primary font-semibold">Negócio Global</span>
            </div>
            <div className="bg-mtm-primary/10 border border-mtm-primary/30 rounded-lg px-4 py-2">
              <span className="text-mtm-primary font-semibold">Resultados Reais</span>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto">
          <YouTubeEmbed 
            videoId="RQIimjljeMI"
            title="Apresentação IQONIC"
            className="border border-mtm-primary/30"
          />
        </div>
        {/* CTA Section - Redesenhada */}
        <div className="max-w-6xl mx-auto mt-12">
          {/* Header */}
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Pronto para Mudar a <span className="text-mtm-primary">Tua Vida</span>?
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-6">
              Olha, <strong className="text-white">milhares de pessoas</strong> já transformaram os seus resultados com a IQONIC. 
            </p>
            <div className="inline-block bg-gradient-to-r from-mtm-primary/20 to-amber-500/20 border-2 border-mtm-primary/50 rounded-2xl p-6 mb-8">
              <p className="text-2xl font-bold text-mtm-primary">
                ✨ Tens condições especiais exclusivas só para ti!
              </p>
            </div>
          </div>

          {/* Recomendação Pessoal - Destaque */}
          <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-2 border-blue-500/50 rounded-2xl p-8 mb-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-blue-500/20 rounded-full p-4">
                <span className="text-5xl">💬</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Recomendação Pessoal</h3>
            <p className="text-lg text-gray-200 max-w-2xl mx-auto">
              Contacta-me diretamente para te explicar tudo e aproveitar as <strong className="text-blue-300">melhores condições!</strong>
            </p>
          </div>
          
          {/* CTAs Principais - Grid Simétrico */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* CTA 1 - WhatsApp */}
            <div className="bg-gradient-to-br from-green-600/10 to-emerald-600/10 border-2 border-green-500/30 rounded-2xl p-8 hover:border-green-500/60 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-green-500/20">
              <div className="flex justify-center mb-6">
                <div className="bg-green-500/20 rounded-full p-6">
                  <span className="text-6xl">🚀</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Fala Comigo Agora</h3>
              <p className="text-gray-300 mb-8 text-center leading-relaxed">
                Manda-me mensagem no WhatsApp! Vou-te explicar <strong className="text-green-300">tudo sobre como criar o teu negócio global</strong> e as melhores condições
              </p>
              <a
                href="https://wa.me/message/5NMUP53HEXVMB1"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold text-lg px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/50 text-center"
              >
                💬 Falar no WhatsApp Agora
              </a>
            </div>

            {/* CTA 2 - Registo Direto */}
            <div className="bg-gradient-to-br from-orange-600/10 to-red-600/10 border-2 border-orange-500/30 rounded-2xl p-8 hover:border-orange-500/60 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/20">
              <div className="flex justify-center mb-6">
                <div className="bg-orange-500/20 rounded-full p-6">
                  <span className="text-6xl">⚡</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Registo Direto</h3>
              <p className="text-gray-300 mb-8 text-center leading-relaxed">
                Se já sabes o que queres, clica aqui e <strong className="text-orange-300">regista-te diretamente</strong> na plataforma IQONIC
              </p>
              <a
                href="https://iqonic.life/morethanmoney"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold text-lg px-8 py-5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/50 text-center"
              >
                🎯 Faz o Teu Registo Aqui
              </a>
            </div>
          </div>

          {/* Recursos Adicionais - Simétrico */}
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 border border-mtm-primary/30 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-mtm-primary mb-6 text-center">
              Queres Saber Mais?
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <a
                href="https://iqonic.vip"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center bg-gray-800/50 border border-mtm-primary/30 hover:border-mtm-primary/60 hover:bg-gray-800 p-6 rounded-xl transition-all duration-300 hover:scale-105 group"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📚</div>
                <h4 className="text-xl font-semibold text-white mb-2">IQonic Academy</h4>
                <p className="text-gray-400 text-center text-sm">Dá uma olhadela na plataforma de educação</p>
              </a>
              
              <a
                href="https://user.iqonic.life"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center bg-gray-800/50 border border-mtm-primary/30 hover:border-mtm-primary/60 hover:bg-gray-800 p-6 rounded-xl transition-all duration-300 hover:scale-105 group"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">💼</div>
                <h4 className="text-xl font-semibold text-white mb-2">Backoffice</h4>
                <p className="text-gray-400 text-center text-sm">Vê como funciona o backoffice IQONIC</p>
              </a>
            </div>

            {/* Urgency Message */}
            <div className="mt-8 pt-6 border-t border-mtm-primary/30 text-center">
              <div className="inline-block bg-amber-500/10 border border-amber-500/30 rounded-xl px-8 py-4">
                <p className="text-lg text-amber-300 font-semibold flex items-center gap-3 justify-center">
                  <span className="text-2xl">⏰</span>
                  <span>
                    <strong>Olha, não percas tempo:</strong> Estas condições especiais são só para membros MoreThanMoney como tu!
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}



