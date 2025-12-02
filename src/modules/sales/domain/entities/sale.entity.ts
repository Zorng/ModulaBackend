import { randomUUID } from 'crypto';

export interface SaleItemModifier {
  modifierGroupId: string;      // References menu_modifier_groups.id
  modifierGroupName: string;     // e.g., "Sugar Level", "Size", "Toppings"
  modifierOptionId: string;      // References menu_modifier_options.id
  modifierOptionLabel: string;   // e.g., "No Sugar", "Large", "Extra Cheese"
  priceAdjustmentUsd: number;    // Price impact (can be 0, positive, or negative)
}

export type SaleType = 'dine_in' | 'take_away' | 'delivery';
export type SaleState = 'draft' | 'finalized' | 'voided' | 'reopened';
export type PaymentMethod = 'cash' | 'qr' | 'transfer' | 'other';
export type TenderCurrency = 'KHR' | 'USD';
export type FulfillmentStatus = 'in_prep' | 'ready' | 'delivered' | 'cancelled';

export interface Sale {
  id: string;
  clientUuid: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  saleType: SaleType;
  state: SaleState;
  refPreviousSaleId?: string; // For reopened sales
  
  // VAT
  vatEnabled: boolean;
  vatRate: number;
  vatAmountUsd: number;
  vatAmountKhrExact: number;
  
  // Discounts
  appliedPolicyIds: string[];
  orderDiscountType?: 'percentage' | 'fixed';
  orderDiscountAmount: number;
  policyStale: boolean; // Flag if policy cache was stale during offline operation
  
  // Currency & FX
  fxRateUsed: number;
  subtotalUsdExact: number;
  subtotalKhrExact: number;
  totalUsdExact: number;
  totalKhrExact: number;
  
  // Tender & rounding
  tenderCurrency: TenderCurrency;
  khrRoundingApplied: boolean;
  totalKhrRounded?: number;
  roundingDeltaKhr?: number;
  
  // Payment
  paymentMethod: PaymentMethod;
  cashReceivedKhr?: number;
  cashReceivedUsd?: number;
  changeGivenKhr?: number;
  changeGivenUsd?: number;
  
  // Fulfillment
  fulfillmentStatus: FulfillmentStatus;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
  inPrepAt?: Date;
  readyAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  
  // Relations
  items: SaleItem[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  menuItemId: string;
  menuItemName: string;
  unitPriceUsd: number;
  unitPriceKhrExact: number;
  modifiers: SaleItemModifier[];
  quantity: number;
  lineTotalUsdExact: number;
  lineTotalKhrExact: number;
  lineDiscountType?: 'percentage' | 'fixed';
  lineDiscountAmount: number;
  lineAppliedPolicyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Factory functions
export function createDraftSale(params: {
  clientUuid: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  saleType: SaleType;
  fxRateUsed: number;
}): Sale {
  const now = new Date();
  
  return {
    id: randomUUID(),
    clientUuid: params.clientUuid,
    tenantId: params.tenantId,
    branchId: params.branchId,
    employeeId: params.employeeId,
    saleType: params.saleType,
    state: 'draft',
    vatEnabled: false,
    vatRate: 0,
    vatAmountUsd: 0,
    vatAmountKhrExact: 0,
    appliedPolicyIds: [],
    orderDiscountAmount: 0,
    policyStale: false,
    fxRateUsed: params.fxRateUsed,
    subtotalUsdExact: 0,
    subtotalKhrExact: 0,
    totalUsdExact: 0,
    totalKhrExact: 0,
    tenderCurrency: 'USD',
    khrRoundingApplied: false,
    paymentMethod: 'cash',
    fulfillmentStatus: 'in_prep',
    createdAt: now,
    updatedAt: now,
    items: []
  };
}

export function createSaleItem(params: {
  saleId: string;
  menuItemId: string;
  menuItemName: string;
  unitPriceUsd: number;
  unitPriceKhrExact: number;
  quantity: number;
  fxRateUsed: number;
  modifiers?: SaleItemModifier[];
}): SaleItem {
  const modifiers = params.modifiers || [];
  const modifierTotalUsd = modifiers.reduce((sum, mod) => {
    return sum + mod.priceAdjustmentUsd;
  }, 0);

  const unitPriceWithModsUsd = params.unitPriceUsd + modifierTotalUsd;
  const baseTotalUsd = unitPriceWithModsUsd * params.quantity;
  
  const modifierTotalKhr = Math.round(modifierTotalUsd * params.fxRateUsed);
  const unitPriceWithModsKhr = params.unitPriceKhrExact + modifierTotalKhr;
  const baseTotalKhr = unitPriceWithModsKhr * params.quantity;

  return {
    id: randomUUID(),
    saleId: params.saleId,
    menuItemId: params.menuItemId,
    menuItemName: params.menuItemName,
    unitPriceUsd: params.unitPriceUsd,
    unitPriceKhrExact: params.unitPriceKhrExact,
    modifiers: modifiers,
    quantity: params.quantity,
    lineTotalUsdExact: baseTotalUsd,
    lineTotalKhrExact: baseTotalKhr,
    lineDiscountAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Business operations
export function addItemToSale(sale: Sale, itemParams: {
  menuItemId: string;
  menuItemName: string;
  unitPriceUsd: number;
  quantity: number;
  modifiers?: SaleItemModifier[];
}): SaleItem {
  const unitPriceKhrExact = Math.round(itemParams.unitPriceUsd * sale.fxRateUsed);
  
  const item = createSaleItem({
    saleId: sale.id,
    menuItemId: itemParams.menuItemId,
    menuItemName: itemParams.menuItemName,
    unitPriceUsd: itemParams.unitPriceUsd,
    unitPriceKhrExact: unitPriceKhrExact,
    quantity: itemParams.quantity,
    fxRateUsed: sale.fxRateUsed,
    modifiers: itemParams.modifiers
  });

  sale.items.push(item);
  recalculateSaleTotals(sale);
  sale.updatedAt = new Date();

  return item;
}

export function removeItemFromSale(sale: Sale, itemId: string): void {
  sale.items = sale.items.filter(item => item.id !== itemId);
  recalculateSaleTotals(sale);
  sale.updatedAt = new Date();
}

export function updateItemQuantity(sale: Sale, itemId: string, quantity: number): void {
  const item = sale.items.find(i => i.id === itemId);
  if (!item) throw new Error('Item not found');

  item.quantity = quantity;
  recalculateItemTotals(item, sale.fxRateUsed);
  recalculateSaleTotals(sale);
  sale.updatedAt = new Date();
}

export function applyLineDiscount(item: SaleItem, discountType: 'percentage' | 'fixed', discountAmount: number, policyId?: string): void {
  item.lineDiscountType = discountType;
  item.lineDiscountAmount = discountAmount;
  item.lineAppliedPolicyId = policyId;
  // Note: FX rate will be applied when recalculating sale totals
}

export function applyOrderDiscount(sale: Sale, discountType: 'percentage' | 'fixed', discountAmount: number, policyIds: string[]): void {
  sale.orderDiscountType = discountType;
  sale.orderDiscountAmount = discountAmount;
  sale.appliedPolicyIds = policyIds;
  recalculateSaleTotals(sale);
  sale.updatedAt = new Date();
}

export function applyVAT(sale: Sale, vatRate: number, vatEnabled: boolean): void {
  sale.vatEnabled = vatEnabled;
  sale.vatRate = vatRate;
  recalculateSaleTotals(sale);
  sale.updatedAt = new Date();
}

export function setTenderCurrency(sale: Sale, currency: TenderCurrency, roundingPolicy: any): void {
  sale.tenderCurrency = currency;
  
  if (currency === 'KHR' && roundingPolicy.enabled) {
    sale.khrRoundingApplied = true;
    applyKHRRounding(sale, roundingPolicy);
  } else {
    sale.khrRoundingApplied = false;
    sale.totalKhrRounded = sale.totalKhrExact;
    sale.roundingDeltaKhr = 0;
  }
  
  sale.updatedAt = new Date();
}

export function setPaymentMethod(sale: Sale, method: PaymentMethod, cashReceived?: { khr?: number; usd?: number }): void {
  sale.paymentMethod = method;
  
  if (method === 'cash' && cashReceived) {
    // Auto-calculate the other currency based on what's provided and the tender currency
    if (sale.tenderCurrency === 'KHR') {
      // Customer paying in KHR
      if (cashReceived.khr !== undefined) {
        sale.cashReceivedKhr = cashReceived.khr;
        // Calculate USD equivalent
        sale.cashReceivedUsd = Number((cashReceived.khr / sale.fxRateUsed).toFixed(2));
      } else if (cashReceived.usd !== undefined) {
        // Allow USD input but convert to KHR as primary
        sale.cashReceivedUsd = cashReceived.usd;
        sale.cashReceivedKhr = Math.round(cashReceived.usd * sale.fxRateUsed);
      }
    } else {
      // Customer paying in USD
      if (cashReceived.usd !== undefined) {
        sale.cashReceivedUsd = cashReceived.usd;
        // Calculate KHR equivalent
        sale.cashReceivedKhr = Math.round(cashReceived.usd * sale.fxRateUsed);
      } else if (cashReceived.khr !== undefined) {
        // Allow KHR input but convert to USD as primary
        sale.cashReceivedKhr = cashReceived.khr;
        sale.cashReceivedUsd = Number((cashReceived.khr / sale.fxRateUsed).toFixed(2));
      }
    }
    calculateChange(sale);
  }
  
  sale.updatedAt = new Date();
}

export function finalizeSale(sale: Sale, actorId: string): void {
  if (sale.state !== 'draft') {
    throw new Error('Only draft sales can be finalized');
  }

  if (sale.items.length === 0) {
    throw new Error('Cannot finalize empty sale');
  }

  sale.state = 'finalized';
  sale.finalizedAt = new Date();
  sale.inPrepAt = new Date();
  sale.updatedAt = new Date();
}

export function voidSale(sale: Sale, actorId: string, reason: string): void {
  if (sale.state !== 'finalized') {
    throw new Error('Only finalized sales can be voided');
  }

  sale.state = 'voided';
  sale.cancelledAt = new Date();
  sale.fulfillmentStatus = 'cancelled';
  sale.updatedAt = new Date();
}

export function updateFulfillment(sale: Sale, status: FulfillmentStatus, actorId: string): void {
  if (sale.state !== 'finalized') {
    throw new Error('Only finalized sales can have fulfillment updated');
  }

  sale.fulfillmentStatus = status;
  const now = new Date();
  
  switch (status) {
    case 'ready':
      sale.readyAt = now;
      break;
    case 'delivered':
      sale.deliveredAt = now;
      break;
    case 'cancelled':
      sale.cancelledAt = now;
      break;
  }
  
  sale.updatedAt = now;
}

export function deleteDraftSale(sale: Sale, actorId: string): void {
  if (sale.state !== 'draft') {
    throw new Error('Only draft sales can be deleted');
  }

  // No state change needed - will be physically deleted from database
  // This function mainly serves as validation and domain logic enforcement
}

export function reopenSale(originalSale: Sale, actorId: string, reason: string): Sale {
  if (originalSale.state !== 'finalized') {
    throw new Error('Only finalized sales can be reopened');
  }

  // Create a new draft sale with reference to original
  // Generate a new UUID for the reopened sale (can't reuse original clientUuid)
  const reopenedSale = createDraftSale({
    clientUuid: crypto.randomUUID(),
    tenantId: originalSale.tenantId,
    branchId: originalSale.branchId,
    employeeId: actorId,
    saleType: originalSale.saleType,
    fxRateUsed: originalSale.fxRateUsed
  });

  // Set reference to original sale
  reopenedSale.refPreviousSaleId = originalSale.id;

  // Copy all settings from original sale
  reopenedSale.vatEnabled = originalSale.vatEnabled;
  reopenedSale.vatRate = originalSale.vatRate;
  reopenedSale.tenderCurrency = originalSale.tenderCurrency;
  reopenedSale.paymentMethod = originalSale.paymentMethod;

  // Copy items from original sale
  for (const originalItem of originalSale.items) {
    const item = createSaleItem({
      saleId: reopenedSale.id,
      menuItemId: originalItem.menuItemId,
      menuItemName: originalItem.menuItemName,
      unitPriceUsd: originalItem.unitPriceUsd,
      unitPriceKhrExact: originalItem.unitPriceKhrExact,
      quantity: originalItem.quantity,
      fxRateUsed: reopenedSale.fxRateUsed,
      modifiers: originalItem.modifiers
    });

    // Copy line discounts
    if (originalItem.lineDiscountType) {
      item.lineDiscountType = originalItem.lineDiscountType;
      item.lineDiscountAmount = originalItem.lineDiscountAmount;
      item.lineAppliedPolicyId = originalItem.lineAppliedPolicyId;
    }

    reopenedSale.items.push(item);
  }

  // Copy order-level discount
  reopenedSale.orderDiscountType = originalSale.orderDiscountType;
  reopenedSale.orderDiscountAmount = originalSale.orderDiscountAmount;
  reopenedSale.appliedPolicyIds = [...originalSale.appliedPolicyIds];

  // Recalculate totals
  recalculateSaleTotals(reopenedSale);

  // Mark original sale as reopened
  originalSale.state = 'reopened';
  originalSale.updatedAt = new Date();

  return reopenedSale;
}

// Helper functions
function recalculateItemTotals(item: SaleItem, fxRateUsed: number): void {
  // Calculate modifier total
  const modifierTotalUsd = item.modifiers.reduce((sum, mod) => {
    return sum + mod.priceAdjustmentUsd;
  }, 0);
  const modifierTotalKhr = Math.round(modifierTotalUsd * fxRateUsed);

  // Calculate base totals including modifiers
  const unitPriceWithModsUsd = item.unitPriceUsd + modifierTotalUsd;
  const unitPriceWithModsKhr = item.unitPriceKhrExact + modifierTotalKhr;
  
  const baseTotalUsd = unitPriceWithModsUsd * item.quantity;
  const baseTotalKhr = unitPriceWithModsKhr * item.quantity;
  
  let discountedTotalUsd = baseTotalUsd;
  let discountedTotalKhr = baseTotalKhr;

  if (item.lineDiscountType === 'percentage') {
    const discountMultiplier = (100 - item.lineDiscountAmount) / 100;
    discountedTotalUsd = baseTotalUsd * discountMultiplier;
    discountedTotalKhr = baseTotalKhr * discountMultiplier;
  } else if (item.lineDiscountType === 'fixed') {
    discountedTotalUsd = Math.max(0, baseTotalUsd - item.lineDiscountAmount);
    discountedTotalKhr = Math.max(0, baseTotalKhr - item.lineDiscountAmount * fxRateUsed);
  }

  item.lineTotalUsdExact = Number(discountedTotalUsd.toFixed(2));
  item.lineTotalKhrExact = Math.round(discountedTotalKhr);
  item.updatedAt = new Date();
}

export function recalculateSaleTotals(sale: Sale): void {
  // First recalculate all items
  sale.items.forEach(item => recalculateItemTotals(item, sale.fxRateUsed));

  // Calculate subtotal from all line items
  sale.subtotalUsdExact = sale.items.reduce((sum, item) => sum + item.lineTotalUsdExact, 0);
  sale.subtotalKhrExact = sale.items.reduce((sum, item) => sum + item.lineTotalKhrExact, 0);

  let discountedSubtotalUsd = sale.subtotalUsdExact;
  let discountedSubtotalKhr = sale.subtotalKhrExact;

  // Apply order discount to subtotal
  if (sale.orderDiscountType === 'percentage') {
    const discountMultiplier = (100 - sale.orderDiscountAmount) / 100;
    discountedSubtotalUsd *= discountMultiplier;
    discountedSubtotalKhr *= discountMultiplier;
  } else if (sale.orderDiscountType === 'fixed') {
    discountedSubtotalUsd = Math.max(0, discountedSubtotalUsd - sale.orderDiscountAmount);
    discountedSubtotalKhr = Math.max(0, discountedSubtotalKhr - sale.orderDiscountAmount * sale.fxRateUsed);
  }

  // Apply VAT on discounted subtotal
  if (sale.vatEnabled) {
    sale.vatAmountUsd = Number((discountedSubtotalUsd * sale.vatRate).toFixed(2));
    sale.vatAmountKhrExact = Math.round(discountedSubtotalKhr * sale.vatRate);
  } else {
    sale.vatAmountUsd = 0;
    sale.vatAmountKhrExact = 0;
  }

  // Calculate grand total
  sale.totalUsdExact = Number((discountedSubtotalUsd + sale.vatAmountUsd).toFixed(2));
  sale.totalKhrExact = discountedSubtotalKhr + sale.vatAmountKhrExact;

  // Re-apply KHR rounding if needed
  if (sale.tenderCurrency === 'KHR' && sale.khrRoundingApplied) {
    applyKHRRounding(sale, { method: 'nearest_100' });
  }

  sale.updatedAt = new Date();
}

function applyKHRRounding(sale: Sale, roundingPolicy: any): void {
  const exact = sale.totalKhrExact;
  
  switch (roundingPolicy.method) {
    case 'nearest_100':
      sale.totalKhrRounded = Math.round(exact / 100) * 100;
      break;
    case 'always_up':
      sale.totalKhrRounded = Math.ceil(exact / 100) * 100;
      break;
    default:
      sale.totalKhrRounded = exact;
  }
  
  sale.roundingDeltaKhr = sale.totalKhrRounded! - exact;
}

function calculateChange(sale: Sale): void {
  if (sale.paymentMethod !== 'cash') return;

  const totalToPay = sale.tenderCurrency === 'KHR' 
    ? (sale.totalKhrRounded || sale.totalKhrExact)
    : sale.totalUsdExact;

  const cashReceived = sale.tenderCurrency === 'KHR'
    ? (sale.cashReceivedKhr || 0)
    : (sale.cashReceivedUsd || 0);

  const change = cashReceived - totalToPay;

  if (sale.tenderCurrency === 'KHR') {
    sale.changeGivenKhr = Math.max(0, change);
  } else {
    sale.changeGivenUsd = Math.max(0, Number(change.toFixed(2)));
  }
}