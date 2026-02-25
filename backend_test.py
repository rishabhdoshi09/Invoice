#!/usr/bin/env python3
"""
Backend API Testing for New Features:
1. Order Creation without tax fields
2. Payment Status Toggle with Customer Info
3. Stock Management APIs
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env - use production URL
BASE_URL = "https://accounting-module-4.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_results = []
        self.created_orders = []
        self.created_products = []
        self.auth_token = None
        
    def log_result(self, test_name, success, message, response_data=None):
        """Log test result"""
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'response_data': response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if not success and response_data:
            print(f"   Response: {response_data}")
    
    def make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        headers = {}
        
        # Add authentication header if token is available
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
            
        try:
            if method.upper() == 'GET':
                response = requests.get(url, params=params, headers=headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            return None, str(e)
    
    def test_authentication(self):
        """Test authentication and get JWT token"""
        print("\n=== TESTING AUTHENTICATION ===")
        
        # First check if setup is required
        response = self.make_request('GET', '/auth/setup-check')
        if response and response.status_code == 200:
            response_json = response.json()
            setup_required = response_json.get('data', {}).get('setupRequired', False)
            
            if setup_required:
                # Setup admin user
                setup_data = {
                    "username": "admin",
                    "password": "admin123",
                    "name": "Administrator",
                    "email": "admin@example.com"
                }
                
                setup_response = self.make_request('POST', '/auth/setup', setup_data)
                if setup_response and setup_response.status_code == 200:
                    self.log_result("System Setup", True, "Admin user setup completed successfully")
                else:
                    if setup_response:
                        error_msg = f"Status {setup_response.status_code}: {setup_response.text}"
                    else:
                        error_msg = "Connection failed"
                    self.log_result("System Setup", False, f"Setup failed: {error_msg}")
                    return False
        
        # Try to login with admin credentials
        login_data = {
            "username": "admin",
            "password": "admin123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                token = response_json['data'].get('token')
                if token:
                    self.auth_token = token
                    self.log_result("Authentication Login", True, "Successfully logged in and obtained JWT token")
                    return True
                else:
                    self.log_result("Authentication Login", False, "Login response missing token", response_json)
            else:
                self.log_result("Authentication Login", False, "Invalid login response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Authentication Login", False, f"Login request failed: {error_msg}")
        
        return False

    def test_order_creation_without_tax(self):
        """Test order creation without tax fields - should default to 0"""
        print("\n=== TESTING ORDER CREATION WITHOUT TAX FIELDS ===")
        
        if not self.auth_token:
            self.log_result("Order Creation Without Tax", False, "No authentication token available")
            return
        
        # Create a minimal order without tax/taxPercent fields
        order_data = {
            "orderDate": datetime.now().strftime('%Y-%m-%d'),
            "customerName": "Cash Customer",
            "subTotal": 1000,
            "total": 1000,  # Same as subTotal since no tax
            "orderItems": [
                {
                    "productId": None,  # Test with null productId
                    "name": "Test Product",
                    "quantity": 2,
                    "productPrice": 500,
                    "totalPrice": 1000,
                    "type": "non-weighted"
                }
            ]
        }
        
        response = self.make_request('POST', '/orders', order_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                order = response_json['data']
                order_id = order.get('id')
                tax = order.get('tax', 'not_set')
                tax_percent = order.get('taxPercent', 'not_set')
                
                # Verify tax defaults to 0
                if tax == 0 and tax_percent == 0:
                    self.log_result("Order Creation Without Tax", True, 
                                  f"Order created successfully with tax defaulting to 0 (tax: {tax}, taxPercent: {tax_percent})")
                    self.created_orders.append(order_id)
                else:
                    self.log_result("Order Creation Without Tax", False, 
                                  f"Tax did not default to 0 - tax: {tax}, taxPercent: {tax_percent}", response_json)
            else:
                self.log_result("Order Creation Without Tax", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Order Creation Without Tax", False, f"Request failed: {error_msg}")

    def test_payment_status_toggle(self):
        """Test payment status toggle with customer info"""
        print("\n=== TESTING PAYMENT STATUS TOGGLE WITH CUSTOMER INFO ===")
        
        if not self.auth_token:
            self.log_result("Payment Status Toggle", False, "No authentication token available")
            return
        
        # First create a paid order
        order_data = {
            "orderDate": datetime.now().strftime('%Y-%m-%d'),
            "customerName": "Test Customer",
            "customerMobile": "9876543210",
            "subTotal": 500,
            "total": 590,
            "tax": 90,
            "taxPercent": 18,
            "paidAmount": 590,  # Fully paid
            "orderItems": [
                {
                    "productId": "",  # Test with empty string productId
                    "name": "Test Item",
                    "quantity": 1,
                    "productPrice": 500,
                    "totalPrice": 500,
                    "type": "weighted"
                }
            ]
        }
        
        response = self.make_request('POST', '/orders', order_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                order = response_json['data']
                order_id = order.get('id')
                initial_status = order.get('paymentStatus')
                
                self.log_result("Create Paid Order for Toggle Test", True, 
                              f"Order created with payment status: {initial_status}")
                self.created_orders.append(order_id)
                
                # Now toggle to unpaid with customer info
                toggle_data = {
                    "newStatus": "unpaid",
                    "customerName": "Updated Customer Name",
                    "customerMobile": "9876543211"
                }
                
                response = self.make_request('PATCH', f'/orders/{order_id}/payment-status', toggle_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200 and 'data' in response_json:
                        updated_order = response_json['data']
                        new_status = updated_order.get('paymentStatus')
                        new_customer_name = updated_order.get('customerName')
                        new_customer_mobile = updated_order.get('customerMobile')
                        
                        if (new_status == 'unpaid' and 
                            new_customer_name == 'Updated Customer Name' and 
                            new_customer_mobile == '9876543211'):
                            self.log_result("Payment Status Toggle", True, 
                                          f"Payment status toggled to {new_status} and customer info updated successfully")
                        else:
                            self.log_result("Payment Status Toggle", False, 
                                          f"Toggle failed - status: {new_status}, name: {new_customer_name}, mobile: {new_customer_mobile}", response_json)
                    else:
                        self.log_result("Payment Status Toggle", False, "Invalid toggle response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Payment Status Toggle", False, f"Toggle request failed: {error_msg}")
            else:
                self.log_result("Create Paid Order for Toggle Test", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Paid Order for Toggle Test", False, f"Request failed: {error_msg}")

    def test_stock_management_apis(self):
        """Test all stock management APIs"""
        print("\n=== TESTING STOCK MANAGEMENT APIS ===")
        
        if not self.auth_token:
            self.log_result("Stock Management APIs", False, "No authentication token available")
            return
        
        # First create a product for stock testing
        product_data = {
            "name": "Stock Test Product",
            "pricePerKg": 100.00,
            "type": "weighted"
        }
        
        response = self.make_request('POST', '/products', product_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                product_id = response_json['data'].get('id')
                self.created_products.append(product_id)
                self.log_result("Create Product for Stock Test", True, "Product created successfully")
                
                # Test 1: GET /api/stocks - List stocks
                response = self.make_request('GET', '/stocks')
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("List Stocks", True, "Stocks list retrieved successfully")
                    else:
                        self.log_result("List Stocks", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("List Stocks", False, f"Request failed: {error_msg}")
                
                # Test 2: GET /api/stocks/summary - Stock summary
                response = self.make_request('GET', '/stocks/summary')
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("Stock Summary", True, "Stock summary retrieved successfully")
                    else:
                        self.log_result("Stock Summary", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Stock Summary", False, f"Request failed: {error_msg}")
                
                # Test 3: POST /api/stocks/initialize - Initialize stock
                init_data = {
                    "productId": product_id,
                    "initialStock": 100,
                    "minStockLevel": 10,
                    "unit": "kg"
                }
                
                response = self.make_request('POST', '/stocks/initialize', init_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("Initialize Stock", True, "Stock initialized successfully")
                    else:
                        self.log_result("Initialize Stock", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Initialize Stock", False, f"Request failed: {error_msg}")
                
                # Test 4: POST /api/stocks/in - Add stock
                add_stock_data = {
                    "productId": product_id,
                    "quantity": 50,
                    "notes": "Test stock addition",
                    "transactionDate": datetime.now().strftime('%Y-%m-%d')
                }
                
                response = self.make_request('POST', '/stocks/in', add_stock_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("Add Stock", True, "Stock added successfully")
                    else:
                        self.log_result("Add Stock", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Add Stock", False, f"Request failed: {error_msg}")
                
                # Test 5: POST /api/stocks/out - Remove stock
                remove_stock_data = {
                    "productId": product_id,
                    "quantity": 20,
                    "notes": "Test stock removal",
                    "transactionDate": datetime.now().strftime('%Y-%m-%d')
                }
                
                response = self.make_request('POST', '/stocks/out', remove_stock_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("Remove Stock", True, "Stock removed successfully")
                    else:
                        self.log_result("Remove Stock", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Remove Stock", False, f"Request failed: {error_msg}")
                
                # Test 6: POST /api/stocks/adjust - Adjust stock
                adjust_stock_data = {
                    "productId": product_id,
                    "newStock": 125,
                    "notes": "Test stock adjustment"
                }
                
                response = self.make_request('POST', '/stocks/adjust', adjust_stock_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        self.log_result("Adjust Stock", True, "Stock adjusted successfully")
                    else:
                        self.log_result("Adjust Stock", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Adjust Stock", False, f"Request failed: {error_msg}")
                
                # Test 7: GET /api/stocks/transactions - List transactions
                response = self.make_request('GET', '/stocks/transactions')
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200:
                        transactions = response_json.get('data', [])
                        self.log_result("List Stock Transactions", True, 
                                      f"Stock transactions retrieved successfully - {len(transactions)} transactions")
                    else:
                        self.log_result("List Stock Transactions", False, "Invalid response structure", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("List Stock Transactions", False, f"Request failed: {error_msg}")
                    
            else:
                self.log_result("Create Product for Stock Test", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Product for Stock Test", False, f"Request failed: {error_msg}")

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n=== CLEANING UP TEST DATA ===")
        
        # Delete created orders
        for order_id in self.created_orders:
            response = self.make_request('DELETE', f'/orders/{order_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup Order", True, f"Order {order_id} deleted")
            else:
                self.log_result("Cleanup Order", False, f"Failed to delete order {order_id}")
        
        # Delete created products
        for product_id in self.created_products:
            response = self.make_request('DELETE', f'/products/{product_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup Product", True, f"Product {product_id} deleted")
            else:
                self.log_result("Cleanup Product", False, f"Failed to delete product {product_id}")

    def run_all_tests(self):
        """Run all backend tests for new features"""
        print(f"Starting backend API testing for new features...")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # First authenticate to get JWT token
        if not self.test_authentication():
            print("❌ CRITICAL: Authentication failed. Cannot proceed with protected endpoints.")
            self.print_summary()
            return
        
        # Test the specific new features
        self.test_order_creation_without_tax()
        self.test_payment_status_toggle()
        self.test_stock_management_apis()
        
        # Clean up test data
        self.cleanup_test_data()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("BACKEND API TESTING SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r['success']])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\nFAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"❌ {result['test']}: {result['message']}")
        
        print("\n" + "=" * 60)

if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all_tests()