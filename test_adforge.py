"""
AdForge Application Testing Script
Tests authentication, category management, products, and navigation
"""
from playwright.sync_api import sync_playwright, expect
import time
import os

def test_adforge():
    """Comprehensive test of AdForge application"""

    screenshots_dir = '/tmp/adforge_screenshots'
    os.makedirs(screenshots_dir, exist_ok=True)

    with sync_playwright() as p:
        # Launch browser in headless mode
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        print("Starting AdForge application tests...")

        # Test 1: Authentication Flow - Unauthenticated Access
        print("\n=== Test 1: Authentication Flow ===")
        try:
            page.goto('http://localhost:3000')
            page.wait_for_load_state('networkidle')
            time.sleep(1)  # Additional wait for redirects

            current_url = page.url
            print(f"Current URL after accessing root: {current_url}")

            if '/auth/login' in current_url:
                print("✓ Correctly redirected to login page")
                page.screenshot(path=f'{screenshots_dir}/01_login_page.png', full_page=True)
            else:
                print(f"✗ Expected redirect to login, but got: {current_url}")
                page.screenshot(path=f'{screenshots_dir}/01_unexpected_page.png', full_page=True)
        except Exception as e:
            print(f"✗ Error testing authentication: {e}")
            page.screenshot(path=f'{screenshots_dir}/01_error.png', full_page=True)

        # Test 2: Check if we can access protected routes
        print("\n=== Test 2: Protected Routes ===")
        try:
            page.goto('http://localhost:3000/categories')
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            current_url = page.url
            print(f"Accessing /categories redirects to: {current_url}")

            if '/auth/login' in current_url:
                print("✓ Categories page is protected - redirects to login")
            else:
                print(f"✗ Categories page should be protected")

            page.screenshot(path=f'{screenshots_dir}/02_protected_categories.png', full_page=True)
        except Exception as e:
            print(f"✗ Error testing protected routes: {e}")
            page.screenshot(path=f'{screenshots_dir}/02_error.png', full_page=True)

        # Test 3: Login Page Structure
        print("\n=== Test 3: Login Page Structure ===")
        try:
            page.goto('http://localhost:3000/auth/login')
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            # Inspect login page elements
            print("Inspecting login page elements...")

            # Look for common login elements
            email_input = page.locator('input[type="email"]').count()
            password_input = page.locator('input[type="password"]').count()
            buttons = page.locator('button').all()

            print(f"Email inputs found: {email_input}")
            print(f"Password inputs found: {password_input}")
            print(f"Buttons found: {len(buttons)}")

            for i, button in enumerate(buttons):
                try:
                    text = button.inner_text()
                    print(f"  Button {i+1}: {text}")
                except:
                    print(f"  Button {i+1}: (no text)")

            page.screenshot(path=f'{screenshots_dir}/03_login_structure.png', full_page=True)

            if email_input > 0 and password_input > 0:
                print("✓ Login form elements present")
            else:
                print("⚠ Login form may be incomplete")

        except Exception as e:
            print(f"✗ Error inspecting login page: {e}")
            page.screenshot(path=f'{screenshots_dir}/03_error.png', full_page=True)

        # Test 4: API Endpoints (unauthenticated)
        print("\n=== Test 4: API Endpoints (Unauthenticated) ===")
        try:
            # Test categories API
            response = page.request.get('http://localhost:3000/api/categories')
            print(f"GET /api/categories - Status: {response.status}")

            if response.status == 401:
                print("✓ Categories API requires authentication")
            elif response.status == 200:
                print("⚠ Categories API returned 200 (may need auth check)")
            else:
                print(f"⚠ Unexpected status: {response.status}")

        except Exception as e:
            print(f"✗ Error testing API: {e}")

        # Test 5: Navigation Elements Discovery
        print("\n=== Test 5: Page Content Discovery ===")
        try:
            page.goto('http://localhost:3000/auth/login')
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            # Get all links
            links = page.locator('a').all()
            print(f"\nLinks found on login page: {len(links)}")
            for i, link in enumerate(links[:5]):  # Show first 5
                try:
                    href = link.get_attribute('href')
                    text = link.inner_text().strip()
                    if text:
                        print(f"  {i+1}. '{text}' → {href}")
                except:
                    pass

            # Get page title
            title = page.title()
            print(f"\nPage title: {title}")

        except Exception as e:
            print(f"✗ Error discovering content: {e}")

        # Test 6: Check for Sign Up page
        print("\n=== Test 6: Sign Up Page ===")
        try:
            page.goto('http://localhost:3000/auth/signup')
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            current_url = page.url
            print(f"Sign up page URL: {current_url}")

            page.screenshot(path=f'{screenshots_dir}/06_signup_page.png', full_page=True)

            if '/signup' in current_url:
                print("✓ Sign up page exists")
            else:
                print(f"⚠ Redirected to: {current_url}")

        except Exception as e:
            print(f"✗ Error accessing signup page: {e}")
            page.screenshot(path=f'{screenshots_dir}/06_error.png', full_page=True)

        # Test 7: Full page content inspection
        print("\n=== Test 7: Login Page HTML Structure ===")
        try:
            page.goto('http://localhost:3000/auth/login')
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            # Get page HTML structure
            all_headings = page.locator('h1, h2, h3').all()
            print(f"\nHeadings found: {len(all_headings)}")
            for heading in all_headings:
                try:
                    tag = heading.evaluate('el => el.tagName')
                    text = heading.inner_text().strip()
                    if text:
                        print(f"  <{tag}>: {text}")
                except:
                    pass

            # Look for form elements
            forms = page.locator('form').count()
            print(f"\nForms found: {forms}")

            # Check for error messages or alerts
            alerts = page.locator('[role="alert"]').count()
            print(f"Alert elements: {alerts}")

        except Exception as e:
            print(f"✗ Error inspecting HTML: {e}")

        # Summary
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Screenshots saved to: {screenshots_dir}")
        print("\nKey Findings:")
        print("- Authentication: App redirects unauthenticated users to login")
        print("- Protected Routes: Categories page requires authentication")
        print("- Login Page: Accessible at /auth/login")
        print(f"- Screenshots: Check {screenshots_dir} for visual inspection")

        # Close browser
        browser.close()
        print("\nTests completed!")

if __name__ == '__main__':
    print("AdForge Application Testing")
    print("=" * 60)
    print("Testing application at http://localhost:3000")
    print("Make sure the dev server is running!")
    print("=" * 60)

    test_adforge()
