/**
 * Unlink Menu Item from Stock Use Case
 * Removes the link between a menu item and an inventory stock item
 */

import { Ok, Err, type Result } from "../../../../../shared/result.js";

// Import port interfaces
import type { IMenuStockMapRepository, IPolicyPort } from "../../ports.js";

export class UnlinkMenuItemFromStockUseCase {
  constructor(  
    private stockMapRepo: IMenuStockMapRepository,
    private policyPort: IPolicyPort
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    mappingId: string;
  }): Promise<Result<void, string>> {
    const { tenantId, userId, mappingId } = input;

    // 1 - Check permissions
    const canEdit = await this.policyPort.canEditMenuItem(tenantId, userId);
    if (!canEdit) {
      return Err("Permission denied");
    }

    // 2 - Delete mapping
    await this.stockMapRepo.delete(mappingId, tenantId);

    // 3 - Return success
    return Ok(undefined);

  }
}
