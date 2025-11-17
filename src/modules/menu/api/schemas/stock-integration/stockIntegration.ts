import {z} from "zod";

export const linkStockSchema = z.object({
  stockItemId: z.string().uuid("Invalid stock item ID"),
  qtyPerSale: z
    .number()
    .positive("Quantity per sale must be greater than 0")
    .max(1000, "Quantity per sale must be less than 1000"),
});

export const stockMappingIdParamSchema = z.object({
  mappingId: z.string().uuid("Invalid mapping ID format"),
});
