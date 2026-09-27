export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
  }
}
