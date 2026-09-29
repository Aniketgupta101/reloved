import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  OperationRow,
  Page,
  DropFunnel,
} from "@shared/adminControlCenter";
import { useAdminResource } from "@/lib/adminResource";
import { resolveImageUrl } from "@/lib/api";
import { SafeImage } from "@/components/ui/SafeImage";
import { logisticsAdminLabel } from "@/lib/adminStatusLabels";
import {
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from "./AdminResourceView";
import { ChannelStatus } from "./AdminOverviewContent";
import { FunnelSteps } from "./AdminInventory";
import "./admin-operations.css";
export function OperationCard({
  row: r,
  onOpen,
}: {
  row: OperationRow;
  onOpen: () => void;
}) {
  const first = r.itemImages[0];
  const image =
    typeof first === "string"
      ? first
      : first && typeof first === "object" && "storagePath" in first
        ? String(first.storagePath)
        : null;
  return (
    <article className="operation-card">
      <div className="operation-item">
        {image ? (
          <SafeImage
            src={resolveImageUrl(image)}
            alt={r.itemTitle || "Item"}
            className="operation-photo"
          />
        ) : (
          <div className="operation-photo operation-no-photo">No photo</div>
        )}
        <div>
          <h2>{r.itemTitle || "Item unavailable"}</h2>
          <p>
            {r.giverName || "Giver not recorded"} →{" "}
            {r.requesterName || "Claimer not recorded"}
          </p>
          <small>
            {logisticsAdminLabel(r.logistics)} · {r.id}
          </small>
        </div>
      </div>
      <div className="operation-time">
        <span
          className={`admin-status ${r.timing === "overdue" ? "is-failed" : r.timing === "completed" ? "is-sent" : "is-neutral"}`}
        >
          {r.timing}
        </span>
        <strong>
          {adminDate(r.agreedSlotAt || r.proposedSlotAt)}
          {(r.agreedSlotAt || r.proposedSlotAt) && " IST"}
        </strong>
        <small>
          {r.claimStatus?.replace(/_/g, " ")} ·{" "}
          {r.status?.replace(/_/g, " ") || "Stage not recorded"}
        </small>
      </div>
      <div className="operation-addresses">
        <p>
          <span>Pickup</span>
          {r.pickupAddress || "Address not recorded"}
        </p>
        <p>
          <span>Destination</span>
          {r.requesterAddress || "Address not recorded"}
        </p>
      </div>
      <div className="operation-audit">
        {(["email", "sms"] as const).map((channel) => (
          <ChannelStatus
            key={channel}
            channel={channel}
            audit={r.notifications[channel]}
          />
        ))}
      </div>
      <button className="admin-button admin-button-primary" onClick={onOpen}>
        {r.action.label}
      </button>
    </article>
  );
}
export function OperationsMap({ rows }: { rows: OperationRow[] }) {
  const valid = rows.filter(
    (r) => r.map.state === "available" && r.map.pickup && r.map.destination,
  );
  if (!valid.length)
    return (
      <section className="admin-notice">
        <strong>Map unavailable</strong>
        <p>
          This scan has no complete pickup and destination coordinates. The full
          operations list remains below; address text is not converted into a
          guessed location.
        </p>
      </section>
    );
  const points = valid.flatMap((r) => [r.map.pickup!, r.map.destination!]);
  const minLat = Math.min(...points.map((p) => p.latitude)),
    maxLat = Math.max(...points.map((p) => p.latitude)),
    minLng = Math.min(...points.map((p) => p.longitude)),
    maxLng = Math.max(...points.map((p) => p.longitude));
  const xy = (p: { latitude: number; longitude: number }) => ({
    x: 30 + ((p.longitude - minLng) / (maxLng - minLng || 1)) * 640,
    y: 290 - ((p.latitude - minLat) / (maxLat - minLat || 1)) * 260,
  });
  return (
    <section className="admin-panel operation-map">
      <h2>Recorded location pairs</h2>
      <p>
        Offline coordinate plot · not a route or navigation map.{" "}
        {rows.length - valid.length} records in this scan have incomplete
        coordinates.
      </p>
      <svg
        viewBox="0 0 700 320"
        role="img"
        aria-label="Recorded pickup and destination coordinates, north up"
      >
        {valid.map((r, i) => {
          const a = xy(r.map.pickup!),
            b = xy(r.map.destination!);
          return (
            <g key={r.id}>
              <title>{r.itemTitle}: pickup to destination</title>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#9aa39a"
                strokeDasharray="4 4"
              />
              <circle cx={a.x} cy={a.y} r="6" fill="#226842" />
              <rect
                x={b.x - 5}
                y={b.y - 5}
                width="10"
                height="10"
                fill="#b84370"
              />
              <text x={a.x + 9} y={a.y - 8} fontSize="12">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <p>Green circle: pickup · pink square: destination · north ↑</p>
      <ol>
        {valid.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/orders?claimId=${encodeURIComponent(r.id)}`}>
              {r.itemTitle}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
function ClaimsFunnel() {
  const r = useAdminResource<DropFunnel>(
    "/api/admin/control-center/claims/funnel",
    () => false,
  );
  return (
    <details className="admin-panel operation-funnel" open>
      <summary>Claim journey · available evidence</summary>
      <ResourceNotice resource={r} />
      {r.data && (
        <>
          <FunnelSteps steps={r.data.steps} />
          <SourceDetails data={r.data} />
        </>
      )}
    </details>
  );
}
export function AdminOperations({ kind }: { kind: "claims" | "deliveries" }) {
  const [, setParams] = useSearchParams();
  const [view, setView] = useState(kind === "deliveries" ? "today" : "all");
  const [status, setStatus] = useState(kind === "claims" ? "pending" : "all");
  const [display, setDisplay] = useState<"list" | "calendar" | "map">("list");
  const [day, setDay] = useState(
    new Date(Date.now() + 19800000).toISOString().slice(0, 10),
  );
  const [span, setSpan] = useState("day");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState("");
  const query = new URLSearchParams({
    status,
    view,
    span,
    limit: "10",
    ...(view === "calendar" ? { day } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const resource = useAdminResource<Page<OperationRow>>(
    `/api/admin/control-center/${kind}?${query}`,
    (d) => !d.items.length,
  );
  const data = resource.data;
  function reset() {
    setHistory([]);
    setCursor("");
  }
  function choose(value: string) {
    reset();
    setView(value);
    setDisplay(value === "calendar" ? "calendar" : "list");
  }
  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title={kind === "claims" ? "Claims" : "Deliveries"}
        description={
          kind === "claims"
            ? "Review requests, follow each match, and coordinate the next handover."
            : "A working view of handovers, people, timing, and recorded communication."
        }
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      />
      {kind === "claims" ? (
        <>
          <ClaimsFunnel />
          <nav className="admin-control-row" aria-label="Claim status">
            {[
              ["pending", "Pending"],
              ["approved", "Matched"],
              ["rejected", "Couldn't match"],
              ["cancelled", "Cancelled"],
              ["all", "All claims"],
            ].map(([v, l]) => (
              <button
                className="admin-button"
                aria-pressed={status === v}
                key={v}
                onClick={() => {
                  reset();
                  setStatus(v);
                }}
              >
                {l}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <>
          <nav className="admin-control-row" aria-label="Delivery view">
            {[
              ["today", "Today"],
              ["next48h", "Next 48h"],
              ["calendar", "Calendar"],
              ["overdue", "Overdue"],
              ["unscheduled", "Unscheduled"],
              ["completed", "Completed"],
              ["all", "All deliveries"],
            ].map(([v, l]) => (
              <button
                className="admin-button"
                aria-pressed={view === v}
                key={v}
                onClick={() => choose(v)}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="admin-control-row">
            <button
              className="admin-button"
              aria-pressed={display === "map"}
              onClick={() => setDisplay(display === "map" ? "list" : "map")}
            >
              Map
            </button>
            {view === "calendar" && (
              <>
                <label>
                  Starting day (IST)
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => {
                      reset();
                      setDay(e.target.value);
                    }}
                  />
                </label>
                <label>
                  Calendar span
                  <select
                    value={span}
                    onChange={(e) => {
                      reset();
                      setSpan(e.target.value);
                    }}
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </>
      )}
      <ResourceNotice resource={resource} />
      {data && (
        <>
          <div className="operation-scan">
            <strong>{data.items.length} records in this scan</strong>
            <span>
              Continue through scans for all matches. Times are India Standard
              Time.
            </span>
          </div>
          {display === "map" && <OperationsMap rows={data.items} />}
          {display === "calendar" && (
            <section
              className={`operation-calendar ${span === "week" ? "is-week" : ""}`}
              aria-label="Delivery calendar"
            >
              {Array.from({ length: span === "week" ? 7 : 1 }, (_, i) => {
                const date = new Date(
                  Date.parse(day + "T00:00:00+05:30") + i * 86400000,
                );
                const key = new Date(date.getTime() + 19800000)
                  .toISOString()
                  .slice(0, 10);
                const rows = data.items.filter(
                  (r) =>
                    new Date(
                      Date.parse(r.agreedSlotAt || r.proposedSlotAt || "") +
                        19800000,
                    )
                      .toISOString()
                      .slice(0, 10) === key,
                );
                return (
                  <div key={key}>
                    <h2>
                      {new Intl.DateTimeFormat("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(date)}
                    </h2>
                    {rows.length ? (
                      rows.map((r) => (
                        <button
                          key={r.id}
                          className="admin-button"
                          onClick={() => setParams({ claimId: r.id })}
                        >
                          {adminDate(r.agreedSlotAt || r.proposedSlotAt, true)}{" "}
                          · {r.itemTitle} · {r.timing}
                        </button>
                      ))
                    ) : (
                      <p>No matches in this scan</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          <div className="operation-list">
            {data.items.map((row) => (
              <OperationCard
                key={row.id}
                row={row}
                onOpen={() => setParams({ claimId: row.id })}
              />
            ))}
          </div>
          {!data.items.length && (
            <div className="admin-empty">
              {data.nextCursor
                ? "No matches in this scan. Continue to check the next records."
                : "No matches in this final scan."}
            </div>
          )}
          <div className="admin-control-row operation-pagination">
            <button
              className="admin-button"
              disabled={!history.length || resource.refreshing}
              onClick={() => {
                setCursor(history[history.length - 1]);
                setHistory(history.slice(0, -1));
              }}
            >
              Previous scan
            </button>
            <span>Scan {history.length + 1}</span>
            <button
              className="admin-button"
              disabled={!data.nextCursor || resource.refreshing}
              onClick={() => {
                setHistory([...history, cursor]);
                setCursor(data.nextCursor!);
              }}
            >
              Next scan
            </button>
          </div>
          <SourceDetails data={data} />
        </>
      )}
    </div>
  );
}
