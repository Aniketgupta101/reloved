import { Link } from "react-router-dom";
import type { InventoryClaimFocus } from "@shared/adminControlCenter";
import { useAdminResource } from "@/lib/adminResource";
import {
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from "./AdminResourceView";
import { ChannelStatus } from "./AdminOverviewContent";
export function InventoryClaimFocusPanel({
  id,
  kind,
}: {
  id: string;
  kind: "claim" | "delivery";
}) {
  const resource = useAdminResource<InventoryClaimFocus>(
    `/api/admin/control-center/claims/${encodeURIComponent(id)}`,
    () => false,
  );
  const data = resource.data;
  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title={kind === "claim" ? "Claim details" : "Delivery details"}
        description="The linked record, loaded directly by its ID. This focused view is read-only."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      />
      <Link
        className="admin-button"
        to={kind === "claim" ? "/admin/item-requests" : "/admin/orders"}
      >
        Browse {kind === "claim" ? "claims" : "deliveries"} and actions
      </Link>
      <ResourceNotice resource={resource} />
      {data && (
        <section className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h2>{data.item?.title || "Item unavailable"}</h2>
              <p className="admin-subtitle">Claim ID: {data.claim.id}</p>
            </div>
          </div>
          <div style={{ padding: 22, display: "grid", gap: 16 }}>
            <h3>{data.claim.requesterName || "Claimer not recorded"}</h3>
            <p>
              {data.claim.requesterEmail || "Email not recorded"} ·{" "}
              {data.claim.requesterPhone || "Phone not recorded"}
            </p>
            <p>
              Decision: {data.claim.status || "Not recorded"} · Handover:{" "}
              {data.claim.handoverStage?.replace(/_/g, " ") || "Not recorded"}
            </p>
            <p>
              Booking:{" "}
              {data.claim.opsBookingStatus?.replace(/_/g, " ") ||
                "Not recorded"}{" "}
              · Delivery:{" "}
              {data.claim.deliveryStatus?.replace(/_/g, " ") || "Not recorded"}
            </p>
            <p>
              Created {adminDate(data.claim.createdAt)} IST · Agreed slot{" "}
              {adminDate(data.claim.agreedSlotAt)} IST
            </p>
            <p>Dropper: {data.item?.dropper.name || "Not recorded"}</p>
            <p>
              Pickup:{" "}
              {data.claim.pickupAddress ||
                data.item?.dropper.locality ||
                "Not recorded"}
            </p>
            <p>Destination: {data.claim.requesterAddress || "Not recorded"}</p>
            <p>
              Logistics:{" "}
              {data.claim.logistics?.replace(/_/g, " ") || "Not recorded"}
            </p>
            {data.item && (
              <Link
                to={`/admin/items?itemId=${encodeURIComponent(data.item.id)}`}
              >
                Open linked Wall item
              </Link>
            )}
            <h3>Communication audit for this claim</h3>
            {(["email", "sms"] as const).map((channel) => (
              <div key={channel}>
                <ChannelStatus
                  channel={channel}
                  audit={data.notifications[channel]}
                />
                {data.notifications[channel].attempts.map((a) => (
                  <p key={a.id}>
                    {a.status} · {a.templateKey || "Template not recorded"} ·{" "}
                    {adminDate(a.at)} IST
                  </p>
                ))}
              </div>
            ))}
            <p className="admin-subtitle">
              Recorded attempts do not prove receipt. Missing unlogged messages
              are unavailable.
            </p>
          </div>
          <SourceDetails data={data} />
        </section>
      )}
    </div>
  );
}
