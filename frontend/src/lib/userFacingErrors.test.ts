import assert from "node:assert/strict"
import test from "node:test"

import { ApiRequestError } from "./apiError.ts"
import {
  getClaimSubmissionFeedback,
  getDeliveryStatusFeedback,
  getGiveSuccessFeedback,
  getGiveSubmissionFeedback,
  getLoadFailureFeedback,
  getTransactionFeedback,
} from "./userFacingErrors.ts"

test("give size feedback uses the verified 12 MB limit", () => {
  const feedback = getGiveSubmissionFeedback(
    new ApiRequestError(413, "A photo exceeded the max upload size. Try a smaller image."),
  )

  assert.equal(feedback.kind, "size")
  assert.match(feedback.message, /12 MB/)
  assert.match(feedback.message, /smaller photo/i)
})

test("generic photo upload failure does not guess image quality, format, or size", () => {
  const feedback = getGiveSubmissionFeedback(
    new ApiRequestError(
      400,
      "Photo upload failed — your item needs at least one photo to appear on the Wall. Please try again with a clearer photo.",
    ),
  )

  assert.equal(feedback.kind, "upload")
  assert.equal(feedback.message, "We couldn’t upload your photo right now. Please try again later.")
  assert.doesNotMatch(feedback.message, /clear|format|JPEG|PNG|10 MB/i)
})

test("lost give response directs the donor to check Drops before submitting again", () => {
  const feedback = getGiveSubmissionFeedback(new TypeError("Failed to fetch"))

  assert.equal(feedback.kind, "uncertain")
  assert.match(feedback.message, /didn’t receive confirmation/i)
  assert.equal(feedback.recovery?.href, "/account?tab=giving")
  assert.equal(feedback.recovery?.openInNewTab, true)
})

test("server failure after a give request is treated as an uncertain outcome", () => {
  const feedback = getGiveSubmissionFeedback(
    new ApiRequestError(500, "Failed to submit. Please try again."),
  )

  assert.equal(feedback.kind, "uncertain")
  assert.doesNotMatch(feedback.message, /submit again now|try again/i)
})

test("partial multi-item success is not presented as full success", () => {
  const partial = getGiveSuccessFeedback({ submittedCount: 2, failedCount: 1 })
  const complete = getGiveSuccessFeedback()

  assert.equal(partial.kind, "partial")
  assert.match(partial.message, /2 items were submitted/i)
  assert.match(partial.message, /1 item wasn’t submitted/i)
  assert.equal(partial.recovery.href, "/account?tab=giving")
  assert.equal(complete.kind, "complete")
})

test("confirmed claim conflict explains that the item is unavailable", () => {
  const feedback = getClaimSubmissionFeedback(
    new ApiRequestError(409, "This item has already been matched."),
  )

  assert.equal(feedback.kind, "unavailable")
  assert.equal(feedback.recovery?.href, "/drop")
})

test("uncertain claim outcome directs the donor to existing Claims history", () => {
  const feedback = getClaimSubmissionFeedback(new TypeError("Network request failed"))

  assert.equal(feedback.kind, "uncertain")
  assert.match(feedback.message, /check My Claims before trying again/i)
  assert.equal(feedback.recovery?.href, "/account?tab=claiming")
  assert.equal(feedback.recovery?.openInNewTab, true)
})

test("load failures distinguish a confirmed missing record from a temporary failure", () => {
  const missing = getLoadFailureFeedback(new ApiRequestError(404, "Item not found"), "item")
  const unavailable = getLoadFailureFeedback(new TypeError("Failed to fetch"), "item")

  assert.equal(missing.kind, "missing")
  assert.equal(unavailable.kind, "unavailable")
  assert.equal(unavailable.canRetry, true)
})

test("confirmed failed delivery gives a safe recovery path", () => {
  const failed = getDeliveryStatusFeedback("failed")

  assert.equal(failed?.kind, "delivery_failed")
  assert.match(failed?.message || "", /Reloved chat/i)
  assert.doesNotMatch(failed?.message || "", /book again|retry/i)
  assert.equal(getDeliveryStatusFeedback("delivered"), null)
})

test("lost delivery update response asks for a status check before another action", () => {
  const feedback = getTransactionFeedback(new TypeError("Failed to fetch"), "delivery update")

  assert.equal(feedback.kind, "uncertain")
  assert.match(feedback.message, /refresh this page/i)
  assert.match(feedback.message, /before trying again/i)
  assert.doesNotMatch(feedback.title, /failed/i)
})
