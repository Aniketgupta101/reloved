import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  OperationDetail,
  CommunicationRow,
  Page,
} from "@shared/adminControlCenter";
import { api } from "@/lib/api";
import { useAdminResource } from "@/lib/adminResource";
import { OrderChatThread } from "@/components/chat/OrderChatThread";
import { logisticsAdminLabel } from "@/lib/adminStatusLabels";
import {
  ADMIN_LIVE_READ_ONLY,
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from "./AdminResourceView";
import { ChannelStatus } from "./AdminOverviewContent";
import { CourierOperations } from "./CourierOperations";
import "./admin-operations.css";
type Preview = {
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  body?: string;
  source?: string;
};
export const OPERATION_NOTE_MAX = 500;
export const operationCanMutate = (
  status: string,
  busy: boolean,
  readOnly = false,
) => status !== "stale" && !busy && !readOnly;
type OperationConfirmation = {
  intent: "approve" | "reject" | "stage";
  version: string;
  opsStatus: "booked" | "out_for_delivery" | "delivered" | null;
};
export const operationVersion = (detail: OperationDetail) => JSON.stringify({
  updatedAt: detail.updatedAt,
  status: detail.status,
  claimStatus: detail.claimStatus,
  handoverStage: detail.handoverStage,
  opsBookingStatus: detail.opsBookingStatus,
  deliveryStatus: detail.deliveryStatus,
  actionKind: detail.action.kind,
  actionOpsStatus: detail.action.opsStatus || null,
});
export const makeOperationConfirmation = (
  detail: OperationDetail,
  intent: OperationConfirmation["intent"],
): OperationConfirmation => ({
  intent,
  version: operationVersion(detail),
  opsStatus: intent === "stage" ? detail.action.opsStatus || null : null,
});
export const operationConfirmationIsValid = (
  detail: OperationDetail,
  confirmation: OperationConfirmation,
) => operationVersion(detail) === confirmation.version && (
  confirmation.intent === "stage"
    ? detail.action.kind === "stage" && !!confirmation.opsStatus && detail.action.opsStatus === confirmation.opsStatus
    : detail.action.kind === "review" && detail.claimStatus === "pending"
);
export const safePreviewDocument = (html: string) =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer">${html}`;
export function focusOperationHash(hash: string, root: Pick<Document, "getElementById"> = document): boolean {
  const id = hash.slice(1);
  if (id !== "masked-calls" && id !== "courier-operations") return false;
  const target = root.getElementById(id);
  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
  return true;
}

export function NotificationPreview({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  const text = preview.textBody || preview.body || "No text preview available";
  return (
    <div
      className="operation-preview"
      role="region"
      aria-label="Notification preview"
    >
      <strong>{preview.subject || "Message preview"}</strong>
      {preview.htmlBody ? (
        <>
          <iframe
            className="operation-preview-frame"
            sandbox=""
            srcDoc={safePreviewDocument(preview.htmlBody)}
            title="Provider-rendered email preview"
          />
          <details>
            <summary>Plain text fallback</summary>
            <pre>{text}</pre>
          </details>
        </>
      ) : (
        <p>{text}</p>
      )}
      <small>Source: {preview.source || "Existing template service"}</small>
      <button className="admin-button" onClick={onClose}>
        Close preview
      </button>
    </div>
  );
}
type Catalog = { key: string; label: string; channel: string };
function CommunicationAudit({ id }: { id: string }) {
  const [cursor, setCursor] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [template, setTemplate] = useState("");
  const r = useAdminResource<Page<CommunicationRow>>(
    `/api/admin/control-center/deliveries/${encodeURIComponent(id)}/communications${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
    (d) => !d.items.length,
  );
  useEffect(() => {
    let live = true;
    api.admin
      .get<{ templates: Catalog[] }>("/api/admin/notification-templates")
      .then((d) => {
        if (live) setCatalog(d.templates);
      })
      .catch(() => {
        if (live)
          setError(
            "Template catalog unavailable. Recorded attempts remain below.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  async function show(
    key: string,
    channel: string,
    params: Record<string, string> = {},
  ) {
    if (ADMIN_LIVE_READ_ONLY) {
      setError("Live review is read-only.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(
        await api.admin.post<Preview>(
          "/api/admin/notification-templates/preview",
          { key, channel, claimId: id, params },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Communication audit</h2>
      <p>
        Recorded attempts, not proof of receipt. Sent, failed, skipped and no
        recorded attempt are different outcomes.
      </p>
      <div className="admin-control-row">
        <label>
          Template preview
          <select
            value={template}
            disabled={ADMIN_LIVE_READ_ONLY}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">Choose a template</option>
            {catalog.map((t, i) => (
              <option value={String(i)} key={`${t.key}-${i}`}>
                {t.label} · {t.channel}
              </option>
            ))}
          </select>
        </label>
        <button
          className="admin-button"
          disabled={ADMIN_LIVE_READ_ONLY || busy || template === ""}
          onClick={() => {
            const t = catalog[Number(template)];
            if (t) void show(t.key, t.channel);
          }}
        >
          {ADMIN_LIVE_READ_ONLY
            ? "Preview template · Read-only"
            : "Preview template"}
        </button>
      </div>
      <p className="admin-subtitle">
        Writable-mode preview reads the existing Brevo/MSG91 template service; it does not send. Provider copy may fall back to local catalog text. Live review shows recorded history only. Lifecycle actions may attempt Brevo/MSG91 delivery; no standalone send or resend action exists.
      </p>
      {error && (
        <p role="alert" className="admin-notice admin-notice-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading preview…</p>}
      {preview && (
        <NotificationPreview
          preview={preview}
          onClose={() => setPreview(null)}
        />
      )}
      <ResourceNotice resource={r} />
      {r.data && (
        <>
          {r.data.items.map((e) => (
            <article className="operation-event" key={e.id}>
              <span className={`admin-status is-${e.status}`}>
                {e.channel} · {e.status}
              </span>
              <p>
                <strong>{e.templateKey || "Template not recorded"}</strong> ·{" "}
                {e.audience || "Audience not recorded"} · {adminDate(e.at)} IST
              </p>
              <p>{e.destination || "Destination not recorded"}</p>
              {e.error && <p>Recorded reason: {e.error}</p>}
              {e.subject && <p>Recorded subject: {e.subject}</p>}
              {e.previewBody && <p>Recorded preview: {e.previewBody}</p>}
              <small>Source: Recorded notification event. Preview may be a short summary, not the full recipient message.</small>
              {e.templateKey && (
                <button
                  className="admin-button"
                  disabled={ADMIN_LIVE_READ_ONLY || busy}
                  onClick={() => void show(e.templateKey!, e.channel, e.params)}
                >
                  {ADMIN_LIVE_READ_ONLY
                    ? "Preview recorded template · Read-only"
                    : "Preview recorded template"}
                </button>
              )}
            </article>
          ))}
          {!r.data.items.length && (
            <p>
              {r.data.coverage === "complete"
                ? "No attempts recorded on this page."
                : "No notification attempts can be confirmed from the available history."}
            </p>
          )}
          <div className="admin-control-row">
            <button
              className="admin-button"
              disabled={!history.length || r.refreshing}
              onClick={() => {
                setCursor(history[history.length - 1]);
                setHistory(history.slice(0, -1));
              }}
            >
              Previous attempts
            </button>
            <button
              className="admin-button"
              disabled={!r.data.nextCursor || r.refreshing}
              onClick={() => {
                setHistory([...history, cursor]);
                setCursor(r.data!.nextCursor!);
              }}
            >
              More attempts
            </button>
            <button className="admin-button" onClick={r.refresh}>
              Refresh audit
            </button>
          </div>
          <SourceDetails data={r.data} />
        </>
      )}
    </section>
  );
}
export function InventoryClaimFocusPanel({
  id,
  kind,
}: {
  id: string;
  kind: "claim" | "delivery";
}) {
  const location = useLocation();
  const resource = useAdminResource<OperationDetail>(
    `/api/admin/control-center/${kind === "claim" ? "claims" : "deliveries"}/${encodeURIComponent(id)}`,
    () => false,
  );
  const d = resource.data;
  useEffect(() => {
    if (d) focusOperationHash(location.hash);
  }, [d?.id, location.hash]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<OperationConfirmation | null>(null);
  const [note, setNote] = useState("");
  const [masking, setMasking] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (
      resource.status === "stale" ||
      resource.refreshing ||
      (d && confirmation && !operationConfirmationIsValid(d, confirmation))
    ) setConfirmation(null);
  }, [resource.status, resource.refreshing, d, confirmation]);
  useEffect(() => {
    let live = true;
    api.admin
      .get<{ configured: boolean }>("/api/admin/calls/masking-status")
      .then((s) => {
        if (live) setMasking(s.configured ? "ready" : "unavailable");
      })
      .catch(() => {
        if (live) setMasking("unavailable");
      });
    return () => {
      live = false;
    };
  }, []);
  async function mutate() {
    if (!d || !confirmation) return;
    if (!operationCanMutate(resource.status, busy, ADMIN_LIVE_READ_ONLY)) {
      setConfirmation(null);
      setMessage(
        "This record is stale. Refresh it before applying an operation update.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const pending = confirmation;
      const detailPath = `/api/admin/control-center/${kind === "claim" ? "claims" : "deliveries"}/${encodeURIComponent(id)}`;
      const latest = await api.admin.get<OperationDetail>(detailPath);
      if (!operationConfirmationIsValid(latest, pending)) {
        setConfirmation(null);
        setMessage("This record changed since this confirmation opened. Review the latest next action before continuing.");
        await resource.refresh();
        return;
      }
      if (pending.intent === "stage") {
        await api.admin.patch(`/api/admin/orders/${encodeURIComponent(id)}`, {
          opsStatus: pending.opsStatus,
          opsNote: note || d.opsNote || "",
        });
      } else
        await api.admin.patch(
          `/api/admin/item-requests/${encodeURIComponent(id)}`,
          { status: pending.intent === "approve" ? "approved" : "rejected" },
        );
      setConfirmation(null);
      setMessage(
        "Record updated. Check the communication audit for recorded outcomes; sending is not proof of receipt.",
      );
      await resource.refresh();
      setRevision((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  async function call(mode: string) {
    if (!operationCanMutate(resource.status, busy, ADMIN_LIVE_READ_ONLY)) {
      setMessage(
        "This record is stale. Refresh it before starting a masked call.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await api.admin.post<{ message?: string }>(
        "/api/admin/calls/mask",
        { subjectType: "claim", subjectId: id, mode },
      );
      setMessage(
        r.message || "Masked call requested. Keep the ops phone ready.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Call failed");
    } finally {
      setBusy(false);
    }
  }
  async function copy(which: "pickup" | "destination" | "all") {
    if (!d) return;
    const value =
      which === "pickup"
        ? `Pickup: ${d.pickupAddress || ""}\nGiver: ${d.giverName || ""} ${d.giverPhone || ""}`
        : which === "destination"
          ? `Destination: ${d.requesterAddress || ""}\nClaimer: ${d.requesterName || ""} ${d.requesterPhone || ""}`
          : `Item: ${d.itemTitle || ""}\nPickup: ${d.pickupAddress || ""}\nGiver: ${d.giverName || ""} ${d.giverPhone || ""}\nDestination: ${d.requesterAddress || ""}\nClaimer: ${d.requesterName || ""} ${d.requesterPhone || ""}\nAgreed: ${adminDate(d.agreedSlotAt)} IST`;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(
        which === "pickup"
          ? "Pickup copied."
          : which === "destination"
            ? "Destination copied."
            : "Contact block copied.",
      );
    } catch {
      setMessage("Clipboard unavailable. Copy the details below.");
    }
  }
  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title={kind === "claim" ? "Claim details" : "Delivery details"}
        description="The linked people, recorded schedule, next action, and communication history."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={d?.asOf}
      />
      <Link
        className="admin-button"
        to={kind === "claim" ? "/admin/item-requests" : "/admin/orders"}
      >
        Browse {kind === "claim" ? "claims" : "deliveries"}
      </Link>
      <ResourceNotice resource={resource} />
      {ADMIN_LIVE_READ_ONLY && (
        <div className="admin-notice" role="status">
          <strong>Read-only review</strong>
          <p>
            Complete authenticated production details are visible. Decisions,
            delivery updates, messages, calls, and sends are disabled.
          </p>
        </div>
      )}
      {d && (
        <section className="admin-panel operation-detail">
          <div>
            <p className="admin-eyebrow">Claim ID: {d.id}</p>
            <h2>{d.itemTitle || "Item unavailable"}</h2>
            <div className="admin-control-row">
              <span className="admin-status is-neutral">{d.claimStatus}</span>
              <span
                className={`admin-status ${d.timing === "overdue" ? "is-failed" : "is-neutral"}`}
              >
                {d.timing}
              </span>
              <span>{logisticsAdminLabel(d.logistics)}</span>
            </div>
          </div>
          <div className="operation-detail-grid">
            <section>
              <h3>Giver</h3>
              <p>{d.giverName || "Name not recorded"}</p>
              <p>
                {d.giverEmail || "Email not recorded"} ·{" "}
                {d.giverPhone || "Phone not recorded"}
              </p>
              <h3>Pickup</h3>
              <p>{d.pickupAddress || "Address not recorded"}</p>
            </section>
            <section>
              <h3>Claimer</h3>
              <p>{d.requesterName || "Name not recorded"}</p>
              <p>
                {d.requesterEmail || "Email not recorded"} ·{" "}
                {d.requesterPhone || "Phone not recorded"}
              </p>
              <h3>Destination</h3>
              <p>{d.requesterAddress || "Address not recorded"}</p>
            </section>
          </div>
          <section>
            <h3>Timing & handover</h3>
            <p>Agreed: {adminDate(d.agreedSlotAt)} IST</p>
            <p>Proposed: {adminDate(d.proposedSlotAt)} IST</p>
            <p>
              Created: {adminDate(d.createdAt)} IST · Updated:{" "}
              {adminDate(d.updatedAt)} IST
            </p>
            <p>
              Stage: {d.handoverStage?.replace(/_/g, " ") || "Not recorded"} ·
              Booking:{" "}
              {d.opsBookingStatus?.replace(/_/g, " ") || "Not recorded"} ·
              Delivery: {d.deliveryStatus?.replace(/_/g, " ") || "Not recorded"}
            </p>
            {d.note && <p>Claimer note: {d.note}</p>}
            {d.opsNote && <p>Operations note: {d.opsNote}</p>}
          </section>
          <section>
            <h3>Next action</h3>
            <div className="admin-control-row">
              {d.action.kind === "review" ? (
                <>
                  <button
                    className="admin-button admin-button-primary"
                    disabled={
                      ADMIN_LIVE_READ_ONLY || busy || resource.refreshing || resource.status === "stale"
                    }
                    onClick={() => setConfirmation(makeOperationConfirmation(d, "approve"))}
                  >
                    {ADMIN_LIVE_READ_ONLY
                      ? "Accept claim · Read-only"
                      : "Accept claim"}
                  </button>
                  <button
                    className="admin-button"
                    disabled={
                      ADMIN_LIVE_READ_ONLY || busy || resource.refreshing || resource.status === "stale"
                    }
                    onClick={() => setConfirmation(makeOperationConfirmation(d, "reject"))}
                  >
                    {ADMIN_LIVE_READ_ONLY
                      ? "Couldn't match · Read-only"
                      : "Couldn't match"}
                  </button>
                </>
              ) : d.action.kind === "stage" ? (
                <button
                  className="admin-button admin-button-primary"
                  disabled={
                    ADMIN_LIVE_READ_ONLY || busy || resource.refreshing || resource.status === "stale"
                  }
                  onClick={() => setConfirmation(makeOperationConfirmation(d, "stage"))}
                >
                  {ADMIN_LIVE_READ_ONLY
                    ? `${d.action.label} · Read-only`
                    : d.action.label}
                </button>
              ) : (
                <p>
                  {d.action.label}
                  {d.action.kind === "coordinate"
                    ? " through the claim conversation below. Confirm addresses and an agreed slot before arranging courier collection."
                    : ""}
                </p>
              )}
            </div>
            {confirmation && (
              <div
                className="operation-action-confirm"
                role="region"
                aria-label="Confirm operation"
              >
                <strong>
                  {confirmation.intent === "approve"
                    ? "Accept this claim?"
                    : confirmation.intent === "reject"
                      ? "Couldn't match this claim?"
                      : d.action.label + "?"}
                </strong>
                <p>
                  {confirmation.intent === "stage"
                    ? "Confirm the real-world handover stage. This updates the existing delivery lifecycle and may trigger email/SMS attempts. It does not book a courier."
                    : confirmation.intent === "approve"
                      ? "This matches the claimer, changes Wall availability and invokes existing decision notifications."
                      : "This soft-declines the claimer, restores Wall availability and invokes existing decision notifications."}
                </p>
                {confirmation.intent === "stage" && (
                  <label>
                    Operations note
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={OPERATION_NOTE_MAX}
                    />
                    <small>
                      {note.length}/{OPERATION_NOTE_MAX} characters
                    </small>
                  </label>
                )}
                <div className="admin-control-row">
                  <button
                    className="admin-button admin-button-primary"
                    disabled={
                      !operationCanMutate(
                        resource.status,
                        busy,
                        ADMIN_LIVE_READ_ONLY,
                      ) || resource.refreshing || !operationConfirmationIsValid(d, confirmation)
                    }
                    onClick={() => void mutate()}
                  >
                    {busy ? "Updating…" : "Confirm update"}
                  </button>
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={() => setConfirmation(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {message && (
              <p role="status" className="admin-notice">
                {message}
              </p>
            )}
          </section>
          <div className="admin-control-row">
            {d.itemId && (
              <Link
                className="admin-button"
                to={`/admin/items?itemId=${encodeURIComponent(d.itemId)}`}
              >
                Open linked Wall item
              </Link>
            )}
            {kind === "claim" && d.claimStatus === "approved" && (
              <Link
                className="admin-button"
                to={`/admin/orders?claimId=${encodeURIComponent(id)}`}
              >
                Open in Deliveries
              </Link>
            )}
            <button className="admin-button" onClick={() => void copy("pickup")}>
              Copy pickup
            </button>
            <button
              className="admin-button"
              onClick={() => void copy("destination")}
            >
              Copy destination
            </button>
            <button className="admin-button" onClick={() => void copy("all")}>
              Copy all details
            </button>
          </div>
          {["pending", "approved"].includes(d.claimStatus || "") && (
            <section id="masked-calls" tabIndex={-1}>
              <h3>Masked calls</h3>
              <p>
                {masking === "ready"
                  ? "Edesy is configured. Ops calls ring the operations phone first."
                  : masking === "loading"
                    ? "Checking call availability…"
                    : "Masked calls unavailable. Check the existing Edesy configuration."}
              </p>
              <div className="admin-control-row">
                {[
                  ["ops_to_claimer", "Ops ↔ Claimer", !!d.requesterPhone],
                  ["ops_to_giver", "Ops ↔ Giver", !!d.giverPhone],
                  [
                    "claimer_to_giver",
                    "Claimer ↔ Giver",
                    d.claimStatus === "approved" && !!d.giverPhone && !!d.requesterPhone,
                  ],
                  ["courier_to_claimer", "Courier ↔ Claimer", !!d.courier.borzo.courierPhone && !!d.requesterPhone],
                  ["courier_to_giver", "Courier ↔ Giver", !!d.courier.borzo.courierPhone && !!d.giverPhone],
                ].map(([mode, label, available]) => (
                  <button
                    key={String(mode)}
                    className="admin-button"
                    disabled={
                      ADMIN_LIVE_READ_ONLY ||
                      busy ||
                      masking !== "ready" ||
                      !available ||
                      resource.status === "stale"
                    }
                    onClick={() => void call(String(mode))}
                  >
                    {ADMIN_LIVE_READ_ONLY ? `${label} · Read-only` : label}
                  </button>
                ))}
              </div>
            </section>
          )}
          <div id="courier-operations" tabIndex={-1}><CourierOperations detail={d} stale={resource.status === "stale"} refreshing={resource.refreshing} refresh={resource.refresh} /></div>
          <div className="admin-control-row">
            {(["email", "sms"] as const).map((channel) => (
              <ChannelStatus
                key={channel}
                channel={channel}
                audit={d.notifications[channel]}
              />
            ))}
          </div>
          <CommunicationAudit key={`${id}-${revision}`} id={id} />
          {["pending", "approved"].includes(d.claimStatus || "") && (
            <section>
              <h2>Claim conversation</h2>
              {ADMIN_LIVE_READ_ONLY ? (
                <>
                  <p className="admin-subtitle">
                    The existing claim chat remains available in operational
                    mode. Replies are blocked during live review.
                  </p>
                  <button className="admin-button" type="button" disabled>
                    Open claim conversation · Read-only
                  </button>
                </>
              ) : (
                <OrderChatThread
                  client="admin"
                  subjectType="claim"
                  subjectId={id}
                />
              )}
            </section>
          )}
          <SourceDetails data={d} />
        </section>
      )}
    </div>
  );
}
