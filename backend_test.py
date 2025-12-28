#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Invoice App with Tally Features
Tests all backend APIs with focus on opening balance functionality
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BASE_URL = "http://localhost:8001/api"

class BackendTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_results = []
        self.created_suppliers = []
        self.created_customers = []
        self.created_purchases = []
        self.created_payments = []
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
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            return None, str(e)
    
    def test_supplier_management(self):
        """Test supplier management with opening balance"""
        print("\n=== TESTING SUPPLIER MANAGEMENT ===")
        
        # Test 1: Create supplier with opening balance
        supplier_data = {
            "name": "ABC Traders Ltd",
            "mobile": "9876543210",
            "email": "abc@traders.com",
            "address": "123 Business Street, Mumbai",
            "openingBalance": 5000
        }
        
        response = self.make_request('POST', '/suppliers', supplier_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                supplier_id = response_json['data'].get('id')
                current_balance = response_json['data'].get('currentBalance')
                opening_balance = response_json['data'].get('openingBalance')
                
                if current_balance == opening_balance == 5000:
                    self.log_result("Create Supplier with Opening Balance", True, 
                                  f"Supplier created with correct balance mapping (opening: {opening_balance}, current: {current_balance})")
                    self.created_suppliers.append(supplier_id)
                else:
                    self.log_result("Create Supplier with Opening Balance", False, 
                                  f"Balance mismatch - opening: {opening_balance}, current: {current_balance}", response_json)
            else:
                self.log_result("Create Supplier with Opening Balance", False, 
                              "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Supplier with Opening Balance", False, 
                          f"Request failed: {error_msg}")
        
        # Test 2: Create supplier without opening balance
        supplier_data_no_balance = {
            "name": "XYZ Suppliers",
            "mobile": "9876543211",
            "email": "xyz@suppliers.com"
        }
        
        response = self.make_request('POST', '/suppliers', supplier_data_no_balance)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                supplier_id = response_json['data'].get('id')
                current_balance = response_json['data'].get('currentBalance')
                opening_balance = response_json['data'].get('openingBalance')
                
                # Both should be null or undefined, not 0
                if current_balance is None and opening_balance is None:
                    self.log_result("Create Supplier without Opening Balance", True, 
                                  "Supplier created with null balances (correct)")
                    self.created_suppliers.append(supplier_id)
                else:
                    self.log_result("Create Supplier without Opening Balance", False, 
                                  f"Expected null balances but got opening: {opening_balance}, current: {current_balance}", response_json)
            else:
                self.log_result("Create Supplier without Opening Balance", False, 
                              "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Supplier without Opening Balance", False, 
                          f"Request failed: {error_msg}")
        
        # Test 3: Get supplier by ID
        if self.created_suppliers:
            supplier_id = self.created_suppliers[0]
            response = self.make_request('GET', f'/suppliers/{supplier_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    self.log_result("Get Supplier by ID", True, "Supplier retrieved successfully")
                else:
                    self.log_result("Get Supplier by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Supplier by ID", False, f"Request failed: {error_msg}")
        
        # Test 4: List suppliers
        response = self.make_request('GET', '/suppliers')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                suppliers_count = len(response_json['data'])
                self.log_result("List Suppliers", True, f"Retrieved {suppliers_count} suppliers")
            else:
                self.log_result("List Suppliers", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Suppliers", False, f"Request failed: {error_msg}")
        
        # Test 5: Update supplier
        if self.created_suppliers:
            supplier_id = self.created_suppliers[0]
            update_data = {"name": "ABC Traders Ltd (Updated)"}
            response = self.make_request('PUT', f'/suppliers/{supplier_id}', update_data)
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200:
                    self.log_result("Update Supplier", True, "Supplier updated successfully")
                else:
                    self.log_result("Update Supplier", False, "Update failed", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Update Supplier", False, f"Request failed: {error_msg}")
    
    def test_customer_management(self):
        """Test customer management with opening balance"""
        print("\n=== TESTING CUSTOMER MANAGEMENT ===")
        
        # Test 1: Create customer with opening balance
        customer_data = {
            "name": "Reliable Corp Ltd",
            "mobile": "9876543220",
            "email": "reliable@corp.com",
            "address": "456 Corporate Avenue, Delhi",
            "openingBalance": 3000
        }
        
        response = self.make_request('POST', '/customers', customer_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                customer_id = response_json['data'].get('id')
                current_balance = response_json['data'].get('currentBalance')
                opening_balance = response_json['data'].get('openingBalance')
                
                if current_balance == opening_balance == 3000:
                    self.log_result("Create Customer with Opening Balance", True, 
                                  f"Customer created with correct balance mapping (opening: {opening_balance}, current: {current_balance})")
                    self.created_customers.append(customer_id)
                else:
                    self.log_result("Create Customer with Opening Balance", False, 
                                  f"Balance mismatch - opening: {opening_balance}, current: {current_balance}", response_json)
            else:
                self.log_result("Create Customer with Opening Balance", False, 
                              "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Customer with Opening Balance", False, 
                          f"Request failed: {error_msg}")
        
        # Test 2: Create customer without opening balance
        customer_data_no_balance = {
            "name": "Quick Services",
            "mobile": "9876543221",
            "email": "quick@services.com"
        }
        
        response = self.make_request('POST', '/customers', customer_data_no_balance)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                customer_id = response_json['data'].get('id')
                current_balance = response_json['data'].get('currentBalance')
                opening_balance = response_json['data'].get('openingBalance')
                
                if current_balance is None and opening_balance is None:
                    self.log_result("Create Customer without Opening Balance", True, 
                                  "Customer created with null balances (correct)")
                    self.created_customers.append(customer_id)
                else:
                    self.log_result("Create Customer without Opening Balance", False, 
                                  f"Expected null balances but got opening: {opening_balance}, current: {current_balance}", response_json)
            else:
                self.log_result("Create Customer without Opening Balance", False, 
                              "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Customer without Opening Balance", False, 
                          f"Request failed: {error_msg}")
        
        # Test 3: Get customer by ID
        if self.created_customers:
            customer_id = self.created_customers[0]
            response = self.make_request('GET', f'/customers/{customer_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    self.log_result("Get Customer by ID", True, "Customer retrieved successfully")
                else:
                    self.log_result("Get Customer by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Customer by ID", False, f"Request failed: {error_msg}")
        
        # Test 4: List customers
        response = self.make_request('GET', '/customers')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                customers_count = len(response_json['data'])
                self.log_result("List Customers", True, f"Retrieved {customers_count} customers")
            else:
                self.log_result("List Customers", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Customers", False, f"Request failed: {error_msg}")
        
        # Test 5: Update customer
        if self.created_customers:
            customer_id = self.created_customers[0]
            update_data = {"name": "Reliable Corp Ltd (Updated)"}
            response = self.make_request('PUT', f'/customers/{customer_id}', update_data)
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200:
                    self.log_result("Update Customer", True, "Customer updated successfully")
                else:
                    self.log_result("Update Customer", False, "Update failed", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Update Customer", False, f"Request failed: {error_msg}")
    
    def test_purchase_bill_management(self):
        """Test purchase bill management"""
        print("\n=== TESTING PURCHASE BILL MANAGEMENT ===")
        
        if not self.created_suppliers:
            self.log_result("Purchase Bill Management", False, "No suppliers available for testing")
            return
        
        # Test 1: Create purchase bill
        purchase_data = {
            "supplierId": self.created_suppliers[0],
            "billDate": datetime.now().strftime('%Y-%m-%d'),
            "subTotal": 10000,
            "total": 11800,  # Including tax
            "tax": 1800,
            "taxPercent": 18,
            "paidAmount": 0,
            "purchaseItems": [
                {
                    "name": "Office Supplies",
                    "quantity": 10,
                    "price": 500,
                    "totalPrice": 5000,
                    "type": "weighted"
                },
                {
                    "name": "Stationery Items",
                    "quantity": 20,
                    "price": 250,
                    "totalPrice": 5000,
                    "type": "non-weighted"
                }
            ]
        }
        
        response = self.make_request('POST', '/purchases', purchase_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                purchase_id = response_json['data'].get('id')
                self.log_result("Create Purchase Bill", True, "Purchase bill created successfully")
                self.created_purchases.append(purchase_id)
            else:
                self.log_result("Create Purchase Bill", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Purchase Bill", False, f"Request failed: {error_msg}")
        
        # Test 2: List purchase bills
        response = self.make_request('GET', '/purchases')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                purchases_count = len(response_json['data'])
                self.log_result("List Purchase Bills", True, f"Retrieved {purchases_count} purchase bills")
            else:
                self.log_result("List Purchase Bills", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Purchase Bills", False, f"Request failed: {error_msg}")
        
        # Test 3: Get purchase bill by ID
        if self.created_purchases:
            purchase_id = self.created_purchases[0]
            response = self.make_request('GET', f'/purchases/{purchase_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    self.log_result("Get Purchase Bill by ID", True, "Purchase bill retrieved successfully")
                else:
                    self.log_result("Get Purchase Bill by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Purchase Bill by ID", False, f"Request failed: {error_msg}")
    
    def test_payment_management(self):
        """Test payment management"""
        print("\n=== TESTING PAYMENT MANAGEMENT ===")
        
        if not self.created_suppliers:
            self.log_result("Payment Management", False, "No suppliers available for testing")
            return
        
        # Test 1: Create payment (partial payment scenario)
        payment_data = {
            "partyType": "supplier",
            "partyId": self.created_suppliers[0],
            "partyName": "ABC Traders Ltd",
            "amount": 2500,  # Partial payment
            "paymentDate": datetime.now().strftime('%Y-%m-%d'),
            "referenceType": "advance",  # Using advance since we don't have a specific purchase bill
            "notes": "Partial payment for outstanding bills"
        }
        
        response = self.make_request('POST', '/payments', payment_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payment_id = response_json['data'].get('id')
                self.log_result("Create Payment", True, "Payment recorded successfully")
                self.created_payments.append(payment_id)
            else:
                self.log_result("Create Payment", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Payment", False, f"Request failed: {error_msg}")
        
        # Test 2: List payments
        response = self.make_request('GET', '/payments')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payments_count = len(response_json['data'])
                self.log_result("List Payments", True, f"Retrieved {payments_count} payments")
            else:
                self.log_result("List Payments", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Payments", False, f"Request failed: {error_msg}")
        
        # Test 3: Get payment by ID
        if self.created_payments:
            payment_id = self.created_payments[0]
            response = self.make_request('GET', f'/payments/{payment_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    self.log_result("Get Payment by ID", True, "Payment retrieved successfully")
                else:
                    self.log_result("Get Payment by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Payment by ID", False, f"Request failed: {error_msg}")
    
    def test_reports(self):
        """Test reports functionality"""
        print("\n=== TESTING REPORTS ===")
        
        # Test 1: Outstanding receivables report
        response = self.make_request('GET', '/reports/outstanding-receivables')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200:
                self.log_result("Outstanding Receivables Report", True, "Report generated successfully")
            else:
                self.log_result("Outstanding Receivables Report", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Outstanding Receivables Report", False, f"Request failed: {error_msg}")
        
        # Test 2: Outstanding payables report
        response = self.make_request('GET', '/reports/outstanding-payables')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200:
                self.log_result("Outstanding Payables Report", True, "Report generated successfully")
            else:
                self.log_result("Outstanding Payables Report", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Outstanding Payables Report", False, f"Request failed: {error_msg}")
    
    def test_product_management(self):
        """Test product management CRUD operations"""
        print("\n=== TESTING PRODUCT MANAGEMENT ===")
        
        # Test 1: Create weighted product
        product_data = {
            "name": "Premium Rice",
            "pricePerKg": 85.50,
            "type": "weighted"
        }
        
        response = self.make_request('POST', '/products', product_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                product_id = response_json['data'].get('id')
                self.log_result("Create Weighted Product", True, "Weighted product created successfully")
                self.created_products = getattr(self, 'created_products', [])
                self.created_products.append(product_id)
            else:
                self.log_result("Create Weighted Product", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Weighted Product", False, f"Request failed: {error_msg}")
        
        # Test 2: Create non-weighted product
        product_data_nonweighted = {
            "name": "Notebook Pack",
            "pricePerKg": 25.00,
            "type": "non-weighted"
        }
        
        response = self.make_request('POST', '/products', product_data_nonweighted)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                product_id = response_json['data'].get('id')
                self.log_result("Create Non-Weighted Product", True, "Non-weighted product created successfully")
                self.created_products = getattr(self, 'created_products', [])
                self.created_products.append(product_id)
            else:
                self.log_result("Create Non-Weighted Product", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Non-Weighted Product", False, f"Request failed: {error_msg}")
        
        # Test 3: List products
        response = self.make_request('GET', '/products')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                products_count = len(response_json['data'])
                self.log_result("List Products", True, f"Retrieved {products_count} products")
            else:
                self.log_result("List Products", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Products", False, f"Request failed: {error_msg}")
        
        # Test 4: Get product by ID
        if hasattr(self, 'created_products') and self.created_products:
            product_id = self.created_products[0]
            response = self.make_request('GET', f'/products/{product_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    self.log_result("Get Product by ID", True, "Product retrieved successfully")
                else:
                    self.log_result("Get Product by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Product by ID", False, f"Request failed: {error_msg}")
        
        # Test 5: Update product
        if hasattr(self, 'created_products') and self.created_products:
            product_id = self.created_products[0]
            update_data = {"name": "Premium Basmati Rice", "pricePerKg": 95.00}
            response = self.make_request('PUT', f'/products/{product_id}', update_data)
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200:
                    self.log_result("Update Product", True, "Product updated successfully")
                else:
                    self.log_result("Update Product", False, "Update failed", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Update Product", False, f"Request failed: {error_msg}")
        
        # Test 6: Get weights (hardware feature - may not work in container)
        response = self.make_request('GET', '/weights')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200:
                weight_value = response_json.get('data', {}).get('weight', 0)
                self.log_result("Get Weights", True, f"Weight reading: {weight_value}")
            else:
                self.log_result("Get Weights", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Get Weights", False, f"Request failed: {error_msg}")
    
    def test_order_management(self):
        """Test order/sales management"""
        print("\n=== TESTING ORDER MANAGEMENT ===")
        
        # Ensure we have products for order items
        if not hasattr(self, 'created_products') or not self.created_products:
            self.log_result("Order Management", False, "No products available for testing orders")
            return
        
        # Test 1: Create order with items
        order_data = {
            "orderDate": datetime.now().strftime('%Y-%m-%d'),
            "customerName": "Retail Customer",
            "customerMobile": "9876543230",
            "subTotal": 1000,
            "total": 1180,  # Including tax
            "tax": 180,
            "taxPercent": 18,
            "paidAmount": 1180,  # Fully paid
            "orderItems": [
                {
                    "productId": self.created_products[0],
                    "name": "Premium Rice",
                    "quantity": 5,
                    "productPrice": 85.50,
                    "totalPrice": 427.50,
                    "type": "weighted"
                },
                {
                    "productId": self.created_products[1] if len(self.created_products) > 1 else self.created_products[0],
                    "name": "Notebook Pack",
                    "quantity": 23,
                    "productPrice": 25.00,
                    "totalPrice": 575.00,
                    "type": "non-weighted"
                }
            ]
        }
        
        response = self.make_request('POST', '/orders', order_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                order_id = response_json['data'].get('id')
                payment_status = response_json['data'].get('paymentStatus')
                self.log_result("Create Order", True, f"Order created successfully with payment status: {payment_status}")
                self.created_orders = getattr(self, 'created_orders', [])
                self.created_orders.append(order_id)
            else:
                self.log_result("Create Order", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Order", False, f"Request failed: {error_msg}")
        
        # Test 2: Create partial payment order
        order_data_partial = {
            "orderDate": datetime.now().strftime('%Y-%m-%d'),
            "customerName": "Credit Customer",
            "customerMobile": "9876543231",
            "subTotal": 500,
            "total": 590,
            "tax": 90,
            "taxPercent": 18,
            "paidAmount": 300,  # Partial payment
            "orderItems": [
                {
                    "productId": self.created_products[0],
                    "name": "Premium Rice",
                    "quantity": 2.5,
                    "productPrice": 85.50,
                    "totalPrice": 213.75,
                    "type": "weighted"
                }
            ]
        }
        
        response = self.make_request('POST', '/orders', order_data_partial)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                order_id = response_json['data'].get('id')
                payment_status = response_json['data'].get('paymentStatus')
                due_amount = response_json['data'].get('dueAmount')
                self.log_result("Create Partial Payment Order", True, f"Order created with payment status: {payment_status}, due: {due_amount}")
                self.created_orders = getattr(self, 'created_orders', [])
                self.created_orders.append(order_id)
            else:
                self.log_result("Create Partial Payment Order", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Create Partial Payment Order", False, f"Request failed: {error_msg}")
        
        # Test 3: List orders
        response = self.make_request('GET', '/orders')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                orders_count = len(response_json['data'])
                self.log_result("List Orders", True, f"Retrieved {orders_count} orders")
            else:
                self.log_result("List Orders", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("List Orders", False, f"Request failed: {error_msg}")
        
        # Test 4: Get order by ID
        if hasattr(self, 'created_orders') and self.created_orders:
            order_id = self.created_orders[0]
            response = self.make_request('GET', f'/orders/{order_id}')
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    order_items = response_json['data'].get('orderItems', [])
                    self.log_result("Get Order by ID", True, f"Order retrieved with {len(order_items)} items")
                else:
                    self.log_result("Get Order by ID", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Get Order by ID", False, f"Request failed: {error_msg}")

    def test_authentication(self):
        """Test authentication and get JWT token"""
        print("\n=== TESTING AUTHENTICATION ===")
        
        # Try to login with admin credentials
        login_data = {
            "username": "admin",
            "password": "admin123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'token' in response_json:
                self.auth_token = response_json['token']
                self.log_result("Authentication Login", True, "Successfully logged in and obtained JWT token")
                return True
            else:
                self.log_result("Authentication Login", False, "Login response missing token", response_json)
        else:
            # Try to create admin user first
            register_data = {
                "username": "admin",
                "password": "admin123",
                "role": "admin"
            }
            
            register_response = self.make_request('POST', '/auth/register', register_data)
            if register_response and register_response.status_code == 200:
                self.log_result("User Registration", True, "Admin user created successfully")
                
                # Now try login again
                response = self.make_request('POST', '/auth/login', login_data)
                if response and response.status_code == 200:
                    response_json = response.json()
                    if response_json.get('status') == 200 and 'token' in response_json:
                        self.auth_token = response_json['token']
                        self.log_result("Authentication Login", True, "Successfully logged in after registration")
                        return True
                    else:
                        self.log_result("Authentication Login", False, "Login failed after registration", response_json)
                else:
                    error_msg = response.text if response else "Connection failed"
                    self.log_result("Authentication Login", False, f"Login request failed: {error_msg}")
            else:
                error_msg = register_response.text if register_response else "Connection failed"
                self.log_result("User Registration", False, f"Registration failed: {error_msg}")
        
        return False

    def test_daily_payments_api(self):
        """Test Daily Payments API endpoints"""
        print("\n=== TESTING DAILY PAYMENTS API ===")
        
        if not self.auth_token:
            self.log_result("Daily Payments API", False, "No authentication token available")
            return
        
        # Test 1: Daily Summary Endpoint with today's date (default)
        response = self.make_request('GET', '/payments/daily-summary')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                data = response_json['data']
                required_fields = ['date', 'totalCount', 'totalAmount', 'summary', 'byReferenceType', 'payments']
                
                if all(field in data for field in required_fields):
                    # Check summary structure
                    summary = data.get('summary', {})
                    by_ref_type = data.get('byReferenceType', {})
                    
                    if ('customers' in summary and 'suppliers' in summary and 
                        'orders' in by_ref_type and 'purchases' in by_ref_type and 'advances' in by_ref_type):
                        self.log_result("Daily Summary - Default Date", True, 
                                      f"Daily summary retrieved successfully for {data['date']} - Total: {data['totalCount']} payments, Amount: {data['totalAmount']}")
                    else:
                        self.log_result("Daily Summary - Default Date", False, 
                                      "Response missing required summary structure", response_json)
                else:
                    missing_fields = [f for f in required_fields if f not in data]
                    self.log_result("Daily Summary - Default Date", False, 
                                  f"Response missing required fields: {missing_fields}", response_json)
            else:
                self.log_result("Daily Summary - Default Date", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Daily Summary - Default Date", False, f"Request failed: {error_msg}")
        
        # Test 2: Daily Summary with specific date parameter
        test_date = "2025-01-26"
        response = self.make_request('GET', '/payments/daily-summary', params={'date': test_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                data = response_json['data']
                if data.get('date') == test_date:
                    self.log_result("Daily Summary - Specific Date", True, 
                                  f"Daily summary retrieved for specific date {test_date} - Total: {data['totalCount']} payments")
                else:
                    self.log_result("Daily Summary - Specific Date", False, 
                                  f"Expected date {test_date} but got {data.get('date')}", response_json)
            else:
                self.log_result("Daily Summary - Specific Date", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Daily Summary - Specific Date", False, f"Request failed: {error_msg}")
        
        # Test 3: Payments List with date filtering
        response = self.make_request('GET', '/payments', params={'date': test_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payments = response_json['data']
                self.log_result("Payments List - Date Filter", True, 
                              f"Payments list with date filter retrieved successfully - {len(payments)} payments for {test_date}")
            else:
                self.log_result("Payments List - Date Filter", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Payments List - Date Filter", False, f"Request failed: {error_msg}")
        
        # Test 4: Payments List with date range filtering
        start_date = "2025-01-01"
        end_date = "2025-01-26"
        response = self.make_request('GET', '/payments', params={'startDate': start_date, 'endDate': end_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payments = response_json['data']
                self.log_result("Payments List - Date Range Filter", True, 
                              f"Payments list with date range filter retrieved successfully - {len(payments)} payments from {start_date} to {end_date}")
            else:
                self.log_result("Payments List - Date Range Filter", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Payments List - Date Range Filter", False, f"Request failed: {error_msg}")
        
        # Test 5: Create a test payment to verify the daily summary works with actual data
        if self.created_suppliers:
            payment_data = {
                "partyType": "supplier",
                "partyId": self.created_suppliers[0],
                "partyName": "Test Supplier for Daily Payments",
                "amount": 1500,
                "paymentDate": test_date,
                "referenceType": "advance",
                "notes": "Test payment for daily summary verification"
            }
            
            response = self.make_request('POST', '/payments', payment_data)
            if response and response.status_code == 200:
                response_json = response.json()
                if response_json.get('status') == 200 and 'data' in response_json:
                    payment_id = response_json['data'].get('id')
                    self.created_payments.append(payment_id)
                    self.log_result("Create Test Payment for Daily Summary", True, "Test payment created successfully")
                    
                    # Now test daily summary again to see if it includes our test payment
                    response = self.make_request('GET', '/payments/daily-summary', params={'date': test_date})
                    if response and response.status_code == 200:
                        response_json = response.json()
                        if response_json.get('status') == 200 and 'data' in response_json:
                            data = response_json['data']
                            # Check if our payment is included
                            test_payment_found = any(p.get('id') == payment_id for p in data.get('payments', []))
                            if test_payment_found:
                                self.log_result("Daily Summary - With Test Data", True, 
                                              f"Daily summary correctly includes test payment - Total: {data['totalCount']} payments, Amount: {data['totalAmount']}")
                            else:
                                self.log_result("Daily Summary - With Test Data", False, 
                                              "Daily summary does not include the test payment", response_json)
                        else:
                            self.log_result("Daily Summary - With Test Data", False, "Invalid response structure", response_json)
                    else:
                        error_msg = response.text if response else "Connection failed"
                        self.log_result("Daily Summary - With Test Data", False, f"Request failed: {error_msg}")
                else:
                    self.log_result("Create Test Payment for Daily Summary", False, "Invalid response structure", response_json)
            else:
                error_msg = response.text if response else "Connection failed"
                self.log_result("Create Test Payment for Daily Summary", False, f"Request failed: {error_msg}")
        else:
            self.log_result("Create Test Payment for Daily Summary", False, "No suppliers available for creating test payment")
        """Test Tally export functionality"""
        print("\n=== TESTING TALLY EXPORT ===")
        
        # Test 1: Export sales CSV
        response = self.make_request('GET', '/export/tally/sales')
        if response and response.status_code == 200:
            # Check if response is CSV format
            content_type = response.headers.get('content-type', '')
            if 'csv' in content_type.lower() or 'text' in content_type.lower():
                self.log_result("Tally Export Sales CSV", True, "Sales CSV export successful")
            else:
                self.log_result("Tally Export Sales CSV", True, "Sales export successful (format may vary)")
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Tally Export Sales CSV", False, f"Request failed: {error_msg}")
        
        # Test 2: Export purchases CSV
        response = self.make_request('GET', '/export/tally/purchases')
        if response and response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'csv' in content_type.lower() or 'text' in content_type.lower():
                self.log_result("Tally Export Purchases CSV", True, "Purchases CSV export successful")
            else:
                self.log_result("Tally Export Purchases CSV", True, "Purchases export successful (format may vary)")
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Tally Export Purchases CSV", False, f"Request failed: {error_msg}")
        
        # Test 3: Export payments CSV
        response = self.make_request('GET', '/export/tally/payments')
        if response and response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            if 'csv' in content_type.lower() or 'text' in content_type.lower():
                self.log_result("Tally Export Payments CSV", True, "Payments CSV export successful")
            else:
                self.log_result("Tally Export Payments CSV", True, "Payments export successful (format may vary)")
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Tally Export Payments CSV", False, f"Request failed: {error_msg}")
    
    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n=== CLEANING UP TEST DATA ===")
        
        # Delete created orders first (they may reference products)
        if hasattr(self, 'created_orders'):
            for order_id in self.created_orders:
                response = self.make_request('DELETE', f'/orders/{order_id}')
                if response and response.status_code == 200:
                    self.log_result("Cleanup Order", True, f"Order {order_id} deleted")
                else:
                    self.log_result("Cleanup Order", False, f"Failed to delete order {order_id}")
        
        # Delete created products
        if hasattr(self, 'created_products'):
            for product_id in self.created_products:
                response = self.make_request('DELETE', f'/products/{product_id}')
                if response and response.status_code == 200:
                    self.log_result("Cleanup Product", True, f"Product {product_id} deleted")
                else:
                    self.log_result("Cleanup Product", False, f"Failed to delete product {product_id}")
        
        # Delete created suppliers
        for supplier_id in self.created_suppliers:
            response = self.make_request('DELETE', f'/suppliers/{supplier_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup Supplier", True, f"Supplier {supplier_id} deleted")
            else:
                self.log_result("Cleanup Supplier", False, f"Failed to delete supplier {supplier_id}")
        
        # Delete created customers
        for customer_id in self.created_customers:
            response = self.make_request('DELETE', f'/customers/{customer_id}')
            if response and response.status_code == 200:
                self.log_result("Cleanup Customer", True, f"Customer {customer_id} deleted")
            else:
                self.log_result("Cleanup Customer", False, f"Failed to delete customer {customer_id}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print(f"Starting comprehensive backend API testing...")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # First authenticate to get JWT token
        if not self.test_authentication():
            print("❌ CRITICAL: Authentication failed. Cannot proceed with protected endpoints.")
            self.print_summary()
            return
        
        # Test Daily Payments API (main focus)
        self.test_daily_payments_api()
        
        # Run other tests in priority order (only if we have time/need)
        self.test_product_management()  # Test products first (needed for orders)
        self.test_supplier_management()
        self.test_customer_management()
        self.test_payment_management()  # Regular payment management
        
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