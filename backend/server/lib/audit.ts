import { prisma } from "./prisma.js"

export async function logAudit(params: {
  actorId: string
  entityType: string
  entityId: string
  action: string
  previousState?: unknown
  newState?: unknown
  note?: string
}) {
  await prisma.auditEvent.create({
    data: {
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      previousState: params.previousState as any,
      newState: params.newState as any,
      note: params.note,
    },
  })
}
