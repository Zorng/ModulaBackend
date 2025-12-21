import { Pool } from "pg";
import { createCashRouter } from "./api/router.js";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import { TransactionManager } from "../../platform/db/transactionManager.js";
import { publishToOutbox } from "../../platform/events/outbox.js";

// Repositories
import {
  CashRegisterRepository,
  CashSessionRepository,
  CashMovementRepository,
} from "./infra/repository.js";

// Controllers
import {
  SessionController,
  MovementController,
  ReportController,
  RegisterController,
} from "./api/controller/index.js";

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
import {
  CreateRegisterUseCase,
  UpdateRegisterUseCase,
  ListRegistersUseCase,
  DeleteRegisterUseCase,
} from "./app/register-usecase/index.js";

/**
 * Bootstrap Cash Module
 *
 * Initializes repositories, use cases, controllers, and event handlers
 * for the cash session management module.
 */
export function bootstrapCashModule(
  pool: Pool,
  authMiddleware: AuthMiddlewarePort
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

  const createRegisterUseCase = new CreateRegisterUseCase(registerRepo);

  const updateRegisterUseCase = new UpdateRegisterUseCase(registerRepo);

  const listRegistersUseCase = new ListRegistersUseCase(registerRepo);

  const deleteRegisterUseCase = new DeleteRegisterUseCase(
    registerRepo,
    sessionRepo
  );

  // Create controllers
  const sessionController = new SessionController(
    openSessionUseCase,
    takeOverSessionUseCase,
    closeSessionUseCase,
    getActiveSessionUseCase
  );

  const movementController = new MovementController(
    recordMovementUseCase,
    getActiveSessionUseCase
  );

  const reportController = new ReportController(
    generateZReportUseCase,
    generateXReportUseCase
  );

  const registerController = new RegisterController(
    createRegisterUseCase,
    updateRegisterUseCase,
    listRegistersUseCase,
    deleteRegisterUseCase
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
  const router = createCashRouter(
    sessionController,
    movementController,
    reportController,
    registerController,
    authMiddleware
  );

  return {
    router,
    eventHandlers: {
      saleFinalizedHandler,
      saleVoidedHandler,
    },
  };
}
