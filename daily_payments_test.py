#!/usr/bin/env python3
"""
Daily Payments API Testing for Invoice App
Tests the newly implemented Daily Payments API endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL
BASE_URL = "http://localhost:8001/api"

class DailyPaymentsTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_results = []
        self.auth_token = None
        
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
        headers = {}
        
        # Add authentication header if token is available
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'
            
        try:
            if method.upper() == 'GET':
                response = requests.get(url, params=params, headers=headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            return None, str(e)
    
    def authenticate(self):
        """Authenticate and get JWT token"""
        print("\n=== AUTHENTICATION ===")
        
        # Check if setup is required
        response = self.make_request('GET', '/auth/setup-check')
        if response and response.status_code == 200:
            response_json = response.json()
            setup_required = response_json.get('data', {}).get('setupRequired', False)
            
            if setup_required:
                # Setup admin user
                setup_data = {
                    "username": "admin",
                    "password": "admin123",
                    "name": "Administrator",
                    "email": "admin@example.com"
                }
                
                setup_response = self.make_request('POST', '/auth/setup', setup_data)
                if setup_response and setup_response.status_code == 200:
                    self.log_result("System Setup", True, "Admin user setup completed successfully")
                else:
                    if setup_response:
                        error_msg = f"Status {setup_response.status_code}: {setup_response.text}"
                    else:
                        error_msg = "Connection failed"
                    self.log_result("System Setup", False, f"Setup failed: {error_msg}")
                    return False
        
        # Login
        login_data = {
            "username": "admin",
            "password": "admin123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                token = response_json['data'].get('token')
                if token:
                    self.auth_token = token
                    self.log_result("Authentication", True, "Successfully logged in and obtained JWT token")
                    return True
                else:
                    self.log_result("Authentication", False, "Login response missing token", response_json)
            else:
                self.log_result("Authentication", False, "Invalid login response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Authentication", False, f"Login request failed: {error_msg}")
        
        return False

    def test_daily_payments_api(self):
        """Test Daily Payments API endpoints"""
        print("\n=== DAILY PAYMENTS API TESTING ===")
        
        if not self.auth_token:
            self.log_result("Daily Payments API", False, "No authentication token available")
            return
        
        # Test 1: Daily Summary Endpoint with today's date (default)
        response = self.make_request('GET', '/payments/daily-summary')
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                data = response_json['data']
                required_fields = ['date', 'totalCount', 'totalAmount', 'summary', 'byReferenceType', 'payments']
                
                if all(field in data for field in required_fields):
                    # Check summary structure
                    summary = data.get('summary', {})
                    by_ref_type = data.get('byReferenceType', {})
                    
                    if ('customers' in summary and 'suppliers' in summary and 
                        'orders' in by_ref_type and 'purchases' in by_ref_type and 'advances' in by_ref_type):
                        self.log_result("Daily Summary - Default Date", True, 
                                      f"Daily summary retrieved successfully for {data['date']} - Total: {data['totalCount']} payments, Amount: {data['totalAmount']}")
                    else:
                        self.log_result("Daily Summary - Default Date", False, 
                                      "Response missing required summary structure", response_json)
                else:
                    missing_fields = [f for f in required_fields if f not in data]
                    self.log_result("Daily Summary - Default Date", False, 
                                  f"Response missing required fields: {missing_fields}", response_json)
            else:
                self.log_result("Daily Summary - Default Date", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Daily Summary - Default Date", False, f"Request failed: {error_msg}")
        
        # Test 2: Daily Summary with specific date parameter
        test_date = "2025-01-26"
        response = self.make_request('GET', '/payments/daily-summary', params={'date': test_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                data = response_json['data']
                if data.get('date') == test_date:
                    self.log_result("Daily Summary - Specific Date", True, 
                                  f"Daily summary retrieved for specific date {test_date} - Total: {data['totalCount']} payments")
                else:
                    self.log_result("Daily Summary - Specific Date", False, 
                                  f"Expected date {test_date} but got {data.get('date')}", response_json)
            else:
                self.log_result("Daily Summary - Specific Date", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Daily Summary - Specific Date", False, f"Request failed: {error_msg}")
        
        # Test 3: Payments List with date filtering
        response = self.make_request('GET', '/payments', params={'date': test_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payments = response_json['data']
                self.log_result("Payments List - Date Filter", True, 
                              f"Payments list with date filter retrieved successfully - {len(payments)} payments for {test_date}")
            else:
                self.log_result("Payments List - Date Filter", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Payments List - Date Filter", False, f"Request failed: {error_msg}")
        
        # Test 4: Payments List with date range filtering
        start_date = "2025-01-01"
        end_date = "2025-01-26"
        response = self.make_request('GET', '/payments', params={'startDate': start_date, 'endDate': end_date})
        if response and response.status_code == 200:
            response_json = response.json()
            if response_json.get('status') == 200 and 'data' in response_json:
                payments = response_json['data']
                self.log_result("Payments List - Date Range Filter", True, 
                              f"Payments list with date range filter retrieved successfully - {len(payments)} payments from {start_date} to {end_date}")
            else:
                self.log_result("Payments List - Date Range Filter", False, "Invalid response structure", response_json)
        else:
            error_msg = response.text if response else "Connection failed"
            self.log_result("Payments List - Date Range Filter", False, f"Request failed: {error_msg}")
        
        # Test 5: Test with invalid date format
        invalid_date = "invalid-date"
        response = self.make_request('GET', '/payments/daily-summary', params={'date': invalid_date})
        if response:
            if response.status_code == 400:
                self.log_result("Daily Summary - Invalid Date", True, 
                              "Correctly rejected invalid date format with 400 error")
            elif response.status_code == 200:
                # Some APIs might handle invalid dates gracefully
                self.log_result("Daily Summary - Invalid Date", True, 
                              "API handled invalid date gracefully")
            else:
                self.log_result("Daily Summary - Invalid Date", False, 
                              f"Unexpected status code {response.status_code} for invalid date")
        else:
            self.log_result("Daily Summary - Invalid Date", False, "Connection failed")
    
    def run_tests(self):
        """Run all Daily Payments API tests"""
        print(f"Starting Daily Payments API testing...")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # First authenticate
        if not self.authenticate():
            print("❌ CRITICAL: Authentication failed. Cannot proceed with protected endpoints.")
            self.print_summary()
            return
        
        # Test Daily Payments API
        self.test_daily_payments_api()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("DAILY PAYMENTS API TESTING SUMMARY")
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
    tester = DailyPaymentsTester()
    tester.run_tests()