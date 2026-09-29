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
