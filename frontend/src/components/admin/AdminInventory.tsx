import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  DropAdminRow,
  DropFunnel,
  InventoryDetail,
  InventoryPerson,
  InventoryClaim,
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
  ADMIN_LIVE_READ_ONLY,
} from "./AdminResourceView";
import { ChannelStatus } from "./AdminOverviewContent";
import "./admin-inventory.css";

type Kind = "drops" | "wall";
type Row = DropAdminRow | WallAdminItem;
const label = (value: string | null | undefined) =>
  value ? value.replace(/_/g, " ") : "Not recorded";
const rowItems = (row: Row): WallAdminItem[] =>
  "items" in row ? row.items : [row];
function Person({
  person,
  compact = false,
}: {
  person: InventoryPerson;
  compact?: boolean;
}) {
  return (
    <div className="inventory-person">
      <strong>{person.name || "Dropper not recorded"}</strong>
      {person.username && <span>@{person.username}</span>}
      {compact ? (
        <span>{person.locality || "Area not recorded"}</span>
      ) : (
        <>
          <span>{person.email || "Email not recorded"}</span>
          <span>
            {person.phone || "Phone not recorded"} ·{" "}
            {person.locality || "Area not recorded"}
          </span>
        </>
      )}
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
  const primary = items[0];
  const claims = items.flatMap((item) => item.claims);
  const communication = items.flatMap((item) =>
    [item.notifications.email.latest, item.notifications.sms.latest].filter(
      Boolean,
    ),
  );
  return (
    <article className="inventory-row">
      <div className="inventory-table-cell inventory-item-stack" data-label="Item">
        {primary ? (
          <div className="inventory-item-summary">
            <Photo item={primary} />
            <div>
              <strong>{primary.title}</strong>
              <p>
                {[primary.category, primary.size, primary.condition]
                  .filter(Boolean)
                  .join(" · ") || "Details not recorded"}
              </p>
              {items.length > 1 && <small>+{items.length - 1} more items</small>}
            </div>
          </div>
        ) : (
          <strong>No item linked yet</strong>
        )}
      </div>
      <div className="inventory-table-cell" data-label="Dropper">
        <Person person={row.dropper} compact />
      </div>
      <div className="inventory-table-cell" data-label="Wall status">
        {primary ? (
          <span
            className={`admin-status ${primary.publicVisibility ? "is-sent" : "is-neutral"}`}
          >
            {primary.publicVisibility === null
              ? "Not recorded"
              : primary.publicVisibility
                ? "On Wall"
                : "Hidden"}
          </span>
        ) : (
          <span className="admin-status is-neutral">No listing</span>
        )}
      </div>
      <div className="inventory-table-cell" data-label="Claim status">
        <strong>{claims.length ? label(claims[0].status) : "No claim"}</strong>
        {claims.length > 1 && <small>+{claims.length - 1} more</small>}
      </div>
      <div className="inventory-table-cell" data-label="Communication">
        {"unreadChat" in row && row.unreadChat ? (
          <span className="admin-status is-warning">Unread chat</span>
        ) : communication.length ? (
          <span className="admin-status is-neutral">
            Latest {label(communication[0]?.status)}
          </span>
        ) : (
          <span className="admin-status is-neutral">No recent activity</span>
        )}
      </div>
      <div className="inventory-table-cell" data-label="Date">
        <time dateTime={row.createdAt || undefined}>{adminDate(row.createdAt)}</time>
      </div>
      <button
        type="button"
        className="admin-button inventory-row-action"
        onClick={onOpen}
        aria-label={`View details: ${kind === "drops" ? row.dropper.name || row.id : (row as WallAdminItem).title}`}
      >
        Open
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
    "lane",
    "dateFrom",
    "dateTo",
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
      s.source !== "dated-inventory-scope" &&
      !s.source.startsWith("inventory-match-scan/") &&
      !s.source.startsWith("item-match-scan/") &&
      !s.source.startsWith("claimer-match-scan/") &&
      !s.source.startsWith("communication-coverage/") &&
      s.state !== "complete",
  );
  return (
    <div className="admin-data-caveat" role="status">
      <strong>
        {incompleteContext
          ? "Some linked details are unavailable"
          : "Some communication history is unavailable"}
      </strong>
      <p>
        {incompleteContext
          ? "Items are available, but some linked claims, people or messages may be missing. Open Data details for technical context."
          : "Recorded claim messages are shown. Earlier messages may not be available."}
        {data.nextCursor
          ? " More inventory remains on the next page."
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
      <div className="admin-filter-tabs" aria-label="Inventory browse mode">
        <button
          type="button"
          aria-pressed={
            !params.get("lane") &&
            !params.get("dateFrom") &&
            !params.get("dateTo")
          }
          onClick={() => onFilter({ lane: "all", dateFrom: "", dateTo: "" })}
        >
          All records
        </button>
        <button
          type="button"
          aria-pressed={params.get("lane") === "recent"}
          onClick={() => onFilter({ lane: "recent" })}
        >
          {kind === "drops" ? "Recent Drops" : "Recent additions"}
        </button>
      </div>
      <form
        className="inventory-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          onFilter({
            search,
            dateFrom: String(fields.get("dateFrom") || ""),
            dateTo: String(fields.get("dateTo") || ""),
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
            {kind === "wall" ? "Date added from (IST)" : "Created from (IST)"}
            <input
              name="dateFrom"
              type="date"
              defaultValue={params.get("dateFrom") || ""}
            />
          </label>
          <label>
            Through date (IST)
            <input
              name="dateTo"
              type="date"
              defaultValue={params.get("dateTo") || ""}
            />
          </label>
          <p className="admin-subtitle">
            Date ranges include canonical recorded creation timestamps. All
            records includes legacy and undated inventory.
          </p>
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
                    "lane",
                    "dateFrom",
                    "dateTo",
                  ].map((k) => [k, ""]),
                ),
              )
            }
          >
            Clear filters
          </button>
        )}
      </form>
      {(params.get("lane") === "recent" ||
        params.get("dateFrom") ||
        params.get("dateTo")) && (
        <p className="admin-notice">
          Dated records only · newest creation first. Records with older date
          formats or missing dates remain available in All records without a
          date range.
          {(params.get("dateFrom") || params.get("dateTo")) && (
            <>
              {" "}
              Applied dates: {params.get("dateFrom") ||
                "Earliest recorded"}{" "}
              through {params.get("dateTo") || "Now"} (IST).
            </>
          )}
        </p>
      )}
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
                {data.items.length} {kind === "drops" ? "drops" : "items"}
              </h2>
              <span className="admin-status is-neutral">
                Page {cursors.length}
              </span>
            </div>
            <p className="admin-panel-description">
              Showing this page in {data.order.toLowerCase()} order.
            </p>
            <div className="inventory-table-header" aria-hidden="true">
              <span>Item</span>
              <span>Dropper</span>
              <span>Wall status</span>
              <span>Claim status</span>
              <span>Communication</span>
              <span>Date</span>
              <span>Action</span>
            </div>
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
                  ? "No matches on this page. Continue to the next page."
                  : "No matching items."}
              </p>
            )}
            <div className="admin-pagination">
              <button
                className="admin-button"
                disabled={cursors.length === 1 || resource.refreshing}
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                Previous page
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
                Next page
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
  const [linkedItems, setLinkedItems] = useState<{
    items: WallAdminItem[];
    cursor?: string | null;
  }>({ items: [] });
  const [loadingItems, setLoadingItems] = useState(false);
  useEffect(() => setLinkedItems({ items: [] }), [data?.asOf]);
  const nextItems =
    linkedItems.cursor === undefined
      ? data && "itemsNextCursor" in data
        ? data.itemsNextCursor
        : null
      : linkedItems.cursor;
  async function moreItems() {
    if (!nextItems) return;
    setLoadingItems(true);
    try {
      const page = await api.admin.get<Page<WallAdminItem>>(
        `/api/admin/control-center/drops/${encodeURIComponent(id)}/items?cursor=${encodeURIComponent(nextItems)}`,
      );
      setLinkedItems((old) => ({
        items: [
          ...old.items,
          ...page.items.filter((i) => !old.items.some((o) => o.id === i.id)),
        ],
        cursor: page.nextCursor,
      }));
    } catch {
      setResult({
        error: true,
        text: "Could not load more items. Existing detail is retained; retry loading more.",
      });
    } finally {
      setLoadingItems(false);
    }
  }
  async function save(path: string, patch: Record<string, unknown>) {
    if (ADMIN_LIVE_READ_ONLY) {
      setResult({ error: true, text: "Live review is read-only." });
      return;
    }
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
          {ADMIN_LIVE_READ_ONLY && (
            <div className="inventory-read-only" role="status">
              <strong>Read-only review</strong>
              <span>Production records can be viewed, but changes and replies are disabled.</span>
            </div>
          )}
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
          {"items" in data && !data.hasLinkedItems && (
            <section>
              <h3>Review this drop</h3>
              <p className="admin-subtitle">
                No listing is linked. These actions use the existing submission
                workflow, which can send a decision email and update linked
                listings or claims if they have since changed.
              </p>
              <InventoryModeration
                kind="drop"
                status={data.status}
                disabled={
                  saving || resource.refreshing || resource.status === "stale"
                }
                onSelect={(status) => {
                  if (window.confirm(moderationConfirmation("drop", status)))
                    void save(
                      `/api/admin/submissions/${encodeURIComponent(data.id)}`,
                      { status },
                    );
                }}
              />
            </section>
          )}
          {[...rowItems(data), ...linkedItems.items].map((item) => (
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
                    ADMIN_LIVE_READ_ONLY ||
                    saving ||
                    resource.status === "stale" ||
                    resource.refreshing
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
                    : ADMIN_LIVE_READ_ONLY
                      ? "Read-only review"
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
              <InventoryModeration
                kind="item"
                status={item.status}
                disabled={
                  saving || resource.refreshing || resource.status === "stale"
                }
                onSelect={(status) => {
                  if (window.confirm(moderationConfirmation("item", status)))
                    void saveItem(item.id, {
                      status: "rejected",
                      publicVisibility: false,
                    });
                }}
              />
              {ADMIN_LIVE_READ_ONLY ? (
                <p className="admin-subtitle">Listing edits are disabled during live review.</p>
              ) : (
                <ItemEditor
                  key={`${item.id}:${item.updatedAt}`}
                  item={item}
                  saving={
                    saving || resource.status === "stale" || resource.refreshing
                  }
                  onSave={saveItem}
                />
              )}
              <h4>Claims and delivery</h4>
              {!item.claims.length && <p>No linked claim.</p>}
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
              <MoreInventoryClaims
                key={`${item.id}:${data.asOf}`}
                item={item}
              />
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
          {nextItems && (
            <button
              className="admin-button"
              disabled={loadingItems || saving}
              onClick={() => void moreItems()}
            >
              {loadingItems
                ? "Loading linked items…"
                : "Load more linked items"}
            </button>
          )}
          {"items" in data && (
            <>
              <h3>Dropper conversation</h3>
              {ADMIN_LIVE_READ_ONLY ? (
                <p className="admin-subtitle">
                  Replying and internal note changes are disabled during live review.
                </p>
              ) : (
                <>
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
            </>
          )}
          <details>
            <summary>Record IDs</summary>
            <p>
              {kind === "drops" ? "Submission" : "Item"}: {data.id}
            </p>
            {[...rowItems(data), ...linkedItems.items].map((item) => (
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

export function moderationConfirmation(kind: "drop" | "item", status: string) {
  if (kind === "item")
    return "Decline this item and hide it from the Wall? This uses item moderation only; it does not cancel existing claims or send a drop decision email.";
  if (status === "rejected")
    return "Decline this drop? The existing submission workflow hides linked items, cancels open claims and may send a decision email to the dropper.";
  if (status === "approved")
    return "Approve this drop? The existing submission workflow publishes linked items as available and may send a decision email to the dropper.";
  return "Mark this drop as under review? The existing workflow hides linked items while they are reviewed.";
}
export function InventoryModeration({
  kind,
  status,
  disabled,
  onSelect,
}: {
  kind: "drop" | "item";
  status: string | null;
  disabled: boolean;
  onSelect: (status: string) => void;
}) {
  if (ADMIN_LIVE_READ_ONLY)
    return (
      <div className="inventory-actions">
        <button className="admin-button" type="button" disabled>
          Read-only review
        </button>
      </div>
    );
  const actions =
    kind === "drop"
      ? [
          ["approved", "Approve drop"],
          ["under_review", "Mark reviewing"],
          ["rejected", "Decline drop"],
        ]
      : [["rejected", "Decline item"]];
  return (
    <div className="inventory-actions">
      {actions.map(([value, title]) => (
        <button
          key={value}
          className="admin-button"
          type="button"
          disabled={disabled || status === value}
          onClick={() => onSelect(value)}
        >
          {title}
        </button>
      ))}
    </div>
  );
}
function MoreInventoryClaims({ item }: { item: WallAdminItem }) {
  const [state, setState] = useState<{
    rows: InventoryClaim[];
    cursor: string | null;
    loading: boolean;
    error: boolean;
  }>({ rows: [], cursor: item.claimsNextCursor, loading: false, error: false });
  async function load() {
    if (!state.cursor) return;
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const page = await api.admin.get<Page<InventoryClaim>>(
        `/api/admin/control-center/wall/${encodeURIComponent(item.id)}/claims?cursor=${encodeURIComponent(state.cursor)}`,
      );
      setState((s) => ({
        rows: [
          ...s.rows,
          ...page.items.filter(
            (c) =>
              !s.rows.some((r) => r.id === c.id) &&
              !item.claims.some((r) => r.id === c.id),
          ),
        ],
        cursor: page.nextCursor,
        loading: false,
        error: false,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }
  return (
    <>
      {state.rows.map((claim) => (
        <div className="inventory-linked-claim" key={claim.id}>
          <strong>{claim.requesterName || "Name not recorded"}</strong>
          <p>
            {label(claim.status)} · {label(claim.handoverStage)}
          </p>
          <div className="inventory-actions">
            <Link
              to={`/admin/item-requests?claimId=${encodeURIComponent(claim.id)}`}
            >
              Open claim
            </Link>
            <Link to={`/admin/orders?claimId=${encodeURIComponent(claim.id)}`}>
              Open delivery
            </Link>
          </div>
        </div>
      ))}
      {state.error && (
        <p role="alert">
          More claims could not load. Existing claims retained; retry below.
        </p>
      )}
      {state.cursor && (
        <button
          className="admin-button"
          disabled={state.loading}
          onClick={() => void load()}
        >
          {state.loading ? "Loading claims…" : "Load more claims"}
        </button>
      )}
      {state.rows.length > 0 && (
        <p className="admin-subtitle">
          Additional claims loaded. Open each claim for its own communication
          audit; the summary below covers the first claim window.
        </p>
      )}
    </>
  );
}
