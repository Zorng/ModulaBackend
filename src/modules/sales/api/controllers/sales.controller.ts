import { Response } from 'express';
import { AuthRequest } from '../../../../modules/auth/api/middleware/auth.middleware.js';
import { SalesService } from '../../app/services/sales.service.js';
import { 
  createSaleSchema, 
  addItemSchema, 
  preCheckoutSchema, 
  finalizeSaleSchema,
  updateFulfillmentSchema,
  voidSaleSchema,
  reopenSaleSchema,
  updateItemQuantitySchema,
  getSalesQuerySchema,
  CreateSaleCommand,
  AddItemCommand,
  PreCheckoutCommand,
  FinalizeSaleCommand,
  UpdateFulfillmentCommand,
  VoidSaleCommand,
  ReopenSaleCommand,
  UpdateItemQuantityCommand
} from '../dtos/sales.dtos.js';

export class SalesController {
  constructor(private salesService: SalesService) {}

  async createDraftSale(req: AuthRequest, res: Response) {
    try {
      const validatedData = createSaleSchema.parse({
        ...req.body,
        employeeId: req.user!.employeeId,
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId
      });

      const command: CreateSaleCommand = {
        ...validatedData,
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        employeeId: req.user!.employeeId
      };

      const sale = await this.salesService.createDraftSale(command);
      
      res.status(201).json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getOrCreateDraft(req: AuthRequest, res: Response) {
    try {
      const { clientUuid } = req.params;
      
      let sale = await this.salesService.findDraftByClientUuid(clientUuid);
      
      if (!sale) {
        const command: CreateSaleCommand = {
          clientUuid,
          tenantId: req.user!.tenantId,
          branchId: req.user!.branchId,
          employeeId: req.user!.employeeId,
          saleType: 'dine_in'
        };
        
        sale = await this.salesService.createDraftSale(command);
      }

      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async addItem(req: AuthRequest, res: Response) {
    try {
      const validatedData = addItemSchema.parse({
        ...req.body,
        saleId: req.params.saleId
      });

      const command: AddItemCommand = validatedData;
      const sale = await this.salesService.addItemToSale(command);
      
      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateItemQuantity(req: AuthRequest, res: Response) {
    try {
      const validatedData = updateItemQuantitySchema.parse({
        ...req.body,
        saleId: req.params.saleId,
        itemId: req.params.itemId
      });

      const command: UpdateItemQuantityCommand = validatedData;
      
      if (command.quantity === 0) {
        await this.salesService.removeItemFromSale(command.saleId, command.itemId);
      } else {
        await this.salesService.updateItemQuantity(command);
      }

      const sale = await this.salesService.getSaleById(command.saleId);
      
      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async removeItem(req: AuthRequest, res: Response) {
    try {
      const { saleId, itemId } = req.params;
      
      await this.salesService.removeItemFromSale(saleId, itemId);
      const sale = await this.salesService.getSaleById(saleId);
      
      res.json({
        success: true,
        data: sale,
        message: 'Item removed successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async preCheckout(req: AuthRequest, res: Response) {
    try {
      const validatedData = preCheckoutSchema.parse({
        ...req.body,
        saleId: req.params.saleId
      });

      const command: PreCheckoutCommand = validatedData;
      const sale = await this.salesService.preCheckout(command);
      
      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async finalizeSale(req: AuthRequest, res: Response) {
    try {
      const validatedData = finalizeSaleSchema.parse({
        saleId: req.params.saleId,
        actorId: req.user!.employeeId
      });

      const command: FinalizeSaleCommand = validatedData;
      const sale = await this.salesService.finalizeSale(command);
      
      res.json({
        success: true,
        data: sale,
        message: 'Sale finalized successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateFulfillment(req: AuthRequest, res: Response) {
    try {
      const validatedData = updateFulfillmentSchema.parse({
        ...req.body,
        saleId: req.params.saleId,
        actorId: req.user!.employeeId
      });

      const command: UpdateFulfillmentCommand = validatedData;
      const sale = await this.salesService.updateFulfillment(
        command.saleId,
        command.status,
        command.actorId
      );
      
      res.json({
        success: true,
        data: sale,
        message: `Fulfillment status updated to ${command.status}`
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async voidSale(req: AuthRequest, res: Response) {
    try {
      const validatedData = voidSaleSchema.parse({
        ...req.body,
        saleId: req.params.saleId,
        actorId: req.user!.employeeId
      });

      const command: VoidSaleCommand = validatedData;
      const sale = await this.salesService.voidSale(
        command.saleId,
        command.actorId,
        command.reason
      );
      
      res.json({
        success: true,
        data: sale,
        message: 'Sale voided successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deleteSale(req: AuthRequest, res: Response) {
    try {
      const { saleId } = req.params;
      const actorId = req.user!.employeeId;
      
      await this.salesService.deleteDraftSale(saleId, actorId);
      
      res.json({
        success: true,
        message: 'Draft deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async reopenSale(req: AuthRequest, res: Response) {
    try {
      const validatedData = reopenSaleSchema.parse({
        ...req.body,
        saleId: req.params.saleId,
        actorId: req.user!.employeeId
      });

      const command: ReopenSaleCommand = validatedData;
      const sale = await this.salesService.reopenSale(command);
      
      res.json({
        success: true,
        data: sale,
        message: 'Sale reopened successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getSale(req: AuthRequest, res: Response) {
    try {
      const { saleId } = req.params;
      const sale = await this.salesService.getSaleById(saleId);
      
      if (!sale) {
        return res.status(404).json({
          success: false,
          error: 'Sale not found'
        });
      }

      res.json({
        success: true,
        data: sale
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getActiveSales(req: AuthRequest, res: Response) {
    try {
      const query = getSalesQuerySchema.parse(req.query);
      
      const result = await this.salesService.findSalesByBranch({
        tenantId: req.user!.tenantId,
        branchId: req.user!.branchId,
        ...query
      });

      res.json({
        success: true,
        data: result.sales,
        pagination: result.pagination
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getTodaySales(req: AuthRequest, res: Response) {
    try {
      const sales = await this.salesService.getTodaySales(
        req.user!.tenantId,
        req.user!.branchId
      );

      res.json({
        success: true,
        data: sales
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }
      
      if (error.message.includes('Cannot') || error.message.includes('Only')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }

      if (error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.message
        });
      }
    }

    console.error('Sales Controller Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}