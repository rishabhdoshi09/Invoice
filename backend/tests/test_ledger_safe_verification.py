"""
Safe Verification Mode Tests for Ledger Module
Tests:
- Journal batch validation (unbalanced, negative, empty, single entry, all-zero)
- Health check endpoint (totalDebits, totalCredits, isBalanced)
- DB indexes and foreign keys
- Transaction atomicity
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
AUTH_CREDENTIALS = {"username": "Rishabh", "password": "molybdenumR@99877"}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=AUTH_CREDENTIALS)
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["data"]["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }


@pytest.fixture(scope="module")
def account_ids(auth_headers):
    """Get account IDs for testing journal entries"""
    response = requests.get(f"{BASE_URL}/api/ledger/accounts", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get accounts: {response.text}"
    data = response.json()
    accounts = data["data"]
    
    # Find Cash (1100) and Sales Revenue (4100) accounts
    cash_account = next((a for a in accounts if a["code"] == "1100"), None)
    sales_account = next((a for a in accounts if a["code"] == "4100"), None)
    
    assert cash_account is not None, "Cash account (1100) not found"
    assert sales_account is not None, "Sales account (4100) not found"
    
    return {
        "cash": cash_account["id"],
        "sales": sales_account["id"]
    }


class TestJournalBatchValidation:
    """Test strict validation for journal batches"""

    def test_reject_unbalanced_entries(self, auth_headers, account_ids):
        """MUST reject unbalanced entries (debit != credit)"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_unbalanced_batch",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 100, "credit": 0},
                {"accountId": account_ids["sales"], "debit": 0, "credit": 50}  # Unbalanced!
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        # Should return 500 with error message about balance
        assert response.status_code == 500, f"Expected 500, got {response.status_code}"
        data = response.json()
        assert "not balanced" in data.get("message", "").lower() or "balance" in data.get("message", "").lower(), \
            f"Expected balance error, got: {data}"
        print(f"✓ Unbalanced entries correctly rejected: {data.get('message')}")

    def test_reject_negative_debit(self, auth_headers, account_ids):
        """MUST reject negative debit values"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_negative_debit",
            "entries": [
                {"accountId": account_ids["cash"], "debit": -100, "credit": 0},
                {"accountId": account_ids["sales"], "debit": 0, "credit": -100}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        assert response.status_code == 500, f"Expected 500, got {response.status_code}"
        data = response.json()
        assert "negative" in data.get("message", "").lower(), \
            f"Expected negative value error, got: {data}"
        print(f"✓ Negative debit values correctly rejected: {data.get('message')}")

    def test_reject_negative_credit(self, auth_headers, account_ids):
        """MUST reject negative credit values"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_negative_credit",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 0, "credit": -100},
                {"accountId": account_ids["sales"], "debit": -100, "credit": 0}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        assert response.status_code == 500, f"Expected 500, got {response.status_code}"
        data = response.json()
        assert "negative" in data.get("message", "").lower(), \
            f"Expected negative value error, got: {data}"
        print(f"✓ Negative credit values correctly rejected: {data.get('message')}")

    def test_reject_empty_entries(self, auth_headers, account_ids):
        """MUST reject empty entries array"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_empty_entries",
            "entries": []
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        # Should return 400 (controller check) or 500 (service check)
        assert response.status_code in [400, 500], f"Expected 400/500, got {response.status_code}"
        data = response.json()
        print(f"✓ Empty entries correctly rejected: {data.get('message')}")

    def test_reject_single_entry(self, auth_headers, account_ids):
        """MUST reject single entry (need at least 2 for double-entry)"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_single_entry",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 100, "credit": 0}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        # Should return 400 (controller check) or 500 (service check)
        assert response.status_code in [400, 500], f"Expected 400/500, got {response.status_code}"
        data = response.json()
        assert "2" in data.get("message", "") or "at least" in data.get("message", "").lower(), \
            f"Expected 'at least 2 entries' error, got: {data}"
        print(f"✓ Single entry correctly rejected: {data.get('message')}")

    def test_reject_all_zero_entries(self, auth_headers, account_ids):
        """MUST reject all-zero entries (no monetary values)"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_zero_entries",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 0, "credit": 0},
                {"accountId": account_ids["sales"], "debit": 0, "credit": 0}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        assert response.status_code == 500, f"Expected 500, got {response.status_code}"
        data = response.json()
        assert "no monetary" in data.get("message", "").lower() or "zero" in data.get("message", "").lower(), \
            f"Expected 'no monetary values' error, got: {data}"
        print(f"✓ All-zero entries correctly rejected: {data.get('message')}")

    def test_accept_valid_balanced_entries(self, auth_headers, account_ids):
        """MUST accept valid balanced entries and save atomically"""
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_valid_balanced_batch",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 1000, "credit": 0, "narration": "Test cash in"},
                {"accountId": account_ids["sales"], "debit": 0, "credit": 1000, "narration": "Test sales"}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify batch was created
        assert "data" in data, "Response should contain data"
        batch_data = data["data"]
        assert "batch" in batch_data, "Response should contain batch"
        batch = batch_data["batch"]
        
        assert batch["isBalanced"] == True, "Batch should be marked as balanced"
        assert batch["isPosted"] == True, "Batch should be marked as posted"
        assert float(batch["totalDebit"]) == 1000, f"Total debit should be 1000, got {batch['totalDebit']}"
        assert float(batch["totalCredit"]) == 1000, f"Total credit should be 1000, got {batch['totalCredit']}"
        
        # Verify entries were created
        assert "entries" in batch_data, "Response should contain entries"
        assert len(batch_data["entries"]) == 2, f"Should have 2 entries, got {len(batch_data['entries'])}"
        
        print(f"✓ Valid balanced batch created successfully: {batch['batchNumber']}")
        return batch["id"]


class TestHealthCheckEndpoint:
    """Test health check endpoint returns correct values"""

    def test_health_check_returns_required_fields(self, auth_headers):
        """GET /api/ledger/health-check - MUST return totalDebits, totalCredits, isBalanced"""
        response = requests.get(f"{BASE_URL}/api/ledger/health-check", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "data" in data, "Response should contain data"
        health_data = data["data"]
        
        # Verify required fields
        assert "totalDebits" in health_data, "Response should contain totalDebits"
        assert "totalCredits" in health_data, "Response should contain totalCredits"
        assert "isBalanced" in health_data, "Response should contain isBalanced"
        
        print(f"✓ Health check returned: totalDebits={health_data['totalDebits']}, "
              f"totalCredits={health_data['totalCredits']}, isBalanced={health_data['isBalanced']}")
        
        return health_data

    def test_health_check_is_balanced_when_debits_equal_credits(self, auth_headers):
        """isBalanced must be true when system debits == credits"""
        response = requests.get(f"{BASE_URL}/api/ledger/health-check", headers=auth_headers)
        
        assert response.status_code == 200
        health_data = response.json()["data"]
        
        total_debits = float(health_data["totalDebits"])
        total_credits = float(health_data["totalCredits"])
        is_balanced = health_data["isBalanced"]
        
        # If debits equal credits, isBalanced should be True
        if abs(total_debits - total_credits) < 0.01:
            assert is_balanced == True, f"isBalanced should be True when debits ({total_debits}) == credits ({total_credits})"
            print(f"✓ System is balanced: debits={total_debits}, credits={total_credits}")
        else:
            assert is_balanced == False, f"isBalanced should be False when debits ({total_debits}) != credits ({total_credits})"
            print(f"⚠ System is NOT balanced: debits={total_debits}, credits={total_credits}")

    def test_health_check_requires_authentication(self):
        """Health check should require authentication"""
        response = requests.get(f"{BASE_URL}/api/ledger/health-check")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ Health check correctly requires authentication")


class TestDBIndexes:
    """Test that required indexes exist"""

    def test_ledger_entries_account_id_index_exists(self):
        """DB index should exist on ledger_entries.accountId"""
        import subprocess
        result = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "Rishabh", "-d", "customerInvoice", 
             "-c", "SELECT indexname FROM pg_indexes WHERE tablename='ledger_entries' AND indexname='ledger_entries_account_id';"],
            env={**os.environ, "PGPASSWORD": "yttriumR"},
            capture_output=True, text=True
        )
        assert "ledger_entries_account_id" in result.stdout, "Index ledger_entries_account_id not found"
        print("✓ Index ledger_entries.accountId exists")

    def test_ledger_entries_batch_id_index_exists(self):
        """DB index should exist on ledger_entries.batchId"""
        import subprocess
        result = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "Rishabh", "-d", "customerInvoice", 
             "-c", "SELECT indexname FROM pg_indexes WHERE tablename='ledger_entries' AND indexname='ledger_entries_batch_id';"],
            env={**os.environ, "PGPASSWORD": "yttriumR"},
            capture_output=True, text=True
        )
        assert "ledger_entries_batch_id" in result.stdout, "Index ledger_entries_batch_id not found"
        print("✓ Index ledger_entries.batchId exists")

    def test_journal_batches_reference_type_index_exists(self):
        """DB index should exist on journal_batches.referenceType"""
        import subprocess
        result = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "Rishabh", "-d", "customerInvoice", 
             "-c", "SELECT indexname FROM pg_indexes WHERE tablename='journal_batches' AND indexname='journal_batches_reference_type';"],
            env={**os.environ, "PGPASSWORD": "yttriumR"},
            capture_output=True, text=True
        )
        assert "journal_batches_reference_type" in result.stdout, "Index journal_batches_reference_type not found"
        print("✓ Index journal_batches.referenceType exists")


class TestDBForeignKeys:
    """Test that required foreign keys exist"""

    def test_ledger_entries_account_id_fk_exists(self):
        """Foreign key should exist: ledger_entries.accountId -> accounts.id"""
        import subprocess
        result = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "Rishabh", "-d", "customerInvoice", 
             "-c", """SELECT constraint_name FROM information_schema.table_constraints 
                     WHERE table_name='ledger_entries' AND constraint_type='FOREIGN KEY' 
                     AND constraint_name LIKE '%accountId%';"""],
            env={**os.environ, "PGPASSWORD": "yttriumR"},
            capture_output=True, text=True
        )
        assert "accountId" in result.stdout, f"FK ledger_entries.accountId -> accounts.id not found: {result.stdout}"
        print("✓ FK ledger_entries.accountId -> accounts.id exists")

    def test_ledger_entries_batch_id_fk_exists(self):
        """Foreign key should exist: ledger_entries.batchId -> journal_batches.id"""
        import subprocess
        result = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "Rishabh", "-d", "customerInvoice", 
             "-c", """SELECT constraint_name FROM information_schema.table_constraints 
                     WHERE table_name='ledger_entries' AND constraint_type='FOREIGN KEY' 
                     AND constraint_name LIKE '%batchId%';"""],
            env={**os.environ, "PGPASSWORD": "yttriumR"},
            capture_output=True, text=True
        )
        assert "batchId" in result.stdout, f"FK ledger_entries.batchId -> journal_batches.id not found: {result.stdout}"
        print("✓ FK ledger_entries.batchId -> journal_batches.id exists")


class TestTransactionAtomicity:
    """Test that transactions are atomic"""

    def test_failed_entry_rolls_back_batch(self, auth_headers, account_ids):
        """If an entry insert fails, the batch should also roll back"""
        # Use an invalid accountId that doesn't exist to trigger a failure
        invalid_account_id = "00000000-0000-0000-0000-000000000000"
        
        payload = {
            "referenceType": "ADJUSTMENT",
            "description": "TEST_atomicity_batch",
            "entries": [
                {"accountId": account_ids["cash"], "debit": 500, "credit": 0},
                {"accountId": invalid_account_id, "debit": 0, "credit": 500}  # Invalid account
            ]
        }
        
        # Get current batch count
        list_response = requests.get(f"{BASE_URL}/api/ledger/journal-batches", headers=auth_headers)
        initial_count = list_response.json()["data"]["total"]
        
        # Try to create batch with invalid entry
        response = requests.post(f"{BASE_URL}/api/ledger/journal-batches", 
                                  json=payload, headers=auth_headers)
        
        # Should fail (FK constraint violation)
        assert response.status_code == 500, f"Expected 500 for FK violation, got {response.status_code}"
        
        # Verify no new batch was created (transaction rolled back)
        list_response_after = requests.get(f"{BASE_URL}/api/ledger/journal-batches", headers=auth_headers)
        final_count = list_response_after.json()["data"]["total"]
        
        # The TEST batch should not exist
        assert final_count == initial_count, \
            f"Batch count should remain {initial_count} after rollback, got {final_count}"
        print("✓ Transaction atomicity verified: failed entry rolled back entire batch")


class TestCleanup:
    """Cleanup test data after all tests"""
    
    def test_cleanup_test_batches(self, auth_headers):
        """Remove TEST_ prefixed batches created during testing"""
        # List batches
        response = requests.get(f"{BASE_URL}/api/ledger/journal-batches?limit=100", headers=auth_headers)
        if response.status_code == 200:
            batches = response.json()["data"]["batches"]
            test_batches = [b for b in batches if b.get("description", "").startswith("TEST_")]
            print(f"Found {len(test_batches)} test batches to note (not deleting to preserve audit trail)")
        print("✓ Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
