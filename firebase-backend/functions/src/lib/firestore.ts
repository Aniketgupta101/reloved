import { initializeApp, getApps } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

let _db: Firestore | null = null

export function getDb(): Firestore {
  if (!_db) {
    if (getApps().length === 0) {
      initializeApp({
        storageBucket:
          process.env.FIREBASE_STORAGE_BUCKET || "reloved-digital.firebasestorage.app",
      })
    }
    _db = getFirestore()
  }
  return _db
}

export const collections = {
  items: "items",
  waitlistSignups: "waitlistSignups",
  donorProfiles: "donorProfiles",
  donationSubmissions: "donationSubmissions",
  itemRequests: "itemRequests",
  otpCodes: "otpCodes",
  contactMessages: "contactMessages",
  partnerApplications: "partnerApplications",
  messageThreads: "messageThreads",
  callBridges: "callBridges",
  userNotifications: "userNotifications",
} as const

/** @deprecated use getDb() — kept for scripts after init */
export const db = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
