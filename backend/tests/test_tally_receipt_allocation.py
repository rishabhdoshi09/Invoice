"""
Tally-Style Receipt Allocation & Invoice Immutability Tests

Tests the following features:
1. Customer list with ledger-authoritative balances
2. Customer transactions with derived invoice dues
3. Receipt allocation (POST /api/receipts/allocate)
4. Over-allocation prevention (payment and invoice limits)
5. Invoice immutability guard (no direct paidAmount/dueAmount changes)
6. On-Account payments (no auto-FIFO allocation)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://forensic-ledger-3.preview.emergentagent.com').rstrip('/')

# Test customer IDs from the context
TEST_CREDIT_CUSTOMER_ID = "2e896797-65ad-44ba-9fb4-bd1ddf3cf1fb"


class TestAuth:
    """Test login and get token"""
    token = None
    
    @classmethod
    def get_token(cls):
        if cls.token is None:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "username": "admin",
                "password": "yttriumR"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            data = response.json()
            cls.token = data['data']['token']
        return cls.token
    
    def test_login_success(self):
        """Test login with admin/yttriumR credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "yttriumR"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data['data'], "No token in response"
        assert data['data']['user']['username'] == 'admin'
        TestAuth.token = data['data']['token']
        print(f"✓ Login successful for admin user")


class TestCustomerBalances:
    """Test customer list and balance calculations"""
    
    def test_customers_with_balance_endpoint(self):
        """GET /api/customers/with-balance returns ledger-authoritative balances"""
        token = TestAuth.get_token()
        response = requests.get(f"{BASE_URL}/api/customers/with-balance", 
                                headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert 'data' in data, "No data field in response"
        assert 'rows' in data['data'], "No rows field in data"
        
        customers = data['data']['rows']
        print(f"✓ Fetched {len(customers)} customers with balances")
        
        # Check for test customers
        test_credit_customer = None
        for c in customers:
            if c['id'] == TEST_CREDIT_CUSTOMER_ID:
                test_credit_customer = c
            # Print first 3 customers for reference
            if customers.index(c) < 3:
                print(f"  - {c['name']}: balance=₹{c.get('balance', 0)}, hasLedgerData={c.get('hasLedgerData', 'N/A')}")
        
        if test_credit_customer:
            print(f"✓ Found Test Credit Customer: balance=₹{test_credit_customer.get('balance', 0)}")
            assert 'balance' in test_credit_customer, "Balance field missing"
    
    def test_customer_transactions_endpoint(self):
        """GET /api/customers/:id/transactions returns derived invoice dues and payment data"""
        token = TestAuth.get_token()
        response = requests.get(f"{BASE_URL}/api/customers/{TEST_CREDIT_CUSTOMER_ID}/transactions",
                                headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert 'data' in data, "No data field in response"
        
        customer = data['data']
        print(f"✓ Customer transactions for: {customer.get('name', 'Unknown')}")
        print(f"  - Balance: ₹{customer.get('balance', 0)}")
        print(f"  - Balance Source: {customer.get('balanceSource', 'N/A')}")
        print(f"  - Total Debit: ₹{customer.get('totalDebit', 0)}")
        print(f"  - Total Credit: ₹{customer.get('totalCredit', 0)}")
        
        # Check for orders (invoices)
        orders = customer.get('orders', [])
        print(f"  - Orders count: {len(orders)}")
        for order in orders[:3]:
            print(f"    * {order.get('orderNumber', 'N/A')}: total=₹{order.get('total', 0)}, derivedDue=₹{order.get('derivedDue', 0)}, derivedPaid=₹{order.get('derivedPaid', 0)}")
        
        # Check for payments
        payments = customer.get('payments', [])
        print(f"  - Payments count: {len(payments)}")
        for payment in payments[:3]:
            print(f"    * {payment.get('paymentNumber', 'N/A')}: ₹{payment.get('amount', 0)}, allocated=₹{payment.get('allocatedAmount', 0)}, unallocated=₹{payment.get('unallocatedAmount', 0)}")
        
        # Validate structure
        assert 'balanceSource' in customer, "balanceSource field missing"
        assert customer['balanceSource'] in ['ledger', 'orders'], f"Invalid balanceSource: {customer['balanceSource']}"


# Helper to create test data
def create_test_customer(token, unique_id):
    """Create test customer"""
    customer_response = requests.post(f"{BASE_URL}/api/customers", 
        json={
            "name": f"TEST_Alloc_{unique_id}",
            "mobile": f"9999{unique_id[:6]}",
            "openingBalance": 0
        },
        headers={"Authorization": f"Bearer {token}"})
    assert customer_response.status_code == 200, f"Failed to create customer: {customer_response.text}"
    return customer_response.json()['data']


def create_test_order(token, customer_name, customer_mobile, total):
    """Create test order - note: customerId is auto-linked by customer name/mobile"""
    order_response = requests.post(f"{BASE_URL}/api/orders",
        json={
            "orderDate": "13-03-2026",
            "customerName": customer_name,
            "customerMobile": customer_mobile,
            "subTotal": total,
            "total": total,
            "paidAmount": 0,
            "dueAmount": total,
            "paymentStatus": "unpaid",
            "notes": "Test invoice for allocation",
            "orderItems": [{
                "name": "Test Item",
                "quantity": 1,
                "productPrice": total,
                "totalPrice": total,
                "type": "non-weighted"
            }]
        },
        headers={"Authorization": f"Bearer {token}"})
    assert order_response.status_code == 200, f"Failed to create order: {order_response.text}"
    return order_response.json()['data']


def create_test_payment(token, customer_id, customer_name, amount):
    """Create test payment for a customer"""
    payment_response = requests.post(f"{BASE_URL}/api/payments",
        json={
            "partyType": "customer",
            "partyId": customer_id,
            "partyName": customer_name,
            "amount": amount,
            "paymentDate": "13-03-2026",
            "referenceType": "advance",
            "notes": "Test payment for allocation"
        },
        headers={"Authorization": f"Bearer {token}"})
    assert payment_response.status_code == 200, f"Failed to create payment: {payment_response.text}"
    return payment_response.json()['data']


class TestReceiptAllocation:
    """Test receipt allocation functionality"""
    
    def test_allocate_receipt_success(self):
        """POST /api/receipts/allocate - successfully allocate payment against invoice"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, unique_id)
        print(f"✓ Created test customer: {customer['name']}")
        
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        print(f"✓ Created test order: {order['orderNumber']} (₹{order['total']})")
        
        payment = create_test_payment(token, customer['id'], customer['name'], 500)
        print(f"✓ Created test payment: {payment['paymentNumber']} (₹{payment['amount']})")
        
        # Perform allocation
        response = requests.post(f"{BASE_URL}/api/receipts/allocate",
            json={
                "paymentId": payment['id'],
                "allocations": [{
                    "orderId": order['id'],
                    "amount": 500
                }],
                "changedBy": "Test Agent"
            },
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 200, f"Allocation failed: {response.text}"
        data = response.json()
        print(f"✓ Allocation successful: {data.get('message', 'OK')}")
        
        # Verify the order's cached values were updated
        order_response = requests.get(f"{BASE_URL}/api/orders/{order['id']}",
                                      headers={"Authorization": f"Bearer {token}"})
        updated_order = order_response.json()['data']
        print(f"  - Order paidAmount: ₹{updated_order.get('paidAmount', 0)}")
        print(f"  - Order dueAmount: ₹{updated_order.get('dueAmount', 0)}")
        print(f"  - Order status: {updated_order.get('paymentStatus', 'N/A')}")
        
        assert float(updated_order.get('paidAmount', 0)) == 500, "paidAmount should be 500"
        assert float(updated_order.get('dueAmount', 0)) == 500, "dueAmount should be 500"
        assert updated_order.get('paymentStatus') == 'partial', "Status should be partial"


class TestOverAllocationPrevention:
    """Test that over-allocation is prevented"""
    
    def test_over_allocation_payment_amount_exceeded(self):
        """Receipt allocation over-allocation prevention (payment amount exceeded)"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"OverPay_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 5000)
        payment = create_test_payment(token, customer['id'], customer['name'], 3000)  # Payment is less than order
        print(f"✓ Setup: Order ₹5000, Payment ₹3000")
        
        # Try to allocate ₹5000 (more than payment amount of ₹3000)
        response = requests.post(f"{BASE_URL}/api/receipts/allocate",
            json={
                "paymentId": payment['id'],
                "allocations": [{"orderId": order['id'], "amount": 5000}],  # Trying to allocate more than payment
                "changedBy": "Test Agent"
            },
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 400, f"Should fail but got: {response.status_code} - {response.text}"
        error_msg = response.json().get('message', '')
        print(f"✓ Over-allocation blocked (payment limit): {error_msg}")
        assert 'over-allocation' in error_msg.lower() or 'payment is' in error_msg.lower(), "Error should mention over-allocation"
    
    def test_over_allocation_invoice_amount_exceeded(self):
        """Receipt allocation over-allocation prevention (invoice amount exceeded)"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"OverInv_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)  # Small order
        payment = create_test_payment(token, customer['id'], customer['name'], 5000)  # Big payment
        print(f"✓ Setup: Order ₹1000, Payment ₹5000")
        
        # Try to allocate ₹2000 against ₹1000 order
        response = requests.post(f"{BASE_URL}/api/receipts/allocate",
            json={
                "paymentId": payment['id'],
                "allocations": [{"orderId": order['id'], "amount": 2000}],  # More than invoice total
                "changedBy": "Test Agent"
            },
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 400, f"Should fail but got: {response.status_code} - {response.text}"
        error_msg = response.json().get('message', '')
        print(f"✓ Over-allocation blocked (invoice limit): {error_msg}")
        assert 'over-allocation' in error_msg.lower() or 'invoice' in error_msg.lower(), "Error should mention invoice over-allocation"


class TestInvoiceImmutability:
    """Test invoice immutability guard"""
    
    def test_reject_direct_paid_amount_change(self):
        """PUT /api/orders/:id rejects paidAmount changes"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"Immut1_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        print(f"✓ Created order: {order['orderNumber']}")
        
        # Try to directly update paidAmount
        response = requests.put(f"{BASE_URL}/api/orders/{order['id']}",
            json={"paidAmount": 500},
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 400, f"Should reject but got: {response.status_code} - {response.text}"
        error_msg = response.json().get('message', '')
        print(f"✓ paidAmount change blocked: {error_msg}")
        assert 'paidAmount' in error_msg or 'payment' in error_msg.lower(), "Error should mention paidAmount"
    
    def test_reject_direct_due_amount_change(self):
        """PUT /api/orders/:id rejects dueAmount changes"""
        token = TestAuth.get_token()
        
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"Immut2_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        
        # Try to directly update dueAmount
        response = requests.put(f"{BASE_URL}/api/orders/{order['id']}",
            json={"dueAmount": 500},
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 400, f"Should reject but got: {response.status_code} - {response.text}"
        error_msg = response.json().get('message', '')
        print(f"✓ dueAmount change blocked: {error_msg}")
        assert 'dueAmount' in error_msg or 'payment' in error_msg.lower()
    
    def test_reject_direct_payment_status_change(self):
        """PUT /api/orders/:id rejects paymentStatus changes"""
        token = TestAuth.get_token()
        
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"Immut3_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        
        # Try to directly update paymentStatus
        response = requests.put(f"{BASE_URL}/api/orders/{order['id']}",
            json={"paymentStatus": "paid"},
            headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 400, f"Should reject but got: {response.status_code} - {response.text}"
        error_msg = response.json().get('message', '')
        print(f"✓ paymentStatus change blocked: {error_msg}")
        assert 'paymentStatus' in error_msg or 'payment' in error_msg.lower()


class TestOnAccountPayment:
    """Test On-Account payments (no auto-FIFO)"""
    
    def test_payment_without_reference_stays_unallocated(self):
        """POST /api/payments with customer payment without referenceId stays as On Account (no auto-FIFO)"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"OnAcc_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        print(f"✓ Created unpaid order: {order['orderNumber']} (₹{order['total']})")
        
        # Record payment WITHOUT referenceId (should be On Account)
        payment = create_test_payment(token, customer['id'], customer['name'], 500)
        print(f"✓ Created On-Account payment: {payment['paymentNumber']} (₹{payment['amount']})")
        
        # Verify order was NOT automatically modified (no auto-FIFO)
        order_check = requests.get(f"{BASE_URL}/api/orders/{order['id']}",
                                   headers={"Authorization": f"Bearer {token}"})
        updated_order = order_check.json()['data']
        
        print(f"  - Order paidAmount after On-Account payment: ₹{updated_order.get('paidAmount', 0)}")
        print(f"  - Order paymentStatus: {updated_order.get('paymentStatus', 'N/A')}")
        
        # Payment should NOT have been auto-allocated to the order
        assert float(updated_order.get('paidAmount', 0)) == 0, "paidAmount should still be 0 (no auto-FIFO)"
        assert updated_order.get('paymentStatus') == 'unpaid', "Order should still be unpaid"
        print(f"✓ On-Account behavior verified: Order remains unpaid (no auto-FIFO allocation)")
        
        # Check customer transactions to see unallocated payment
        txn_response = requests.get(f"{BASE_URL}/api/customers/{customer['id']}/transactions",
                                    headers={"Authorization": f"Bearer {token}"})
        customer_data = txn_response.json()['data']
        
        payments = customer_data.get('payments', [])
        unallocated_payment = next((p for p in payments if p['id'] == payment['id']), None)
        
        if unallocated_payment:
            print(f"  - Payment unallocatedAmount: ₹{unallocated_payment.get('unallocatedAmount', 0)}")
            assert float(unallocated_payment.get('unallocatedAmount', 0)) == 500, "Full payment should be unallocated"


class TestGetPaymentAllocations:
    """Test fetching allocation details"""
    
    def test_get_payment_allocations(self):
        """GET /api/receipts/:paymentId/allocations returns allocation data"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"GetAlloc_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        payment = create_test_payment(token, customer['id'], customer['name'], 800)
        
        # Create allocation
        requests.post(f"{BASE_URL}/api/receipts/allocate",
            json={
                "paymentId": payment['id'],
                "allocations": [{"orderId": order['id'], "amount": 600}],
                "changedBy": "Test Agent"
            },
            headers={"Authorization": f"Bearer {token}"})
        
        # Get payment allocations
        response = requests.get(f"{BASE_URL}/api/receipts/{payment['id']}/allocations",
                                headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()['data']
        
        print(f"✓ Payment allocations fetched")
        print(f"  - Total allocated: ₹{data.get('totalAllocated', 0)}")
        print(f"  - Unallocated: ₹{data.get('unallocated', 0)}")
        print(f"  - Allocations count: {len(data.get('allocations', []))}")
        
        assert float(data.get('totalAllocated', 0)) == 600
        assert float(data.get('unallocated', 0)) == 200  # 800 - 600 = 200


class TestInvoiceAllocations:
    """Test fetching allocation details for invoices"""
    
    def test_get_invoice_allocations(self):
        """GET /api/invoices/:orderId/allocations returns allocation data"""
        token = TestAuth.get_token()
        
        # Create test data
        unique_id = str(uuid.uuid4())[:8]
        customer = create_test_customer(token, f"InvAlloc_{unique_id}")
        order = create_test_order(token, customer['name'], customer.get('mobile', ''), 1000)
        payment = create_test_payment(token, customer['id'], customer['name'], 700)
        
        # Create allocation
        requests.post(f"{BASE_URL}/api/receipts/allocate",
            json={
                "paymentId": payment['id'],
                "allocations": [{"orderId": order['id'], "amount": 700}],
                "changedBy": "Test Agent"
            },
            headers={"Authorization": f"Bearer {token}"})
        
        # Get invoice allocations
        response = requests.get(f"{BASE_URL}/api/invoices/{order['id']}/allocations",
                                headers={"Authorization": f"Bearer {token}"})
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()['data']
        
        print(f"✓ Invoice allocations fetched")
        print(f"  - Total allocated: ₹{data.get('totalAllocated', 0)}")
        print(f"  - Derived due: ₹{data.get('derivedDue', 0)}")
        print(f"  - Allocations count: {len(data.get('allocations', []))}")
        
        assert float(data.get('totalAllocated', 0)) == 700
        assert float(data.get('derivedDue', 0)) == 300  # 1000 - 700 = 300


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
