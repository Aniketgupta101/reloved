import { getAdminToken } from "@/lib/adminSession"
import { getDonorToken, setDonorToken } from "@/lib/donorSession"
import { getPartnerToken } from "@/lib/partnerSession"
import { ApiRequestError } from "@/lib/apiError"
import {
  assertAdminRequestAllowed,
  normalizeAdminDataMode,
} from "@/lib/adminReadOnlyPolicy.mjs"
import { recordAdminRequest } from "@/lib/adminDiagnostics"

const API_BASE = import.meta.env.VITE_API_URL || ""
const ADMIN_DATA_MODE = normalizeAdminDataMode(import.meta.env.VITE_ADMIN_DATA_MODE)

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const startedAt = performance.now()
  const method = String(options.method || "GET").toUpperCase()
  const observe = path.startsWith("/api/admin/") || path === "/api/health"
  let responseStatus: number | null = null
  let failure: string | null = null
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  }
  // Personalize public Wall/item fetches for a logged-in donor (e.g. hide declined items).
  if (!headers.Authorization && !headers.authorization) {
    const donorToken = getDonorToken()
    if (donorToken) headers.Authorization = `Bearer ${donorToken}`
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })
    responseStatus = res.status

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const err = body?.error
      let message = `Request failed (${res.status})`
      if (typeof err === "string") {
        message = err
      } else if (Array.isArray(err?.formErrors) && err.formErrors.length) {
        message = err.formErrors.join(", ")
      } else if (err?.fieldErrors && typeof err.fieldErrors === "object") {
        const parts = Object.entries(err.fieldErrors as Record<string, string[]>)
          .flatMap(([field, msgs]) => (msgs || []).map((m) => `${field}: ${m}`))
        if (parts.length) message = parts.join("; ")
      }
      const code = typeof body?.code === "string" ? body.code : undefined
      const details =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : undefined
      failure = message
      throw new ApiRequestError(res.status, message, code, details)
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      failure = "API returned a non-JSON response."
      throw new Error("API unavailable - check that VITE_API_URL is set correctly.")
    }

    const data = (await res.json()) as T & { token?: string }
    // Sliding donor session: backend may return a fresh JWT on profile reads.
    if (typeof data?.token === "string" && data.token.length > 20 && getDonorToken()) {
      setDonorToken(data.token, { silent: true })
    }
    return data as T
  } catch (error) {
    failure ||= error instanceof Error ? error.message : "Request failed"
    throw error
  } finally {
    if (observe) {
      recordAdminRequest({
        path,
        method,
        status: responseStatus,
        durationMs: performance.now() - startedAt,
        error: failure,
      })
    }
  }
}

// Matches backend/server/middleware/adminAuth.ts's DEV_ADMIN_BYPASS - only
// takes effect if the backend also has it enabled (never in production).
const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === "true"

async function adminHeaders(): Promise<HeadersInit> {
  if (DEV_ADMIN_BYPASS) return { Authorization: "Bearer dev-admin" }

  const token = getAdminToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  assertAdminRequestAllowed(options.method || "GET", ADMIN_DATA_MODE)
  return request<T>(path, options)
}

/** Builds a get/post/patch/postForm client scoped to one session's token getter - donor and partner logins each carry their own token, separate from admin's. */
function authedClient(getToken: () => string | null) {
  async function headers(): Promise<HeadersInit> {
    const token = getToken()
    if (!token) throw new Error("Not signed in")
    return { Authorization: `Bearer ${token}` }
  }

  return {
    async get<T>(path: string): Promise<T> {
      return request<T>(path, { headers: await headers() })
    },
    async post<T>(path: string, data: unknown = {}): Promise<T> {
      return request<T>(path, {
        method: "POST",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async patch<T>(path: string, data: unknown): Promise<T> {
      return request<T>(path, {
        method: "PATCH",
        headers: { ...(await headers()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async delete<T>(path: string, data?: unknown): Promise<T> {
      return request<T>(path, {
        method: "DELETE",
        headers: {
          ...(await headers()),
          ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: data !== undefined ? JSON.stringify(data) : undefined,
      })
    },
    async postForm<T>(path: string, form: FormData): Promise<T> {
      return request<T>(path, { method: "POST", headers: await headers(), body: form })
    },
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, data: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),

  admin: {
    async get<T>(path: string): Promise<T> {
      return adminRequest<T>(path, { headers: await adminHeaders() })
    },
    async patch<T>(path: string, data: unknown): Promise<T> {
      return adminRequest<T>(path, {
        method: "PATCH",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async post<T>(path: string, data: unknown = {}): Promise<T> {
      return adminRequest<T>(path, {
        method: "POST",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async postForm<T>(path: string, form: FormData): Promise<T> {
      return adminRequest<T>(path, { method: "POST", headers: await adminHeaders(), body: form })
    },
    async delete<T>(path: string): Promise<T> {
      return adminRequest<T>(path, {
        method: "DELETE",
        headers: await adminHeaders(),
      })
    },
  },

  donor: authedClient(getDonorToken),
  partner: authedClient(getPartnerToken),
}

/**
 * Resolves an item_images.storage_path to a renderable <img src>.
 * Wall catalog cutouts default to same-origin WebP thumbs (~10-70KB) so the
 * grid stays fast; pass `{ full: true }` for detail pages (display WebP ~50-150KB).
 */
export function resolveImageUrl(
  storagePath: string | null | undefined,
  opts?: { full?: boolean },
): string {
  if (!storagePath) return ""
  if (import.meta.env.VITE_ADMIN_LIVE_READ_ONLY === "1") {
    const productionAsset = storagePath.match(
      /^https:\/\/storage\.googleapis\.com\/reloved-digital-uploads\/(.+)$/i,
    )
    if (productionAsset) {
      return `/api/admin/control-center/assets/${productionAsset[1]
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    }
  }
  const wallFile = storagePath.match(/\/images\/wall-items\/(?:thumbs\/|display\/)?([^\/?#]+)\.(png|webp|jpe?g)/i)
  if (wallFile) {
    const stem = wallFile[1]
    // Thumbs were written as `{stem}.webp`; display WebPs as `{stem}.png.webp`.
    if (opts?.full) return `/images/wall-items/display/${stem}.png.webp`
    return `/images/wall-items/thumbs/${stem}.webp`
  }
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://") || storagePath.startsWith("/")) {
    return storagePath
  }
  return `${API_BASE}/uploads/${storagePath}`
}
