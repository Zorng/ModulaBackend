#!/bin/bash

echo "Testing ModulaBackend Auth Endpoints"
echo "====================================="

BASE_URL="http://localhost:3000"

# Test 1: Health Check
echo -e "\n1. Health Check"
curl -s "$BASE_URL/health" | head -c 200
echo ""

# Test 2: Register Tenant
echo -e "\n2. Register Tenant"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/auth/register-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Test Business",
    "phone": "+85515629192",
    "first_name": "John",
    "last_name": "Doe",
    "password": "SecurePass123!",
    "business_type": "RETAIL"
  }')
echo "$REGISTER_RESPONSE" | head -c 500
echo ""

# Extract access token
ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Test 3: Login
echo -e "\n3. Login"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+85515629192",
    "password": "SecurePass123!"
  }')
echo "$LOGIN_RESPONSE" | head -c 500
echo ""

# Extract access token from login
if [ -z "$ACCESS_TOKEN" ]; then
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

echo -e "\nAccess Token: $ACCESS_TOKEN"

# Test 4: Protected Route - Create Invite (if we have a token)
if [ ! -z "$ACCESS_TOKEN" ]; then
  echo -e "\n4. Create Invite (Admin only)"
  # First get branch_id from login response
  BRANCH_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"branch_id":"[^"]*"' | cut -d'"' -f4)
  
  if [ ! -z "$BRANCH_ID" ]; then
    curl -s -X POST "$BASE_URL/v1/auth/invites" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -d "{
        \"first_name\": \"Jane\",
        \"last_name\": \"Smith\",
        \"phone\": \"+85519999999\",
        \"role\": \"CASHIER\",
        \"branch_id\": \"$BRANCH_ID\"
      }" | head -c 500
    echo ""
  fi
fi

echo -e "\n\nTests completed!"
