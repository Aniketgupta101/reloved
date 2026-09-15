import { useState } from "react"
import { OrderChatThread } from "@/components/chat/OrderChatThread"

/** Two chat channels after a match: Reloved ops, or direct giver ? receiver. */
export function DualChatOptions({
  relovedType,
  relovedSubjectId,
  peerClaimId,
  peerEnabled,
  peerLabel,
}: {
  relovedType: "donation" | "claim"
  relovedSubjectId: string
  peerClaimId?: string | null
  peerEnabled: boolean
  peerLabel: "Chat with receiver" | "Chat with giver"
}) {
  const [channel, setChannel] = useState<"reloved" | "peer">("reloved")

  return (
    <div className="pt-2 flex flex-col gap-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Chat</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setChannel("reloved")}
          className={`h-11 px-2 text-[10px] font-black uppercase tracking-widest border-2 border-foreground ${
            channel === "reloved"
              ? "bg-foreground text-background shadow-none translate-x-[2px] translate-y-[2px]"
              : "bg-white shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:bg-black/5"
          }`}
        >
          Chat with Reloved
        </button>
        <button
          type="button"
          disabled={!peerEnabled || !peerClaimId}
          onClick={() => setChannel("peer")}
          className={`h-11 px-2 text-[10px] font-black uppercase tracking-widest border-2 border-foreground ${
            !peerEnabled || !peerClaimId
              ? "opacity-40 cursor-not-allowed bg-surface-muted"
              : channel === "peer"
                ? "bg-foreground text-background shadow-none translate-x-[2px] translate-y-[2px]"
                : "bg-white shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:bg-black/5"
          }`}
        >
          {peerLabel}
        </button>
      </div>
      {!peerEnabled && (
        <p className="text-[11px] text-foreground-muted font-medium">
          Direct chat opens after the giver accepts and the item is Matched.
        </p>
      )}
      {channel === "reloved" ? (
        <OrderChatThread
          key={`reloved-${relovedType}-${relovedSubjectId}`}
          subjectType={relovedType}
          subjectId={relovedSubjectId}
          client="donor"
          defaultOpen
        />
      ) : peerClaimId ? (
        <OrderChatThread
          key={`peer-${peerClaimId}`}
          subjectType="peer"
          subjectId={peerClaimId}
          client="donor"
          defaultOpen
          title={peerLabel}
          collapsedLabel={peerLabel}
          subtitle="Arrange handover together. Do not share flat numbers — building / landmark only."
          placeholder="Write a handover message..."
        />
      ) : null}
    </div>
  )
}
