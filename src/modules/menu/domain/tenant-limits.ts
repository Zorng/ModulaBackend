/**
 * TenantLimits Value Object
 * Stores and enforces resource quotas per tenant (Phase 1 defaults)
 */

// Limit check result with contextual information
export type LimitCheckResult = {
  status: "ok" | "warning" | "exceeded";
  currentCount: number;
  softLimit: number;
  hardLimit: number;
  message: string;
};

export type TenantLimitsProps = {
  tenantId: string;
  maxCategoriesSoft: number;
  maxCategoriesHard: number;
  maxItemsSoft: number;
  maxItemsHard: number;
  maxModifierGroupsPerItem: number;
  maxModifierOptionsPerGroup: number;
  maxTotalModifierOptionsPerItem: number;
  maxMediaQuotaMb: number;
};

export class TenantLimits {
  private constructor(private props: TenantLimitsProps) {}

  // Factory: Default Phase 1 limits
  static createDefault(tenantId: string): TenantLimits {
    return new TenantLimits({
      tenantId,
      maxCategoriesSoft: 8,
      maxCategoriesHard: 12,
      maxItemsSoft: 75,
      maxItemsHard: 120,
      maxModifierGroupsPerItem: 5,
      maxModifierOptionsPerGroup: 12,
      maxTotalModifierOptionsPerItem: 30,
      maxMediaQuotaMb: 10,
    });
  }

  static fromPersistence(props: TenantLimitsProps): TenantLimits {
    return new TenantLimits(props);
  }

  // Getters
  get tenantId() {
    return this.props.tenantId;
  }
  get maxCategoriesSoft() {
    return this.props.maxCategoriesSoft;
  }
  get maxCategoriesHard() {
    return this.props.maxCategoriesHard;
  }
  get maxItemsSoft() {
    return this.props.maxItemsSoft;
  }
  get maxItemsHard() {
    return this.props.maxItemsHard;
  }
  get maxModifierGroupsPerItem() {
    return this.props.maxModifierGroupsPerItem;
  }
  get maxModifierOptionsPerGroup() {
    return this.props.maxModifierOptionsPerGroup;
  }
  get maxTotalModifierOptionsPerItem() {
    return this.props.maxTotalModifierOptionsPerItem;
  }
  get maxMediaQuotaMb() {
    return this.props.maxMediaQuotaMb;
  }

  // Business logic: Check if limit is exceeded
  checkCategoryLimit(currentCount: number): LimitCheckResult {
    const softLimit = this.props.maxCategoriesSoft;
    const hardLimit = this.props.maxCategoriesHard;

    // Check hard limit first
    if (currentCount >= hardLimit) {
      return {
        status: "exceeded",
        currentCount,
        softLimit,
        hardLimit,
        message: `Category limit reached (${currentCount}/${hardLimit}). Cannot create more categories.`,
      };
    }

    // Check soft limit (warning zone)
    if (currentCount >= softLimit) {
      return {
        status: "warning",
        currentCount,
        softLimit,
        hardLimit,
        message: `Approaching category limit (${currentCount}/${hardLimit}).`,
      };
    }

    // Under soft limit - all good
    return {
      status: "ok",
      currentCount,
      softLimit,
      hardLimit,
      message: `Category usage is normal (${currentCount}/${hardLimit}).`,
    };
  }

  checkItemLimit(currentCount: number): LimitCheckResult {
    const softLimit = this.props.maxItemsSoft;
    const hardLimit = this.props.maxItemsHard;

    // Check hard limit first
    if (currentCount >= hardLimit) {
      return {
        status: "exceeded",
        currentCount,
        softLimit,
        hardLimit,
        message: `Menu item limit reached (${currentCount}/${hardLimit}). Cannot create more items.`,
      };
    }

    // Check soft limit (warning zone)
    if (currentCount >= softLimit) {
      return {
        status: "warning",
        currentCount,
        softLimit,
        hardLimit,
        message: `Approaching menu item limit (${currentCount}/${hardLimit}).`,
      };
    }

    // Under soft limit - all good
    return {
      status: "ok",
      currentCount,
      softLimit,
      hardLimit,
      message: `Menu item usage is normal (${currentCount}/${hardLimit}).`,
    };
  }

  toPersistence(): TenantLimitsProps {
    return { ...this.props };
  }
}
