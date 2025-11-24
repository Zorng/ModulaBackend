import pkg from "jsonwebtoken";
const { sign, verify } = pkg;

const secret = "dev-secret";
const payload = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tenantId: "db330415-f3c1-4da8-895f-ef62e6eee0ce",
  roles: ["tenant"],
};

const token = sign(payload, secret, { expiresIn: "24h" });

console.log("\n=== TOKEN GENERATION ===");
console.log("Secret used:", secret);
console.log("Payload:", JSON.stringify(payload, null, 2));
console.log("\n=== GENERATED TOKEN ===");
console.log(token);
console.log("\n=== TOKEN INFO ===");
console.log("Length:", token.length);
console.log("Parts:", token.split(".").length, "(should be 3)");
console.log("\n=== FOR SWAGGER UI ===");
console.log("Bearer", token);
console.log("\n=== FOR POSTMAN ===");
console.log("Authorization header:");
console.log("Key: Authorization");
console.log("Value: Bearer " + token);
console.log("\n=== FOR CURL ===");
console.log(
  `curl -H "Authorization: Bearer ${token}" http://localhost:3000/v1/menu/categories`
);

// Verify it works
try {
  const decoded = verify(token, secret);
  console.log("\n✅ TOKEN VERIFIED SUCCESSFULLY");
  console.log("Decoded:", decoded);
} catch (err) {
  console.error("\n❌ TOKEN VERIFICATION FAILED:", err.message);
}
