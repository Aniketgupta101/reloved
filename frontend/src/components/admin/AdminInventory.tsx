import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  DropAdminRow,
  DropFunnel,
  InventoryDetail,
  InventoryPerson,
  Page,
  WallAdminItem,
} from "@shared/adminControlCenter";
import { api, resolveImageUrl } from "@/lib/api";
import { useAdminResource } from "@/lib/adminResource";
import { SafeImage } from "@/components/ui/SafeImage";
import { OrderChatThread } from "@/components/chat/OrderChatThread";
import {
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from "./AdminResourceView";
import { ChannelStatus } from "./AdminOverviewContent";
import "./admin-inventory.css";

type Kind = "drops" | "wall";
type Row = DropAdminRow | WallAdminItem;
const label = (value: string | null | undefined) =>
  value ? value.replace(/_/g, " ") : "Not recorded";
const rowItems = (row: Row): WallAdminItem[] =>
  "items" in row ? row.items : [row];
function Person({ person }: { person: InventoryPerson }) {
  return (
    <div className="inventory-person">
      <strong>{person.name || "Dropper not recorded"}</strong>
      {person.username && <span>@{person.username}</span>}
      <span>{person.email || "Email not recorded"}</span>
      <span>
        {person.phone || "Phone not recorded"} ·{" "}
        {person.locality || "Area not recorded"}
      </span>
    </div>
  );
}
function Photo({ item }: { item: WallAdminItem }) {
  return item.images[0] ? (
    <SafeImage
      src={resolveImageUrl(item.images[0].storagePath)}
      alt={item.title}
      className="inventory-thumb"
    />
  ) : (
    <div className="inventory-thumb inventory-no-photo">No photo</div>
  );
}
export function InventoryRow({
  row,
  kind,
  onOpen,
}: {
  row: Row;
  kind: Kind;
  onOpen: () => void;
}) {
  const items = rowItems(row);
  return (
    <article className="inventory-row">
      <div className="inventory-item-stack">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="inventory-item-summary">
              <Photo item={item} />
              <div>
                <strong>{item.title}</strong>
                <p>
                  {[item.category, item.size, item.condition]
                    .filter(Boolean)
                    .join(" · ") || "Details not recorded"}
                </p>
                <div className="inventory-statuses">
                  <span
                    className={`admin-status ${item.publicVisibility ? "is-sent" : "is-neutral"}`}
                  >
                    {item.publicVisibility === null
                      ? "Visibility not recorded"
                      : item.publicVisibility
                        ? "On Wall"
                        : "Hidden"}
                  </span>
                  <span className="admin-status is-neutral">
                    {label(item.publicStatus)}
                  </span>
                </div>
                {item.processing && <p>{label(item.processing)}</p>}
              </div>
            </div>
          ))
        ) : (
          <strong>No item linked yet</strong>
        )}
        <small>
          {adminDate(row.createdAt)} IST · {label(row.status)}
        </small>
        {"unreadChat" in row && row.unreadChat && (
          <span className="admin-status is-skipped">Unread dropper chat</span>
        )}
      </div>
      <Person person={row.dropper} />
      <div className="inventory-context">
        {items.flatMap((i) => i.claims).length ? (
          items
            .flatMap((i) => i.claims)
            .slice(0, 2)
            .map((claim) => (
              <p key={claim.id}>
                <strong>{claim.requesterName || "Claimer not recorded"}</strong>
                <br />
                {label(claim.status)} · {label(claim.handoverStage)}
              </p>
            ))
        ) : (
          <p>No linked claim in this scan</p>
        )}
        {items.flatMap((i) => i.claims).length > 2 && (
          <small>More linked claims in this scan · open details</small>
        )}
        {items.map((item) => (
          <div key={item.id}>
            <ChannelStatus channel="email" audit={item.notifications.email} />
            <ChannelStatus channel="sms" audit={item.notifications.sms} />
          </div>
        ))}
        <small>Recorded claim attempts; drop receipt audit unavailable.</small>
      </div>
      <button
        type="button"
        className="admin-button"
        onClick={onOpen}
        aria-label={`View details: ${kind === "drops" ? row.dropper.name || row.id : (row as WallAdminItem).title}`}
      >
        View details
      </button>
    </article>
  );
}
export function FunnelSteps({ steps }: { steps: DropFunnel["steps"] }) {
  return (
    <div className="inventory-funnel">
      {steps.map((step) => (
        <div key={step.id}>
          <span>{step.label}</span>
          <strong>
            {step.value === null
              ? "Unavailable"
              : step.value.toLocaleString("en-IN")}
          </strong>
          <p>{step.reason || "Recorded creations, excluding known testers."}</p>
        </div>
      ))}
    </div>
  );
}
function GiveFunnel() {
  const resource = useAdminResource<DropFunnel>(
    "/api/admin/control-center/drops/funnel",
    () => false,
  );
  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h2>Give journey</h2>
          <p className="admin-subtitle">
            Last 7 days · creation activity, with gaps in step coverage.
          </p>
        </div>
        <button
          className="admin-button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
        >
          Refresh journey
        </button>
      </div>
      {resource.status !== "partial" && <ResourceNotice resource={resource} />}
      {resource.data && (
        <>
          <FunnelSteps steps={resource.data.steps} />
          <p className="admin-panel-description">
            Step events do not support a reliable conversion rate or drop-off
            percentage.
          </p>
          <SourceDetails data={resource.data} />
        </>
      )}
    </section>
  );
}
export function AdminInventory({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const queryKeys = [
    "status",
    "visibility",
    "availability",
    "category",
    "gender",
    "size",
    "search",
  ];
  const query = new URLSearchParams();
  for (const key of queryKeys)
    if (params.get(key)) query.set(key, params.get(key)!);
  const filters = query.toString();
  const focusKey = kind === "drops" ? "submissionId" : "itemId";
  const id = params.get(focusKey);
  function focus(value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(focusKey, value);
    else next.delete(focusKey);
    setParams(next, { replace: true });
  }
  const [version, setVersion] = useState(0);
  return (
    <div className="admin-control-center">
      <InventoryList
        key={`${kind}:${filters}:${version}`}
        kind={kind}
        filters={filters}
        params={params}
        onFilter={(values) => {
          const next = new URLSearchParams(params);
          for (const [key, value] of Object.entries(values)) {
            if (value && value !== "all") next.set(key, value);
            else next.delete(key);
          }
          setParams(next);
        }}
        onOpen={focus}
      />
      {id && (
        <InventoryDrawer
          key={`${kind}:${id}`}
          kind={kind}
          id={id}
          onClose={() => focus(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
export function InventoryCoverageNotice({
  data,
  kind,
}: {
  data: { sources: Page<Row>["sources"]; nextCursor?: string | null };
  kind: Kind;
}) {
  const source = kind === "drops" ? "donationSubmissions" : "items";
  const incompleteContext = data.sources.some(
    (s) =>
      s.source !== source &&
      !s.source.startsWith("communication-coverage/") &&
      s.state !== "complete",
  );
  return (
    <div className="admin-notice" role="status">
      <strong>
        {incompleteContext
          ? "Partial linked context"
          : "Limited communication history"}
      </strong>
      <p>
        {incompleteContext
          ? "Inventory records in this view loaded. Some linked claims, people or notification attempts are incomplete; open details and source coverage."
          : "Inventory records in this view loaded. Drop receipt and other unlogged message history are unavailable; recorded claim attempts are shown."}
        {data.nextCursor
          ? " More inventory remains: continue to the next scan."
          : ""}
      </p>
    </div>
  );
}
function InventoryList({
  kind,
  filters,
  params,
  onFilter,
  onOpen,
}: {
  kind: Kind;
  filters: string;
  params: URLSearchParams;
  onFilter: (values: Record<string, string>) => void;
  onOpen: (id: string) => void;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const resource = useAdminResource<Page<Row>>(
    `/api/admin/control-center/${kind}?limit=10&${filters}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    (data) => !data.items.length && !data.nextCursor,
  );
  const data = resource.data;
  const [search, setSearch] = useState(params.get("search") || "");
  return (
    <>
      <AdminPageHeader
        title={kind === "drops" ? "Drops" : "Wall"}
        description={
          kind === "drops"
            ? "People, items and the next step for each drop."
            : "Manage the full catalog, including hidden and withdrawn items."
        }
        refresh={() => {
          if (cursors.length > 1) setCursors([null]);
          else void resource.refresh();
        }}
        refreshing={resource.refreshing}
        asOf={data?.asOf}
      />
      {kind === "drops" && <GiveFunnel />}
      <form
        className="inventory-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          onFilter({
            search,
            category: String(fields.get("category") || ""),
            gender: String(fields.get("gender") || ""),
            size: String(fields.get("size") || ""),
          });
        }}
      >
        <label>
          Review state
          <select
            value={params.get("status") || "all"}
            onChange={(e) => onFilter({ status: e.target.value })}
          >
            {[
              "all",
              "submitted",
              "under_review",
              "approved",
              "rejected",
              "withdrawn",
            ].map((s) => (
              <option value={s} key={s}>
                {s === "all" ? "All" : s === "rejected" ? "Declined" : label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visibility
          <select
            value={params.get("visibility") || "all"}
            onChange={(e) => onFilter({ visibility: e.target.value })}
          >
            <option value="all">All</option>
            <option value="visible">On Wall</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <label>
          Availability
          <select
            value={params.get("availability") || "all"}
            onChange={(e) => onFilter({ availability: e.target.value })}
          >
            {[
              "all",
              "available",
              "being_matched",
              "claimed",
              "reloved",
              "withdrawn",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All" : label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find item or person
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder="Name, email, phone or area"
          />
        </label>
        <details className="inventory-more-filters">
          <summary>More filters</summary>
          <label>
            Category
            <input
              name="category"
              defaultValue={params.get("category") || ""}
              maxLength={80}
              placeholder="Exact category"
            />
          </label>
          <label>
            For
            <input
              name="gender"
              defaultValue={params.get("gender") || ""}
              maxLength={30}
              placeholder="e.g. unisex"
            />
          </label>
          <label>
            Size
            <input
              name="size"
              defaultValue={params.get("size") || ""}
              maxLength={40}
              placeholder="e.g. M"
            />
          </label>
        </details>
        <button className="admin-button" type="submit">
          Apply
        </button>
        {filters && (
          <button
            className="admin-button"
            type="button"
            onClick={() =>
              onFilter(
                Object.fromEntries(
                  [
                    "status",
                    "visibility",
                    "availability",
                    "category",
                    "gender",
                    "size",
                    "search",
                  ].map((k) => [k, ""]),
                ),
              )
            }
          >
            Clear filters
          </button>
        )}
      </form>
      {resource.status === "partial" && data ? (
        <InventoryCoverageNotice data={data} kind={kind} />
      ) : (
        <ResourceNotice resource={resource} />
      )}
      {data && (
        <>
          <section className="admin-panel">
            <div className="admin-panel-header">
              <h2>
                {data.items.length} {kind === "drops" ? "drops" : "items"} in
                this scan
              </h2>
              <span className="admin-status is-neutral">
                Page {cursors.length}
              </span>
            </div>
            <p className="admin-panel-description">
              Browse in record order. Filters search each scan; continue to
              check more records. Counts are for this page.
            </p>
            {data.items.map((row) => (
              <InventoryRow
                key={row.id}
                row={row}
                kind={kind}
                onOpen={() => onOpen(row.id)}
              />
            ))}
            {!data.items.length && (
              <p className="admin-empty">
                {data.nextCursor
                  ? "No matches in this scan. Continue to check more records."
                  : "No matches in this scan. Source coverage may be incomplete."}
              </p>
            )}
            <div className="admin-pagination">
              <button
                className="admin-button"
                disabled={cursors.length === 1 || resource.refreshing}
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                Previous scan
              </button>
              <span>Page {cursors.length}</span>
              <button
                className="admin-button"
                disabled={
                  !data.nextCursor ||
                  resource.refreshing ||
                  resource.status === "stale"
                }
                onClick={() =>
                  data.nextCursor && setCursors((v) => [...v, data.nextCursor])
                }
              >
                Next scan
              </button>
            </div>
          </section>
          <SourceDetails data={data} />
        </>
      )}
    </>
  );
}
/** Visibility-only changes preserve claim/delivery state. Explicit republish restores withdrawn moderation states. */
export function visibilityPatch(item: WallAdminItem): Record<string, unknown> {
  if (item.publicVisibility === true) return { publicVisibility: false };
  const patch: Record<string, unknown> = { publicVisibility: true };
  if (item.status !== "approved") patch.status = "approved";
  if (
    !["available", "being_matched", "claimed", "reloved"].includes(
      item.publicStatus || "",
    )
  ) {
    patch.status = "approved";
    patch.publicStatus = "available";
  }
  return patch;
}
function ItemEditor({
  item,
  onSave,
  saving,
}: {
  item: WallAdminItem;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  return (
    <details className="inventory-editor">
      <summary>Edit listing details</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onSave(
            item.id,
            Object.fromEntries(
              [
                "title",
                "category",
                "size",
                "condition",
                "locality",
                "description",
              ].map((key) => [key, String(data.get(key) || "").trim()]),
            ),
          );
        }}
      >
        {(
          [
            "title",
            "category",
            "size",
            "condition",
            "locality",
            "description",
          ] as const
        ).map((key) => (
          <label key={key}>
            {key === "locality" ? "Area" : key[0].toUpperCase() + key.slice(1)}
            <input
              name={key}
              defaultValue={item[key] || ""}
              required={key === "title"}
              maxLength={key === "description" ? 2000 : 160}
            />
          </label>
        ))}
        <button className="admin-button" disabled={saving}>
          Save listing
        </button>
      </form>
    </details>
  );
}
function InventoryDrawer({
  kind,
  id,
  onClose,
  onSaved,
}: {
  kind: Kind;
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resource = useAdminResource<InventoryDetail>(
    `/api/admin/control-center/${kind}/${encodeURIComponent(id)}`,
    () => false,
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  const data = resource.data;
  async function save(path: string, patch: Record<string, unknown>) {
    setSaving(true);
    setResult(null);
    try {
      await api.admin.patch(path, patch);
      await resource.refresh();
      onSaved();
      setResult({
        error: false,
        text: "Saved. The latest record has been requested.",
      });
    } catch (error) {
      setResult({
        error: true,
        text:
          error instanceof Error ? error.message : "Could not save. Try again.",
      });
    } finally {
      setSaving(false);
    }
  }
  const saveItem = (itemId: string, patch: Record<string, unknown>) =>
    save(`/api/admin/items/${encodeURIComponent(itemId)}`, patch);
  return (
    <dialog
      ref={dialog}
      className="inventory-dialog"
      aria-labelledby="inventory-detail-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="inventory-drawer-header">
        <div>
          <p className="admin-eyebrow">
            {kind === "drops" ? "Drop" : "Wall item"}
          </p>
          <h2 id="inventory-detail-title">
            {data
              ? "title" in data
                ? data.title
                : data.reference || "Drop details"
              : "Loading details"}
          </h2>
        </div>
        <button
          className="admin-button"
          onClick={onClose}
          disabled={saving}
          autoFocus
        >
          Close
        </button>
      </div>
      {resource.status === "partial" && data ? (
        <InventoryCoverageNotice data={data} kind={kind} />
      ) : (
        <ResourceNotice resource={resource} />
      )}
      {result && (
        <p
          className={`admin-notice ${result.error ? "admin-notice-error" : ""}`}
          role={result.error ? "alert" : "status"}
        >
          {result.text}
        </p>
      )}
      {data && (
        <div className="inventory-drawer-body">
          <Person person={data.dropper} />
          <p>
            Created {adminDate(data.createdAt)} IST · Updated{" "}
            {adminDate(data.updatedAt)} IST
          </p>
          {"submissionId" in data && data.submissionId && (
            <Link
              className="admin-button"
              to={`/admin/donations?submissionId=${encodeURIComponent(data.submissionId)}`}
            >
              Open linked drop
            </Link>
          )}
          {rowItems(data).map((item) => (
            <section className="inventory-detail-item" key={item.id}>
              <h3>{item.title}</h3>
              <div className="inventory-photos">
                {item.images.map((image, index) => (
                  <SafeImage
                    key={`${image.storagePath}:${index}`}
                    src={resolveImageUrl(image.storagePath)}
                    alt={`${item.title}, photo ${index + 1}`}
                  />
                ))}
              </div>
              <p>
                {[
                  item.category,
                  item.gender,
                  item.size,
                  item.condition,
                  item.locality,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {item.description && <p>{item.description}</p>}
              <p>
                <strong>{item.publicVisibility ? "On Wall" : "Hidden"}</strong>{" "}
                · {label(item.publicStatus)} · Review: {label(item.status)}
              </p>
              {item.processing && (
                <p>Photo processing: {label(item.processing)}</p>
              )}
              <div className="inventory-actions">
                <button
                  className="admin-button"
                  disabled={
                    saving || resource.status === "stale" || resource.refreshing
                  }
                  onClick={() => {
                    const patch = visibilityPatch(item);
                    if (
                      "status" in patch &&
                      !window.confirm(
                        patch.publicStatus === "available"
                          ? "Publish this listing as available on the Wall? This changes its review state to approved."
                          : "Publish this listing on the Wall? Review becomes approved and its claim state is preserved.",
                      )
                    )
                      return;
                    void saveItem(item.id, patch);
                  }}
                >
                  {saving
                    ? "Saving…"
                    : item.publicVisibility
                      ? "Hide from Wall"
                      : item.status !== "approved" ||
                          item.publicStatus === "withdrawn"
                        ? "Publish on Wall"
                        : "Restore to Wall"}
                </button>
                {kind === "drops" && (
                  <Link
                    className="admin-button"
                    to={`/admin/items?itemId=${encodeURIComponent(item.id)}`}
                  >
                    Open Wall item
                  </Link>
                )}
              </div>
              <ItemEditor
                key={`${item.id}:${item.updatedAt}`}
                item={item}
                saving={
                  saving || resource.status === "stale" || resource.refreshing
                }
                onSave={saveItem}
              />
              <h4>Claims and delivery</h4>
              {!item.claims.length && <p>No linked claim in this scan.</p>}
              {item.claims.map((claim) => (
                <div className="inventory-linked-claim" key={claim.id}>
                  <strong>{claim.requesterName || "Name not recorded"}</strong>
                  <p>
                    {label(claim.status)} · {label(claim.handoverStage)}
                    {claim.agreedSlotAt
                      ? ` · ${adminDate(claim.agreedSlotAt)} IST`
                      : ""}
                  </p>
                  <div className="inventory-actions">
                    <Link
                      to={`/admin/item-requests?claimId=${encodeURIComponent(claim.id)}`}
                    >
                      Open claim
                    </Link>
                    <Link
                      to={`/admin/orders?claimId=${encodeURIComponent(claim.id)}`}
                    >
                      Open delivery
                    </Link>
                  </div>
                </div>
              ))}
              <h4>Communication audit</h4>
              <p className="admin-subtitle">
                Recorded claim delivery attempts only. Drop receipts and other
                unlogged messages are unavailable. Sent does not prove receipt.
              </p>
              {(["email", "sms"] as const).map((channel) => (
                <div key={channel}>
                  <ChannelStatus
                    channel={channel}
                    audit={item.notifications[channel]}
                  />
                  {item.notifications[channel].attempts.map((attempt) => (
                    <p key={attempt.id}>
                      {channel.toUpperCase()} · {attempt.status} ·{" "}
                      {adminDate(attempt.at)} ·{" "}
                      {attempt.templateKey || "Template not recorded"} ·{" "}
                      {attempt.audience || "Audience not recorded"}
                      {attempt.error ? ` · ${attempt.error}` : ""}
                    </p>
                  ))}
                </div>
              ))}
            </section>
          ))}
          {"items" in data && (
            <>
              <h3>Dropper conversation</h3>
              <OrderChatThread
                subjectType="donation"
                subjectId={data.id}
                client="admin"
                hasUnread={data.unreadChat}
              />
              <details className="inventory-editor">
                <summary>Internal drop notes</summary>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(
                      `/api/admin/submissions/${encodeURIComponent(data.id)}`,
                      {
                        internalNotes: String(
                          new FormData(event.currentTarget).get("notes") || "",
                        ),
                      },
                    );
                  }}
                >
                  <label>
                    Notes
                    <textarea
                      name="notes"
                      defaultValue={data.internalNotes || ""}
                      maxLength={4000}
                    />
                  </label>
                  <button
                    className="admin-button"
                    disabled={saving || resource.status === "stale"}
                  >
                    Save notes
                  </button>
                </form>
              </details>
            </>
          )}
          <details>
            <summary>Record IDs</summary>
            <p>
              {kind === "drops" ? "Submission" : "Item"}: {data.id}
            </p>
            {rowItems(data).map((item) => (
              <p key={item.id}>
                Item: {item.id} · Submission:{" "}
                {item.submissionId || "Not linked"}
              </p>
            ))}
          </details>
          <SourceDetails data={data} />
        </div>
      )}
    </dialog>
  );
}
