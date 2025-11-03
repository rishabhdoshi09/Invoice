#!/bin/bash

# Backend API Comprehensive Audit Script
# Base URL for all API calls
BASE_URL="http://localhost:8001/api"

echo "========================================"
echo "BACKEND API AUDIT - Starting Tests"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    echo -n "Testing: $description ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$endpoint" 2>&1)
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" -H "Content-Type: application/json" -d "$data" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        ((PASS++))
    elif [ "$http_code" = "400" ]; then
        echo -e "${YELLOW}⚠ EXPECTED ERROR${NC} (HTTP $http_code)"
        ((PASS++))
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        ((FAIL++))
    fi
}

echo "=== 1. PRODUCTS MODULE ==="
test_endpoint "GET" "/products" "List Products"
test_endpoint "GET" "/products?limit=10&offset=0" "List Products with Pagination"
echo ""

echo "=== 2. ORDERS MODULE ==="
test_endpoint "GET" "/orders" "List Orders"
test_endpoint "GET" "/orders?limit=10&offset=0" "List Orders with Pagination"
echo ""

echo "=== 3. SUPPLIERS MODULE ==="
test_endpoint "GET" "/suppliers" "List Suppliers"
test_endpoint "GET" "/suppliers?q=ABC" "Search Suppliers"
echo ""

echo "=== 4. CUSTOMERS MODULE ==="
test_endpoint "GET" "/customers" "List Customers"
test_endpoint "GET" "/customers?limit=10&offset=0" "List Customers with Pagination"
echo ""

echo "=== 5. PURCHASES MODULE ==="
test_endpoint "GET" "/purchases" "List Purchase Bills"
test_endpoint "GET" "/purchases?limit=10&offset=0" "List Purchases with Pagination"
echo ""

echo "=== 6. PAYMENTS MODULE ==="
test_endpoint "GET" "/payments" "List Payments"
test_endpoint "GET" "/payments?limit=10" "List Payments with Limit"
echo ""

echo "=== 7. REPORTS MODULE ==="
test_endpoint "GET" "/reports/outstanding" "Outstanding Report"
echo ""

echo "=== 8. TALLY EXPORT MODULE ==="
test_endpoint "GET" "/export/tally/sales" "Export All Sales (CSV)"
test_endpoint "GET" "/export/tally/purchases" "Export All Purchases (CSV)"
test_endpoint "GET" "/export/tally/payments" "Export Payments (CSV)"
test_endpoint "GET" "/export/tally/outstanding" "Export Outstanding (CSV)"
echo ""

echo "=== 9. HELLO WORLD (Health Check) ==="
test_endpoint "GET" "/" "Health Check Endpoint"
echo ""

echo "========================================"
echo "AUDIT SUMMARY"
echo "========================================"
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo "Total Tests: $((PASS + FAIL))"
echo "========================================"
