/** Client preview host — option/test controls for design reviews.
 *  Firebase (reloved-digital.web.app) and custom domains are production. */
export function isClientPreviewHost(): boolean {
  return false
}

/** True on a developer's own machine specifically. */
export function isLocalHost(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return host === "localhost" || host === "127.0.0.1"
}
