import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Page, SupportPage, SupportThreadSummary, SupportView } from "@shared/adminControlCenter";
import { api } from "@/lib/api";
import { useAdminResource } from "@/lib/adminResource";
import { OrderChatThread } from "@/components/chat/OrderChatThread";
import { AdminPageHeader, ResourceNotice, SourceDetails, adminDate } from "./AdminResourceView";
import "./admin-support-analytics.css";

export const supportCanMutate = (status: string, busy: boolean) => status !== "stale" && !busy;

export function SupportCard({ row, onOpenChat, onEmailReply, mutationsDisabled = false }: { row: SupportThreadSummary; onOpenChat: (id: string) => void; onEmailReply?: (id: string) => void; mutationsDisabled?: boolean }) {
  return <article className="support-card">
    <div className="support-card-head">
      <div><span className="admin-eyebrow">{row.source === "ask_reloved" ? "Ask Reloved chat" : "Contact form"}</span><h2>{row.person}</h2></div>
      <span className={`admin-status ${row.state === "unread" ? "is-failed" : row.state === "actioned" ? "is-sent" : "is-neutral"}`}>{row.state}</span>
    </div>
    <p className="support-subject">{row.subject}</p><p className="support-preview">{row.preview}</p>
    <div className="support-meta"><span>{row.email || row.phone || "Contact not recorded"}</span><time dateTime={row.occurredAt || undefined}>{adminDate(row.occurredAt)}</time></div>
    <div className="support-links">
      {row.linked.dropId && <Link to={`/admin/donations?submissionId=${encodeURIComponent(row.linked.dropId)}`}>Open drop</Link>}
      {row.linked.itemId && <Link to={`/admin/items?itemId=${encodeURIComponent(row.linked.itemId)}`}>Open item</Link>}
      {row.linked.claimId && <Link to={`/admin/item-requests?claimId=${encodeURIComponent(row.linked.claimId)}`}>Open claim</Link>}
    </div>
    {row.source === "ask_reloved" ? <button className="admin-button admin-button-primary" disabled={!row.chatSubjectId || mutationsDisabled} onClick={() => row.chatSubjectId && !mutationsDisabled && onOpenChat(row.chatSubjectId)}>Open conversation</button> : <button className="admin-button admin-button-primary" disabled={mutationsDisabled} onClick={() => !mutationsDisabled && onEmailReply?.(row.sourceId)}>Email reply</button>}
  </article>;
}

export function SupportEmptyState({ view, data }: { view: SupportView; data?: Pick<Page<SupportThreadSummary>, "coverage" | "nextCursor"> }) {
  const bounded = data?.coverage !== "complete" || !!data?.nextCursor;
  return <section className="admin-empty"><h2>No {view} support conversations in this page</h2><p>{bounded ? "This bounded scan has no matching conversations. Continue to the next page to inspect older records." : "No matching conversations exist in the fully scanned support sources."}</p></section>;
}

export function AdminSupport() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<SupportView>("unread");
  const [cursor, setCursor] = useState(""); const [history, setHistory] = useState<string[]>([]);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [replyId, setReplyId] = useState<string | null>(null); const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState<string | null>(null);
  const threadId = searchParams.get("threadId");
  const messageId = searchParams.get("messageId");
  const query = new URLSearchParams({ view, limit: "20", ...(cursor ? { cursor } : {}), ...(threadId ? { threadId } : {}), ...(!threadId && messageId ? { messageId } : {}) });
  const resource = useAdminResource<SupportPage>(`/api/admin/control-center/support?${query}`, d => !d.items.length && !d.focused);
  const mutationsDisabled = !supportCanMutate(resource.status, busy);
  useEffect(() => {
    if (resource.status === "stale") {
      setOpenChat(null);
      setReplyId(null);
    }
  }, [resource.status]);
  const choose = (next: SupportView) => { setView(next); setCursor(""); setHistory([]); setOpenChat(null); };
  function openConversation(id: string) { if (!supportCanMutate(resource.status, busy)) return; setOpenChat(id); }
  function openEmailReply(id: string) { if (!supportCanMutate(resource.status, busy)) return; setReplyId(id); }
  async function sendReply(id: string) { if (!supportCanMutate(resource.status, busy)) return; const reply=draft.trim(); if(reply.length<2){setActionError("Write a reply before sending.");return;} setBusy(true);setActionError(null);try{await api.admin.post(`/api/admin/contact-messages/${id}/reply`,{reply});setDraft("");setReplyId(null);await resource.refresh();}catch(error){setActionError(error instanceof Error?error.message:"Failed to send reply email.");}finally{setBusy(false);} }
  async function markActioned(id:string){if (!supportCanMutate(resource.status, busy)) return;setBusy(true);setActionError(null);try{await api.admin.patch(`/api/admin/contact-messages/${id}`,{status:"actioned"});setReplyId(null);await resource.refresh();}catch(error){setActionError(error instanceof Error?error.message:"Failed to update the conversation.");}finally{setBusy(false);}}
  const rows = resource.data ? resource.data.items.filter(row => row.id !== resource.data?.focused?.id) : [];
  const renderRow = (row: SupportThreadSummary) => <div key={row.id}><SupportCard row={row} onOpenChat={openConversation} onEmailReply={openEmailReply} mutationsDisabled={mutationsDisabled}/>{resource.status !== "stale" && openChat === row.chatSubjectId && row.source === "ask_reloved" && row.chatSubjectId && <div className="support-chat"><OrderChatThread subjectType="support" subjectId={row.chatSubjectId} client="admin" defaultOpen hasUnread={row.state === "unread"} title={`Ask Reloved · ${row.person}`} subtitle="Your reply appears in their Ask Reloved popup." /></div>}{resource.status !== "stale" && replyId === row.sourceId && row.source === "contact_form" && <div className="support-chat support-reply"><label htmlFor={`reply-${row.sourceId}`}>Reply to {row.person}</label><textarea id={`reply-${row.sourceId}`} value={draft} maxLength={4000} onChange={event=>setDraft(event.target.value)} placeholder="Write the email reply…"/><small>{draft.length}/4000</small><div><button className="admin-button admin-button-primary" disabled={mutationsDisabled||draft.trim().length<2} onClick={()=>void sendReply(row.sourceId)}>{busy?"Sending…":"Send email reply"}</button>{row.state!=="actioned"&&<button className="admin-button" disabled={mutationsDisabled} onClick={()=>void markActioned(row.sourceId)}>Mark actioned</button>}<button className="admin-button" disabled={busy} onClick={()=>setReplyId(null)}>Cancel</button></div></div>}</div>;
  return <div className="admin-control-center">
    <AdminPageHeader title="Support" description="One inbox for Ask Reloved help threads and website contact forms. Operational handover chats stay with their claims." refresh={resource.refresh} refreshing={resource.refreshing} asOf={resource.data?.asOf} />
    <nav className="admin-tabs" aria-label="Support views">{(["unread","open","actioned","all"] as SupportView[]).map(v => <button key={v} className={view === v ? "is-active" : ""} aria-pressed={view === v} onClick={() => choose(v)}>{v}</button>)}</nav>
    <ResourceNotice resource={resource} />
    {actionError && <div className="admin-notice admin-notice-error" role="alert"><strong>Action failed</strong><p>{actionError}</p></div>}
    {resource.status === "empty" && <SupportEmptyState view={view} data={resource.data} />}
    {resource.data && <>
      {(threadId || messageId) && !resource.data.focused && <div className="admin-notice admin-notice-error" role="status"><strong>Conversation not found</strong><p>The linked support source may have been removed or is not an Ask Reloved support thread.</p></div>}
      {resource.data.focused && <section className="support-focused" aria-label="Focused support conversation"><p className="admin-eyebrow">Linked conversation</p>{renderRow(resource.data.focused)}</section>}
      <section className="support-grid" aria-label="Support conversations">{rows.map(renderRow)}</section>
      <div className="admin-pagination"><button className="admin-button" disabled={!history.length} onClick={() => { const h=[...history]; setCursor(h.pop() || ""); setHistory(h); }}>Previous</button><button className="admin-button" disabled={!resource.data.nextCursor} onClick={() => { setHistory([...history,cursor]); setCursor(resource.data!.nextCursor || ""); }}>Next</button></div>
      <SourceDetails data={resource.data}/>
    </>}
  </div>;
}
