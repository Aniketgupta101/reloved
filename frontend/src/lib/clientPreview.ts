/** Client preview host — shows option/test controls for Sheetal.
 *  Production custom domain stays clean. */
export function isClientPreviewHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return (
    host === "reloved-digital.web.app" ||
    host.endsWith(".web.app") ||
    host === "localhost" ||
    host === "127.0.0.1"
  )
}

/** True on a developer's own machine specifically (not the web.app preview host). */
export function isLocalHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return host === "localhost" || host === "127.0.0.1"
}
