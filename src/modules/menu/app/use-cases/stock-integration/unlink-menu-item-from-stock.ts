import { Ok, Err, type Result } from "../../../../../shared/result.js";
import type {
  IMenuStockMapRepository,
  IPolicyPort,
  ITransactionManager,
} from "../../../app/ports.js";

export class UnlinkMenuItemFromStockUseCase {
  constructor(
    private stockMapRepo: IMenuStockMapRepository,
    private policyPort: IPolicyPort,
    private txManager: ITransactionManager
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    mappingId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, mappingId } = input;

    // 1 - Check permissions (outside transaction)
    const canEdit = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canEdit) {
      return Err("Permission denied");
    }

    try {
      // 2 - Delete mapping in transaction
      await this.txManager.withTransaction(async (client) => {
        await this.stockMapRepo.delete(mappingId, tenantId, client);
      });

      // 3 - Return success
      return Ok(undefined);
    } catch (error) {
      return Err(
        error instanceof Error ? error.message : "Failed to unlink stock item"
      );
    }
  }
}
