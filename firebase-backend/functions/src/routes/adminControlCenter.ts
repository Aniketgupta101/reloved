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
