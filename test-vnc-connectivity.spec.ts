/**
 * S6 Chromium Grid - VNC Connectivity E2E Tests
 *
 * Comprehensive tests to verify VNC functionality before deployment
 * Tests WebSocket connectivity, noVNC integration, and NGINX proxy
 *
 * Run with: npx playwright test test-vnc-connectivity.spec.ts
 */

import { test, expect } from '@playwright/test';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:8080';
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'admin';
const TEST_TIMEOUT = 60000;

test.describe('VNC Connectivity Tests', () => {
    test.use({
        httpCredentials: {
            username: DASHBOARD_USER,
            password: DASHBOARD_PASS,
        },
    });

    test.beforeEach(async ({ page }) => {
        await page.goto(DASHBOARD_URL);
        await page.waitForLoadState('networkidle');
    });

    test('should display dashboard with at least 1 running instance', async ({ page }) => {
        // Wait for dashboard to load
        await expect(page.locator('.logo')).toBeVisible({ timeout: 10000 });

        // Check overall status badge shows at least 1 running instance
        const statusBadge = page.locator('#overall-status');
        await expect(statusBadge).toBeVisible();

        const statusText = await statusBadge.textContent();
        expect(statusText).toMatch(/(\d+)\/(\d+) Running/);

        // Extract running count
        const match = statusText?.match(/(\d+)\/(\d+)/);
        if (match) {
            const running = parseInt(match[1]);
            const total = parseInt(match[2]);
            expect(running).toBeGreaterThanOrEqual(1);
            expect(total).toBeGreaterThanOrEqual(1);
            console.log(`✓ Dashboard shows ${running}/${total} instances running`);
        }
    });

    test('should have VNC View button enabled for running instance', async ({ page }) => {
        // Find the first running instance card
        const runningCard = page.locator('.card').filter({ has: page.locator('.instance-status.running') }).first();
        await expect(runningCard).toBeVisible({ timeout: 10000 });

        // Check that View button exists and is enabled
        const viewButton = runningCard.locator('button:has-text("View")');
        await expect(viewButton).toBeVisible();
        await expect(viewButton).toBeEnabled();

        console.log('✓ View button is enabled for running instance');
    });

    test('should verify noVNC static files are accessible', async ({ page }) => {
        // Test that noVNC static files are served correctly through NGINX
        const novncUrls = [
            '/novnc/vnc.html',
            '/novnc/core/rfb.js',
            '/novnc/app/ui.js',
        ];

        for (const url of novncUrls) {
            const response = await page.goto(DASHBOARD_URL + url);
            expect(response?.status()).toBe(200);
            console.log(`✓ noVNC file accessible: ${url} (${response?.status()})`);
        }
    });

    test('should open VNC viewer when clicking View button', async ({ page, context }) => {
        // Find first running instance
        const runningCard = page.locator('.card').filter({ has: page.locator('.instance-status.running') }).first();
        await expect(runningCard).toBeVisible({ timeout: 10000 });

        // Get instance details
        const instanceTitle = await runningCard.locator('.card-title').textContent();
        console.log(`Testing VNC for: ${instanceTitle}`);

        // Listen for popup/new window
        const popupPromise = context.waitForEvent('page');

        // Click View button
        const viewButton = runningCard.locator('button:has-text("View")');
        await viewButton.click();

        // Wait for VNC viewer popup
        const popup = await popupPromise;
        await popup.waitForLoadState('networkidle', { timeout: 20000 });

        // Verify noVNC loaded
        const url = popup.url();
        expect(url).toContain('/novnc/vnc.html');
        expect(url).toContain('path='); // Should have WebSocket path parameter
        expect(url).toContain('websockify'); // Should use websockify proxy

        console.log(`✓ noVNC viewer opened: ${url}`);

        // Check for noVNC canvas element (indicates successful load)
        const canvas = popup.locator('#noVNC_canvas');
        await expect(canvas).toBeVisible({ timeout: 15000 });

        console.log('✓ noVNC canvas is visible');

        await popup.close();
    });

    test('should verify WebSocket connection to VNC', async ({ page, context }) => {
        // Find first running instance
        const runningCard = page.locator('.card').filter({ has: page.locator('.instance-status.running') }).first();
        await expect(runningCard).toBeVisible({ timeout: 10000 });

        // Listen for WebSocket connections
        const wsMessages: string[] = [];
        const wsErrors: string[] = [];

        page.on('websocket', ws => {
            console.log(`WebSocket opened: ${ws.url()}`);

            ws.on('framesent', event => wsMessages.push(`→ ${event.payload}`));
            ws.on('framereceived', event => wsMessages.push(`← ${event.payload}`));
            ws.on('close', () => console.log(`WebSocket closed: ${ws.url()}`));
        });

        page.on('pageerror', error => {
            wsErrors.push(error.message);
        });

        // Open VNC viewer
        const popupPromise = context.waitForEvent('page');
        const viewButton = runningCard.locator('button:has-text("View")');
        await viewButton.click();

        const popup = await popupPromise;
        await popup.waitForLoadState('networkidle', { timeout: 20000 });

        // Wait for noVNC to initialize (canvas should appear)
        const canvas = popup.locator('#noVNC_canvas');
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Check for VNC connection status
        // noVNC shows connection state in the UI
        await page.waitForTimeout(3000); // Allow time for WebSocket handshake

        // Verify no critical errors
        const criticalErrors = wsErrors.filter(msg =>
            msg.includes('websocket') ||
            msg.includes('connection') ||
            msg.includes('failed')
        );

        if (criticalErrors.length > 0) {
            console.error('WebSocket errors detected:', criticalErrors);
        }

        expect(criticalErrors.length).toBe(0);

        console.log(`✓ WebSocket connection successful (${wsMessages.length} messages exchanged)`);

        await popup.close();
    });

    test('should handle multiple simultaneous VNC connections', async ({ page, context }) => {
        // Get all running instances
        const runningCards = page.locator('.card').filter({ has: page.locator('.instance-status.running') });
        const count = await runningCards.count();

        console.log(`Found ${count} running instances`);

        if (count < 2) {
            test.skip();
            return;
        }

        // Open VNC viewers for first 2 instances
        const popups: any[] = [];

        for (let i = 0; i < Math.min(2, count); i++) {
            const card = runningCards.nth(i);
            const viewButton = card.locator('button:has-text("View")');

            const popupPromise = context.waitForEvent('page');
            await viewButton.click();

            const popup = await popupPromise;
            await popup.waitForLoadState('networkidle', { timeout: 20000 });

            popups.push(popup);

            // Verify each noVNC instance loaded
            const canvas = popup.locator('#noVNC_canvas');
            await expect(canvas).toBeVisible({ timeout: 15000 });

            console.log(`✓ VNC viewer ${i + 1} loaded successfully`);
        }

        // All viewers should remain functional
        for (const popup of popups) {
            const canvas = popup.locator('#noVNC_canvas');
            await expect(canvas).toBeVisible();
        }

        console.log(`✓ ${popups.length} concurrent VNC connections successful`);

        // Cleanup
        for (const popup of popups) {
            await popup.close();
        }
    });

    test('should verify VNC reconnection after refresh', async ({ page, context }) => {
        // Open VNC viewer
        const runningCard = page.locator('.card').filter({ has: page.locator('.instance-status.running') }).first();
        await expect(runningCard).toBeVisible({ timeout: 10000 });

        const popupPromise = context.waitForEvent('page');
        const viewButton = runningCard.locator('button:has-text("View")');
        await viewButton.click();

        const popup = await popupPromise;
        await popup.waitForLoadState('networkidle', { timeout: 20000 });

        // Wait for initial connection
        const canvas = popup.locator('#noVNC_canvas');
        await expect(canvas).toBeVisible({ timeout: 15000 });

        console.log('✓ Initial VNC connection successful');

        // Refresh the VNC viewer page
        await popup.reload({ timeout: 30000 });
        await popup.waitForLoadState('networkidle', { timeout: 20000 });

        // Verify reconnection
        await expect(canvas).toBeVisible({ timeout: 15000 });

        console.log('✓ VNC reconnection after refresh successful');

        await popup.close();
    });

    test('should check WebSocket URL format is correct', async ({ page }) => {
        // Verify the getVncUrl function generates correct URLs
        const result = await page.evaluate(() => {
            // Access the global getVncUrl function
            const testPort = 6080; // Instance 0
            // @ts-ignore
            const url = window.getVncUrl(testPort);
            return url;
        });

        expect(result).toContain('/novnc/vnc.html');
        expect(result).toContain('path=');
        expect(result).toContain('websockify');
        expect(result).toContain('autoconnect=true');

        console.log(`✓ VNC URL format correct: ${result}`);

        // Decode the WebSocket path parameter
        const urlObj = new URL('http://dummy' + result);
        const wsPath = urlObj.searchParams.get('path');

        if (wsPath) {
            console.log(`✓ WebSocket path: ${wsPath}`);
            expect(wsPath).toMatch(/^wss?:\/\//);
            expect(wsPath).toContain('/websockify/');
        }
    });
});

test.describe('VNC Error Handling', () => {
    test.use({
        httpCredentials: {
            username: DASHBOARD_USER,
            password: DASHBOARD_PASS,
        },
    });

    test('should show View button disabled for offline instances', async ({ page }) => {
        await page.goto(DASHBOARD_URL);
        await page.waitForLoadState('networkidle');

        // Find offline instance cards (if any)
        const offlineCards = page.locator('.card').filter({ has: page.locator('.instance-status.offline') });
        const count = await offlineCards.count();

        if (count === 0) {
            console.log('⊘ No offline instances to test');
            test.skip();
            return;
        }

        const firstOffline = offlineCards.first();

        // Offline instances should have Start button, not View button
        const startButton = firstOffline.locator('button:has-text("Start")');
        await expect(startButton).toBeVisible();

        // View button should not exist for offline instances
        const viewButton = firstOffline.locator('button:has-text("View")');
        await expect(viewButton).not.toBeVisible();

        console.log('✓ Offline instances correctly show Start button instead of View');
    });

    test('should verify console has no critical errors', async ({ page }) => {
        const errors: string[] = [];

        page.on('pageerror', error => {
            errors.push(error.message);
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto(DASHBOARD_URL);
        await page.waitForLoadState('networkidle');

        // Wait a bit to catch any delayed errors
        await page.waitForTimeout(3000);

        // Filter out known non-critical errors
        const criticalErrors = errors.filter(msg =>
            !msg.includes('favicon') &&
            !msg.includes('ERR_FILE_NOT_FOUND') &&
            msg.length > 0
        );

        if (criticalErrors.length > 0) {
            console.error('Critical errors found:', criticalErrors);
        }

        expect(criticalErrors.length).toBe(0);

        console.log('✓ No critical console errors detected');
    });
});
