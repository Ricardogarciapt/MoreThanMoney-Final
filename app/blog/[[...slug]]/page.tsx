/**
 * Blog Opinly — rota catch-all sob /blog (blogPath do withOpinlyConfig).
 *
 * Mapa de segmentos (espelha os prefixos por omissão do SDK):
 *   /blog                     → índice de posts
 *   /blog/<slug>              → post (slugs são flat, únicos por empresa)
 *   /blog/category/<slug>     → arquivo de categoria
 *   /blog/authors             → autores
 *   /blog/authors/<slug>      → arquivo de autor
 *   /blog/tag/<slug>          → arquivo de tag
 *
 * Renderização dinâmica; o data cache é etiquetado com a tag 'opinly' no cliente
 * (lib/opinly/client) e invalidado pelo webhook content.routes-changed.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata, ResolvingMetadata } from "next"
import { OpinlyContent } from "@opinly/react"
import {
  opinlyConfig,
  generateOpinlyMetadata,
  OpinlyJsonLd,
  buildBlogPostingJsonLd,
  buildFaqJsonLd,
  formatDate,
} from "@opinly/next"
import type { SeoResolved } from "@opinly/shared"
import type { Post } from "@opinly/backend"
import { getOpinly } from "@/lib/opinly/client"

type RouteParams = { slug?: string[] }

const CATEGORY_PREFIX = "category"
const AUTHORS_PREFIX = "authors"
const TAG_PREFIX = "tag"

type ResolvedRoute =
  | { kind: "home" }
  | { kind: "post"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "authors" }
  | { kind: "author"; slug: string }
  | { kind: "tag"; slug: string }
  | { kind: "not-found" }

function resolveRoute(segments: string[]): ResolvedRoute {
  if (segments.length === 0) return { kind: "home" }
  const [first, second, ...rest] = segments
  if (rest.length > 0) return { kind: "not-found" }
  if (first === CATEGORY_PREFIX) return second ? { kind: "category", slug: second } : { kind: "home" }
  if (first === AUTHORS_PREFIX) return second ? { kind: "author", slug: second } : { kind: "authors" }
  if (first === TAG_PREFIX) return second ? { kind: "tag", slug: second } : { kind: "home" }
  if (second) return { kind: "not-found" }
  return { kind: "post", slug: first }
}

/** Resolve a rota para SEO — partilhado entre generateMetadata e a página (fetches deduplicados). */
async function resolveSeo(route: ResolvedRoute): Promise<SeoResolved> {
  const opinly = getOpinly()
  switch (route.kind) {
    case "home":
      return { type: "home" }
    case "post": {
      const post = await opinly.post(route.slug)
      return post ? { type: "post", data: post } : { type: "not-found" }
    }
    case "category": {
      const categories = await opinly.categories()
      const cat = categories.find((c) => c.slug === route.slug)
      return cat ? { type: "category", data: { name: cat.title, slug: cat.slug, description: cat.description } } : { type: "not-found" }
    }
    case "authors":
      return { type: "authors" }
    case "author": {
      const page = await opinly.author(route.slug)
      return page.type === "author" ? { type: "author", data: page.data } : { type: "not-found" }
    }
    case "tag": {
      const tags = await opinly.tags()
      const tag = tags.find((t) => t.slug === route.slug)
      return tag ? { type: "tag", data: tag } : { type: "not-found" }
    }
    default:
      return { type: "not-found" }
  }
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveSeo(resolveRoute(slug ?? []))
  return generateOpinlyMetadata(resolved, parent)
}

const GOLD = "text-[#efb810]"

function PostCard({ post }: { post: Post }) {
  return (
    <article className="group rounded-2xl border border-[#efb810]/20 bg-white/[0.03] p-6 transition-colors hover:border-[#efb810]/50">
      <Link href={`/blog/${post.slug}`} className="block">
        {post.category?.name && (
          <span className={`text-xs font-semibold uppercase tracking-wider ${GOLD}`}>{post.category.name}</span>
        )}
        <h2 className="mt-1 text-xl font-bold text-white group-hover:text-[#efb810]">{post.title}</h2>
        {post.description && <p className="mt-2 line-clamp-3 text-sm text-gray-400">{post.description}</p>}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          {post.author?.name && <span>{post.author.name}</span>}
          {post.author?.name && <span>·</span>}
          <time dateTime={post.firstPublishedAt}>{formatDate(post.firstPublishedAt)}</time>
        </div>
      </Link>
    </article>
  )
}

function PostGrid({ posts, title, description }: { posts: Post[]; title: string; description?: string | null }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-white">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-gray-400">{description}</p>}
      </header>
      {posts.length === 0 ? (
        <p className="text-gray-400">Ainda não há artigos aqui — volta em breve.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </main>
  )
}

export default async function BlogPage({ params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  const route = resolveRoute(slug ?? [])
  const opinly = getOpinly()

  if (route.kind === "not-found") notFound()

  if (route.kind === "post") {
    const post = await opinly.post(route.slug)
    if (!post) notFound()
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <OpinlyJsonLd data={buildBlogPostingJsonLd(post)} />
        {post.faqs && post.faqs.length > 0 && <OpinlyJsonLd data={buildFaqJsonLd(post.faqs)} />}

        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/blog" className={`hover:underline ${GOLD}`}>
            ← Blog
          </Link>
        </nav>
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold leading-tight text-white">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
            {post.author?.name && (
              <Link href={`/blog/${AUTHORS_PREFIX}/${post.author.slug}`} className="hover:text-[#efb810]">
                {post.author.name}
              </Link>
            )}
            {post.author?.name && <span>·</span>}
            <time dateTime={post.firstPublishedAt}>{formatDate(post.firstPublishedAt)}</time>
          </div>
        </header>

        <div className="opinly-content">
          <OpinlyContent
            content={post.content}
            config={opinlyConfig}
            classNames={{
              paragraph: "mb-4 leading-7 text-gray-300",
              heading: "mt-8 mb-3 font-bold text-white",
              image: "my-6 rounded-xl",
              bulletList: "mb-4 list-disc pl-6 text-gray-300",
              orderedList: "mb-4 list-decimal pl-6 text-gray-300",
              listItem: "mb-1",
              blockquote: "my-6 border-l-4 border-[#efb810] pl-4 italic text-gray-400",
              code: "rounded bg-white/10 px-1.5 py-0.5 text-sm",
              codeBlock: "my-6 overflow-x-auto rounded-xl bg-white/5 p-4 text-sm",
              horizontalRule: "my-8 border-[#efb810]/20",
              table: "my-6 w-full border-collapse text-sm",
              link: "text-[#efb810] underline underline-offset-2 hover:opacity-80",
            }}
          />
        </div>

        {post.faqs && post.faqs.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-2xl font-bold text-white">Perguntas frequentes</h2>
            <div className="space-y-4">
              {post.faqs.map((faq) => (
                <details key={faq.question} className="rounded-xl border border-[#efb810]/20 bg-white/[0.03] p-4">
                  <summary className="cursor-pointer font-semibold text-white">{faq.question}</summary>
                  <p className="mt-2 text-gray-400">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </main>
    )
  }

  if (route.kind === "category") {
    const [categories, list] = await Promise.all([opinly.categories(), opinly.posts({ category: route.slug, limit: 50 })])
    const cat = categories.find((c) => c.slug === route.slug)
    if (!cat) notFound()
    return <PostGrid posts={list.data} title={cat.title} description={cat.description} />
  }

  if (route.kind === "tag") {
    const [tags, list] = await Promise.all([opinly.tags(), opinly.posts({ tag: route.slug, limit: 50 })])
    const tag = tags.find((t) => t.slug === route.slug)
    if (!tag) notFound()
    return <PostGrid posts={list.data} title={`#${tag.name}`} description={tag.description} />
  }

  if (route.kind === "author") {
    const page = await opinly.author(route.slug)
    if (page.type !== "author") notFound()
    return <PostGrid posts={page.data.posts} title={page.data.name} description={page.data.bio} />
  }

  if (route.kind === "authors") {
    const authors = await opinly.authors()
    const items = authors.data
    return (
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-10 text-4xl font-extrabold text-white">Autores</h1>
        <div className="grid gap-6 sm:grid-cols-2">
          {items.map((a) => (
            <Link
              key={a.slug}
              href={`/blog/${AUTHORS_PREFIX}/${a.slug}`}
              className="rounded-2xl border border-[#efb810]/20 bg-white/[0.03] p-6 hover:border-[#efb810]/50"
            >
              <h2 className="text-xl font-bold text-white">{a.name}</h2>
              {a.bio && <p className="mt-2 line-clamp-2 text-sm text-gray-400">{a.bio}</p>}
            </Link>
          ))}
        </div>
      </main>
    )
  }

  // home
  const list = await opinly.posts({ limit: 50, sort: "newest" })
  return (
    <PostGrid
      posts={list.data}
      title="Blog MoreThanMoney"
      description="Trading consciente, liberdade financeira e o ecossistema MTM — artigos e guias da equipa."
    />
  )
}
