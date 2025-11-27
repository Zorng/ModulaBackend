import { Pool } from 'pg';
import { createSalesRouter } from './api/router.js';
import { SalesController } from './api/controllers/sales.controller.js';
import { SalesService } from './app/services/sales.service.js';
import { PgSalesRepository } from './infra/repository/sales.repository.js';
import { PolicyAdapter } from './infra/adapters/policy.adapter.js';
import { MenuAdapter } from './infra/adapters/menu.adapter.js';
import { TransactionManager } from '../../platform/events/index.js';

export function bootstrapSalesModule(
  pool: Pool,
  transactionManager: TransactionManager
) {
  // Initialize repository
  const salesRepo = new PgSalesRepository(pool);
  
  // Initialize adapters
  const policyAdapter = new PolicyAdapter(pool);
  const menuAdapter = new MenuAdapter(pool);
  
  // Initialize service
  const salesService = new SalesService(
    salesRepo,
    policyAdapter,
    menuAdapter,
    transactionManager
  );
  
  // Initialize controller
  const salesController = new SalesController(salesService);
  
  // Create and return router
  const router = createSalesRouter(salesController);
  
  return {
    router,
    service: salesService,
    repository: salesRepo,
    controller: salesController
  };
}

// Export types
export * from './domain/entities/sale.entity.js';
export * from './app/services/sales.service.js';
export * from './app/ports/sales.ports.js';
export * from './api/router.js';
export * from './api/controllers/sales.controller.js';