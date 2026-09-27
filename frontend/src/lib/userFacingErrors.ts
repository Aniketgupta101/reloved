type FeedbackKind =
  | "auth"
  | "size"
  | "upload"
  | "uncertain"
  | "validation"
  | "unavailable"
  | "limit"
  | "missing"
  | "delivery_failed"

export type RecoveryAction = {
  label: string
  href: string
  openInNewTab?: boolean
}

export type UserFacingFeedback = {
  kind: FeedbackKind
  title: string
  message: string
  tone: "error" | "warn"
  recovery?: RecoveryAction
}

export type PartialGiveResult = {
  submittedCount: number
  failedCount: number
}

export type GiveSuccessFeedback = {
  kind: "complete" | "partial"
  title: string
  message: string
  referenceLabel: string
  recovery: RecoveryAction
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null
  const status = Number((error as { status?: unknown }).status)
  return Number.isInteger(status) ? status : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "").trim()
  }
  return ""
}

function outcomeIsUncertain(error: unknown): boolean {
  const status = errorStatus(error)
  return status == null || status === 408 || status >= 500
}

function safeValidationMessage(message: string): string | null {
  if (!message || message.length > 240) return null
  return /^(add|enter|include|select|confirm|your |pickup |delivery |alias |too many |weekly limit)/i.test(
    message,
  )
    ? message
    : null
}

export function getGiveSubmissionFeedback(error: unknown): UserFacingFeedback {
  const message = errorMessage(error)

  if (/exceeded the max upload size/i.test(message)) {
    return {
      kind: "size",
      title: "Photo is too large",
      message: "This photo is over the 12 MB upload limit. Choose a smaller photo and try again.",
      tone: "error",
    }
  }

  if (/too many photos/i.test(message)) {
    return {
      kind: "validation",
      title: "Too many photos",
      message: "Too many photos were sent at once. Remove some photos, then submit again.",
      tone: "error",
    }
  }

  if (/photo upload failed|needs at least one photo to appear|couldn.t upload your (photo|item)/i.test(message)) {
    return {
      kind: "upload",
      title: "Photo wasn’t uploaded",
      message: "We couldn’t upload your photo right now. Please try again later.",
      tone: "error",
    }
  }

  if (outcomeIsUncertain(error)) {
    return {
      kind: "uncertain",
      title: "Drop status not confirmed",
      message:
        "We didn’t receive confirmation that your drop was submitted. Check Your Drops before submitting again.",
      tone: "warn",
      recovery: {
        label: "Check Your Drops",
        href: "/account?tab=giving",
        openInNewTab: true,
      },
    }
  }

  return {
    kind: "validation",
    title: "Drop wasn’t submitted",
    message: safeValidationMessage(message) || "Check your details, then submit again.",
    tone: "error",
  }
}

export function getGiveSuccessFeedback(partial?: PartialGiveResult | null): GiveSuccessFeedback {
  if (partial && partial.failedCount > 0) {
    const submittedLabel = `${partial.submittedCount} item${partial.submittedCount === 1 ? " was" : "s were"}`
    const failedLabel = `${partial.failedCount} item${partial.failedCount === 1 ? " wasn’t" : "s weren’t"}`
    return {
      kind: "partial",
      title: "Some items were added",
      message: `${submittedLabel} submitted. ${failedLabel} submitted. Check Your Drops before trying again.`,
      referenceLabel: "Latest submitted item reference",
      recovery: { label: "Check Your Drops", href: "/account?tab=giving" },
    }
  }

  return {
    kind: "complete",
    title: "Thank you for your drop.",
    message: "Your item was submitted. Check Your Drops for its current status and claim requests.",
    referenceLabel: "Submission Reference",
    recovery: { label: "Check Your Drops", href: "/account?tab=giving" },
  }
}

export function getClaimSubmissionFeedback(error: unknown): UserFacingFeedback {
  const status = errorStatus(error)
  const message = errorMessage(error)

  if (status === 401) {
    return {
      kind: "auth",
      title: "Sign in again",
      message:
        "Your session expired, so this claim wasn’t sent. Sign in again to continue. The details in this form aren’t saved.",
      tone: "warn",
      recovery: { label: "Sign in", href: "/account/login" },
    }
  }

  if (status === 409 || /already been matched|no longer available|isn.t available for you/i.test(message)) {
    return {
      kind: "unavailable",
      title: "This item isn’t available",
      message: "This item has already been matched or is no longer available to claim.",
      tone: "warn",
      recovery: { label: "Browse the Wall", href: "/drop" },
    }
  }

  if (status === 429 || /weekly limit reached/i.test(message)) {
    return {
      kind: "limit",
      title: "Claim limit reached",
      message: safeValidationMessage(message) || "You’ve reached this week’s claim limit.",
      tone: "warn",
      recovery: { label: "View My Claims", href: "/account?tab=claiming" },
    }
  }

  if (outcomeIsUncertain(error)) {
    return {
      kind: "uncertain",
      title: "Claim status not confirmed",
      message: "We didn’t receive confirmation that your claim was sent. Check My Claims before trying again.",
      tone: "warn",
      recovery: {
        label: "Check My Claims",
        href: "/account?tab=claiming",
        openInNewTab: true,
      },
    }
  }

  return {
    kind: "validation",
    title: "Claim wasn’t sent",
    message: safeValidationMessage(message) || "Check your details, then send your claim again.",
    tone: "error",
  }
}

export function getLoadFailureFeedback(
  error: unknown,
  subject: "item" | "claim" | "drop" | "reference",
): UserFacingFeedback & { canRetry: boolean } {
  const status = errorStatus(error)
  const label = subject === "reference" ? "reference" : subject
  const subjectTitle = `${label[0].toUpperCase()}${label.slice(1)}`

  if (status === 401) {
    return {
      kind: "auth",
      title: "Sign in again",
      message: `Your session expired. Sign in again to view this ${label}.`,
      tone: "warn",
      recovery: { label: "Sign in", href: "/account/login" },
      canRetry: false,
    }
  }

  if (status === 403) {
    return {
      kind: "unavailable",
      title: `${subjectTitle} isn’t available`,
      message: `This ${label} isn’t available from this account. Return to your account to choose another item.`,
      tone: "warn",
      recovery: { label: "My account", href: "/account" },
      canRetry: false,
    }
  }

  if (status === 404) {
    return {
      kind: "missing",
      title: `${subjectTitle} not found`,
      message:
        subject === "item"
          ? "This item may have been removed or is no longer available."
          : `We couldn’t find this ${label}. Check the link or reference and try again.`,
      tone: "warn",
      canRetry: false,
    }
  }

  return {
    kind: "unavailable",
    title: `Couldn’t load this ${subject}`,
    message: `This ${label} is temporarily unavailable. Try again in a moment. No changes were made.`,
    tone: "error",
    canRetry: true,
  }
}

export function getDeliveryStatusFeedback(status: string | null | undefined): UserFacingFeedback | null {
  if (status !== "failed") return null
  return {
    kind: "delivery_failed",
    title: "Delivery needs attention",
    message:
      "The courier couldn’t complete this delivery. Use Reloved chat below to confirm the next step before arranging anything again.",
    tone: "error",
  }
}

export function getTransactionFeedback(error: unknown, subject: string): UserFacingFeedback {
  if (errorStatus(error) === 401) {
    return {
      kind: "auth",
      title: "Sign in again",
      message: `Your session expired, so the ${subject} wasn’t completed. Sign in again before continuing. Any unsaved changes on this page may be lost.`,
      tone: "warn",
      recovery: { label: "Sign in", href: "/account/login" },
    }
  }

  const message = errorMessage(error)
  if (outcomeIsUncertain(error)) {
    return {
      kind: "uncertain",
      title: "Status not confirmed",
      message: `We didn’t receive confirmation that the ${subject} went through. Refresh this page and check the current status before trying again.`,
      tone: "warn",
    }
  }

  return {
    kind: "validation",
    title: "Update wasn’t completed",
    message: safeValidationMessage(message) || `We couldn’t complete the ${subject}. Check the current status before trying again.`,
    tone: "error",
  }
}

export function getStatusRefreshFeedback(error: unknown, subject: string): UserFacingFeedback {
  if (errorStatus(error) === 401) {
    return {
      kind: "auth",
      title: "Update sent — sign in again",
      message: `The ${subject} was sent, but your session expired before we could load the latest status. Sign in and check the current status before trying again.`,
      tone: "warn",
      recovery: { label: "Sign in", href: "/account/login" },
    }
  }

  return {
    kind: "uncertain",
    title: "Update sent — status not refreshed",
    message: `The ${subject} was sent, but we couldn’t load the latest status. Refresh and check the current status before trying again.`,
    tone: "warn",
  }
}
