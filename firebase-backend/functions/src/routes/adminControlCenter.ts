import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/firestore';
import { requireAdmin } from '../middleware/adminAuth';
import { decodeAttentionCursor, getAttention, getOverview } from '../lib/adminControlCenter';
export const adminControlCenterRouter = Router();
adminControlCenterRouter.use(requireAdmin);
adminControlCenterRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
adminControlCenterRouter.get('/overview', async (req, res, next) => {
    const input = z.object({ range: z.enum(['24h', '7d', '30d']).default('24h') }).strict().safeParse(req.query);
    if (!input.success) {
        res.status(400).json({ error: 'Invalid overview range' });
        return;
    }
    try {
        res.json(await getOverview(getDb(), input.data.range));
    }
    catch (error) {
        next(error);
    }
});
adminControlCenterRouter.get('/attention', async (req, res, next) => {
    const input = z.object({
        category: z.enum(['all', 'messaging', 'delivery', 'claims', 'support']).default('all'), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(24000).optional()
    }).strict().safeParse(req.query);
    if (!input.success) {
        res.status(400).json({ error: 'Invalid attention query' });
        return;
    }
    let cursor;
    try {
        cursor = input.data.cursor ? decodeAttentionCursor(input.data.cursor, input.data.category) : undefined;
    }
    catch {
        res.status(400).json({ error: 'Invalid attention cursor' });
        return;
    }
    try {
        res.json(await getAttention(getDb(), input.data.category, input.data.limit, cursor));
    }
    catch (error) {
        next(error);
    }
});

// Inventory uses the same authenticated, no-store boundary; writes stay on existing admin routes.
import {
  inventoryQuery,
  decodeInventoryCursor,
  getInventoryPage,
  getInventoryDetail,
  getDropFunnel,
  getInventoryLinkedPage,
  decodeLinkedCursor,
} from "../lib/adminInventory";
adminControlCenterRouter.get("/drops/funnel", async (_req, res, next) => {
  try {
    res.json(await getDropFunnel(getDb()));
  } catch (error) {
    next(error);
  }
});
for (const kind of ["drops", "wall"] as const) {
  adminControlCenterRouter.get(`/${kind}`, async (req, res, next) => {
    const parsed = inventoryQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid inventory filters" });
      return;
    }
    try {
      if (parsed.data.cursor)
        decodeInventoryCursor(parsed.data.cursor, kind, parsed.data);
    } catch {
      res
        .status(400)
        .json({ error: "Invalid inventory cursor; refresh this view" });
      return;
    }
    try {
      res.json(await getInventoryPage(getDb(), kind, parsed.data));
    } catch (error) {
      next(error);
    }
  });
  adminControlCenterRouter.get(`/${kind}/:id`, async (req, res, next) => {
    if (
      !req.params.id ||
      req.params.id.length > 1500 ||
      req.params.id.includes("/")
    ) {
      res.status(400).json({ error: "Invalid entity ID" });
      return;
    }
    try {
      const detail = await getInventoryDetail(getDb(), kind, req.params.id);
      if (!detail) {
        res
          .status(404)
          .json({ error: "Record not found or excluded by tester policy" });
        return;
      }
      res.json(detail);
    } catch (error) {
      next(error);
    }
  });
}

for(const [path,kind] of [['drops/:id/items','items'],['wall/:id/claims','claims']] as const) {
 adminControlCenterRouter.get('/'+path,async(req,res,next)=>{
  if(!req.params.id||req.params.id.length>1500||req.params.id.includes('/')){res.status(400).json({error:'Invalid linked entity ID'});return;}
  const input=z.object({cursor:z.string().max(6000).optional()}).strict().safeParse(req.query);
  if(!input.success){res.status(400).json({error:'Invalid linked query'});return;}
  try{if(input.data.cursor)decodeLinkedCursor(input.data.cursor,kind,req.params.id);}catch{res.status(400).json({error:'Invalid linked cursor'});return;}
  try{res.json(await getInventoryLinkedPage(getDb(),kind,req.params.id,input.data.cursor));}catch(error){next(error);}
 });
}
import { operationsQuery, decodeOperationsCursor, decodeCommunicationCursor, getOperationsPage, getOperationDetail, getCommunications, getClaimFunnel } from '../lib/adminOperations';
adminControlCenterRouter.get('/claims/funnel',async(_req,res,next)=>{try{res.json(await getClaimFunnel(getDb()));}catch(error){next(error);}});
for(const kind of ['claims','deliveries'] as const){
 adminControlCenterRouter.get('/'+kind,async(req,res,next)=>{
  const input=operationsQuery.safeParse(req.query);if(!input.success){res.status(400).json({error:'Invalid operations query'});return;}
  try{if(input.data.cursor)decodeOperationsCursor(input.data.cursor,kind,input.data);}catch{res.status(400).json({error:'Invalid operations cursor; refresh this view'});return;}
  try{res.json(await getOperationsPage(getDb(),kind,input.data));}catch(error){next(error);}
 });
 adminControlCenterRouter.get('/'+kind+'/:id',async(req,res,next)=>{
  if(!req.params.id||req.params.id.length>1500||req.params.id.includes('/')){res.status(400).json({error:'Invalid claim ID'});return;}
  try{const d=await getOperationDetail(getDb(),req.params.id);if(!d){res.status(404).json({error:'Claim not found or excluded'});return;}res.json(d);}catch(error){next(error);}
 });
}
adminControlCenterRouter.get('/deliveries/:id/communications',async(req,res,next)=>{
 const input=z.object({cursor:z.string().max(8000).optional()}).strict().safeParse(req.query);
 if(!input.success||!req.params.id||req.params.id.includes('/')||req.params.id.length>1500){res.status(400).json({error:'Invalid communication query'});return;}
 try{if(input.data.cursor)decodeCommunicationCursor(input.data.cursor,req.params.id);}catch{res.status(400).json({error:'Invalid communication cursor'});return;}
 try{res.json(await getCommunications(getDb(),req.params.id,input.data.cursor));}catch(error){next(error);}
});

import { decodeSupportCursor, getAnalyticsSnapshot, getSupportPage } from '../lib/adminSupportAnalytics';
import { getPostHogAdminAnalytics } from '../lib/posthogAdminRead';
adminControlCenterRouter.get('/support',async(req,res,next)=>{
 const input=z.object({view:z.enum(['unread','open','actioned','all']).default('unread'),limit:z.coerce.number().int().min(1).max(20).default(20),cursor:z.string().max(24000).optional(),threadId:z.string().min(1).max(1500).refine(value=>!value.includes('/')).optional(),messageId:z.string().min(1).max(1500).refine(value=>!value.includes('/')).optional()}).strict().refine(value=>!(value.threadId&&value.messageId)).safeParse(req.query);
 if(!input.success){res.status(400).json({error:'Invalid support query'});return;}
 let cursor;try{cursor=input.data.cursor?decodeSupportCursor(input.data.cursor,input.data.view):undefined;}catch{res.status(400).json({error:'Invalid support cursor; refresh this view'});return;}
 try{res.json(await getSupportPage(getDb(),input.data.view,input.data.limit,cursor,{threadId:input.data.threadId,messageId:input.data.messageId}));}catch(error){next(error);}
});
adminControlCenterRouter.get('/analytics/snapshot',async(req,res,next)=>{
 const input=z.object({range:z.enum(['7d','14d','30d']).default('7d')}).strict().safeParse(req.query);
 if(!input.success){res.status(400).json({error:'Invalid analytics range'});return;}
 try{res.json(await getAnalyticsSnapshot(getDb(),input.data.range));}catch(error){next(error);}
});
adminControlCenterRouter.get('/analytics/posthog',async(req,res,next)=>{
 const input=z.object({range:z.enum(['24h','7d','30d']).default('7d')}).strict().safeParse(req.query);
 if(!input.success){res.status(400).json({error:'Invalid PostHog analytics range'});return;}
 try{res.json(await getPostHogAdminAnalytics(input.data.range));}catch(error){next(error);}
});
