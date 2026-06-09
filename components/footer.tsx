import Link from "next/link"
import Image from "next/image"
import { Facebook, Instagram, Twitter, Youtube, Mail, MapPin, FileText, Lock, ExternalLink } from "lucide-react"

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-black via-gray-900 to-black border-t border-mtm-primary/20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Logo e Descrição */}
          <div className="space-y-4">
            <Link href="/new-landing" className="inline-block group">
              <Image 
                src="/logo-new.png" 
                alt="MoreThanMoney Logo" 
                width={180} 
                height={60} 
                className="h-12 w-auto transition-transform group-hover:scale-105" 
              />
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">
              Plataforma integrada de formação financeira e serviços de automatização com inteligência artificial.
            </p>
            <div className="flex space-x-4">
              <Link 
                href="https://facebook.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-mtm-primary/20 text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-110"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </Link>
              <Link 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-mtm-primary/20 text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-110"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </Link>
              <Link 
                href="https://twitter.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-mtm-primary/20 text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-110"
                aria-label="Twitter"
              >
                <Twitter className="h-5 w-5" />
              </Link>
              <Link 
                href="https://youtube.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2 rounded-lg bg-gray-800/50 hover:bg-mtm-primary/20 text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-110"
                aria-label="YouTube"
              >
                <Youtube className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-mtm-primary to-amber-600 rounded-full"></span>
              Links Rápidos
            </h3>
            <ul className="space-y-3">
              {[
                { name: "Início", href: "/new-landing" },
                { name: "IQONIC", href: "/iqonic" },
                { name: "IQ Sync", href: "/swipetotrade" },
                { name: "Automatização", href: "/automation" },
                { name: "Scanner MTM", href: "/scanner" },
                { name: "Trading Floor", href: "/tradingfloor" },
                { name: "Work", href: "/work" },
                { name: "Onboarding", href: "/onboarding" },
              ].map((link) => (
                <li key={link.name}>
                  <Link 
                    href={link.href} 
                    className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:translate-x-1 inline-flex items-center gap-2 group"
                  >
                    <span className="w-0 group-hover:w-2 h-0.5 bg-mtm-primary transition-all duration-300"></span>
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Recursos */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-mtm-primary to-amber-600 rounded-full"></span>
              Recursos
            </h3>
            <ul className="space-y-3">
              {[
                { name: "Scanner ao Vivo", href: "/scanner-access" },
                { name: "Registo", href: "/register" },
                { name: "Entrar", href: "/login" },
                { name: "Apps IA MTM", href: "/app-mobile?tab=apps" },
                { name: "MTM Studio", href: "https://mtmbrandbuilder.lovable.app", external: true },
                { name: "MTM Partnership Engine", href: "https://mtmugcapp.lovable.app", external: true },
                { name: "MTM AiOS", href: "https://mtmaios.lovable.app", external: true },
                { name: "Cursos MoreThanMoney", href: "https://www.skool.com/morethanmoney-1132/about", external: true },
                { name: "IQONIC Platform", href: "https://iqonic.life/morethanmoney", external: true },
              ].map((link) => (
                <li key={link.name}>
                  <Link 
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:translate-x-1 inline-flex items-center gap-2 group"
                  >
                    <span className="w-0 group-hover:w-2 h-0.5 bg-mtm-primary transition-all duration-300"></span>
                    {link.name}
                    {link.external && <ExternalLink className="h-3 w-3 opacity-50" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-gradient-to-b from-mtm-primary to-amber-600 rounded-full"></span>
              Contato
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-gray-400 hover:text-mtm-primary transition-colors">
                <Mail className="h-4 w-4 text-mtm-primary flex-shrink-0" />
                <a href="mailto:geral@morethanmoney.pt" className="text-sm">
                  geral@morethanmoney.pt
                </a>
              </li>
              <li className="flex items-center gap-3 text-gray-400">
                <MapPin className="h-4 w-4 text-mtm-primary flex-shrink-0" />
                <span className="text-sm">Portugal</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-mtm-primary/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm text-center md:text-left">
              © {new Date().getFullYear()} MoreThanMoney. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-6 text-sm flex-wrap justify-center">
              <Link 
                href="/faq" 
                className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-2 group"
              >
                <FileText className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span>FAQ</span>
              </Link>
              <Link 
                href="/privacy-policy" 
                className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-2 group"
              >
                <Lock className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span>Privacidade</span>
              </Link>
              <Link 
                href="/terms" 
                className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-2 group"
              >
                <FileText className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span>Termos</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
