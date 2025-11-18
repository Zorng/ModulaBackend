import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Menu Module API",
      version: "1.0.0",
      description: "API documentation for the Menu module",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Enter your JWT Bearer token in the format: Bearer <token>",
        },
      },
      schemas: {
        Category: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            displayOrder: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
          required: ["id", "name", "displayOrder", "createdAt", "updatedAt"],
        },
        CreateCategoryInput: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            displayOrder: { type: "integer" },
          },
          required: ["name"],
        },
        UpdateCategoryInput: {
          type: "object",
          properties: {
            name: { type: "string" },
            displayOrder: { type: "integer" },
          },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  apis: [
    "./src/modules/menu/api/router/*.ts",
    "./src/modules/menu/api/schemas/**/*.ts",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // Serve raw OpenAPI JSON for Postman import
  app.get("/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
