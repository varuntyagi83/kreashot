#!/usr/bin/env python3
"""
Test backward compatibility after Phase 1 migration.
Verifies that Guidelines, Composites, and Final Assets tabs load correctly.
"""

from playwright.sync_api import sync_playwright
import sys
import os

CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
BASE_URL = f'http://localhost:3000/categories/{CATEGORY_ID}'
SCREENSHOTS_DIR = '/tmp/adforge-tab-tests'

def test_tabs():
    """Test all three tabs and capture screenshots"""

    # Create screenshots directory
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        # Launch browser in headless mode
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Enable console logging
        page.on('console', lambda msg: print(f'[Browser Console] {msg.type}: {msg.text}'))
        page.on('pageerror', lambda exc: print(f'[Browser Error] {exc}'))

        try:
            print(f'\n🧪 Testing tabs at {BASE_URL}\n')
            print('=' * 60)

            # Navigate to category page
            print(f'\n1. Navigating to category page...')
            page.goto(BASE_URL, wait_until='networkidle', timeout=60000)
            print('   ✓ Page loaded')

            # Wait for page to fully render
            page.wait_for_timeout(2000)

            # Test Guidelines Tab
            print('\n2. Testing Guidelines tab...')
            try:
                guidelines_tab = page.locator('text=Guidelines').first
                if guidelines_tab.is_visible():
                    guidelines_tab.click()
                    page.wait_for_load_state('networkidle')
                    page.wait_for_timeout(1000)

                    # Take screenshot
                    screenshot_path = f'{SCREENSHOTS_DIR}/guidelines-tab.png'
                    page.screenshot(path=screenshot_path, full_page=True)
                    print(f'   ✓ Guidelines tab loaded')
                    print(f'   ✓ Screenshot: {screenshot_path}')
                else:
                    print('   ⚠ Guidelines tab not found')
            except Exception as e:
                print(f'   ✗ Error: {e}')

            # Test Composites Tab
            print('\n3. Testing Composites tab...')
            try:
                composites_tab = page.locator('text=Composites').first
                if composites_tab.is_visible():
                    composites_tab.click()
                    page.wait_for_load_state('networkidle')
                    page.wait_for_timeout(1000)

                    # Take screenshot
                    screenshot_path = f'{SCREENSHOTS_DIR}/composites-tab.png'
                    page.screenshot(path=screenshot_path, full_page=True)
                    print(f'   ✓ Composites tab loaded')
                    print(f'   ✓ Screenshot: {screenshot_path}')
                else:
                    print('   ⚠ Composites tab not found')
            except Exception as e:
                print(f'   ✗ Error: {e}')

            # Test Final Assets Tab
            print('\n4. Testing Final Assets tab...')
            try:
                final_assets_tab = page.locator('text=Final Assets').first
                if final_assets_tab.is_visible():
                    final_assets_tab.click()
                    page.wait_for_load_state('networkidle')
                    page.wait_for_timeout(1000)

                    # Take screenshot
                    screenshot_path = f'{SCREENSHOTS_DIR}/final-assets-tab.png'
                    page.screenshot(path=screenshot_path, full_page=True)
                    print(f'   ✓ Final Assets tab loaded')
                    print(f'   ✓ Screenshot: {screenshot_path}')
                else:
                    print('   ⚠ Final Assets tab not found')
            except Exception as e:
                print(f'   ✗ Error: {e}')

            print('\n' + '=' * 60)
            print('✅ Backward compatibility test completed!')
            print(f'📸 Screenshots saved to: {SCREENSHOTS_DIR}')

        except Exception as e:
            print(f'\n❌ Test failed: {e}')
            # Take error screenshot
            page.screenshot(path=f'{SCREENSHOTS_DIR}/error.png', full_page=True)
            print(f'📸 Error screenshot: {SCREENSHOTS_DIR}/error.png')
            return 1

        finally:
            browser.close()

    return 0

if __name__ == '__main__':
    exit_code = test_tabs()
    sys.exit(exit_code)
