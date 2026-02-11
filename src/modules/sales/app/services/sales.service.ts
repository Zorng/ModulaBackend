import { 
  Sale, 
  SaleItem,
  SaleType,
  TenderCurrency,
  PaymentMethod,
  FulfillmentStatus,
  createDraftSale,
  addItemToSale,
  removeItemFromSale,
  updateItemQuantity,
  applyLineDiscount,
  applyOrderDiscount,
  applyVAT,
  setTenderCurrency,
  setPaymentMethod,
  finalizeSale,
  voidSale,
  updateFulfillment,
  reopenSale,
  deleteDraftSale,
  recalculateSaleTotals
} from '../../domain/entities/sale.entity.js';
import { SalesRepository, PolicyPort, MenuPort } from '../ports/sales.ports.js';
import { TransactionManager } from '../../../../platform/events/index.js';
import { publishToOutbox } from '../../../../platform/events/outbox.js';
import { PoolClient } from 'pg';
import type { AuditWriterPort } from "../../../../shared/ports/audit.js";
import type { CashSaleRecordedV1, StockSaleDeductedV1 } from "../../../../shared/events.js";

export interface CreateSaleCommand {
  clientUuid: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  actorRole?: string;
  saleType: SaleType;
}

export interface AddItemCommand {
  saleId: string;
  menuItemId: string;
  quantity: number;
  modifiers?: any[];
  actorId: string;
  actorRole?: string;
}

export interface UpdateItemQuantityCommand {
  saleId: string;
  itemId: string;
  quantity: number;
  actorId: string;
  actorRole?: string;
}

export interface PreCheckoutCommand {
  saleId: string;
  tenderCurrency: TenderCurrency;
  paymentMethod: PaymentMethod;
  cashReceived?: { khr?: number; usd?: number };
}

export interface FinalizeSaleCommand {
  saleId: string;
  actorId: string;
  actorRole?: string;
}

export interface UpdateFulfillmentCommand {
  saleId: string;
  status: FulfillmentStatus;
  actorId: string;
  actorRole?: string;
}

export interface VoidSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
  actorRole?: string;
}

export interface ReopenSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
  actorRole?: string;
}

export class SalesService {
  constructor(
    private salesRepo: SalesRepository,
    private policyPort: PolicyPort,
    private menuPort: MenuPort,
    private transactionManager: TransactionManager,
    private auditWriter: AuditWriterPort
  ) {}

  async createDraftSale(cmd: CreateSaleCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      // Always fetch FX rate from tenant policy
      const fxRate = await this.policyPort.getCurrentFxRate(
        cmd.tenantId,
        cmd.branchId
      );
      
      const sale = createDraftSale({
        ...cmd,
        fxRateUsed: fxRate
      });

      // Apply VAT policy from the start
      const vatPolicy = await this.policyPort.getVatPolicy(
        cmd.tenantId,
        cmd.branchId
      );
      applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);

      await this.salesRepo.save(sale, trx);

      await this.auditWriter.write(
        {
          tenantId: cmd.tenantId,
          branchId: cmd.branchId,
          employeeId: cmd.employeeId,
          actorRole: cmd.actorRole ?? null,
          actionType: "CART_CREATED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            sale_type: cmd.saleType,
            client_uuid: cmd.clientUuid,
          },
        },
        trx
      );
      
      await publishToOutbox({
        type: 'sales.draft_created',
        v: 1,
        tenantId: cmd.tenantId,
        branchId: cmd.branchId,
        saleId: sale.id,
        clientUuid: cmd.clientUuid,
        actorId: cmd.employeeId,
        timestamp: new Date().toISOString()
      }, trx);

      return sale;
    });
  }

  async addItemToSale(cmd: AddItemCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.state !== 'draft') {
        throw new Error('Cannot add items to non-draft sale');
      }

      // Fetch menu item with branch-specific pricing
      const menuItem = await this.menuPort.getMenuItem({
        menuItemId: cmd.menuItemId,
        branchId: sale.branchId,
        tenantId: sale.tenantId
      });

      if (!menuItem) {
        throw new Error('Menu item not found or not available for this branch');
      }

      // Use the correct price from menu (with branch override if exists)
      const item = addItemToSale(sale, {
        menuItemId: cmd.menuItemId,
        menuItemName: menuItem.name,
        unitPriceUsd: menuItem.priceUsd,
        quantity: cmd.quantity,
        modifiers: cmd.modifiers
      });

      // Apply item-level discount policies
      const itemPolicies = await this.policyPort.getItemDiscountPolicies(
        sale.tenantId,
        sale.branchId,
        cmd.menuItemId
      );

      if (itemPolicies.length > 0) {
        const bestPolicy = this.findBestPolicy(itemPolicies, menuItem.priceUsd * cmd.quantity);
        applyLineDiscount(item, bestPolicy.type, bestPolicy.value, bestPolicy.id);
        // Recalculate sale totals after applying discount
        recalculateSaleTotals(sale);
      }

      // Reapply VAT after items change
      const vatPolicy = await this.policyPort.getVatPolicy(
        sale.tenantId,
        sale.branchId
      );
      applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);

      await this.salesRepo.save(sale, trx);

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "CART_UPDATED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            operation: "ADD_ITEM",
            menu_item_id: cmd.menuItemId,
            quantity: cmd.quantity,
          },
        },
        trx
      );
      return sale;
    });
  }

  async removeItemFromSale(params: {
    saleId: string;
    itemId: string;
    actorId: string;
    actorRole?: string;
  }): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(params.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.state !== 'draft') {
        throw new Error('Cannot remove items from non-draft sale');
      }

      removeItemFromSale(sale, params.itemId);
      
      // Reapply VAT after items change
      const vatPolicy = await this.policyPort.getVatPolicy(
        sale.tenantId,
        sale.branchId
      );
      applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);
      
      await this.salesRepo.save(sale, trx);

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: params.actorId,
          actorRole: params.actorRole ?? null,
          actionType: "CART_UPDATED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            operation: "REMOVE_ITEM",
            item_id: params.itemId,
          },
        },
        trx
      );
      return sale;
    });
  }

  async updateItemQuantity(cmd: UpdateItemQuantityCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.state !== 'draft') {
        throw new Error('Cannot update quantities in non-draft sale');
      }

      updateItemQuantity(sale, cmd.itemId, cmd.quantity);
      
      // Reapply VAT after items change
      const vatPolicy = await this.policyPort.getVatPolicy(
        sale.tenantId,
        sale.branchId
      );
      applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);
      
      await this.salesRepo.save(sale, trx);

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "CART_UPDATED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            operation: "UPDATE_ITEM_QTY",
            item_id: cmd.itemId,
            quantity: cmd.quantity,
          },
        },
        trx
      );
      return sale;
    });
  }

  async preCheckout(cmd: PreCheckoutCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.state !== 'draft') {
        throw new Error('Only draft sales can be pre-checked out');
      }

      // Get policies
      const roundingPolicy = await this.policyPort.getRoundingPolicy(
        sale.tenantId,
        sale.branchId
      );
      setTenderCurrency(sale, cmd.tenderCurrency, roundingPolicy);

      setPaymentMethod(sale, cmd.paymentMethod, cmd.cashReceived);

      // Apply order-level discount policies
      const orderPolicies = await this.policyPort.getOrderDiscountPolicies(
        sale.tenantId,
        sale.branchId
      );

      if (orderPolicies.length > 0) {
        const subtotalUsd = sale.items.reduce((sum, item) => sum + item.lineTotalUsdExact, 0);
        const bestPolicy = this.findBestPolicy(orderPolicies, subtotalUsd);
        applyOrderDiscount(sale, bestPolicy.type, bestPolicy.value, [bestPolicy.id]);
      }

      // Apply VAT
      const vatPolicy = await this.policyPort.getVatPolicy(
        sale.tenantId,
        sale.branchId
      );
      applyVAT(sale, vatPolicy.rate, vatPolicy.enabled);

      await this.salesRepo.save(sale, trx);
      return sale;
    });
  }

  async finalizeSale(cmd: FinalizeSaleCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      finalizeSale(sale, cmd.actorId);

      const cashSession =
        sale.paymentMethod === "cash"
          ? await this.resolveCashSessionForCashSale({
              trx,
              tenantId: sale.tenantId,
              branchId: sale.branchId,
              actorId: cmd.actorId,
            })
          : null;

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "SALE_FINALIZED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            old_values: { state: "draft" },
            new_values: { state: "finalized", finalized_at: sale.finalizedAt },
          },
        },
        trx
      );
      
      await this.salesRepo.save(sale, trx);

      if (sale.paymentMethod === "cash" && cashSession) {
        await this.recordSaleCashMovement({
          trx,
          sale,
          session: cashSession,
          actorId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
        });
      }

      await this.applyInventoryDeductions({
        trx,
        sale,
        actorId: cmd.actorId,
        actorRole: cmd.actorRole ?? null,
      });

      // Publish sale finalized event
      const tenderAmounts = this.getTenderAmountsForSale(sale);
      const tenders =
        sale.paymentMethod === "cash"
          ? [
              {
                method: "CASH" as const,
                amountUsd: tenderAmounts.amountUsd,
                amountKhr: tenderAmounts.amountKhr,
              },
            ]
          : sale.paymentMethod === "qr"
            ? [
                {
                  method: "QR" as const,
                  amountUsd: tenderAmounts.amountUsd,
                  amountKhr: tenderAmounts.amountKhr,
                },
              ]
            : [];

      await publishToOutbox({
        type: 'sales.sale_finalized',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        lines: sale.items.map((item: SaleItem) => ({
          menuItemId: item.menuItemId,
          qty: item.quantity
        })),
        totals: {
          subtotalUsd: sale.subtotalUsdExact,
          totalUsd: sale.totalUsdExact,
          totalKhr: sale.totalKhrExact,
          vatAmountUsd: sale.vatAmountUsd
        },
        tenders,
        finalizedAt: sale.finalizedAt!.toISOString(),
        actorId: cmd.actorId
      }, trx);

      return sale;
    });
  }

  private async resolveCashSessionForCashSale(params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
    actorId: string;
  }): Promise<{
    id: string;
    registerId: string | null;
    expectedCashUsd: number;
    expectedCashKhr: number;
  } | null> {
    const required = await this.readCashRequireSessionForSales({
      trx: params.trx,
      tenantId: params.tenantId,
      branchId: params.branchId,
    });

    const res = await params.trx.query(
      `SELECT id, register_id, expected_cash_usd, expected_cash_khr
       FROM cash_sessions
       WHERE tenant_id = $1 AND branch_id = $2 AND opened_by = $3 AND status = 'OPEN'
       ORDER BY opened_at DESC
       LIMIT 1
       FOR UPDATE`,
      [params.tenantId, params.branchId, params.actorId]
    );

    if (res.rows.length === 0) {
      if (required) {
        throw new Error("Cannot finalize cash sale without an active cash session");
      }
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      registerId: row.register_id,
      expectedCashUsd: parseFloat(row.expected_cash_usd),
      expectedCashKhr: parseFloat(row.expected_cash_khr),
    };
  }

  private async readCashRequireSessionForSales(_params: {
    trx: PoolClient;
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    return true;
  }

  private getTenderAmountsForSale(sale: Sale): {
    amountUsd: number;
    amountKhr: number;
  } {
    if (sale.tenderCurrency === "KHR") {
      return {
        amountUsd: 0,
        amountKhr: sale.totalKhrRounded ?? sale.totalKhrExact,
      };
    }
    return { amountUsd: sale.totalUsdExact, amountKhr: 0 };
  }

  private async recordSaleCashMovement(params: {
    trx: PoolClient;
    sale: Sale;
    session: {
      id: string;
      registerId: string | null;
      expectedCashUsd: number;
      expectedCashKhr: number;
    };
    actorId: string;
    actorRole: string | null;
  }): Promise<void> {
    const tenderAmounts = this.getTenderAmountsForSale(params.sale);
    const movementRes = await params.trx.query(
      `INSERT INTO cash_movements (
        tenant_id,
        branch_id,
        register_id,
        session_id,
        actor_id,
        type,
        status,
        amount_usd,
        amount_khr,
        ref_sale_id,
        reason
      ) VALUES ($1,$2,$3,$4,$5,'SALE_CASH','APPROVED',$6,$7,$8,$9)
      RETURNING id`,
      [
        params.sale.tenantId,
        params.sale.branchId,
        params.session.registerId,
        params.session.id,
        params.actorId,
        tenderAmounts.amountUsd,
        tenderAmounts.amountKhr,
        params.sale.id,
        `Sale ${params.sale.id}`,
      ]
    );
    const movementId = movementRes.rows[0].id as string;

    await params.trx.query(
      `UPDATE cash_sessions
       SET expected_cash_usd = $1, expected_cash_khr = $2, updated_at = NOW()
       WHERE id = $3`,
      [
        params.session.expectedCashUsd + tenderAmounts.amountUsd,
        params.session.expectedCashKhr + tenderAmounts.amountKhr,
        params.session.id,
      ]
    );

    const cashEvent: CashSaleRecordedV1 = {
      type: "cash.sale_cash_recorded",
      v: 1,
      tenantId: params.sale.tenantId,
      branchId: params.sale.branchId,
      sessionId: params.session.id,
      registerId: params.session.registerId ?? undefined,
      saleId: params.sale.id,
      amountUsd: tenderAmounts.amountUsd,
      amountKhr: tenderAmounts.amountKhr,
      timestamp: new Date().toISOString(),
    };
    await publishToOutbox(cashEvent, params.trx);

    await this.auditWriter.write(
      {
        tenantId: params.sale.tenantId,
        branchId: params.sale.branchId,
        employeeId: params.actorId,
        actorRole: params.actorRole ?? null,
        actionType: "CASH_TENDER_ATTACHED_TO_SALE",
        resourceType: "sale",
        resourceId: params.sale.id,
        details: {
          sessionId: params.session.id,
          registerId: params.session.registerId ?? null,
          movementId,
          amountUsd: tenderAmounts.amountUsd,
          amountKhr: tenderAmounts.amountKhr,
          tenders: [
            {
              method: "CASH",
              amountUsd: tenderAmounts.amountUsd,
              amountKhr: tenderAmounts.amountKhr,
            },
          ],
        },
      },
      params.trx
    );
  }

  private async applyInventoryDeductions(params: {
    trx: PoolClient;
    sale: Sale;
    actorId: string;
    actorRole: string | null;
  }): Promise<void> {
    const shouldDeduct = await this.shouldSubtractInventory(params.trx, params.sale);
    if (!shouldDeduct) {
      return;
    }

    const menuItemIds = params.sale.items.map((item) => item.menuItemId);
    if (menuItemIds.length === 0) {
      return;
    }

    const mappings = await params.trx.query(
      `SELECT menu_item_id, stock_item_id, qty_per_sale
       FROM menu_stock_map
       WHERE tenant_id = $1 AND menu_item_id = ANY($2::uuid[])`,
      [params.sale.tenantId, menuItemIds]
    );

    if (mappings.rows.length === 0) {
      return;
    }

    const qtyByStockItem = new Map<string, number>();
    for (const line of params.sale.items) {
      for (const mapping of mappings.rows.filter((row) => row.menu_item_id === line.menuItemId)) {
        const stockItemId = mapping.stock_item_id as string;
        const qtyPerSale = parseFloat(mapping.qty_per_sale);
        const nextQty = (qtyByStockItem.get(stockItemId) ?? 0) + qtyPerSale * line.quantity;
        qtyByStockItem.set(stockItemId, nextQty);
      }
    }

    if (qtyByStockItem.size === 0) {
      return;
    }

    const journals: Array<{ stockItemId: string; journalId: string; delta: number }> = [];
    for (const [stockItemId, qtyDeducted] of qtyByStockItem.entries()) {
      if (qtyDeducted <= 0) {
        continue;
      }
      const res = await params.trx.query(
        `INSERT INTO inventory_journal (
          tenant_id,
          branch_id,
          stock_item_id,
          delta,
          reason,
          ref_sale_id,
          note,
          actor_id,
          occurred_at,
          created_by
        ) VALUES ($1,$2,$3,$4,'sale',$5,NULL,$6,NOW(),$6)
        RETURNING id, delta`,
        [
          params.sale.tenantId,
          params.sale.branchId,
          stockItemId,
          -Math.abs(qtyDeducted),
          params.sale.id,
          params.actorId,
        ]
      );
      journals.push({
        stockItemId,
        journalId: res.rows[0].id,
        delta: parseFloat(res.rows[0].delta),
      });
    }

    if (journals.length === 0) {
      return;
    }

    const inventoryEvent: StockSaleDeductedV1 = {
      type: "inventory.stock_sale_deducted",
      v: 1,
      tenantId: params.sale.tenantId,
      branchId: params.sale.branchId,
      refSaleId: params.sale.id,
      deductions: journals.map((j) => ({
        stockItemId: j.stockItemId,
        journalId: j.journalId,
        delta: j.delta,
      })),
      createdAt: new Date().toISOString(),
    };
    await publishToOutbox(inventoryEvent, params.trx);

    await this.auditWriter.write(
      {
        tenantId: params.sale.tenantId,
        branchId: params.sale.branchId,
        employeeId: params.actorId,
        actorRole: params.actorRole ?? null,
        actionType: "INVENTORY_DEDUCTION_APPLIED",
        resourceType: "sale",
        resourceId: params.sale.id,
        details: {
          deductionsCount: journals.length,
          stockItemIds: Array.from(new Set(journals.map((j) => j.stockItemId))),
        },
      },
      params.trx
    );
  }

  private async shouldSubtractInventory(trx: PoolClient, sale: Sale): Promise<boolean> {
    const res = await trx.query(
      `SELECT auto_subtract_on_sale, exclude_menu_item_ids
       FROM branch_inventory_policies
       WHERE tenant_id = $1 AND branch_id = $2`,
      [sale.tenantId, sale.branchId]
    );

    if (res.rows.length === 0) {
      return true;
    }

    const row = res.rows[0];
    const excludeMenuItemIds: string[] = Array.isArray(row.exclude_menu_item_ids)
      ? row.exclude_menu_item_ids
      : row.exclude_menu_item_ids
        ? JSON.parse(row.exclude_menu_item_ids)
        : [];
    if (excludeMenuItemIds.length > 0) {
      const hasExcluded = sale.items.some((item) =>
        excludeMenuItemIds.includes(item.menuItemId)
      );
      if (hasExcluded) {
        return false;
      }
    }

    return Boolean(row.auto_subtract_on_sale);
  }

  async updateFulfillment(cmd: UpdateFulfillmentCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      const oldStatus = sale.fulfillmentStatus;
      updateFulfillment(sale, cmd.status, cmd.actorId);

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "ORDER_STATUS_UPDATED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            old_values: { fulfillment_status: oldStatus },
            new_values: { fulfillment_status: cmd.status },
          },
        },
        trx
      );
      
      await this.salesRepo.save(sale, trx);

      await publishToOutbox({
        type: 'sales.fulfillment_updated',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: cmd.actorId,
        fulfillmentStatus: cmd.status,
        timestamp: new Date().toISOString()
      }, trx);

      return sale;
    });
  }

  async voidSale(cmd: VoidSaleCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      // Check if sale was finalized today (same-day only rule)
      if (!sale.finalizedAt) {
        throw new Error('Cannot void a sale that was not finalized');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const finalizedDate = new Date(sale.finalizedAt);
      finalizedDate.setHours(0, 0, 0, 0);
      
      if (finalizedDate.getTime() !== today.getTime()) {
        throw new Error('Only same-day sales can be voided. This sale was finalized on a different day.');
      }

      voidSale(sale, cmd.actorId, cmd.reason);

      await this.auditWriter.write(
        {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "VOID_APPROVED",
          resourceType: "SALE",
          resourceId: sale.id,
          outcome: "SUCCESS",
          details: {
            reason: cmd.reason,
            old_values: { state: "finalized", fulfillment_status: sale.fulfillmentStatus },
            new_values: { state: "voided", fulfillment_status: "cancelled" },
          },
        },
        trx
      );
      
      await this.salesRepo.save(sale, trx);

      // Publish sale voided event for inventory reversal
      await publishToOutbox({
        type: 'sales.sale_voided',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        lines: sale.items.map((item: SaleItem) => ({
          menuItemId: item.menuItemId,
          qty: item.quantity
        })),
        actorId: cmd.actorId,
        reason: cmd.reason,
        timestamp: new Date().toISOString()
      }, trx);

      return sale;
    });
  }

  async deleteDraftSale(saleId: string, actorId: string): Promise<void> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      // Validate using domain logic
      deleteDraftSale(sale, actorId);
      
      // No audit log for draft deletions - drafts are temporary cart data
      // Only finalized sales are tracked in audit log
      
      // Physically delete from database
      await this.salesRepo.delete(saleId, trx);

      await publishToOutbox({
        type: 'sales.draft_deleted',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: actorId,
        timestamp: new Date().toISOString()
      }, trx);
    });
  }

  async reopenSale(cmd: ReopenSaleCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const originalSale = await this.salesRepo.findById(cmd.saleId, trx);
      if (!originalSale) {
        throw new Error('Sale not found');
      }

      // Check if sale was finalized today (same-day only rule)
      if (!originalSale.finalizedAt) {
        throw new Error('Cannot reopen a sale that was not finalized');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const finalizedDate = new Date(originalSale.finalizedAt);
      finalizedDate.setHours(0, 0, 0, 0);
      
      if (finalizedDate.getTime() !== today.getTime()) {
        throw new Error('Only same-day sales can be reopened. This sale was finalized on a different day.');
      }

      const reopenedSale = reopenSale(originalSale, cmd.actorId, cmd.reason);
      
      // Save both sales FIRST (so they exist in DB for audit log foreign keys)
      await this.salesRepo.save(originalSale, trx);
      await this.salesRepo.save(reopenedSale, trx);
      
      await this.auditWriter.write(
        {
          tenantId: originalSale.tenantId,
          branchId: originalSale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "SALE_REOPENED",
          resourceType: "SALE",
          resourceId: originalSale.id,
          outcome: "SUCCESS",
          details: {
            reason: cmd.reason,
            old_values: { state: "finalized" },
            new_values: { state: "reopened", new_sale_id: reopenedSale.id },
          },
        },
        trx
      );
      
      await this.auditWriter.write(
        {
          tenantId: reopenedSale.tenantId,
          branchId: reopenedSale.branchId,
          employeeId: cmd.actorId,
          actorRole: cmd.actorRole ?? null,
          actionType: "CART_CREATED",
          resourceType: "SALE",
          resourceId: reopenedSale.id,
          outcome: "SUCCESS",
          details: {
            reason: `Reopened from sale ${originalSale.id}: ${cmd.reason}`,
            new_values: { state: "draft", ref_previous_sale_id: originalSale.id },
          },
        },
        trx
      );

      await publishToOutbox({
        type: 'sales.sale_reopened',
        v: 1,
        tenantId: originalSale.tenantId,
        branchId: originalSale.branchId,
        originalSaleId: originalSale.id,
        newSaleId: reopenedSale.id,
        actorId: cmd.actorId,
        reason: cmd.reason,
        timestamp: new Date().toISOString()
      }, trx);

      return reopenedSale;
    });
  }

  async getSaleById(saleId: string): Promise<Sale | null> {
    return await this.salesRepo.findById(saleId);
  }

  async findDraftByClientUuid(clientUuid: string): Promise<Sale | null> {
    return await this.salesRepo.findByClientUuid(clientUuid);
  }

  async findSalesByBranch(params: {
    tenantId: string;
    branchId: string;
    status?: string;
    saleType?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  }): Promise<{ sales: Sale[]; pagination: any }> {
    const result = await this.salesRepo.findSalesByBranch(params);
    
    return {
      sales: result.sales,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / params.limit)
      }
    };
  }

  async getTodaySales(tenantId: string, branchId: string): Promise<Sale[]> {
    return await this.salesRepo.findTodaySales(tenantId, branchId);
  }

  private findBestPolicy(policies: any[], baseAmount: number): any {
    let bestPolicy = policies[0];
    let bestDiscount = this.calculateDiscountAmount(policies[0], baseAmount);

    for (let i = 1; i < policies.length; i++) {
      const discount = this.calculateDiscountAmount(policies[i], baseAmount);
      if (discount > bestDiscount) {
        bestPolicy = policies[i];
        bestDiscount = discount;
      }
    }

    return bestPolicy;
  }

  private calculateDiscountAmount(policy: any, baseAmount: number): number {
    if (policy.type === 'percentage') {
      return baseAmount * (policy.value / 100);
    } else {
      return policy.value;
    }
  }
}
