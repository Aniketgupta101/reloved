import { getAdminToken } from "@/lib/adminSession"
import { getDonorToken } from "@/lib/donorSession"
import { getPartnerToken } from "@/lib/partnerSession"

const API_BASE = import.meta.env.VITE_API_URL || ""

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}) },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.formErrors?.join(", ") || body?.error || `Request failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

// Matches backend/server/middleware/adminAuth.ts's DEV_ADMIN_BYPASS — only
// takes effect if the backend also has it enabled (never in production).
const DEV_ADMIN_BYPASS = import.meta.env.VITE_DEV_ADMIN_BYPASS === "true"

async function adminHeaders(): Promise<HeadersInit> {
  if (DEV_ADMIN_BYPASS) return { Authorization: "Bearer dev-admin" }

  const token = getAdminToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

/** Builds a get/post/patch/postForm client scoped to one session's token getter — donor and partner logins each carry their own token, separate from admin's. */
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
    async post<T>(path: string, data: unknown): Promise<T> {
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
      return request<T>(path, { headers: await adminHeaders() })
    },
    async patch<T>(path: string, data: unknown): Promise<T> {
      return request<T>(path, {
        method: "PATCH",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async post<T>(path: string, data: unknown): Promise<T> {
      return request<T>(path, {
        method: "POST",
        headers: { ...(await adminHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    },
    async postForm<T>(path: string, form: FormData): Promise<T> {
      return request<T>(path, { method: "POST", headers: await adminHeaders(), body: form })
    },
  },

  donor: authedClient(getDonorToken),
  partner: authedClient(getPartnerToken),
}

/** Resolves an item_images.storage_path (relative disk path or seed-data URL) to a renderable <img src>. */
export function resolveImageUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return ""
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) return storagePath
  return `${API_BASE}/uploads/${storagePath}`
}
