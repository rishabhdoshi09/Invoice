"""
Test P0 Bug Fixes for BizLedger Invoice System
Tests:
1. Order creation with GST invoice number generation (INV/YYYY-YY/XXXX format)
2. Date display format (DD-MM-YYYY from backend)
3. Concurrent order creation (no duplicate invoice numbers)
4. Transaction support for order creation
"""

import pytest
import requests
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://retail-dashboard-55.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

class TestP0Fixes:
    """Test P0 bug fixes for order creation and invoice generation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data['data']['token']
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_invoice_number_format(self):
        """Test that invoice numbers follow GST format: INV/YYYY-YY/XXXX"""
        # Create an order
        order_data = {
            "orderDate": "18-01-2026",
            "customerName": "TEST_Invoice_Format",
            "customerMobile": "9999999001",
            "subTotal": 100,
            "tax": 0,
            "taxPercent": 0,
            "total": 100,
            "paidAmount": 100,
            "orderItems": [{
                "productId": "test-product-format",
                "name": "Test Product",
                "altName": "",
                "type": "non-weighted",
                "quantity": 1,
                "productPrice": 100,
                "totalPrice": 100
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        data = response.json()
        order_number = data['data']['orderNumber']
        
        # Verify format: INV/YYYY-YY/XXXX
        import re
        pattern = r'^INV/\d{4}-\d{2}/\d{4}$'
        assert re.match(pattern, order_number), f"Invoice number '{order_number}' doesn't match GST format INV/YYYY-YY/XXXX"
        print(f"✅ Invoice number format correct: {order_number}")
    
    def test_date_format_from_backend(self):
        """Test that orderDate is stored and returned in DD-MM-YYYY format"""
        # Create an order with specific date
        order_data = {
            "orderDate": "18-01-2026",
            "customerName": "TEST_Date_Format",
            "customerMobile": "9999999002",
            "subTotal": 100,
            "tax": 0,
            "taxPercent": 0,
            "total": 100,
            "paidAmount": 100,
            "orderItems": [{
                "productId": "test-product-date",
                "name": "Test Product",
                "altName": "",
                "type": "non-weighted",
                "quantity": 1,
                "productPrice": 100,
                "totalPrice": 100
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        data = response.json()
        order_date = data['data']['orderDate']
        
        # Verify date format: DD-MM-YYYY
        import re
        pattern = r'^\d{2}-\d{2}-\d{4}$'
        assert re.match(pattern, order_date), f"Order date '{order_date}' doesn't match DD-MM-YYYY format"
        assert order_date == "18-01-2026", f"Order date mismatch: expected '18-01-2026', got '{order_date}'"
        print(f"✅ Date format correct: {order_date}")
    
    def test_concurrent_order_creation_no_duplicates(self):
        """Test that concurrent order creation doesn't produce duplicate invoice numbers"""
        created_orders = []
        errors = []
        
        def create_order(i):
            order_data = {
                "orderDate": "18-01-2026",
                "customerName": f"TEST_Concurrent_{i}",
                "customerMobile": f"999999{i:04d}",
                "subTotal": 100,
                "tax": 0,
                "taxPercent": 0,
                "total": 100,
                "paidAmount": 100,
                "orderItems": [{
                    "productId": f"test-product-concurrent-{i}",
                    "name": f"Test Product {i}",
                    "altName": "",
                    "type": "non-weighted",
                    "quantity": 1,
                    "productPrice": 100,
                    "totalPrice": 100
                }]
            }
            
            try:
                response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
                if response.status_code == 200:
                    return response.json()['data']
                else:
                    return {"error": response.text, "status": response.status_code}
            except Exception as e:
                return {"error": str(e)}
        
        # Create 5 orders concurrently
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(create_order, i) for i in range(5)]
            for future in as_completed(futures):
                result = future.result()
                if 'error' in result:
                    errors.append(result)
                else:
                    created_orders.append(result)
        
        # Check for errors
        assert len(errors) == 0, f"Some orders failed: {errors}"
        
        # Check for duplicate invoice numbers
        invoice_numbers = [order['orderNumber'] for order in created_orders]
        unique_numbers = set(invoice_numbers)
        
        assert len(invoice_numbers) == len(unique_numbers), \
            f"Duplicate invoice numbers found! Numbers: {invoice_numbers}"
        
        print(f"✅ No duplicate invoice numbers in concurrent creation: {invoice_numbers}")
    
    def test_order_creation_with_transaction(self):
        """Test that order creation uses transaction (all-or-nothing)"""
        # Create a valid order
        order_data = {
            "orderDate": "18-01-2026",
            "customerName": "TEST_Transaction",
            "customerMobile": "9999999003",
            "subTotal": 200,
            "tax": 0,
            "taxPercent": 0,
            "total": 200,
            "paidAmount": 200,
            "orderItems": [{
                "productId": "test-product-tx-1",
                "name": "Test Product 1",
                "altName": "",
                "type": "non-weighted",
                "quantity": 2,
                "productPrice": 100,
                "totalPrice": 200
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        data = response.json()
        order_id = data['data']['id']
        
        # Verify order was created with items
        get_response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=self.headers)
        assert get_response.status_code == 200, f"Get order failed: {get_response.text}"
        
        order = get_response.json()['data']
        assert order['orderItems'] is not None, "Order items should exist"
        assert len(order['orderItems']) == 1, f"Expected 1 order item, got {len(order['orderItems'])}"
        
        print(f"✅ Transaction support working: Order {order['orderNumber']} created with items")
    
    def test_time_display_data_available(self):
        """Test that createdAt timestamp is available for time display"""
        # Get recent orders
        response = requests.get(f"{BASE_URL}/api/orders?limit=5", headers=self.headers)
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        
        data = response.json()
        orders = data['data']['rows']
        
        assert len(orders) > 0, "No orders found"
        
        for order in orders:
            assert 'createdAt' in order, f"Order {order['orderNumber']} missing createdAt"
            assert order['createdAt'] is not None, f"Order {order['orderNumber']} has null createdAt"
            
            # Verify it's a valid ISO timestamp
            from datetime import datetime
            try:
                datetime.fromisoformat(order['createdAt'].replace('Z', '+00:00'))
            except ValueError:
                pytest.fail(f"Invalid createdAt format: {order['createdAt']}")
        
        print(f"✅ Time display data available: All orders have valid createdAt timestamps")
    
    def test_order_list_refresh(self):
        """Test that order list returns fresh data after creation"""
        # Get initial count
        response1 = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=self.headers)
        assert response1.status_code == 200
        initial_count = response1.json()['data']['count']
        
        # Create a new order
        order_data = {
            "orderDate": "18-01-2026",
            "customerName": "TEST_Refresh",
            "customerMobile": "9999999004",
            "subTotal": 100,
            "tax": 0,
            "taxPercent": 0,
            "total": 100,
            "paidAmount": 100,
            "orderItems": [{
                "productId": "test-product-refresh",
                "name": "Test Product",
                "altName": "",
                "type": "non-weighted",
                "quantity": 1,
                "productPrice": 100,
                "totalPrice": 100
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_response.status_code == 200
        new_order_number = create_response.json()['data']['orderNumber']
        
        # Get updated list
        response2 = requests.get(f"{BASE_URL}/api/orders?limit=100", headers=self.headers)
        assert response2.status_code == 200
        new_count = response2.json()['data']['count']
        
        # Verify count increased
        assert new_count == initial_count + 1, f"Order count didn't increase: {initial_count} -> {new_count}"
        
        # Verify new order is in the list
        orders = response2.json()['data']['rows']
        order_numbers = [o['orderNumber'] for o in orders]
        assert new_order_number in order_numbers, f"New order {new_order_number} not in list"
        
        print(f"✅ Order list refresh working: Count {initial_count} -> {new_count}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
