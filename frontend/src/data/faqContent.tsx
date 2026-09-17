import React from "react"
import { Link } from "react-router-dom"

export interface FaqItem {
  q: string
  a: React.ReactNode
}

export interface FaqGroup {
  title: string
  items: FaqItem[]
}

export function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode }).children)
  return ""
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Giving an Item",
    items: [
      {
        q: "How do I give an item?",
        a: "Go to Drop an Item, upload photos, confirm details, add a building/landmark for pickup (no flat or wing) and when you are available, then submit. You'll get a reference number. The receiver collects from your building gate after you Accept a claim.",
      },
      {
        q: "Is there any cost to give?",
        a: "The item itself is always ₹0 for the giver. After a match, if you use an external courier like Porter or Borzo, the receiver pays that courier once for the ride (often about ₹40–80 in Mumbai). Reloved takes no commission and does not run the courier.",
      },
      {
        q: "What can I give?",
        a: (
          <>
            Clothing, footwear, and bags that are clean, safe, and honestly represented. See our{" "}
            <Link to="/standards" className="underline font-bold">Quality &amp; Safety Standards</Link> for what's not accepted.
          </>
        ),
      },
      {
        q: "How long until my item shows up on the Wall?",
        a: "Our team reviews every drop before it goes live, typically within 24–48 hours. You'll get an email when it's approved or declined.",
      },
      {
        q: "What happens when someone claims my item?",
        a: (
          <>
            You get an in-app notification (and email if we have one). Open your{" "}
            <Link to="/account" className="underline font-bold">profile</Link> → Giving / gift page and{" "}
            <strong>Accept</strong> or <strong>Decline</strong>. Accept → Matched; Decline → claimer sees{" "}
            <strong>Couldn&apos;t match</strong> (friendly, never &quot;Rejected&quot;) and the item returns to{" "}
            <strong>Available</strong> on the Wall.
          </>
        ),
      },
      {
        q: "Can I choose how I'm recognized?",
        a: "Yes. When you give, pick your name, an alias, or Anonymous for how you appear on the Wall of Love.",
      },
    ],
  },
  {
    title: "Claiming an Item",
    items: [
      {
        q: "How do I claim an item?",
        a: "Open an item on the Wall, sign in (phone or email OTP, or Google), share who you are and a building/landmark for handover (no flat/wing), accept the pledge, and send the request. The giver — not Reloved admin — Accepts or Declines.",
      },
      {
        q: "How many items can I claim?",
        a: "Up to three claims per calendar week during Friends & Family, to keep the Wall fair for everyone.",
      },
      {
        q: "Who approves my claim?",
        a: "The giver. While they decide, the item is held as Claimed so conflicting claims can't both win. You'll be notified when they Accept or Decline.",
      },
      {
        q: "What does “Couldn't match” mean?",
        a: "If the giver Declines, we never say Rejected. You'll see Couldn't match — usually distance or timing. The item returns to Available on the Wall so someone nearby can Relove it. It isn't a judgment on you.",
      },
      {
        q: "What happens after the giver Accepts?",
        a: "You're Matched. Collect from the giver’s building gate (building/landmark only — no flat or wing). You can also arrange a send or book prepaid Borzo (no COD) if that was the giver's preference. Then: Handed over → you confirm Received → status becomes RELOVED.",
      },
      {
        q: "Can I claim something for my kids?",
        a: "Yes. Parents and guardians can give or claim items on behalf of children.",
      },
    ],
  },
  {
    title: "Handover & delivery",
    items: [
      {
        q: "Does Reloved deliver the item?",
        a: "No. Reloved matches givers and claimers. Delivery is either self-collect, the giver sending it, or an external courier (Porter/Borzo) that you open yourself. Reloved is not the courier operator.",
      },
      {
        q: "What is the 3 km rule?",
        a: "When a giver sends to the receiver, claimers must be within about 3 km of the giver’s building/landmark so short local sends stay practical. Exact flat numbers are never used for matching.",
      },
      {
        q: "Where does the rider pick up?",
        a: "Building main gate security only. Put the item in a bag and hand it to security — never share flat or wing. The same privacy rule applies at the claimer’s building for drop-off.",
      },
      {
        q: "How do I track a Borzo booking?",
        a: (
          <>
            If a Borzo order was created from your claim page, open that claim under{" "}
            <Link to="/account?tab=claiming" className="underline font-bold">Claiming</Link> for the live track link. You can also track in the Borzo app/site with the order number.
          </>
        ),
      },
    ],
  },
  {
    title: "Account & notifications",
    items: [
      {
        q: "Do I need a password?",
        a: "No. Sign in with a one-time code to your email or phone, or Continue with Google.",
      },
      {
        q: "Where do I see Accept / Decline and claim updates?",
        a: (
          <>
            Your{" "}
            <Link to="/account?tab=notifications" className="underline font-bold">Notifications</Link> tab, plus Giving and Claiming. We also email key milestones when we have an address on file.
          </>
        ),
      },
      {
        q: "I signed up with email — can I also use my phone?",
        a: "Yes. After onboarding, either verified email or phone signs you into the same account.",
      },
    ],
  },
  {
    title: "Tracking",
    items: [
      {
        q: "How do I check a drop I gave?",
        a: (
          <>
            Use your confirmation reference on{" "}
            <Link to="/track" className="underline font-bold">Track Donation</Link>, or open the gift from your profile.
          </>
        ),
      },
    ],
  },
  {
    title: "Partner Organizations",
    items: [
      {
        q: "How does an NGO partner with reloved?",
        a: (
          <>
            Fill out the{" "}
            <Link to="/partner" className="underline font-bold">Partner Application</Link>. We verify organisations before approval and usually respond within 48 hours. Partner bulk allocation is separate from individual claims.
          </>
        ),
      },
    ],
  },
  {
    title: "Trust & Safety",
    items: [
      {
        q: "Is any money exchanged for the item?",
        a: "Never for the item itself — everything on the Wall is free, not for resale. The only optional cost is an external courier fee paid to Porter/Borzo if that handover path is used.",
      },
      {
        q: "Why can’t I enter my flat number?",
        a: "Privacy. Public listings show area/neighbourhood only. Building/landmark is enough for gate handoffs. Flat and wing stay private.",
      },
      {
        q: "What if an item isn't what was promised?",
        a: "Items are offered as-is and reviewed against our Quality & Safety Standards before going live. If something feels off, contact us and we'll look into it.",
      },
    ],
  },
]
