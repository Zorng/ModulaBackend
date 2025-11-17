// // src/modules/menu/api/controllers/category-controller.ts
// import { Request, Response, NextFunction } from "express";
// import { createCategoryUseCases } from "../../app/category/index.js";
// import { pool } from "#db";

// const useCases = createCategoryUseCases(pool);

// export class CategoryController {
//   static async create(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { tenantId, userId } = req.user!;
//       const { name, description, displayOrder } = req.body;

//       const result = await useCases.createCategory.execute({
//         tenantId,
//         userId,
//         name,
//         description,
//         displayOrder,
//       });

//       if (!result.ok) {
//         return res.status(400).json({ error: result.error });
//       }

//       const category = result.value;
//       return res.status(201).json({
//         id: category.id,
//         name: category.name,
//         description: category.description,
//         displayOrder: category.displayOrder,
//         isActive: category.isActive,
//         createdAt: category.createdAt,
//         updatedAt: category.updatedAt,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async list(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { tenantId } = req.user!;

//       const result = await useCases.listCategories.execute({ tenantId });

//       if (!result.ok) {
//         return res.status(400).json({ error: result.error });
//       }

//       return res.status(200).json({
//         categories: result.value.map((cat) => ({
//           id: cat.id,
//           name: cat.name,
//           description: cat.description,
//           displayOrder: cat.displayOrder,
//           isActive: cat.isActive,
//           createdAt: cat.createdAt,
//           updatedAt: cat.updatedAt,
//         })),
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async update(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { tenantId, userId } = req.user!;
//       const { categoryId } = req.params;
//       const { name, displayOrder } = req.body;

//       const result = await useCases.updateCategory.execute({
//         tenantId,
//         userId,
//         categoryId,
//         name,
//         displayOrder,
//       });

//       if (!result.ok) {
//         return res.status(400).json({ error: result.error });
//       }

//       const category = result.value;
//       return res.status(200).json({
//         id: category.id,
//         name: category.name,
//         description: category.description,
//         displayOrder: category.displayOrder,
//         isActive: category.isActive,
//         updatedAt: category.updatedAt,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async delete(req: Request, res: Response, next: NextFunction) {
//     try {
//       const { tenantId, userId } = req.user!;
//       const { categoryId } = req.params;

//       const result = await useCases.deleteCategory.execute({
//         tenantId,
//         userId,
//         categoryId,
//       });

//       if (!result.ok) {
//         return res.status(400).json({ error: result.error });
//       }

//       return res.status(200).json({ message: "Category deleted successfully" });
//     } catch (error) {
//       next(error);
//     }
//   }
// }
