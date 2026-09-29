import { Timestamp } from "firebase-admin/firestore"
import { getDb } from "../lib/firestore"

type Fixture = { id: string; [key: string]: unknown }
const fake = (name: string) => `${name}@synthetic.invalid`
const day = () => {
  const ist = new Date(Date.now() + 330 * 60_000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000
}

/** Fixed IDs and fake people; delivery slots are anchored to the current IST day. */
export function adminControlCenterFixtures(): Record<string, Fixture[]> {
  const today = day()
  const at = (hours: number) => new Date(today + hours * 3_600_000).toISOString()
  const stamped = (hours: number) => Timestamp.fromDate(new Date(at(hours)))
  const users = ['new', 'dropper', 'claimer', 'both', 'support', 'notification-failure'].map((kind, i) => ({
    id: `qa-user-${kind}`, email: fake(kind), firstName: `Synthetic ${kind}`, phone: `+9100000000${String(i).padStart(2, '0')}`,
    createdAt: stamped(-24), updatedAt: stamped(-12), status: i === 0 ? 'new' : 'active',
  }))
  const dropStates = ['submitted', 'available', 'being_matched', 'withdrawn', 'claimed', 'reloved', 'processing_image', 'multi_photo']
  const donationSubmissions = dropStates.map((state, i) => ({
    id: `qa-drop-${state}`, status: state === 'submitted' ? 'submitted' : 'approved',
    donorTarget: fake('dropper'), donorFirstName: 'Synthetic', donorLastName: 'Dropper',
    email: fake('dropper'), phone: '+910000000001', giverLogistics: i % 3 === 0 ? 'receiver_collects' : i % 3 === 1 ? 'giver_sends' : 'porter_arranged',
    pickupLocality: 'Synthetic QA Area', items: [{ title: `SYNTHETIC QA ${state}` }],
    itemIds: [`qa-item-${state}`], submittedAt: stamped(-36 + i), createdAt: stamped(-36 + i), updatedAt: stamped(-12 + i),
  }))
  const items = dropStates.map((state, i) => ({
    id: `qa-item-${state}`, slug: `synthetic-${state}`, title: `SYNTHETIC QA ${state}`,
    category: 'Tops', gender: 'unisex', condition: 'Good', size: 'M', quantity: 1,
    status: state === 'submitted' || state === 'processing_image' ? 'submitted' : 'approved',
    publicStatus: state === 'multi_photo' ? 'available' : state,
    publicVisibility: !['withdrawn', 'submitted', 'processing_image'].includes(state),
    submissionId: `qa-drop-${state}`, donorTarget: fake('dropper'), donorRecognition: 'Synthetic Dropper',
    donorFirstName: 'Synthetic', donorPhone: '+910000000001',
    giverLogistics: i % 3 === 0 ? 'receiver_collects' : i % 3 === 1 ? 'giver_sends' : 'porter_arranged',
    createdAt: stamped(-36 + i), updatedAt: stamped(-12 + i),
    images: (state === 'multi_photo' ? [1, 2] : [1]).map((n) => ({ storagePath: `/images/wall-items/${['kids-classic-crew-tee', 'orca-print-navy-kids-tee', 'surfs-on-graphic-tee'][(i + n - 1) % 3]}.png`, imageType: 'product', sortOrder: n - 1 })),
  }))
  const claimStates = ['pending', 'rejected', 'matched', 'awaiting_address', 'awaiting_schedule', 'schedule_proposed', 'ready_to_book', 'booked', 'out_for_delivery', 'delivered', 'cancelled']
  const itemRequests = claimStates.map((state, i) => ({
    id: `qa-claim-${state}`, itemId: `qa-item-${state === 'pending' ? 'being_matched' : state === 'delivered' ? 'reloved' : ['rejected', 'cancelled'].includes(state) ? 'available' : 'claimed'}`,
    status: state === 'pending' ? 'pending' : state === 'rejected' ? 'rejected' : state === 'cancelled' ? 'cancelled' : 'approved',
    handoverStage: ['matched', 'awaiting_address', 'awaiting_schedule', 'schedule_proposed', 'out_for_delivery', 'delivered'].includes(state) ? state : null,
    opsBookingStatus: ['ready_to_book', 'booked'].includes(state) ? state : null,
    itemTitle: `SYNTHETIC QA ${state}`, itemSlug: `synthetic-${state}`,
    requesterTarget: fake('claimer'), requesterName: 'Synthetic Claimer', requesterPhone: '+910000000002',
    giverLogistics: i % 3 === 0 ? 'receiver_collects' : i % 3 === 1 ? 'giver_sends' : 'porter_arranged',
    deliveryMethod: i % 3 === 0 ? 'receiver_collects' : i % 3 === 1 ? 'giver_sends' : 'reloved_courier',
    pickupLocality: ['ready_to_book', 'booked', 'out_for_delivery', 'delivered'].includes(state) ? 'Synthetic QA Pickup, Sector 1' : null,
    requesterAddress: ['ready_to_book', 'booked', 'out_for_delivery', 'delivered'].includes(state) ? 'Synthetic QA Destination, Sector 2' : null,
    pickupAddressConfirmedByGiver: ['ready_to_book', 'booked', 'out_for_delivery', 'delivered'].includes(state),
    dropAddressConfirmedByClaimer: ['ready_to_book', 'booked', 'out_for_delivery', 'delivered'].includes(state),
    proposedSlotAt: state === 'schedule_proposed' ? at(13) : null,
    agreedSlotAt: ['ready_to_book', 'booked', 'out_for_delivery', 'delivered'].includes(state) ? at(14 + i) : null,
    createdAt: stamped(-24 + i), updatedAt: stamped(-12 + i),
  }))
  const deliverySlots = [
    ['today', 14, 'reloved_courier', 'booked'], ['within-hour', (Date.now() - today) / 3_600_000 + 0.5, 'reloved_courier', 'booked'],
    ['overdue', -2, 'giver_sends', 'booked'], ['tomorrow', 38, 'receiver_collects', 'ready_to_book'],
    ['completed', -24, 'reloved_courier', 'delivered'],
  ] as const
  const deliveries = deliverySlots.map(([name, hours, method, status]) => ({
    // Deliberately synthetic Mumbai coordinate pair, used only by the offline admin plot.
    ...(name === 'within-hour' ? {pickupLatitude:19.0759,pickupLongitude:72.8775,requesterLatitude:19.0825,requesterLongitude:72.8911} : {}),
    id: `qa-delivery-${name}`, itemId: status === 'delivered' ? 'qa-item-reloved' : 'qa-item-claimed', status: 'approved', handoverStage: status === 'delivered' ? 'delivered' : 'schedule_agreed',
    opsBookingStatus: status, giverLogistics: method === 'reloved_courier' ? 'porter_arranged' : method,
    deliveryMethod: method, agreedSlotAt: at(hours), itemTitle: `SYNTHETIC QA delivery ${name}`,
    pickupLocality: 'Synthetic QA Pickup, Sector 1', requesterAddress: 'Synthetic QA Destination, Sector 2',
    pickupAddressConfirmedByGiver: true, dropAddressConfirmedByClaimer: true,
    requesterTarget: fake('claimer'), requesterName: 'Synthetic Claimer', requesterPhone: '+910000000002',
    createdAt: stamped(-48), updatedAt: stamped(-1),
  }))
  const notificationEvents = ([['email', 'sent'], ['email', 'failed'], ['sms', 'sent'], ['sms', 'failed'], ['sms', 'skipped']] as const)
    .map(([channel, status], i) => ({ id: `qa-notification-${channel}-${status}`, claimId: 'qa-delivery-today',
      channel, status, templateKey: 'order_dispatched_claimer', audience: 'claimer',
      to: channel === 'email' ? 'no***@synthetic.invalid' : '******0002',
      subject: 'SYNTHETIC QA delivery notice', previewBody: 'SYNTHETIC QA message only',
      params: {}, providerId: null, error: status === 'failed' ? 'Synthetic provider failure' : null,
      createdAt: stamped(-i) }))
  const messageThreads = [{ id: 'qa-thread-unread', subjectType: 'support', ownerName: 'Synthetic Chat Visitor', ownerEmail: fake('support'), ownerTarget: fake('support'), participantEmail: fake('support'), unreadForAdmin: true, status: 'open', lastMessagePreview: 'SYNTHETIC QA unread Ask Reloved message', lastMessageAt: stamped(-1), createdAt: stamped(-2), updatedAt: stamped(-1) }]
  const contactMessages = [
    { id: 'qa-contact-open', name: 'Synthetic Support', email: fake('support'), subject: 'Synthetic open question', message: 'SYNTHETIC QA MESSAGE', status: 'open', createdAt: stamped(-2), updatedAt: stamped(-1) },
    { id: 'qa-contact-actioned', name: 'Synthetic Resolved Sender', email: fake('resolved-support'), subject: 'Synthetic resolved question', message: 'SYNTHETIC QA RESOLVED MESSAGE', status: 'actioned', adminReply: 'SYNTHETIC QA REPLY', createdAt: stamped(-8), updatedAt: stamped(-4) },
  ]
  const analyticsDaily = [{ id: new Date(today).toISOString().slice(0,10), e_item_viewed: 12, e_claim_started: 5, e_drop_started: 7, createdAt: stamped(0), updatedAt: stamped(0) }]
  const manyItems = Array.from({length:7},(_,i)=>({...items[1],id:`qa-item-linked-${i}`,title:`SYNTHETIC QA linked item ${i}`,submissionId:'qa-drop-many',createdAt:stamped(-1),publicStatus:'available',publicVisibility:true,status:'approved',category:i===6?'Unique linked category':'Tops'}))
  const manyDrop = {...donationSubmissions[1],id:'qa-drop-many',createdAt:stamped(-1),submittedAt:stamped(-1),itemIds:manyItems.map(i=>i.id)}
  const itemlessDrop = {...donationSubmissions[0],id:'qa-drop-itemless-review',donorFirstName:'Synthetic Itemless',createdAt:stamped(-1),submittedAt:stamped(-1),itemIds:[],items:[]}
  const history = Array.from({length:27},(_,i)=>({...itemRequests[1],id:`qa-zclaim-history-${String(i).padStart(2,'0')}`,itemId:'qa-item-claimed',requesterName:i===26?'Synthetic Beyond Window Claimer':`Synthetic historical claimer ${i}`,status:'rejected'}))
  const {createdAt:_created,...undatedItem}=items[1]
  const legacyItems=[{...items[1],id:'qa-item-legacy-string',title:'SYNTHETIC QA legacy string date',createdAt:at(-1)},{...undatedItem,id:'qa-item-undated',title:'SYNTHETIC QA undated'}]
  return { donorProfiles: users, donationSubmissions:[...donationSubmissions,manyDrop,itemlessDrop], items:[...items,...manyItems,...legacyItems], itemRequests: [...itemRequests, ...deliveries,...history], notificationEvents, messageThreads, contactMessages, analyticsDaily }
}

function assertSafeSeedEnvironment() {
  if (process.env.ADMIN_LOCAL_QA !== '1' || process.env.GCLOUD_PROJECT !== 'demo-reloved-admin' || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-reloved-admin') throw new Error('Synthetic seed requires demo-reloved-admin')
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    if (!/^127\.0\.0\.1:\d+$/.test(process.env[key] || '')) throw new Error(`Synthetic seed requires loopback ${key}`)
  }
}

export async function seedAdminControlCenter() {
  assertSafeSeedEnvironment()
  const db = getDb()
  const fixtures = adminControlCenterFixtures()
  const batch = db.batch()
  for (const [collection, rows] of Object.entries(fixtures)) {
    for (const { id, ...data } of rows) batch.set(db.collection(collection).doc(id), data)
  }
  await batch.commit()
  return Object.fromEntries(Object.entries(fixtures).map(([name, rows]) => [name, rows.length]))
}

if (require.main === module) {
  seedAdminControlCenter().then((counts) => console.log('Synthetic fixtures seeded:', counts)).catch((error) => { console.error(error); process.exitCode = 1 })
}
