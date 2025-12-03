import { Pool } from "pg";
import { createCashRouter } from "./api/router.js";
import { AuthMiddleware } from "../auth/api/middleware/auth.middleware.js";
import { TransactionManager } from "../../platform/db/transactionManager.js";
import { publishToOutbox } from "../../platform/events/outbox.js";

// Repositories
import {
  CashRegisterRepository,
  CashSessionRepository,
  CashMovementRepository,
} from "./infra/repository.js";

// Controller
import { CashController } from "./api/controller/index.js";

// Use Cases
import {
  OpenCashSessionUseCase,
  TakeOverSessionUseCase,
  CloseCashSessionUseCase,
  RecordCashMovementUseCase,
  GetActiveSessionUseCase,
  GenerateZReportUseCase,
  GenerateXReportUseCase,
  OnSaleFinalizedHandler,
  OnSaleVoidedHandler,
} from "./app/index.js";

/**
 * Bootstrap Cash Module
 *
 * Initializes repositories, use cases, controllers, and event handlers
 * for the cash session management module.
 */
export function bootstrapCashModule(
  pool: Pool,
  authMiddleware: AuthMiddleware
) {
  const txManager = new TransactionManager();

  // Create event publisher adapter
  const eventPublisher = {
    publishViaOutbox: publishToOutbox,
  };

  // Initialize repositories
  const registerRepo = new CashRegisterRepository(pool);
  const sessionRepo = new CashSessionRepository(pool);
  const movementRepo = new CashMovementRepository(pool);

  // Initialize use cases
  const openSessionUseCase = new OpenCashSessionUseCase(
    sessionRepo,
    registerRepo,
    eventPublisher,
    txManager
  );

  const takeOverSessionUseCase = new TakeOverSessionUseCase(
    sessionRepo,
    registerRepo,
    eventPublisher,
    txManager
  );

  const closeSessionUseCase = new CloseCashSessionUseCase(
    sessionRepo,
    movementRepo,
    eventPublisher,
    txManager
  );

  const recordMovementUseCase = new RecordCashMovementUseCase(
    sessionRepo,
    movementRepo,
    eventPublisher,
    txManager
  );

  const getActiveSessionUseCase = new GetActiveSessionUseCase(
    sessionRepo,
    movementRepo
  );

  const generateZReportUseCase = new GenerateZReportUseCase(
    sessionRepo,
    movementRepo
  );

  const generateXReportUseCase = new GenerateXReportUseCase(
    sessionRepo,
    movementRepo
  );

  // Create controller
  const cashController = new CashController(
    openSessionUseCase,
    takeOverSessionUseCase,
    closeSessionUseCase,
    recordMovementUseCase,
    getActiveSessionUseCase,
    generateZReportUseCase,
    generateXReportUseCase
  );

  // Initialize event handlers
  const saleFinalizedHandler = new OnSaleFinalizedHandler(
    sessionRepo,
    movementRepo,
    eventPublisher,
    txManager
  );

  const saleVoidedHandler = new OnSaleVoidedHandler(
    sessionRepo,
    movementRepo,
    eventPublisher,
    txManager
  );

  // Create and return router
  const router = createCashRouter(cashController, authMiddleware);

  return {
    router,
    eventHandlers: {
      saleFinalizedHandler,
      saleVoidedHandler,
    },
  };
}
