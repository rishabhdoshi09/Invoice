"""
Forensic Audit Tool Testing
Tests the new forensic audit endpoints for the double-entry accounting ledger.

Modules tested:
- GET /api/data-audit/forensic — forensic scan returning contradictions, paidWithoutEvidence, changeAttribution
- POST /api/data-audit/fix — fix selected orders with audit trail
- Backward compat: GET /api/data-audit/reconstruct — delegates to forensicScan
- Backward compat: POST /api/data-audit/reconstruct — delegates to fixSelectedOrders
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "yttriumR"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "data" in data, "Response missing data field"
        assert "token" in data["data"], "Response missing token in data"
        return data["data"]["token"]
    
    def test_login_success(self, auth_token):
        """Verify login returns valid token"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✓ Login successful, got token")


class TestForensicScan:
    """GET /api/data-audit/forensic endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_header(self):
        """Get auth header"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "yttriumR"},
            headers={"Content-Type": "application/json"}
        )
        token = response.json()["data"]["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_forensic_scan_returns_200(self, auth_header):
        """Verify forensic scan endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ GET /api/data-audit/forensic returns 200")
    
    def test_forensic_scan_response_structure(self, auth_header):
        """Verify forensic scan returns correct data structure"""
        response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        data = response.json()
        
        # Verify top-level structure
        assert "status" in data, "Response missing 'status'"
        assert "message" in data, "Response missing 'message'"
        assert "data" in data, "Response missing 'data'"
        
        # Verify data fields
        result = data["data"]
        assert "summary" in result, "Response data missing 'summary'"
        assert "contradictions" in result, "Response data missing 'contradictions'"
        assert "paidWithoutEvidence" in result, "Response data missing 'paidWithoutEvidence'"
        assert "changeAttribution" in result, "Response data missing 'changeAttribution'"
        
        # Verify arrays
        assert isinstance(result["contradictions"], list), "contradictions should be array"
        assert isinstance(result["paidWithoutEvidence"], list), "paidWithoutEvidence should be array"
        assert isinstance(result["changeAttribution"], list), "changeAttribution should be array"
        
        print(f"✓ Forensic scan response has correct structure (summary, contradictions, paidWithoutEvidence, changeAttribution)")
    
    def test_forensic_scan_summary_fields(self, auth_header):
        """Verify summary has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        summary = response.json()["data"]["summary"]
        
        required_fields = [
            "totalScanned",
            "contradictionCount",
            "paidWithoutEvidenceCount",
            "ordersWithToggleLogs"
        ]
        
        for field in required_fields:
            assert field in summary, f"Summary missing '{field}'"
        
        print(f"✓ Summary contains all required fields: {required_fields}")
    
    def test_forensic_scan_paid_without_evidence_structure(self, auth_header):
        """Verify paidWithoutEvidence items have required fields"""
        response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        data = response.json()["data"]
        
        if len(data["paidWithoutEvidence"]) > 0:
            item = data["paidWithoutEvidence"][0]
            required_fields = ["orderId", "orderNumber", "customerName", "total", "paymentStatus", "note"]
            for field in required_fields:
                assert field in item, f"paidWithoutEvidence item missing '{field}'"
            print(f"✓ paidWithoutEvidence items have required fields")
        else:
            print("✓ No paidWithoutEvidence items (clean data)")
    
    def test_forensic_scan_change_attribution_structure(self, auth_header):
        """Verify changeAttribution items have required fields"""
        response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        data = response.json()["data"]
        
        if len(data["changeAttribution"]) > 0:
            item = data["changeAttribution"][0]
            required_fields = ["userName", "totalChanges", "toPaid", "toUnpaid"]
            for field in required_fields:
                assert field in item, f"changeAttribution item missing '{field}'"
            print(f"✓ changeAttribution items have required fields")
        else:
            print("✓ No changeAttribution items (no status changes logged)")


class TestFixSelectedOrders:
    """POST /api/data-audit/fix endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_header(self):
        """Get auth header"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "yttriumR"},
            headers={"Content-Type": "application/json"}
        )
        token = response.json()["data"]["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_fix_requires_changed_by(self, auth_header):
        """Verify fix endpoint requires changedBy field"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={"orderIds": ["test-id"], "action": "reset_to_unpaid"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "changedBy is required" in response.json()["message"]
        print(f"✓ Fix endpoint requires changedBy for audit trail")
    
    def test_fix_requires_order_ids(self, auth_header):
        """Verify fix endpoint requires orderIds array"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={"action": "reset_to_unpaid", "changedBy": "TestUser"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "orderIds array is required" in response.json()["message"]
        print(f"✓ Fix endpoint requires orderIds array")
    
    def test_fix_requires_empty_order_ids(self, auth_header):
        """Verify fix endpoint rejects empty orderIds array"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={"orderIds": [], "action": "reset_to_unpaid", "changedBy": "TestUser"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ Fix endpoint rejects empty orderIds array")
    
    def test_fix_requires_valid_action(self, auth_header):
        """Verify fix endpoint requires valid action"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={"orderIds": ["test-id"], "action": "invalid_action", "changedBy": "TestUser"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "reset_to_unpaid" in response.json()["message"]
        assert "reset_to_paid" in response.json()["message"]
        print(f"✓ Fix endpoint validates action (must be reset_to_unpaid or reset_to_paid)")


class TestBackwardCompatibility:
    """Backward compatibility tests for old reconstruct endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_header(self):
        """Get auth header"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "yttriumR"},
            headers={"Content-Type": "application/json"}
        )
        token = response.json()["data"]["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_get_reconstruct_delegates_to_forensic_scan(self, auth_header):
        """Verify GET /api/data-audit/reconstruct returns same data as forensicScan"""
        # Call forensic endpoint
        forensic_response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        
        # Call reconstruct endpoint (backward compat)
        reconstruct_response = requests.get(
            f"{BASE_URL}/api/data-audit/reconstruct",
            headers=auth_header
        )
        
        assert reconstruct_response.status_code == 200, f"Expected 200, got {reconstruct_response.status_code}"
        
        # Both should have same structure
        forensic_data = forensic_response.json()["data"]
        reconstruct_data = reconstruct_response.json()["data"]
        
        assert "summary" in reconstruct_data, "Reconstruct response missing summary"
        assert "contradictions" in reconstruct_data, "Reconstruct response missing contradictions"
        assert "paidWithoutEvidence" in reconstruct_data, "Reconstruct response missing paidWithoutEvidence"
        assert "changeAttribution" in reconstruct_data, "Reconstruct response missing changeAttribution"
        
        # Counts should match
        assert forensic_data["summary"]["totalScanned"] == reconstruct_data["summary"]["totalScanned"]
        print(f"✓ GET /api/data-audit/reconstruct delegates to forensicScan (backward compat)")
    
    def test_post_reconstruct_delegates_to_fix(self, auth_header):
        """Verify POST /api/data-audit/reconstruct validates like fixSelectedOrders"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/reconstruct",
            headers=auth_header,
            json={"orderIds": ["test-id"], "action": "reset_to_unpaid"}  # Missing changedBy
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "changedBy is required" in response.json()["message"]
        print(f"✓ POST /api/data-audit/reconstruct delegates to fixSelectedOrders (backward compat)")


class TestActualFix:
    """Test actual fix functionality with real data"""
    
    @pytest.fixture(scope="class")
    def auth_header(self):
        """Get auth header"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "yttriumR"},
            headers={"Content-Type": "application/json"}
        )
        token = response.json()["data"]["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_fix_actual_order_reset_to_unpaid(self, auth_header):
        """Test fixing an actual order - reset to unpaid, then back to paid"""
        # First get forensic scan to find a paid-without-evidence order
        scan_response = requests.get(
            f"{BASE_URL}/api/data-audit/forensic",
            headers=auth_header
        )
        data = scan_response.json()["data"]
        
        if len(data["paidWithoutEvidence"]) == 0:
            pytest.skip("No paid-without-evidence orders to test fix")
        
        # Pick the first order to fix
        order = data["paidWithoutEvidence"][0]
        order_id = order["orderId"]
        order_number = order["orderNumber"]
        original_status = order["paymentStatus"]
        
        print(f"Testing fix on order {order_number} (ID: {order_id})")
        
        # Fix to unpaid
        fix_response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={
                "orderIds": [order_id],
                "action": "reset_to_unpaid",
                "changedBy": "TestAgent"
            }
        )
        
        assert fix_response.status_code == 200, f"Fix failed: {fix_response.text}"
        fix_data = fix_response.json()
        
        # Verify response structure
        assert "data" in fix_data, "Fix response missing data"
        assert "totalFixed" in fix_data["data"], "Fix response missing totalFixed"
        assert fix_data["data"]["totalFixed"] == 1, "Should have fixed 1 order"
        
        # Verify the order in response
        fixed_order = fix_data["data"]["orders"][0]
        assert fixed_order["orderId"] == order_id
        assert fixed_order["after"]["paymentStatus"] == "unpaid"
        assert fixed_order["after"]["paidAmount"] == 0
        
        print(f"✓ Fixed {order_number} to UNPAID")
        
        # Fix back to paid
        revert_response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            headers=auth_header,
            json={
                "orderIds": [order_id],
                "action": "reset_to_paid",
                "changedBy": "TestAgent"
            }
        )
        
        assert revert_response.status_code == 200, f"Revert failed: {revert_response.text}"
        revert_data = revert_response.json()
        
        reverted_order = revert_data["data"]["orders"][0]
        assert reverted_order["after"]["paymentStatus"] == "paid"
        
        print(f"✓ Reverted {order_number} back to PAID")
        print(f"✓ Fix endpoint works with audit trail (changedBy: TestAgent)")


class TestAuthRequired:
    """Test that endpoints require authentication"""
    
    def test_forensic_scan_requires_auth(self):
        """Verify forensic scan requires auth"""
        response = requests.get(f"{BASE_URL}/api/data-audit/forensic")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✓ GET /api/data-audit/forensic requires authentication")
    
    def test_fix_requires_auth(self):
        """Verify fix endpoint requires auth"""
        response = requests.post(
            f"{BASE_URL}/api/data-audit/fix",
            json={"orderIds": ["test"], "action": "reset_to_unpaid", "changedBy": "test"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✓ POST /api/data-audit/fix requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
