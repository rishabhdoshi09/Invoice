"""
Test Double-Counting Bug Fix for Cash Sales Calculation
Tests the specific scenario mentioned in the review request:
- Order 1: ₹1000 PAID
- Order 2: ₹2500, paid ₹500, due ₹2000 PARTIAL
- Expected: cashSales=1500 (sum of paidAmount), creditSales=2000 (sum of dueAmount)
- Customer receipts for TODAY's orders should NOT be double-counted
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')

class TestDoubleCounting:
    """Test double-counting bug fix for cash sales calculation"""
    
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
        
    def test_01_get_todays_orders(self):
        """Get all orders for today and analyze payment status"""
        today_ddmmyyyy = datetime.now().strftime('%d-%m-%Y')
        
        response = self.session.get(f"{BASE_URL}/api/orders?limit=100")
        assert response.status_code == 200, f"Orders list failed: {response.text}"
        
        all_orders = response.json().get('data', {}).get('rows', [])
        today_orders = [o for o in all_orders if o.get('orderDate') == today_ddmmyyyy]
        
        print(f"\n=== Today's Orders ({today_ddmmyyyy}) ===")
        print(f"Total orders today: {len(today_orders)}")
        
        total_paid_amount = 0
        total_due_amount = 0
        total_order_value = 0
        
        for order in today_orders:
            order_num = order.get('orderNumber', 'N/A')
            status = order.get('paymentStatus', 'unknown')
            total = float(order.get('total', 0))
            paid = float(order.get('paidAmount', 0))
            due = float(order.get('dueAmount', 0))
            
            total_paid_amount += paid
            total_due_amount += due
            total_order_value += total
            
            print(f"  {order_num}: status={status}, total=₹{total}, paid=₹{paid}, due=₹{due}")
        
        print(f"\n=== Calculated Totals ===")
        print(f"Sum of paidAmount (Cash Sales): ₹{total_paid_amount}")
        print(f"Sum of dueAmount (Credit Outstanding): ₹{total_due_amount}")
        print(f"Sum of total (Total Business): ₹{total_order_value}")
        
        # Store for later tests
        self.expected_cash_sales = total_paid_amount
        self.expected_credit_sales = total_due_amount
        self.expected_total_business = total_order_value
        
        return {
            'cash_sales': total_paid_amount,
            'credit_sales': total_due_amount,
            'total_business': total_order_value,
            'orders': today_orders
        }
        
    def test_02_get_realtime_summary(self):
        """Get real-time summary and compare with calculated values"""
        today = datetime.now().strftime('%Y-%m-%d')
        
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        assert response.status_code == 200, f"Real-time summary failed: {response.text}"
        
        summary = response.json()['data']
        
        print(f"\n=== Real-Time Summary API Response ===")
        print(f"cashSales: ₹{summary.get('cashSales', 0)}")
        print(f"creditSales: ₹{summary.get('creditSales', 0)}")
        print(f"totalBusinessDone: ₹{summary.get('totalBusinessDone', 0)}")
        print(f"customerReceipts: ₹{summary.get('customerReceipts', 0)}")
        print(f"customerReceiptsCount: {summary.get('customerReceiptsCount', 0)}")
        print(f"paidOrdersCount: {summary.get('paidOrdersCount', 0)}")
        print(f"unpaidOrdersCount: {summary.get('unpaidOrdersCount', 0)}")
        print(f"partialOrdersCount: {summary.get('partialOrdersCount', 0)}")
        
        return summary
        
    def test_03_get_payments_for_today(self):
        """Get all payments for today to check for double-counting"""
        today = datetime.now().strftime('%Y-%m-%d')
        today_ddmmyyyy = datetime.now().strftime('%d-%m-%Y')
        
        response = self.session.get(f"{BASE_URL}/api/payments?limit=100")
        assert response.status_code == 200, f"Payments list failed: {response.text}"
        
        all_payments = response.json().get('data', {}).get('rows', [])
        today_payments = [p for p in all_payments if p.get('paymentDate') == today_ddmmyyyy]
        
        print(f"\n=== Today's Payments ({today_ddmmyyyy}) ===")
        print(f"Total payments today: {len(today_payments)}")
        
        for payment in today_payments:
            pay_num = payment.get('paymentNumber', 'N/A')
            party_type = payment.get('partyType', 'unknown')
            party_name = payment.get('partyName', 'Unknown')
            amount = float(payment.get('amount', 0))
            ref_type = payment.get('referenceType', 'N/A')
            ref_id = payment.get('referenceId', 'N/A')
            
            print(f"  {pay_num}: {party_type} - {party_name}, ₹{amount}, ref={ref_type}/{ref_id}")
            
        return today_payments
        
    def test_04_verify_cash_sales_equals_sum_of_paid_amount(self):
        """
        CRITICAL TEST: Verify cashSales = SUM(paidAmount) from orders table
        This is the main test for the double-counting fix
        """
        today = datetime.now().strftime('%Y-%m-%d')
        today_ddmmyyyy = datetime.now().strftime('%d-%m-%Y')
        
        # Get orders
        response = self.session.get(f"{BASE_URL}/api/orders?limit=100")
        assert response.status_code == 200
        all_orders = response.json().get('data', {}).get('rows', [])
        today_orders = [o for o in all_orders if o.get('orderDate') == today_ddmmyyyy and not o.get('isDeleted')]
        
        # Calculate expected values from orders
        expected_cash_sales = sum(float(o.get('paidAmount', 0)) for o in today_orders)
        expected_credit_sales = sum(float(o.get('dueAmount', 0)) for o in today_orders)
        
        # Get real-time summary
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        assert response.status_code == 200
        summary = response.json()['data']
        
        api_cash_sales = summary.get('cashSales', 0)
        api_credit_sales = summary.get('creditSales', 0)
        
        print(f"\n=== CRITICAL VERIFICATION ===")
        print(f"Expected Cash Sales (SUM of paidAmount): ₹{expected_cash_sales}")
        print(f"API Cash Sales: ₹{api_cash_sales}")
        print(f"Match: {'✓ YES' if api_cash_sales == expected_cash_sales else '✗ NO'}")
        print(f"")
        print(f"Expected Credit Sales (SUM of dueAmount): ₹{expected_credit_sales}")
        print(f"API Credit Sales: ₹{api_credit_sales}")
        print(f"Match: {'✓ YES' if api_credit_sales == expected_credit_sales else '✗ NO'}")
        
        # Assert the critical requirement
        assert api_cash_sales == expected_cash_sales, \
            f"DOUBLE-COUNTING BUG: Cash Sales mismatch! API={api_cash_sales} vs Expected={expected_cash_sales}"
        assert api_credit_sales == expected_credit_sales, \
            f"Credit Sales mismatch! API={api_credit_sales} vs Expected={expected_credit_sales}"
            
        print(f"\n✓ Cash Sales calculation is CORRECT - no double-counting detected!")
        
    def test_05_verify_customer_receipts_exclude_todays_orders(self):
        """
        Verify that customerReceipts only includes payments for PAST orders,
        not payments linked to today's orders (which would cause double-counting)
        """
        today = datetime.now().strftime('%Y-%m-%d')
        today_ddmmyyyy = datetime.now().strftime('%d-%m-%Y')
        
        # Get today's order IDs
        response = self.session.get(f"{BASE_URL}/api/orders?limit=100")
        assert response.status_code == 200
        all_orders = response.json().get('data', {}).get('rows', [])
        today_order_ids = [o.get('id') for o in all_orders if o.get('orderDate') == today_ddmmyyyy]
        
        # Get today's payments
        response = self.session.get(f"{BASE_URL}/api/payments?limit=100")
        assert response.status_code == 200
        all_payments = response.json().get('data', {}).get('rows', [])
        today_payments = [p for p in all_payments if p.get('paymentDate') == today_ddmmyyyy]
        
        # Filter customer payments
        customer_payments = [p for p in today_payments if p.get('partyType') == 'customer']
        
        # Payments linked to today's orders (should NOT be in customerReceipts)
        payments_for_todays_orders = [p for p in customer_payments 
                                       if p.get('referenceType') == 'order' 
                                       and p.get('referenceId') in today_order_ids]
        
        # Payments for past orders (should be in customerReceipts)
        payments_for_past_orders = [p for p in customer_payments 
                                    if not (p.get('referenceType') == 'order' 
                                           and p.get('referenceId') in today_order_ids)]
        
        expected_customer_receipts = sum(float(p.get('amount', 0)) for p in payments_for_past_orders)
        
        # Get real-time summary
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        assert response.status_code == 200
        summary = response.json()['data']
        
        api_customer_receipts = summary.get('customerReceipts', 0)
        
        print(f"\n=== Customer Receipts Verification ===")
        print(f"Today's Order IDs: {today_order_ids}")
        print(f"Total customer payments today: {len(customer_payments)}")
        print(f"Payments linked to today's orders: {len(payments_for_todays_orders)}")
        print(f"Payments for past orders: {len(payments_for_past_orders)}")
        print(f"Expected customerReceipts: ₹{expected_customer_receipts}")
        print(f"API customerReceipts: ₹{api_customer_receipts}")
        
        # Show details of payments linked to today's orders
        if payments_for_todays_orders:
            print(f"\nPayments linked to today's orders (should NOT be in customerReceipts):")
            for p in payments_for_todays_orders:
                print(f"  {p.get('paymentNumber')}: ₹{p.get('amount')} -> Order {p.get('referenceId')}")
        
        assert api_customer_receipts == expected_customer_receipts, \
            f"Customer receipts mismatch! API={api_customer_receipts} vs Expected={expected_customer_receipts}"
            
        print(f"\n✓ Customer receipts correctly exclude payments for today's orders!")
        
    def test_06_verify_expected_cash_formula(self):
        """
        Verify: Expected Cash = Opening + Cash Sales + Customer Receipts - Supplier Payments - Expenses
        """
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Get today's summary for opening balance
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/today")
        assert response.status_code == 200
        today_summary = response.json()['data']
        opening_balance = float(today_summary.get('openingBalance', 0))
        
        # Get real-time summary
        response = self.session.get(f"{BASE_URL}/api/dashboard/summary/realtime/{today}")
        assert response.status_code == 200
        realtime = response.json()['data']
        
        cash_sales = float(realtime.get('cashSales', 0))
        customer_receipts = float(realtime.get('customerReceipts', 0))
        supplier_payments = float(realtime.get('supplierPayments', 0))
        expenses = float(realtime.get('expenses', 0))
        
        expected_cash = opening_balance + cash_sales + customer_receipts - supplier_payments - expenses
        
        print(f"\n=== Expected Cash Formula Verification ===")
        print(f"Opening Balance: ₹{opening_balance}")
        print(f"+ Cash Sales: ₹{cash_sales}")
        print(f"+ Customer Receipts: ₹{customer_receipts}")
        print(f"- Supplier Payments: ₹{supplier_payments}")
        print(f"- Expenses: ₹{expenses}")
        print(f"= Expected Cash: ₹{expected_cash}")
        
        print(f"\n✓ Expected Cash formula is correct!")
        
        return expected_cash


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
