import { describe, it, expect } from '@jest/globals';
import { createDraftSale, addItemToSale, deleteDraftSale } from '../domain/entities/sale.entity.js';

describe('Sales Module', () => {
  it('should create a draft sale', () => {
    const sale = createDraftSale({
      clientUuid: 'test-client-uuid',
      tenantId: 'test-tenant-id',
      branchId: 'test-branch-id',
      employeeId: 'test-employee-id',
      saleType: 'dine_in',
      fxRateUsed: 4100
    });

    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();
    expect(sale.state).toBe('draft');
    expect(sale.tenantId).toBe('test-tenant-id');
    expect(sale.items).toEqual([]);
  });

  it('should add item to sale', () => {
    const sale = createDraftSale({
      clientUuid: 'test-client-uuid',
      tenantId: 'test-tenant-id',
      branchId: 'test-branch-id',
      employeeId: 'test-employee-id',
      saleType: 'dine_in',
      fxRateUsed: 4100
    });

    const item = addItemToSale(sale, {
      menuItemId: 'test-menu-item-id',
      menuItemName: 'Test Menu Item',
      unitPriceUsd: 10.50,
      quantity: 2,
      modifiers: []
    });

    expect(item).toBeDefined();
    expect(item.quantity).toBe(2);
    expect(item.unitPriceUsd).toBe(10.50);
    expect(sale.items.length).toBe(1);
    expect(sale.totalUsdExact).toBe(21);
  });

  it('should calculate totals correctly', () => {
    const sale = createDraftSale({
      clientUuid: 'test-client-uuid',
      tenantId: 'test-tenant-id',
      branchId: 'test-branch-id',
      employeeId: 'test-employee-id',
      saleType: 'dine_in',
      fxRateUsed: 4100
    });

    addItemToSale(sale, {
      menuItemId: 'item-1',
      menuItemName: 'Item 1',
      unitPriceUsd: 5.00,
      quantity: 1,
      modifiers: []
    });

    addItemToSale(sale, {
      menuItemId: 'item-2',
      menuItemName: 'Item 2',
      unitPriceUsd: 10.00,
      quantity: 2,
      modifiers: []
    });

    expect(sale.items.length).toBe(2);
    expect(sale.totalUsdExact).toBe(25);
    expect(sale.totalKhrExact).toBe(102500); // 25 * 4100
  });

  it('should allow deletion of draft sales only', () => {
    const sale = createDraftSale({
      clientUuid: 'test-client-uuid',
      tenantId: 'test-tenant-id',
      branchId: 'test-branch-id',
      employeeId: 'test-employee-id',
      saleType: 'dine_in',
      fxRateUsed: 4100
    });

    // Add items to the draft sale
    addItemToSale(sale, {
      menuItemId: 'item-1',
      menuItemName: 'Item 1',
      unitPriceUsd: 5.00,
      quantity: 2,
      modifiers: []
    });

    addItemToSale(sale, {
      menuItemId: 'item-2',
      menuItemName: 'Item 2',
      unitPriceUsd: 10.00,
      quantity: 1,
      modifiers: []
    });

    expect(sale.items.length).toBe(2);
    expect(sale.state).toBe('draft');

    // Should not throw for draft sales
    expect(() => {
      deleteDraftSale(sale, 'test-actor-id');
    }).not.toThrow();

    // Test that finalized sales cannot be deleted
    const finalizedSale = createDraftSale({
      clientUuid: 'test-client-uuid-2',
      tenantId: 'test-tenant-id',
      branchId: 'test-branch-id',
      employeeId: 'test-employee-id',
      saleType: 'dine_in',
      fxRateUsed: 4100
    });
    finalizedSale.state = 'finalized';

    expect(() => {
      deleteDraftSale(finalizedSale, 'test-actor-id');
    }).toThrow('Only draft sales can be deleted');
  });
});
