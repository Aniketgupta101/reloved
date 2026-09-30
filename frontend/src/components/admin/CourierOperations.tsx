import { useEffect, useState } from "react";
import type { OperationDetail } from "@shared/adminControlCenter";
import { api } from "@/lib/api";
import { courierCommands, executeCourierCommand, safeTrackingUrl, type CourierCommandId, type CourierProvider, type ProviderStatuses } from "@/lib/adminCourierActions";
import { ADMIN_LIVE_READ_ONLY, adminDate } from "./AdminResourceView";

const providers = ["borzo", "shiprocket", "shadowfax"] as const;
const display = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "Not recorded" : String(value).replaceAll("_", " ");

export function CourierOperations({ detail, stale, refreshing, refresh }: { detail: OperationDetail; stale: boolean; refreshing: boolean; refresh: () => Promise<unknown> | void }) {
  const [statuses, setStatuses] = useState<ProviderStatuses>({});
  const [pendingId, setPendingId] = useState<CourierCommandId | null>(null);
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => { setPendingId(null); setOfflineConfirmed(false); setResult(""); }, [detail.id, stale]);
  useEffect(() => {
    let mounted = true;
    setStatuses({});
    Promise.allSettled(providers.map((provider) => api.admin.get(`/api/admin/${provider}/status`))).then((reads) => {
      if (!mounted) return;
      setStatuses(Object.fromEntries(reads.map((read, index) => [providers[index], read.status === "fulfilled" ? read.value : { unavailable: true }])));
    });
    return () => { mounted = false; };
  }, [detail.id, detail.updatedAt]);
  const commands = courierCommands(detail, statuses);
  const pending = commands.find((command) => command.id === pendingId) || null;
  async function execute(id: CourierCommandId) {
    const command = commands.find((candidate) => candidate.id === id);
    if (ADMIN_LIVE_READ_ONLY || stale || refreshing || busy || !command?.available) return;
    setBusy(true);
    setResult("");
    try {
      const outcome = await executeCourierCommand<{ paymentAmount?: string | number | null; currency?: string; courierName?: string; etd?: string }>(id, detail, statuses, {
        getLatest: () => api.admin.get<OperationDetail>(`/api/admin/control-center/claims/${encodeURIComponent(detail.id)}`),
        post: (path, body) => api.admin.post(path, body),
      });
      if (outcome.status === "blocked") {
        setResult(outcome.reason);
        setPendingId(null);
        await refresh();
        return;
      }
      const response = outcome.response;
      const price = response.paymentAmount === null || response.paymentAmount === undefined ? "Price unavailable" : `Estimated ₹${response.paymentAmount}`;
      setResult(command.id.endsWith("_estimate") ? `${price}${response.courierName ? ` · ${response.courierName}` : ""}${response.etd ? ` · ETA ${response.etd}` : ""}. Estimate is not a booking.` : `${command.label} completed. Refresh the communication audit for recorded outcomes; delivery is not guaranteed.`);
      setPendingId(null);
      setOfflineConfirmed(false);
      await refresh();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Courier action failed.");
    } finally {
      setBusy(false);
    }
  }
  const state = detail.courier;
  const rows: Array<{ provider: CourierProvider; fields: Array<[string, string | number | null]> }> = [
    { provider: "borzo", fields: [["Order", state.borzo.orderId], ["Name", state.borzo.orderName], ["Status", state.borzo.status], ["Delivery", state.borzo.deliveryStatus], ["Fee (INR)", state.borzo.deliveryFee], ["Rider", state.borzo.courierName], ["Rider phone", state.borzo.courierPhone], ["Booked", state.borzo.bookedAt ? adminDate(state.borzo.bookedAt) : null], ["Updated", state.borzo.updatedAt ? adminDate(state.borzo.updatedAt) : null]] },
    { provider: "shiprocket", fields: [["Order", state.shiprocket.orderId], ["Shipment", state.shiprocket.shipmentId], ["Channel order", state.shiprocket.channelOrderId], ["Status", state.shiprocket.status], ["AWB", state.shiprocket.awb], ["Courier", state.shiprocket.courierName], ["Payment", state.shiprocket.paymentMethod], ["Wallet at book (INR)", state.shiprocket.walletBalanceAtBook], ["Assignment error", state.shiprocket.assignError], ["Booked", state.shiprocket.bookedAt ? adminDate(state.shiprocket.bookedAt) : null], ["Updated", state.shiprocket.updatedAt ? adminDate(state.shiprocket.updatedAt) : null]] },
    { provider: "shadowfax", fields: [["Order", state.shadowfax.orderId], ["Status", state.shadowfax.status], ["AWB", state.shadowfax.awb], ["Payment", state.shadowfax.paymentMethod], ["Booked", state.shadowfax.bookedAt ? adminDate(state.shadowfax.bookedAt) : null], ["Updated", state.shadowfax.updatedAt ? adminDate(state.shadowfax.updatedAt) : null]] },
  ];
  return <section className="courier-operations" aria-label="Courier operations">
    <h2>Courier operations</h2>
    <p>Provider records and readiness are shown separately. Booking can reserve subsidy, spend provider funds or use COD, and attempt Brevo/MSG91 lifecycle messages.</p>
    <p><strong>Booked via:</strong> {display(state.bookedVia)} · <strong>Paid by:</strong> {display(state.payment.paidBy)} · <strong>Subsidy slot:</strong> {display(state.payment.subsidyIndex)} · <strong>Released:</strong> {state.payment.subsidyReleased === null ? "Not recorded" : state.payment.subsidyReleased ? "Yes" : "No"}</p>
    <div className="courier-provider-grid">
      {rows.map(({ provider, fields }) => {
        const status = statuses[provider];
        const ready = status?.configured === true && !status.error && !status.unavailable;
        const tracking = state[provider].trackingUrl;
        const trackingHref = safeTrackingUrl(tracking);
        return <section key={provider} className="courier-provider">
          <h3>{provider[0].toUpperCase() + provider.slice(1)}</h3>
          <p className="admin-subtitle">{!status ? "Checking provider readiness…" : status.unavailable ? "Provider status unavailable" : status.configured === false ? "Provider unconfigured" : status.error ? "Provider needs attention" : ready ? "Provider connected" : "Provider status unavailable"}{provider === "shiprocket" && ready && !status?.walletReady ? " · Booking wallet below threshold or unavailable" : ""}</p>
          <dl>{fields.map(([label, value]) => value === null || value === undefined || value === "" ? null : <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl>
          {tracking && <p className="courier-tracking"><strong>Tracking:</strong> {trackingHref ? <a href={trackingHref} target="_blank" rel="noopener noreferrer">{tracking}</a> : tracking}</p>}
          <div className="admin-control-row">{commands.filter((command) => command.provider === provider).map((command) => <div key={command.id} className="courier-command">
            <button type="button" className="admin-button" disabled={ADMIN_LIVE_READ_ONLY || stale || refreshing || busy || !command.available} onClick={() => command.confirm ? setPendingId(command.id) : void execute(command.id)}>{command.label}{ADMIN_LIVE_READ_ONLY ? " · Read-only" : ""}</button>
            <small>{command.available ? command.consequence : command.reason}</small>
          </div>)}</div>
        </section>;
      })}
    </div>
    <div className="courier-provider"><h3>Porter · offline</h3><p>Book and pay in Porter outside Reloved. The app has no Porter booking API. Only record the first-500 subsidy after that real booking is complete.</p>
      {commands.filter((command) => command.provider === "porter").map((command) => <div className="courier-command" key={command.id}><button type="button" className="admin-button" disabled={ADMIN_LIVE_READ_ONLY || stale || refreshing || busy || !command.available} onClick={() => setPendingId(command.id)}>{command.label}{ADMIN_LIVE_READ_ONLY ? " · Read-only" : ""}</button><small>{command.available ? command.consequence : command.reason}</small></div>)}
    </div>
    {pending && <div className="operation-action-confirm" role="region" aria-label="Confirm courier action"><strong>{pending.label}?</strong><p>{pending.consequence}</p>{!pending.available && <p>{pending.reason}</p>}{pending.id === "porter_payment" && <label><input type="checkbox" checked={offlineConfirmed} onChange={(event) => setOfflineConfirmed(event.target.checked)} /> I have already booked and paid for this Porter ride outside Reloved.</label>}<div className="admin-control-row"><button className="admin-button admin-button-primary" type="button" disabled={ADMIN_LIVE_READ_ONLY || stale || refreshing || busy || !pending.available || (pending.id === "porter_payment" && !offlineConfirmed)} onClick={() => void execute(pending.id)}>Confirm {pending.label}</button><button className="admin-button" type="button" disabled={busy} onClick={() => { setPendingId(null); setOfflineConfirmed(false); }}>Cancel</button></div></div>}
    {result && <p role="status" className="admin-notice">{result}</p>}
  </section>;
}
