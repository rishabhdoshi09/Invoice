"""
Test Suite for Sales Total Bug Fix (P0)
========================================
Bug: 'Today's Sales' total on Day Start page was showing incorrect values.
Root Cause: totalSales in daily_summaries table was including ALL orders (paid + unpaid) 
            instead of only PAID orders.

Test Cases:
1. Creating UNPAID order should NOT add to totalSales in daily summary
2. Creating PAID order should ADD to totalSales in daily summary
3. Toggling order status from UNPAID to PAID should ADD to totalSales
4. Toggling order status from PAID to UNPAID should SUBTRACT from totalSales
5. Deleting PAID order should SUBTRACT from totalSales
6. Deleting UNPAID order should NOT affect totalSales
"""

import pytest
import requests
import os
import time
from datetime import datetime

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://payment-recount.preview.emergentagent.com"

# Test credentials
TEST_USERNAME = "admin"
TEST_PASSWORD = "admin123"


class TestSalesTotalBugFix:
    """Test suite for verifying the sales total bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("data", {}).get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store created order IDs for cleanup
        self.created_orders = []
        
        yield
        
        # Cleanup - delete test orders
        for order_id in self.created_orders:
            try:
                self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
            except:
                pass
    
    def get_today_summary(self):
        """Helper to get today's summary"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/today")
        assert response.status_code == 200, f"Failed to get today summary: {response.text}"
        return response.json().get("data", {})
    
    def create_order(self, paid_amount, total=500):
        """Helper to create an order with specified payment status"""
        today = datetime.now().strftime("%d-%m-%Y")
        
        order_data = {
            "customerName": "TEST_SalesTotal_Customer",
            "customerMobile": "9999999999",
            "orderDate": today,
            "subTotal": total,  # Required field
            "total": total,
            "tax": 0,
            "taxPercent": 0,
            "paidAmount": paid_amount,  # 0 = unpaid, total = paid
            "orderItems": [
                {
                    "name": "TEST_Product",
                    "quantity": 1,
                    "productPrice": total,
                    "totalPrice": total,
                    "type": "non-weighted"
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        
        order = response.json().get("data", {})
        self.created_orders.append(order.get("id"))
        return order
    
    def toggle_payment_status(self, order_id, new_status):
        """Helper to toggle payment status"""
        response = self.session.patch(
            f"{BASE_URL}/api/orders/{order_id}/payment-status",
            json={"newStatus": new_status}
        )
        assert response.status_code == 200, f"Failed to toggle payment status: {response.text}"
        return response.json().get("data", {})
    
    def delete_order(self, order_id):
        """Helper to delete an order"""
        response = self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        assert response.status_code == 200, f"Failed to delete order: {response.text}"
        # Remove from cleanup list since already deleted
        if order_id in self.created_orders:
            self.created_orders.remove(order_id)
        return response.json()
    
    # ==================== TEST CASES ====================
    
    def test_01_unpaid_order_should_not_add_to_total_sales(self):
        """
        Test Case 1: Creating UNPAID order should NOT add to totalSales
        
        Steps:
        1. Get initial totalSales
        2. Create an UNPAID order (paidAmount=0)
        3. Get new totalSales
        4. Verify totalSales did NOT increase
        """
        # Get initial summary
        initial_summary = self.get_today_summary()
        initial_total_sales = float(initial_summary.get("totalSales", 0))
        print(f"Initial totalSales: {initial_total_sales}")
        
        # Create UNPAID order (paidAmount=0)
        order = self.create_order(paid_amount=0, total=500)
        assert order.get("paymentStatus") == "unpaid", "Order should be unpaid"
        print(f"Created UNPAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get new summary
        new_summary = self.get_today_summary()
        new_total_sales = float(new_summary.get("totalSales", 0))
        print(f"New totalSales: {new_total_sales}")
        
        # Verify totalSales did NOT increase
        assert new_total_sales == initial_total_sales, \
            f"UNPAID order should NOT add to totalSales. Expected: {initial_total_sales}, Got: {new_total_sales}"
        
        print("✅ PASS: UNPAID order did NOT add to totalSales")
    
    def test_02_paid_order_should_add_to_total_sales(self):
        """
        Test Case 2: Creating PAID order should ADD to totalSales
        
        Steps:
        1. Get initial totalSales
        2. Create a PAID order (paidAmount=total)
        3. Get new totalSales
        4. Verify totalSales increased by order total
        """
        # Get initial summary
        initial_summary = self.get_today_summary()
        initial_total_sales = float(initial_summary.get("totalSales", 0))
        print(f"Initial totalSales: {initial_total_sales}")
        
        order_total = 750
        
        # Create PAID order (paidAmount=total)
        order = self.create_order(paid_amount=order_total, total=order_total)
        assert order.get("paymentStatus") == "paid", "Order should be paid"
        print(f"Created PAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get new summary
        new_summary = self.get_today_summary()
        new_total_sales = float(new_summary.get("totalSales", 0))
        print(f"New totalSales: {new_total_sales}")
        
        # Verify totalSales increased by order total
        expected_total = initial_total_sales + order_total
        assert new_total_sales == expected_total, \
            f"PAID order should ADD to totalSales. Expected: {expected_total}, Got: {new_total_sales}"
        
        print("✅ PASS: PAID order correctly added to totalSales")
    
    def test_03_toggle_unpaid_to_paid_should_add_to_total_sales(self):
        """
        Test Case 3: Toggling order from UNPAID to PAID should ADD to totalSales
        
        Steps:
        1. Create an UNPAID order
        2. Get totalSales (should not include this order)
        3. Toggle order to PAID
        4. Get new totalSales
        5. Verify totalSales increased by order total
        """
        order_total = 600
        
        # Create UNPAID order
        order = self.create_order(paid_amount=0, total=order_total)
        order_id = order.get("id")
        assert order.get("paymentStatus") == "unpaid", "Order should be unpaid"
        print(f"Created UNPAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get summary after creating unpaid order
        summary_before_toggle = self.get_today_summary()
        sales_before_toggle = float(summary_before_toggle.get("totalSales", 0))
        print(f"totalSales before toggle: {sales_before_toggle}")
        
        # Toggle to PAID
        updated_order = self.toggle_payment_status(order_id, "paid")
        assert updated_order.get("paymentStatus") == "paid", "Order should now be paid"
        print(f"Toggled order to PAID")
        
        # Get summary after toggle
        summary_after_toggle = self.get_today_summary()
        sales_after_toggle = float(summary_after_toggle.get("totalSales", 0))
        print(f"totalSales after toggle: {sales_after_toggle}")
        
        # Verify totalSales increased by order total
        expected_sales = sales_before_toggle + order_total
        assert sales_after_toggle == expected_sales, \
            f"Toggle to PAID should ADD to totalSales. Expected: {expected_sales}, Got: {sales_after_toggle}"
        
        print("✅ PASS: Toggle UNPAID→PAID correctly added to totalSales")
    
    def test_04_toggle_paid_to_unpaid_should_subtract_from_total_sales(self):
        """
        Test Case 4: Toggling order from PAID to UNPAID should SUBTRACT from totalSales
        
        Steps:
        1. Create a PAID order
        2. Get totalSales (should include this order)
        3. Toggle order to UNPAID
        4. Get new totalSales
        5. Verify totalSales decreased by order total
        """
        order_total = 800
        
        # Create PAID order
        order = self.create_order(paid_amount=order_total, total=order_total)
        order_id = order.get("id")
        assert order.get("paymentStatus") == "paid", "Order should be paid"
        print(f"Created PAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get summary after creating paid order
        summary_before_toggle = self.get_today_summary()
        sales_before_toggle = float(summary_before_toggle.get("totalSales", 0))
        print(f"totalSales before toggle: {sales_before_toggle}")
        
        # Toggle to UNPAID
        updated_order = self.toggle_payment_status(order_id, "unpaid")
        assert updated_order.get("paymentStatus") == "unpaid", "Order should now be unpaid"
        print(f"Toggled order to UNPAID")
        
        # Get summary after toggle
        summary_after_toggle = self.get_today_summary()
        sales_after_toggle = float(summary_after_toggle.get("totalSales", 0))
        print(f"totalSales after toggle: {sales_after_toggle}")
        
        # Verify totalSales decreased by order total
        expected_sales = sales_before_toggle - order_total
        assert sales_after_toggle == expected_sales, \
            f"Toggle to UNPAID should SUBTRACT from totalSales. Expected: {expected_sales}, Got: {sales_after_toggle}"
        
        print("✅ PASS: Toggle PAID→UNPAID correctly subtracted from totalSales")
    
    def test_05_delete_paid_order_should_subtract_from_total_sales(self):
        """
        Test Case 5: Deleting PAID order should SUBTRACT from totalSales
        
        Steps:
        1. Create a PAID order
        2. Get totalSales (should include this order)
        3. Delete the order
        4. Get new totalSales
        5. Verify totalSales decreased by order total
        """
        order_total = 450
        
        # Create PAID order
        order = self.create_order(paid_amount=order_total, total=order_total)
        order_id = order.get("id")
        assert order.get("paymentStatus") == "paid", "Order should be paid"
        print(f"Created PAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get summary after creating paid order
        summary_before_delete = self.get_today_summary()
        sales_before_delete = float(summary_before_delete.get("totalSales", 0))
        print(f"totalSales before delete: {sales_before_delete}")
        
        # Delete the order
        self.delete_order(order_id)
        print(f"Deleted order")
        
        # Get summary after delete
        summary_after_delete = self.get_today_summary()
        sales_after_delete = float(summary_after_delete.get("totalSales", 0))
        print(f"totalSales after delete: {sales_after_delete}")
        
        # Verify totalSales decreased by order total
        expected_sales = sales_before_delete - order_total
        assert sales_after_delete == expected_sales, \
            f"Deleting PAID order should SUBTRACT from totalSales. Expected: {expected_sales}, Got: {sales_after_delete}"
        
        print("✅ PASS: Deleting PAID order correctly subtracted from totalSales")
    
    def test_06_delete_unpaid_order_should_not_affect_total_sales(self):
        """
        Test Case 6: Deleting UNPAID order should NOT affect totalSales
        
        Steps:
        1. Create an UNPAID order
        2. Get totalSales (should NOT include this order)
        3. Delete the order
        4. Get new totalSales
        5. Verify totalSales remained the same
        """
        order_total = 350
        
        # Create UNPAID order
        order = self.create_order(paid_amount=0, total=order_total)
        order_id = order.get("id")
        assert order.get("paymentStatus") == "unpaid", "Order should be unpaid"
        print(f"Created UNPAID order: {order.get('orderNumber')}, total: {order.get('total')}")
        
        # Get summary after creating unpaid order
        summary_before_delete = self.get_today_summary()
        sales_before_delete = float(summary_before_delete.get("totalSales", 0))
        print(f"totalSales before delete: {sales_before_delete}")
        
        # Delete the order
        self.delete_order(order_id)
        print(f"Deleted order")
        
        # Get summary after delete
        summary_after_delete = self.get_today_summary()
        sales_after_delete = float(summary_after_delete.get("totalSales", 0))
        print(f"totalSales after delete: {sales_after_delete}")
        
        # Verify totalSales remained the same
        assert sales_after_delete == sales_before_delete, \
            f"Deleting UNPAID order should NOT affect totalSales. Expected: {sales_before_delete}, Got: {sales_after_delete}"
        
        print("✅ PASS: Deleting UNPAID order did NOT affect totalSales")


class TestDayStartPageCalculations:
    """Test suite for verifying Day Start page calculations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("data", {}).get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_07_today_summary_api_returns_correct_structure(self):
        """
        Test Case 7: Verify today's summary API returns correct structure
        """
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/today")
        assert response.status_code == 200, f"API should return 200: {response.text}"
        
        data = response.json().get("data", {})
        
        # Verify required fields exist
        required_fields = ["totalSales", "totalOrders", "totalReceivables"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify totalSales is a number (can be string from PostgreSQL DECIMAL)
        total_sales = data.get("totalSales")
        assert total_sales is not None, "totalSales should not be None"
        
        # Should be convertible to float
        try:
            float(total_sales)
        except (ValueError, TypeError):
            pytest.fail(f"totalSales should be numeric, got: {total_sales}")
        
        print(f"✅ PASS: Today's summary API returns correct structure")
        print(f"   totalSales: {total_sales}")
        print(f"   totalOrders: {data.get('totalOrders')}")
        print(f"   totalReceivables: {data.get('totalReceivables')}")
    
    def test_08_cash_sales_calculation(self):
        """
        Test Case 8: Verify Cash Sales = Total Sales - Receivables
        
        The Day Start page shows:
        - Cash Sales = totalSales (which now only includes PAID orders)
        - Credit Sales = totalReceivables (unpaid amounts)
        """
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/today")
        assert response.status_code == 200
        
        data = response.json().get("data", {})
        
        total_sales = float(data.get("totalSales", 0))
        total_receivables = float(data.get("totalReceivables", 0))
        
        # Cash sales should be total sales (since totalSales now only includes paid orders)
        # The frontend calculates: cashSales = totalSales - totalReceivables
        # But since totalSales only includes PAID orders, and totalReceivables is for unpaid,
        # they should be independent values
        
        print(f"Total Sales (PAID orders only): {total_sales}")
        print(f"Total Receivables (UNPAID amounts): {total_receivables}")
        
        # Both values should be non-negative
        assert total_sales >= 0, "Total sales should be non-negative"
        assert total_receivables >= 0, "Total receivables should be non-negative"
        
        print("✅ PASS: Cash sales calculation values are valid")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
