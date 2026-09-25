import { Router } from "express"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { z } from "zod"
import { collections, getDb } from "../lib/firestore"
import { isMultipart, parseMultipart } from "../lib/multipart"
import {
  sendClaimDecision,
  sendDeliveryDeliveredToClaimer,
  sendDeliveryDeliveredToGiver,
  sendDeliveryFailedNotice,
  sendDeliveryRiderDispatchedToGiver,
  sendDonationDecision,
  sendNewMessageDonorAlert,
  sendContactReplyToUser,
} from "../lib/notifications"
import {
  smsDeliveredClaimer,
  smsDeliveryFailed,
  smsRiderComing,
} from "../lib/msg91Sms"
import { findDonorProfileDoc, normalizePhoneDigits } from "../lib/donorIdentity"
import { analyzePhotosViaLightsail } from "../lib/photoAnalyze"
import { requireAdmin } from "../middleware/adminAuth"
import { getOrCreateThread, getOrCreatePeerThreadForAdmin, getOrCreateSupportThread, listMessages, postMessage, serializeThread } from "../lib/messageThreads"
import {
  callMaskingConfigured,
  callMaskingStatus,
  connectMaskedCall,
  relovedOpsDialPhone,
} from "../lib/callMasking"
import { pushUserNotification } from "../lib/userNotifications"
import { recordWallHideForDeclinedClaimer } from "../lib/wallHide"
import { acceptNextSteps, needsReceiverAddress } from "./matchFlow"
import { dayKey } from "../lib/analyticsDaily"
import { isTesterDoc, isTesterIdentity } from "../lib/analyticsTesters"
import { toPublicArea } from "../lib/geo"
import {
  createShortLink,
  ensurePresetShortLinks,
  listShortLinks,
  shortIoConfigured,
  shortIoDomain,
  shortPublicUrl,
} from "../lib/shortIo"

/** Neighbourhood label for analytics charts (collapse address variants). */
function analyticsAreaLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const raw = String(c || "").trim()
    if (!raw || /^unknown$/i.test(raw)) continue
    const area = toPublicArea(raw)
    if (area && area !== "Mumbai") return area
    // Bare city with no suburb — keep once, not every street.
    if (/^mumbai$/i.test(raw) || area === "Mumbai") return "Mumbai"
  }
  return "Unknown"
}

export const adminRouter = Router()
adminRouter.use(requireAdmin)

function serializeDoc(id: string, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { id, ...data }
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object" && typeof (v as { toDate?: () => Date }).toDate === "function") {
      out[k] = (v as { toDate: () => Date }).toDate().toISOString()
    }
  }
  return out
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  return null
}

function dayOf(value: unknown): string | null {
  const d = toDate(value)
  return d ? d.toISOString().slice(0, 10) : null
}

adminRouter.get("/metrics", async (_req, res) => {
  try {
    const db = getDb()
    const [subs, items, requests, partners, messages, threads] = await Promise.all([
      db.collection(collections.donationSubmissions).limit(500).get(),
      db.collection(collections.items).limit(500).get(),
      db.collection(collections.itemRequests).limit(500).get(),
      db.collection(collections.partnerApplications).limit(500).get(),
      db.collection(collections.contactMessages).limit(500).get(),
      db.collection(collections.messageThreads).limit(500).get(),
    ])

    const pendingSubmissions = subs.docs.filter((d) =>
      ["submitted", "pending_review", "pending", "under_review"].includes(String(d.data().status || ""))
    ).length
    const approvedInventory = items.docs.filter((d) => d.data().status === "approved").length
    const pendingClaims = requests.docs.filter((d) => d.data().status === "pending").length
    const pendingPartners = partners.docs.filter((d) =>
      ["pending", "submitted", "under_review"].includes(String(d.data().status || ""))
    ).length
    const openMessages = messages.docs.filter((d) =>
      ["new", "open", "unread"].includes(String(d.data().status || "new"))
    ).length
    const unreadChats = threads.docs.filter((d) => !!d.data().unreadForAdmin).length
    const unreadClaimChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "claim"
    ).length
    const unreadDonationChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "donation"
    ).length
    const unreadPeerChats = threads.docs.filter(
      (d) => !!d.data().unreadForAdmin && d.data().subjectType === "peer"
    ).length
    const peerChatCount = threads.docs.filter((d) => d.data().subjectType === "peer").length

    res.json({
      completedDonations: items.docs.filter((d) => d.data().publicStatus === "reloved").length,
      pendingSubmissions,
      approvedInventory,
      activePartners: partners.docs.filter((d) => d.data().status === "approved").length,
      activeAllocations: 0,
      pendingClaims,
      pendingPartners,
      openMessages,
      unreadChats,
      unreadClaimChats,
      unreadDonationChats,
      unreadPeerChats,
      peerChatCount,
      needsAttention:
        pendingSubmissions + pendingClaims + pendingPartners + openMessages + unreadChats,
    })
  } catch (err) {
    console.error("admin metrics", err)
    res.status(500).json({ error: "Failed to load metrics" })
  }
})

/**
 * Ops + product funnel for the admin Analytics page.
 * - Ops totals/daily from Firestore collections (truth for Give/Claim lifecycle)
 * - Product event counters from analyticsDaily (client beacon + server bumps)
 */
adminRouter.get("/analytics", async (req, res) => {
  try {
    const days = Math.min(60, Math.max(7, Number(req.query.days) || 14))
    const db = getDb()
    const today = new Date()
    const start = new Date(today)
    start.setUTCDate(start.getUTCDate() - (days - 1))
    start.setUTCHours(0, 0, 0, 0)
    const startKey = dayKey(start)

    const dayKeys: string[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setUTCDate(start.getUTCDate() + i)
      dayKeys.push(dayKey(d))
    }

    const [subsRaw, itemsRaw, requestsRaw, donorsRaw, waitlistRaw, contactsRaw, partnersRaw, dailySnaps] =
      await Promise.all([
        db.collection(collections.donationSubmissions).limit(1500).get(),
        db.collection(collections.items).limit(1500).get(),
        db.collection(collections.itemRequests).limit(1500).get(),
        db.collection(collections.donorProfiles).limit(1500).get(),
        db.collection(collections.waitlistSignups).limit(1500).get(),
        db.collection(collections.contactMessages).limit(500).get(),
        db.collection(collections.partnerApplications).limit(500).get(),
        Promise.all(dayKeys.map((k) => db.collection(collections.analyticsDaily).doc(k).get())),
      ])

    // Exclude internal / QA testers (aniket, relovedtotem, warrior, …) from all charts.
    const testerTargets = new Set<string>()
    const testerDonorIds = new Set<string>()
    for (const doc of donorsRaw.docs) {
      const data = doc.data()
      if (!isTesterDoc(data)) continue
      testerDonorIds.add(doc.id)
      for (const key of [data.target, data.email, data.phone, data.username]) {
        const k = String(key || "")
          .trim()
          .toLowerCase()
        if (k) testerTargets.add(k)
      }
      const phone = normalizePhoneDigits(String(data.phone || ""))
      if (phone) testerTargets.add(phone)
    }

    const isExcludedTarget = (v: unknown) => {
      const k = String(v || "")
        .trim()
        .toLowerCase()
      if (!k) return false
      if (testerTargets.has(k)) return true
      const phone = normalizePhoneDigits(k)
      if (phone && testerTargets.has(phone)) return true
      return isTesterIdentity(v)
    }

    const donors = donorsRaw.docs.filter((d) => !isTesterDoc(d.data()))
    const waitlist = waitlistRaw.docs.filter((d) => !isTesterDoc(d.data()))
    const contacts = contactsRaw.docs.filter((d) => !isTesterDoc(d.data()))
    const partners = partnersRaw.docs.filter((d) => !isTesterDoc(d.data()))

    const subs = subsRaw.docs.filter((d) => {
      const data = d.data()
      if (isTesterDoc(data)) return false
      if (isExcludedTarget(data.donorTarget || data.email || data.phone)) return false
      if (data.donorId && testerDonorIds.has(String(data.donorId))) return false
      return true
    })

    const items = itemsRaw.docs.filter((d) => {
      const data = d.data()
      if (isTesterDoc(data)) return false
      if (isExcludedTarget(data.donorTarget || data.donorEmail || data.email || data.phone)) return false
      if (data.donorId && testerDonorIds.has(String(data.donorId))) return false
      return true
    })
    const keptItemIds = new Set(items.map((d) => d.id))

    const requests = requestsRaw.docs.filter((d) => {
      const data = d.data()
      if (isTesterDoc(data)) return false
      if (
        isExcludedTarget(
          data.requesterTarget || data.requesterEmail || data.requesterPhone || data.email || data.phone,
        )
      ) {
        return false
      }
      // Drop claims on tester-owned items even if claimer is real.
      const itemId = String(data.itemId || "")
      if (itemId && !keptItemIds.has(itemId)) return false
      if (isExcludedTarget(data.donorTarget)) return false
      return true
    })

    const emptyDay = () => ({
      gives: 0,
      claims: 0,
      accounts: 0,
      waitlist: 0,
      contacts: 0,
      partners: 0,
      product: {} as Record<string, number>,
    })
    const byDay: Record<string, ReturnType<typeof emptyDay>> = {}
    for (const k of dayKeys) byDay[k] = emptyDay()

    const bumpDay = (key: string | null, field: keyof Omit<ReturnType<typeof emptyDay>, "product">) => {
      if (!key || !byDay[key]) return
      byDay[key][field] += 1
    }

    for (const doc of subs) {
      bumpDay(dayOf(doc.data().submittedAt || doc.data().createdAt), "gives")
    }
    for (const doc of requests) {
      bumpDay(dayOf(doc.data().createdAt), "claims")
    }
    for (const doc of donors) {
      bumpDay(dayOf(doc.data().createdAt || doc.data().onboardedAt), "accounts")
    }
    for (const doc of waitlist) {
      bumpDay(dayOf(doc.data().createdAt), "waitlist")
    }
    for (const doc of contacts) {
      bumpDay(dayOf(doc.data().createdAt), "contacts")
    }
    for (const doc of partners) {
      bumpDay(dayOf(doc.data().createdAt), "partners")
    }

    const productTotals: Record<string, number> = {}
    for (let i = 0; i < dayKeys.length; i++) {
      const snap = dailySnaps[i]
      if (!snap.exists) continue
      const data = snap.data() || {}
      const product: Record<string, number> = {}
      for (const [field, value] of Object.entries(data)) {
        if (!field.startsWith("e_") || typeof value !== "number") continue
        const event = field.slice(2)
        product[event] = value
        productTotals[event] = (productTotals[event] || 0) + value
      }
      byDay[dayKeys[i]].product = product
    }

    const itemStatus = {
      available: 0,
      being_matched: 0,
      claimed: 0,
      reloved: 0,
      other: 0,
    }
    let itemsApproved = 0
    let itemsVisible = 0

    const bumpCount = (map: Record<string, number>, key: string) => {
      const k = (key || "unknown").trim() || "unknown"
      map[k] = (map[k] || 0) + 1
    }
    const topN = (map: Record<string, number>, n = 8) =>
      Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([label, count]) => ({ label, count }))

    const supplyByCategory: Record<string, number> = {}
    const supplyByGender: Record<string, number> = {}
    const demandByCategory: Record<string, number> = {}
    const demandByGender: Record<string, number> = {}
    const areaGives: Record<string, number> = {}
    const areaClaims: Record<string, number> = {}
    const stuckAvailable: Array<{ id: string; title: string; days: number; area: string; category: string }> = []
    const stuckMatching: Array<{ id: string; title: string; days: number; area: string; category: string }> = []
    const nowMs = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000

    // itemId → meta for claim demand joins
    const itemMeta = new Map<
      string,
      { category: string; gender: string; area: string; createdAt: Date | null; publicStatus: string; title: string }
    >()

    for (const doc of items) {
      const data = doc.data()
      const s = String(data.publicStatus || "")
      if (s in itemStatus) (itemStatus as Record<string, number>)[s] += 1
      else itemStatus.other += 1
      if (data.status === "approved") itemsApproved += 1
      if (data.publicVisibility === true) itemsVisible += 1

      const category = String(data.category || "Unknown")
      const gender = String(data.gender || "unisex")
      const area = analyticsAreaLabel(data.publicArea, data.locality, data.pickupAddress)
      const created = toDate(data.createdAt || data.submittedAt)
      bumpCount(supplyByCategory, category)
      bumpCount(supplyByGender, gender)
      bumpCount(areaGives, area)

      itemMeta.set(doc.id, {
        category,
        gender,
        area,
        createdAt: created,
        publicStatus: s,
        title: String(data.title || "Item"),
      })

      if (created && (s === "available" || s === "being_matched")) {
        const ageDays = Math.floor((nowMs - created.getTime()) / DAY_MS)
        const row = {
          id: doc.id,
          title: String(data.title || "Item").slice(0, 60),
          days: ageDays,
          area,
          category,
        }
        if (s === "available" && ageDays >= 7) stuckAvailable.push(row)
        if (s === "being_matched" && ageDays >= 3) stuckMatching.push(row)
      }
    }
    stuckAvailable.sort((a, b) => b.days - a.days)
    stuckMatching.sort((a, b) => b.days - a.days)

    const claimStatus = {
      pending: 0,
      accepted: 0,
      matched: 0,
      rejected: 0,
      withdrawn: 0,
      completed: 0,
      other: 0,
    }
    const matchHours: number[] = []
    const reloveHours: number[] = []
    const giverTargets = new Set<string>()
    const claimerTargets = new Set<string>()
    let softDeclines = 0

    for (const doc of requests) {
      const data = doc.data()
      const s = String(data.status || "").toLowerCase()
      if (s in claimStatus) (claimStatus as Record<string, number>)[s] += 1
      else claimStatus.other += 1

      if (s === "rejected" && data.softDecline === true) softDeclines += 1

      const itemId = String(data.itemId || "")
      const meta = itemMeta.get(itemId)
      const category = String(data.itemCategory || meta?.category || "Unknown")
      const gender = String(data.itemGender || meta?.gender || "unisex")
      const area = analyticsAreaLabel(
        data.pickupLocality,
        data.requesterAddress,
        data.address,
        meta?.area,
      )
      bumpCount(demandByCategory, category)
      bumpCount(demandByGender, gender)
      bumpCount(areaClaims, area)

      const requester = String(data.requesterTarget || data.requesterPhone || data.requesterEmail || "").trim()
      if (requester) claimerTargets.add(requester.toLowerCase())

      const created = toDate(data.createdAt)
      const reviewed = toDate(data.reviewedAt || (s === "approved" || s === "accepted" || s === "matched" ? data.updatedAt : null))
      if (created && reviewed && ["approved", "accepted", "matched", "completed"].includes(s)) {
        const h = (reviewed.getTime() - created.getTime()) / 3600000
        if (h >= 0 && h < 24 * 90) matchHours.push(h)
      }
      const stage = String(data.handoverStage || "")
      const doneAt = toDate(
        data.receivedAt ||
          data.relovedAt ||
          (stage === "received" || s === "completed" || data.publicStatus === "reloved"
            ? data.updatedAt
            : null),
      )
      if (created && doneAt && (stage === "received" || s === "completed")) {
        const h = (doneAt.getTime() - created.getTime()) / 3600000
        if (h >= 0 && h < 24 * 120) reloveHours.push(h)
      }
    }

    for (const doc of subs) {
      const t = String(doc.data().donorTarget || doc.data().email || doc.data().phone || "").trim()
      if (t) giverTargets.add(t.toLowerCase())
    }

    const bothRoles = [...giverTargets].filter((t) => claimerTargets.has(t)).length
    const giversOnly = Math.max(0, giverTargets.size - bothRoles)
    const claimersOnly = Math.max(0, claimerTargets.size - bothRoles)

    const median = (arr: number[]): number | null => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
    const hoursToLabel = (h: number | null): string => {
      if (h == null) return "—"
      if (h < 24) return `${Math.round(h)}h`
      return `${(h / 24).toFixed(1)}d`
    }

    // Supply vs demand per category
    const categoryKeys = new Set([...Object.keys(supplyByCategory), ...Object.keys(demandByCategory)])
    const supplyDemand = [...categoryKeys]
      .map((label) => ({
        label,
        given: supplyByCategory[label] || 0,
        claimed: demandByCategory[label] || 0,
        gap: (supplyByCategory[label] || 0) - (demandByCategory[label] || 0),
      }))
      .sort((a, b) => b.given + b.claimed - (a.given + a.claimed))

    let accountsOnboarded = 0
    for (const doc of donors) {
      if (doc.data().onboardedAt) accountsOnboarded += 1
    }

    const subStatus: Record<string, number> = {}
    for (const doc of subs) {
      const s = String(doc.data().status || "unknown")
      subStatus[s] = (subStatus[s] || 0) + 1
    }

    const dbGives = subs.length
    const dbClaims = requests.length
    const dbAccounts = donors.length
    const dbOnWall =
      itemStatus.available + itemStatus.being_matched + itemStatus.claimed + itemStatus.reloved
    const dbMatched = claimStatus.matched + claimStatus.accepted + claimStatus.completed
    const dbReloved = itemStatus.reloved

    const pick = (product: number, db: number) => Math.max(product || 0, db || 0)

    const giveFunnel = {
      cta_drop: pick(productTotals.cta_drop_item_clicked || 0, dbGives),
      started: pick(productTotals.donation_started || 0, dbGives),
      submitted: pick(productTotals.donation_submitted || 0, dbGives),
      completed_success_page: pick(productTotals.donation_completed || 0, dbGives),
      failed: productTotals.donation_failed || 0,
      on_wall: dbOnWall,
      reloved: dbReloved,
    }

    const claimFunnel = {
      cta_claim_or_explore: pick(
        (productTotals.cta_claim_item_clicked || 0) + (productTotals.cta_explore_wall_clicked || 0),
        dbClaims,
      ),
      item_card: pick(productTotals.item_card_clicked || 0, dbClaims),
      item_viewed: pick(productTotals.item_viewed || 0, dbClaims),
      claim_started: pick(productTotals.claim_started || 0, dbClaims),
      claim_submitted: pick(productTotals.claim_submitted || 0, dbClaims),
      claim_failed: productTotals.claim_failed || 0,
      pending: claimStatus.pending,
      matched: dbMatched,
      reloved: dbReloved,
    }

    const accountFunnel = {
      login_started: pick(productTotals.login_started || 0, dbAccounts),
      login_completed: pick(productTotals.login_completed || 0, dbAccounts),
      onboarding_completed: pick(productTotals.onboarding_completed || 0, accountsOnboarded),
      accounts: dbAccounts,
      onboarded: accountsOnboarded,
    }

    const periodTotals = {
      gives: dayKeys.reduce((n, k) => n + (byDay[k]?.gives || 0), 0),
      claims: dayKeys.reduce((n, k) => n + (byDay[k]?.claims || 0), 0),
      accounts: dayKeys.reduce((n, k) => n + (byDay[k]?.accounts || 0), 0),
      waitlist: dayKeys.reduce((n, k) => n + (byDay[k]?.waitlist || 0), 0),
      contacts: dayKeys.reduce((n, k) => n + (byDay[k]?.contacts || 0), 0),
      partners: dayKeys.reduce((n, k) => n + (byDay[k]?.partners || 0), 0),
    }

    const shortLinks = await listShortLinks(40).catch(() => [])

    const insights = {
      supplyDemand,
      byGender: {
        supply: topN(supplyByGender, 6),
        demand: topN(demandByGender, 6),
      },
      topAreas: {
        gives: topN(areaGives, 8),
        claims: topN(areaClaims, 8),
      },
      speed: {
        medianMatchHours: median(matchHours),
        medianMatchLabel: hoursToLabel(median(matchHours)),
        matchSampleSize: matchHours.length,
        medianReloveHours: median(reloveHours),
        medianReloveLabel: hoursToLabel(median(reloveHours)),
        reloveSampleSize: reloveHours.length,
      },
      stuck: {
        availableOver7d: stuckAvailable.slice(0, 12),
        matchingOver3d: stuckMatching.slice(0, 12),
        availableCount: stuckAvailable.length,
        matchingCount: stuckMatching.length,
      },
      people: {
        givers: giverTargets.size,
        claimers: claimerTargets.size,
        both: bothRoles,
        giversOnly,
        claimersOnly,
      },
      declines: {
        rejected: claimStatus.rejected,
        softDeclines,
        withdrawn: claimStatus.withdrawn,
        acceptRate: dbClaims > 0 ? Math.round((dbMatched / dbClaims) * 100) : null,
      },
    }

    res.json({
      days,
      range: { from: startKey, to: dayKey(today) },
      links: {
        goHome: shortPublicUrl("go"),
        goWall: shortPublicUrl("wall"),
        goAccount: shortPublicUrl("account"),
        goGive: shortPublicUrl("give"),
      },
      shortIo: {
        configured: shortIoConfigured(),
        domain: shortIoDomain(),
        links: shortLinks,
      },
      totals: {
        gives: dbGives,
        claims: dbClaims,
        accounts: dbAccounts,
        onboarded: accountsOnboarded,
        waitlist: waitlist.length,
        contacts: contacts.length,
        partners: partners.length,
        items: items.length,
        itemsVisible,
        itemsApproved,
        onWall: dbOnWall,
        reloved: dbReloved,
      },
      meta: { excludedTesters: true },
      periodTotals,
      itemStatus,
      claimStatus,
      submissionStatus: subStatus,
      giveFunnel,
      claimFunnel,
      accountFunnel,
      insights,
      productTotals,
      series: dayKeys.map((day) => ({ day, ...byDay[day] })),
    })
  } catch (err) {
    console.error("admin analytics", err)
    res.status(500).json({ error: "Failed to load analytics" })
  }
})

/** Short.io branded links on go.reloved.digital */
adminRouter.get("/short-links", async (_req, res) => {
  try {
    if (!shortIoConfigured()) {
      res.json({ configured: false, domain: shortIoDomain(), links: [] })
      return
    }
    const links = await listShortLinks(100)
    res.json({ configured: true, domain: shortIoDomain(), links })
  } catch (err) {
    console.error("admin short-links", err)
    res.status(500).json({ error: "Failed to load short links" })
  }
})

adminRouter.post("/short-links", async (req, res) => {
  try {
    if (!shortIoConfigured()) {
      res.status(503).json({ error: "Short.io is not configured" })
      return
    }
    const originalURL = String(req.body?.originalURL || "").trim()
    const path = req.body?.path != null ? String(req.body.path).trim() : undefined
    const title = req.body?.title != null ? String(req.body.title).trim() : undefined
    if (!originalURL) {
      res.status(400).json({ error: "originalURL required" })
      return
    }
    const link = await createShortLink({ originalURL, path, title, tags: ["reloved", "admin"] })
    if (!link) {
      res.status(502).json({ error: "Short.io create failed" })
      return
    }
    res.status(201).json({ link })
  } catch (err) {
    console.error("admin short-links create", err)
    res.status(500).json({ error: "Failed to create short link" })
  }
})

adminRouter.post("/short-links/ensure-presets", async (_req, res) => {
  try {
    if (!shortIoConfigured()) {
      res.status(503).json({ error: "Short.io is not configured" })
      return
    }
    const links = await ensurePresetShortLinks()
    res.json({ ok: true, count: links.length, links })
  } catch (err) {
    console.error("admin short-links presets", err)
    res.status(500).json({ error: "Failed to ensure preset links" })
  }
})

/** Borzo Business API readiness (token present + optional live ping). */
adminRouter.get("/borzo/status", async (_req, res) => {
  try {
    const { borzoConfigured, borzoApiBase, borzoOpsPhone, borzoGetClient } = await import("../lib/borzo")
    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const configured = borzoConfigured()
    const base = borzoApiBase()
    const isProduction = !base.includes("robotapitest")
    const opsPhone = borzoOpsPhone()
    const subsidy = await getBorzoSubsidySnapshot(getDb())
    const subsidyCopy = subsidyUserCopy(subsidy)
    if (!configured) {
      res.json({
        configured: false,
        mode: "manual_open_borzo",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        message: "No BORZO_AUTH_TOKEN configured. Set BORZO_AUTH_TOKEN in functions .env to enable 1-click booking.",
      })
      return
    }
    try {
      const client = await borzoGetClient()
      res.json({
        configured: true,
        mode: "api",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        client,
      })
    } catch (err) {
      res.status(502).json({
        configured: true,
        mode: "api",
        apiBase: base,
        isProduction,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy,
        error: err instanceof Error ? err.message : "Borzo ping failed",
      })
    }
  } catch (err) {
    console.error("admin borzo status", err)
    res.status(500).json({ error: "Failed to check Borzo status" })
  }
})

adminRouter.get("/submissions", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const db = getDb()
    const snap = await db.collection(collections.donationSubmissions).limit(200).get()
    const submissions = []
    for (const doc of snap.docs) {
      const data = doc.data()
      const st = String(data.status || "")
      // Donor-removed listings — don't clutter admin Give queue.
      if (st === "withdrawn") continue
      // UI "submitted" covers pending_review / pending / submitted variants.
      if (status === "submitted") {
        if (!["submitted", "pending_review", "pending"].includes(st)) continue
      } else if (status && st !== status) {
        continue
      }
      const [itemsSnap, threadSnap] = await Promise.all([
        db.collection(collections.items).where("submissionId", "==", doc.id).limit(50).get(),
        db.collection(collections.messageThreads).doc(`donation_${doc.id}`).get(),
      ])
      submissions.push({
        ...serializeDoc(doc.id, data),
        unreadChat: !!(threadSnap.exists && threadSnap.data()?.unreadForAdmin),
        items: itemsSnap.docs.map((i) => serializeDoc(i.id, i.data())),
      })
    }
    submissions.sort((a: any, b: any) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
    res.json({ submissions })
  } catch (err) {
    console.error("admin submissions", err)
    res.status(500).json({ error: "Failed to load submissions" })
  }
})

adminRouter.patch("/submissions/:id", async (req, res) => {
  try {
    const { status, internalNotes } = req.body as { status?: string; internalNotes?: string }
    const db = getDb()
    const ref = db.collection(collections.donationSubmissions).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const beforeData = before.data()!
    await ref.set(
      {
        ...(status ? { status } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const updated = await ref.get()

    // Wall of Kindness: publicVisibility=true + publicStatus in available | being_matched | claimed.
    // Reloved items stay visible for Wall of Love (status=reloved).
    // Donation create leaves visibility false until admin approves — publish here.
    if (status && ["approved", "rejected", "under_review"].includes(status)) {
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", req.params.id)
        .limit(20)
        .get()
      const batch = db.batch()
      for (const itemDoc of itemsSnap.docs) {
        if (status === "approved") {
          batch.set(
            itemDoc.ref,
            {
              status: "approved",
              publicStatus: "available",
              publicVisibility: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        } else if (status === "rejected") {
          batch.set(
            itemDoc.ref,
            {
              status: "rejected",
              publicVisibility: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        } else {
          batch.set(
            itemDoc.ref,
            {
              status: "under_review",
              publicVisibility: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        }
      }
      if (!itemsSnap.empty) await batch.commit()
    }

    // Close the loop for the donor once a reviewer actually decides — only on
    // the transition into approved/rejected, not on unrelated re-saves.
    if (status && ["approved", "rejected"].includes(status) && beforeData.status !== status) {
      let donorEmail = String(beforeData.email || "")
        .trim()
        .toLowerCase()
      if (!donorEmail && beforeData.donorTarget) {
        const profileDoc = await findDonorProfileDoc(db, String(beforeData.donorTarget), beforeData.phone)
        donorEmail = String(profileDoc?.data()?.email || "")
          .trim()
          .toLowerCase()
      }
      if (donorEmail) {
        const itemsSnap = await db
          .collection(collections.items)
          .where("submissionId", "==", req.params.id)
          .limit(20)
          .get()
        const itemTitle = itemsSnap.docs[0]?.data()?.title || "your donation"
        await sendDonationDecision(donorEmail, {
          firstName: beforeData.donorFirstName || "there",
          itemTitle,
          approved: status === "approved",
        }).catch((err) => console.error("Failed to send donation decision email:", err))
      } else {
        console.warn("donation decision email skipped — no email on submission/profile", req.params.id)
      }
    }

    res.json({ submission: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch submission", err)
    res.status(500).json({ error: "Failed to update submission" })
  }
})
adminRouter.get("/items", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.items).limit(300).get()
    let items = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) items = items.filter((i: any) => i.status === status)
    items.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ items })
  } catch (err) {
    console.error("admin items", err)
    res.status(500).json({ error: "Failed to load items" })
  }
})

/**
 * Ops: move all items (+ linked donationSubmissions) from one donor email
 * to another. Used when reassigning batch drops between tester accounts.
 * Body: { fromEmail, toEmail, donorRecognition? }
 */
adminRouter.post("/items/reassign-owner", async (req, res) => {
  try {
    const fromEmail = String(req.body?.fromEmail || "")
      .trim()
      .toLowerCase()
    const toEmail = String(req.body?.toEmail || "")
      .trim()
      .toLowerCase()
    const donorRecognition = String(req.body?.donorRecognition || "").trim() || null
    if (!fromEmail.includes("@") || !toEmail.includes("@")) {
      res.status(400).json({ error: "fromEmail and toEmail are required" })
      return
    }
    const db = getDb()
    const snap = await db.collection(collections.items).limit(500).get()
    const matches = snap.docs.filter((d) => {
      const data = d.data()
      const email = String(data.donorEmail || data.donorTarget || "")
        .trim()
        .toLowerCase()
      return email === fromEmail
    })
    const submissionIds = new Set<string>()
    let itemsUpdated = 0
    for (const doc of matches) {
      const sid = String(doc.data().submissionId || "").trim()
      if (sid) submissionIds.add(sid)
      await doc.ref.set(
        {
          donorEmail: toEmail,
          donorTarget: toEmail,
          ...(donorRecognition ? { donorRecognition } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      itemsUpdated++
    }
    let submissionsUpdated = 0
    for (const sid of submissionIds) {
      const ref = db.collection(collections.donationSubmissions).doc(sid)
      const exists = await ref.get()
      if (!exists.exists) continue
      await ref.set(
        {
          email: toEmail,
          donorTarget: toEmail,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      submissionsUpdated++
    }
    res.json({
      ok: true,
      fromEmail,
      toEmail,
      itemsMatched: matches.length,
      itemsUpdated,
      submissionsUpdated,
    })
  } catch (err) {
    console.error("admin reassign-owner", err)
    res.status(500).json({ error: "Failed to reassign owner" })
  }
})

/**
 * Ops: mint a donor session for an email/phone after stamping a verified OTP.
 * Body: { target: string }
 */
adminRouter.post("/ops/donor-session", async (req, res) => {
  try {
    const raw = String(req.body?.target || "").trim()
    const target = raw.includes("@") ? raw.toLowerCase() : raw.replace(/\D/g, "").slice(-10)
    if (target.length < 5) {
      res.status(400).json({ error: "target required" })
      return
    }
    const db = getDb()
    const channel = target.includes("@") ? "email" : "sms"
    await db.collection(collections.otpCodes).add({
      channel,
      target,
      codeHash: "ops-bypass",
      attempts: 0,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      verifiedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })
    const existing = await findDonorProfileDoc(db, target)
    const sessionTarget = existing?.data()?.target ? String(existing.data()!.target) : target
    const { signSessionToken } = await import("../lib/auth")
    const epoch = Number(existing?.data()?.sessionEpoch || 0)
    const token = await signSessionToken({
      uid: sessionTarget,
      email: sessionTarget.includes("@") ? sessionTarget : target,
      role: "donor",
      epoch: Number.isFinite(epoch) ? epoch : 0,
    })
    res.json({ ok: true, token, target: sessionTarget })
  } catch (err) {
    console.error("admin ops donor-session", err)
    res.status(500).json({ error: "Failed to mint donor session" })
  }
})

adminRouter.patch("/items/:id", async (req, res) => {
  try {
    const allowed = [
      "status",
      "publicStatus",
      "publicVisibility",
      "approvedQuantity",
      "rejectionReason",
      "title",
      "description",
      "category",
      "condition",
      "size",
      "quantity",
      "images",
      "brand",
      "gender",
    ] as const
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key]
    }
    const ref = getDb().collection(collections.items).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set(patch, { merge: true })
    const updated = await ref.get()
    res.json({ item: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item", err)
    res.status(500).json({ error: "Failed to update item" })
  }
})

adminRouter.get("/item-requests", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const db = getDb()
    const snap = await db.collection(collections.itemRequests).limit(200).get()
    const threadIds = snap.docs.map((d) => `claim_${d.id}`)
    const unreadBySubject = new Map<string, boolean>()
    // Batch get in chunks of 10 (Firestore getAll limit courtesy)
    for (let i = 0; i < threadIds.length; i += 10) {
      const chunk = threadIds.slice(i, i + 10)
      const refs = chunk.map((id) => db.collection(collections.messageThreads).doc(id))
      const docs = await db.getAll(...refs)
      for (const t of docs) {
        if (t.exists && t.data()?.unreadForAdmin) unreadBySubject.set(t.id.replace(/^claim_/, ""), true)
      }
    }
    let requests = snap.docs.map((d) => {
      const data = d.data()
      return {
        ...serializeDoc(d.id, data),
        unreadChat: !!unreadBySubject.get(d.id),
        giverLogistics: data.giverLogistics || null,
        handoverStage: data.handoverStage || null,
        pickupLocality: data.pickupLocality || null,
        item: {
          id: data.itemId,
          slug: data.itemSlug,
          title: data.itemTitle,
          category: data.itemCategory || null,
          images: data.itemImages || [],
        },
      }
    })
    if (status) requests = requests.filter((r: any) => r.status === status)
    requests.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ requests })
  } catch (err) {
    console.error("admin item-requests", err)
    res.status(500).json({ error: "Failed to load item requests" })
  }
})

/**
 * Ops: reset weekly claim quota for one or more emails.
 * Clears matching claims (any status) and puts linked items back on the Wall.
 */
adminRouter.post("/claim-limit/reset", async (req, res) => {
  try {
    const { normalizeEmail, normalizePhoneDigits, findDonorProfileDoc } = await import("../lib/donorIdentity")
    const raw = req.body?.emails ?? req.body?.email ?? []
    const emails = (Array.isArray(raw) ? raw : [raw])
      .map((e: unknown) => normalizeEmail(String(e || "")))
      .filter(Boolean) as string[]
    if (!emails.length) {
      res.status(400).json({ error: "Provide emails: string[]" })
      return
    }

    const db = getDb()
    const identityKeys = new Set<string>(emails)
    for (const email of emails) {
      const profile = await findDonorProfileDoc(db, email)
      const data = profile?.data()
      if (!data) continue
      const target = String(data.target || "").trim().toLowerCase()
      const profileEmail = normalizeEmail(data.email)
      const phone = normalizePhoneDigits(data.phone)
      if (target) identityKeys.add(target)
      if (profileEmail) identityKeys.add(profileEmail)
      if (phone) identityKeys.add(phone)
    }

    const snap = await db.collection(collections.itemRequests).limit(500).get()
    let deleted = 0
    const itemIds = new Set<string>()
    const matched: Array<{ id: string; target: string; status: string; title: string }> = []

    for (const doc of snap.docs) {
      const data = doc.data()
      const target = String(data.requesterTarget || "").trim().toLowerCase()
      const reqEmail = normalizeEmail(data.requesterEmail || data.email)
      const reqPhone = normalizePhoneDigits(data.requesterPhone)
      const hit =
        identityKeys.has(target) ||
        (reqEmail && identityKeys.has(reqEmail)) ||
        (reqPhone && identityKeys.has(reqPhone))
      if (!hit) continue
      matched.push({
        id: doc.id,
        target: target || reqEmail || reqPhone || "",
        status: String(data.status || ""),
        title: String(data.itemTitle || ""),
      })
      if (data.itemId) itemIds.add(String(data.itemId))
      await doc.ref.delete()
      deleted++
    }

    let itemsReset = 0
    for (const itemId of itemIds) {
      const ref = db.collection(collections.items).doc(itemId)
      const item = await ref.get()
      if (!item.exists) continue
      const status = String(item.data()?.publicStatus || "")
      if (["being_matched", "claimed", "reloved"].includes(status)) {
        await ref.set(
          {
            publicStatus: "available",
            publicVisibility: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        itemsReset++
      }
    }

    res.json({
      ok: true,
      emails,
      identityKeys: [...identityKeys],
      deleted,
      itemsReset,
      matched,
      message: `Claim limit refreshed for ${emails.length} email(s). Deleted ${deleted} claim(s).`,
    })
  } catch (err: any) {
    console.error("admin claim-limit reset", err)
    res.status(500).json({ error: err?.message || "Failed to reset claim limits" })
  }
})

/** Orders board — schedule-agreed claims ready for manual Porter / courier booking. */
adminRouter.get("/orders", async (_req, res) => {
  try {
    const db = getDb()
    const snap = await db.collection(collections.itemRequests).where("status", "==", "approved").limit(200).get()
    const orders = []
    for (const d of snap.docs) {
      const data = d.data()
      const stage = String(data.handoverStage || "")
      const ops = String(data.opsBookingStatus || "")
      const include =
        stage === "schedule_agreed" ||
        stage === "awaiting_handover" ||
        stage === "handed_over" ||
        stage === "received" ||
        ops === "ready_to_book" ||
        ops === "booked" ||
        ops === "delivered"
      if (!include) continue
      if (String(data.giverLogistics || "") !== "porter_arranged" && !data.agreedSlotAt && !data.proposedSlotAt) {
        // Only manual-schedule style orders on this board.
        if (!ops || ops === "pending_schedule") continue
      }
      let giverPhone: string | null = null
      let giverName: string | null = null
      try {
        const itemSnap = await db.collection(collections.items).doc(String(data.itemId)).get()
        const item = itemSnap.data() || {}
        const submissionId = String(item.submissionId || "")
        if (submissionId) {
          const sub = await db.collection(collections.donationSubmissions).doc(submissionId).get()
          if (sub.exists) {
            const s = sub.data()!
            giverPhone = s.phone ? String(s.phone) : null
            giverName = s.donorFirstName ? String(s.donorFirstName) : null
            if (!giverPhone && s.donorTarget) {
              const profile = await findDonorProfileDoc(db, String(s.donorTarget))
              giverPhone = profile?.data()?.phone ? String(profile.data()!.phone) : null
            }
          }
        }
      } catch {
        /* non-fatal */
      }
      orders.push({
        id: d.id,
        itemTitle: data.itemTitle || null,
        itemImages: data.itemImages || [],
        handoverStage: data.handoverStage || null,
        opsBookingStatus: data.opsBookingStatus || (stage === "schedule_agreed" ? "ready_to_book" : null),
        opsNote: data.opsNote || null,
        opsBookedAt: data.opsBookedAt?.toDate?.()?.toISOString?.() || null,
        agreedSlotAt: data.agreedSlotAt ? String(data.agreedSlotAt) : null,
        proposedSlotAt: data.proposedSlotAt ? String(data.proposedSlotAt) : null,
        pickupLocality: data.pickupLocality || null,
        requesterName: data.requesterName || null,
        requesterPhone: data.requesterPhone || null,
        requesterAddress: data.requesterAddress || null,
        giverName,
        giverPhone,
        pickupAddressConfirmedByGiver: Boolean(data.pickupAddressConfirmedByGiver),
        dropAddressConfirmedByClaimer: Boolean(data.dropAddressConfirmedByClaimer),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      })
    }
    orders.sort((a, b) => String(b.agreedSlotAt || b.createdAt || "").localeCompare(String(a.agreedSlotAt || a.createdAt || "")))
    res.json({ orders })
  } catch (err) {
    console.error("admin orders", err)
    res.status(500).json({ error: "Failed to load orders" })
  }
})

const adminOrderPatchSchema = z.object({
  opsStatus: z.enum(["booked", "delivered", "ready_to_book"]),
  opsNote: z.string().max(500).optional(),
})

adminRouter.patch("/orders/:id", async (req, res) => {
  const parsed = adminOrderPatchSchema.safeParse(req.body || {})
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const patch: Record<string, unknown> = {
      opsBookingStatus: parsed.data.opsStatus,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (parsed.data.opsNote != null) patch.opsNote = parsed.data.opsNote
    if (parsed.data.opsStatus === "booked") {
      patch.opsBookedAt = FieldValue.serverTimestamp()
      patch.handoverStage = "awaiting_handover"
    }
    if (parsed.data.opsStatus === "delivered") {
      patch.handoverStage = "handed_over"
    }
    await ref.set(patch, { merge: true })
    const updated = await ref.get()
    res.json({ ok: true, order: serializeDoc(updated.id, updated.data() || {}) })
  } catch (err) {
    console.error("admin order patch", err)
    res.status(500).json({ error: "Couldn't update order" })
  }
})

adminRouter.patch("/item-requests/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = before.data()!
    const accept = status === "approved"
    const logistics = String(data.giverLogistics || "")
    const handoverStage = accept
      ? logistics === "porter_arranged"
        ? "awaiting_address_confirm"
        : needsReceiverAddress(logistics)
          ? "awaiting_delivery_address"
          : "awaiting_handover"
      : "pending_giver"

    await ref.set(
      {
        status,
        handoverStage,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(accept && logistics === "porter_arranged"
          ? {
              pickupAddressConfirmedByGiver: false,
              dropAddressConfirmedByClaimer: false,
              opsBookingStatus: "pending_schedule",
            }
          : {}),
      },
      { merge: true }
    )
    await db
      .collection(collections.items)
      .doc(data.itemId)
      .set(
        {
          publicStatus: accept ? "claimed" : "available",
          publicVisibility: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

    if (!accept) {
      await recordWallHideForDeclinedClaimer(db, {
        itemId: String(data.itemId || ""),
        itemSlug: data.itemSlug != null ? String(data.itemSlug) : null,
        itemTitle: String(data.itemTitle || ""),
        claimId: ref.id,
        claimerTarget: String(data.requesterTarget || ""),
        claimerPhone: data.requesterPhone != null ? String(data.requesterPhone) : null,
        claimerName: data.requesterName != null ? String(data.requesterName) : null,
        reason: "ops_decline",
      }).catch((err) => console.error("admin decline wall hide", err))
    }

    const updated = await ref.get()

    // requesterTarget is whatever identity they logged in with — resolve to
    // an email either directly or via their linked profile (see donor.ts).
    const requesterTarget = String(data.requesterTarget || "")
    let requesterEmail = requesterTarget.includes("@") ? requesterTarget : null
    if (!requesterEmail) {
      const profileDoc = await findDonorProfileDoc(db, requesterTarget)
      requesterEmail = (profileDoc?.data()?.email as string | undefined) || null
    }
    if (requesterEmail) {
      await sendClaimDecision(requesterEmail, {
        requesterName: data.requesterName,
        itemTitle: data.itemTitle,
        approved: accept,
        nextSteps: accept ? acceptNextSteps(logistics) : undefined,
        softDecline: !accept,
      }).catch((err) => console.error("Failed to send claim decision email:", err))
    }

    await pushUserNotification({
      donorTarget: requesterTarget,
      role: "claimer",
      type: accept ? "claim_accepted" : "claim_declined",
      title: accept ? "Yayyy! 🎉" : "Couldn't match this time",
      body: accept
        ? `You're matched for ${data.itemTitle}. Open the claim to share handover details.`
        : "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby.",
      href: `/account/claims/${ref.id}`,
      itemTitle: String(data.itemTitle || ""),
      requestId: ref.id,
    }).catch((err) => console.error("admin claim decision in-app", err))

    res.json({ request: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch item-request", err)
    res.status(500).json({ error: "Failed to update item request" })
  }
})

async function resolveClaimerEmail(db: FirebaseFirestore.Firestore, requesterTarget: string) {
  if (requesterTarget.includes("@")) return requesterTarget
  const profileDoc = await findDonorProfileDoc(db, requesterTarget)
  return (profileDoc?.data()?.email as string | undefined) || null
}

async function resolveGiverEmailForItem(db: FirebaseFirestore.Firestore, itemId: string) {
  const itemSnap = await db.collection(collections.items).doc(itemId).get()
  const submissionId = String(itemSnap.data()?.submissionId || "")
  if (!submissionId) return { email: null, firstName: "there" }
  const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
  const sub = subSnap.data()
  let email = String(sub?.email || "").trim().toLowerCase() || null
  let firstName = String(sub?.donorFirstName || "").trim() || "there"
  if (!email && sub?.donorTarget) {
    const profileDoc = await findDonorProfileDoc(db, String(sub.donorTarget))
    email = (profileDoc?.data()?.email as string | undefined) || null
    if (firstName === "there") firstName = String(profileDoc?.data()?.name || "").trim() || "there"
  }
  return { email, firstName }
}

export async function resolveAddressesForClaim(db: FirebaseFirestore.Firestore, claimData: any) {
  const { extractIndiaPincode, withIndiaPincode } = await import("../lib/shiprocket")

  // PICKUP = donor only. DROP = receiver (claimer) only. Never mix.
  let pickupAddress = ""
  let dropAddress = ""
  let pickupPincode: string | null = null
  let dropPincode: string | null = null
  let donorTarget: string | null = null
  let donorName = "Donor"
  let claimerName = String(claimData.requesterName || "").trim() || "Receiver"

  if (claimData.itemId) {
    const itemSnap = await db.collection(collections.items).doc(claimData.itemId).get()
    const item = itemSnap.data() || {}
    const submissionId = String(item.submissionId || "")
    // Donor gift pickup building
    if (item.pickupLocality) {
      pickupAddress = String(item.pickupLocality).trim()
    }
    pickupPincode =
      extractIndiaPincode(String(item.pincode || "")) ||
      extractIndiaPincode(String(item.pickupLocality || "")) ||
      pickupPincode
    donorTarget = String(item.donorTarget || item.giverTarget || item.ownerTarget || "").trim() || null
    if (submissionId) {
      const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
      if (subSnap.exists) {
        const sub = subSnap.data()!
        if (!pickupAddress) {
          pickupAddress = String(sub.pickupLocality || sub.locality || "").trim()
        }
        pickupPincode =
          pickupPincode ||
          extractIndiaPincode(String(sub.pincode || "")) ||
          extractIndiaPincode(String(sub.pickupLocality || sub.locality || ""))
        if (!donorTarget) {
          donorTarget = String(sub.donorTarget || sub.target || sub.email || "").trim() || null
        }
        const subName = [sub.donorFirstName, sub.donorLastName].filter(Boolean).join(" ").trim()
        if (subName) donorName = subName
        else if (sub.donorRecognition && String(sub.donorRecognition) !== "Anonymous") {
          donorName = String(sub.donorRecognition)
        }
      }
    }
  }

  // Receiver delivery building on the claim
  dropAddress = String(claimData.requesterAddress || "").trim()
  dropPincode = extractIndiaPincode(dropAddress) || extractIndiaPincode(claimData.note)

  // Donor account profile → pickup only
  if (donorTarget) {
    const donorDoc = await findDonorProfileDoc(db, donorTarget)
    const donor = donorDoc?.data()
    if (donor) {
      if (String(donor.name || "").trim()) donorName = String(donor.name).trim()
      const profileAddr = String(donor.address || "").trim()
      // Prefer gift pickupLocality; fall back to donor account address.
      if (!pickupAddress && profileAddr) pickupAddress = profileAddr
      pickupPincode =
        pickupPincode ||
        extractIndiaPincode(String(donor.pincode || "")) ||
        extractIndiaPincode(profileAddr)
      // If gift line has no pin but profile does, keep building + append pin later.
      if (!extractIndiaPincode(pickupAddress) && extractIndiaPincode(String(donor.pincode || ""))) {
        pickupPincode = extractIndiaPincode(String(donor.pincode || ""))
      }
    }
  }

  // Receiver account profile → drop only
  if (claimData.requesterTarget) {
    const claimerDoc = await findDonorProfileDoc(db, String(claimData.requesterTarget))
    const claimer = claimerDoc?.data()
    if (claimer) {
      if (!claimerName || claimerName === "Receiver") {
        claimerName = String(claimer.name || "").trim() || claimerName
      }
      const profileAddr = String(claimer.address || "").trim()
      if (!dropAddress && profileAddr) dropAddress = profileAddr
      dropPincode =
        dropPincode ||
        extractIndiaPincode(String(claimer.pincode || "")) ||
        extractIndiaPincode(profileAddr)
    }
  }

  if (!pickupAddress) {
    pickupAddress = String(claimData.pickupLocality || "").trim() || "Mumbai"
  }
  if (!dropAddress) {
    dropAddress = String(claimData.note || "").trim() || "Mumbai"
  }

  pickupPincode =
    extractIndiaPincode(pickupAddress) ||
    extractIndiaPincode(claimData.pickupLocality) ||
    pickupPincode
  dropPincode =
    extractIndiaPincode(dropAddress) ||
    extractIndiaPincode(claimData.requesterAddress) ||
    dropPincode

  pickupAddress = withIndiaPincode(pickupAddress, pickupPincode)
  dropAddress = withIndiaPincode(dropAddress, dropPincode)
  pickupPincode = extractIndiaPincode(pickupAddress) || pickupPincode
  dropPincode = extractIndiaPincode(dropAddress) || dropPincode

  if (pickupAddress && !pickupAddress.toLowerCase().includes("mumbai") && !pickupAddress.toLowerCase().includes("maharashtra")) {
    pickupAddress = `${pickupAddress}, Mumbai`
  }
  if (dropAddress && !dropAddress.toLowerCase().includes("mumbai") && !dropAddress.toLowerCase().includes("maharashtra")) {
    dropAddress = `${dropAddress}, Mumbai`
  }

  const gateNote = "Gate security only — no flat"
  if (!pickupAddress.toLowerCase().includes("gate")) {
    pickupAddress = `${pickupAddress} (${gateNote})`
  }
  if (!dropAddress.toLowerCase().includes("gate")) {
    dropAddress = `${dropAddress} (${gateNote})`
  }

  return {
    pickupAddress,
    pickupName: `${firstNameOnly(donorName)} (donor)`,
    pickupPhone: "",
    dropAddress,
    dropName: `${firstNameOnly(claimerName)} (receiver)`,
    dropPhone: "",
    pickupPincode,
    dropPincode,
    donorName: firstNameOnly(donorName),
    claimerName: firstNameOnly(claimerName),
  }
}

function firstNameOnly(raw: string): string {
  const s = String(raw || "").trim()
  if (!s) return "Reloved"
  // Avoid sending full personal identity on courier labels when possible.
  return s.split(/\s+/)[0].slice(0, 40) || "Reloved"
}

export async function advanceDeliveryStageAndNotify(
  db: FirebaseFirestore.Firestore,
  requestId: string,
  deliveryStatus: "rider_dispatched" | "picked_up" | "delivered" | "failed",
  opts?: {
    audience?: "giver" | "claimer"
    reason?: string
    extraDocUpdates?: Record<string, any>
  }
) {
  const ref = db.collection(collections.itemRequests).doc(requestId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new Error("Item request not found")
  }
  const data = snap.data()!
  if (data.status !== "approved") {
    throw new Error("Claim must be approved before tracking delivery.")
  }

  await ref.set(
    {
      deliveryStatus,
      deliveryUpdatedAt: FieldValue.serverTimestamp(),
      ...(opts?.extraDocUpdates || {}),
    },
    { merge: true }
  )

  const requesterEmail = await resolveClaimerEmail(db, String(data.requesterTarget || ""))
  const { email: giverEmail, firstName: giverFirstName } = await resolveGiverEmailForItem(db, String(data.itemId || ""))

  // Phones for MSG91 delivery SMS (best-effort; skip if missing).
  let claimerPhone =
    normalizePhoneDigits(data.requesterPhone) || normalizePhoneDigits(data.requesterTarget) || null
  let giverPhone: string | null = null
  try {
    const itemSnap = await db.collection(collections.items).doc(String(data.itemId || "")).get()
    if (itemSnap.exists) {
      const { resolveGiverContact } = await import("./matchFlow")
      const giver = await resolveGiverContact(db, itemSnap.data()!)
      giverPhone =
        normalizePhoneDigits(giver.submission?.phone) ||
        normalizePhoneDigits(itemSnap.data()?.donorPhone) ||
        normalizePhoneDigits(giver.donorTarget) ||
        null
      if (!giverPhone && giver.donorTarget) {
        const gp = await findDonorProfileDoc(db, String(giver.donorTarget))
        giverPhone = normalizePhoneDigits(gp?.data()?.phone)
      }
    }
  } catch (err) {
    console.warn("delivery SMS giver phone lookup", err)
  }
  if (!claimerPhone && data.requesterTarget) {
    try {
      const cp = await findDonorProfileDoc(db, String(data.requesterTarget))
      claimerPhone = normalizePhoneDigits(cp?.data()?.phone)
    } catch {
      /* ignore */
    }
  }

  if (deliveryStatus === "rider_dispatched" && giverEmail) {
    await sendDeliveryRiderDispatchedToGiver(giverEmail, {
      firstName: giverFirstName,
      itemTitle: data.itemTitle,
    }).catch((err) => console.error("Failed to send rider-dispatched (giver) email:", err))
  } else if (deliveryStatus === "delivered") {
    if (requesterEmail) {
      await sendDeliveryDeliveredToClaimer(requesterEmail, {
        requesterName: data.requesterName,
        itemTitle: data.itemTitle,
      }).catch((err) => console.error("Failed to send delivered (claimer) email:", err))
    }
    if (giverEmail) {
      await sendDeliveryDeliveredToGiver(giverEmail, {
        firstName: giverFirstName,
        itemTitle: data.itemTitle,
      }).catch((err) => console.error("Failed to send delivered (giver) email:", err))
    }
  } else if (deliveryStatus === "failed") {
    const audience = opts?.audience || "claimer"
    const email = audience === "giver" ? giverEmail : requesterEmail
    const name = audience === "giver" ? giverFirstName : data.requesterName
    if (email) {
      await sendDeliveryFailedNotice(email, {
        name,
        itemTitle: data.itemTitle,
        audience,
        reason: opts?.reason,
      }).catch((err) => console.error("Failed to send delivery-failed email:", err))
    }
  }

  // User-facing lifecycle SMS only: initiated (rider) + completed (delivered) + failed.
  // Mid-stage "picked_up / on the way" was removed to cut redundant pings.
  if (deliveryStatus === "rider_dispatched") {
    await smsRiderComing(giverPhone, giverFirstName, data.itemTitle).catch((err) =>
      console.error("Failed to send rider-coming SMS:", err)
    )
  } else if (deliveryStatus === "delivered") {
    await smsDeliveredClaimer(claimerPhone, data.itemTitle).catch((err) =>
      console.error("Failed to send delivered SMS:", err)
    )
  } else if (deliveryStatus === "failed") {
    const audience = opts?.audience || "claimer"
    const phone = audience === "giver" ? giverPhone : claimerPhone
    const name = audience === "giver" ? giverFirstName : data.requesterName
    await smsDeliveryFailed(phone, name, data.itemTitle).catch((err) =>
      console.error("Failed to send delivery-failed SMS:", err)
    )
  }

  return ref.get()
}

const deliveryStatusSchema = z.object({
  deliveryStatus: z.enum(["rider_dispatched", "picked_up", "delivered", "failed"]),
  audience: z.enum(["giver", "claimer"]).optional(),
  reason: z.string().max(300).optional(),
})

/**
 * Advances the Borzo/Porter delivery stage for an approved claim and emails
 * whoever's relevant.
 */
adminRouter.patch("/item-requests/:id/delivery", async (req, res) => {
  const parsed = deliveryStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const updated = await advanceDeliveryStageAndNotify(
      db,
      req.params.id,
      parsed.data.deliveryStatus,
      {
        audience: parsed.data.audience,
        reason: parsed.data.reason,
      }
    )
    res.json({ request: serializeDoc(updated.id, updated.data()!) })
  } catch (err: any) {
    console.error("admin patch item-request delivery", err)
    const status = err?.message?.includes("approved") ? 409 : err?.message?.includes("not found") ? 404 : 500
    res.status(status).json({ error: err?.message || "Failed to update delivery status" })
  }
})

/**
 * Calculates Borzo delivery price between pickup & drop buildings.
 */
adminRouter.post("/item-requests/:id/borzo/estimate", async (req, res) => {
  try {
    const { borzoConfigured, borzoCalculateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured in server environment. Please set BORZO_AUTH_TOKEN in functions .env.",
      })
      return
    }

    const db = getDb()
    const snap = await db.collection(collections.itemRequests).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Claimer drop building/address is missing on this request." })
      return
    }

    const calculation = await borzoCalculateOrder({
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
    })

    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const subsidy = await getBorzoSubsidySnapshot(db)
    res.json({
      ok: true,
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      paymentAmount: calculation.paymentAmount,
      deliveryFeeAmount: calculation.deliveryFeeAmount,
      currency: "INR",
      subsidy,
      subsidyCopy: subsidyUserCopy(subsidy),
      paidByPreview: subsidy.nextCoveredByReloved ? "reloved_subsidy" : "receiver",
    })
  } catch (err: any) {
    console.error("admin borzo estimate", err)
    res.status(500).json({ error: err?.message || "Failed to estimate Borzo delivery fee" })
  }
})

/**
 * Places live/test order on Borzo for this approved claim request.
 */
adminRouter.post("/item-requests/:id/borzo/book", async (req, res) => {
  try {
    const { borzoConfigured, borzoCreateOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({
        error: "BORZO_AUTH_TOKEN is not configured in server environment. Please set BORZO_AUTH_TOKEN in functions .env.",
      })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved before booking Borzo delivery." })
      return
    }
    if (claimData.borzoOrderId && claimData.borzoStatus !== "canceled") {
      res.status(409).json({
        error: `Borzo order #${claimData.borzoOrderId} already exists for this claim. Sync or cancel it first.`,
      })
      return
    }

    const addrs = await resolveAddressesForClaim(db, claimData)
    if (!addrs.pickupAddress) {
      res.status(400).json({ error: "Donor pickup building/locality could not be found." })
      return
    }
    if (!addrs.dropAddress) {
      res.status(400).json({ error: "Claimer drop building/address is missing on this request." })
      return
    }

    const { reserveBorzoSubsidy, releaseBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)

    let order
    try {
      order = await borzoCreateOrder({
        clientOrderId: `claim_${req.params.id}`,
        pickupAddress: addrs.pickupAddress,
        dropAddress: addrs.dropAddress,
        matter: `Reloved: ${claimData.itemTitle || "Preloved item"} (#${req.params.id.slice(0, 6)})`,
      })
    } catch (bookErr) {
      await releaseBorzoSubsidy(db, { paidBy: reserved.paidBy })
      throw bookErr
    }

    const extraDocUpdates: Record<string, any> = {
      borzoOrderId: order.orderId,
      borzoOrderName: order.orderName || null,
      borzoStatus: order.status,
      borzoDeliveryStatus: order.deliveryStatus || null,
      borzoTrackingUrl: order.trackingUrl || null,
      borzoDeliveryFee: order.paymentAmount || order.deliveryFeeAmount || null,
      borzoCourier: order.courier || null,
      borzoBookedAt: FieldValue.serverTimestamp(),
      borzoUpdatedAt: FieldValue.serverTimestamp(),
      borzoPickupAddress: addrs.pickupAddress,
      borzoDropAddress: addrs.dropAddress,
      borzoPaidBy: reserved.paidBy,
      borzoSubsidyIndex: reserved.subsidyIndex,
      borzoSubsidyReleased: false,
      porterPaidBy: reserved.paidBy === "reloved_subsidy" ? "reloved" : "receiver",
    }

    const currentDelivery = claimData.deliveryStatus || "awaiting_pickup"
    if (currentDelivery === "awaiting_pickup") {
      await advanceDeliveryStageAndNotify(db, req.params.id, "rider_dispatched", {
        extraDocUpdates,
      })
    } else {
      await ref.set(extraDocUpdates, { merge: true })
    }

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
    })
  } catch (err: any) {
    console.error("admin borzo book", err)
    res.status(500).json({ error: err?.message || "Failed to book Borzo rider" })
  }
})

/** Shiprocket API readiness (login + wallet). */
adminRouter.get("/shiprocket/status", async (_req, res) => {
  try {
    const {
      shiprocketConfigured,
      shiprocketOpsPhone,
      shiprocketGetWalletBalance,
    } = await import("../lib/shiprocket")
    // shiprocketLogin is not exported - use configured + wallet instead
    const configured = shiprocketConfigured()
    const opsPhone = shiprocketOpsPhone()
    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const subsidy = await getBorzoSubsidySnapshot(getDb())
    if (!configured) {
      res.json({
        configured: false,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy: subsidyUserCopy(subsidy),
        message:
          "Shiprocket API booking OFF (manual courier only). Set SHIPROCKET_BOOKING_ENABLED=1 plus email/password to allow live wallet books.",
      })
      return
    }
    try {
      const walletBalance = await shiprocketGetWalletBalance()
      res.json({
        configured: true,
        opsPhone: opsPhone || null,
        walletBalance,
        walletReady: walletBalance >= 100,
        subsidy,
        subsidyCopy: subsidyUserCopy(subsidy),
        message:
          walletBalance >= 100
            ? "Shiprocket API ready"
            : `Wallet ₹${walletBalance} — recharge to at least ₹100 before AWB / live booking`,
      })
    } catch (err) {
      res.status(502).json({
        configured: true,
        opsPhone: opsPhone || null,
        subsidy,
        subsidyCopy: subsidyUserCopy(subsidy),
        error: err instanceof Error ? err.message : "Shiprocket ping failed",
      })
    }
  } catch (err) {
    console.error("admin shiprocket status", err)
    res.status(500).json({ error: "Failed to check Shiprocket status" })
  }
})

adminRouter.post("/item-requests/:id/shiprocket/estimate", async (req, res) => {
  try {
    const { shiprocketConfigured, shiprocketCheckServiceability, extractIndiaPincode } = await import(
      "../lib/shiprocket"
    )
    if (!shiprocketConfigured()) {
      res.status(400).json({ error: "Shiprocket API is not configured (SHIPROCKET_EMAIL / PASSWORD)." })
      return
    }
    const db = getDb()
    const snap = await db.collection(collections.itemRequests).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const addrs = await resolveAddressesForClaim(db, claimData)
    const pickupPincode =
      addrs.pickupPincode ||
      extractIndiaPincode(addrs.pickupAddress) ||
      extractIndiaPincode(claimData.pickupLocality)
    const dropPincode =
      addrs.dropPincode ||
      extractIndiaPincode(addrs.dropAddress) ||
      extractIndiaPincode(claimData.requesterAddress) ||
      extractIndiaPincode(claimData.note)
    if (!pickupPincode || !dropPincode) {
      const missing = [
        !pickupPincode ? "pickup building" : null,
        !dropPincode ? "claimer delivery building" : null,
      ]
        .filter(Boolean)
        .join(" and ")
      res.status(400).json({
        error: `Add a 6-digit pincode to the ${missing} (e.g. 400051), then book again.`,
        pickupAddress: addrs.pickupAddress,
        dropAddress: addrs.dropAddress,
      })
      return
    }
    const svc = await shiprocketCheckServiceability({ pickupPincode, dropPincode })
    const { getBorzoSubsidySnapshot, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const subsidy = await getBorzoSubsidySnapshot(db)
    res.json({
      ok: svc.ok,
      pickupAddress: addrs.pickupAddress,
      dropAddress: addrs.dropAddress,
      pickupPincode,
      dropPincode,
      paymentAmount: svc.cheapest ? String(svc.cheapest.freightCharge) : null,
      courierName: svc.cheapest?.courierName || null,
      etd: svc.cheapest?.etd || null,
      subsidy,
      subsidyCopy: subsidyUserCopy(subsidy),
    })
  } catch (err: any) {
    console.error("admin shiprocket estimate", err)
    res.status(500).json({ error: err?.message || "Failed to estimate Shiprocket fee" })
  }
})

adminRouter.post("/item-requests/:id/shiprocket/book", async (req, res) => {
  try {
    const { shiprocketConfigured, shiprocketBookGateToGate, extractIndiaPincode } = await import(
      "../lib/shiprocket"
    )
    if (!shiprocketConfigured()) {
      res.status(400).json({ error: "Shiprocket API is not configured (SHIPROCKET_EMAIL / PASSWORD)." })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved before booking Shiprocket." })
      return
    }
    if (claimData.shiprocketOrderId && claimData.shiprocketStatus !== "CANCELED") {
      res.status(409).json({
        error: `Shiprocket order #${claimData.shiprocketOrderId} already exists for this claim.`,
      })
      return
    }

    const addrs = await resolveAddressesForClaim(db, claimData)
    const pickupPincode =
      addrs.pickupPincode ||
      extractIndiaPincode(addrs.pickupAddress) ||
      extractIndiaPincode(claimData.pickupLocality)
    const dropPincode =
      addrs.dropPincode ||
      extractIndiaPincode(addrs.dropAddress) ||
      extractIndiaPincode(claimData.requesterAddress) ||
      extractIndiaPincode(claimData.note)
    if (!pickupPincode || !dropPincode) {
      const missing = [
        !pickupPincode ? "pickup building" : null,
        !dropPincode ? "claimer delivery building" : null,
      ]
        .filter(Boolean)
        .join(" and ")
      res.status(400).json({
        error: `Add a 6-digit pincode to the ${missing} (e.g. 400051), then book again.`,
      })
      return
    }

    const { reserveBorzoSubsidy, releaseBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)
    // First 500: Reloved prepaid. After: claimer pays COD at delivery.
    const paymentMethod = reserved.paidBy === "reloved_subsidy" ? "Prepaid" : "COD"

    let booked
    try {
      booked = await shiprocketBookGateToGate({
        clientOrderId: `claim_${req.params.id}`.slice(0, 50),
        pickupAddress: addrs.pickupAddress,
        dropAddress: addrs.dropAddress,
        pickupPincode,
        dropPincode,
        donorName: addrs.donorName,
        claimerName: addrs.claimerName || claimData.requesterName,
        itemTitle: claimData.itemTitle || "Reloved preloved item",
        paymentMethod,
      })
    } catch (err) {
      await releaseBorzoSubsidy(db, {
        paidBy: reserved.paidBy,
        alreadyReleased: false,
      })
      throw err
    }

    const extraDocUpdates: Record<string, any> = {
      shiprocketOrderId: booked.orderId,
      shiprocketShipmentId: booked.shipmentId,
      shiprocketChannelOrderId: booked.channelOrderId,
      shiprocketStatus: booked.status,
      shiprocketAwb: booked.awbCode || null,
      shiprocketCourierName: booked.courierName || null,
      shiprocketTrackingUrl: booked.trackingUrl || null,
      shiprocketPaymentMethod: booked.paymentMethod,
      shiprocketWalletBalanceAtBook: booked.walletBalance,
      shiprocketAssignError: booked.assignError || null,
      courierBookedVia: "shiprocket_api",
      borzoPaidBy: reserved.paidBy,
      borzoSubsidyIndex: reserved.subsidyIndex,
      borzoSubsidyReleased: false,
      shiprocketBookedAt: FieldValue.serverTimestamp(),
      shiprocketUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await advanceDeliveryStageAndNotify(db, req.params.id, "rider_dispatched", {
      extraDocUpdates,
    })

    const updated = await ref.get()
    const payHint =
      booked.paymentMethod === "COD"
        ? "Claimer pays courier COD at delivery (first-500 cover used)."
        : reserved.paidBy === "reloved_subsidy"
          ? `Reloved prepaid (first-500 #${reserved.subsidyIndex}/${reserved.snapshot.limit}).`
          : "Receiver reimburses Reloved."
    res.json({
      ok: true,
      assigned: booked.assigned,
      assignError: booked.assignError || null,
      walletBalance: booked.walletBalance,
      paymentMethod: booked.paymentMethod,
      order: {
        orderId: booked.orderId,
        shipmentId: booked.shipmentId,
        awbCode: booked.awbCode || null,
        courierName: booked.courierName || null,
        trackingUrl: booked.trackingUrl || null,
        status: booked.status,
      },
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
      message: booked.assigned
        ? `Shiprocket booked (${booked.paymentMethod}). ${payHint}`
        : `Order created (${booked.paymentMethod}), AWB pending: ${booked.assignError || "recharge / assign in dashboard"}. ${payHint}`,
    })
  } catch (err: any) {
    console.error("admin shiprocket book", err)
    res.status(500).json({ error: err?.message || "Failed to book Shiprocket" })
  }
})

adminRouter.post("/item-requests/:id/shiprocket/cancel", async (req, res) => {
  try {
    const { shiprocketConfigured, shiprocketCancelOrder } = await import("../lib/shiprocket")
    if (!shiprocketConfigured()) {
      res.status(400).json({ error: "Shiprocket is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const orderId = Number(claimData.shiprocketOrderId)
    if (!orderId) {
      res.status(400).json({ error: "No Shiprocket order booked on this request." })
      return
    }

    await shiprocketCancelOrder(orderId)
    const { releaseBorzoSubsidy } = await import("../lib/borzoSubsidy")
    const releasedSnapshot = await releaseBorzoSubsidy(db, {
      paidBy: claimData.borzoPaidBy,
      alreadyReleased: Boolean(claimData.borzoSubsidyReleased),
    })
    await ref.set(
      {
        shiprocketStatus: "CANCELED",
        shiprocketCanceledAt: FieldValue.serverTimestamp(),
        shiprocketUpdatedAt: FieldValue.serverTimestamp(),
        borzoSubsidyReleased: releasedSnapshot ? true : Boolean(claimData.borzoSubsidyReleased),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const updated = await ref.get()
    res.json({
      ok: true,
      orderId,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: releasedSnapshot || undefined,
    })
  } catch (err: any) {
    console.error("admin shiprocket cancel", err)
    res.status(500).json({ error: err?.message || "Failed to cancel Shiprocket order" })
  }
})

adminRouter.get("/shadowfax/status", async (_req, res) => {
  try {
    const { shadowfaxStatusSummary, shadowfaxOpsPhone } = await import("../lib/shadowfax")
    const summary = shadowfaxStatusSummary()
    res.json({
      ...summary,
      opsPhone: shadowfaxOpsPhone(),
      message:
        summary.message ||
        (summary.configured
          ? "Shadowfax API booking ON."
          : "Shadowfax API booking OFF — manual courier only; no Shadowfax credits used."),
    })
  } catch (err: any) {
    console.error("admin shadowfax status", err)
    res.status(500).json({ error: err?.message || "Failed to read Shadowfax status" })
  }
})

adminRouter.post("/item-requests/:id/shadowfax/book", async (req, res) => {
  try {
    const { shadowfaxConfigured, shadowfaxBookGateToGate } = await import("../lib/shadowfax")
    const { extractIndiaPincode } = await import("../lib/shiprocket")
    if (!shadowfaxConfigured()) {
      res.status(403).json({
        error:
          "Shadowfax API booking is disabled on this environment (manual courier only). Claiming and handover will not use Shadowfax credits.",
      })
      return
    }
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved before booking Shadowfax." })
      return
    }
    if (claimData.shadowfaxOrderId && String(claimData.shadowfaxStatus || "").toUpperCase() !== "CANCELED") {
      res.status(409).json({
        error: `Shadowfax order #${claimData.shadowfaxOrderId} already exists for this claim.`,
      })
      return
    }

    const addrs = await resolveAddressesForClaim(db, claimData)
    const pickupPincode =
      addrs.pickupPincode ||
      extractIndiaPincode(addrs.pickupAddress) ||
      extractIndiaPincode(claimData.pickupLocality)
    const dropPincode =
      addrs.dropPincode ||
      extractIndiaPincode(addrs.dropAddress) ||
      extractIndiaPincode(claimData.requesterAddress) ||
      extractIndiaPincode(claimData.note)
    if (!pickupPincode || !dropPincode) {
      const missing = [
        !pickupPincode ? "pickup building" : null,
        !dropPincode ? "claimer delivery building" : null,
      ]
        .filter(Boolean)
        .join(" and ")
      res.status(400).json({
        error: `Add a 6-digit pincode to the ${missing} (e.g. 400051), then book again.`,
      })
      return
    }

    const { reserveBorzoSubsidy, releaseBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)
    const paymentMethod = reserved.paidBy === "reloved_subsidy" ? "Prepaid" : "COD"

    let booked
    try {
      booked = await shadowfaxBookGateToGate({
        clientOrderId: `sfx_${req.params.id}`.slice(0, 50),
        pickupAddress: addrs.pickupAddress,
        dropAddress: addrs.dropAddress,
        pickupPincode,
        dropPincode,
        donorName: addrs.donorName,
        claimerName: addrs.claimerName || claimData.requesterName,
        itemTitle: claimData.itemTitle || "Reloved preloved item",
        paymentMethod,
      })
    } catch (err) {
      await releaseBorzoSubsidy(db, {
        paidBy: reserved.paidBy,
        alreadyReleased: false,
      })
      throw err
    }

    const extraDocUpdates: Record<string, any> = {
      shadowfaxOrderId: booked.orderId,
      shadowfaxStatus: booked.status,
      shadowfaxAwb: booked.awb || null,
      shadowfaxTrackingUrl: booked.trackingUrl || null,
      shadowfaxPaymentMethod: paymentMethod,
      courierBookedVia: "shadowfax_api",
      borzoPaidBy: reserved.paidBy,
      borzoSubsidyIndex: reserved.subsidyIndex,
      borzoSubsidyReleased: false,
      shadowfaxBookedAt: FieldValue.serverTimestamp(),
      shadowfaxUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await advanceDeliveryStageAndNotify(db, req.params.id, "rider_dispatched", {
      extraDocUpdates,
    })

    const updated = await ref.get()
    const payHint =
      paymentMethod === "COD"
        ? "Claimer pays courier COD at delivery (first-500 cover used)."
        : `Reloved prepaid (first-500 #${reserved.subsidyIndex}/${reserved.snapshot.limit}).`
    res.json({
      ok: true,
      assigned: Boolean(booked.awb),
      paymentMethod,
      order: {
        orderId: booked.orderId,
        awbCode: booked.awb || null,
        trackingUrl: booked.trackingUrl || null,
        status: booked.status,
      },
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
      message: booked.awb
        ? `Shadowfax booked (${paymentMethod}). ${payHint}`
        : `Shadowfax order created (${paymentMethod}), AWB pending. ${payHint}`,
    })
  } catch (err: any) {
    console.error("admin shadowfax book", err)
    res.status(500).json({ error: err?.message || "Failed to book Shadowfax" })
  }
})

adminRouter.post("/item-requests/:id/shadowfax/cancel", async (req, res) => {
  try {
    const { shadowfaxConfigured, shadowfaxCancelOrder } = await import("../lib/shadowfax")
    if (!shadowfaxConfigured()) {
      res.status(400).json({ error: "Shadowfax is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    const orderId = String(claimData.shadowfaxOrderId || claimData.shadowfaxAwb || "").trim()
    if (!orderId) {
      res.status(400).json({ error: "No Shadowfax order booked on this request." })
      return
    }

    await shadowfaxCancelOrder(String(claimData.shadowfaxAwb || orderId))
    const { releaseBorzoSubsidy } = await import("../lib/borzoSubsidy")
    const releasedSnapshot = await releaseBorzoSubsidy(db, {
      paidBy: claimData.borzoPaidBy,
      alreadyReleased: Boolean(claimData.borzoSubsidyReleased),
    })
    await ref.set(
      {
        shadowfaxStatus: "CANCELED",
        shadowfaxCanceledAt: FieldValue.serverTimestamp(),
        shadowfaxUpdatedAt: FieldValue.serverTimestamp(),
        borzoSubsidyReleased: releasedSnapshot ? true : Boolean(claimData.borzoSubsidyReleased),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const updated = await ref.get()
    res.json({
      ok: true,
      orderId,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: releasedSnapshot || undefined,
    })
  } catch (err: any) {
    console.error("admin shadowfax cancel", err)
    res.status(500).json({ error: err?.message || "Failed to cancel Shadowfax order" })
  }
})

/**
 * Manual Borzo/Porter booking (while Business API waits): mark this ride as Reloved-paid
 * (first-500 counter) after ops books in the app with company prepaid — never COD.
 */
adminRouter.post("/item-requests/:id/courier/mark-reloved-paid", async (req, res) => {
  try {
    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }
    const claimData = snap.data()!
    if (claimData.status !== "approved") {
      res.status(400).json({ error: "Claim must be approved first." })
      return
    }
    if (claimData.borzoPaidBy === "reloved_subsidy" && claimData.borzoSubsidyIndex) {
      res.json({
        ok: true,
        alreadyMarked: true,
        borzoPaidBy: "reloved_subsidy",
        borzoSubsidyIndex: claimData.borzoSubsidyIndex,
      })
      return
    }

    const carrier = String(req.body?.carrier || "manual").trim().toLowerCase()
    const { reserveBorzoSubsidy, subsidyUserCopy } = await import("../lib/borzoSubsidy")
    const reserved = await reserveBorzoSubsidy(db)

    await ref.set(
      {
        borzoPaidBy: reserved.paidBy,
        borzoSubsidyIndex: reserved.subsidyIndex,
        courierBookedVia: carrier === "porter" ? "porter_manual" : carrier === "borzo" ? "borzo_manual" : carrier === "shiprocket" ? "shiprocket_manual" : "manual",
        borzoStatus: claimData.borzoOrderId ? claimData.borzoStatus : "manual_booked",
        deliveryStatus: claimData.deliveryStatus || "rider_dispatched",
        deliveryUpdatedAt: FieldValue.serverTimestamp(),
        borzoUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const updated = await ref.get()
    res.json({
      ok: true,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: reserved.snapshot,
      subsidyCopy: subsidyUserCopy(reserved.snapshot),
      borzoPaidBy: reserved.paidBy,
    })
  } catch (err: any) {
    console.error("mark-reloved-paid", err)
    res.status(500).json({ error: err?.message || "Couldn't mark Reloved-paid" })
  }
})

/**
 * Polls Borzo for latest order status, tracking URL, courier details.
 */
adminRouter.post("/item-requests/:id/borzo/sync", async (req, res) => {
  try {
    const { borzoConfigured, borzoGetOrder, mapBorzoToRelovedDeliveryStatus } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({ error: "BORZO_AUTH_TOKEN is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }

    const claimData = snap.data()!
    if (!claimData.borzoOrderId) {
      res.status(400).json({ error: "No Borzo order booked on this claim yet." })
      return
    }

    const order = await borzoGetOrder(claimData.borzoOrderId)
    if (!order) {
      res.status(404).json({ error: `Order #${claimData.borzoOrderId} not found on Borzo` })
      return
    }

    const extraDocUpdates: Record<string, any> = {
      borzoStatus: order.status,
      borzoDeliveryStatus: order.deliveryStatus || null,
      borzoTrackingUrl: order.trackingUrl || claimData.borzoTrackingUrl || null,
      borzoDeliveryFee: order.paymentAmount || order.deliveryFeeAmount || claimData.borzoDeliveryFee || null,
      borzoCourier: order.courier || claimData.borzoCourier || null,
      borzoUpdatedAt: FieldValue.serverTimestamp(),
    }

    const relovedStage = mapBorzoToRelovedDeliveryStatus(order.status, order.deliveryStatus)
    const currentStage = claimData.deliveryStatus || "awaiting_pickup"

    const stageRank: Record<string, number> = {
      awaiting_pickup: 0,
      rider_dispatched: 1,
      picked_up: 2,
      delivered: 3,
      failed: 99,
    }

    if (
      relovedStage &&
      relovedStage !== currentStage &&
      (stageRank[relovedStage] > (stageRank[currentStage] ?? -1) || relovedStage === "failed")
    ) {
      await advanceDeliveryStageAndNotify(db, req.params.id, relovedStage, {
        extraDocUpdates,
        reason: relovedStage === "failed" ? "Order canceled or failed on Borzo" : undefined,
      })
    } else {
      await ref.set(extraDocUpdates, { merge: true })
    }

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
    })
  } catch (err: any) {
    console.error("admin borzo sync", err)
    res.status(500).json({ error: err?.message || "Failed to sync Borzo order" })
  }
})

/**
 * Cancels an active or pending Borzo order.
 */
adminRouter.post("/item-requests/:id/borzo/cancel", async (req, res) => {
  try {
    const { borzoConfigured, borzoCancelOrder } = await import("../lib/borzo")
    if (!borzoConfigured()) {
      res.status(400).json({ error: "BORZO_AUTH_TOKEN is not configured on the server." })
      return
    }

    const db = getDb()
    const ref = db.collection(collections.itemRequests).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Item request not found" })
      return
    }

    const claimData = snap.data()!
    if (!claimData.borzoOrderId) {
      res.status(400).json({ error: "No Borzo order booked on this request." })
      return
    }

    const order = await borzoCancelOrder(claimData.borzoOrderId)
    const { releaseBorzoSubsidy } = await import("../lib/borzoSubsidy")
    const releasedSnapshot = await releaseBorzoSubsidy(db, {
      paidBy: claimData.borzoPaidBy,
      alreadyReleased: Boolean(claimData.borzoSubsidyReleased),
    })
    await advanceDeliveryStageAndNotify(db, req.params.id, "failed", {
      reason: "Canceled by ops on Borzo",
      extraDocUpdates: {
        borzoStatus: "canceled",
        borzoUpdatedAt: FieldValue.serverTimestamp(),
        borzoSubsidyReleased: releasedSnapshot ? true : Boolean(claimData.borzoSubsidyReleased),
      },
    })

    const updated = await ref.get()
    res.json({
      ok: true,
      order,
      request: serializeDoc(updated.id, updated.data()!),
      subsidy: releasedSnapshot || undefined,
    })
  } catch (err: any) {
    console.error("admin borzo cancel", err)
    res.status(500).json({ error: err?.message || "Failed to cancel Borzo order" })
  }
})

adminRouter.get("/contact-messages", async (_req, res) => {
  try {
    const snap = await getDb().collection(collections.contactMessages).limit(200).get()
    const messages = snap.docs
      .map((d) => serializeDoc(d.id, d.data()))
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ messages })
  } catch (err) {
    console.error("admin contact-messages", err)
    res.status(500).json({ error: "Failed to load messages" })
  }
})

adminRouter.get("/waitlist", async (_req, res) => {
  try {
    const snap = await getDb().collection(collections.waitlistSignups).limit(1000).get()
    const signups = snap.docs
      .map((d) => serializeDoc(d.id, d.data()))
      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ signups, count: signups.length })
  } catch (err) {
    console.error("admin waitlist", err)
    res.status(500).json({ error: "Failed to load waitlist" })
  }
})

/** Ops: add waitlist row (email unique; same phone allowed across emails). */
adminRouter.post("/waitlist", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase()
    const phone = String(req.body?.phone || "")
      .replace(/\D/g, "")
      .slice(-10)
    const fullName = String(req.body?.fullName || req.body?.name || "").trim() || null
    const intent = String(req.body?.intent || "").trim().toLowerCase()
    if (!email.includes("@") || !/^[6-9]\d{9}$/.test(phone) || !["donate", "claim"].includes(intent)) {
      res.status(400).json({ error: "email, 10-digit phone, and intent donate|claim required" })
      return
    }
    const db = getDb()
    const existing = await db.collection(collections.waitlistSignups).where("email", "==", email).limit(1).get()
    if (!existing.empty) {
      res.json({ ok: true, alreadyJoined: true, id: existing.docs[0].id, signup: serializeDoc(existing.docs[0].id, existing.docs[0].data()) })
      return
    }
    const ref = await db.collection(collections.waitlistSignups).add({
      fullName,
      email,
      phone,
      intent,
      createdAt: FieldValue.serverTimestamp(),
      welcomeEmailSent: false,
      source: "admin",
    })
    res.status(201).json({ ok: true, alreadyJoined: false, id: ref.id })
  } catch (err) {
    console.error("admin post waitlist", err)
    res.status(500).json({ error: "Failed to add waitlist signup" })
  }
})

/** Ops: set createdAt (ISO) on a waitlist signup. */
adminRouter.patch("/waitlist/:id", async (req, res) => {
  try {
    const createdAtIso = String(req.body?.createdAt || "").trim()
    const when = new Date(createdAtIso)
    if (!createdAtIso || Number.isNaN(when.getTime())) {
      res.status(400).json({ error: "createdAt ISO date required" })
      return
    }
    const ref = getDb().collection(collections.waitlistSignups).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ createdAt: Timestamp.fromDate(when) }, { merge: true })
    const updated = await ref.get()
    res.json({ ok: true, signup: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch waitlist", err)
    res.status(500).json({ error: "Failed to update waitlist signup" })
  }
})

adminRouter.patch("/contact-messages/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.contactMessages).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ message: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch contact", err)
    res.status(500).json({ error: "Failed to update message" })
  }
})

/** Reply to a contact-form sender by email and mark the message actioned. */
adminRouter.post("/contact-messages/:id/reply", async (req, res) => {
  try {
    const replyBody = String((req.body as { reply?: string })?.reply || "").trim()
    if (replyBody.length < 2) {
      res.status(400).json({ error: "Write a reply before sending." })
      return
    }
    const ref = getDb().collection(collections.contactMessages).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const data = before.data() || {}
    const to = String(data.email || "").trim()
    if (!to.includes("@")) {
      res.status(400).json({ error: "This submission has no email to reply to." })
      return
    }
    await sendContactReplyToUser(to, {
      name: String(data.name || "there"),
      subject: String(data.subject || "Your Reloved message"),
      originalMessage: String(data.message || ""),
      replyBody,
    })
    await ref.set(
      {
        status: "actioned",
        adminReply: replyBody,
        repliedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    const updated = await ref.get()
    res.json({ message: serializeDoc(updated.id, updated.data()!) })
  } catch (err: any) {
    console.error("admin contact reply", err)
    res.status(500).json({ error: err?.message || "Failed to send reply" })
  }
})

adminRouter.get("/partner-applications", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined
    const snap = await getDb().collection(collections.partnerApplications).limit(200).get()
    let applications = snap.docs.map((d) => serializeDoc(d.id, d.data()))
    if (status) applications = applications.filter((a: any) => a.status === status)
    applications.sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    res.json({ applications })
  } catch (err) {
    console.error("admin partner-applications", err)
    res.status(500).json({ error: "Failed to load partner applications" })
  }
})

adminRouter.patch("/partner-applications/:id", async (req, res) => {
  try {
    const { status } = req.body as { status: string }
    const ref = getDb().collection(collections.partnerApplications).doc(req.params.id)
    const before = await ref.get()
    if (!before.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    await ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const updated = await ref.get()
    res.json({ application: serializeDoc(updated.id, updated.data()!) })
  } catch (err) {
    console.error("admin patch partner-application", err)
    res.status(500).json({ error: "Failed to update application" })
  }
})

/** Stubs so admin UI tabs that aren't fully ported yet don't 404. */
adminRouter.get("/partners", async (_req, res) => {
  res.json({ partners: [] })
})

adminRouter.get("/allocations", async (_req, res) => {
  res.json({ allocations: [] })
})

adminRouter.get("/partner-needs", async (_req, res) => {
  res.json({ needs: [] })
})

adminRouter.post("/partner-needs", async (_req, res) => {
  res.status(501).json({ error: "Partner needs aren't available on the Firebase backend yet." })
})

adminRouter.post("/allocations", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocations/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

adminRouter.patch("/allocation-items/:id", async (_req, res) => {
  res.status(501).json({ error: "Partner allocations aren't available on the Firebase backend yet." })
})

const bulkCommitSchema = z.object({
  items: z
    .array(
      z.object({
        storagePath: z.string().min(1),
        title: z.string().min(2).max(120),
        // Launch taxonomy + legacy Clothing/Footwear for older clients
        category: z.enum([
          "Outerwear",
          "Tops",
          "Bottoms",
          "Kicks",
          "Bags",
          "Accessories",
          "Clothing",
          "Footwear",
        ]),
        gender: z.enum(["men", "women", "unisex", "kids", "girls", "boys"]).default("unisex"),
        description: z.string().min(1).max(2000),
        condition: z.string().min(1),
        brand: z.string().max(80).optional().nullable(),
        size: z.string().max(60).optional().nullable(),
        quantity: z.coerce.number().int().min(1).max(50).optional(),
        locality: z.string().min(2).max(120),
      })
    )
    .min(1)
    .max(20),
})

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  return `${base || "item"}-${Date.now().toString(36)}`
}

adminRouter.post("/bulk-upload/analyze", async (req, res) => {
  try {
    if (!isMultipart(req)) {
      res.status(400).json({ error: "Expected multipart photo upload" })
      return
    }
    const { files } = await parseMultipart(req, { fileSize: 15 * 1024 * 1024, files: 20 })
    const photos = files.filter((f) => f.fieldname === "photos" || f.fieldname === "photo")
    const payload = await analyzePhotosViaLightsail(photos)
    res.json(payload)
  } catch (err: any) {
    console.error("bulk-upload analyze", err)
    res.status(err?.status || 500).json({ error: err?.message || "Failed to analyze photos" })
  }
})

adminRouter.post("/bulk-upload/commit", async (req, res) => {
  const parsed = bulkCommitSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const db = getDb()
    const created = []
    for (const item of parsed.data.items) {
      // Quantity N → N separate Wall listings (never one card with qty>1).
      const copies = Math.min(50, Math.max(1, Number(item.quantity) || 1))
      for (let copy = 0; copy < copies; copy++) {
        const title = copies > 1 ? `${item.title} (${copy + 1}/${copies})` : item.title
        const ref = await db.collection(collections.items).add({
          submissionId: null,
          slug: slugify(title),
          title,
          category: item.category,
          gender: item.gender || "unisex",
          description: item.description,
          condition: item.condition,
          brand: item.brand || null,
          size: item.size || null,
          quantity: 1,
          locality: item.locality,
          status: "approved",
          publicStatus: "available",
          publicVisibility: true,
          donorRecognition: "reloved team",
          images: [
            {
              storagePath: item.storagePath,
              imageType: "product",
              sortOrder: 0,
            },
          ],
          source: "admin-bulk-upload",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        const doc = await ref.get()
        created.push({ id: doc.id, ...doc.data() })
      }
    }
    res.status(201).json({ items: created })
  } catch (err) {
    console.error("bulk-upload commit", err)
    res.status(500).json({ error: "Failed to save items" })
  }
})

const adminThreadOpenSchema = z.object({
  subjectType: z.enum(["donation", "claim", "peer", "support"]),
  subjectId: z.string().min(1),
})

/** Ops-side open — unlike the donor route, no approval gate: ops can start a thread early to sort out logistics.
 * Peer threads are opened read-only for giver↔claimer safety monitoring.
 * Support = Ask Reloved help popup (two-way with visitor).
 */
adminRouter.post("/threads/open", async (req, res) => {
  const parsed = adminThreadOpenSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    if (parsed.data.subjectType === "support") {
      const result = await getOrCreateSupportThread(db, parsed.data.subjectId)
      if ("error" in result) {
        res.status(403).json({ error: "Couldn't open support chat" })
        return
      }
      const messages = await listMessages(db, result.id)
      if (result.data.unreadForAdmin) {
        await db.collection(collections.messageThreads).doc(result.id).set({ unreadForAdmin: false }, { merge: true })
      }
      res.json({
        thread: serializeThread(result.id, { ...result.data, unreadForAdmin: false }),
        messages,
      })
      return
    }
    if (parsed.data.subjectType === "peer") {
      const result = await getOrCreatePeerThreadForAdmin(db, parsed.data.subjectId)
      if ("error" in result) {
        res
          .status(result.error === "NOT_FOUND" ? 404 : 400)
          .json({
            error:
              result.error === "NOT_APPROVED"
                ? "Peer chat only exists after the claim is matched (accepted)."
                : "Couldn't open peer chat",
          })
        return
      }
      const messages = await listMessages(db, result.id)
      if (result.data.unreadForAdmin) {
        await db.collection(collections.messageThreads).doc(result.id).set({ unreadForAdmin: false }, { merge: true })
      }
      res.json({ thread: serializeThread(result.id, { ...result.data, unreadForAdmin: false }), messages, readOnly: true })
      return
    }
    const result = await getOrCreateThread(db, parsed.data.subjectType, parsed.data.subjectId)
    if ("error" in result) {
      res.status(result.error === "NOT_FOUND" ? 404 : 500).json({ error: "Couldn't open chat" })
      return
    }
    const messages = await listMessages(db, result.id)
    res.json({ thread: serializeThread(result.id, result.data), messages })
  } catch (err) {
    console.error("admin threads open", err)
    res.status(500).json({ error: "Couldn't open chat" })
  }
})

/** Ask Reloved floating-help threads (visitor ↔ Reloved). */
adminRouter.get("/support-chats", async (_req, res) => {
  try {
    const db = getDb()
    const snap = await db.collection(collections.messageThreads).where("subjectType", "==", "support").limit(300).get()
    const threads = snap.docs.map((d) => {
      const data = d.data()
      return {
        ...serializeThread(d.id, data as any),
        ownerEmail: data.ownerEmail || null,
        ownerTarget: data.ownerTarget || null,
        hasMessages: !!String(data.lastMessagePreview || "").trim(),
      }
    })
    threads.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    res.setHeader("Cache-Control", "no-store, no-cache, max-age=0")
    res.json({ threads })
  } catch (err) {
    console.error("admin support-chats", err)
    res.status(500).json({ error: "Failed to load support chats" })
  }
})

async function listPeerChatsForAdmin(_req: import("express").Request, res: import("express").Response) {
  try {
    const db = getDb()
    const snap = await db.collection(collections.messageThreads).where("subjectType", "==", "peer").limit(300).get()
    const threads = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data()
        const claimId = String(data.subjectId || "")
        let claimStatus: string | null = null
        let handoverStage: string | null = null
        let claimerName = String(data.claimerName || data.ownerName || "Claimer")
        let giverName = String(data.giverName || "Dropper")
        if (claimId) {
          const claimSnap = await db.collection(collections.itemRequests).doc(claimId).get()
          if (claimSnap.exists) {
            const c = claimSnap.data()!
            claimStatus = String(c.status || "")
            handoverStage = c.handoverStage != null ? String(c.handoverStage) : null
            if (c.requesterName) claimerName = String(c.requesterName)
          }
        }
        const msgSnap = await d.ref.collection("messages").limit(1).get()
        const hasMessages = !msgSnap.empty || !!String(data.lastMessagePreview || "").trim()
        return {
          ...serializeThread(d.id, data as any),
          claimStatus,
          handoverStage,
          claimerName,
          giverName,
          hasMessages,
        }
      })
    )
    threads.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    res.setHeader("Cache-Control", "no-store, no-cache, max-age=0")
    res.json({ threads })
  } catch (err) {
    console.error("admin peer-chats", err)
    res.status(500).json({ error: "Failed to load peer chats" })
  }
}

/** List all giver ↔ claimer (peer) threads for safety / abuse monitoring. */
adminRouter.get("/peer-chats", listPeerChatsForAdmin)
/** Alias for older admin clients. */
adminRouter.get("/peer-threads", listPeerChatsForAdmin)

adminRouter.get("/threads/:id", async (req, res) => {
  try {
    const db = getDb()
    const ref = db.collection(collections.messageThreads).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const messages = await listMessages(db, ref.id)
    if (snap.data()?.unreadForAdmin) {
      await ref.set({ unreadForAdmin: false }, { merge: true })
    }
    res.json({ thread: serializeThread(ref.id, snap.data() as any), messages })
  } catch (err) {
    console.error("admin thread get", err)
    res.status(500).json({ error: "Couldn't load chat" })
  }
})

const adminThreadMessageSchema = z.object({ text: z.string().min(1).max(1000) })

adminRouter.post("/threads/:id/messages", async (req, res) => {
  const parsed = adminThreadMessageSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const db = getDb()
    const ref = db.collection(collections.messageThreads).doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" })
      return
    }
    const thread = snap.data()!
    if (String(thread.subjectType) === "peer") {
      res.status(403).json({
        error:
          "Dropper ↔ claimer chat is monitor-only. Message them from Claims (Reloved chat) if you need to intervene.",
      })
      return
    }
    await postMessage(db, ref.id, { senderRole: "admin", senderName: "Reloved", text: parsed.data.text })

    let ownerEmail = String(thread.ownerEmail || "")
    if (!ownerEmail) {
      const profileDoc = await findDonorProfileDoc(db, String(thread.ownerTarget || ""))
      ownerEmail = (profileDoc?.data()?.email as string | undefined) || ""
    }
    if (ownerEmail) {
      await sendNewMessageDonorAlert(ownerEmail, {
        firstName: thread.ownerName || "there",
        itemTitle: thread.itemTitle,
        preview: parsed.data.text.slice(0, 140),
        fromReloved: true,
      }).catch((err) => console.error("Failed to send new-message donor alert:", err))
    }

    const ownerTarget = String(thread.ownerTarget || "")
    if (ownerTarget) {
      const role = thread.subjectType === "donation" ? "giver" : "claimer"
      const href =
        thread.subjectType === "support"
          ? "/"
          : thread.subjectType === "donation"
            ? `/account/gifts/${thread.subjectId}`
            : `/account/claims/${thread.subjectId}`
      await pushUserNotification({
        donorTarget: ownerTarget,
        role,
        type: "new_message",
        title: thread.subjectType === "support" ? "Reloved replied in Ask Reloved" : "RE-LOVED replied",
        body:
          thread.subjectType === "support"
            ? `"${parsed.data.text.slice(0, 80)}"`
            : `On ${thread.itemTitle}: "${parsed.data.text.slice(0, 80)}"`,
        href,
        itemTitle: String(thread.itemTitle || ""),
      }).catch((err) => console.error("admin chat in-app notify", err))
    }

    const messages = await listMessages(db, ref.id)
    const updated = await ref.get()
    res.status(201).json({ thread: serializeThread(ref.id, updated.data() as any), messages })
  } catch (err) {
    console.error("admin thread message post", err)
    res.status(500).json({ error: "Couldn't send message" })
  }
})

/** Edesy masking readiness (no secrets returned). */
adminRouter.get("/calls/masking-status", async (_req, res) => {
  res.json(callMaskingStatus())
})

const maskCallSchema = z.object({
  subjectType: z.enum(["donation", "claim"]),
  subjectId: z.string().min(1),
  /**
   * Delivery / assist bridges.
   * - courier_to_claimer / courier_to_giver: rider rings first, then user
   * - claimer_to_giver: claimer rings first, then giver
   * - ops_to_claimer / ops_to_giver: Reloved ops rings first, then user (assist)
   */
  mode: z.enum([
    "courier_to_claimer",
    "courier_to_giver",
    "claimer_to_giver",
    "ops_to_claimer",
    "ops_to_giver",
  ]),
})

/**
 * Delivery masking via Edesy click-to-call: connect rider↔user, claimer↔giver,
 * or Reloved ops↔user. Both sides see the masked Reloved DID only.
 * Customer-care inbound still forwards to ops separately.
 */
adminRouter.post("/calls/mask", async (req, res) => {
  const parsed = maskCallSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  if (!callMaskingConfigured()) {
    res.status(503).json({
      error: "Call masking not configured yet",
      ...callMaskingStatus(),
    })
    return
  }

  try {
    const db = getDb()
    const { subjectType, subjectId, mode } = parsed.data
    const opsPhone = relovedOpsDialPhone()

    let fromPhone = ""
    let toPhone = ""
    let fromLabel = ""
    let toLabel = ""

    if (subjectType === "claim") {
      const snap = await db.collection(collections.itemRequests).doc(subjectId).get()
      if (!snap.exists) {
        res.status(404).json({ error: "Claim not found" })
        return
      }
      const data = snap.data()!
      const claimerPhone = String(data.requesterPhone || "")
      const courierPhone = String(data.borzoCourier?.phone || "")

      let giverPhone = ""
      const itemId = String(data.itemId || "")
      if (itemId) {
        const itemSnap = await db.collection(collections.items).doc(itemId).get()
        const submissionId = String(itemSnap.data()?.submissionId || "")
        if (submissionId) {
          const subSnap = await db.collection(collections.donationSubmissions).doc(submissionId).get()
          giverPhone = String(subSnap.data()?.phone || "")
        }
      }

      if (mode === "claimer_to_giver") {
        fromPhone = claimerPhone
        toPhone = giverPhone
        fromLabel = "claimer"
        toLabel = "giver"
      } else if (mode === "courier_to_claimer") {
        fromPhone = courierPhone
        toPhone = claimerPhone
        fromLabel = "rider"
        toLabel = "claimer"
      } else if (mode === "courier_to_giver") {
        fromPhone = courierPhone
        toPhone = giverPhone
        fromLabel = "rider"
        toLabel = "giver"
      } else if (mode === "ops_to_claimer") {
        fromPhone = opsPhone
        toPhone = claimerPhone
        fromLabel = "ops"
        toLabel = "claimer"
      } else if (mode === "ops_to_giver") {
        fromPhone = opsPhone
        toPhone = giverPhone
        fromLabel = "ops"
        toLabel = "giver"
      }
    } else {
      // donation / giver side
      if (mode !== "courier_to_giver" && mode !== "ops_to_giver") {
        res.status(400).json({ error: "For donations, use mode courier_to_giver or ops_to_giver" })
        return
      }
      const snap = await db.collection(collections.donationSubmissions).doc(subjectId).get()
      if (!snap.exists) {
        res.status(404).json({ error: "Donation not found" })
        return
      }
      const data = snap.data()!
      const giverPhone = String(data.phone || "")

      // Prefer courier on a linked open claim for this donation's items
      let courierPhone = ""
      const itemsSnap = await db
        .collection(collections.items)
        .where("submissionId", "==", subjectId)
        .limit(10)
        .get()
      for (const itemDoc of itemsSnap.docs) {
        const claimsSnap = await db
          .collection(collections.itemRequests)
          .where("itemId", "==", itemDoc.id)
          .where("status", "==", "approved")
          .limit(5)
          .get()
        for (const c of claimsSnap.docs) {
          const p = String(c.data().borzoCourier?.phone || "")
          if (p.replace(/\D/g, "")) {
            courierPhone = p
            break
          }
        }
        if (courierPhone) break
      }

      if (mode === "ops_to_giver") {
        fromPhone = opsPhone
        toPhone = giverPhone
        fromLabel = "ops"
        toLabel = "giver"
      } else {
        fromPhone = courierPhone
        toPhone = giverPhone
        fromLabel = "rider"
        toLabel = "giver"
      }
    }

    if (!fromPhone.replace(/\D/g, "")) {
      res.status(400).json({
        error:
          fromLabel === "rider"
            ? "No rider phone yet — book Borzo first so courier phone is on the claim"
            : fromLabel === "ops"
              ? "Reloved ops phone not configured (RELOVED_OPS_PRIMARY_PHONE / BORZO_OPS_PHONE)"
              : `No phone on file for ${fromLabel}`,
      })
      return
    }
    if (!toPhone.replace(/\D/g, "")) {
      res.status(400).json({ error: `No phone on file for ${toLabel}` })
      return
    }

    const result = await connectMaskedCall({
      fromPhone,
      toPhone,
      customField: `${subjectType}:${subjectId}:${mode}`,
      timeLimitSec: 120,
    })

    await db.collection(collections.callBridges).add({
      provider: "edesy",
      subjectType,
      subjectId,
      mode,
      fromLabel,
      toLabel,
      fromPhoneLast4: fromPhone.replace(/\D/g, "").slice(-4),
      toPhoneLast4: toPhone.replace(/\D/g, "").slice(-4),
      callSid: result.callSid,
      status: result.status,
      maskedNumber: result.maskedNumber,
      createdAt: FieldValue.serverTimestamp(),
    })

    res.status(201).json({
      ok: true,
      callSid: result.callSid,
      status: result.status,
      maskedNumber: result.maskedNumber,
      mode,
      message: `Connecting ${fromLabel} → ${toLabel} (masked). ${fromLabel} phone rings first.`,
    })
  } catch (err) {
    console.error("admin calls mask", err)
    res.status(502).json({ error: err instanceof Error ? err.message : "Masked call failed" })
  }
})
