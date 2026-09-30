import type { OperationDetail } from "@shared/adminControlCenter";

export type CourierCommandId =
  | "borzo_estimate" | "borzo_book" | "borzo_sync" | "borzo_cancel"
  | "shiprocket_estimate" | "shiprocket_book" | "shiprocket_cancel"
  | "shadowfax_book" | "shadowfax_cancel" | "porter_payment";
export type CourierProvider = "borzo" | "shiprocket" | "shadowfax";
export type ProviderStatus = { configured?: boolean; walletReady?: boolean; error?: string; unavailable?: boolean; message?: string };
export type ProviderStatuses = Partial<Record<CourierProvider, ProviderStatus>>;
export interface CourierCommand {
  id: CourierCommandId;
  provider: CourierProvider | "porter";
  label: string;
  path: string;
  body?: { carrier: "porter" };
  available: boolean;
  reason: string;
  consequence: string;
  confirm: boolean;
}

export function safeTrackingUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function courierCommands(
  claim: Pick<OperationDetail, "id" | "claimStatus" | "logistics" | "pickupAddress" | "requesterAddress" | "courier">,
  statuses: ProviderStatuses,
): CourierCommand[] {
  const approved = claim.claimStatus === "approved";
  const courierFlow = claim.logistics === "porter_arranged" || claim.logistics === "reloved_courier";
  const addresses = Boolean(claim.pickupAddress && claim.requesterAddress);
  const pincodes = Boolean(claim.pickupAddress && /\b\d{6}\b/.test(claim.pickupAddress) && claim.requesterAddress && /\b\d{6}\b/.test(claim.requesterAddress));
  const { borzo, shiprocket, shadowfax, payment } = claim.courier;
  const active = {
    borzo: Boolean(borzo.orderId && borzo.status?.toLowerCase() !== "canceled"),
    shiprocket: Boolean(shiprocket.orderId && shiprocket.status?.toLowerCase() !== "canceled"),
    shadowfax: Boolean(shadowfax.orderId && shadowfax.status?.toLowerCase() !== "canceled"),
  };
  const manualBooking = Boolean(claim.courier.bookedVia?.endsWith("_manual") || claim.courier.bookedVia === "manual");
  const anyActive = Object.values(active).some(Boolean) || manualBooking;
  const ready = (provider: CourierProvider) => statuses[provider]?.configured === true && !statuses[provider]?.unavailable && !statuses[provider]?.error && (provider !== "shiprocket" || statuses.shiprocket?.walletReady === true);
  const prefix = `/api/admin/item-requests/${encodeURIComponent(claim.id)}`;
  const define = (id: CourierCommandId, provider: CourierProvider | "porter", label: string, suffix: string, available: boolean, reason: string, consequence: string, confirm = true, body?: { carrier: "porter" }): CourierCommand => ({ id, provider, label, path: `${prefix}/${suffix}`, available, reason, consequence, confirm, body });
  const bookReason = !approved ? "Approve the claim first." : !courierFlow ? "This claim is not set for Reloved-arranged courier delivery." : !addresses ? "Record pickup and destination addresses first." : anyActive ? "A provider or manual courier booking is already recorded." : "Provider is unavailable or unconfigured.";
  return [
    define("borzo_estimate", "borzo", "Estimate Borzo", "borzo/estimate", approved && courierFlow && addresses && ready("borzo"), "Requires an approved courier claim, both addresses and Borzo readiness. This contacts Borzo for a price.", "Price check only; no order is booked.", false),
    define("borzo_book", "borzo", "Book Borzo", "borzo/book", approved && courierFlow && addresses && !anyActive && ready("borzo"), bookReason, "Creates a Borzo order, reserves subsidy/payment and may send dispatch notifications."),
    define("borzo_sync", "borzo", "Sync Borzo", "borzo/sync", active.borzo && ready("borzo"), "Requires an active Borzo order and provider readiness.", "Contacts Borzo; may advance delivery and attempt notifications."),
    define("borzo_cancel", "borzo", "Cancel Borzo", "borzo/cancel", active.borzo && ready("borzo"), "Requires an active Borzo order and provider readiness.", "Cancels the provider order, releases eligible subsidy, marks delivery failed and may notify people."),
    define("shiprocket_estimate", "shiprocket", "Estimate Shiprocket", "shiprocket/estimate", approved && courierFlow && pincodes && ready("shiprocket"), "Requires an approved courier claim, both six-digit pincodes and Shiprocket wallet readiness.", "Serviceability and price check only; no order is booked.", false),
    define("shiprocket_book", "shiprocket", "Book Shiprocket", "shiprocket/book", approved && courierFlow && pincodes && !anyActive && ready("shiprocket"), !pincodes ? "Record pickup and destination six-digit pincodes first." : bookReason, "Creates a Shiprocket order, may spend wallet funds or use COD, reserves subsidy and may send dispatch notifications."),
    define("shiprocket_cancel", "shiprocket", "Cancel Shiprocket", "shiprocket/cancel", active.shiprocket && ready("shiprocket"), "Requires an active Shiprocket order and provider readiness.", "Cancels the provider order and releases eligible subsidy."),
    define("shadowfax_book", "shadowfax", "Book Shadowfax", "shadowfax/book", approved && courierFlow && pincodes && !anyActive && ready("shadowfax"), !pincodes ? "Record pickup and destination six-digit pincodes first." : bookReason, "Creates a Shadowfax order, may spend prepaid balance or use COD, reserves subsidy and may send dispatch notifications."),
    define("shadowfax_cancel", "shadowfax", "Cancel Shadowfax", "shadowfax/cancel", active.shadowfax && ready("shadowfax"), "Requires an active Shadowfax order and provider readiness.", "Cancels the provider order and releases eligible subsidy."),
    define("porter_payment", "porter", "Record offline Porter subsidy", "courier/mark-reloved-paid", approved && courierFlow && !Object.values(active).some(Boolean) && payment.paidBy !== "reloved_subsidy", "Only after an approved courier claim has been booked and paid through Porter outside this app.", "Reserves first-500 subsidy and records Porter as manual. This does not book a ride or send a notification.", true, { carrier: "porter" }),
  ];
}
