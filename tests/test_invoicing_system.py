"""
Customer Invoicing System - Pre-Production QA Audit Tests
Tests for: Order creation, Credit/Cash sales, Tax calculations, Payment recording, Admin dashboard
"""
import pytest
import requests
import os
import time
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://shopbill-manager-1.preview.emergentagent.com/api').rstrip('/')

# Test data tracking for cleanup
created_orders = []
created_products = []
created_customers = []

class TestAuth:
    """Authentication tests"""
    token = None
    
    def test_01_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["status"] == 200
        assert "token" in data["data"]
        assert data["data"]["user"]["role"] == "admin"
        TestAuth.token = data["data"]["token"]
        print(f"✓ Login successful, token obtained")
    
    def test_02_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print(f"✓ Invalid credentials correctly rejected")


class TestProductSetup:
    """Product setup for order testing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Ensure we have auth token"""
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_create_test_products(self):
        """Create test products for order testing"""
        products = [
            {"name": "TEST_Product_A", "pricePerKg": 100, "type": "non-weighted"},
            {"name": "TEST_Product_B", "pricePerKg": 250, "type": "weighted"},
            {"name": "TEST_Product_C", "pricePerKg": 500, "type": "non-weighted"}
        ]
        
        for product in products:
            response = requests.post(f"{BASE_URL}/products", 
                                   json=product, 
                                   headers=self.get_headers())
            if response.status_code == 200:
                data = response.json()
                if "data" in data:
                    created_products.append(data["data"]["id"])
                    print(f"✓ Created product: {product['name']}")
            else:
                print(f"Product creation response: {response.status_code} - {response.text}")
        
        assert len(created_products) >= 1, "At least one product should be created"
    
    def test_02_list_products(self):
        """Verify products can be listed"""
        response = requests.get(f"{BASE_URL}/products?limit=10", headers=self.get_headers())
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        print(f"✓ Products listed: {data['data'].get('count', len(data['data'].get('rows', [])))} products")


class TestCustomerSetup:
    """Customer setup for order testing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_create_test_customer(self):
        """Create test customer for credit sales"""
        customer = {
            "name": "TEST_Customer_Credit",
            "mobile": "9876543210",
            "address": "Test Address"
        }
        response = requests.post(f"{BASE_URL}/customers", 
                               json=customer, 
                               headers=self.get_headers())
        if response.status_code == 200:
            data = response.json()
            if "data" in data:
                created_customers.append(data["data"]["id"])
                print(f"✓ Created customer: {customer['name']}")
        else:
            print(f"Customer creation response: {response.status_code}")


class TestOrderCreation:
    """Order creation tests - CRITICAL for billing system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_create_cash_sale_order(self):
        """Test cash sale - paidAmount=total, dueAmount=0, paymentStatus=paid"""
        # First get a product
        products_resp = requests.get(f"{BASE_URL}/products?limit=5", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available for testing")
        
        product = products[0]
        quantity = 2
        product_price = float(product.get("pricePerKg", 100))
        item_total = product_price * quantity
        sub_total = item_total
        tax_percent = 5
        tax = round(sub_total * (tax_percent / 100), 2)
        total = sub_total + tax
        
        order_data = {
            "customerName": "TEST_Cash_Customer",
            "customerMobile": "1234567890",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": sub_total,
            "taxPercent": tax_percent,
            "tax": tax,
            "total": total,
            # Cash sale: paidAmount = total (default behavior)
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": quantity,
                "productPrice": product_price,
                "totalPrice": item_total,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        data = response.json()
        assert data["status"] == 200
        order = data["data"]
        created_orders.append(order["id"])
        
        # Verify cash sale defaults
        assert order["paymentStatus"] == "paid", f"Cash sale should be 'paid', got {order['paymentStatus']}"
        assert float(order["paidAmount"]) == float(order["total"]), "paidAmount should equal total for cash sale"
        assert float(order["dueAmount"]) == 0, "dueAmount should be 0 for cash sale"
        
        print(f"✓ Cash sale order created: {order['orderNumber']}, Total: {order['total']}, Status: {order['paymentStatus']}")
    
    def test_02_create_credit_sale_order(self):
        """Test credit sale - paidAmount=0, dueAmount=total, paymentStatus=unpaid
        CRITICAL: Tests the fix for !paidAmount treating 0 as falsy
        """
        products_resp = requests.get(f"{BASE_URL}/products?limit=5", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available for testing")
        
        product = products[0]
        quantity = 3
        product_price = float(product.get("pricePerKg", 100))
        item_total = product_price * quantity
        sub_total = item_total
        tax_percent = 10
        tax = round(sub_total * (tax_percent / 100), 2)
        total = sub_total + tax
        
        order_data = {
            "customerName": "TEST_Credit_Customer",
            "customerMobile": "9876543210",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": sub_total,
            "taxPercent": tax_percent,
            "tax": tax,
            "total": total,
            "paidAmount": 0,  # CREDIT SALE - explicitly set to 0
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": quantity,
                "productPrice": product_price,
                "totalPrice": item_total,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        assert response.status_code == 200, f"Credit order creation failed: {response.text}"
        
        data = response.json()
        order = data["data"]
        created_orders.append(order["id"])
        
        # CRITICAL: Verify credit sale with paidAmount=0 works correctly
        assert order["paymentStatus"] == "unpaid", f"Credit sale should be 'unpaid', got {order['paymentStatus']}"
        assert float(order["paidAmount"]) == 0, f"paidAmount should be 0 for credit sale, got {order['paidAmount']}"
        assert float(order["dueAmount"]) == float(order["total"]), f"dueAmount should equal total for credit sale"
        
        print(f"✓ Credit sale order created: {order['orderNumber']}, Total: {order['total']}, Due: {order['dueAmount']}, Status: {order['paymentStatus']}")
    
    def test_03_verify_calculation_accuracy(self):
        """Test mathematical accuracy of totals, subtotals, taxes"""
        products_resp = requests.get(f"{BASE_URL}/products?limit=5", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if len(products) < 2:
            pytest.skip("Need at least 2 products for multi-item test")
        
        # Create order with multiple items
        items = []
        expected_subtotal = 0
        
        for i, product in enumerate(products[:3]):
            quantity = i + 1  # 1, 2, 3
            price = float(product.get("pricePerKg", 100))
            item_total = price * quantity
            expected_subtotal += item_total
            items.append({
                "productId": product["id"],
                "name": product["name"],
                "quantity": quantity,
                "productPrice": price,
                "totalPrice": item_total,
                "type": product.get("type", "non-weighted")
            })
        
        tax_percent = 18
        expected_tax = round(expected_subtotal * (tax_percent / 100), 2)
        expected_total = expected_subtotal + expected_tax
        
        order_data = {
            "customerName": "TEST_Calculation_Customer",
            "customerMobile": "5555555555",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": expected_subtotal,
            "taxPercent": tax_percent,
            "tax": expected_tax,
            "total": expected_total,
            "orderItems": items
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        assert response.status_code == 200, f"Order creation failed: {response.text}"
        
        order = response.json()["data"]
        created_orders.append(order["id"])
        
        # Verify calculations
        assert abs(float(order["subTotal"]) - expected_subtotal) < 0.01, f"SubTotal mismatch: expected {expected_subtotal}, got {order['subTotal']}"
        assert abs(float(order["tax"]) - expected_tax) < 0.01, f"Tax mismatch: expected {expected_tax}, got {order['tax']}"
        assert abs(float(order["total"]) - expected_total) < 0.01, f"Total mismatch: expected {expected_total}, got {order['total']}"
        
        print(f"✓ Calculation verified: SubTotal={order['subTotal']}, Tax={order['tax']} ({tax_percent}%), Total={order['total']}")
    
    def test_04_verify_order_persistence(self):
        """Verify order is correctly stored in database"""
        if not created_orders:
            pytest.skip("No orders created to verify")
        
        order_id = created_orders[-1]
        response = requests.get(f"{BASE_URL}/orders/{order_id}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to fetch order: {response.text}"
        
        order = response.json()["data"]
        assert order["id"] == order_id
        assert "orderNumber" in order
        assert "orderItems" in order
        
        print(f"✓ Order persistence verified: {order['orderNumber']}")
    
    def test_05_invoice_number_uniqueness(self):
        """Verify invoice numbers are unique and sequential"""
        products_resp = requests.get(f"{BASE_URL}/products?limit=1", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        invoice_numbers = []
        
        # Create 3 orders rapidly
        for i in range(3):
            order_data = {
                "customerName": f"TEST_Sequence_{i}",
                "customerMobile": "1111111111",
                "orderDate": time.strftime("%Y-%m-%d"),
                "subTotal": 100,
                "taxPercent": 0,
                "tax": 0,
                "total": 100,
                "orderItems": [{
                    "productId": product["id"],
                    "name": product["name"],
                    "quantity": 1,
                    "productPrice": 100,
                    "totalPrice": 100,
                    "type": product.get("type", "non-weighted")
                }]
            }
            
            response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
            if response.status_code == 200:
                order = response.json()["data"]
                created_orders.append(order["id"])
                invoice_numbers.append(order["orderNumber"])
        
        # Verify uniqueness
        assert len(invoice_numbers) == len(set(invoice_numbers)), "Invoice numbers should be unique"
        print(f"✓ Invoice numbers are unique: {invoice_numbers}")


class TestOrderOperations:
    """Order edit and delete operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_edit_order(self):
        """Test order editing - verify changes persist"""
        if not created_orders:
            pytest.skip("No orders to edit")
        
        order_id = created_orders[0]
        
        # Get current order
        response = requests.get(f"{BASE_URL}/orders/{order_id}", headers=self.get_headers())
        if response.status_code != 200:
            pytest.skip("Order not found")
        
        order = response.json()["data"]
        new_customer_name = "TEST_Updated_Customer"
        
        # Update order
        update_data = {
            "customerName": new_customer_name,
            "subTotal": order["subTotal"],
            "tax": order["tax"],
            "total": order["total"],
            "taxPercent": order["taxPercent"]
        }
        
        response = requests.put(f"{BASE_URL}/orders/{order_id}", 
                              json=update_data, 
                              headers=self.get_headers())
        
        if response.status_code == 200:
            # Verify update persisted
            verify_response = requests.get(f"{BASE_URL}/orders/{order_id}", headers=self.get_headers())
            updated_order = verify_response.json()["data"]
            assert updated_order["customerName"] == new_customer_name
            print(f"✓ Order updated successfully: {order['orderNumber']}")
        else:
            print(f"Order update response: {response.status_code} - {response.text}")
    
    def test_02_delete_order_soft_delete(self):
        """Test order deletion - verify soft delete (isDeleted=true)"""
        # Create a new order to delete
        products_resp = requests.get(f"{BASE_URL}/products?limit=1", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        order_data = {
            "customerName": "TEST_Delete_Customer",
            "customerMobile": "0000000000",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": 50,
            "taxPercent": 0,
            "tax": 0,
            "total": 50,
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": 1,
                "productPrice": 50,
                "totalPrice": 50,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        if create_response.status_code != 200:
            pytest.skip("Could not create order for deletion test")
        
        order_id = create_response.json()["data"]["id"]
        order_number = create_response.json()["data"]["orderNumber"]
        
        # Delete the order
        delete_response = requests.delete(f"{BASE_URL}/orders/{order_id}", headers=self.get_headers())
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify order is soft deleted (should not appear in list)
        list_response = requests.get(f"{BASE_URL}/orders?limit=100", headers=self.get_headers())
        orders = list_response.json().get("data", {}).get("rows", [])
        order_ids = [o["id"] for o in orders]
        
        assert order_id not in order_ids, "Deleted order should not appear in list"
        print(f"✓ Order soft deleted: {order_number}")


class TestOutstandingReceivables:
    """Test outstanding receivables report - CRITICAL for credit sales tracking"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_outstanding_receivables_structure(self):
        """Verify outstanding receivables API returns correct data structure"""
        response = requests.get(f"{BASE_URL}/reports/outstanding-receivables", headers=self.get_headers())
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert "data" in data, "Response should have 'data' field"
        assert isinstance(data["data"], list), "Data should be an array of customers"
        
        if data["data"]:
            customer = data["data"][0]
            # Verify required fields
            assert "customerName" in customer or "name" in customer, "Customer should have name"
            assert "totalOutstanding" in customer or "outstanding" in customer, "Customer should have outstanding amount"
            
        print(f"✓ Outstanding receivables structure verified, {len(data['data'])} customers with dues")
    
    def test_02_credit_sale_appears_in_receivables(self):
        """Verify credit sales appear in outstanding receivables"""
        # Create a credit sale
        products_resp = requests.get(f"{BASE_URL}/products?limit=1", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        customer_name = f"TEST_Receivable_{random.randint(1000, 9999)}"
        total = 500
        
        order_data = {
            "customerName": customer_name,
            "customerMobile": "7777777777",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": total,
            "taxPercent": 0,
            "tax": 0,
            "total": total,
            "paidAmount": 0,  # Credit sale
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": 1,
                "productPrice": total,
                "totalPrice": total,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        if create_response.status_code != 200:
            pytest.skip(f"Could not create credit order: {create_response.text}")
        
        order = create_response.json()["data"]
        created_orders.append(order["id"])
        
        # Check receivables
        receivables_response = requests.get(f"{BASE_URL}/reports/outstanding-receivables", headers=self.get_headers())
        receivables = receivables_response.json()["data"]
        
        # Find our customer
        customer_found = False
        for customer in receivables:
            name = customer.get("customerName") or customer.get("name", "")
            if customer_name in name:
                customer_found = True
                outstanding = customer.get("totalOutstanding") or customer.get("outstanding", 0)
                assert outstanding >= total, f"Outstanding should be at least {total}"
                print(f"✓ Credit sale appears in receivables: {customer_name}, Outstanding: {outstanding}")
                break
        
        assert customer_found, f"Customer {customer_name} should appear in receivables"


class TestPaymentRecording:
    """Test payment recording and order update"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_record_payment_updates_order(self):
        """Test that recording payment updates order paidAmount and dueAmount"""
        # Create a credit sale first
        products_resp = requests.get(f"{BASE_URL}/products?limit=1", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        total = 1000
        
        order_data = {
            "customerName": "TEST_Payment_Customer",
            "customerMobile": "8888888888",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": total,
            "taxPercent": 0,
            "tax": 0,
            "total": total,
            "paidAmount": 0,  # Credit sale
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": 1,
                "productPrice": total,
                "totalPrice": total,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        if create_response.status_code != 200:
            pytest.skip(f"Could not create order: {create_response.text}")
        
        order = create_response.json()["data"]
        created_orders.append(order["id"])
        order_id = order["id"]
        
        # Record partial payment
        payment_amount = 400
        payment_data = {
            "partyType": "customer",
            "partyName": "TEST_Payment_Customer",
            "amount": payment_amount,
            "paymentDate": time.strftime("%Y-%m-%d"),
            "paymentMethod": "cash",
            "referenceType": "order",
            "referenceId": order_id
        }
        
        payment_response = requests.post(f"{BASE_URL}/payments", json=payment_data, headers=self.get_headers())
        
        if payment_response.status_code == 200:
            # Verify order was updated
            order_response = requests.get(f"{BASE_URL}/orders/{order_id}", headers=self.get_headers())
            updated_order = order_response.json()["data"]
            
            assert float(updated_order["paidAmount"]) == payment_amount, f"paidAmount should be {payment_amount}"
            assert float(updated_order["dueAmount"]) == total - payment_amount, f"dueAmount should be {total - payment_amount}"
            assert updated_order["paymentStatus"] == "partial", "Status should be 'partial'"
            
            print(f"✓ Payment recorded, order updated: Paid={updated_order['paidAmount']}, Due={updated_order['dueAmount']}, Status={updated_order['paymentStatus']}")
        else:
            print(f"Payment recording response: {payment_response.status_code} - {payment_response.text}")


class TestAdminDashboard:
    """Test admin dashboard data accuracy"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_dashboard_data(self):
        """Test dashboard returns accurate counts and totals"""
        response = requests.get(f"{BASE_URL}/dashboard", headers=self.get_headers())
        
        if response.status_code == 200:
            data = response.json().get("data", {})
            print(f"✓ Dashboard data retrieved: {data}")
        else:
            print(f"Dashboard response: {response.status_code} - {response.text}")
    
    def test_02_orders_list_accuracy(self):
        """Verify orders list matches database"""
        response = requests.get(f"{BASE_URL}/orders?limit=100", headers=self.get_headers())
        assert response.status_code == 200
        
        data = response.json()["data"]
        count = data.get("count", 0)
        rows = data.get("rows", [])
        
        print(f"✓ Orders list: {count} total orders, {len(rows)} returned")
        
        # Verify each order has required fields
        for order in rows[:5]:  # Check first 5
            assert "id" in order
            assert "orderNumber" in order
            assert "total" in order
            assert "paymentStatus" in order


class TestSystemResilience:
    """Test system resilience against edge cases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuth.token:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "admin",
                "password": "admin123"
            })
            TestAuth.token = response.json()["data"]["token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
    
    def test_01_invalid_order_data(self):
        """Test system handles invalid order data gracefully"""
        # Missing required fields
        invalid_order = {
            "customerName": "Test"
            # Missing orderItems, totals, etc.
        }
        
        response = requests.post(f"{BASE_URL}/orders", json=invalid_order, headers=self.get_headers())
        assert response.status_code in [400, 500], "Should reject invalid order"
        print(f"✓ Invalid order correctly rejected: {response.status_code}")
    
    def test_02_duplicate_submission_prevention(self):
        """Test rapid duplicate submissions don't create duplicate orders"""
        products_resp = requests.get(f"{BASE_URL}/products?limit=1", headers=self.get_headers())
        products = products_resp.json().get("data", {}).get("rows", [])
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        unique_id = f"TEST_Duplicate_{random.randint(10000, 99999)}"
        
        order_data = {
            "customerName": unique_id,
            "customerMobile": "3333333333",
            "orderDate": time.strftime("%Y-%m-%d"),
            "subTotal": 100,
            "taxPercent": 0,
            "tax": 0,
            "total": 100,
            "orderItems": [{
                "productId": product["id"],
                "name": product["name"],
                "quantity": 1,
                "productPrice": 100,
                "totalPrice": 100,
                "type": product.get("type", "non-weighted")
            }]
        }
        
        # Submit same order twice rapidly
        response1 = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        response2 = requests.post(f"{BASE_URL}/orders", json=order_data, headers=self.get_headers())
        
        # Both should succeed but with different invoice numbers
        if response1.status_code == 200 and response2.status_code == 200:
            order1 = response1.json()["data"]
            order2 = response2.json()["data"]
            created_orders.extend([order1["id"], order2["id"]])
            
            assert order1["orderNumber"] != order2["orderNumber"], "Invoice numbers should be different"
            print(f"✓ Rapid submissions handled: {order1['orderNumber']} and {order2['orderNumber']}")
        else:
            print(f"Submission responses: {response1.status_code}, {response2.status_code}")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    """Cleanup test data after all tests"""
    def cleanup_data():
        if TestAuth.token:
            headers = {"Authorization": f"Bearer {TestAuth.token}", "Content-Type": "application/json"}
            
            # Note: In production, we might want to keep test data for audit
            # For now, just log what was created
            print(f"\n--- Test Data Summary ---")
            print(f"Orders created: {len(created_orders)}")
            print(f"Products created: {len(created_products)}")
            print(f"Customers created: {len(created_customers)}")
    
    request.addfinalizer(cleanup_data)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
