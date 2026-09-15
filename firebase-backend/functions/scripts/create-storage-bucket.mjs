import { GoogleAuth } from "google-auth-library"

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
})
const token = (await (await auth.getClient()).getAccessToken()).token
const projectId = "reloved-digital"
const bucketName = "reloved-digital.firebasestorage.app"

const createRes = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: bucketName,
    location: "ASIA-SOUTH1",
    storageClass: "STANDARD",
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
  }),
})
console.log("create", createRes.status, (await createRes.text()).slice(0, 600))

const iamGet = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/iam`, {
  headers: { Authorization: `Bearer ${token}` },
})
const iam = await iamGet.json()
if (iamGet.ok) {
  const bindings = iam.bindings || []
  const role = "roles/storage.objectViewer"
  let b = bindings.find((x) => x.role === role)
  if (!b) {
    b = { role, members: [] }
    bindings.push(b)
  }
  if (!b.members.includes("allUsers")) b.members.push("allUsers")
  // Also allow CF SA to write
  const writer = "roles/storage.objectAdmin"
  let w = bindings.find((x) => x.role === writer)
  if (!w) {
    w = { role: writer, members: [] }
    bindings.push(w)
  }
  const sa = "serviceAccount:697648556509-compute@developer.gserviceaccount.com"
  if (!w.members.includes(sa)) w.members.push(sa)

  const iamSet = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/iam`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bindings }),
  })
  console.log("iam", iamSet.status, (await iamSet.text()).slice(0, 400))
} else {
  console.log("iam get failed", iam)
}

const list = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, {
  headers: { Authorization: `Bearer ${token}` },
})
const names = ((await list.json()).items || []).map((i) => i.name)
console.log("buckets", names)
