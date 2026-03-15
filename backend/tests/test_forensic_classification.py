"""
Forensic Classification Tests - Iteration 23
Tests for the new forensic classification feature that:
1. Classifies ALL orders into 5 categories based on payment evidence
2. Provides dry-run repair preview
3. Executes repairs with audit trail
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAuth:
    """Authentication tests"""

    def test_login_success(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "yttriumR"
        })
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "token" in data["data"]
        assert data["data"]["user"]["role"] == "admin"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for subsequent tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "yttriumR"
    })
    if response.status_code == 200:
        return response.json()["data"]["token"]
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestClassifyEndpoint:
    """GET /api/data-audit/classify tests"""

    def test_classify_returns_200(self, auth_headers):
        """Classification endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        assert response.status_code == 200

    def test_classify_has_total_orders(self, auth_headers):
        """Response has totalOrders count"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        assert "totalOrders" in data
        assert isinstance(data["totalOrders"], int)
        assert data["totalOrders"] >= 0

    def test_classify_has_total_needs_repair(self, auth_headers):
        """Response has totalNeedsRepair count"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        assert "totalNeedsRepair" in data
        assert isinstance(data["totalNeedsRepair"], int)

    def test_classify_has_5_categories_in_summary(self, auth_headers):
        """Summary has exactly 5 main categories"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        assert "summary" in data
        expected_categories = ["RECEIPT_PAID", "PARTIAL_PAID", "CASH_SALE", "CREDIT_UNPAID", "SUSPICIOUS_PAID"]
        for cat in expected_categories:
            assert cat in data["summary"], f"Missing category: {cat}"

    def test_classify_category_has_count_value_repair(self, auth_headers):
        """Each category has count, totalValue, needsRepair"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for cat in ["RECEIPT_PAID", "PARTIAL_PAID", "CASH_SALE", "CREDIT_UNPAID", "SUSPICIOUS_PAID"]:
            cat_data = data["summary"][cat]
            assert "count" in cat_data
            assert "totalValue" in cat_data
            assert "needsRepair" in cat_data

    def test_classify_has_categories_with_details(self, auth_headers):
        """categories section has arrays with order details"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        assert "categories" in data
        for cat in ["RECEIPT_PAID", "PARTIAL_PAID", "CASH_SALE", "CREDIT_UNPAID", "SUSPICIOUS_PAID"]:
            assert cat in data["categories"]
            assert isinstance(data["categories"][cat], list)

    def test_classify_order_has_expected_fields(self, auth_headers):
        """Each order in categories has required fields"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        # Find a category with orders
        for cat in data["categories"]:
            if len(data["categories"][cat]) > 0:
                order = data["categories"][cat][0]
                assert "orderId" in order
                assert "orderNumber" in order
                assert "total" in order
                assert "current" in order
                assert "expected" in order
                assert "evidence" in order
                assert "fieldCorrect" in order
                assert "needsRepair" in order
                break

    def test_classify_current_has_payment_fields(self, auth_headers):
        """current object has paidAmount, dueAmount, paymentStatus"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for cat in data["categories"]:
            if len(data["categories"][cat]) > 0:
                order = data["categories"][cat][0]
                assert "paidAmount" in order["current"]
                assert "dueAmount" in order["current"]
                assert "paymentStatus" in order["current"]
                break

    def test_classify_expected_has_payment_fields(self, auth_headers):
        """expected object has paidAmount, dueAmount, paymentStatus"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for cat in data["categories"]:
            if len(data["categories"][cat]) > 0:
                order = data["categories"][cat][0]
                assert "paidAmount" in order["expected"]
                assert "dueAmount" in order["expected"]
                assert "paymentStatus" in order["expected"]
                break

    def test_classify_evidence_has_alloc_fields(self, auth_headers):
        """evidence object has allocTotal and allocCount"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for cat in data["categories"]:
            if len(data["categories"][cat]) > 0:
                order = data["categories"][cat][0]
                assert "allocTotal" in order["evidence"]
                assert "allocCount" in order["evidence"]
                break


class TestRepairPreviewEndpoint:
    """POST /api/data-audit/repair/preview tests"""

    def test_repair_preview_returns_200(self, auth_headers):
        """Repair preview endpoint returns 200"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        assert response.status_code == 200

    def test_repair_preview_has_total_repairs(self, auth_headers):
        """Response has totalRepairs count"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        data = response.json()["data"]
        assert "totalRepairs" in data
        assert isinstance(data["totalRepairs"], int)

    def test_repair_preview_has_repairs_array(self, auth_headers):
        """Response has repairs array"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        data = response.json()["data"]
        assert "repairs" in data
        assert isinstance(data["repairs"], list)

    def test_repair_preview_has_summary(self, auth_headers):
        """Response has summary section"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        data = response.json()["data"]
        assert "summary" in data

    def test_repair_preview_has_by_action(self, auth_headers):
        """Response has byAction breakdown"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        data = response.json()["data"]
        assert "byAction" in data
        # Check expected actions
        expected_actions = ["SET_FROM_ALLOCATIONS", "SET_AS_CASH_SALE", "SET_AS_UNPAID", "RESET_TO_UNPAID", "FIX_FIELD_MISMATCH"]
        for action in expected_actions:
            assert action in data["byAction"]

    def test_repair_preview_only_shows_needs_repair(self, auth_headers):
        """All items in repairs array have needsRepair=true"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", headers=auth_headers, json={})
        data = response.json()["data"]
        for repair in data["repairs"]:
            assert repair.get("needsRepair") == True


class TestRepairExecuteEndpoint:
    """POST /api/data-audit/repair/execute tests"""

    def test_repair_execute_requires_changed_by(self, auth_headers):
        """Execute without changedBy returns 400"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", headers=auth_headers, json={})
        assert response.status_code == 400
        assert "changedBy" in response.json()["message"]

    def test_repair_execute_rejects_empty_changed_by(self, auth_headers):
        """Execute with empty changedBy returns 400"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", headers=auth_headers, json={"changedBy": ""})
        assert response.status_code == 400

    def test_repair_execute_rejects_whitespace_changed_by(self, auth_headers):
        """Execute with whitespace-only changedBy returns 400"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", headers=auth_headers, json={"changedBy": "   "})
        assert response.status_code == 400

    def test_repair_execute_with_valid_changed_by(self, auth_headers):
        """Execute with valid changedBy returns 200"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", headers=auth_headers, json={"changedBy": "TestAgent"})
        assert response.status_code == 200
        data = response.json()["data"]
        assert "totalRepaired" in data

    def test_repair_execute_returns_validation(self, auth_headers):
        """Execute returns validation results when repairs happen, or totalRepaired when nothing to repair"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", headers=auth_headers, json={"changedBy": "TestAgent"})
        assert response.status_code == 200
        data = response.json()["data"]
        assert "totalRepaired" in data
        # When repairs happen, validation is included
        if data["totalRepaired"] > 0:
            assert "validation" in data
            if data["validation"]:
                assert "allPassed" in data["validation"]
                assert "checks" in data["validation"]


class TestAuthRequired:
    """Test that endpoints require authentication"""

    def test_classify_requires_auth(self):
        """Classify endpoint requires auth"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify")
        assert response.status_code == 401

    def test_repair_preview_requires_auth(self):
        """Repair preview endpoint requires auth"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/preview", json={})
        assert response.status_code == 401

    def test_repair_execute_requires_auth(self):
        """Repair execute endpoint requires auth"""
        response = requests.post(f"{BASE_URL}/api/data-audit/repair/execute", json={"changedBy": "test"})
        assert response.status_code == 401


class TestClassificationLogic:
    """Tests for classification logic correctness"""

    def test_receipt_paid_has_allocations_gte_total(self, auth_headers):
        """RECEIPT_PAID orders have allocTotal >= total"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for order in data["categories"]["RECEIPT_PAID"]:
            assert order["evidence"]["allocTotal"] >= order["total"], \
                f"RECEIPT_PAID {order['orderNumber']} has allocTotal {order['evidence']['allocTotal']} < total {order['total']}"

    def test_partial_paid_has_partial_allocations(self, auth_headers):
        """PARTIAL_PAID orders have 0 < allocTotal < total"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for order in data["categories"]["PARTIAL_PAID"]:
            assert 0 < order["evidence"]["allocTotal"] < order["total"], \
                f"PARTIAL_PAID {order['orderNumber']} has invalid allocTotal {order['evidence']['allocTotal']} for total {order['total']}"

    def test_credit_unpaid_has_no_allocations(self, auth_headers):
        """CREDIT_UNPAID orders have zero allocations"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for order in data["categories"]["CREDIT_UNPAID"]:
            assert order["evidence"]["allocTotal"] == 0, \
                f"CREDIT_UNPAID {order['orderNumber']} has allocTotal {order['evidence']['allocTotal']}"

    def test_suspicious_paid_has_no_evidence(self, auth_headers):
        """SUSPICIOUS_PAID orders have zero evidence (alloc, payment, toggle)"""
        response = requests.get(f"{BASE_URL}/api/data-audit/classify", headers=auth_headers)
        data = response.json()["data"]
        for order in data["categories"]["SUSPICIOUS_PAID"]:
            evidence = order["evidence"]
            assert evidence["allocTotal"] == 0
            assert evidence["payTotal"] == 0
            assert evidence["toggleLogCount"] == 0
            assert evidence["toggleJournalCount"] == 0
