// TODO: Implement sales use cases
// Example: CreateSale, AddLineItem, FinalizeSale

export class CreateSaleUseCase {
  // TODO: Implement create sale/cart logic
}

export class AddLineItemUseCase {
  // TODO: Implement add line item logic
}

export class FinalizeSaleUseCase {
  // TODO: Implement finalize sale logic
  // 1. Load cart
  // 2. Apply policy (VAT, discounts)
  // 3. Validate tenders
  // 4. Save sale + lines + tenders in transaction
  // 5. Publish sales.sale_finalized event to outbox
}
