import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { Express } from "express";
import { swaggerSchemas } from "./swagger-schemas.js";

export function setupSwagger(app: Express) {
  const options = {
    definition: {
      openapi: "3.0.3",
      info: {
        title: "API Documentation",
        version: "1.0.0",
        description: "Auto-generated API documentation",
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },

        parameters: {
          categoryIdParam: {
            name: "categoryId",
            in: "path",
            required: true,
            schema: {
              type: "string",
              format: "uuid",
            },
            description: "Category ID to update/delete",
          },
        },

        responses: {
          ValidationError: {
            description: "Invalid request payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Validation failed" },
                    errors: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },

          UnauthorizedError: {
            description: "Missing or invalid token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Unauthorized" },
                  },
                },
              },
            },
          },

          ForbiddenError: {
            description: "User lacks permission",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Forbidden" },
                  },
                },
              },
            },
          },

          ConflictError: {
            description: "Resource conflict (duplicate, invalid state)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Category already exists",
                    },
                  },
                },
              },
            },
          },
        },

        schemas: swaggerSchemas,
      },
    },

    // Path(s) containing @openapi annotations
    apis: [
      "./src/server.ts",
      "./src/modules/menu/api/router/index.ts",
      "./src/modules/menu/api/router/category.routes.ts",
      "./src/modules/menu/api/router/modifier.routes.ts",
      "./src/modules/menu/api/router/menuItem.routes.ts",
      "./src/modules/menu/api/router/query.routes.ts"
    ],
  };

  const swaggerSpec = swaggerJsdoc(options);

  // UI documentation
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Raw JSON spec
  app.get("/openapi.json", (_req, res) => {
    res.json(swaggerSpec);
  });
}
