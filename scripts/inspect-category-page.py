#!/usr/bin/env python3
"""
Inspect the category page to understand its structure
"""

from playwright.sync_api import sync_playwright
import sys

CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
BASE_URL = f'http://localhost:3000/categories/{CATEGORY_ID}'

def inspect_page():
    """Inspect page structure and take screenshots"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Enable console logging
        page.on('console', lambda msg: print(f'[Browser] {msg.type}: {msg.text}'))
        page.on('pageerror', lambda exc: print(f'[Error] {exc}'))

        try:
            print(f'\n🔍 Inspecting {BASE_URL}\n')

            # Navigate
            print('1. Navigating...')
            page.goto(BASE_URL, wait_until='networkidle', timeout=60000)
            page.wait_for_timeout(2000)
            print('   ✓ Loaded')

            # Take initial screenshot
            page.screenshot(path='/tmp/category-page-initial.png', full_page=True)
            print('   ✓ Screenshot: /tmp/category-page-initial.png')

            # Find all buttons
            print('\n2. Finding all buttons...')
            buttons = page.locator('button').all()
            print(f'   Found {len(buttons)} buttons:')
            for i, btn in enumerate(buttons[:10]):  # Show first 10
                text = btn.inner_text() if btn.is_visible() else '[hidden]'
                print(f'     {i+1}. "{text}"')

            # Find all tabs/links
            print('\n3. Finding navigation elements...')
            tabs = page.locator('[role="tab"], [role="tablist"] *, nav a, nav button').all()
            print(f'   Found {len(tabs)} tab-like elements:')
            for i, tab in enumerate(tabs[:10]):
                text = tab.inner_text() if tab.is_visible() else '[hidden]'
                print(f'     {i+1}. "{text}"')

            # Get page title
            print(f'\n4. Page title: {page.title()}')

            # Check for specific text
            print('\n5. Searching for key text...')
            for text in ['Guidelines', 'Composites', 'Final Assets', 'Templates', 'Products']:
                found = page.get_by_text(text, exact=False).count()
                print(f'   "{text}": {found} matches')

            print('\n✅ Inspection complete!')

        except Exception as e:
            print(f'\n❌ Error: {e}')
            page.screenshot(path='/tmp/category-page-error.png', full_page=True)
            return 1
        finally:
            browser.close()

    return 0

if __name__ == '__main__':
    exit_code = inspect_page()
    sys.exit(exit_code)
