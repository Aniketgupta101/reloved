/**
 * Short.io branded short links on go.reloved.digital.
 * Used for SMS / email CTAs and admin link management.
 * Docs: https://developers.short.io/
 */
const API_BASE = "https://api.short.io"

export function shortIoConfigured(): boolean {
  return Boolean(String(process.env.SHORT_IO_API_KEY || "").trim())
}

function apiKey(): string | null {
  const key = String(process.env.SHORT_IO_API_KEY || "").trim()
  return key || null
}

export function shortIoDomain(): string {
  return String(process.env.SHORT_IO_DOMAIN || "go.reloved.digital").trim() || "go.reloved.digital"
}

export function shortIoDomainId(): number {
  const raw = String(process.env.SHORT_IO_DOMAIN_ID || "1985296").trim()
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1985296
}

type ShortLinkResult = {
  shortURL: string
  originalURL: string
  path: string
  idString?: string
  duplicate?: boolean
}

async function shortIoFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = apiKey()
  if (!key) throw new Error("SHORT_IO_API_KEY not configured")
  const headers: Record<string, string> = {
    Authorization: key,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/**
 * Create or return an existing short link on go.reloved.digital.
 * If `path` is set, reuses that slug (idempotent when the same originalURL is used).
 */
export async function createShortLink(opts: {
  originalURL: string
  path?: string
  title?: string
  tags?: string[]
}): Promise<ShortLinkResult | null> {
  if (!shortIoConfigured()) return null
  const originalURL = String(opts.originalURL || "").trim()
  if (!originalURL) return null

  const body: Record<string, unknown> = {
    domain: shortIoDomain(),
    originalURL,
    allowDuplicates: false,
  }
  if (opts.path) body.path = String(opts.path).replace(/^\/+/, "").slice(0, 64)
  if (opts.title) body.title = String(opts.title).slice(0, 120)
  if (opts.tags?.length) body.tags = opts.tags

  try {
    const res = await shortIoFetch("/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      // Path already taken → expand and return existing if it matches, else fall back.
      if (opts.path) {
        const existing = await expandShortPath(opts.path)
        if (existing?.shortURL) return existing
      }
      console.error("[short.io] create failed", res.status, data)
      return null
    }
    const shortURL = String(data.secureShortURL || data.shortURL || "")
    if (!shortURL) return null
    return {
      shortURL,
      originalURL: String(data.originalURL || originalURL),
      path: String(data.path || opts.path || ""),
      idString: data.idString ? String(data.idString) : undefined,
      duplicate: Boolean(data.duplicate),
    }
  } catch (err) {
    console.error("[short.io] create error", err)
    return null
  }
}

export async function expandShortPath(path: string): Promise<ShortLinkResult | null> {
  if (!shortIoConfigured()) return null
  const clean = String(path || "").replace(/^\/+/, "").trim()
  if (!clean) return null
  try {
    const qs = new URLSearchParams({ domain: shortIoDomain(), path: clean })
    const res = await shortIoFetch(`/links/expand?${qs.toString()}`)
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return null
    const shortURL = String(data.secureShortURL || data.shortURL || "")
    if (!shortURL) return null
    return {
      shortURL,
      originalURL: String(data.originalURL || ""),
      path: String(data.path || clean),
      idString: data.idString ? String(data.idString) : undefined,
    }
  } catch {
    return null
  }
}

export async function listShortLinks(limit = 50): Promise<
  Array<{
    shortURL: string
    originalURL: string
    path: string
    title?: string
    idString?: string
    createdAt?: string
  }>
> {
  if (!shortIoConfigured()) return []
  try {
    const qs = new URLSearchParams({
      domain_id: String(shortIoDomainId()),
      limit: String(Math.min(100, Math.max(1, limit))),
    })
    const res = await shortIoFetch(`/api/links?${qs.toString()}`)
    const data = (await res.json().catch(() => ({}))) as {
      links?: Array<Record<string, unknown>>
    }
    if (!res.ok || !Array.isArray(data.links)) return []
    return data.links.map((row) => ({
      shortURL: String(row.secureShortURL || row.shortURL || ""),
      originalURL: String(row.originalURL || ""),
      path: String(row.path || ""),
      title: row.title ? String(row.title) : undefined,
      idString: row.idString ? String(row.idString) : undefined,
      createdAt: row.createdAt ? String(row.createdAt) : undefined,
    }))
  } catch (err) {
    console.error("[short.io] list error", err)
    return []
  }
}

const PUBLIC_APP_URL = () => process.env.PUBLIC_APP_URL || "https://reloved.digital"

/**
 * Shorten an absolute app URL (or path) for SMS / compact CTAs.
 * Falls back to the original URL if Short.io is unavailable.
 */
export async function shortenAppUrl(
  urlOrPath: string,
  opts?: { path?: string; title?: string; tags?: string[] },
): Promise<string> {
  const raw = String(urlOrPath || "").trim()
  if (!raw) return PUBLIC_APP_URL()

  let absolute = raw
  if (raw.startsWith("/")) {
    absolute = `${PUBLIC_APP_URL().replace(/\/$/, "")}${raw}`
  }

  // Already on our short domain — leave as-is.
  if (/^https?:\/\/go\.reloved\.digital\//i.test(absolute)) return absolute

  const created = await createShortLink({
    originalURL: absolute,
    path: opts?.path,
    title: opts?.title,
    tags: opts?.tags || ["reloved", "app"],
  })
  return created?.shortURL || absolute
}

/** Known stable slugs on go.reloved.digital (no API call). */
export type ShortPublicKind = "go" | "home" | "wall" | "give" | "account" | "love" | "test"

export function shortPublicUrl(kind: ShortPublicKind = "go"): string {
  const domain = shortIoDomain().replace(/\/$/, "")
  return `https://${domain}/${kind}`
}

/** Stable public short links we keep on go.reloved.digital. */
export const SHORT_LINK_PRESETS = [
  { path: "go", originalURL: "https://reloved.digital/", title: "Reloved home (go)" },
  { path: "home", originalURL: "https://reloved.digital/", title: "Reloved home" },
  { path: "wall", originalURL: "https://reloved.digital/drop", title: "Wall of Kindness" },
  { path: "give", originalURL: "https://reloved.digital/give", title: "Drop an item" },
  { path: "account", originalURL: "https://reloved.digital/account", title: "Your account" },
  { path: "love", originalURL: "https://reloved.digital/love", title: "Wall of Love" },
  { path: "test", originalURL: "https://test.reloved.digital/", title: "Reloved test" },
] as const

export async function ensurePresetShortLinks(): Promise<ShortLinkResult[]> {
  const out: ShortLinkResult[] = []
  for (const preset of SHORT_LINK_PRESETS) {
    const link = await createShortLink({ ...preset, tags: ["reloved", "preset"] })
    if (link) out.push(link)
  }
  return out
}
