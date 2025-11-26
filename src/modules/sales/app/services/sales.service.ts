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
  recalculateSaleTotals
} from '../../domain/entities/sale.entity.js';
import { SalesRepository, PolicyPort } from '../ports/sales.ports.js';
import { EventBus, TransactionManager } from '../../../../platform/events/index.js';
import { PoolClient } from 'pg';

export interface CreateSaleCommand {
  clientUuid: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  saleType: SaleType;
  fxRateUsed: number;
}

export interface AddItemCommand {
  saleId: string;
  menuItemId: string;
  menuItemName: string;
  unitPriceUsd: number;
  quantity: number;
  modifiers?: any[];
}

export interface UpdateItemQuantityCommand {
  saleId: string;
  itemId: string;
  quantity: number;
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
}

export interface UpdateFulfillmentCommand {
  saleId: string;
  status: FulfillmentStatus;
  actorId: string;
}

export interface VoidSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
}

export interface ReopenSaleCommand {
  saleId: string;
  actorId: string;
  reason: string;
}

export class SalesService {
  constructor(
    private salesRepo: SalesRepository,
    private policyPort: PolicyPort,
    private eventBus: EventBus,
    private transactionManager: TransactionManager
  ) {}

  async createDraftSale(cmd: CreateSaleCommand): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const fxRate = cmd.fxRateUsed || await this.policyPort.getCurrentFxRate(cmd.tenantId);
      
      const sale = createDraftSale({
        ...cmd,
        fxRateUsed: fxRate
      });

      await this.salesRepo.save(sale, trx);
      
      await this.eventBus.publish({
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

      const item = addItemToSale(sale, {
        menuItemId: cmd.menuItemId,
        menuItemName: cmd.menuItemName,
        unitPriceUsd: cmd.unitPriceUsd,
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
        const bestPolicy = this.findBestPolicy(itemPolicies, cmd.unitPriceUsd * cmd.quantity);
        applyLineDiscount(item, bestPolicy.type, bestPolicy.value, bestPolicy.id);
        // Recalculate sale totals after applying discount
        recalculateSaleTotals(sale);
      }

      await this.salesRepo.save(sale, trx);
      return sale;
    });
  }

  async removeItemFromSale(saleId: string, itemId: string): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.state !== 'draft') {
        throw new Error('Cannot remove items from non-draft sale');
      }

      removeItemFromSale(sale, itemId);
      await this.salesRepo.save(sale, trx);
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
      await this.salesRepo.save(sale, trx);
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
      const roundingPolicy = await this.policyPort.getRoundingPolicy(sale.tenantId);
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
      const vatPolicy = await this.policyPort.getVatPolicy(sale.tenantId);
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
      
      // Write to audit log
      await this.salesRepo.writeAuditLog({
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: cmd.actorId,
        action: 'finalize',
        oldValues: { state: 'draft' },
        newValues: { state: 'finalized', finalizedAt: sale.finalizedAt }
      }, trx);
      
      await this.salesRepo.save(sale, trx);

      // Publish sale finalized event
      await this.eventBus.publish({
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
        tenders: [{
          method: sale.paymentMethod as 'CASH' | 'QR',
          amountUsd: sale.totalUsdExact,
          amountKhr: sale.totalKhrExact
        }],
        finalizedAt: sale.finalizedAt!.toISOString(),
        actorId: cmd.actorId
      }, trx);

      return sale;
    });
  }

  async updateFulfillment(saleId: string, status: FulfillmentStatus, actorId: string): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(saleId, trx);
      if (!sale) {
        throw new Error('Sale not found');
      }

      const oldStatus = sale.fulfillmentStatus;
      updateFulfillment(sale, status, actorId);
      
      // Write to audit log
      const actionMap: Record<string, string> = {
        'ready': 'set_ready',
        'delivered': 'set_delivered',
        'cancelled': 'revert_fulfillment',
        'in_prep': 'revert_fulfillment'
      };
      
      await this.salesRepo.writeAuditLog({
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: actorId,
        action: actionMap[status] || 'fulfillment_updated',
        oldValues: { fulfillmentStatus: oldStatus },
        newValues: { fulfillmentStatus: status }
      }, trx);
      
      await this.salesRepo.save(sale, trx);

      await this.eventBus.publish({
        type: 'sales.fulfillment_updated',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: actorId,
        fulfillmentStatus: status,
        timestamp: new Date().toISOString()
      }, trx);

      return sale;
    });
  }

  async voidSale(saleId: string, actorId: string, reason: string): Promise<Sale> {
    return await this.transactionManager.withTransaction(async (trx) => {
      const sale = await this.salesRepo.findById(saleId, trx);
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

      voidSale(sale, actorId, reason);
      
      // Write to audit log
      await this.salesRepo.writeAuditLog({
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        actorId: actorId,
        action: 'void',
        reason: reason,
        oldValues: { state: 'finalized', fulfillmentStatus: sale.fulfillmentStatus },
        newValues: { state: 'voided', fulfillmentStatus: 'cancelled' }
      }, trx);
      
      await this.salesRepo.save(sale, trx);

      // Publish sale voided event for inventory reversal
      await this.eventBus.publish({
        type: 'sales.sale_voided',
        v: 1,
        tenantId: sale.tenantId,
        branchId: sale.branchId,
        saleId: sale.id,
        lines: sale.items.map((item: SaleItem) => ({
          menuItemId: item.menuItemId,
          qty: item.quantity
        })),
        actorId: actorId,
        reason: reason,
        timestamp: new Date().toISOString()
      }, trx);

      return sale;
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
      
      // Write audit log for original sale
      await this.salesRepo.writeAuditLog({
        tenantId: originalSale.tenantId,
        branchId: originalSale.branchId,
        saleId: originalSale.id,
        actorId: cmd.actorId,
        action: 'reopen',
        reason: cmd.reason,
        oldValues: { state: 'finalized' },
        newValues: { state: 'reopened', newSaleId: reopenedSale.id }
      }, trx);
      
      // Write audit log for new sale
      await this.salesRepo.writeAuditLog({
        tenantId: reopenedSale.tenantId,
        branchId: reopenedSale.branchId,
        saleId: reopenedSale.id,
        actorId: cmd.actorId,
        action: 'create_draft',
        reason: `Reopened from sale ${originalSale.id}: ${cmd.reason}`,
        newValues: { state: 'draft', refPreviousSaleId: originalSale.id }
      }, trx);
      
      await this.salesRepo.save(originalSale, trx);
      await this.salesRepo.save(reopenedSale, trx);

      await this.eventBus.publish({
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
