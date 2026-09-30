const IST_TIME_ZONE = 'Asia/Kolkata'

const SOURCE_LIMITS = Object.freeze({
  submissions: 200,
  items: 300,
  requests: 200,
  orders: 200,
  contacts: 200,
  support: 300,
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function iso(value) {
  return asDate(value)?.toISOString() || null
}

function dayKey(value) {
  const date = asDate(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function sourceCoverage(name, rows) {
  const limit = SOURCE_LIMITS[name]
  const scanned = asArray(rows).length
  return {
    source: `Firestore · ${name}`,
    state: 'partial',
    scanned,
    limit,
    reason: 'The deployed read endpoint returns a bounded snapshot without a total or cursor.',
  }
}

function metadata(bundle, names, scope) {
  const sources = names.map((name) => sourceCoverage(name, bundle[name]))
  return {
    asOf: new Date().toISOString(),
    coverage: sources.some((source) => source.state !== 'complete') ? 'partial' : 'complete',
    sources,
    scope,
  }
}

function maskWord(word) {
  if (!word) return word
  return word[0] + '•'.repeat(Math.max(2, word.length - 1))
}

function maskName(value, privacyMode) {
  const name = asString(value)
  if (!name || !privacyMode) return name
  return name.split(/\s+/).map(maskWord).join(' ')
}

function maskEmail(value, privacyMode) {
  const email = asString(value)
  if (!email || !privacyMode) return email
  const [local, domain] = email.split('@')
  if (!domain) return '•••'
  return `${local?.[0] || '•'}•••@${domain}`
}

function maskPhone(value, privacyMode) {
  const phone = asString(value)
  if (!phone || !privacyMode) return phone
  const digits = phone.replace(/\D/g, '')
  return `••••••${digits.slice(-4) || '••••'}`
}

function maskAddress(value, privacyMode) {
  const address = asString(value)
  if (!address || !privacyMode) return address
  return 'Private location hidden for review'
}

function imageRows(value) {
  return asArray(value).flatMap((image) => {
    if (typeof image === 'string') return [{ storagePath: image }]
    if (!image || typeof image !== 'object') return []
    const storagePath = image.storagePath || image.storage_path || image.url
    return typeof storagePath === 'string' ? [{ storagePath }] : []
  })
}

function normalizeNotification(event, privacyMode) {
  return {
    id: String(event.id || ''),
    status: ['sent', 'failed', 'skipped'].includes(event.status) ? event.status : 'skipped',
    at: iso(event.createdAt || event.at),
    templateKey: asString(event.templateKey),
    audience: asString(event.audience),
    destination: maskEmail(event.to || event.destination, privacyMode),
    error: privacyMode && asString(event.error) ? 'Provider failure recorded; details hidden for review.' : asString(event.error),
  }
}

function channelAudit(events, channel, privacyMode) {
  const attempts = asArray(events)
    .filter((event) => String(event.channel || '').toLowerCase() === channel)
    .map((event) => normalizeNotification(event, privacyMode))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
  const counts = { sent: 0, failed: 0, skipped: 0 }
  for (const attempt of attempts) counts[attempt.status] += 1
  return { state: 'complete', counts, latest: attempts[0] || null, attempts }
}

function bundleMaps(bundle) {
  const submissions = new Map(asArray(bundle.submissions).map((row) => [String(row.id), row]))
  const items = new Map(asArray(bundle.items).map((row) => [String(row.id), row]))
  const claims = new Map(asArray(bundle.requests).map((row) => [String(row.id), row]))
  const claimsByItem = new Map()
  for (const claim of claims.values()) {
    const itemId = String(claim.itemId || '')
    if (!claimsByItem.has(itemId)) claimsByItem.set(itemId, [])
    claimsByItem.get(itemId).push(claim)
  }
  const itemsBySubmission = new Map()
  for (const item of items.values()) {
    const submissionId = String(item.submissionId || '')
    if (!itemsBySubmission.has(submissionId)) itemsBySubmission.set(submissionId, [])
    itemsBySubmission.get(submissionId).push(item)
  }
  return { submissions, items, claims, claimsByItem, itemsBySubmission }
}

function personFromSubmission(submission, item, privacyMode) {
  return {
    name: maskName(
      submission?.donorFirstName || item?.donorRecognition || item?.donorFirstName,
      privacyMode,
    ),
    username: asString(submission?.username || item?.donorUsername),
    email: maskEmail(submission?.email || item?.donorEmail, privacyMode),
    phone: maskPhone(submission?.phone || item?.donorPhone, privacyMode),
    locality: asString(
      submission?.publicArea || submission?.pickupLocality || submission?.locality ||
        item?.publicArea || item?.pickupLocality || item?.locality,
    ),
  }
}

function claimSummary(claim, privacyMode) {
  return {
    id: String(claim.id || ''),
    requesterName: maskName(claim.requesterName, privacyMode),
    status: asString(claim.status),
    handoverStage: asString(claim.handoverStage),
    agreedSlotAt: iso(claim.agreedSlotAt),
    createdAt: iso(claim.createdAt),
  }
}

function wallItem(bundle, raw, maps, privacyMode) {
  const submission = maps.submissions.get(String(raw.submissionId || ''))
  const claims = asArray(maps.claimsByItem.get(String(raw.id)))
  const events = claims.flatMap((claim) => asArray(bundle.notifications?.get?.(String(claim.id))))
  return {
    id: String(raw.id || ''),
    submissionId: asString(raw.submissionId),
    title: asString(raw.title) || 'Untitled item',
    description: asString(raw.description),
    category: asString(raw.category),
    gender: asString(raw.gender),
    size: asString(raw.size),
    condition: asString(raw.condition),
    locality: asString(raw.publicArea || raw.pickupLocality || raw.locality),
    status: asString(raw.status),
    publicStatus: asString(raw.publicStatus),
    publicVisibility: typeof raw.publicVisibility === 'boolean' ? raw.publicVisibility : null,
    images: imageRows(raw.images),
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
    dropper: personFromSubmission(submission, raw, privacyMode),
    claims: claims.map((claim) => claimSummary(claim, privacyMode)),
    claimsNextCursor: null,
    notifications: {
      email: channelAudit(events, 'email', privacyMode),
      sms: channelAudit(events, 'sms', privacyMode),
    },
    processing: asString(raw.imageProcessingStatus),
  }
}

function dropRow(bundle, raw, maps, privacyMode) {
  const items = asArray(maps.itemsBySubmission.get(String(raw.id))).map((item) =>
    wallItem(bundle, item, maps, privacyMode),
  )
  return {
    id: String(raw.id || ''),
    reference: asString(raw.reference),
    status: asString(raw.status),
    createdAt: iso(raw.submittedAt || raw.createdAt),
    updatedAt: iso(raw.updatedAt),
    dropper: personFromSubmission(raw, items[0], privacyMode),
    items,
    itemsNextCursor: null,
    hasLinkedItems: items.length > 0,
    internalNotes: null,
    unreadChat: Boolean(raw.unreadChat),
  }
}

function encodeOffset(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url')
}

function decodeOffset(cursor) {
  if (!cursor) return 0
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return Number.isInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : 0
  } catch {
    return 0
  }
}

function paginate(rows, params) {
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || 20))
  const offset = decodeOffset(params.get('cursor'))
  const items = rows.slice(offset, offset + limit)
  return { items, nextCursor: offset + limit < rows.length ? encodeOffset(offset + limit) : null }
}

function contains(haystack, needle) {
  return String(haystack || '').toLocaleLowerCase().includes(needle)
}

export function buildLiveInventoryPage(bundle, kind, params, { privacyMode = true } = {}) {
  const maps = bundleMaps(bundle)
  let rows = kind === 'drops'
    ? asArray(bundle.submissions).map((row) => dropRow(bundle, row, maps, privacyMode))
    : asArray(bundle.items).map((row) => wallItem(bundle, row, maps, privacyMode))
  const status = params.get('status')
  const visibility = params.get('visibility')
  const availability = params.get('availability')
  const category = params.get('category')?.toLocaleLowerCase()
  const gender = params.get('gender')?.toLocaleLowerCase()
  const size = params.get('size')?.toLocaleLowerCase()
  const search = params.get('search')?.trim().toLocaleLowerCase()
  if (status && status !== 'all') rows = rows.filter((row) => row.status === status)
  if (kind === 'wall' && visibility && visibility !== 'all') {
    rows = rows.filter((row) => visibility === 'visible' ? row.publicVisibility === true : row.publicVisibility === false)
  }
  if (kind === 'wall' && availability && availability !== 'all') rows = rows.filter((row) => row.publicStatus === availability)
  if (kind === 'wall' && category) rows = rows.filter((row) => String(row.category || '').toLocaleLowerCase() === category)
  if (kind === 'wall' && gender) rows = rows.filter((row) => String(row.gender || '').toLocaleLowerCase() === gender)
  if (kind === 'wall' && size) rows = rows.filter((row) => String(row.size || '').toLocaleLowerCase() === size)
  if (search) rows = rows.filter((row) => contains(JSON.stringify(row), search))
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  const page = paginate(rows, params)
  return {
    ...metadata(bundle, kind === 'drops' ? ['submissions', 'items', 'requests'] : ['items', 'submissions', 'requests'], 'Current production records available through deployed read endpoints.'),
    ...page,
    order: 'Newest recorded creation first',
  }
}

function notificationAuditFor(bundle, claimId, privacyMode) {
  const events = asArray(bundle.notifications?.get?.(String(claimId)))
  return {
    email: channelAudit(events, 'email', privacyMode),
    sms: channelAudit(events, 'sms', privacyMode),
  }
}

function operationTiming(raw, now) {
  const state = String(raw.deliveryStatus || raw.opsBookingStatus || raw.handoverStage || raw.status || '')
  if (['delivered', 'received', 'handed_over', 'completed'].includes(state)) return 'completed'
  const slot = asDate(raw.agreedSlotAt || raw.proposedSlotAt)
  if (!slot) return 'unscheduled'
  return slot.getTime() < now.getTime() ? 'overdue' : 'scheduled'
}

function operationAction(raw, timing) {
  if (raw.status === 'pending') return { kind: 'review', label: 'Review claim' }
  if (raw.status && raw.status !== 'approved') return { kind: 'closed', label: 'View closed claim' }
  if (timing === 'completed') return { kind: 'complete', label: 'View completed handover' }
  if (
    raw.giverLogistics === 'porter_arranged' &&
    !raw.borzoOrderId &&
    !raw.shiprocketOrderId &&
    !raw.shadowfaxOrderId
  ) {
    if (raw.opsBookingStatus === 'out_for_delivery') {
      return { kind: 'stage', label: 'Confirm delivered', opsStatus: 'delivered' }
    }
    if (raw.opsBookingStatus === 'booked') {
      return { kind: 'stage', label: 'Mark out for delivery', opsStatus: 'out_for_delivery' }
    }
    if (
      (raw.opsBookingStatus === 'ready_to_book' || raw.handoverStage === 'schedule_agreed') &&
      iso(raw.agreedSlotAt) &&
      raw.pickupAddressConfirmedByGiver === true &&
      raw.dropAddressConfirmedByClaimer === true
    ) {
      return { kind: 'stage', label: 'Confirm courier arranged offline', opsStatus: 'booked' }
    }
  }
  return {
    kind: 'coordinate',
    label: iso(raw.agreedSlotAt) ? 'Coordinate handover' : 'Coordinate schedule',
  }
}

function courierState(raw, privacyMode) {
  const id = (value) => value === null || value === undefined ? null : asString(String(value))
  const amount = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null
  const rider = raw.borzoCourier && typeof raw.borzoCourier === 'object' ? raw.borzoCourier : {}
  return {
    bookedVia: asString(raw.courierBookedVia),
    borzo: { orderId: id(raw.borzoOrderId), orderName: asString(raw.borzoOrderName), status: asString(raw.borzoStatus), deliveryStatus: asString(raw.borzoDeliveryStatus), trackingUrl: asString(raw.borzoTrackingUrl), deliveryFee: amount(raw.borzoDeliveryFee), courierName: maskName(rider.name, privacyMode), courierPhone: maskPhone(rider.phone, privacyMode), bookedAt: iso(raw.borzoBookedAt), updatedAt: iso(raw.borzoUpdatedAt) },
    shiprocket: { orderId: id(raw.shiprocketOrderId), shipmentId: id(raw.shiprocketShipmentId), channelOrderId: id(raw.shiprocketChannelOrderId), status: asString(raw.shiprocketStatus), awb: asString(raw.shiprocketAwb), courierName: asString(raw.shiprocketCourierName), trackingUrl: asString(raw.shiprocketTrackingUrl), paymentMethod: asString(raw.shiprocketPaymentMethod), walletBalanceAtBook: amount(raw.shiprocketWalletBalanceAtBook), assignError: asString(raw.shiprocketAssignError), bookedAt: iso(raw.shiprocketBookedAt), updatedAt: iso(raw.shiprocketUpdatedAt) },
    shadowfax: { orderId: id(raw.shadowfaxOrderId), status: asString(raw.shadowfaxStatus), awb: asString(raw.shadowfaxAwb), trackingUrl: asString(raw.shadowfaxTrackingUrl), paymentMethod: asString(raw.shadowfaxPaymentMethod), bookedAt: iso(raw.shadowfaxBookedAt), updatedAt: iso(raw.shadowfaxUpdatedAt) },
    payment: { paidBy: asString(raw.borzoPaidBy), subsidyIndex: amount(raw.borzoSubsidyIndex), subsidyReleased: typeof raw.borzoSubsidyReleased === 'boolean' ? raw.borzoSubsidyReleased : null },
  }
}

function extractIndiaPincode(value) {
  const text = String(value || '')
  const solid = text.match(/\b([1-9]\d{5})\b/)
  if (solid) return solid[1]
  const spaced = text.match(/\b([1-9]\d{2})[\s-]?(\d{3})\b/)
  return spaced ? `${spaced[1]}${spaced[2]}` : null
}

function courierPrerequisites(claim, item, submission, giverProfile = null, claimerProfile = null) {
  const pickupBase = asString(item?.pickupLocality) || asString(submission?.pickupLocality) || asString(submission?.locality) || asString(giverProfile?.address) || asString(claim.pickupLocality)
  const dropBase = asString(claim.requesterAddress) || asString(claimerProfile?.address) || asString(claim.note)
  const pickupPincode = extractIndiaPincode(pickupBase) || extractIndiaPincode(claim.pickupLocality) || extractIndiaPincode(item?.pincode) || extractIndiaPincode(item?.pickupLocality) || extractIndiaPincode(submission?.pincode) || extractIndiaPincode(submission?.pickupLocality) || extractIndiaPincode(submission?.locality) || extractIndiaPincode(giverProfile?.pincode) || extractIndiaPincode(giverProfile?.address)
  const dropPincode = extractIndiaPincode(dropBase) || extractIndiaPincode(claim.requesterAddress) || extractIndiaPincode(claim.note) || extractIndiaPincode(claimerProfile?.pincode) || extractIndiaPincode(claimerProfile?.address)
  const withPin = (address, pin) => address && pin && !extractIndiaPincode(address) ? `${address} ${pin}` : address
  return {
    pickupAddress: withPin(pickupBase, pickupPincode), dropAddress: withPin(dropBase, dropPincode),
    pickupPincode, dropPincode,
    state: pickupPincode && dropPincode ? 'complete' : 'partial',
  }
}

function operationRow(bundle, raw, maps, { now, privacyMode }) {
  const claim = maps.claims.get(String(raw.id)) || raw
  const item = maps.items.get(String(claim.itemId || raw.itemId || ''))
  const submission = maps.submissions.get(String(item?.submissionId || ''))
  const pickupLat = Number(submission?.latitude)
  const pickupLng = Number(submission?.longitude)
  const destinationLat = Number(claim.requesterLatitude)
  const destinationLng = Number(claim.requesterLongitude)
  const coordinatesAvailable = [pickupLat, pickupLng, destinationLat, destinationLng].every(Number.isFinite)
  const reviewCoordinate = (value) => privacyMode ? Math.round(value * 100) / 100 : value
  const operation = { ...claim, ...raw }
  const timing = operationTiming(operation, now)
  const action = operationAction(operation, timing)
  const status = asString(raw.deliveryStatus || raw.opsBookingStatus || raw.handoverStage || claim.handoverStage || claim.status)
  return {
    id: String(raw.id || claim.id || ''),
    itemId: asString(claim.itemId || raw.itemId),
    itemTitle: asString(raw.itemTitle || claim.itemTitle || item?.title),
    itemImages: imageRows(raw.itemImages || claim.itemImages || item?.images),
    giverName: maskName(raw.giverName || submission?.donorFirstName || item?.donorRecognition, privacyMode),
    giverEmail: maskEmail(raw.giverEmail || submission?.email, privacyMode),
    giverPhone: maskPhone(raw.giverPhone || submission?.phone, privacyMode),
    requesterName: maskName(raw.requesterName || claim.requesterName, privacyMode),
    requesterEmail: maskEmail(raw.requesterEmail || claim.requesterEmail, privacyMode),
    requesterPhone: maskPhone(raw.requesterPhone || claim.requesterPhone, privacyMode),
    pickupLocality: asString(raw.pickupLocality || submission?.pickupLocality || submission?.publicArea),
    pickupAddress: maskAddress(submission?.deliveryAddress || raw.pickupAddress || raw.pickupLocality, privacyMode),
    requesterAddress: maskAddress(raw.requesterAddress || claim.requesterAddress, privacyMode),
    logistics: asString(raw.giverLogistics || claim.giverLogistics || submission?.giverLogistics),
    status,
    createdAt: iso(raw.createdAt || claim.createdAt),
    updatedAt: iso(raw.updatedAt || claim.updatedAt),
    agreedSlotAt: iso(raw.agreedSlotAt || claim.agreedSlotAt),
    proposedSlotAt: iso(raw.proposedSlotAt || claim.proposedSlotAt),
    nextAction: { label: action.label, href: `/admin/orders?claimId=${encodeURIComponent(String(raw.id || claim.id || ''))}` },
    notifications: notificationAuditFor(bundle, raw.id || claim.id, privacyMode),
    claimStatus: asString(claim.status),
    handoverStage: asString(raw.handoverStage || claim.handoverStage),
    opsBookingStatus: asString(raw.opsBookingStatus || claim.opsBookingStatus),
    deliveryStatus: asString(raw.deliveryStatus || claim.deliveryStatus),
    courier: courierState(operation, privacyMode),
    courierPrerequisites: courierPrerequisites(operation, item, submission),
    note: privacyMode && asString(claim.note) ? 'Private note hidden for review.' : asString(claim.note),
    opsNote: privacyMode && asString(raw.opsNote) ? 'Private note hidden for review.' : asString(raw.opsNote),
    timing,
    action,
    map: coordinatesAvailable ? {
      state: 'available', reason: 'Recorded production coordinates.',
      pickup: { latitude: reviewCoordinate(pickupLat), longitude: reviewCoordinate(pickupLng) },
      destination: { latitude: reviewCoordinate(destinationLat), longitude: reviewCoordinate(destinationLng) },
    } : { state: 'unavailable', reason: 'Map location unavailable.', pickup: null, destination: null },
  }
}

function operationRows(bundle, kind, options) {
  const maps = bundleMaps(bundle)
  const rawRows = kind === 'deliveries' ? asArray(bundle.orders) : asArray(bundle.requests)
  return rawRows.map((row) => operationRow(bundle, row, maps, options))
}

export function buildLiveOperationsPage(bundle, kind, params, { now = new Date(), privacyMode = true } = {}) {
  let rows = operationRows(bundle, kind, { now, privacyMode })
  const status = params.get('status')
  const view = params.get('view') || 'all'
  if (status && status !== 'all') rows = rows.filter((row) => row.claimStatus === status || row.status === status)
  if (kind === 'deliveries') {
    const today = dayKey(now)
    const end48 = now.getTime() + 48 * 60 * 60 * 1000
    if (view === 'today') rows = rows.filter((row) => dayKey(row.agreedSlotAt || row.proposedSlotAt) === today)
    else if (view === 'next48h') rows = rows.filter((row) => {
      const time = asDate(row.agreedSlotAt || row.proposedSlotAt)?.getTime()
      return time && time >= now.getTime() && time <= end48
    })
    else if (view === 'overdue') rows = rows.filter((row) => row.timing === 'overdue')
    else if (view === 'unscheduled') rows = rows.filter((row) => row.timing === 'unscheduled')
    else if (view === 'completed') rows = rows.filter((row) => row.timing === 'completed')
    else if (view === 'calendar' && params.get('day')) {
      const day = params.get('day')
      const days = params.get('span') === 'week' ? 7 : 1
      const start = Date.parse(`${day}T00:00:00+05:30`)
      const end = start + days * 86400000
      rows = rows.filter((row) => {
        const time = asDate(row.agreedSlotAt || row.proposedSlotAt)?.getTime()
        return time && time >= start && time < end
      })
    }
  }
  rows.sort((a, b) => String(a.agreedSlotAt || a.proposedSlotAt || a.createdAt || '').localeCompare(String(b.agreedSlotAt || b.proposedSlotAt || b.createdAt || '')))
  return {
    ...metadata(bundle, kind === 'deliveries' ? ['orders', 'requests', 'items', 'submissions'] : ['requests', 'items', 'submissions'], 'Current production claims and delivery records.'),
    ...paginate(rows, params),
    order: 'Scheduled time, then recorded creation time',
  }
}

function supportRows(bundle, privacyMode) {
  const chats = asArray(bundle.support)
    .filter((row) => row.subjectType === 'support')
    .map((row) => ({
      id: `ask:${row.id}`,
      sourceId: String(row.id || ''),
      chatSubjectId: asString(row.subjectId),
      source: 'ask_reloved',
      state: row.unreadForAdmin ? 'unread' : 'open',
      person: maskName(row.ownerName || row.claimerName || 'Reloved visitor', privacyMode),
      email: maskEmail(row.ownerEmail, privacyMode),
      phone: maskPhone(row.ownerPhone, privacyMode),
      subject: privacyMode ? 'Ask Reloved conversation' : asString(row.itemTitle) || 'Ask Reloved conversation',
      preview: privacyMode && asString(row.lastMessagePreview) ? 'Message hidden for privacy review.' : asString(row.lastMessagePreview) || 'No message preview available',
      occurredAt: iso(row.lastMessageAt),
      linked: { itemId: asString(row.itemId), dropId: asString(row.submissionId), claimId: asString(row.claimId) },
    }))
  const contacts = asArray(bundle.contacts).map((row) => ({
    id: `contact:${row.id}`,
    sourceId: String(row.id || ''),
    chatSubjectId: null,
    source: 'contact_form',
    state: ['actioned', 'resolved', 'closed'].includes(String(row.status || '')) ? 'actioned' : row.status === 'new' ? 'unread' : 'open',
    person: maskName(row.name || 'Website visitor', privacyMode),
    email: maskEmail(row.email, privacyMode),
    phone: maskPhone(row.phone, privacyMode),
    subject: privacyMode ? 'Website contact request' : asString(row.subject) || 'Website contact request',
    preview: privacyMode && asString(row.message) ? 'Message hidden for privacy review.' : asString(row.message) || 'No message preview available',
    occurredAt: iso(row.createdAt),
    linked: { itemId: asString(row.itemId), dropId: asString(row.submissionId), claimId: asString(row.claimId) },
  }))
  return [...chats, ...contacts].sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')))
}

export function buildLiveSupportPage(bundle, params, { privacyMode = true } = {}) {
  const view = params.get('view') || 'unread'
  let rows = supportRows(bundle, privacyMode)
  if (view !== 'all') rows = rows.filter((row) => row.state === view)
  const threadId = params.get('threadId')
  const messageId = params.get('messageId')
  const focused = rows.find((row) => row.sourceId === threadId || row.sourceId === messageId) || null
  return {
    ...metadata(bundle, ['support', 'contacts'], 'Current Ask Reloved and website contact records.'),
    ...paginate(rows, params),
    order: 'Most recent activity first',
    focused,
  }
}

function severityRank(value) {
  return value === 'critical' ? 0 : value === 'warning' ? 1 : 2
}

function attentionRows(bundle, { now, privacyMode }) {
  const rows = []
  const deliveries = operationRows(bundle, 'deliveries', { now, privacyMode })
  for (const [claimId, events] of bundle.notifications || new Map()) {
    for (const event of asArray(events)) {
      if (event.status !== 'failed') continue
      rows.push({
        id: `communication:${event.id}`,
        category: 'messaging', severity: 'critical', type: `failed_${event.channel || 'message'}`,
        title: `${String(event.channel || 'Message').toUpperCase()} delivery failed`,
        description: 'A recorded customer communication failed and needs review.',
        entityLabel: deliveries.find((row) => row.id === String(claimId))?.itemTitle || 'Claim communication',
        recorded: { subject: privacyMode && asString(event.subject) ? 'Notification content hidden for review.' : asString(event.subject), preview: privacyMode && asString(event.previewBody) ? 'Notification content hidden for review.' : asString(event.previewBody), error: privacyMode && asString(event.error) ? 'Provider failure recorded; details hidden for review.' : asString(event.error) },
        entity: { type: 'claim', id: String(claimId) }, occurredAt: iso(event.createdAt), dueAt: null,
        nextAction: { label: 'Open delivery', href: `/admin/orders?claimId=${encodeURIComponent(String(claimId))}` },
      })
    }
  }
  for (const row of deliveries) {
    if (row.timing !== 'overdue' && dayKey(row.agreedSlotAt || row.proposedSlotAt) !== dayKey(now)) continue
    rows.push({
      id: `delivery:${row.id}`, category: 'delivery', severity: row.timing === 'overdue' ? 'critical' : 'warning',
      type: row.timing === 'overdue' ? 'overdue_delivery' : 'delivery_due_today',
      title: row.timing === 'overdue' ? 'Delivery is overdue' : 'Delivery is due today',
      description: row.itemTitle || 'Scheduled handover', entityLabel: row.itemTitle || 'Delivery', entity: { type: 'claim', id: row.id },
      occurredAt: row.updatedAt || row.createdAt, dueAt: row.agreedSlotAt || row.proposedSlotAt,
      nextAction: { label: 'Open delivery', href: `/admin/orders?claimId=${encodeURIComponent(row.id)}` },
    })
  }
  for (const claim of asArray(bundle.requests)) {
    const status = String(claim.status || '')
    const missingAddress = !asString(claim.requesterAddress)
    const missingSchedule = status === 'approved' && !asDate(claim.agreedSlotAt || claim.proposedSlotAt)
    if (!['pending', 'submitted'].includes(status) && !missingAddress && !missingSchedule) continue
    rows.push({
      id: `claim:${claim.id}`, category: 'claims', severity: 'warning',
      type: missingAddress ? 'missing_address' : missingSchedule ? 'missing_schedule' : 'claim_pending',
      title: missingAddress ? 'Claim needs an address' : missingSchedule ? 'Claim needs a schedule' : 'Claim needs a decision',
      description: asString(claim.itemTitle) || 'Claim record', entityLabel: asString(claim.itemTitle) || 'Claim', entity: { type: 'claim', id: String(claim.id) },
      occurredAt: iso(claim.updatedAt || claim.createdAt), dueAt: null,
      nextAction: { label: 'Open claim', href: `/admin/item-requests?claimId=${encodeURIComponent(String(claim.id))}` },
    })
  }
  for (const support of supportRows(bundle, privacyMode).filter((row) => row.state === 'unread')) {
    rows.push({
      id: `support:${support.id}`, category: 'support', severity: 'warning', type: 'unread_support',
      title: 'Unread support message', description: support.subject, entityLabel: support.person, recorded: { subject: support.subject, preview: support.preview, error: null }, entity: { type: 'support', id: support.sourceId },
      occurredAt: support.occurredAt, dueAt: null,
      nextAction: { label: 'Open support', href: support.source === 'contact_form' ? `/admin/messages?messageId=${encodeURIComponent(support.sourceId)}` : `/admin/messages?threadId=${encodeURIComponent(support.sourceId)}` },
    })
  }
  return rows.map((row) => ({ ...row, actions: [
    { ...row.nextAction, kind: 'view', primary: true },
    ...(row.category === 'claims' || row.category === 'delivery' ? [{ label: 'Contact people', href: `${row.nextAction.href}#masked-calls`, kind: 'view', primary: false }] : []),
  ] })).sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || String(b.dueAt || b.occurredAt || '').localeCompare(String(a.dueAt || a.occurredAt || '')))
}

export function buildLiveAttentionPage(bundle, params, { now = new Date(), privacyMode = true } = {}) {
  let rows = attentionRows(bundle, { now, privacyMode })
  const category = params.get('category') || 'all'
  if (category !== 'all') rows = rows.filter((row) => row.category === category)
  return {
    ...metadata(bundle, ['orders', 'requests', 'support', 'contacts'], 'Actionable conditions derived from current production records.'),
    ...paginate(rows, params),
    order: 'Urgency, then due time',
  }
}

function kpi(id, label, value, scope, href, definition, source = 'Production Admin API') {
  return { id, label, value: Number.isFinite(value) ? value : null, state: Number.isFinite(value) ? 'complete' : 'unavailable', reason: Number.isFinite(value) ? null : 'The deployed read source did not return this metric.', definition, source, scope, href }
}

export function buildLiveOverview(bundle, { range = '24h', now = new Date(), privacyMode = true } = {}) {
  const analytics = bundle.analytics || {}
  const totals = analytics.totals || {}
  const period = analytics.periodTotals || {}
  const claims = analytics.claimStatus || {}
  const operations = operationRows(bundle, 'deliveries', { now, privacyMode })
  const today = dayKey(now)
  const end48 = now.getTime() + 48 * 60 * 60 * 1000
  const deliveriesToday = operations.filter((row) => dayKey(row.agreedSlotAt || row.proposedSlotAt) === today)
  const next48h = operations.filter((row) => {
    const time = asDate(row.agreedSlotAt || row.proposedSlotAt)?.getTime()
    return time && time > now.getTime() && time <= end48 && dayKey(time) !== today
  })
  const undated = operations.filter((row) => !row.agreedSlotAt && !row.proposedSlotAt)
  const attention = attentionRows(bundle, { now, privacyMode })
  const rangeLabel = range === '24h' ? 'Today' : range === '7d' ? 'Last 7 days' : 'Last 30 days'
  const exactStart = now.getTime() - (range === '30d' ? 30 : range === '7d' ? 7 : 1) * 86400000
  const inSelectedRange = (row, fields) => fields.some((field) => {
    const at = asDate(row[field])?.getTime()
    return at && at >= exactStart && at < now.getTime()
  })
  const latestDaily = asArray(analytics.series).at(-1) || {}
  const selectedNewUsers = range === '24h' ? Number(latestDaily.accounts) : Number(period.accounts)
  const selectedDrops = range === '24h'
    ? asArray(bundle.submissions).filter((row) => inSelectedRange(row, ['submittedAt', 'createdAt'])).length
    : Number(period.gives)
  const selectedClaims = range === '24h'
    ? asArray(bundle.requests).filter((row) => inSelectedRange(row, ['createdAt', 'submittedAt'])).length
    : Number(period.claims)
  const matchedCount = Number(
    bundle.overview?.counts?.matched ??
      (Array.isArray(bundle.overview?.matched)
        ? bundle.overview.matched.length
        : claims.matched ?? claims.accepted),
  )
  return {
    ...metadata(bundle, ['orders', 'requests', 'items', 'submissions', 'support', 'contacts'], `${rangeLabel} production snapshot. Times use India Standard Time.`),
    range,
    timezone: IST_TIME_ZONE,
    rangeStart: new Date(exactStart).toISOString(),
    kpis: [
      kpi('users', 'Users', Number(totals.accounts), 'All time', '/admin/analytics', 'Registered accounts excluding known test identities.'),
      kpi('newUsers', 'New users', selectedNewUsers, rangeLabel, '/admin/analytics', 'Accounts created in the selected period.'),
      kpi('drops', 'Drops', selectedDrops, rangeLabel, '/admin/donations', 'Drops submitted in the selected period.'),
      kpi('claims', 'Claims', selectedClaims, rangeLabel, '/admin/item-requests', 'Claims created in the selected period.'),
      kpi('matched', 'Matched', matchedCount, 'Current state', '/admin/item-requests', 'Claims currently recorded as matched or accepted.'),
      kpi('completed', 'Reloved', Number(totals.reloved), 'All time', '/admin/items?availability=reloved', 'Items recorded as successfully Reloved.'),
    ],
    windows: {
      todayStart: `${today}T00:00:00+05:30`,
      todayEnd: `${today}T23:59:59+05:30`,
      next48Start: now.toISOString(),
      next48End: new Date(end48).toISOString(),
    },
    deliveries: { state: 'complete', today: deliveriesToday, next48h, undated },
    waitingOnPeople: attention.filter((row) => row.category === 'claims' || row.category === 'support').slice(0, 8),
    messagingFailures: attention.filter((row) => row.category === 'messaging').slice(0, 8),
  }
}

export function buildLiveDropFunnel(bundle) {
  const funnel = bundle.analytics?.giveFunnel || {}
  const values = [
    ['started', 'Drop started', funnel.started],
    ['photos', 'Photos/details', funnel.donation_step_viewed ?? bundle.analytics?.productTotals?.donation_step_viewed],
    ['auth', 'Identity complete', bundle.analytics?.accountFunnel?.onboarding_completed],
    ['submitted', 'Submitted', funnel.submitted],
    ['visible', 'Visible on Wall', funnel.on_wall],
  ]
  return {
    ...metadata(bundle, ['submissions', 'items'], 'Selected-period production Give journey evidence.'),
    steps: values.map(([id, label, value]) => ({ id, label, value: Number.isFinite(Number(value)) ? Number(value) : null, source: 'Production analytics mirror', reason: value == null ? 'Not enough reliable data yet.' : null })),
  }
}

export function buildLiveClaimFunnel(bundle) {
  const funnel = bundle.analytics?.claimFunnel || {}
  const values = [
    ['viewed', 'Item viewed', funnel.item_viewed],
    ['started', 'Claim started', funnel.claim_started],
    ['submitted', 'Claim submitted', funnel.claim_submitted],
    ['decision', 'Giver decision', funnel.matched],
    ['matched', 'Matched', funnel.matched],
    ['scheduled', 'Delivery scheduled', asArray(bundle.orders).filter((row) => row.agreedSlotAt || row.proposedSlotAt).length],
    ['reloved', 'Reloved', funnel.reloved],
  ]
  return {
    ...metadata(bundle, ['requests', 'orders'], 'Selected-period production Claim journey evidence.'),
    steps: values.map(([id, label, value]) => ({ id, label, value: Number.isFinite(Number(value)) ? Number(value) : null, source: 'Production operations and analytics mirror', reason: value == null ? 'Not enough reliable data yet.' : null })),
  }
}

export function buildLiveInventoryDetail(bundle, kind, id, { privacyMode = true } = {}) {
  const maps = bundleMaps(bundle)
  const row = kind === 'drops' ? maps.submissions.get(id) : maps.items.get(id)
  if (!row) return null
  const mapped = kind === 'drops' ? dropRow(bundle, row, maps, privacyMode) : wallItem(bundle, row, maps, privacyMode)
  return { ...metadata(bundle, kind === 'drops' ? ['submissions', 'items', 'requests'] : ['items', 'submissions', 'requests'], 'Exact production record detail.'), ...mapped }
}

export function buildLiveOperationDetail(bundle, id, { now = new Date(), privacyMode = true } = {}) {
  const raw = asArray(bundle.orders).find((row) => String(row.id) === id) || asArray(bundle.requests).find((row) => String(row.id) === id)
  if (!raw) return null
  return { ...metadata(bundle, ['orders', 'requests', 'items', 'submissions'], 'Exact production claim and delivery detail.'), ...operationRow(bundle, raw, bundleMaps(bundle), { now, privacyMode }) }
}

export function buildLiveCommunications(bundle, id, { privacyMode = true } = {}) {
  const events = asArray(bundle.notifications?.get?.(id)).map((event) => ({
    ...normalizeNotification(event, privacyMode),
    channel: asString(event.channel) || 'unknown',
    subject: privacyMode && asString(event.subject) ? 'Notification content hidden for review.' : asString(event.subject),
    previewBody: privacyMode && asString(event.previewBody) ? 'Notification content hidden for review.' : asString(event.previewBody),
    params: {},
  }))
  return { ...metadata(bundle, ['orders'], 'Recorded production notification attempts for this delivery.'), items: events, nextCursor: null, order: 'Most recent first' }
}

function analyticsMetric(id, label, value, {
  format = 'number', state, previousValue = null, source = 'Production operations',
  definition = label, message = null,
} = {}) {
  const numeric = value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)
  const resolvedState = state || (numeric === null ? 'insufficient_data' : 'ready')
  const previous = previousValue === null || previousValue === undefined || !Number.isFinite(Number(previousValue)) ? null : Number(previousValue)
  const changePercent = numeric !== null && previous !== null && previous !== 0 ? ((numeric - previous) / previous) * 100 : null
  return { id, label, value: numeric, state: resolvedState, format, previousValue: previous, changePercent, source, definition, message }
}

function sectionMeta(state, source, message = null) {
  return { state, source, message }
}

function productSeries(analytics, id, label, color, selector) {
  return {
    id, label, color,
    points: asArray(analytics?.series).map((row) => ({ at: String(row.day), value: Number(selector(row) || 0) })),
  }
}

function ranked(rows, valueKey = 'count') {
  return asArray(rows).map((row, index) => ({
    id: `${index}:${String(row.label || row.name || 'Unknown')}`,
    label: String(row.label || row.name || 'Unknown'),
    value: Number(row[valueKey] || row.value || 0),
    secondaryValue: row.secondaryValue == null ? null : Number(row.secondaryValue),
    secondaryLabel: asString(row.secondaryLabel),
  }))
}

function funnelStep(id, label, value) {
  const numeric = value == null || !Number.isFinite(Number(value)) ? null : Number(value)
  // These production counters are aggregated events and entity states, not a
  // cohort-aligned sequence. Showing step conversion would be misleading.
  const rate = null
  return { id, label, value: numeric, rateFromPrevious: rate, state: numeric === null ? 'insufficient_data' : 'ready', message: numeric === null ? 'Not enough reliable data yet.' : null }
}

function buildFunnel(id, label, rows) {
  const steps = rows.map(([stepId, stepLabel, value]) => {
    return funnelStep(stepId, stepLabel, value)
  })
  return { id, label, state: steps.some((step) => step.value === null) ? 'partial' : 'ready', message: steps.some((step) => step.value === null) ? 'Some journey stages are not mirrored reliably yet.' : null, steps }
}

function comparisonRows(supplyRows, demandRows) {
  const supply = new Map(asArray(supplyRows).map((row) => [String(row.label || 'Unknown'), Number(row.count || row.supply || 0)]))
  const demand = new Map(asArray(demandRows).map((row) => [String(row.label || 'Unknown'), Number(row.count || row.demand || 0)]))
  return [...new Set([...supply.keys(), ...demand.keys()])].map((label) => ({ id: label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'), label, supply: supply.get(label) || 0, demand: demand.get(label) || 0 }))
}

function sizeComparisons(bundle) {
  const maps = bundleMaps(bundle)
  const supply = new Map()
  const demand = new Map()
  for (const item of asArray(bundle.items)) {
    const label = asString(item.size) || 'Unknown'
    supply.set(label, (supply.get(label) || 0) + 1)
  }
  for (const claim of asArray(bundle.requests)) {
    const label = asString(maps.items.get(String(claim.itemId))?.size) || 'Unknown'
    demand.set(label, (demand.get(label) || 0) + 1)
  }
  const rows = [...new Set([...supply.keys(), ...demand.keys()])]
    .map((label) => ({ id: label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'), label, supply: supply.get(label) || 0, demand: demand.get(label) || 0 }))
    .sort((a, b) => b.supply + b.demand - (a.supply + a.demand))
  if (rows.length <= 9) return rows
  const visible = rows.slice(0, 8)
  const remainder = rows.slice(8)
  visible.push({
    id: 'other-sizes',
    label: 'Other sizes',
    supply: remainder.reduce((total, row) => total + row.supply, 0),
    demand: remainder.reduce((total, row) => total + row.demand, 0),
  })
  return visible
}

function previousPeriodTotals(bundle, rangeDays) {
  const series = asArray(bundle.analyticsComparison?.series)
  if (series.length < rangeDays * 2) return {}
  const previous = series.slice(-(rangeDays * 2), -rangeDays)
  const sum = (key) => previous.reduce((total, row) => total + Number(row[key] || 0), 0)
  return { gives: sum('gives'), claims: sum('claims'), accounts: sum('accounts') }
}

function lastAnalyticsActivity(analytics) {
  const rows = asArray(analytics?.series).filter((row) => {
    const product = row.product && typeof row.product === 'object' ? Object.values(row.product) : []
    return ['gives', 'claims', 'accounts', 'waitlist', 'contacts'].some((key) => Number(row[key] || 0) > 0) || product.some((value) => Number(value || 0) > 0)
  })
  const day = rows.at(-1)?.day
  return day ? `${day}T23:59:59+05:30` : null
}

function lastNotificationActivity(bundle) {
  const dates = [...(bundle.notifications || new Map()).values()].flatMap(asArray).map((row) => iso(row.createdAt)).filter(Boolean).sort()
  return dates.at(-1) || null
}

export function buildLiveAnalyticsSnapshot(bundle, range = '7d', {
  now = new Date(), capabilities = {}, pageSpeed = { state: 'unavailable', message: 'PageSpeed data is unavailable.', devices: [] },
  bundles = { totalBytes: null, jsBytes: null, assets: [] },
  integrationStatuses = {},
} = {}) {
  const analytics = bundle.analytics || {}
  const totals = analytics.totals || {}
  const period = analytics.periodTotals || {}
  const claimStatus = analytics.claimStatus || {}
  const itemStatus = analytics.itemStatus || {}
  const insights = analytics.insights || {}
  const days = range === '30d' ? 30 : range === '14d' ? 14 : 7
  const previous = previousPeriodTotals(bundle, days)
  const unavailableBehavior = 'Product behavior data is not connected for this review.'
  const overviewMetrics = [
    analyticsMetric('users', 'Users', totals.accounts, { definition: 'Registered accounts excluding known tester identities.' }),
    analyticsMetric('newUsers', 'New users', period.accounts, { previousValue: previous.accounts, definition: 'Accounts created in the selected period.' }),
    analyticsMetric('activeUsers', 'Active users', null, { state: capabilities.posthog ? 'unavailable' : 'not_configured', message: unavailableBehavior, source: 'PostHog' }),
    analyticsMetric('pageViews', 'Page views', null, { state: capabilities.posthog ? 'unavailable' : 'not_configured', message: unavailableBehavior, source: 'PostHog' }),
    analyticsMetric('drops', 'Drops', period.gives, { previousValue: previous.gives, definition: 'Drops submitted in the selected period.' }),
    analyticsMetric('claims', 'Claims', period.claims, { previousValue: previous.claims, definition: 'Claims created in the selected period.' }),
    analyticsMetric(
      'matched',
      'Matched',
      bundle.overview?.counts?.matched ??
        (Array.isArray(bundle.overview?.matched)
          ? bundle.overview.matched.length
          : claimStatus.matched ?? claimStatus.accepted),
      { definition: 'Claims currently recorded as matched or accepted.' },
    ),
    analyticsMetric('reloved', 'Reloved', totals.reloved, { definition: 'Items recorded as successfully Reloved.' }),
  ]
  const activity = [
    productSeries(analytics, 'drops', 'Drops', 'pink', (row) => row.gives),
    productSeries(analytics, 'claims', 'Claims', 'green', (row) => row.claims),
  ]
  const give = analytics.giveFunnel || {}
  const claim = analytics.claimFunnel || {}
  const dropFunnel = buildFunnel('drop', 'Drop journey', [
    ['started', 'Started', give.started],
        ['submitted', 'Submitted', give.submitted],
    ['visible', 'Visible on Wall', give.on_wall],
    ['completed', 'Completed', give.reloved],
  ])
  const claimFunnel = buildFunnel('claim', 'Claim journey', [
    ['viewed', 'Item viewed', claim.item_viewed],
    ['started', 'Claim started', claim.claim_started],
    ['submitted', 'Submitted', claim.claim_submitted],
    ['matched', 'Matched', claim.matched],
    ['reloved', 'Reloved', claim.reloved],
  ])
  const interactions = Object.entries(analytics.productTotals || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => ({ id: key, label: key.replace(/_/g, ' '), value: Number(value), secondaryValue: null, secondaryLabel: null }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
  const categoryRows = asArray(insights.supplyDemand).map((row) => ({ id: String(row.label || 'unknown').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'), label: String(row.label || 'Unknown'), supply: Number(row.given || 0), demand: Number(row.claimed || 0) }))
  const audienceRows = comparisonRows(insights.byGender?.supply, insights.byGender?.demand)
  const wallStatus = Object.entries(itemStatus).map(([key, value]) => ({ id: key, label: key.replace(/_/g, ' '), value: Number(value || 0), secondaryValue: null, secondaryLabel: null }))
  const notificationEvents = [...(bundle.notifications || new Map()).values()].flatMap(asArray)
  const failedNotifications = notificationEvents.filter((event) => event.status === 'failed').length
  const maps = bundleMaps(bundle)
  const healthIssues = [
    { id: 'processingImages', label: 'Items processing images', count: asArray(bundle.items).filter((row) => !['complete', 'completed', 'ready'].includes(String(row.imageProcessingStatus || '').toLowerCase())).length, severity: 'warning', href: '/admin/items', message: null },
    { id: 'hiddenWithdrawn', label: 'Hidden or withdrawn items', count: asArray(bundle.items).filter((row) => row.publicVisibility === false || row.publicStatus === 'withdrawn').length, severity: 'info', href: '/admin/items', message: null },
    { id: 'missingDropper', label: 'Items missing dropper identity', count: asArray(bundle.items).filter((row) => { const sub = maps.submissions.get(String(row.submissionId || '')); return !(row.donorTarget || row.donorRecognition || sub?.donorFirstName || sub?.email || sub?.phone) }).length, severity: 'warning', href: '/admin/items', message: null },
    { id: 'missingItem', label: 'Claims missing a linked item', count: asArray(bundle.requests).filter((row) => !maps.items.has(String(row.itemId || ''))).length, severity: 'critical', href: '/admin/item-requests', message: null },
    { id: 'missingAddress', label: 'Claims missing destination address', count: asArray(bundle.requests).filter((row) => !asString(row.requesterAddress)).length, severity: 'warning', href: '/admin/item-requests', message: null },
    { id: 'staleDeliveries', label: 'Overdue scheduled deliveries', count: operationRows(bundle, 'deliveries', { now, privacyMode: true }).filter((row) => row.timing === 'overdue').length, severity: 'critical', href: '/admin/orders?view=overdue', message: null },
    { id: 'failedNotifications', label: 'Failed notifications', count: failedNotifications, severity: 'critical', href: '/admin/notifications?category=messaging', message: null },
  ]
  const liveWallCount = asArray(bundle.items).filter((row) => row.publicVisibility === true).length
  const templates = asArray(integrationStatuses.templates?.templates)
  const communicationStatus = (channel, configured) => {
    if (!configured) return { status: 'not_configured', detail: 'Provider credentials or approved templates are not configured.' }
    const events = notificationEvents.filter((event) => String(event.channel || '').toLowerCase() === channel)
    const sent = events.filter((event) => event.status === 'sent').length
    const failed = events.filter((event) => event.status === 'failed').length
    if (failed) return { status: 'degraded', detail: `${sent} sent and ${failed} failed attempts in loaded production history.` }
    if (sent) return { status: 'unavailable', detail: `${sent} sent attempts recorded in loaded production history; vendor delivery and health are unverified.` }
    return { status: 'unavailable', detail: 'Configured in production; no delivery attempt is available in the bounded review history.' }
  }
  const liveProviderStatus = (payload, configured, healthyDetail) => {
    if (payload?.unavailable) return { status: 'unavailable', detail: 'Production status endpoint did not respond.' }
    if (payload?.configured === false) return { status: 'not_configured', detail: String(payload.message || 'Not configured.') }
    if (payload?.error) return { status: 'degraded', detail: String(payload.error) }
    if (payload?.configured === true) return { status: 'healthy', detail: String(payload.message || healthyDetail) }
    return configured
      ? { status: 'unavailable', detail: 'Configured in production; live readiness could not be confirmed.' }
      : { status: 'not_configured', detail: 'Not configured.' }
  }
  const brevo = communicationStatus('email', capabilities.brevo || templates.some((template) => template.brevoTemplateId))
  const msg91 = communicationStatus('sms', capabilities.msg91 || templates.some((template) => template.msg91TemplateId))
  const edesy = liveProviderStatus(integrationStatuses.edesy, capabilities.edesy, 'Masked calling is configured.')
  const borzo = liveProviderStatus(integrationStatuses.borzo, Boolean(capabilities.couriers), 'Borzo read status is available.')
  const shiprocket = liveProviderStatus(integrationStatuses.shiprocket, Boolean(capabilities.couriers), 'Shiprocket read status is available.')
  if (shiprocket.status === 'healthy' && integrationStatuses.shiprocket?.walletReady === false) {
    shiprocket.status = 'degraded'
  }
  const shadowfax = liveProviderStatus(integrationStatuses.shadowfax, Boolean(capabilities.couriers), 'Shadowfax read status is available.')
  const integrations = [
    { id: 'firestore', label: 'Firestore', status: 'degraded', detail: 'Bounded production snapshots have no completeness metadata; global totals are unavailable.', checkedAt: now.toISOString() },
    { id: 'brevo', label: 'Brevo email', ...brevo, checkedAt: now.toISOString() },
    { id: 'msg91', label: 'MSG91 SMS', ...msg91, checkedAt: now.toISOString() },
    { id: 'edesy', label: 'Edesy masked calls', ...edesy, checkedAt: now.toISOString() },
    { id: 'borzo', label: 'Borzo', ...borzo, checkedAt: now.toISOString() },
    { id: 'shiprocket', label: 'Shiprocket', ...shiprocket, checkedAt: now.toISOString() },
    { id: 'shadowfax', label: 'Shadowfax', ...shadowfax, checkedAt: now.toISOString() },
    { id: 'posthog', label: 'PostHog', status: capabilities.posthog ? 'degraded' : 'not_configured', detail: capabilities.posthog ? 'The behavior analytics reader did not return data.' : 'Behavior analytics read access is not connected.', checkedAt: now.toISOString() },
    { id: 'ga4', label: 'Google Analytics', status: capabilities.ga4 ? 'degraded' : 'not_configured', detail: capabilities.ga4 ? 'The audience analytics reader did not return data.' : 'Audience analytics read access is not connected.', checkedAt: now.toISOString() },
    { id: 'searchConsole', label: 'Search Console', status: capabilities.searchConsole ? 'degraded' : 'not_configured', detail: capabilities.searchConsole ? 'Search reporting did not return data.' : 'Search reporting read access is not connected.', checkedAt: now.toISOString() },
    { id: 'crux', label: 'Chrome field data', status: capabilities.crux ? 'degraded' : 'not_configured', detail: capabilities.crux ? 'Chrome field data did not return a report.' : 'Chrome field data read access is not connected.', checkedAt: now.toISOString() },
  ]
  const pageSpeedDevices = asArray(pageSpeed.devices)
  const labState = pageSpeed.state || (pageSpeedDevices.length ? 'ready' : 'unavailable')
  integrations.push({
    id: 'pageSpeed',
    label: 'PageSpeed Insights',
    status: labState === 'ready' ? 'healthy' : labState === 'partial' ? 'degraded' : capabilities.pageSpeed ? 'degraded' : 'not_configured',
    detail: labState === 'ready' ? 'Mobile and desktop lab reports are available.' : 'PageSpeed lab data is unavailable for this review.',
    checkedAt: now.toISOString(),
  })
  const bundleAssets = asArray(bundles.assets).map((asset, index) => ({ id: String(asset.name || index), label: String(asset.name || 'Asset'), value: Number(asset.bytes || 0), secondaryValue: null, secondaryLabel: null }))
  const periodFrom = analytics.range?.from || new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const periodTo = analytics.range?.to || now.toISOString().slice(0, 10)
  const snapshot = {
    ...metadata(bundle, ['submissions', 'items', 'requests', 'orders'], `Selected ${days} Asia/Kolkata calendar days. Legacy endpoints cannot certify source completeness; operational totals are unavailable.`),
    range,
    timezone: IST_TIME_ZONE,
    period: { from: periodFrom, to: periodTo, previousFrom: new Date(Date.parse(periodFrom) - days * 86400000).toISOString().slice(0, 10), previousTo: new Date(Date.parse(periodFrom) - 86400000).toISOString().slice(0, 10) },
    sections: {
      overview: { ...sectionMeta('partial', 'Production operations + analytics mirror', 'Traffic and visitor metrics are not connected for this review.'), metrics: overviewMetrics, traffic: [], activity, conversion: [analyticsMetric('claimAcceptance', 'Claim acceptance rate', insights.declines?.acceptRate, { format: 'percent', definition: 'Accepted claims divided by recorded decisions.' }), analyticsMetric('medianMatch', 'Median time to match', insights.speed?.medianMatchHours, { format: 'duration' }), analyticsMetric('medianReloved', 'Median time to Reloved', insights.speed?.medianReloveHours, { format: 'duration' })], topPages: [], topInteractions: interactions },
      traffic: { ...sectionMeta(capabilities.posthog ? 'unavailable' : 'not_configured', 'PostHog', unavailableBehavior), metrics: [analyticsMetric('pageViews', 'Page views', null, { state: capabilities.posthog ? 'unavailable' : 'not_configured', source: 'PostHog', message: unavailableBehavior }), analyticsMetric('visitors', 'Unique visitors', null, { state: capabilities.posthog ? 'unavailable' : 'not_configured', source: 'PostHog', message: unavailableBehavior }), analyticsMetric('sessions', 'Sessions', null, { state: capabilities.posthog ? 'unavailable' : 'not_configured', source: 'PostHog', message: unavailableBehavior })], trend: [], topPages: [], referrers: [], campaigns: [] },
      funnels: { ...sectionMeta('partial', 'Production analytics mirror + operations', 'Mirrored event counters are aggregate evidence; unavailable stages are not estimated.'), drop: dropFunnel, claim: claimFunnel },
      search: { ...sectionMeta(capabilities.searchConsole ? 'unavailable' : 'not_configured', 'Google Search Console', capabilities.searchConsole ? 'Search reporting did not return data.' : 'Search reporting is not connected for this review.'), reportingPeriod: null, latencyNote: 'Search Console is delayed and does not provide same-day real-time reporting.', metrics: ['clicks', 'impressions', 'ctr', 'position'].map((id) => analyticsMetric(id, id === 'ctr' ? 'CTR' : id === 'position' ? 'Average position' : id[0].toUpperCase() + id.slice(1), null, { state: capabilities.searchConsole ? 'unavailable' : 'not_configured', format: id === 'ctr' ? 'percent' : id === 'position' ? 'position' : 'number', source: 'Google Search Console', message: 'Search reporting is not connected.' })), trend: [], queries: [], landingPages: [] },
      performance: { ...sectionMeta(labState === 'ready' ? 'partial' : labState, 'PageSpeed Insights + local build', pageSpeed.message || null), field: { ...sectionMeta(capabilities.crux ? 'unavailable' : 'not_configured', 'Chrome UX Report', capabilities.crux ? 'Not enough Chrome field data yet.' : 'Direct CrUX read access is not configured.'), devices: [] }, lab: { ...sectionMeta(labState, 'PageSpeed Insights', pageSpeed.message || null), devices: pageSpeedDevices }, bundles: { ...sectionMeta(bundles.totalBytes == null ? 'unavailable' : 'ready', 'Local production build', bundles.totalBytes == null ? 'Build metrics unavailable.' : null), metrics: [analyticsMetric('pageWeight', 'Built asset weight', bundles.totalBytes, { format: 'bytes', source: 'Local production build' }), analyticsMetric('javascriptWeight', 'JavaScript weight', bundles.jsBytes, { format: 'bytes', source: 'Local production build' })], assets: bundleAssets, warning: Number(bundles.jsBytes || 0) > 750_000 ? 'The main JavaScript payload remains large and should be split before scale.' : null } },
      product: { ...sectionMeta('ready', 'Production Firestore operations + analytics mirror'), metrics: [analyticsMetric('medianMatch', 'Median time to match', insights.speed?.medianMatchHours, { format: 'duration' }), analyticsMetric('medianReloved', 'Median time to Reloved', insights.speed?.medianReloveHours, { format: 'duration' }), analyticsMetric('claimAcceptance', 'Claim acceptance rate', insights.declines?.acceptRate, { format: 'percent' })], categories: categoryRows, audiences: audienceRows, sizes: sizeComparisons(bundle), dropAreas: ranked(insights.topAreas?.gives), claimAreas: ranked(insights.topAreas?.claims), wallStatus },
      dataHealth: { ...sectionMeta('ready', 'Production Admin API'), metrics: [analyticsMetric('liveWall', 'Live Wall records', liveWallCount), analyticsMetric('failedNotifications', 'Failed notifications', failedNotifications)], issues: healthIssues.filter((issue) => issue.count === null || issue.count > 0), integrations, lastAnalyticsActivityAt: lastAnalyticsActivity(analytics), lastNotificationActivityAt: lastNotificationActivity(bundle) },
    },
  }
  const message = 'Unavailable: legacy production reads are bounded and do not report complete source coverage.'
  const suppress = metric => ({ ...metric, value: null, previousValue: null, changePercent: null, state: 'partial', message })
  snapshot.sections.overview.metrics = snapshot.sections.overview.metrics.map(metric => ['activeUsers', 'pageViews'].includes(metric.id) ? metric : suppress(metric))
  snapshot.sections.overview.conversion = snapshot.sections.overview.conversion.map(suppress)
  snapshot.sections.overview.activity = snapshot.sections.overview.activity.map(series => ({ ...series, points: series.points.map(point => ({ ...point, value: null })) }))
  snapshot.sections.overview.topInteractions = []
  for (const funnel of [snapshot.sections.funnels.drop, snapshot.sections.funnels.claim]) {
    funnel.state = 'partial'; funnel.message = message
    funnel.steps = funnel.steps.map(step => ({ ...step, value: null, rateFromPrevious: null, state: 'partial', message }))
  }
  snapshot.sections.funnels.activation = [analyticsMetric('users', 'Accounts', null, { state: 'partial', message }), analyticsMetric('onboarded', 'Profiles completed', null, { state: 'partial', message })]
  const product = snapshot.sections.product
  product.state = 'partial'; product.message = message
  product.metrics = product.metrics.map(suppress)
  for (const key of ['categories', 'audiences', 'sizes', 'dropAreas', 'claimAreas', 'wallStatus', 'claimPipeline', 'roles', 'attentionItems']) product[key] = []
  product.roleCoverage = message
  product.attention = [
    { id: 'agedAvailable', label: 'Available items aged 7+ days', count: null, severity: 'warning', href: '/admin/items?availability=available&visibility=visible', message },
    { id: 'stuckMatching', label: 'Pending claims aged 3+ days', count: null, severity: 'warning', href: '/admin/notifications?category=claims', message },
  ]
  const health = snapshot.sections.dataHealth
  health.state = 'partial'; health.message = message
  health.metrics = health.metrics.map(suppress)
  health.issues = healthIssues.map(issue => ({ ...issue, count: null, message }))
  health.lastAnalyticsActivityAt = null; health.lastNotificationActivityAt = null
  return snapshot

}
