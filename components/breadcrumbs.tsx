"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"

export default function Breadcrumbs() {
  const pathname = usePathname()

  if (pathname === "/") return null

  const pathSegments = pathname.split("/").filter(Boolean)

  const breadcrumbItems = [
    { name: "Início", href: "/" },
    ...pathSegments.map((segment, index) => {
      const href = `/${pathSegments.slice(0, index + 1).join("/")}`
      return {
        name: segment
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        href,
      }
    }),
  ]

  return (
    <nav className="bg-black/50 border-b border-gold-500/10">
      <div className="container mx-auto px-4 py-2">
        <ol className="flex items-center space-x-2 text-sm">
          {breadcrumbItems.map((item, index) => (
            <li key={item.href} className="flex items-center">
              {index === 0 ? (
                <Link href={item.href} className="text-gray-400 hover:text-gold-400 flex items-center">
                  <Home className="h-3 w-3 mr-1" />
                  <span className="sr-only">Início</span>
                </Link>
              ) : (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-500 mx-1" />
                  {index === breadcrumbItems.length - 1 ? (
                    <span className="text-gold-400">{item.name}</span>
                  ) : (
                    <Link href={item.href} className="text-gray-400 hover:text-gold-400">
                      {item.name}
                    </Link>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  )
}
