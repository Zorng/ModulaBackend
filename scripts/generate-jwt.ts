// scripts/generate-jwt.ts
/**
 * JWT Token Generator for Testing
 * Generates valid JWT tokens for Swagger/API testing
 *
 * Usage:
 *   pnpm tsx scripts/generate-jwt.ts
 *   pnpm tsx scripts/generate-jwt.ts --role manager
 *   pnpm tsx scripts/generate-jwt.ts --userId custom-user-123
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";

// JWT Configuration (match your production settings)
const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES_IN = "7d"; // 7 days for testing

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag: string, defaultValue: string) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

// Default test user data
const userId = getArg("--userId", crypto.randomUUID());
const tenantId = getArg("--tenantId", crypto.randomUUID());
const branchId = getArg("--branchId", crypto.randomUUID());
const role = getArg("--role", "tenant"); // tenant, manager, cashier
const email = getArg("--email", "test@example.com");

// Build JWT payload
const payload = {
  // Standard JWT claims
  sub: userId, // Subject (user ID)
  iat: Math.floor(Date.now() / 1000), // Issued at
  // exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // Expires in 7 days

  // Custom claims for Modula
  userId,
  tenantId,
  branchId,
  email,
  roles: [role],

  // Additional metadata
  name: `Test User (${role})`,
  type: "access_token",
};

// Generate token
const token = jwt.sign(payload, JWT_SECRET, {
  algorithm: "HS256",
  expiresIn: JWT_EXPIRES_IN,
});

// Verify token works
try {
  const decoded = jwt.verify(token, JWT_SECRET) as any;

  console.log("\n✅ JWT Token Generated Successfully!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📋 Token Details:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`User ID:    ${decoded.userId}`);
  console.log(`Tenant ID:  ${decoded.tenantId}`);
  console.log(`Branch ID:  ${decoded.branchId}`);
  console.log(`Email:      ${decoded.email}`);
  console.log(`Role:       ${decoded.roles.join(", ")}`);
  console.log(`Issued:     ${new Date(decoded.iat * 1000).toISOString()}`);
  console.log(`Expires:    ${new Date(decoded.exp * 1000).toISOString()}`);
  console.log("\n🔑 Your JWT Token:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`\n${token}\n`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n📝 Usage in Swagger:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1. Click 'Authorize' button in Swagger UI");
  console.log("2. Enter: Bearer " + token.substring(0, 50) + "...");
  console.log("3. Click 'Authorize' and 'Close'");

  console.log("\n📝 Usage in curl:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `curl -H "Authorization: Bearer ${token.substring(0, 50)}..." \\`
  );
  console.log(`     http://localhost:3000/v1/menu/categories`);

  console.log("\n💡 Tips:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("• Token is valid for 7 days");
  console.log("• Save this token in a .env file for repeated testing");
  console.log(
    "• Generate different roles: pnpm tsx scripts/generate-jwt.ts --role manager"
  );
  console.log(
    "• Custom user ID: pnpm tsx scripts/generate-jwt.ts --userId my-user-123"
  );
  console.log("\n");
} catch (error) {
  console.error("❌ Token verification failed:", error);
  process.exit(1);
}
