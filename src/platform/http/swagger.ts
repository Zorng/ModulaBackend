import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import { Express } from "express";
import { swaggerSchemas } from "./swagger-schemas.js";

export function setupSwagger(app: Express) {
  const options: swaggerJsdoc.Options = {
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Modula Backend API",
        version: "1.0.0",
        description:
          "API documentation for Modula Backend - A modular multi-tenant business management system",
        contact: {
          name: "API Support",
        },
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development server",
        },
        {
          url: "https://api.modula.example.com",
          description: "Production server",
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT access token for authentication",
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

          NotFoundError: {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Not Found" },
                  },
                },
              },
            },
          },
        },

        schemas: {
          // Merge all schemas from swagger-schemas.ts
          ...swaggerSchemas,

          // Add auth-specific schemas from swagger.config.ts
          EmployeeRole: {
            type: "string",
            enum: ["ADMIN", "MANAGER", "CASHIER", "CLERK"],
            description: "Role of the employee within a branch",
          },

          EmployeeStatus: {
            type: "string",
            enum: ["ACTIVE", "INVITED", "DISABLED"],
            description: "Current status of the employee",
          },

          Tenant: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                description: "Unique tenant identifier",
              },
              name: {
                type: "string",
                description: "Business name",
              },
              business_type: {
                type: "string",
                description: "Type of business",
              },
              status: {
                type: "string",
                description: "Tenant status",
              },
            },
          },

          TenantProfile: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string", description: "Business name" },
              business_type: { type: "string", nullable: true },
              status: { type: "string" },
              logo_url: { type: "string", nullable: true },
              contact_phone: { type: "string", nullable: true },
              contact_email: { type: "string", nullable: true },
              contact_address: { type: "string", nullable: true },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
              branch_count: { type: "number", example: 1 },
            },
          },

          TenantProfileResponse: {
            type: "object",
            properties: {
              tenant: { $ref: "#/components/schemas/TenantProfile" },
            },
          },

          UpdateTenantProfileRequest: {
            type: "object",
            properties: {
              name: { type: "string", description: "Business name" },
              contact_phone: { type: "string", nullable: true },
              contact_email: { type: "string", nullable: true },
              contact_address: { type: "string", nullable: true },
            },
          },

          TenantProfileUpdateResponse: {
            type: "object",
            properties: {
              tenant: { $ref: "#/components/schemas/TenantProfile" },
            },
          },

          TenantMetadata: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              name: { type: "string" },
              logo_url: { type: "string", nullable: true },
              status: { type: "string" },
            },
          },

          TenantMetadataResponse: {
            type: "object",
            properties: {
              tenant: { $ref: "#/components/schemas/TenantMetadata" },
            },
          },

          BranchStatus: {
            type: "string",
            enum: ["ACTIVE", "FROZEN"],
            description:
              "Branch lifecycle status (ACTIVE allows operational writes; FROZEN blocks operational writes).",
          },

          Branch: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              tenant_id: { type: "string", format: "uuid" },
              name: { type: "string" },
              address: { type: "string", nullable: true },
              contact_phone: { type: "string", nullable: true },
              contact_email: { type: "string", nullable: true },
              status: { $ref: "#/components/schemas/BranchStatus" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },

          BranchResponse: {
            type: "object",
            properties: {
              branch: { $ref: "#/components/schemas/Branch" },
            },
          },

          BranchListResponse: {
            type: "object",
            properties: {
              branches: {
                type: "array",
                items: { $ref: "#/components/schemas/Branch" },
              },
            },
          },

          UpdateBranchRequest: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: { type: "string", nullable: true },
              contact_phone: { type: "string", nullable: true },
              contact_email: { type: "string", nullable: true },
            },
          },

          Employee: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                description: "Unique employee identifier",
              },
              first_name: {
                type: "string",
                description: "Employee first name",
              },
              last_name: {
                type: "string",
                description: "Employee last name",
              },
              phone: {
                type: "string",
                description: "Employee phone number (used as login)",
              },
              status: {
                $ref: "#/components/schemas/EmployeeStatus",
              },
            },
          },

          Tokens: {
            type: "object",
            properties: {
              accessToken: {
                type: "string",
                description: "JWT access token for API authentication",
              },
              refreshToken: {
                type: "string",
                description: "Refresh token for obtaining new access tokens",
              },
              expiresIn: {
                type: "number",
                description: "Access token expiry in seconds",
                example: 43200,
              },
            },
          },

          BranchAssignment: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                description: "Assignment identifier",
              },
              employee_id: {
                type: "string",
                format: "uuid",
                description: "Employee identifier",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Branch identifier",
              },
              branch_name: {
                type: "string",
                description: "Name of the branch",
              },
              role: {
                $ref: "#/components/schemas/EmployeeRole",
              },
              active: {
                type: "boolean",
                description: "Whether this assignment is currently active",
              },
              assigned_at: {
                type: "string",
                format: "date-time",
                description: "When this assignment was created",
              },
            },
          },

          Invite: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                description: "Invite identifier",
              },
              first_name: {
                type: "string",
                description: "Invited employee first name",
              },
              last_name: {
                type: "string",
                description: "Invited employee last name",
              },
              phone: {
                type: "string",
                description: "Invited employee phone number",
              },
              role: {
                $ref: "#/components/schemas/EmployeeRole",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Branch the employee will be assigned to",
              },
              expires_at: {
                type: "string",
                format: "date-time",
                description: "When the invite expires",
              },
            },
          },

          // Request bodies
          RegisterTenantRequest: {
            type: "object",
            required: [
              "business_name",
              "phone",
              "first_name",
              "last_name",
              "password",
            ],
            properties: {
              business_name: {
                type: "string",
                description: "Name of the business",
                example: "My Restaurant",
              },
              phone: {
                type: "string",
                description: "Phone number for the admin account",
                example: "+1234567890",
              },
              first_name: {
                type: "string",
                description: "Admin first name",
                example: "John",
              },
              last_name: {
                type: "string",
                description: "Admin last name",
                example: "Doe",
              },
              password: {
                type: "string",
                format: "password",
                description: "Password for the admin account",
                example: "Test123!",
              },
              business_type: {
                type: "string",
                description: "Type of business (optional)",
                example: "restaurant",
              },
            },
          },

          LoginRequest: {
            type: "object",
            required: ["phone", "password"],
            properties: {
              phone: {
                type: "string",
                description: "Employee phone number",
                example: "+1234567890",
              },
              password: {
                type: "string",
                format: "password",
                description: "Employee password",
                example: "Test123!",
              },
            },
          },

          RefreshTokenRequest: {
            type: "object",
            required: ["refresh_token"],
            properties: {
              refresh_token: {
                type: "string",
                description:
                  "Refresh token obtained from login or previous refresh",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              },
            },
          },

          LogoutRequest: {
            type: "object",
            required: ["refresh_token"],
            properties: {
              refresh_token: {
                type: "string",
                description: "Refresh token to invalidate",
                example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              },
            },
          },

          CreateInviteRequest: {
            type: "object",
            required: ["first_name", "last_name", "phone", "role", "branch_id"],
            properties: {
              first_name: {
                type: "string",
                description: "Employee first name",
                example: "Jane",
              },
              last_name: {
                type: "string",
                description: "Employee last name",
                example: "Smith",
              },
              phone: {
                type: "string",
                description: "Employee phone number",
                example: "+1987654321",
              },
              role: {
                $ref: "#/components/schemas/EmployeeRole",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Branch to assign the employee to",
                example: "123e4567-e89b-12d3-a456-426614174000",
              },
              note: {
                type: "string",
                description: "Optional note about the invite",
                example: "New evening shift manager",
              },
              expires_in_hours: {
                type: "number",
                description: "Hours until invite expires (optional)",
                example: 72,
              },
            },
          },

          AcceptInviteRequest: {
            type: "object",
            required: ["password"],
            properties: {
              password: {
                type: "string",
                format: "password",
                description: "Password for the new account",
                example: "Test123!",
              },
            },
          },

          RequestOtpRequest: {
            type: "object",
            required: ["phone"],
            properties: {
              phone: {
                type: "string",
                description: "Phone number (E.164 recommended)",
                example: "+1234567890",
              },
            },
          },

          RequestOtpResponse: {
            type: "object",
            properties: {
              message: { type: "string", example: "OTP sent" },
              debugOtp: {
                type: "string",
                description:
                  "Development-only OTP echo (never returned in production)",
                example: "123456",
              },
            },
          },

          ConfirmForgotPasswordRequest: {
            type: "object",
            required: ["phone", "otp", "new_password"],
            properties: {
              phone: {
                type: "string",
                description: "Phone number (E.164 recommended)",
                example: "+1234567890",
              },
              otp: {
                type: "string",
                description: "OTP code received via SMS",
                example: "123456",
              },
              new_password: {
                type: "string",
                format: "password",
                description: "New password to set",
                example: "NewPassword123!",
              },
            },
          },

          ChangePasswordRequest: {
            type: "object",
            required: ["current_password", "new_password"],
            properties: {
              current_password: {
                type: "string",
                format: "password",
                description: "Current password",
                example: "OldPassword123!",
              },
              new_password: {
                type: "string",
                format: "password",
                description: "New password to set",
                example: "NewPassword123!",
              },
            },
          },

          ChangePasswordResponse: {
            type: "object",
            properties: {
              tokens: { $ref: "#/components/schemas/Tokens" },
            },
          },

          SelectTenantRequest: {
            type: "object",
            required: ["selection_token", "tenant_id"],
            properties: {
              selection_token: {
                type: "string",
                description:
                  "Short-lived token from login/forgot-password when tenant selection is required",
              },
              tenant_id: {
                type: "string",
                format: "uuid",
                description: "Tenant ID to enter",
              },
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Optional branch ID to use for the session",
              },
            },
          },

          TenantSelectionRequiredResponse: {
            type: "object",
            required: ["requires_tenant_selection", "selection_token", "memberships"],
            properties: {
              requires_tenant_selection: { type: "boolean", example: true },
              selection_token: {
                type: "string",
                description:
                  "Short-lived token used to exchange a tenant selection for normal session tokens",
              },
              memberships: {
                type: "array",
                items: {
                  type: "object",
                  required: ["tenant", "employeeId"],
                  properties: {
                    tenant: {
                      type: "object",
                      required: ["id", "name"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                      },
                    },
                    employeeId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },

          AssignBranchRequest: {
            type: "object",
            required: ["branch_id", "role"],
            properties: {
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Branch to assign",
                example: "123e4567-e89b-12d3-a456-426614174000",
              },
              role: {
                $ref: "#/components/schemas/EmployeeRole",
              },
            },
          },

          UpdateRoleRequest: {
            type: "object",
            required: ["branch_id", "role"],
            properties: {
              branch_id: {
                type: "string",
                format: "uuid",
                description: "Branch where role should be updated",
                example: "123e4567-e89b-12d3-a456-426614174000",
              },
              role: {
                $ref: "#/components/schemas/EmployeeRole",
              },
            },
          },

          // Response bodies
          RegisterTenantResponse: {
            type: "object",
            properties: {
              tenant: {
                $ref: "#/components/schemas/Tenant",
              },
              employee: {
                $ref: "#/components/schemas/Employee",
              },
              tokens: {
                $ref: "#/components/schemas/Tokens",
              },
            },
          },

          LoginResponse: {
            type: "object",
            properties: {
              employee: {
                $ref: "#/components/schemas/Employee",
              },
              tokens: {
                $ref: "#/components/schemas/Tokens",
              },
              branch_assignments: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/BranchAssignment",
                },
              },
            },
          },

          RefreshTokenResponse: {
            type: "object",
            properties: {
              tokens: {
                $ref: "#/components/schemas/Tokens",
              },
            },
          },

          LogoutResponse: {
            type: "object",
            properties: {
              message: {
                type: "string",
                example: "Logged out successfully",
              },
            },
          },

          CreateInviteResponse: {
            type: "object",
            properties: {
              invite: {
                $ref: "#/components/schemas/Invite",
              },
              invite_token: {
                type: "string",
                description:
                  "Token to be sent to the invitee (only returned on creation)",
              },
            },
          },

          AcceptInviteResponse: {
            type: "object",
            properties: {
              employee: {
                $ref: "#/components/schemas/Employee",
              },
              tokens: {
                $ref: "#/components/schemas/Tokens",
              },
            },
          },

          InviteResponse: {
            type: "object",
            properties: {
              invite: {
                $ref: "#/components/schemas/Invite",
              },
            },
          },

          AssignmentResponse: {
            type: "object",
            properties: {
              assignment: {
                $ref: "#/components/schemas/BranchAssignment",
              },
            },
          },

          EmployeeResponse: {
            type: "object",
            properties: {
              employee: {
                $ref: "#/components/schemas/Employee",
              },
            },
          },
        },
      },
      tags: [
        {
          name: "Authentication",
          description: "Public authentication endpoints",
        },
        {
          name: "Invites",
          description: "Employee invitation management (Admin only)",
        },
        {
          name: "Tenant",
          description: "Tenant business profile and metadata",
        },
        {
          name: "Branch",
          description: "Branch profile and lifecycle (freeze/unfreeze)",
        },
        {
          name: "User Management",
          description: "Employee and branch assignment management (Admin only)",
        },
        {
          name: "Menu",
          description: "Menu management endpoints",
        },
        {
          name: "Categories",
          description: "Menu category management",
        },
        {
          name: "MenuItems",
          description: "Menu item management",
        },
        {
          name: "Modifiers",
          description: "Modifier groups/options and item attachments",
        },
        {
          name: "BranchMenu",
          description: "Branch-specific menu overrides (availability, price)",
        },
        {
          name: "Query",
          description: "Optimized read-only menu queries (snapshots)",
        },
      ],
    },

    // Path(s) containing @openapi annotations
    apis: [
      "./src/server.ts",
      "./src/modules/menu/api/router/index.ts",
      "./src/modules/menu/api/router/category.routes.ts",
      "./src/modules/menu/api/router/modifier.routes.ts",
      "./src/modules/menu/api/router/menuItem.routes.ts",
      "./src/modules/menu/api/router/query.routes.ts",
      "./src/modules/*/api/*.ts",
      "./src/modules/*/api/**/*.ts",
    ],
  };

  const swaggerSpec = swaggerJsdoc(options);

  // Swagger UI with custom styling
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Modula API Docs",
    })
  );

  // Raw JSON spec
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json(swaggerSpec);
  });

  // Alternative endpoint for OpenAPI spec
  app.get("/openapi.json", (_req, res) => {
    res.json(swaggerSpec);
  });
}
