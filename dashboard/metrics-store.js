const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

/**
 * MetricsStore - Lightweight time-series metrics storage
 *
 * Features:
 * - SQLite with WAL mode for concurrent reads
 * - 5-second collection interval
 * - 7-day automatic retention
 * - <10MB disk usage
 * - <1% CPU overhead
 */
class MetricsStore {
  constructor(dbPath = './data/metrics.db', dynamicManager = null) {
    this.dbPath = dbPath;
    this.dynamicManager = dynamicManager;
    this.db = null;
    this.collectionInterval = null;
    this.cleanupInterval = null;

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.init();
  }

  async init() {
    try {
      // Open database
      this.db = new sqlite3.Database(this.dbPath);

      // Promisify database methods
      this.dbRun = promisify(this.db.run.bind(this.db));
      this.dbAll = promisify(this.db.all.bind(this.db));
      this.dbGet = promisify(this.db.get.bind(this.db));

      // Performance optimizations
      await this.dbRun('PRAGMA journal_mode=WAL');
      await this.dbRun('PRAGMA synchronous=NORMAL'); // Fast, safe writes
      await this.dbRun('PRAGMA cache_size=-64000'); // 64MB cache
      await this.dbRun('PRAGMA temp_store=MEMORY');

      // Initialize schema
      await this.initSchema();

      // Start collection and cleanup
      this.startCollection();
      this.startCleanup();

      console.log('[MetricsStore] Initialized successfully');
    } catch (err) {
      console.error('[MetricsStore] Initialization failed:', err.message);
      throw err;
    }
  }

  async initSchema() {
    // System metrics table
    await this.dbRun(`
      CREATE TABLE IF NOT EXISTS metrics (
        timestamp INTEGER PRIMARY KEY,
        cpu_percent REAL,
        mem_used_mb INTEGER,
        mem_total_mb INTEGER,
        disk_used_mb INTEGER,
        disk_total_mb INTEGER,
        instance_count INTEGER,
        active_connections INTEGER DEFAULT 0
      )
    `);

    // Index for time-range queries
    await this.dbRun(`
      CREATE INDEX IF NOT EXISTS idx_timestamp
      ON metrics(timestamp DESC)
    `);

    console.log('[MetricsStore] Schema initialized');
  }

  async record(metrics) {
    try {
      await this.dbRun(`
        INSERT INTO metrics VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        Date.now(),
        metrics.cpu.usage,
        metrics.memory.used,
        metrics.memory.total,
        metrics.disk.used,
        metrics.disk.total,
        Array.isArray(metrics.instances) ?
          metrics.instances.filter(i => i.status === 'running').length :
          metrics.instances instanceof Map ?
            Array.from(metrics.instances.values()).filter(i => i.status === 'running').length :
            0,
        0 // TODO: Track active WebSocket connections
      );
    } catch (err) {
      console.error('[MetricsStore] Record failed:', err.message);
      // Non-fatal: Metrics collection should never crash the app
    }
  }

  startCollection() {
    const collectMetrics = async () => {
      try {
        const metrics = await this.getSystemMetrics();
        await this.record(metrics);
      } catch (err) {
        console.error('[MetricsStore] Collection error:', err.message);
      }
    };

    // Immediate first collection
    collectMetrics();

    // Then every 5 seconds
    this.collectionInterval = setInterval(collectMetrics, 5000);
    console.log('[MetricsStore] Collection started (5s intervals)');
  }

  async getSystemMetrics() {
    // Reuse existing metrics collection logic
    const cpuPercent = await this.getCPUPercent();
    const memInfo = await this.getMemInfo();
    const diskInfo = await this.getDiskInfo();
    const instances = this.dynamicManager?.instances || new Map();

    return {
      cpu: { usage: cpuPercent },
      memory: memInfo,
      disk: diskInfo,
      instances: instances
    };
  }

  async getCPUPercent() {
    // Read /proc/stat
    try {
      const fs = require('fs');
      const data = fs.readFileSync('/proc/stat', 'utf8');
      const lines = data.split('\n');
      const cpuLine = lines.find(line => line.startsWith('cpu '));

      if (!cpuLine) return 0;

      const values = cpuLine.split(/\s+/).slice(1).map(Number);
      const [user, nice, system, idle] = values;
      const total = user + nice + system + idle;
      const usage = total > 0 ? ((user + nice + system) / total) * 100 : 0;

      return Math.round(usage * 10) / 10;
    } catch (err) {
      return 0;
    }
  }

  async getMemInfo() {
    try {
      const fs = require('fs');
      const data = fs.readFileSync('/proc/meminfo', 'utf8');
      const lines = data.split('\n');

      const getValueKB = (key) => {
        const line = lines.find(l => l.startsWith(key));
        if (!line) return 0;
        const match = line.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };

      const totalKB = getValueKB('MemTotal:');
      const availableKB = getValueKB('MemAvailable:');
      const usedKB = totalKB - availableKB;

      return {
        total: Math.round(totalKB / 1024),
        used: Math.round(usedKB / 1024),
        available: Math.round(availableKB / 1024),
      };
    } catch (err) {
      return { total: 0, used: 0, available: 0 };
    }
  }

  async getDiskInfo() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('df -BM / | tail -1').toString();
      const parts = output.split(/\s+/);

      if (parts.length < 4) {
        return { total: 0, used: 0, available: 0 };
      }

      const parseSize = (str) => parseInt(str.replace('M', ''));

      return {
        total: parseSize(parts[1]),
        used: parseSize(parts[2]),
        available: parseSize(parts[3]),
      };
    } catch (err) {
      return { total: 0, used: 0, available: 0 };
    }
  }

  async getRecent(hours = 1) {
    const since = Date.now() - (hours * 3600 * 1000);
    return await this.dbAll(`
      SELECT * FROM metrics
      WHERE timestamp > ?
      ORDER BY timestamp ASC
    `, since);
  }

  async getAggregated(hours, bucketMinutes = 5) {
    // Aggregate into N-minute buckets to reduce data points
    const since = Date.now() - (hours * 3600 * 1000);
    const bucketMs = bucketMinutes * 60 * 1000;

    return await this.dbAll(`
      SELECT
        (timestamp / ${bucketMs}) * ${bucketMs} as bucket_time,
        AVG(cpu_percent) as avg_cpu,
        MAX(cpu_percent) as max_cpu,
        AVG(mem_used_mb) as avg_mem,
        MAX(mem_used_mb) as max_mem,
        AVG(instance_count) as avg_instances
      FROM metrics
      WHERE timestamp > ?
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
    `, since);
  }

  startCleanup() {
    const cleanup = async () => {
      try {
        const cutoff = Date.now() - (7 * 24 * 3600 * 1000);
        const result = await this.dbRun(`
          DELETE FROM metrics WHERE timestamp < ?
        `, cutoff);

        console.log(`[MetricsStore] Cleaned up ${result?.changes || 0} old records`);

        // Vacuum once per day to reclaim space (at 3 AM)
        const hour = new Date().getHours();
        if (hour === 3) {
          await this.dbRun('VACUUM');
          console.log('[MetricsStore] Database vacuumed');
        }
      } catch (err) {
        console.error('[MetricsStore] Cleanup failed:', err.message);
      }
    };

    // Run cleanup every hour
    this.cleanupInterval = setInterval(cleanup, 3600000);

    // Immediate first cleanup
    cleanup();

    console.log('[MetricsStore] Cleanup scheduled (hourly)');
  }

  async export(format = 'json', hours = 24) {
    const data = await this.getRecent(hours);

    if (format === 'csv') {
      const header = 'timestamp,cpu_percent,mem_used_mb,mem_total_mb,disk_used_mb,disk_total_mb,instance_count\n';
      const rows = data.map(row =>
        `${row.timestamp},${row.cpu_percent},${row.mem_used_mb},${row.mem_total_mb},${row.disk_used_mb},${row.disk_total_mb},${row.instance_count}`
      ).join('\n');
      return header + rows;
    } else {
      return JSON.stringify(data, null, 2);
    }
  }

  async shutdown() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.db) {
      await new Promise(resolve => this.db.close(resolve));
    }
    console.log('[MetricsStore] Shutdown complete');
  }
}

module.exports = MetricsStore;
