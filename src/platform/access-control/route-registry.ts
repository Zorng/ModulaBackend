import type { ProtectedRoute } from "./types.js";
import { AUTH_HR_ROUTES } from "./route-registry/auth-hr-routes.js";
import { ORG_POLICY_ROUTES } from "./route-registry/org-policy-routes.js";
import { MENU_MEDIA_PAYMENT_ROUTES } from "./route-registry/menu-media-payment-routes.js";
import { DISCOUNT_ROUTES } from "./route-registry/discount-routes.js";
import { INVENTORY_ROUTES } from "./route-registry/inventory-routes.js";
import { CASH_ORDER_SALE_RECEIPT_ROUTES } from "./route-registry/cash-order-sale-receipt-routes.js";
import { REPORTS_NOTIFICATION_SYNC_ROUTES } from "./route-registry/reports-notification-sync-routes.js";

export const PROTECTED_ROUTES: ProtectedRoute[] = [
  ...AUTH_HR_ROUTES,
  ...ORG_POLICY_ROUTES,
  ...MENU_MEDIA_PAYMENT_ROUTES,
  ...DISCOUNT_ROUTES,
  ...INVENTORY_ROUTES,
  ...CASH_ORDER_SALE_RECEIPT_ROUTES,
  ...REPORTS_NOTIFICATION_SYNC_ROUTES,
];

export function matchProtectedRoute(
  method: string,
  path: string
): ProtectedRoute | null {
  return (
    PROTECTED_ROUTES.find(
      (candidate) => candidate.method === method && candidate.pattern.test(path)
    ) ?? null
  );
}
