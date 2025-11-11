import { Router } from 'express';
import { tenantRepo } from '../infra/repo.js';

export const tenantRouter = Router();

tenantRouter.post('/v1/tenants', async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'name is required' });
    }
    const tenant = await tenantRepo.create(name);
    res.status(201).json(tenant);
  } catch (e) { next(e); }
});

tenantRouter.get('/v1/tenants', async (_req, res, next) => {
  try {
    const list = await tenantRepo.list();
    res.json(list);
  } catch (e) { next(e); }
});