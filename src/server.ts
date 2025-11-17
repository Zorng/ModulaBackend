import express from 'express';
import { ping } from '#db';
import { log } from '#logger';
import { tenantRouter } from '#modules/tenant/api/router.js';
import { authRouter } from '#modules/auth/api/auth.router.js';
import { setupSwagger } from './platform/config/swagger.config.js';

const app = express();
app.use(express.json());

// Setup Swagger documentation
setupSwagger(app);

app.get('/health', async (_req, res) => {
  const now = await ping();
  res.json({ status: 'ok', time: now });
});

app.use('/v1/tenants', tenantRouter); // <-- mounts /v1/tenants
app.use('/v1/auth', authRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  log.info(`Server on http://localhost:${PORT}`);
  log.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});