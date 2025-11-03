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
BASE_URL = "https://accounting-hub-47.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_results = []
        self.created_suppliers = []
        self.created_customers = []
        self.created_purchases = []
        self.created_payments = []
        
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
        try:
            if method.upper() == 'GET':
                response = requests.get(url, params=params, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, timeout=30)
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
            "billNumber": f"PB-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "billDate": datetime.now().strftime('%Y-%m-%d'),
            "totalAmount": 10000,
            "items": [
                {
                    "description": "Office Supplies",
                    "quantity": 10,
                    "rate": 500,
                    "amount": 5000
                },
                {
                    "description": "Stationery Items",
                    "quantity": 20,
                    "rate": 250,
                    "amount": 5000
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
            "amount": 2500,  # Partial payment
            "paymentDate": datetime.now().strftime('%Y-%m-%d'),
            "paymentMethod": "bank_transfer",
            "reference": f"PAY-{datetime.now().strftime('%Y%m%d%H%M%S')}",
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
    
    def test_tally_export(self):
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
        
        # Run tests in priority order
        self.test_supplier_management()
        self.test_customer_management()
        self.test_purchase_bill_management()
        self.test_payment_management()
        self.test_reports()
        self.test_tally_export()
        
        # Cleanup
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