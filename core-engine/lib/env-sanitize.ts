/** Remove aspas, \\n literais e newlines acidentais das env vars da Vercel. */
export function sanitizeEnv(value: string | undefined | null, fallback = ''): string {
  if (value == null) return fallback
  const cleaned = String(value)
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '')
    .replace(/\r?\n/g, '')
    .trim()
  return cleaned || fallback
}
