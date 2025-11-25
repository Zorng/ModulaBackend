import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Modula Backend API',
      version: '1.0.0',
      description: 'API documentation for Modula Backend - A modular multi-tenant business management system',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.modula.example.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token for authentication',
        },
      },
      schemas: {
        // Error responses
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        
        // Common types
        EmployeeRole: {
          type: 'string',
          enum: ['ADMIN', 'MANAGER', 'CASHIER', 'CLERK'],
          description: 'Role of the employee within a branch',
        },
        
        EmployeeStatus: {
          type: 'string',
          enum: ['ACTIVE', 'INVITED', 'DISABLED'],
          description: 'Current status of the employee',
        },

        // Auth entities
        Tenant: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique tenant identifier',
            },
            name: {
              type: 'string',
              description: 'Business name',
            },
            business_type: {
              type: 'string',
              description: 'Type of business',
            },
            status: {
              type: 'string',
              description: 'Tenant status',
            },
          },
        },

        Employee: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique employee identifier',
            },
            first_name: {
              type: 'string',
              description: 'Employee first name',
            },
            last_name: {
              type: 'string',
              description: 'Employee last name',
            },
            phone: {
              type: 'string',
              description: 'Employee phone number (used as login)',
            },
            status: {
              $ref: '#/components/schemas/EmployeeStatus',
            },
          },
        },

        Tokens: {
          type: 'object',
          properties: {
            access_token: {
              type: 'string',
              description: 'JWT access token for API authentication',
            },
            refresh_token: {
              type: 'string',
              description: 'Refresh token for obtaining new access tokens',
            },
          },
        },

        BranchAssignment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Assignment identifier',
            },
            employee_id: {
              type: 'string',
              format: 'uuid',
              description: 'Employee identifier',
            },
            branch_id: {
              type: 'string',
              format: 'uuid',
              description: 'Branch identifier',
            },
            branch_name: {
              type: 'string',
              description: 'Name of the branch',
            },
            role: {
              $ref: '#/components/schemas/EmployeeRole',
            },
            active: {
              type: 'boolean',
              description: 'Whether this assignment is currently active',
            },
          },
        },

        Invite: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Invite identifier',
            },
            first_name: {
              type: 'string',
              description: 'Invited employee first name',
            },
            last_name: {
              type: 'string',
              description: 'Invited employee last name',
            },
            phone: {
              type: 'string',
              description: 'Invited employee phone number',
            },
            role: {
              $ref: '#/components/schemas/EmployeeRole',
            },
            branch_id: {
              type: 'string',
              format: 'uuid',
              description: 'Branch the employee will be assigned to',
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the invite expires',
            },
          },
        },

        // Request bodies
        RegisterTenantRequest: {
          type: 'object',
          required: ['business_name', 'phone', 'first_name', 'last_name', 'password'],
          properties: {
            business_name: {
              type: 'string',
              description: 'Name of the business',
              example: 'My Restaurant',
            },
            phone: {
              type: 'string',
              description: 'Phone number for the admin account',
              example: '+1234567890',
            },
            first_name: {
              type: 'string',
              description: 'Admin first name',
              example: 'John',
            },
            last_name: {
              type: 'string',
              description: 'Admin last name',
              example: 'Doe',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'Password for the admin account',
              example: 'SecurePass123!',
            },
            business_type: {
              type: 'string',
              description: 'Type of business (optional)',
              example: 'restaurant',
            },
          },
        },

        LoginRequest: {
          type: 'object',
          required: ['phone', 'password'],
          properties: {
            phone: {
              type: 'string',
              description: 'Employee phone number',
              example: '+1234567890',
            },
            password: {
              type: 'string',
              format: 'password',
              description: 'Employee password',
              example: 'SecurePass123!',
            },
          },
        },

        RefreshTokenRequest: {
          type: 'object',
          required: ['refresh_token'],
          properties: {
            refresh_token: {
              type: 'string',
              description: 'Refresh token obtained from login or previous refresh',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },

        LogoutRequest: {
          type: 'object',
          required: ['refresh_token'],
          properties: {
            refresh_token: {
              type: 'string',
              description: 'Refresh token to invalidate',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },

        CreateInviteRequest: {
          type: 'object',
          required: ['first_name', 'last_name', 'phone', 'role', 'branch_id'],
          properties: {
            first_name: {
              type: 'string',
              description: 'Employee first name',
              example: 'Jane',
            },
            last_name: {
              type: 'string',
              description: 'Employee last name',
              example: 'Smith',
            },
            phone: {
              type: 'string',
              description: 'Employee phone number',
              example: '+1987654321',
            },
            role: {
              $ref: '#/components/schemas/EmployeeRole',
            },
            branch_id: {
              type: 'string',
              format: 'uuid',
              description: 'Branch to assign the employee to',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            note: {
              type: 'string',
              description: 'Optional note about the invite',
              example: 'New evening shift manager',
            },
            expires_in_hours: {
              type: 'number',
              description: 'Hours until invite expires (optional)',
              example: 72,
            },
          },
        },

        AcceptInviteRequest: {
          type: 'object',
          required: ['password'],
          properties: {
            password: {
              type: 'string',
              format: 'password',
              description: 'Password for the new account',
              example: 'SecurePass123!',
            },
          },
        },

        AssignBranchRequest: {
          type: 'object',
          required: ['branch_id', 'role'],
          properties: {
            branch_id: {
              type: 'string',
              format: 'uuid',
              description: 'Branch to assign',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            role: {
              $ref: '#/components/schemas/EmployeeRole',
            },
          },
        },

        UpdateRoleRequest: {
          type: 'object',
          required: ['branch_id', 'role'],
          properties: {
            branch_id: {
              type: 'string',
              format: 'uuid',
              description: 'Branch where role should be updated',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            role: {
              $ref: '#/components/schemas/EmployeeRole',
            },
          },
        },

        // Response bodies
        RegisterTenantResponse: {
          type: 'object',
          properties: {
            tenant: {
              $ref: '#/components/schemas/Tenant',
            },
            employee: {
              $ref: '#/components/schemas/Employee',
            },
            tokens: {
              $ref: '#/components/schemas/Tokens',
            },
          },
        },

        LoginResponse: {
          type: 'object',
          properties: {
            employee: {
              $ref: '#/components/schemas/Employee',
            },
            tokens: {
              $ref: '#/components/schemas/Tokens',
            },
            branch_assignments: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/BranchAssignment',
              },
            },
          },
        },

        RefreshTokenResponse: {
          type: 'object',
          properties: {
            tokens: {
              $ref: '#/components/schemas/Tokens',
            },
          },
        },

        LogoutResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Logged out successfully',
            },
          },
        },

        CreateInviteResponse: {
          type: 'object',
          properties: {
            invite: {
              $ref: '#/components/schemas/Invite',
            },
            invite_token: {
              type: 'string',
              description: 'Token to be sent to the invitee (only returned on creation)',
            },
          },
        },

        AcceptInviteResponse: {
          type: 'object',
          properties: {
            employee: {
              $ref: '#/components/schemas/Employee',
            },
            tokens: {
              $ref: '#/components/schemas/Tokens',
            },
          },
        },

        InviteResponse: {
          type: 'object',
          properties: {
            invite: {
              $ref: '#/components/schemas/Invite',
            },
          },
        },

        AssignmentResponse: {
          type: 'object',
          properties: {
            assignment: {
              $ref: '#/components/schemas/BranchAssignment',
            },
          },
        },

        EmployeeResponse: {
          type: 'object',
          properties: {
            employee: {
              $ref: '#/components/schemas/Employee',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Public authentication endpoints',
      },
      {
        name: 'Invites',
        description: 'Employee invitation management (Admin only)',
      },
      {
        name: 'User Management',
        description: 'Employee and branch assignment management (Admin only)',
      },
    ],
  },
  apis: ['./src/modules/*/api/*.ts', './src/modules/*/api/**/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Modula API Docs',
  }));

  // Swagger JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
