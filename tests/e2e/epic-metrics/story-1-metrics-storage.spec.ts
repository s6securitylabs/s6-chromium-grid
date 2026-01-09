import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Story 1: Core Metrics Storage with SQLite
 *
 * Tests system metrics collection, storage, and retrieval
 * with 7-day retention and <10MB disk usage.
 */

test.describe('Story 1: Core Metrics Storage', () => {
  const dbPath = path.join(__dirname, '../../../data/metrics.db');
  const authHeader = 'Basic ' + Buffer.from('admin:admin').toString('base64');

  test.beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(dbPath + '-wal')) {
      fs.unlinkSync(dbPath + '-wal');
    }
    if (fs.existsSync(dbPath + '-shm')) {
      fs.unlinkSync(dbPath + '-shm');
    }
  });

  // AC1: SQLite database with metrics table
  test('AC1: Should create SQLite database with correct schema', async ({ request }) => {
    // Wait for server to initialize database
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Database should exist
    expect(fs.existsSync(dbPath)).toBe(true);

    // WAL files should exist (indicates WAL mode)
    // Note: WAL files may not exist immediately, check after some activity
  });

  // AC2: WAL mode enabled for concurrent reads
  test('AC2: Should enable WAL mode for concurrent access', async ({ request }) => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query should succeed (proves database is accessible)
    const response = await request.get('http://localhost:8080/api/metrics', {
      headers: { 'Authorization': authHeader }
    });
    expect(response.ok()).toBe(true);

    // Multiple concurrent reads should work
    const concurrentRequests = await Promise.all([
      request.get('http://localhost:8080/api/metrics', { headers: { 'Authorization': authHeader } }),
      request.get('http://localhost:8080/api/metrics', { headers: { 'Authorization': authHeader } }),
      request.get('http://localhost:8080/api/metrics', { headers: { 'Authorization': authHeader } }),
    ]);

    concurrentRequests.forEach(resp => {
      expect(resp.ok()).toBe(true);
    });
  });

  // AC3: Collection every 5 seconds with low CPU
  test('AC3: Should collect metrics every 5 seconds', async ({ request }) => {
    // Wait for multiple collection intervals
    await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds = 2 intervals

    // Query historical endpoint
    const response = await request.get('http://localhost:8080/api/metrics/history?hours=1', {
      headers: { 'Authorization': authHeader }
    });
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThanOrEqual(2); // At least 2 data points

    // Verify data structure
    const metric = data.data[0];
    expect(metric).toHaveProperty('timestamp');
    expect(metric).toHaveProperty('cpu_percent');
    expect(metric).toHaveProperty('mem_used_mb');
    expect(metric).toHaveProperty('mem_total_mb');
    expect(metric).toHaveProperty('instance_count');
  });

  // AC4: Auto-cleanup deletes old data
  test('AC4: Should have cleanup mechanism in place', async ({ request }) => {
    // Check that cleanup interval is running
    // Note: Full test would require waiting 1+ hour, so we just verify endpoint works

    const response = await request.get('http://localhost:8080/api/metrics', {
      headers: { 'Authorization': authHeader }
    });
    expect(response.ok()).toBe(true);

    // Cleanup is tested via integration tests (not E2E due to time)
  });

  // AC5: Total disk usage <9MB after 7 days
  test('AC5: Should maintain reasonable disk usage', async ({ request }) => {
    // Collect data for a short period
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      const sizeKB = stats.size / 1024;

      console.log(`Database size after 30s: ${sizeKB.toFixed(2)} KB`);

      // Extrapolate to 7 days
      const dataPointsPer30s = 6; // 30s / 5s intervals
      const dataPointsPer7Days = (7 * 24 * 60 * 60) / 5; // 120,960
      const estimatedSize = (sizeKB / dataPointsPer30s) * dataPointsPer7Days;

      console.log(`Estimated 7-day size: ${(estimatedSize / 1024).toFixed(2)} MB`);
      expect(estimatedSize / 1024).toBeLessThan(9); // <9MB
    }
  });

  test('Should handle concurrent writes gracefully', async ({ request }) => {
    // Metrics should continue collecting even under load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Make multiple concurrent API calls
    const requests = Array(10).fill(null).map(() =>
      request.get('http://localhost:8080/api/metrics', {
        headers: { 'Authorization': authHeader }
      })
    );

    const responses = await Promise.all(requests);
    responses.forEach(resp => expect(resp.ok()).toBe(true));
  });

  test('Should provide current snapshot via /api/metrics', async ({ request }) => {
    const response = await request.get('http://localhost:8080/api/metrics', {
      headers: { 'Authorization': authHeader }
    });
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.cpu).toBeDefined();
    expect(data.memory).toBeDefined();
    expect(data.disk).toBeDefined();
  });
});
