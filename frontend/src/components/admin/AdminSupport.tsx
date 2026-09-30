import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  Page,
  SupportPage,
  SupportThreadSummary,
  SupportView,
} from "@shared/adminControlCenter";
import { api } from "@/lib/api";
import { useAdminResource } from "@/lib/adminResource";
import { OrderChatThread } from "@/components/chat/OrderChatThread";
import {
  ADMIN_LIVE_READ_ONLY,
  AdminPageHeader,
  ResourceNotice,
  SourceDetails,
  adminDate,
} from "./AdminResourceView";
import "./admin-support-analytics.css";

export const supportCanMutate = (
  status: string,
  busy: boolean,
  readOnly = false,
) => status !== "stale" && !busy && !readOnly;

export function SupportCard({
  row,
  onOpenChat,
  onEmailReply,
  mutationsDisabled = false,
}: {
  row: SupportThreadSummary;
  onOpenChat: (id: string) => void;
  onEmailReply?: (id: string) => void;
  mutationsDisabled?: boolean;
}) {
  return (
    <article className="support-card">
      <div className="support-card-head">
        <div>
          <span className="admin-eyebrow">
            {row.source === "ask_reloved" ? "Ask Reloved chat" : "Contact form"}
          </span>
          <h2>{row.person}</h2>
        </div>
        <span
          className={`admin-status ${
            row.state === "unread"
              ? "is-failed"
              : row.state === "actioned"
                ? "is-sent"
                : "is-neutral"
          }`}
        >
          {row.state}
        </span>
      </div>
      <p className="support-subject">{row.subject}</p>
      <p className="support-preview">{row.preview}</p>
      <div className="support-meta">
        <span>{row.email || row.phone || "Contact not recorded"}</span>
        <time dateTime={row.occurredAt || undefined}>
          {adminDate(row.occurredAt)}
        </time>
      </div>
      <div className="support-links">
        {row.linked.dropId && (
          <Link
            to={`/admin/donations?submissionId=${encodeURIComponent(row.linked.dropId)}`}
          >
            Open drop
          </Link>
        )}
        {row.linked.itemId && (
          <Link to={`/admin/items?itemId=${encodeURIComponent(row.linked.itemId)}`}>
            Open item
          </Link>
        )}
        {row.linked.claimId && (
          <Link
            to={`/admin/item-requests?claimId=${encodeURIComponent(row.linked.claimId)}`}
          >
            Open claim
          </Link>
        )}
      </div>
      {row.source === "ask_reloved" ? (
        <button
          className="admin-button admin-button-primary"
          disabled={!row.chatSubjectId || mutationsDisabled}
          onClick={() =>
            row.chatSubjectId && !mutationsDisabled && onOpenChat(row.chatSubjectId)
          }
        >
          {mutationsDisabled ? "Read-only review" : "Open conversation"}
        </button>
      ) : (
        <button
          className="admin-button admin-button-primary"
          disabled={mutationsDisabled}
          onClick={() => !mutationsDisabled && onEmailReply?.(row.sourceId)}
        >
          {mutationsDisabled ? "Read-only review" : "Email reply"}
        </button>
      )}
    </article>
  );
}

export function SupportEmptyState({
  view,
  data,
}: {
  view: SupportView;
  data?: Pick<Page<SupportThreadSummary>, "coverage" | "nextCursor">;
}) {
  return (
    <section className="admin-empty">
      <h2>No {view} support conversations</h2>
      <p>
        {data?.nextCursor
          ? "There are no matching conversations on this page. Continue to the next page."
          : "No matching conversations are available."}
      </p>
    </section>
  );
}

function SupportListItem({
  row,
  active,
  onSelect,
}: {
  row: SupportThreadSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="support-list-item"
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="support-list-heading">
        <strong>{row.person}</strong>
        {row.state === "unread" && <i aria-label="Unread" />}
      </span>
      <span className="support-list-channel">
        {row.source === "ask_reloved" ? "Ask Reloved" : "Contact form"}
      </span>
      <span className="support-list-preview">{row.preview || row.subject}</span>
      <time dateTime={row.occurredAt || undefined}>{adminDate(row.occurredAt)}</time>
    </button>
  );
}

export function AdminSupport() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<SupportView>("unread");
  const [cursor, setCursor] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const threadId = searchParams.get("threadId");
  const messageId = searchParams.get("messageId");
  const query = new URLSearchParams({
    view,
    limit: "20",
    ...(cursor ? { cursor } : {}),
    ...(threadId ? { threadId } : {}),
    ...(!threadId && messageId ? { messageId } : {}),
  });
  const resource = useAdminResource<SupportPage>(
    `/api/admin/control-center/support?${query}`,
    (data) => !data.items.length && !data.focused,
  );
  const mutationsDisabled = !supportCanMutate(
    resource.status,
    busy,
    ADMIN_LIVE_READ_ONLY,
  );
  const rows = useMemo(() => {
    if (!resource.data) return [];
    const pageRows = resource.data.items.filter(
      (row) => row.id !== resource.data?.focused?.id,
    );
    return resource.data.focused
      ? [resource.data.focused, ...pageRows]
      : pageRows;
  }, [resource.data]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;

  useEffect(() => {
    if (resource.status === "stale" || ADMIN_LIVE_READ_ONLY) {
      setOpenChat(null);
      setReplyId(null);
    }
  }, [resource.status]);
  useEffect(() => {
    if (resource.data?.focused) {
      setSelectedId(resource.data.focused.id);
      setMobileDetailOpen(true);
    } else if (selectedId && !rows.some((row) => row.id === selectedId)) {
      setSelectedId(null);
      setMobileDetailOpen(false);
    }
  }, [resource.data?.focused, rows, selectedId]);

  const choose = (next: SupportView) => {
    setView(next);
    setCursor("");
    setHistory([]);
    setSelectedId(null);
    setMobileDetailOpen(false);
    setOpenChat(null);
    setReplyId(null);
  };
  function openConversation(id: string) {
    if (mutationsDisabled) return;
    setOpenChat(id);
  }
  function openEmailReply(id: string) {
    if (mutationsDisabled) return;
    setReplyId(id);
  }
  async function sendReply(id: string) {
    if (mutationsDisabled) return;
    const reply = draft.trim();
    if (reply.length < 2) {
      setActionError("Write a reply before sending.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.admin.post(`/api/admin/contact-messages/${id}/reply`, { reply });
      setDraft("");
      setReplyId(null);
      await resource.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to send reply email.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function markActioned(id: string) {
    if (mutationsDisabled) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.admin.patch(`/api/admin/contact-messages/${id}`, {
        status: "actioned",
      });
      setReplyId(null);
      await resource.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to update the conversation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-control-center">
      <AdminPageHeader
        title="Support"
        description="Ask Reloved threads and website requests in one inbox."
        refresh={resource.refresh}
        refreshing={resource.refreshing}
        asOf={resource.data?.asOf}
      />
      <nav className="admin-tabs" aria-label="Support views">
        {(["unread", "open", "actioned", "all"] as SupportView[]).map(
          (value) => (
            <button
              key={value}
              className={view === value ? "is-active" : ""}
              aria-pressed={view === value}
              onClick={() => choose(value)}
            >
              {value}
            </button>
          ),
        )}
      </nav>
      <ResourceNotice resource={resource} />
      {ADMIN_LIVE_READ_ONLY && (
        <div className="support-read-only" role="status">
          <strong>Read-only review</strong>
          <span>Replies and status changes are disabled.</span>
        </div>
      )}
      {actionError && (
        <div className="admin-notice admin-notice-error" role="alert">
          <strong>Action failed</strong>
          <p>{actionError}</p>
        </div>
      )}
      {resource.status === "empty" && (
        <SupportEmptyState view={view} data={resource.data} />
      )}
      {resource.data && (
        <>
          {(threadId || messageId) && !resource.data.focused && (
            <div className="admin-notice admin-notice-error" role="status">
              <strong>Conversation not found</strong>
              <p>The linked support conversation is no longer available.</p>
            </div>
          )}
          {rows.length > 0 && (
            <section
              className={`support-inbox ${mobileDetailOpen ? "has-mobile-detail" : ""}`}
              aria-label="Support conversations"
            >
              <div className="support-inbox-list">
                <header>
                  <strong>{rows.length} conversations</strong>
                  <span>Page {history.length + 1}</span>
                </header>
                {rows.map((row) => (
                  <SupportListItem
                    key={row.id}
                    row={row}
                    active={selected?.id === row.id}
                    onSelect={() => {
                      setSelectedId(row.id);
                      setMobileDetailOpen(true);
                      setOpenChat(null);
                      setReplyId(null);
                    }}
                  />
                ))}
              </div>
              <div className="support-inbox-detail">
                <button
                  className="admin-button support-mobile-back"
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                >
                  Back to inbox
                </button>
                {selected && (
                  <>
                    <SupportCard
                      row={selected}
                      onOpenChat={openConversation}
                      onEmailReply={openEmailReply}
                      mutationsDisabled={mutationsDisabled}
                    />
                    {!ADMIN_LIVE_READ_ONLY &&
                      resource.status !== "stale" &&
                      openChat === selected.chatSubjectId &&
                      selected.source === "ask_reloved" &&
                      selected.chatSubjectId && (
                        <div className="support-chat">
                          <OrderChatThread
                            subjectType="support"
                            subjectId={selected.chatSubjectId}
                            client="admin"
                            defaultOpen
                            hasUnread={selected.state === "unread"}
                            title={`Ask Reloved · ${selected.person}`}
                            subtitle="Your reply appears in their Ask Reloved popup."
                          />
                        </div>
                      )}
                    {!ADMIN_LIVE_READ_ONLY &&
                      resource.status !== "stale" &&
                      replyId === selected.sourceId &&
                      selected.source === "contact_form" && (
                        <div className="support-chat support-reply">
                          <label htmlFor={`reply-${selected.sourceId}`}>
                            Reply to {selected.person}
                          </label>
                          <textarea
                            id={`reply-${selected.sourceId}`}
                            value={draft}
                            maxLength={4000}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder="Write the email reply…"
                          />
                          <small>{draft.length}/4000</small>
                          <div>
                            <button
                              className="admin-button admin-button-primary"
                              disabled={mutationsDisabled || draft.trim().length < 2}
                              onClick={() => void sendReply(selected.sourceId)}
                            >
                              {busy ? "Sending…" : "Send email reply"}
                            </button>
                            {selected.state !== "actioned" && (
                              <button
                                className="admin-button"
                                disabled={mutationsDisabled}
                                onClick={() => void markActioned(selected.sourceId)}
                              >
                                Mark actioned
                              </button>
                            )}
                            <button
                              className="admin-button"
                              disabled={busy}
                              onClick={() => setReplyId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                  </>
                )}
              </div>
            </section>
          )}
          {!rows.length && resource.status !== "empty" && (
            <SupportEmptyState view={view} data={resource.data} />
          )}
          <div className="admin-pagination">
            <button
              className="admin-button"
              disabled={!history.length}
              onClick={() => {
                const next = [...history];
                setCursor(next.pop() || "");
                setHistory(next);
                setSelectedId(null);
                setMobileDetailOpen(false);
              }}
            >
              Previous page
            </button>
            <span>Page {history.length + 1}</span>
            <button
              className="admin-button"
              disabled={!resource.data.nextCursor}
              onClick={() => {
                setHistory([...history, cursor]);
                setCursor(resource.data!.nextCursor || "");
                setSelectedId(null);
                setMobileDetailOpen(false);
              }}
            >
              Next page
            </button>
          </div>
          <SourceDetails data={resource.data} />
        </>
      )}
    </div>
  );
}
