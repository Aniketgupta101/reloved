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
        a: "Go to Drop an Item, upload a few photos of what you're giving, and our AI-assisted upload suggests the category, title, and condition for you. Confirm your pickup locality and timing, agree it's free and safe, and submit. You'll get a reference number to track it.",
      },
      {
        q: "Is there any cost to give?",
        a: "No. Everything on reloved is completely free, no listing fees, no commission, nothing.",
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
        a: "Our team reviews every submission before it goes live, typically within 24-48 hours. You'll get an email once it's decided.",
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
        q: "How many items can I claim?",
        a: "Up to three claims per calendar month, to keep the Wall fair for everyone.",
      },
      {
        q: "How long does a claim take to be reviewed?",
        a: "Our team reviews every request by hand, typically within 24-48 hours. The item is held for you while it's under review, so no one else can claim it in the meantime.",
      },
      {
        q: "What happens after my claim is approved?",
        a: "You'll get an email confirming it, and our team will reach out to coordinate handover.",
      },
      {
        q: "Can I claim something for my kids?",
        a: "Yes. Parents and guardians can give or claim items on behalf of children.",
      },
    ],
  },
  {
    title: "Account & Sign-in",
    items: [
      {
        q: "Do I need a password?",
        a: "No. Sign in with a one-time code sent to your email or phone, or use Continue with Google. No password to remember.",
      },
      {
        q: "Why do you need my phone number?",
        a: "We use it to coordinate pickups and handovers, and to reach you about a submission or claim if something needs clarifying.",
      },
      {
        q: "I signed up with my email, can I also log in with my phone?",
        a: "Yes, once you've completed onboarding, either your email or phone signs you back into the same account.",
      },
    ],
  },
  {
    title: "Tracking",
    items: [
      {
        q: "How do I check the status of what I gave?",
        a: (
          <>
            Use the reference number from your confirmation on the{" "}
            <Link to="/track" className="underline font-bold">Track Donation</Link> page.
          </>
        ),
      },
    ],
  },
  {
    title: "Partner Organizations",
    items: [
      {
        q: "How does an NGO or community group partner with reloved?",
        a: (
          <>
            Fill out the{" "}
            <Link to="/partner" className="underline font-bold">Partner Application</Link> form. We verify every
            organization before approval and respond within 48 hours.
          </>
        ),
      },
    ],
  },
  {
    title: "Trust & Safety",
    items: [
      {
        q: "Is any money exchanged, ever?",
        a: "No. Every item is 100% free. Givers confirm they're giving freely, and claimants confirm items are for personal use only, never resale.",
      },
      {
        q: "What if an item isn't what was promised?",
        a: "Items are offered as-is, and we hold every submission to our Quality & Safety Standards before it's approved. If something feels off, contact us and we'll look into it.",
      },
    ],
  },
]
