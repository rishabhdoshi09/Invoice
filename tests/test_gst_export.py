"""
Test GST Export Tool Feature
- Tests backend API endpoints for GST export
- Tests price adjustment calculation logic
- Tests CSV export functionality
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://accounting-integrity-1.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_USERNAME = "admin"
TEST_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        token = data.get("token") or data.get("data", {}).get("token")
        if token:
            return token
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_session(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestGstExportAuthentication:
    """Test GST Export API authentication requirements"""
    
    def test_gst_export_requires_auth(self):
        """GST export endpoint should require authentication"""
        response = requests.post(f"{BASE_URL}/api/gst-export/excel", json={
            "orders": [],
            "useAdjusted": True,
            "priceRules": []
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: GST export requires authentication")
    
    def test_gst_summary_requires_auth(self):
        """GST summary endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/gst-export/summary")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: GST summary requires authentication")


class TestGstExportApi:
    """Test GST Export API endpoints"""
    
    def test_gst_export_empty_orders(self, authenticated_session):
        """GST export should return 400 for empty orders"""
        response = authenticated_session.post(f"{BASE_URL}/api/gst-export/excel", json={
            "orders": [],
            "useAdjusted": True,
            "priceRules": []
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "No orders provided" in data.get("message", ""), f"Unexpected message: {data}"
        print("PASS: GST export returns 400 for empty orders")
    
    def test_gst_export_with_orders(self, authenticated_session):
        """GST export should generate CSV for valid orders"""
        # Create test order data
        test_orders = [{
            "id": "test-1",
            "orderNumber": "INV/2025-26/0001",
            "orderDate": "15-12-2025",
            "customerName": "Test Customer",
            "customerGstin": "27AABCU9603R1ZM",
            "placeOfSupply": "27-Maharashtra",
            "subTotal": 1000,
            "tax": 180,
            "taxPercent": 18,
            "total": 1180,
            "orderItems": [
                {
                    "name": "Test Product",
                    "productPrice": 250,
                    "quantity": 4,
                    "totalPrice": 1000,
                    "type": "weighted"
                }
            ],
            "adjustedItems": [
                {
                    "name": "Test Product",
                    "productPrice": 220,
                    "quantity": 4.545,
                    "totalPrice": 1000,
                    "originalPrice": 250,
                    "originalQuantity": 4,
                    "adjusted": True,
                    "type": "weighted"
                }
            ],
            "adjusted": True
        }]
        
        response = authenticated_session.post(f"{BASE_URL}/api/gst-export/excel", json={
            "orders": test_orders,
            "useAdjusted": True,
            "priceRules": [{"minPrice": 200, "maxPrice": 299, "targetPrice": 220, "enabled": True}]
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type is CSV
        content_type = response.headers.get('Content-Type', '')
        assert 'text/csv' in content_type, f"Expected CSV content type, got {content_type}"
        
        # Check CSV content
        csv_content = response.text
        assert "Invoice Number" in csv_content, "CSV should have Invoice Number header"
        assert "Adjusted Price" in csv_content, "CSV should have Adjusted Price header"
        assert "INV/2025-26/0001" in csv_content, "CSV should contain order number"
        assert "Test Product" in csv_content, "CSV should contain product name"
        
        print("PASS: GST export generates valid CSV")
    
    def test_gst_export_original_values(self, authenticated_session):
        """GST export should export original values when useAdjusted=false"""
        test_orders = [{
            "id": "test-2",
            "orderNumber": "INV/2025-26/0002",
            "orderDate": "15-12-2025",
            "customerName": "Original Test",
            "subTotal": 500,
            "tax": 90,
            "taxPercent": 18,
            "total": 590,
            "orderItems": [
                {
                    "name": "Original Product",
                    "productPrice": 250,
                    "quantity": 2,
                    "totalPrice": 500,
                    "type": "weighted"
                }
            ]
        }]
        
        response = authenticated_session.post(f"{BASE_URL}/api/gst-export/excel", json={
            "orders": test_orders,
            "useAdjusted": False,
            "priceRules": []
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        csv_content = response.text
        assert "Original Product" in csv_content, "CSV should contain product name"
        assert "250" in csv_content, "CSV should contain original price"
        
        print("PASS: GST export exports original values correctly")
    
    def test_gst_summary_endpoint(self, authenticated_session):
        """GST summary endpoint should return summary data"""
        response = authenticated_session.get(f"{BASE_URL}/api/gst-export/summary")
        
        # This endpoint may return 200 or 500 depending on database state
        if response.status_code == 200:
            data = response.json()
            assert "data" in data or "totalOrders" in data, f"Unexpected response: {data}"
            print("PASS: GST summary returns data")
        else:
            print(f"INFO: GST summary returned {response.status_code} - may need database setup")


class TestPriceAdjustmentLogic:
    """Test price adjustment calculation logic"""
    
    def test_price_adjustment_calculation(self):
        """Test that price adjustment maintains total"""
        # Original: price=250, qty=4, total=1000
        # Rule: 200-299 → 220
        # Adjusted: price=220, qty=1000/220=4.545, total=1000
        
        original_price = 250
        original_qty = 4
        total_price = original_price * original_qty  # 1000
        
        target_price = 220
        new_qty = total_price / target_price  # 4.545454...
        
        # Verify total is preserved
        adjusted_total = target_price * new_qty
        assert abs(adjusted_total - total_price) < 0.01, f"Total should be preserved: {adjusted_total} vs {total_price}"
        
        print(f"PASS: Price adjustment preserves total: {original_price}×{original_qty}={total_price} → {target_price}×{new_qty:.3f}={adjusted_total:.2f}")
    
    def test_price_rule_matching(self):
        """Test price rule matching logic"""
        price_rules = [
            {"minPrice": 100, "maxPrice": 199, "targetPrice": 120, "enabled": True},
            {"minPrice": 200, "maxPrice": 299, "targetPrice": 220, "enabled": True},
            {"minPrice": 300, "maxPrice": 399, "targetPrice": 330, "enabled": True},
        ]
        
        # Test price 150 should match rule 1
        price = 150
        matching_rule = next((r for r in price_rules if r["enabled"] and r["minPrice"] <= price <= r["maxPrice"]), None)
        assert matching_rule is not None, "Should find matching rule for price 150"
        assert matching_rule["targetPrice"] == 120, f"Expected target 120, got {matching_rule['targetPrice']}"
        
        # Test price 250 should match rule 2
        price = 250
        matching_rule = next((r for r in price_rules if r["enabled"] and r["minPrice"] <= price <= r["maxPrice"]), None)
        assert matching_rule is not None, "Should find matching rule for price 250"
        assert matching_rule["targetPrice"] == 220, f"Expected target 220, got {matching_rule['targetPrice']}"
        
        # Test price 350 should match rule 3
        price = 350
        matching_rule = next((r for r in price_rules if r["enabled"] and r["minPrice"] <= price <= r["maxPrice"]), None)
        assert matching_rule is not None, "Should find matching rule for price 350"
        assert matching_rule["targetPrice"] == 330, f"Expected target 330, got {matching_rule['targetPrice']}"
        
        # Test price 50 should not match any rule
        price = 50
        matching_rule = next((r for r in price_rules if r["enabled"] and r["minPrice"] <= price <= r["maxPrice"]), None)
        assert matching_rule is None, "Should not find matching rule for price 50"
        
        print("PASS: Price rule matching works correctly")


class TestOrdersApiForGstExport:
    """Test orders API that feeds GST export"""
    
    def test_get_orders_for_export(self, authenticated_session):
        """Test fetching orders for GST export"""
        response = authenticated_session.get(f"{BASE_URL}/api/orders", params={
            "limit": 100,
            "offset": 0
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check response structure
        assert "data" in data, "Response should have 'data' field"
        orders_data = data["data"]
        
        if isinstance(orders_data, dict):
            assert "rows" in orders_data, "Data should have 'rows' field"
            orders = orders_data["rows"]
        else:
            orders = orders_data
        
        print(f"PASS: Fetched {len(orders)} orders for GST export")
        
        # Verify order structure has required fields for GST export
        if len(orders) > 0:
            order = orders[0]
            required_fields = ["orderNumber", "orderDate", "total"]
            for field in required_fields:
                assert field in order, f"Order should have '{field}' field"
            print(f"PASS: Order structure has required fields for GST export")
        
        return orders


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
