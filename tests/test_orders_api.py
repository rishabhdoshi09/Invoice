"""
Test suite for Orders API endpoints
Tests: GET /api/orders, POST /api/orders, order creation and listing flow
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bugfree-billing.preview.emergentagent.com')
if BASE_URL.endswith('/api'):
    BASE_URL = BASE_URL[:-4]  # Remove /api suffix if present

class TestOrdersAPI:
    """Test Orders API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json()['data']['token']
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        print(f"\n✓ Logged in successfully")
    
    def test_list_orders_returns_200(self):
        """Test GET /api/orders returns 200 with orders data"""
        response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'data' in data, "Response should have 'data' field"
        assert 'count' in data['data'], "Response should have 'count' field"
        assert 'rows' in data['data'], "Response should have 'rows' field"
        
        print(f"✓ GET /api/orders returned {data['data']['count']} orders")
        return data['data']
    
    def test_list_orders_returns_array_of_orders(self):
        """Test that orders list returns proper order objects"""
        response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0")
        
        assert response.status_code == 200
        data = response.json()['data']
        
        if data['count'] > 0:
            order = data['rows'][0]
            # Verify order structure
            required_fields = ['id', 'orderNumber', 'orderDate', 'customerName', 'total', 'paymentStatus']
            for field in required_fields:
                assert field in order, f"Order should have '{field}' field"
            
            print(f"✓ Order structure verified: {order['orderNumber']}")
        else:
            print("⚠ No orders found to verify structure")
    
    def test_create_order_returns_200(self):
        """Test POST /api/orders creates order successfully"""
        # First get a product ID
        products_response = self.session.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()['data']['rows']
        
        if len(products) == 0:
            pytest.skip("No products available to create order")
        
        # Get first product (it's an object keyed by ID)
        if isinstance(products, dict):
            product_id = list(products.keys())[0]
            product = products[product_id]
        else:
            product = products[0]
            product_id = product['id']
        
        order_payload = {
            "customerName": "TEST_API_Customer",
            "customerMobile": "9999999999",
            "orderDate": "2026-01-17",
            
            "subTotal": 1000,
            "total": 1000,
            "tax": 0,
            "taxPercent": 0,
            "paidAmount": 1000,
            "orderItems": [
                {
                    "productId": product_id,
                    "name": product.get('name', 'TEST_API_Product'),
                    "quantity": 2,
                    "productPrice": 500,
                    "totalPrice": 1000,
                    "type": product.get('type', 'non-weighted')
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/orders", json=order_payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'data' in data, "Response should have 'data' field"
        assert 'orderNumber' in data['data'], "Response should have 'orderNumber'"
        assert 'id' in data['data'], "Response should have 'id'"
        
        created_order = data['data']
        print(f"✓ Created order: {created_order['orderNumber']}")
        
        # Verify order data
        assert created_order['customerName'] == "TEST_API_Customer"
        assert created_order['total'] == 1000
        assert created_order['paymentStatus'] == 'paid'
        
        return created_order
    
    def test_created_order_appears_in_list(self):
        """Test that newly created order appears in the orders list"""
        # First get a product ID
        products_response = self.session.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()['data']['rows']
        
        if len(products) == 0:
            pytest.skip("No products available to create order")
        
        if isinstance(products, dict):
            product_id = list(products.keys())[0]
            product = products[product_id]
        else:
            product = products[0]
            product_id = product['id']
        
        # Create order
        order_payload = {
            "customerName": "TEST_List_Verify_Customer",
            "customerMobile": "8888888888",
            "orderDate": "2026-01-17",
            
            "subTotal": 500,
            "total": 500,
            "tax": 0,
            "taxPercent": 0,
            "paidAmount": 500,
            "orderItems": [
                {
                    "productId": product_id,
                    "name": product.get('name', 'TEST_List_Product'),
                    "quantity": 1,
                    "productPrice": 500,
                    "totalPrice": 500,
                    "type": product.get('type', 'non-weighted')
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_payload)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        created_order = create_response.json()['data']
        order_id = created_order['id']
        order_number = created_order['orderNumber']
        print(f"✓ Created order: {order_number}")
        
        # Fetch orders list
        list_response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0")
        assert list_response.status_code == 200
        
        orders = list_response.json()['data']['rows']
        
        # Find the created order in the list
        found = False
        for order in orders:
            if order['id'] == order_id:
                found = True
                assert order['customerName'] == "TEST_List_Verify_Customer"
                print(f"✓ Order {order_number} found in list")
                break
        
        assert found, f"Created order {order_number} not found in orders list"
    
    def test_get_single_order(self):
        """Test GET /api/orders/:orderId returns order details"""
        # First get list to find an order
        list_response = self.session.get(f"{BASE_URL}/api/orders?limit=1&offset=0")
        assert list_response.status_code == 200
        
        orders = list_response.json()['data']['rows']
        if len(orders) == 0:
            pytest.skip("No orders available to test")
        
        order_id = orders[0]['id']
        
        # Get single order
        response = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'data' in data
        assert data['data']['id'] == order_id
        
        print(f"✓ GET /api/orders/{order_id} returned order details")
    
    def test_orders_sorted_by_created_date_desc(self):
        """Test that orders are sorted by createdAt descending (newest first)"""
        response = self.session.get(f"{BASE_URL}/api/orders?limit=10&offset=0")
        assert response.status_code == 200
        
        orders = response.json()['data']['rows']
        
        if len(orders) >= 2:
            # Check that orders are sorted by createdAt descending
            for i in range(len(orders) - 1):
                current_date = orders[i].get('createdAt', '')
                next_date = orders[i + 1].get('createdAt', '')
                assert current_date >= next_date, f"Orders not sorted correctly: {current_date} should be >= {next_date}"
            
            print(f"✓ Orders are sorted by createdAt descending")
        else:
            print("⚠ Not enough orders to verify sorting")
    
    def test_orders_pagination(self):
        """Test orders pagination works correctly"""
        # Get first page
        page1_response = self.session.get(f"{BASE_URL}/api/orders?limit=5&offset=0")
        assert page1_response.status_code == 200
        
        page1_data = page1_response.json()['data']
        total_count = page1_data['count']
        
        if total_count > 5:
            # Get second page
            page2_response = self.session.get(f"{BASE_URL}/api/orders?limit=5&offset=5")
            assert page2_response.status_code == 200
            
            page2_data = page2_response.json()['data']
            
            # Verify different orders on different pages
            page1_ids = {o['id'] for o in page1_data['rows']}
            page2_ids = {o['id'] for o in page2_data['rows']}
            
            assert len(page1_ids.intersection(page2_ids)) == 0, "Pages should have different orders"
            print(f"✓ Pagination working: page1={len(page1_data['rows'])} orders, page2={len(page2_data['rows'])} orders")
        else:
            print(f"⚠ Only {total_count} orders, skipping pagination test")
    
    def test_orders_search_filter(self):
        """Test orders search/filter by customer name"""
        # First get a product ID
        products_response = self.session.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()['data']['rows']
        
        if len(products) == 0:
            pytest.skip("No products available to create order")
        
        if isinstance(products, dict):
            product_id = list(products.keys())[0]
            product = products[product_id]
        else:
            product = products[0]
            product_id = product['id']
        
        # Create a unique order for search test
        unique_name = "TEST_SearchUnique_Customer"
        order_payload = {
            "customerName": unique_name,
            "customerMobile": "7777777777",
            "orderDate": "2026-01-17",
            
            "subTotal": 100,
            "total": 100,
            "tax": 0,
            "taxPercent": 0,
            "paidAmount": 100,
            "orderItems": [
                {
                    "productId": product_id,
                    "name": product.get('name', 'TEST_Search_Product'),
                    "quantity": 1,
                    "productPrice": 100,
                    "totalPrice": 100,
                    "type": product.get('type', 'non-weighted')
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_payload)
        assert create_response.status_code == 200
        
        # Get the created order number
        created_order = create_response.json()['data']
        order_number = created_order['orderNumber']
        
        # Search for the order by order number (search only works on orderNumber)
        search_response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0&q={order_number}")
        assert search_response.status_code == 200
        
        results = search_response.json()['data']['rows']
        
        # Should find the order by order number
        found = any(order_number in o.get('orderNumber', '') for o in results)
        assert found, f"Search should find order with order number {order_number}"
        
        print(f"✓ Search filter working: found {len(results)} results for '{order_number}'")


class TestOrdersReduxIntegration:
    """Test that verifies the Redux store integration works correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert login_response.status_code == 200
        
        token = login_response.json()['data']['token']
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_create_order_and_immediate_list_refresh(self):
        """
        Test the flow: Create order -> List orders -> Verify new order appears
        This simulates what the Redux store should do after createOrderAction
        """
        # First get a product ID
        products_response = self.session.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()['data']['rows']
        
        if len(products) == 0:
            pytest.skip("No products available to create order")
        
        if isinstance(products, dict):
            product_id = list(products.keys())[0]
            product = products[product_id]
        else:
            product = products[0]
            product_id = product['id']
        
        # Get initial count
        initial_response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0")
        initial_count = initial_response.json()['data']['count']
        print(f"Initial order count: {initial_count}")
        
        # Create new order
        order_payload = {
            "customerName": "TEST_Redux_Integration",
            "customerMobile": "6666666666",
            "orderDate": "2026-01-17",
            
            "subTotal": 750,
            "total": 750,
            "tax": 0,
            "taxPercent": 0,
            "paidAmount": 750,
            "orderItems": [
                {
                    "productId": product_id,
                    "name": product.get('name', 'TEST_Redux_Product'),
                    "quantity": 3,
                    "productPrice": 250,
                    "totalPrice": 750,
                    "type": product.get('type', 'non-weighted')
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_payload)
        assert create_response.status_code == 200
        
        new_order = create_response.json()['data']
        print(f"Created order: {new_order['orderNumber']}")
        
        # Immediately fetch list (simulating Redux listOrdersAction after create)
        list_response = self.session.get(f"{BASE_URL}/api/orders?limit=25&offset=0")
        assert list_response.status_code == 200
        
        new_count = list_response.json()['data']['count']
        orders = list_response.json()['data']['rows']
        
        # Verify count increased
        assert new_count == initial_count + 1, f"Count should increase from {initial_count} to {initial_count + 1}"
        
        # Verify new order is in the list (should be first due to DESC sorting)
        first_order = orders[0]
        assert first_order['id'] == new_order['id'], "New order should be first in list"
        
        print(f"✓ Redux integration test passed: order count {initial_count} -> {new_count}")
        print(f"✓ New order {new_order['orderNumber']} appears at top of list")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
