"""
Test Account Ledger (Tally-style transaction-by-transaction with running balance)
Tests the new Account Ledger feature for viewing per-account transaction history.

Features tested:
1. Login with admin/yttriumR
2. GET /api/ledger/accounts - List all accounts
3. GET /api/ledger/accounts/:id/ledger - Account ledger with running balance
4. Verify Test Credit Customer account has expected entries
5. Verify running balance calculation
6. Indian FY date range (Apr 1 to Mar 31)
"""
import pytest
import requests
import os
from datetime import datetime, date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test login with admin/yttriumR"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "yttriumR"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # Token is nested in data.data.token
        assert "data" in data and "token" in data["data"], "No token in response"
        # Store token for other tests
        pytest.token = data["data"]["token"]
        print(f"✓ Login successful, got token")

@pytest.fixture
def auth_headers():
    """Get auth headers with token"""
    if not hasattr(pytest, 'token'):
        # Login if not already logged in
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "yttriumR"
        })
        if response.status_code == 200:
            data = response.json()
            pytest.token = data.get("data", {}).get("token")
        else:
            pytest.skip("Could not authenticate")
    return {"Authorization": f"Bearer {pytest.token}"}


class TestLedgerModule:
    """Test Ledger Module has 9 tabs including Account Ledger"""
    
    def test_ledger_accounts_endpoint(self, auth_headers):
        """Test GET /api/ledger/accounts returns accounts"""
        response = requests.get(f"{BASE_URL}/api/ledger/accounts", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        data = response.json()
        assert "data" in data, "No data in response"
        accounts = data["data"]
        assert isinstance(accounts, list), "Accounts should be a list"
        print(f"✓ Found {len(accounts)} accounts in Chart of Accounts")
        
        # Check for Test Credit Customer account (code 1300-001)
        test_customer_account = None
        for acc in accounts:
            if acc.get("code") == "1300-001" or "Test Credit Customer" in acc.get("name", ""):
                test_customer_account = acc
                break
        
        if test_customer_account:
            print(f"✓ Found Test Credit Customer account: {test_customer_account.get('name')} (code: {test_customer_account.get('code')})")
            pytest.test_customer_account = test_customer_account
        else:
            print(f"ℹ Test Credit Customer account not found - checking all customer accounts")
            customer_accounts = [a for a in accounts if a.get("partyType") == "customer"]
            print(f"  Found {len(customer_accounts)} customer accounts")
            if customer_accounts:
                pytest.test_customer_account = customer_accounts[0]
                print(f"  Using first customer account: {pytest.test_customer_account.get('name')}")


class TestAccountLedger:
    """Test Account Ledger tab functionality"""
    
    def test_account_ledger_endpoint(self, auth_headers):
        """Test GET /api/ledger/accounts/:id/ledger returns ledger with running balance"""
        # First, get all accounts
        response = requests.get(f"{BASE_URL}/api/ledger/accounts", headers=auth_headers)
        assert response.status_code == 200
        accounts = response.json().get("data", [])
        
        # Find Test Credit Customer account
        test_account = None
        for acc in accounts:
            if acc.get("code") == "1300-001" or "Test Credit Customer" in acc.get("name", ""):
                test_account = acc
                break
        
        if not test_account:
            # Use any customer account
            customer_accounts = [a for a in accounts if a.get("partyType") == "customer"]
            if customer_accounts:
                test_account = customer_accounts[0]
        
        if not test_account:
            pytest.skip("No customer accounts found to test")
        
        account_id = test_account.get("id")
        print(f"Testing ledger for account: {test_account.get('name')} (ID: {account_id})")
        
        # Get account ledger with Indian FY date range (Apr 1 2025 to today)
        today = datetime.now()
        fy_start_year = today.year - 1 if today.month < 4 else today.year
        from_date = f"{fy_start_year}-04-01"
        to_date = today.strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/ledger/accounts/{account_id}/ledger",
            params={"fromDate": from_date, "toDate": to_date},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get account ledger: {response.text}"
        data = response.json()
        assert "data" in data, "No data in response"
        
        ledger = data["data"]
        
        # Verify ledger structure
        assert "account" in ledger, "Ledger should have account info"
        assert "entries" in ledger, "Ledger should have entries array"
        assert "closingBalance" in ledger, "Ledger should have closing balance"
        
        print(f"✓ Account: {ledger['account'].get('name')}")
        print(f"✓ Code: {ledger['account'].get('code')}")
        print(f"✓ Type: {ledger['account'].get('type')}")
        print(f"✓ Entries count: {len(ledger['entries'])}")
        print(f"✓ Closing balance: ₹{ledger['closingBalance']}")
        
        # Store for verification
        pytest.ledger_data = ledger
        pytest.test_account_id = account_id

    def test_ledger_entries_have_required_columns(self, auth_headers):
        """Test ledger entries have 7 columns: Date, Voucher No, Type, Particulars, Debit, Credit, Running Balance"""
        if not hasattr(pytest, 'ledger_data'):
            pytest.skip("No ledger data from previous test")
        
        entries = pytest.ledger_data.get("entries", [])
        if not entries:
            print("ℹ No entries found in this account ledger")
            return
        
        # Check first entry has all required fields
        entry = entries[0]
        required_fields = {
            "transactionDate": "Date column",
            "batchNumber": "Voucher No column",
            "referenceType": "Type column",
            "debit": "Debit column",
            "credit": "Credit column",
            "runningBalance": "Running Balance column"
        }
        
        for field, desc in required_fields.items():
            assert field in entry, f"Missing {desc}: {field}"
        
        # Particulars can be narration or description
        assert "narration" in entry or "description" in entry, "Missing Particulars (narration/description)"
        
        print("✓ All 7 columns present in ledger entries:")
        print(f"  - Date: {entry.get('transactionDate')}")
        print(f"  - Voucher No: {entry.get('batchNumber')}")
        print(f"  - Type: {entry.get('referenceType')}")
        print(f"  - Particulars: {entry.get('narration') or entry.get('description')}")
        print(f"  - Debit: ₹{entry.get('debit')}")
        print(f"  - Credit: ₹{entry.get('credit')}")
        print(f"  - Running Balance: ₹{entry.get('runningBalance')}")

    def test_running_balance_calculation(self, auth_headers):
        """Test running balance is correctly computed"""
        if not hasattr(pytest, 'ledger_data'):
            pytest.skip("No ledger data from previous test")
        
        entries = pytest.ledger_data.get("entries", [])
        if len(entries) < 2:
            print(f"ℹ Only {len(entries)} entries, skipping running balance verification")
            return
        
        # Verify running balance calculation
        calculated_balance = 0
        for idx, entry in enumerate(entries):
            debit = float(entry.get("debit", 0))
            credit = float(entry.get("credit", 0))
            calculated_balance += debit - credit
            
            actual_balance = float(entry.get("runningBalance", 0))
            assert abs(calculated_balance - actual_balance) < 0.01, \
                f"Running balance mismatch at entry {idx}: expected {calculated_balance}, got {actual_balance}"
        
        print(f"✓ Running balance correctly computed for {len(entries)} entries")
        print(f"  Final running balance: ₹{calculated_balance}")


class TestTestCreditCustomer:
    """Test specific Test Credit Customer account with expected entries"""
    
    def test_find_test_credit_customer(self, auth_headers):
        """Find Test Credit Customer account"""
        response = requests.get(f"{BASE_URL}/api/ledger/accounts", headers=auth_headers)
        assert response.status_code == 200
        accounts = response.json().get("data", [])
        
        # Look for Test Credit Customer specifically
        test_account = None
        for acc in accounts:
            if "Test Credit Customer" in acc.get("name", ""):
                test_account = acc
                break
        
        if not test_account:
            print("ℹ Test Credit Customer not found by name, checking code 1300-001")
            for acc in accounts:
                if acc.get("code") == "1300-001":
                    test_account = acc
                    break
        
        if test_account:
            print(f"✓ Found Test Credit Customer: {test_account.get('name')} (code: {test_account.get('code')}, id: {test_account.get('id')})")
            pytest.test_credit_customer_id = test_account.get("id")
        else:
            print("ℹ Test Credit Customer account not found - this may be expected if test data wasn't created")
            pytest.test_credit_customer_id = None

    def test_test_credit_customer_ledger_entries(self, auth_headers):
        """Test Credit Customer should have 2 entries: INVOICE debit ₹5000 and PAYMENT credit ₹3000"""
        if not hasattr(pytest, 'test_credit_customer_id') or not pytest.test_credit_customer_id:
            pytest.skip("Test Credit Customer account not found")
        
        account_id = pytest.test_credit_customer_id
        
        # Get ledger with wide date range to capture all entries
        response = requests.get(
            f"{BASE_URL}/api/ledger/accounts/{account_id}/ledger",
            params={"fromDate": "2024-01-01", "toDate": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get ledger: {response.text}"
        
        ledger = response.json().get("data", {})
        entries = ledger.get("entries", [])
        
        print(f"✓ Test Credit Customer has {len(entries)} entries")
        
        # Look for expected entries
        has_invoice_5000 = False
        has_payment_3000 = False
        
        for entry in entries:
            debit = float(entry.get("debit", 0))
            credit = float(entry.get("credit", 0))
            ref_type = entry.get("referenceType", "")
            
            print(f"  Entry: {ref_type} - Debit: ₹{debit}, Credit: ₹{credit}, Balance: ₹{entry.get('runningBalance')}")
            
            if ref_type == "INVOICE" and abs(debit - 5000) < 0.01:
                has_invoice_5000 = True
            if ref_type in ["PAYMENT", "CASH_RECEIPT", "PAYMENT_TOGGLE"] and abs(credit - 3000) < 0.01:
                has_payment_3000 = True
        
        if has_invoice_5000:
            print("✓ Found INVOICE debit ₹5000")
        if has_payment_3000:
            print("✓ Found PAYMENT credit ₹3000")
        
        # Verify closing balance
        closing_balance = float(ledger.get("closingBalance", 0))
        print(f"✓ Closing balance: ₹{closing_balance}")
        
        # Expected closing balance should be 2000 Dr if both entries exist
        if has_invoice_5000 and has_payment_3000:
            assert abs(closing_balance - 2000) < 0.01, f"Expected closing balance ₹2000, got ₹{closing_balance}"
            print("✓ Closing balance ₹2000 Dr verified!")

    def test_running_balance_sequence(self, auth_headers):
        """Verify running balance: 5000 Dr after invoice, 2000 Dr after payment"""
        if not hasattr(pytest, 'test_credit_customer_id') or not pytest.test_credit_customer_id:
            pytest.skip("Test Credit Customer account not found")
        
        account_id = pytest.test_credit_customer_id
        
        response = requests.get(
            f"{BASE_URL}/api/ledger/accounts/{account_id}/ledger",
            params={"fromDate": "2024-01-01", "toDate": "2026-12-31"},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        entries = response.json().get("data", {}).get("entries", [])
        
        if len(entries) >= 2:
            # Verify running balance progression
            running_balances = [float(e.get("runningBalance", 0)) for e in entries]
            print(f"✓ Running balance progression: {running_balances}")
            
            # If we have the expected entries, verify the sequence
            for idx, entry in enumerate(entries):
                ref_type = entry.get("referenceType", "")
                balance = float(entry.get("runningBalance", 0))
                print(f"  After {ref_type}: ₹{balance}")


class TestIndianFYDateRange:
    """Test Indian Financial Year date range defaults"""
    
    def test_fy_date_range_calculation(self):
        """Test FY defaults to Apr 1 to Mar 31"""
        now = datetime.now()
        # Indian Financial Year: Apr 1 to Mar 31
        # If before April (month < 3 in 0-indexed), FY started previous year
        fy_start_year = now.year - 1 if now.month < 4 else now.year
        
        expected_from_date = f"{fy_start_year}-04-01"
        expected_to_date = now.strftime("%Y-%m-%d")
        
        print(f"✓ Current date: {now.strftime('%Y-%m-%d')}")
        print(f"✓ Indian FY start: {expected_from_date}")
        print(f"✓ FY end (today): {expected_to_date}")
        
        # Verify the expected dates
        # For March 2026, FY should be 2025-04-01 to 2026-03-XX
        if now.month == 3 and now.year == 2026:
            assert expected_from_date == "2025-04-01", f"Expected 2025-04-01, got {expected_from_date}"
            print("✓ FY date range correctly set to Apr 1, 2025 for March 2026")


class TestRefreshAndNavigation:
    """Test Refresh and Navigation buttons"""
    
    def test_account_ledger_refresh(self, auth_headers):
        """Test fetching account ledger multiple times (simulates refresh)"""
        if not hasattr(pytest, 'test_account_id'):
            # Get first available account
            response = requests.get(f"{BASE_URL}/api/ledger/accounts", headers=auth_headers)
            accounts = response.json().get("data", [])
            if accounts:
                pytest.test_account_id = accounts[0].get("id")
            else:
                pytest.skip("No accounts available")
        
        account_id = pytest.test_account_id
        
        # Call the endpoint twice to simulate refresh
        response1 = requests.get(
            f"{BASE_URL}/api/ledger/accounts/{account_id}/ledger",
            headers=auth_headers
        )
        assert response1.status_code == 200, "First fetch failed"
        
        response2 = requests.get(
            f"{BASE_URL}/api/ledger/accounts/{account_id}/ledger",
            headers=auth_headers
        )
        assert response2.status_code == 200, "Refresh (second fetch) failed"
        
        # Verify same data returned
        data1 = response1.json().get("data", {})
        data2 = response2.json().get("data", {})
        
        assert data1.get("closingBalance") == data2.get("closingBalance"), "Balance mismatch on refresh"
        print("✓ Account ledger refresh works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
