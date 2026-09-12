import type { Request } from "express"
import Busboy from "busboy"

export type UploadedFile = {
  fieldname: string
  filename: string
  mimeType: string
  buffer: Buffer
}

/**
 * Cloud Functions / Cloud Run often expose `rawBody` and break streaming multer.
 * Prefer rawBody when present; otherwise pipe the request.
 */
export function parseMultipart(
  req: Request,
  limits: { fileSize?: number; files?: number } = {}
): Promise<{
  fields: Record<string, string>
  files: UploadedFile[]
}> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files: UploadedFile[] = []
    const bb = Busboy({
      headers: req.headers,
      limits: {
        fileSize: limits.fileSize ?? 8 * 1024 * 1024,
        files: limits.files ?? 5,
      },
    })

    bb.on("file", (fieldname, stream, info) => {
      const chunks: Buffer[] = []
      stream.on("data", (chunk: Buffer) => chunks.push(chunk))
      stream.on("end", () => {
        files.push({
          fieldname,
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        })
      })
      stream.on("error", reject)
    })
    bb.on("field", (name, val) => {
      fields[name] = val
    })
    bb.on("error", reject)
    bb.on("finish", () => resolve({ fields, files }))

    const raw = (req as Request & { rawBody?: Buffer }).rawBody
    if (raw) {
      bb.end(raw)
    } else {
      req.pipe(bb)
    }
  })
}

export function isMultipart(req: Request) {
  const ct = String(req.headers["content-type"] || "")
  return ct.includes("multipart/form-data")
}
