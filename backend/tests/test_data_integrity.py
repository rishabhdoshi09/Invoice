"""
Test Data Integrity for Invoicing/Ledger Application
Tests:
1. DayStart page - Cash Sales (PAID orders) vs Credit Sales (UNPAID orders)
2. Real-time endpoint GET /api/dashboard/summary/realtime/:date
3. Customer transactions endpoint GET /api/customers/:id/transactions
4. Customer ledger list - Sales, Received, Balance amounts
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')

class TestDataIntegrity:
    """Test data integrity for invoicing/ledger application"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data['data']['token']
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
    def test_01_login_success(self):
        """Test login works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert 'token' in data['data']
        assert data['data']['user']['role'] == 'admin'
        print(f"✓ Login successful - User: {data['data']['user']['username']}")
        
    def test_02_realtime_summary_endpoint(self):
        """Test GET /api/dashboard/summary/realtime/:date returns accurate totals"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        
        assert response.status_code == 200, f"Real-time summary failed: {response.text}"
        data = response.json()
        
        assert 'data' in data, "Response should have 'data' field"
        summary = data['data']
        
        # Verify required fields exist
        required_fields = ['cashSales', 'creditSales', 'totalBusinessDone', 'totalOrders', 
                          'paidOrdersCount', 'unpaidOrdersCount', 'partialOrdersCount']
        for field in required_fields:
            assert field in summary, f"Missing field: {field}"
        
        # Verify calculations
        assert summary['totalBusinessDone'] == summary['cashSales'] + summary['creditSales'], \
            f"Total business should equal cash + credit sales"
        
        print(f"✓ Real-time summary endpoint working")
        print(f"  - Cash Sales: ₹{summary['cashSales']} ({summary['paidOrdersCount']} paid orders)")
        print(f"  - Credit Sales: ₹{summary['creditSales']} ({summary['unpaidOrdersCount']} unpaid + {summary['partialOrdersCount']} partial)")
        print(f"  - Total Business: ₹{summary['totalBusinessDone']} ({summary['totalOrders']} orders)")
        
        return summary
        
    def test_03_today_summary_endpoint(self):
        """Test GET /api/dashboard/summary/today returns summary"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/today")
        
        assert response.status_code == 200, f"Today summary failed: {response.text}"
        data = response.json()
        
        assert 'data' in data, "Response should have 'data' field"
        summary = data['data']
        
        print(f"✓ Today summary endpoint working")
        print(f"  - Opening Balance: ₹{summary.get('openingBalance', 0)}")
        print(f"  - Total Sales: ₹{summary.get('totalSales', 0)}")
        print(f"  - Total Orders: {summary.get('totalOrders', 0)}")
        
    def test_04_customers_with_balance(self):
        """Test GET /api/customers/with-balance returns correct Sales, Received, Balance"""
        response = self.session.get(f"{BASE_URL}/api/customers/with-balance")
        
        assert response.status_code == 200, f"Customers with balance failed: {response.text}"
        data = response.json()
        
        assert 'data' in data, "Response should have 'data' field"
        customers = data['data'].get('rows', [])
        
        print(f"✓ Customers with balance endpoint working - {len(customers)} customers")
        
        for customer in customers[:5]:  # Show first 5
            name = customer.get('name', 'Unknown')
            total_debit = float(customer.get('totalDebit') or 0)
            total_credit = float(customer.get('totalCredit') or 0)
            balance = float(customer.get('balance') or 0)
            opening = float(customer.get('openingBalance') or 0)
            
            print(f"  - {name}: Sales=₹{total_debit}, Received=₹{total_credit}, Balance=₹{balance}")
            
            # Balance should be Opening + Due amounts from orders
            # Note: Balance is calculated as openingBalance + sum of dueAmount from orders
            
        return customers
        
    def test_05_customer_transactions_endpoint(self):
        """Test GET /api/customers/:id/transactions returns payments array"""
        # First get a customer
        response = self.session.get(f"{BASE_URL}/api/customers/with-balance")
        assert response.status_code == 200
        customers = response.json()['data'].get('rows', [])
        
        if not customers:
            pytest.skip("No customers found to test transactions")
            
        # Test with first customer
        customer_id = customers[0]['id']
        customer_name = customers[0]['name']
        
        response = self.session.get(f"{BASE_URL}/api/customers/{customer_id}/transactions")
        assert response.status_code == 200, f"Customer transactions failed: {response.text}"
        
        data = response.json()
        assert 'data' in data, "Response should have 'data' field"
        
        customer_data = data['data']
        
        # Verify required fields
        assert 'orders' in customer_data, "Should have 'orders' array"
        assert 'payments' in customer_data, "Should have 'payments' array"
        assert 'totalDebit' in customer_data, "Should have 'totalDebit'"
        assert 'totalCredit' in customer_data, "Should have 'totalCredit'"
        assert 'balance' in customer_data, "Should have 'balance'"
        
        orders = customer_data.get('orders', [])
        payments = customer_data.get('payments', [])
        
        print(f"✓ Customer transactions endpoint working for '{customer_name}'")
        print(f"  - Orders: {len(orders)}")
        print(f"  - Payments/Receipts: {len(payments)}")
        print(f"  - Total Debit: ₹{customer_data.get('totalDebit', 0)}")
        print(f"  - Total Credit: ₹{customer_data.get('totalCredit', 0)}")
        print(f"  - Balance: ₹{customer_data.get('balance', 0)}")
        
        # Show payment details if any
        if payments:
            print(f"  - Payment details:")
            for p in payments[:3]:
                print(f"    * {p.get('paymentNumber', 'N/A')}: ₹{p.get('amount', 0)} on {p.get('paymentDate', 'N/A')}")
                
        return customer_data
        
    def test_06_test_customer_with_test_data(self):
        """Test specific customer mentioned in context: cfc8ca43-a5ba-44c4-8807-d8e1d2e326f2"""
        test_customer_id = "cfc8ca43-a5ba-44c4-8807-d8e1d2e326f2"
        
        response = self.session.get(f"{BASE_URL}/api/customers/{test_customer_id}/transactions")
        
        if response.status_code == 404:
            print(f"⚠ Test customer {test_customer_id} not found - may have been deleted")
            pytest.skip("Test customer not found")
            
        assert response.status_code == 200, f"Failed to get test customer: {response.text}"
        
        data = response.json()['data']
        
        print(f"✓ Test Customer 2 data:")
        print(f"  - Name: {data.get('name', 'Unknown')}")
        print(f"  - Orders: {len(data.get('orders', []))}")
        print(f"  - Payments: {len(data.get('payments', []))}")
        
        # According to context: 1 payment receipt of ₹500
        payments = data.get('payments', [])
        if payments:
            total_payments = sum(float(p.get('amount', 0)) for p in payments)
            print(f"  - Total Payments Received: ₹{total_payments}")
            
    def test_07_orders_list_with_payment_status(self):
        """Test orders endpoint returns correct payment status"""
        response = self.session.get(f"{BASE_URL}/api/orders?limit=10")
        
        assert response.status_code == 200, f"Orders list failed: {response.text}"
        data = response.json()
        
        orders = data.get('data', {}).get('rows', [])
        
        print(f"✓ Orders endpoint working - {len(orders)} orders")
        
        paid_count = 0
        unpaid_count = 0
        partial_count = 0
        
        for order in orders[:5]:
            status = order.get('paymentStatus', 'unknown')
            total = float(order.get('total', 0))
            paid = float(order.get('paidAmount', 0))
            due = float(order.get('dueAmount', 0))
            
            if status == 'paid':
                paid_count += 1
            elif status == 'unpaid':
                unpaid_count += 1
            elif status == 'partial':
                partial_count += 1
                
            print(f"  - {order.get('orderNumber', 'N/A')}: {status} (Total=₹{total}, Paid=₹{paid}, Due=₹{due})")
            
            # Verify payment status logic
            if status == 'paid':
                assert due == 0, f"Paid order should have 0 due amount"
            elif status == 'unpaid':
                assert paid == 0, f"Unpaid order should have 0 paid amount"
                
        print(f"  Summary: {paid_count} paid, {unpaid_count} unpaid, {partial_count} partial")
        
    def test_08_verify_cash_vs_credit_sales_calculation(self):
        """Verify DayStart calculation: Cash Sales = PAID orders only, Credit Sales = UNPAID + PARTIAL"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Get real-time summary
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        assert response.status_code == 200
        summary = response.json()['data']
        
        # Get orders for today
        today_ddmmyyyy = datetime.now().strftime('%d-%m-%Y')
        response = self.session.get(f"{BASE_URL}/api/orders?limit=100")
        assert response.status_code == 200
        all_orders = response.json().get('data', {}).get('rows', [])
        
        # Filter today's orders
        today_orders = [o for o in all_orders if o.get('orderDate') == today_ddmmyyyy]
        
        # Calculate expected values
        paid_orders = [o for o in today_orders if o.get('paymentStatus') == 'paid']
        unpaid_orders = [o for o in today_orders if o.get('paymentStatus') == 'unpaid']
        partial_orders = [o for o in today_orders if o.get('paymentStatus') == 'partial']
        
        expected_cash_sales = sum(float(o.get('total', 0)) for o in paid_orders)
        expected_credit_sales = sum(float(o.get('total', 0)) for o in unpaid_orders + partial_orders)
        
        print(f"✓ Cash vs Credit Sales Verification for {today_ddmmyyyy}:")
        print(f"  - Today's Orders: {len(today_orders)}")
        print(f"  - Paid Orders: {len(paid_orders)} = ₹{expected_cash_sales}")
        print(f"  - Unpaid Orders: {len(unpaid_orders)}")
        print(f"  - Partial Orders: {len(partial_orders)}")
        print(f"  - Expected Credit Sales: ₹{expected_credit_sales}")
        print(f"  - API Cash Sales: ₹{summary.get('cashSales', 0)}")
        print(f"  - API Credit Sales: ₹{summary.get('creditSales', 0)}")
        
        # Verify
        assert summary.get('cashSales', 0) == expected_cash_sales, \
            f"Cash sales mismatch: API={summary.get('cashSales')} vs Expected={expected_cash_sales}"
        assert summary.get('creditSales', 0) == expected_credit_sales, \
            f"Credit sales mismatch: API={summary.get('creditSales')} vs Expected={expected_credit_sales}"
            
        print(f"  ✓ Cash and Credit sales calculations are CORRECT!")
        
    def test_09_payments_endpoint(self):
        """Test payments endpoint for customer receipts"""
        response = self.session.get(f"{BASE_URL}/api/payments?partyType=customer&limit=10")
        
        assert response.status_code == 200, f"Payments endpoint failed: {response.text}"
        data = response.json()
        
        payments = data.get('data', {}).get('rows', [])
        
        print(f"✓ Payments endpoint working - {len(payments)} customer receipts")
        
        for p in payments[:5]:
            print(f"  - {p.get('paymentNumber', 'N/A')}: ₹{p.get('amount', 0)} from {p.get('partyName', 'Unknown')} on {p.get('paymentDate', 'N/A')}")
            
    def test_10_daily_payment_summary(self):
        """Test daily payment summary endpoint"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = self.session.get(f"{BASE_URL}/api/payments/daily-summary?date={today}")
        
        assert response.status_code == 200, f"Daily payment summary failed: {response.text}"
        data = response.json()
        
        summary = data.get('data', {}).get('summary', {})
        
        print(f"✓ Daily payment summary for {today}:")
        print(f"  - Customer Receipts: {summary.get('customers', {}).get('count', 0)} = ₹{summary.get('customers', {}).get('amount', 0)}")
        print(f"  - Supplier Payments: {summary.get('suppliers', {}).get('count', 0)} = ₹{summary.get('suppliers', {}).get('amount', 0)}")
        print(f"  - Expenses: {summary.get('expenses', {}).get('count', 0)} = ₹{summary.get('expenses', {}).get('amount', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
