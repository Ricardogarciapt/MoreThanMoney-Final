import Link from "next/link"
import Image from "next/image"
import { Facebook, Instagram, Twitter, Youtube, Mail, Phone, Lock, MapPin, FileText, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Footer() {
  return (
    <footer className="border-t" style={{ 
      backgroundColor: '#795300',
      borderTopColor: 'rgba(239, 184, 16, 0.5)' 
    }}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Logo e Informações */}
          <div className="space-y-4">
            <Link href="/new-landing" className="inline-block">
              <Image src="/logo-new.png" alt="MoreThanMoney Logo" width={150} height={50} className="h-12 w-auto" />
            </Link>
            <p className="text-gray-400 text-sm">
              Plataforma integrada de formação financeira e serviços de automatização com inteligência artificial.
            </p>
            <div className="flex space-x-4">
              <Link href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <Facebook className="h-5 w-5 text-gray-400 hover:text-mtm-primary transition-colors" />
              </Link>
              <Link href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <Instagram className="h-5 w-5 text-gray-400 hover:text-mtm-primary transition-colors" />
              </Link>
              <Link href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter">
                <Twitter className="h-5 w-5 text-gray-400 hover:text-mtm-primary transition-colors" />
              </Link>
              <Link href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                <Youtube className="h-5 w-5 text-gray-400 hover:text-mtm-primary transition-colors" />
              </Link>
            </div>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="text-white font-bold mb-4">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/new-landing" className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-105">
                  Início
                </Link>
              </li>
              <li>
                <Link href="/scanner" className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-105">
                  Scanner MTM
                </Link>
              </li>
              <li>
                <Link href="/scanner-access" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  Scanner ao Vivo
                </Link>
              </li>
              <li>
                <Link href="/iqonic" className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-105">
                  IQONIC
                </Link>
              </li>
              <li>
                <Link href="/onboarding" className="text-gray-400 hover:text-mtm-primary transition-all duration-300 hover:scale-105">
                  Onboarding
                </Link>
              </li>
            </ul>
          </div>

          {/* Recursos */}
          <div>
            <h3 className="text-white font-bold mb-4">Recursos</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/scanner-access" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  Scanner ao Vivo
                </Link>
              </li>
              <li>
                <Link href="/aimtm" className="text-gray-400 hover:text-mtm-primary transition-colors font-semibold">
                  🤖 AI MTM
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  Registo
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  Entrar
                </Link>
              </li>
              <li>
                <Link href="https://www.skool.com/morethanmoney" target="_blank" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  Cursos MoreThanMoney
                </Link>
              </li>
              <li>
                <Link href="https://iqonic.life/morethanmoney" target="_blank" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  IQONIC
                </Link>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-white font-bold mb-4">Contato</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-mtm-primary" />
                <a href="mailto:info@morethanmoney.pt" className="text-gray-400 hover:text-mtm-primary transition-colors">
                  info@morethanmoney.pt
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-mtm-primary" />
                <span className="text-gray-400">Portugal</span>
              </li>
            </ul>
            <div className="mt-4">
              <h4 className="text-white font-medium mb-2">Newsletter</h4>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Seu email"
                  className="bg-gray-800 border border-gray-700 rounded-l-md px-3 py-2 text-sm w-full focus:outline-none focus:border-gold-500"
                />
                <button className="btn-primary px-3 py-2 rounded-r-md text-sm">
                  Inscrever
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-6 pt-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <p className="text-gray-400 text-sm">
              © 2025 MoreThanMoney. Todos os direitos reservados. MoreThanMoneyTM é uma marca registada.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/faq" className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-1">
                <FileText className="h-3 w-3" />
                FAQ
              </Link>
              <Link href="/privacy-policy" className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Política de Privacidade
              </Link>
              <Link href="/terms" className="text-gray-400 hover:text-mtm-primary transition-colors flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Termos e Condições
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
