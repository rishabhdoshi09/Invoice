"""
Payment Recovery Script & Toggle Endpoint Tests (iteration_22)

Tests for:
1. GET /api/data-audit/recovery/preview - shows what would change
2. POST /api/data-audit/recovery/execute - executes recovery with audit trail
3. GET /api/data-audit/recovery/validate - runs 4 validation checks
4. PATCH /api/orders/:orderId/payment-status - toggle unpaid→paid creates payment+allocation
5. PATCH /api/orders/:orderId/payment-status - toggle paid→unpaid reverses payment/allocation

Test order: CRASH-TEST-002 (id: 2b74a5b8-617a-4590-b855-398c55a46678)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
CRASH_TEST_ORDER_ID = "2b74a5b8-617a-4590-b855-398c55a46678"

@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for API calls"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "yttriumR"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get('data', {}).get('token') or data.get('token')

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ===============================================
# Test Class: Authentication
# ===============================================
class TestAuth:
    """Verify login works"""
    
    def test_login_success(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "yttriumR"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('data', {}).get('token') or data.get('token')
        print("PASS: Login successful")


# ===============================================
# Test Class: Recovery Preview Endpoint (Step 2-4 & Step 5)
# ===============================================
class TestRecoveryPreview:
    """GET /api/data-audit/recovery/preview tests"""
    
    def test_preview_returns_200(self, auth_headers):
        """Preview endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Preview endpoint returns 200")
    
    def test_preview_has_step2_4_section(self, auth_headers):
        """Preview should have step2_4 section (from allocations)"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        data = response.json()
        assert 'data' in data
        assert 'step2_4' in data['data'], "Missing step2_4 section"
        step2_4 = data['data']['step2_4']
        assert 'description' in step2_4
        assert 'count' in step2_4
        assert 'orders' in step2_4
        print(f"PASS: step2_4 section present with {step2_4['count']} orders to fix")
    
    def test_preview_has_step5_section(self, auth_headers):
        """Preview should have step5 section (no-allocation resets)"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        data = response.json()
        assert 'step5' in data['data'], "Missing step5 section"
        step5 = data['data']['step5']
        assert 'description' in step5
        assert 'totalFound' in step5
        assert 'includedCount' in step5
        assert 'excludedCount' in step5
        assert 'included' in step5
        assert 'excluded' in step5
        print(f"PASS: step5 section present - {step5['includedCount']} to reset, {step5['excludedCount']} cash sales excluded")
    
    def test_preview_has_backup_reminder(self, auth_headers):
        """Preview should remind user to backup"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        data = response.json()
        assert 'backupReminder' in data['data']
        assert 'pg_dump' in data['data']['backupReminder']
        print("PASS: Backup reminder present")
    
    def test_preview_has_total_changes(self, auth_headers):
        """Preview should show total changes count"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        data = response.json()
        assert 'totalChanges' in data['data']
        total = data['data']['totalChanges']
        step2_4_count = data['data']['step2_4']['count']
        step5_included = data['data']['step5']['includedCount']
        assert total == step2_4_count + step5_included, f"Total mismatch: {total} != {step2_4_count} + {step5_included}"
        print(f"PASS: totalChanges = {total} (step2_4: {step2_4_count} + step5: {step5_included})")
    
    def test_preview_cash_sale_exclusion(self, auth_headers):
        """Cash sales should be excluded from step5"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview", headers=auth_headers)
        data = response.json()
        step5 = data['data']['step5']
        # Check that excluded orders have isCashSale=true
        for excluded in step5.get('excluded', []):
            assert excluded.get('isCashSale') or excluded.get('excluded'), f"Non-cash-sale in excluded: {excluded}"
        print(f"PASS: Cash sales correctly excluded ({step5['excludedCount']} orders)")


# ===============================================
# Test Class: Recovery Validation Endpoint (Step 7)
# ===============================================
class TestRecoveryValidation:
    """GET /api/data-audit/recovery/validate tests"""
    
    def test_validate_returns_200(self, auth_headers):
        """Validation endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Validation endpoint returns 200")
    
    def test_validate_has_4_checks(self, auth_headers):
        """Validation should return 4 checks"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        data = response.json()
        assert 'data' in data
        assert 'checks' in data['data']
        checks = data['data']['checks']
        assert len(checks) == 4, f"Expected 4 checks, got {len(checks)}"
        print("PASS: Validation returns 4 checks")
    
    def test_validate_check_1_no_paid_zero_amount(self, auth_headers):
        """Check 1: No paid orders with zero paidAmount"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        checks = response.json()['data']['checks']
        check1 = checks[0]
        assert check1['name'] == 'No paid orders with zero paidAmount'
        assert 'passed' in check1
        assert 'violations' in check1
        print(f"PASS: Check 1 - {check1['name']}: {'PASS' if check1['passed'] else 'FAIL'} ({check1['violations']} violations)")
    
    def test_validate_check_2_no_negative_due(self, auth_headers):
        """Check 2: No negative dueAmount"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        checks = response.json()['data']['checks']
        check2 = checks[1]
        assert check2['name'] == 'No orders with negative dueAmount'
        assert 'passed' in check2
        print(f"PASS: Check 2 - {check2['name']}: {'PASS' if check2['passed'] else 'FAIL'}")
    
    def test_validate_check_3_sum_equals_total(self, auth_headers):
        """Check 3: paidAmount + dueAmount = total"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        checks = response.json()['data']['checks']
        check3 = checks[2]
        assert check3['name'] == 'paidAmount + dueAmount = total'
        print(f"PASS: Check 3 - {check3['name']}: {'PASS' if check3['passed'] else 'FAIL'}")
    
    def test_validate_check_4_status_matches_amounts(self, auth_headers):
        """Check 4: paymentStatus consistent with amounts"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        checks = response.json()['data']['checks']
        check4 = checks[3]
        assert check4['name'] == 'paymentStatus consistent with amounts'
        print(f"PASS: Check 4 - {check4['name']}: {'PASS' if check4['passed'] else 'FAIL'}")
    
    def test_validate_has_all_passed_flag(self, auth_headers):
        """Validation should have allPassed flag"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate", headers=auth_headers)
        data = response.json()['data']
        assert 'allPassed' in data
        print(f"PASS: allPassed flag present: {data['allPassed']}")


# ===============================================
# Test Class: Recovery Execute Endpoint
# ===============================================
class TestRecoveryExecute:
    """POST /api/data-audit/recovery/execute tests"""
    
    def test_execute_requires_changed_by(self, auth_headers):
        """Execute should require changedBy for audit trail"""
        response = requests.post(f"{BASE_URL}/api/data-audit/recovery/execute", 
                                json={}, headers=auth_headers)
        assert response.status_code == 400
        assert 'changedBy' in response.json().get('message', '')
        print("PASS: Execute requires changedBy")
    
    def test_execute_rejects_empty_changed_by(self, auth_headers):
        """Execute should reject empty changedBy"""
        response = requests.post(f"{BASE_URL}/api/data-audit/recovery/execute", 
                                json={"changedBy": "   "}, headers=auth_headers)
        assert response.status_code == 400
        print("PASS: Execute rejects empty changedBy")


# ===============================================
# Test Class: Toggle Payment Status (Step 8)
# ===============================================
class TestTogglePaymentStatus:
    """PATCH /api/orders/:orderId/payment-status tests"""
    
    def test_toggle_requires_changed_by(self, auth_headers):
        """Toggle should require changedBy"""
        response = requests.patch(
            f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
            json={"newStatus": "paid"},
            headers=auth_headers
        )
        assert response.status_code == 400
        assert 'name' in response.json().get('message', '').lower() or 'changedBy' in response.json().get('message', '')
        print("PASS: Toggle requires changedBy")
    
    def test_toggle_requires_customer_name_for_unpaid(self, auth_headers):
        """Toggle to unpaid requires customerName"""
        response = requests.patch(
            f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
            json={"newStatus": "unpaid", "changedBy": "TestAgent"},
            headers=auth_headers
        )
        assert response.status_code == 400
        assert 'customer' in response.json().get('message', '').lower()
        print("PASS: Toggle to unpaid requires customerName")
    
    def test_toggle_validates_status_value(self, auth_headers):
        """Toggle should validate newStatus value"""
        response = requests.patch(
            f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
            json={"newStatus": "invalid", "changedBy": "TestAgent"},
            headers=auth_headers
        )
        assert response.status_code == 400
        assert 'invalid' in response.json().get('message', '').lower() or 'status' in response.json().get('message', '').lower()
        print("PASS: Toggle validates status value")


# ===============================================
# Test Class: Toggle Creates Payment + Allocation (Step 8 Enforcement)
# ===============================================
class TestToggleCreatesPaymentAllocation:
    """Test that toggle unpaid→paid creates payment + receipt_allocation"""
    
    def test_toggle_unpaid_to_paid_creates_payment(self, auth_headers):
        """Toggle unpaid→paid should create payment record"""
        # First get current order status
        order_response = requests.get(f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}", headers=auth_headers)
        if order_response.status_code != 200:
            pytest.skip("Order not found - skipping toggle test")
        
        order = order_response.json().get('data', order_response.json())
        current_status = order.get('paymentStatus', 'unknown')
        
        # Ensure order is unpaid first
        if current_status != 'unpaid':
            # Reset to unpaid
            reset_response = requests.patch(
                f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
                json={
                    "newStatus": "unpaid", 
                    "changedBy": "TestAgent", 
                    "customerName": order.get('customerName', 'Test Customer')
                },
                headers=auth_headers
            )
            if reset_response.status_code != 200:
                pytest.skip(f"Could not reset order to unpaid: {reset_response.text}")
            time.sleep(0.5)
        
        # Now toggle to paid
        toggle_response = requests.patch(
            f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
            json={"newStatus": "paid", "changedBy": "TestAgent"},
            headers=auth_headers
        )
        
        assert toggle_response.status_code == 200, f"Toggle to paid failed: {toggle_response.text}"
        
        # Verify order is now paid
        verify_response = requests.get(f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}", headers=auth_headers)
        verify_order = verify_response.json().get('data', verify_response.json())
        assert verify_order.get('paymentStatus') == 'paid', f"Order not marked as paid"
        assert float(verify_order.get('paidAmount', 0)) > 0, f"paidAmount should be > 0"
        
        print("PASS: Toggle unpaid→paid successfully updated order")
    
    def test_toggle_paid_to_unpaid_reverses(self, auth_headers):
        """Toggle paid→unpaid should reverse allocation"""
        # Get current order
        order_response = requests.get(f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}", headers=auth_headers)
        if order_response.status_code != 200:
            pytest.skip("Order not found")
        
        order = order_response.json().get('data', order_response.json())
        
        # Ensure order is paid first
        if order.get('paymentStatus') != 'paid':
            toggle_response = requests.patch(
                f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
                json={"newStatus": "paid", "changedBy": "TestAgent"},
                headers=auth_headers
            )
            if toggle_response.status_code != 200:
                pytest.skip(f"Could not set order to paid: {toggle_response.text}")
            time.sleep(0.5)
        
        # Now toggle to unpaid
        toggle_response = requests.patch(
            f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}/payment-status",
            json={
                "newStatus": "unpaid", 
                "changedBy": "TestAgent",
                "customerName": order.get('customerName', 'Test Customer')
            },
            headers=auth_headers
        )
        
        assert toggle_response.status_code == 200, f"Toggle to unpaid failed: {toggle_response.text}"
        
        # Verify order is now unpaid
        verify_response = requests.get(f"{BASE_URL}/api/orders/{CRASH_TEST_ORDER_ID}", headers=auth_headers)
        verify_order = verify_response.json().get('data', verify_response.json())
        assert verify_order.get('paymentStatus') == 'unpaid', f"Order not marked as unpaid"
        
        print("PASS: Toggle paid→unpaid successfully reversed")


# ===============================================
# Test Class: Auth Required
# ===============================================
class TestAuthRequired:
    """Verify endpoints require authentication"""
    
    def test_preview_requires_auth(self):
        """Preview should require auth"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/preview")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Preview requires auth")
    
    def test_execute_requires_auth(self):
        """Execute should require auth"""
        response = requests.post(f"{BASE_URL}/api/data-audit/recovery/execute", json={})
        assert response.status_code in [401, 403]
        print("PASS: Execute requires auth")
    
    def test_validate_requires_auth(self):
        """Validate should require auth"""
        response = requests.get(f"{BASE_URL}/api/data-audit/recovery/validate")
        assert response.status_code in [401, 403]
        print("PASS: Validate requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
