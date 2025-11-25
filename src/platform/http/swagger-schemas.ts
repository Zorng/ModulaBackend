/**
 * OpenAPI/Swagger Schema Definitions
 * Centralized schema definitions for API documentation
 */

export const swaggerSchemas = {
  // ============================================================================
  // CATEGORY SCHEMAS
  // ============================================================================
  Category: {
    type: "object",
    properties: {
      id: {
        type: "string",
        format: "uuid",
        description: "Unique category identifier",
      },
      name: {
        type: "string",
        description: "Category name",
        example: "Coffee",
      },
      description: {
        type: "string",
        nullable: true,
        description: "Optional category description",
      },
      displayOrder: {
        type: "integer",
        description: "Sort order for display",
        example: 0,
      },
      isActive: {
        type: "boolean",
        description: "Whether category is active",
        example: true,
      },
      createdAt: {
        type: "string",
        format: "date-time",
        description: "Creation timestamp",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
        description: "Last update timestamp",
      },
    },
    required: [
      "id",
      "name",
      "displayOrder",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
  },

  CreateCategoryInput: {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 100,
        description: "Category name (1-100 characters)",
        example: "Coffee",
      },
      description: {
        type: "string",
        maxLength: 500,
        nullable: true,
        description: "Optional description (max 500 characters)",
        example: "Hot and cold coffee beverages",
      },
      displayOrder: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: "Display order (0+)",
        example: 0,
      },
    },
    required: ["name"],
  },

  UpdateCategoryInput: {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 100,
        description: "New category name",
        example: "Hot Coffee",
      },
      displayOrder: {
        type: "integer",
        minimum: 0,
        description: "New display order",
        example: 1,
      },
    },
    minProperties: 1,
  },

  // ============================================================================
  // MENU ITEM SCHEMAS
  // ============================================================================
  MenuItem: {
    type: "object",
    properties: {
      id: {
        type: "string",
        format: "uuid",
        description: "Unique menu item identifier",
      },
      categoryId: {
        type: "string",
        format: "uuid",
        description: "Parent category ID",
      },
      name: {
        type: "string",
        description: "Menu item name",
        example: "Iced Latte",
      },
      description: {
        type: "string",
        nullable: true,
        description: "Item description",
        example: "Espresso with cold milk and ice",
      },
      priceUsd: {
        type: "number",
        format: "float",
        minimum: 0,
        description: "Price in USD",
        example: 2.5,
      },
      imageUrl: {
        type: "string",
        format: "uri",
        nullable: true,
        description: "Product image URL",
        example: "https://cdn.example.com/images/iced-latte.jpg",
      },
      isActive: {
        type: "boolean",
        description: "Whether item is active",
        example: true,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
    required: [
      "id",
      "categoryId",
      "name",
      "priceUsd",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
  },

  CreateMenuItemInput: {
    type: "object",
    properties: {
      categoryId: {
        type: "string",
        format: "uuid",
        description: "Category ID to place this item under",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "Menu item name (1-200 characters)",
        example: "Iced Latte",
      },
      description: {
        type: "string",
        maxLength: 1000,
        nullable: true,
        description: "Optional description (max 1000 characters)",
        example: "Cold espresso with milk and ice",
      },
      priceUsd: {
        type: "number",
        format: "float",
        minimum: 0,
        maximum: 10000,
        description: "Price in USD (0-10000)",
        example: 2.5,
      },
      imageUrl: {
        type: "string",
        format: "uri",
        nullable: true,
        pattern: "\\.(jpg|jpeg|png|webp)$",
        description: "Image URL (must end with .jpg, .jpeg, .png, or .webp)",
        example: "https://cdn.example.com/images/iced-latte.jpg",
      },
    },
    required: ["categoryId", "name", "priceUsd"],
  },

  UpdateMenuItemInput: {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "New item name",
        example: "Premium Iced Latte",
      },
      description: {
        type: "string",
        maxLength: 1000,
        nullable: true,
        description: "New description",
      },
      priceUsd: {
        type: "number",
        format: "float",
        minimum: 0,
        maximum: 10000,
        description: "New price in USD",
        example: 3.0,
      },
      categoryId: {
        type: "string",
        format: "uuid",
        description: "Move to different category",
      },
      imageUrl: {
        type: "string",
        format: "uri",
        nullable: true,
        description: "New image URL",
      },
    },
    minProperties: 1,
  },

  // ============================================================================
  // MODIFIER SCHEMAS
  // ============================================================================
  ModifierGroup: {
    type: "object",
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      name: {
        type: "string",
        description: "Modifier group name",
        example: "Sugar Level",
      },
      selectionType: {
        type: "string",
        enum: ["SINGLE", "MULTI"],
        description:
          "Selection type: SINGLE (choose one) or MULTI (choose multiple)",
        example: "SINGLE",
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
    required: ["id", "name", "selectionType", "createdAt", "updatedAt"],
  },

  CreateModifierGroupInput: {
    type: "object",
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 100,
        description: "Modifier group name (1-100 characters)",
        example: "Sugar Level",
      },
      selectionType: {
        type: "string",
        enum: ["SINGLE", "MULTI"],
        description: "Selection type",
        example: "SINGLE",
      },
    },
    required: ["name", "selectionType"],
  },

  ModifierOption: {
    type: "object",
    properties: {
      id: {
        type: "string",
        format: "uuid",
      },
      modifierGroupId: {
        type: "string",
        format: "uuid",
        description: "Parent modifier group ID",
      },
      label: {
        type: "string",
        description: "Option label",
        example: "Extra Sugar",
      },
      priceAdjustmentUsd: {
        type: "number",
        format: "float",
        description: "Price adjustment (can be negative)",
        example: 0.2,
      },
      isDefault: {
        type: "boolean",
        description: "Whether this is the default option",
        example: false,
      },
      createdAt: {
        type: "string",
        format: "date-time",
      },
    },
    required: [
      "id",
      "modifierGroupId",
      "label",
      "priceAdjustmentUsd",
      "isDefault",
      "createdAt",
    ],
  },

  AddModifierOptionInput: {
    type: "object",
    properties: {
      modifierGroupId: {
        type: "string",
        format: "uuid",
        description: "Modifier group to add this option to",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      label: {
        type: "string",
        minLength: 1,
        maxLength: 100,
        description: "Option label (1-100 characters)",
        example: "Extra Sugar",
      },
      priceAdjustmentUsd: {
        type: "number",
        format: "float",
        minimum: -1000,
        maximum: 1000,
        default: 0,
        description: "Price adjustment in USD (-1000 to +1000)",
        example: 0.2,
      },
      isDefault: {
        type: "boolean",
        default: false,
        description: "Set as default option",
        example: false,
      },
    },
    required: ["modifierGroupId", "label"],
  },

  AttachModifierInput: {
    type: "object",
    properties: {
      modifierGroupId: {
        type: "string",
        format: "uuid",
        description: "Modifier group to attach",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      isRequired: {
        type: "boolean",
        default: false,
        description: "Whether customer must select from this group",
        example: false,
      },
    },
    required: ["modifierGroupId"],
  },

  // ============================================================================
  // BRANCH MENU SCHEMAS
  // ============================================================================
  SetBranchAvailabilityInput: {
    type: "object",
    properties: {
      branchId: {
        type: "string",
        format: "uuid",
        description: "Branch ID",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      isAvailable: {
        type: "boolean",
        description: "Set availability for this branch",
        example: true,
      },
    },
    required: ["branchId", "isAvailable"],
  },

  SetBranchPriceInput: {
    type: "object",
    properties: {
      branchId: {
        type: "string",
        format: "uuid",
        description: "Branch ID",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      priceUsd: {
        type: "number",
        format: "float",
        minimum: 0,
        maximum: 10000,
        description: "Branch-specific price override",
        example: 2.75,
      },
    },
    required: ["branchId", "priceUsd"],
  },

  // ============================================================================
  // STOCK INTEGRATION SCHEMAS
  // ============================================================================
  LinkStockInput: {
    type: "object",
    properties: {
      stockItemId: {
        type: "string",
        format: "uuid",
        description: "Inventory stock item ID",
        example: "550e8400-e29b-41d4-a716-446655440000",
      },
      qtyPerSale: {
        type: "number",
        format: "float",
        minimum: 0.001,
        maximum: 1000,
        description: "Quantity to deduct per sale (0.001-1000)",
        example: 1.0,
      },
    },
    required: ["stockItemId", "qtyPerSale"],
  },

  // ============================================================================
  // MENU SNAPSHOT SCHEMA (Query)
  // ============================================================================
  MenuSnapshot: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Coffee" },
            displayOrder: { type: "integer", example: 0 },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: { type: "string", example: "Iced Latte" },
                  description: {
                    type: "string",
                    example: "Cold espresso with milk",
                  },
                  priceUsd: { type: "number", format: "float", example: 2.5 },
                  imageUrl: { type: "string", format: "uri", nullable: true },
                  isAvailable: { type: "boolean", example: true },
                  modifiers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        groupId: { type: "string", format: "uuid" },
                        groupName: { type: "string", example: "Sugar Level" },
                        selectionType: {
                          type: "string",
                          enum: ["SINGLE", "MULTI"],
                        },
                        isRequired: { type: "boolean", example: false },
                        options: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string", format: "uuid" },
                              label: { type: "string", example: "Extra Sugar" },
                              priceAdjustmentUsd: {
                                type: "number",
                                format: "float",
                                example: 0.2,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // ============================================================================
  // ERROR SCHEMAS
  // ============================================================================
  Error: {
    type: "object",
    properties: {
      error: {
        type: "string",
        description: "Error type",
        example: "Bad Request",
      },
      message: {
        type: "string",
        description: "Error message",
        example: "Validation failed",
      },
      details: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", example: "name" },
            message: { type: "string", example: "Name is required" },
          },
        },
      },
    },
    required: ["error", "message"],
  },
};
