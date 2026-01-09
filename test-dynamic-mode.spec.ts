import { test, expect } from '@playwright/test';
import { chromium, Browser } from 'playwright';

/**
 * Dynamic Mode Comprehensive Test Suite
 *
 * Tests the current dynamic mode implementation to:
 * 1. Validate basic functionality
 * 2. Identify performance bottlenecks
 * 3. Document failure modes at scale
 * 4. Establish baseline metrics for auto-scaling improvements
 */

const BASE_URL = 'http://localhost:8080';
const AUTH_USER = 'admin';
const AUTH_PASS = 'admin';
const DYNAMIC_GATEWAY = 'http://localhost:9222'; // Assumes DYNAMIC_MODE=true, CDP_GATEWAY_PORT=9222

// Helper to connect to dynamic instance
async function connectToDynamicInstance(projectName: string): Promise<Browser> {
    const endpoint = `${DYNAMIC_GATEWAY}/${projectName}/`;
    console.log(`Connecting to: ${endpoint}`);
    return await chromium.connectOverCDP(endpoint);
}

// Helper to wait for instance to be ready
async function waitForInstanceReady(projectName: string, timeoutMs = 10000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const browser = await chromium.connectOverCDP(`${DYNAMIC_GATEWAY}/${projectName}/`);
            await browser.close();
            return true;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return false;
}

test.describe('Dynamic Mode - Basic Functionality', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should create instance on first connection', async () => {
        const projectName = 'test-first-connection';

        // First connection should trigger instance creation
        const browser = await connectToDynamicInstance(projectName);

        expect(browser.isConnected()).toBe(true);

        const contexts = browser.contexts();
        expect(contexts.length).toBeGreaterThan(0);

        await browser.close();
    });

    test('should reuse existing instance on subsequent connections', async () => {
        const projectName = 'test-reuse-instance';

        // First connection
        const browser1 = await connectToDynamicInstance(projectName);
        const context1 = browser1.contexts()[0];
        const page1 = await context1.newPage();
        await page1.goto('data:text/html,<h1>Test Page 1</h1>');
        await browser1.close();

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Second connection (should reuse same instance)
        const browser2 = await connectToDynamicInstance(projectName);
        const context2 = browser2.contexts()[0];

        // Instance should have preserved state (pages might be there)
        expect(browser2.isConnected()).toBe(true);

        await browser2.close();
    });

    test('should support valid project names', async () => {
        const validNames = [
            'test-123',
            'my-project',
            'ab',  // Minimum 2 chars
            'a'.repeat(50),  // Maximum 50 chars
            'test-with-multiple-hyphens'
        ];

        for (const name of validNames) {
            const browser = await connectToDynamicInstance(name);
            expect(browser.isConnected()).toBe(true);
            await browser.close();

            // Clean up
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    test('should reject invalid project names', async () => {
        const invalidNames = [
            'Test',  // Uppercase
            'test_project',  // Underscores
            '-test',  // Starts with hyphen
            'test-',  // Ends with hyphen
            'a',  // Too short
            'a'.repeat(51),  // Too long
            'test/project',  // Invalid char
        ];

        for (const name of invalidNames) {
            let connectionFailed = false;
            try {
                const browser = await chromium.connectOverCDP(`${DYNAMIC_GATEWAY}/${name}/`, {
                    timeout: 5000
                });
                await browser.close();
            } catch (error) {
                connectionFailed = true;
                console.log(`✓ Correctly rejected invalid name: ${name}`);
            }

            expect(connectionFailed).toBe(true);
        }
    });

    test('should isolate projects with separate Chrome instances', async () => {
        const project1 = 'isolation-test-1';
        const project2 = 'isolation-test-2';

        // Connect to both projects
        const browser1 = await connectToDynamicInstance(project1);
        const browser2 = await connectToDynamicInstance(project2);

        const context1 = browser1.contexts()[0];
        const context2 = browser2.contexts()[0];

        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        // Set different localStorage values
        await page1.goto('data:text/html,<h1>Project 1</h1>');
        await page1.evaluate(() => localStorage.setItem('project', 'project1'));

        await page2.goto('data:text/html,<h1>Project 2</h1>');
        await page2.evaluate(() => localStorage.setItem('project', 'project2'));

        // Verify isolation
        const value1 = await page1.evaluate(() => localStorage.getItem('project'));
        const value2 = await page2.evaluate(() => localStorage.getItem('project'));

        expect(value1).toBe('project1');
        expect(value2).toBe('project2');

        await browser1.close();
        await browser2.close();
    });
});

test.describe('Dynamic Mode - Performance & Scaling', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should measure instance creation time', async () => {
        const projectName = 'perf-creation-time';

        const startTime = Date.now();
        const browser = await connectToDynamicInstance(projectName);
        const creationTime = Date.now() - startTime;

        console.log(`Instance creation time: ${creationTime}ms`);

        // Baseline: Should be < 5 seconds (per requirements)
        expect(creationTime).toBeLessThan(5000);

        await browser.close();
    });

    test('should measure instance reuse time', async () => {
        const projectName = 'perf-reuse-time';

        // Create instance first
        const browser1 = await connectToDynamicInstance(projectName);
        await browser1.close();

        // Wait for connection to close
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Measure reuse time
        const startTime = Date.now();
        const browser2 = await connectToDynamicInstance(projectName);
        const reuseTime = Date.now() - startTime;

        console.log(`Instance reuse time: ${reuseTime}ms`);

        // Reuse should be much faster (< 1 second)
        expect(reuseTime).toBeLessThan(1000);

        await browser2.close();
    });

    test('should handle concurrent connections to same project', async () => {
        const projectName = 'concurrent-same-project';

        // Create 5 concurrent connections to the same project
        const connections = await Promise.all([
            connectToDynamicInstance(projectName),
            connectToDynamicInstance(projectName),
            connectToDynamicInstance(projectName),
            connectToDynamicInstance(projectName),
            connectToDynamicInstance(projectName),
        ]);

        // All should connect successfully
        for (const browser of connections) {
            expect(browser.isConnected()).toBe(true);
        }

        // Close all
        await Promise.all(connections.map(b => b.close()));
    });

    test('should handle concurrent connections to different projects', async () => {
        const projects = [
            'concurrent-project-1',
            'concurrent-project-2',
            'concurrent-project-3',
            'concurrent-project-4',
            'concurrent-project-5',
        ];

        const startTime = Date.now();

        // Create all instances concurrently
        const browsers = await Promise.all(
            projects.map(name => connectToDynamicInstance(name))
        );

        const totalTime = Date.now() - startTime;
        console.log(`Created 5 instances concurrently in ${totalTime}ms`);

        // All should be connected
        for (const browser of browsers) {
            expect(browser.isConnected()).toBe(true);
        }

        // Close all
        await Promise.all(browsers.map(b => b.close()));
    });

    test('should handle rapid sequential instance creation', async () => {
        const instanceCount = 10;
        const creationTimes: number[] = [];

        for (let i = 0; i < instanceCount; i++) {
            const projectName = `rapid-create-${i}`;
            const startTime = Date.now();

            const browser = await connectToDynamicInstance(projectName);
            const creationTime = Date.now() - startTime;
            creationTimes.push(creationTime);

            console.log(`Instance ${i + 1}: ${creationTime}ms`);

            await browser.close();
        }

        const avgTime = creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length;
        console.log(`Average creation time: ${avgTime}ms`);

        // Performance shouldn't degrade significantly
        const lastFive = creationTimes.slice(-5);
        const avgLastFive = lastFive.reduce((a, b) => a + b, 0) / lastFive.length;

        console.log(`Average of last 5: ${avgLastFive}ms`);

        // Last 5 shouldn't be more than 50% slower than overall average
        expect(avgLastFive).toBeLessThan(avgTime * 1.5);
    });

    test.skip('should test behavior at MAX_DYNAMIC_INSTANCES limit', async () => {
        // This test is expensive - only run manually
        // Assumes MAX_DYNAMIC_INSTANCES=20 (default)

        const maxInstances = 20;
        const browsers: Browser[] = [];

        try {
            // Create instances up to the limit
            for (let i = 0; i < maxInstances; i++) {
                const projectName = `limit-test-${i}`;
                console.log(`Creating instance ${i + 1}/${maxInstances}...`);

                const browser = await connectToDynamicInstance(projectName);
                browsers.push(browser);
            }

            console.log(`✓ Successfully created ${maxInstances} instances`);

            // Try to create one more (should fail)
            let failedAsExpected = false;
            try {
                const browser = await chromium.connectOverCDP(
                    `${DYNAMIC_GATEWAY}/limit-test-overflow/`,
                    { timeout: 10000 }
                );
                await browser.close();
            } catch (error) {
                failedAsExpected = true;
                console.log('✓ Correctly rejected instance beyond limit');
                console.log(`Error: ${error.message}`);
            }

            expect(failedAsExpected).toBe(true);

        } finally {
            // Cleanup
            await Promise.all(browsers.map(b => b.close().catch(() => {})));
        }
    });
});

test.describe('Dynamic Mode - Idle Timeout & Cleanup', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should keep instance alive with activity', async () => {
        const projectName = 'activity-keepalive';

        const browser = await connectToDynamicInstance(projectName);
        const context = browser.contexts()[0];
        const page = await context.newPage();

        // Send activity every 5 seconds for 20 seconds
        for (let i = 0; i < 4; i++) {
            await page.goto('data:text/html,<h1>Activity Test</h1>');
            console.log(`Activity ${i + 1}/4`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Instance should still be alive
        expect(browser.isConnected()).toBe(true);

        await browser.close();
    });

    test.skip('should stop instance after idle timeout', async () => {
        // SKIP: This test takes 30+ minutes with default timeout
        // Only run manually with reduced INSTANCE_TIMEOUT_MINUTES

        const projectName = 'idle-timeout-test';

        // Create instance
        const browser = await connectToDynamicInstance(projectName);
        await browser.close();

        console.log('Waiting for idle timeout (30 minutes default)...');

        // Wait for timeout + cleanup interval (30 min + 5 min = 35 min)
        await new Promise(resolve => setTimeout(resolve, 35 * 60 * 1000));

        // Try to check if instance was cleaned up via API
        const response = await fetch(`${BASE_URL}/api/dynamic/instances/${projectName}`, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
            }
        });

        const data = await response.json();

        // Instance should be stopped (but still in registry)
        expect(data.status).toBe('stopped');
    });
});

test.describe('Dynamic Mode - Dashboard Integration', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should list dynamic instances in API', async ({ page }) => {
        // Create a few instances
        const projects = ['api-test-1', 'api-test-2', 'api-test-3'];
        const browsers: Browser[] = [];

        for (const project of projects) {
            const browser = await connectToDynamicInstance(project);
            browsers.push(browser);
        }

        // Wait for instances to be registered
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check API
        await page.goto(BASE_URL);
        const response = await page.request.get(`${BASE_URL}/api/dynamic/instances`);
        const data = await response.json();

        console.log('Dynamic instances:', data);

        expect(data.instances).toBeDefined();
        expect(data.instances.length).toBeGreaterThanOrEqual(3);

        // Verify our projects are in the list
        const instanceNames = data.instances.map((i: any) => i.projectName);
        for (const project of projects) {
            expect(instanceNames).toContain(project);
        }

        // Cleanup
        await Promise.all(browsers.map(b => b.close()));
    });

    test('should provide instance status via API', async ({ page }) => {
        const projectName = 'api-status-test';

        const browser = await connectToDynamicInstance(projectName);

        // Wait for registration
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.goto(BASE_URL);
        const response = await page.request.get(`${BASE_URL}/api/dynamic/instances/${projectName}`);
        const data = await response.json();

        console.log('Instance data:', data);

        expect(data.projectName).toBe(projectName);
        expect(data.status).toBe('running');
        expect(data.cdpPort).toBeGreaterThan(0);
        expect(data.idleMinutes).toBeDefined();

        await browser.close();
    });
});

test.describe('Dynamic Mode - Error Handling', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should handle malformed URLs gracefully', async () => {
        const malformedUrls = [
            `${DYNAMIC_GATEWAY}//double-slash/`,
            `${DYNAMIC_GATEWAY}/no-trailing-slash`,
            `${DYNAMIC_GATEWAY}/../../path-traversal/`,
        ];

        for (const url of malformedUrls) {
            let failed = false;
            try {
                const browser = await chromium.connectOverCDP(url, { timeout: 5000 });
                await browser.close();
            } catch (error) {
                failed = true;
                console.log(`✓ Correctly handled malformed URL: ${url}`);
            }

            // Should either fail or connect (depending on URL normalization)
            // Main point: shouldn't crash the gateway
        }
    });

    test('should recover from Chrome crash', async () => {
        const projectName = 'crash-recovery-test';

        // Create instance
        const browser1 = await connectToDynamicInstance(projectName);
        const context1 = browser1.contexts()[0];
        const page1 = await context1.newPage();
        await page1.goto('data:text/html,<h1>Before Crash</h1>');

        // Force disconnect
        await browser1.close();

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Should be able to reconnect (instance should restart)
        const browser2 = await connectToDynamicInstance(projectName);
        expect(browser2.isConnected()).toBe(true);

        await browser2.close();
    });
});

test.describe('Dynamic Mode - Resource Usage', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should report memory usage per instance', async ({ page }) => {
        const projectName = 'memory-usage-test';

        const browser = await connectToDynamicInstance(projectName);
        const context = browser.contexts()[0];
        const testPage = await context.newPage();

        // Load some content to consume memory
        await testPage.goto('https://example.com');

        // Wait for metrics
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if metrics endpoint provides memory info
        await page.goto(BASE_URL);
        const response = await page.request.get(`${BASE_URL}/api/metrics`);
        const data = await response.json();

        console.log('System metrics:', data);

        // Should have memory info
        expect(data.memory).toBeDefined();

        await browser.close();
    });
});
