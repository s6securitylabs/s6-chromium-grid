import { test, expect } from '@playwright/test';
import { chromium, Browser } from 'playwright';

/**
 * Dynamic Mode - Load Testing & Stress Tests
 *
 * These tests simulate heavy load to identify:
 * 1. Maximum sustainable instance count
 * 2. Resource exhaustion behaviors
 * 3. Performance degradation patterns
 * 4. Recovery from overload conditions
 *
 * IMPORTANT: Run these tests in isolation with sufficient system resources
 * Recommended: 16GB RAM, 8 CPU cores
 */

const BASE_URL = 'http://localhost:8080';
const AUTH_USER = 'admin';
const AUTH_PASS = 'admin';
const DYNAMIC_GATEWAY = 'http://localhost:9222';

async function connectToDynamicInstance(projectName: string): Promise<Browser> {
    const endpoint = `${DYNAMIC_GATEWAY}/${projectName}/`;
    return await chromium.connectOverCDP(endpoint);
}

async function getSystemMetrics(page: any) {
    const response = await page.request.get(`${BASE_URL}/api/metrics`, {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
        }
    });
    return await response.json();
}

test.describe('Dynamic Mode - Load Testing', () => {
    test.setTimeout(300000); // 5 minutes for load tests

    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should handle 10 concurrent instances with load', async ({ page }) => {
        const instanceCount = 10;
        const browsers: Browser[] = [];
        const startTime = Date.now();

        console.log(`\n=== Creating ${instanceCount} Instances ===`);

        try {
            // Create instances concurrently
            const creationPromises = Array.from({ length: instanceCount }, (_, i) =>
                connectToDynamicInstance(`load-test-10-${i}`)
            );

            browsers.push(...await Promise.all(creationPromises));
            const creationTime = Date.now() - startTime;

            console.log(`✓ Created ${instanceCount} instances in ${creationTime}ms`);
            console.log(`  Average: ${Math.round(creationTime / instanceCount)}ms per instance`);

            // Get system metrics
            const metrics = await getSystemMetrics(page);
            console.log(`\nSystem Metrics After Creation:`);
            console.log(`  Memory: ${metrics.memory.used}MB / ${metrics.memory.total}MB (${Math.round(metrics.memory.used / metrics.memory.total * 100)}%)`);
            console.log(`  CPU: ${metrics.cpu.usage}%`);
            console.log(`  Instances: ${metrics.instances.filter((i: any) => i.status === 'running').length} running`);

            // Run load on all instances
            console.log(`\n=== Running Load Test ===`);
            const loadPromises = browsers.map(async (browser, index) => {
                const context = browser.contexts()[0];
                const page = await context.newPage();

                // Navigate to multiple pages
                await page.goto('data:text/html,<h1>Load Test Page</h1><script>let data = new Array(1000000).fill("test");</script>');
                await page.waitForTimeout(1000);

                return `Instance ${index} completed`;
            });

            const results = await Promise.all(loadPromises);
            console.log(`✓ All instances handled load successfully`);

            // Final metrics
            const finalMetrics = await getSystemMetrics(page);
            console.log(`\nFinal System Metrics:`);
            console.log(`  Memory: ${finalMetrics.memory.used}MB / ${finalMetrics.memory.total}MB (${Math.round(finalMetrics.memory.used / finalMetrics.memory.total * 100)}%)`);
            console.log(`  CPU: ${finalMetrics.cpu.usage}%`);

            // Assertions
            expect(browsers.length).toBe(instanceCount);
            expect(finalMetrics.memory.used / finalMetrics.memory.total).toBeLessThan(0.95); // < 95% memory

        } finally {
            console.log(`\n=== Cleanup ===`);
            await Promise.all(browsers.map(b => b.close().catch(() => {})));
            console.log(`✓ Closed all instances`);
        }
    });

    test('should handle 20 concurrent instances (at default limit)', async ({ page }) => {
        const instanceCount = 20; // Default MAX_DYNAMIC_INSTANCES
        const browsers: Browser[] = [];
        const creationTimes: number[] = [];

        console.log(`\n=== Stress Test: ${instanceCount} Instances ===`);

        try {
            // Create instances in batches of 5 to avoid overwhelming the system
            const batchSize = 5;
            for (let batch = 0; batch < instanceCount / batchSize; batch++) {
                console.log(`Creating batch ${batch + 1}/${instanceCount / batchSize}...`);

                const batchStart = Date.now();
                const batchPromises = Array.from({ length: batchSize }, (_, i) => {
                    const index = batch * batchSize + i;
                    return connectToDynamicInstance(`stress-test-20-${index}`);
                });

                const batchBrowsers = await Promise.all(batchPromises);
                browsers.push(...batchBrowsers);

                const batchTime = Date.now() - batchStart;
                creationTimes.push(batchTime);

                console.log(`  Batch ${batch + 1} created in ${batchTime}ms`);

                // Get metrics after each batch
                const metrics = await getSystemMetrics(page);
                console.log(`  Memory: ${Math.round(metrics.memory.used / metrics.memory.total * 100)}% | Instances: ${browsers.length}`);
            }

            console.log(`\n✓ Successfully created ${instanceCount} instances`);

            // Analyze creation time degradation
            const firstBatch = creationTimes[0];
            const lastBatch = creationTimes[creationTimes.length - 1];
            const degradation = ((lastBatch - firstBatch) / firstBatch) * 100;

            console.log(`\nPerformance Analysis:`);
            console.log(`  First batch: ${firstBatch}ms`);
            console.log(`  Last batch: ${lastBatch}ms`);
            console.log(`  Degradation: ${degradation.toFixed(1)}%`);

            // Performance shouldn't degrade more than 100%
            expect(degradation).toBeLessThan(100);

            // Final system check
            const finalMetrics = await getSystemMetrics(page);
            console.log(`\nFinal System State:`);
            console.log(`  Memory: ${finalMetrics.memory.used}MB / ${finalMetrics.memory.total}MB`);
            console.log(`  Running instances: ${finalMetrics.instances.filter((i: any) => i.status === 'running').length}`);

            // System shouldn't be completely exhausted
            expect(finalMetrics.memory.used / finalMetrics.memory.total).toBeLessThan(0.95);

        } finally {
            console.log(`\n=== Cleanup (may take time) ===`);
            // Close in batches to avoid overwhelming
            for (let i = 0; i < browsers.length; i += 5) {
                await Promise.all(
                    browsers.slice(i, i + 5).map(b => b.close().catch(() => {}))
                );
                console.log(`  Closed ${Math.min(i + 5, browsers.length)}/${browsers.length}`);
            }
            console.log(`✓ All instances closed`);
        }
    });

    test('should identify behavior at instance limit', async ({ page }) => {
        const maxInstances = 20;
        const browsers: Browser[] = [];

        console.log(`\n=== Testing Limit Behavior ===`);

        try {
            // Create instances up to limit
            console.log(`Creating ${maxInstances} instances...`);
            for (let i = 0; i < maxInstances; i++) {
                const browser = await connectToDynamicInstance(`limit-behavior-${i}`);
                browsers.push(browser);

                if ((i + 1) % 5 === 0) {
                    console.log(`  Progress: ${i + 1}/${maxInstances}`);
                }
            }

            console.log(`✓ Created ${maxInstances} instances`);

            // Get metrics at limit
            const metricsAtLimit = await getSystemMetrics(page);
            console.log(`\nSystem at Limit:`);
            console.log(`  Memory: ${Math.round(metricsAtLimit.memory.used / metricsAtLimit.memory.total * 100)}%`);
            console.log(`  CPU: ${metricsAtLimit.cpu.usage}%`);

            // Try to create one more instance
            console.log(`\nAttempting to exceed limit...`);
            let overflowError: Error | null = null;
            let overflowTime = 0;

            const overflowStart = Date.now();
            try {
                const overflowBrowser = await chromium.connectOverCDP(
                    `${DYNAMIC_GATEWAY}/limit-overflow/`,
                    { timeout: 30000 } // Give it time in case cleanup happens
                );
                await overflowBrowser.close();
                console.log(`⚠️  UNEXPECTED: Overflow instance created successfully!`);
            } catch (error) {
                overflowError = error;
                overflowTime = Date.now() - overflowStart;
                console.log(`✓ Overflow rejected after ${overflowTime}ms`);
                console.log(`  Error: ${error.message}`);
            }

            // Document current behavior
            console.log(`\nCurrent Behavior at Limit:`);
            console.log(`  Hard limit: ${overflowError ? 'YES' : 'NO'}`);
            console.log(`  Error type: ${overflowError ? overflowError.name : 'N/A'}`);
            console.log(`  Response time: ${overflowTime}ms`);

            // This is the current behavior we want to improve
            // Auto-scaling should prevent this hard failure
            expect(overflowError).toBeTruthy(); // Currently fails, which we want to fix

        } finally {
            console.log(`\n=== Cleanup ===`);
            for (let i = 0; i < browsers.length; i += 5) {
                await Promise.all(
                    browsers.slice(i, i + 5).map(b => b.close().catch(() => {}))
                );
            }
            console.log(`✓ Cleanup complete`);
        }
    });

    test('should measure memory per instance', async ({ page }) => {
        console.log(`\n=== Memory Consumption Analysis ===`);

        // Get baseline metrics
        const baselineMetrics = await getSystemMetrics(page);
        const baselineMemory = baselineMetrics.memory.used;
        console.log(`Baseline memory: ${baselineMemory}MB`);

        // Create instances one by one and measure
        const browsers: Browser[] = [];
        const memoryPerInstance: number[] = [];

        for (let i = 0; i < 5; i++) {
            const browser = await connectToDynamicInstance(`memory-test-${i}`);
            browsers.push(browser);

            // Wait for instance to stabilize
            await page.waitForTimeout(2000);

            const metrics = await getSystemMetrics(page);
            const currentMemory = metrics.memory.used;
            const deltaMemory = currentMemory - baselineMemory;
            const avgPerInstance = deltaMemory / (i + 1);

            memoryPerInstance.push(avgPerInstance);

            console.log(`Instance ${i + 1}:`);
            console.log(`  Total memory: ${currentMemory}MB`);
            console.log(`  Delta from baseline: ${deltaMemory}MB`);
            console.log(`  Average per instance: ${avgPerInstance.toFixed(1)}MB`);
        }

        const avgMemory = memoryPerInstance.reduce((a, b) => a + b, 0) / memoryPerInstance.length;
        console.log(`\nAverage memory per instance: ${avgMemory.toFixed(1)}MB`);

        // According to PRD: < 500MB per idle instance
        console.log(`PRD requirement: < 500MB per instance`);
        console.log(`Current: ${avgMemory.toFixed(1)}MB per instance`);

        if (avgMemory <= 500) {
            console.log(`✓ PASS: Within PRD limits`);
        } else {
            console.log(`⚠️  WARNING: Exceeds PRD limits`);
        }

        // Cleanup
        await Promise.all(browsers.map(b => b.close().catch(() => {})));
    });
});

test.describe('Dynamic Mode - Recovery & Resilience', () => {
    test.use({
        httpCredentials: {
            username: AUTH_USER,
            password: AUTH_PASS,
        },
    });

    test('should recover from rapid connection churn', async () => {
        const projectName = 'churn-test';
        const iterations = 10;

        console.log(`\n=== Connection Churn Test (${iterations} cycles) ===`);

        for (let i = 0; i < iterations; i++) {
            console.log(`Cycle ${i + 1}/${iterations}`);

            // Connect
            const browser = await connectToDynamicInstance(projectName);
            expect(browser.isConnected()).toBe(true);

            // Do some work
            const context = browser.contexts()[0];
            const page = await context.newPage();
            await page.goto('data:text/html,<h1>Churn Test</h1>');

            // Disconnect
            await browser.close();

            // Short pause
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`✓ Survived ${iterations} connection cycles`);
    });

    test('should handle mixed workloads', async () => {
        console.log(`\n=== Mixed Workload Test ===`);

        const browsers: Browser[] = [];

        try {
            // Create 5 instances with different workloads
            console.log(`Creating instances with varied workloads...`);

            // Heavy instance
            const heavy = await connectToDynamicInstance('mixed-heavy');
            const heavyContext = heavy.contexts()[0];
            const heavyPage = await heavyContext.newPage();
            await heavyPage.goto('data:text/html,<script>let bigData = new Array(10000000).fill("heavy");</script>');
            browsers.push(heavy);

            // Light instances
            for (let i = 0; i < 4; i++) {
                const light = await connectToDynamicInstance(`mixed-light-${i}`);
                const lightContext = light.contexts()[0];
                const lightPage = await lightContext.newPage();
                await lightPage.goto('data:text/html,<h1>Light</h1>');
                browsers.push(light);
            }

            console.log(`✓ All instances running with mixed loads`);

            // Run operations concurrently
            await Promise.all([
                // Heavy instance does work
                heavyPage.evaluate(() => {
                    for (let i = 0; i < 1000; i++) {
                        document.body.innerHTML += `<p>Line ${i}</p>`;
                    }
                }),
                // Light instances stay idle
                ...browsers.slice(1).map(b => new Promise(resolve => setTimeout(resolve, 2000)))
            ]);

            console.log(`✓ Mixed workload completed successfully`);

        } finally {
            await Promise.all(browsers.map(b => b.close().catch(() => {})));
        }
    });
});
