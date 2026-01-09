# Epic: Lightweight Time-Series Metrics with CDP Activity Tracking

**Epic ID:** METRICS-001
**Priority:** High
**Effort:** 1 day (8 hours)
**Status:** In Progress
**Owner:** Current Sprint

## Epic Overview

Implement a lightweight metrics system that provides historical system metrics, real-time updates via Server-Sent Events, and CDP activity tracking to detect AI behavior patterns (fake work detection). Must maintain <10MB disk usage, <1% CPU overhead.

## Business Value

- **Trust in AI Testing**: Detect when AI agents claim to test but only take screenshots
- **Observability**: Historical trends for debugging and capacity planning
- **Unique Feature**: No other Chrome grid has AI-aware activity tracking
- **Cost Optimization**: Identify wasteful AI behaviors (excessive screenshots)

## Technical Architecture

```
System Metrics (5s intervals) → SQLite (WAL mode)
CDP Messages → Activity Tracker → In-Memory Counters → SQLite (5m intervals)
SQLite → SSE Broadcast → Dashboard (Real-time)
SQLite → Export API → CSV/JSON
```

## Stories

### Story 1: Core Metrics Storage with SQLite
**Effort:** 2 hours
**Status:** Not Started

**As a** DevOps engineer
**I want** system metrics stored in SQLite with 7-day retention
**So that** I can analyze historical trends without external dependencies

**Acceptance Criteria:**
- AC1: SQLite database with metrics table (timestamp, cpu, memory, disk, instances)
- AC2: WAL mode enabled for concurrent reads
- AC3: Collection every 5 seconds with <0.05% CPU overhead
- AC4: Auto-cleanup deletes data older than 7 days
- AC5: Total disk usage <9MB after 7 days

**Technical Notes:**
- Use sqlite3 npm package (500KB)
- PRAGMA journal_mode=WAL, synchronous=NORMAL
- Single writer (collection interval), multiple readers (API/SSE)

---

### Story 2: Server-Sent Events Real-Time Streaming
**Effort:** 1 hour
**Status:** Not Started

**As a** dashboard user
**I want** metrics to update in real-time without polling
**So that** I can see live system status

**Acceptance Criteria:**
- AC1: /api/metrics/stream SSE endpoint with Content-Type: text/event-stream
- AC2: Broadcast new metrics every 5 seconds to connected clients
- AC3: Max 50 concurrent SSE connections (prevent memory leaks)
- AC4: Automatic reconnection on disconnect
- AC5: Heartbeat every 30 seconds to keep connection alive

**Technical Notes:**
- Use native Node.js HTTP response streaming
- Track active connections in Set
- Clean up on client disconnect

---

### Story 3: Dashboard Sparklines Visualization
**Effort:** 2 hours
**Status:** Not Started

**As a** dashboard user
**I want** sparkline charts showing CPU/Memory/Instances trends
**So that** I can quickly identify patterns and issues

**Acceptance Criteria:**
- AC1: Three sparklines: CPU usage, Memory usage, Instance count
- AC2: Show last 5 minutes of data (60 data points at 5s intervals)
- AC3: Current value displayed next to each sparkline
- AC4: Auto-scale Y-axis based on data range
- AC5: Color-coded: Green (good), Orange (warning), Red (critical)

**Technical Notes:**
- Use HTML5 Canvas for lightweight rendering (no chart.js)
- Load historical data on page load
- Update via SSE for real-time

---

### Story 4: Metrics Export API (CSV/JSON)
**Effort:** 30 minutes
**Status:** Not Started

**As a** data analyst
**I want** to export metrics as CSV or JSON
**So that** I can analyze data in Excel, R, or Python

**Acceptance Criteria:**
- AC1: GET /api/metrics/export?format=csv&hours=24
- AC2: Support format=csv and format=json
- AC3: Max 168 hours (7 days) export
- AC4: Proper Content-Type and Content-Disposition headers
- AC5: Query completes in <5 seconds for 7-day export

**Technical Notes:**
- Stream results to avoid memory issues
- CSV format: timestamp,cpu_percent,mem_used_mb,...

---

### Story 5: CDP Activity Tracking Core
**Effort:** 2 hours
**Status:** Not Started

**As an** AI supervisor
**I want** to track CDP commands per instance (screenshots, clicks, typing)
**So that** I can detect when AI is faking work vs doing real testing

**Acceptance Criteria:**
- AC1: CDPActivityTracker class intercepts CDP messages in WebSocket gateway
- AC2: Categorizes commands: screenshots, clicks, keyboard, navigation, queries
- AC3: In-memory counters per instance with <0.1% CPU overhead
- AC4: Health score calculation (0-100) based on interaction ratios
- AC5: Pattern detection: screenshot_spam, query_loop, active_testing, etc.

**Technical Notes:**
- Integrate in websocket-gateway.js message handler
- Hash map for O(1) method lookup
- No message content logging (privacy)

---

### Story 6: CDP Activity Dashboard UI
**Effort:** 2 hours
**Status:** Not Started

**As an** AI supervisor
**I want** to see per-instance CDP activity with health scores
**So that** I can identify problematic AI behavior in real-time

**Acceptance Criteria:**
- AC1: Instance activity cards showing: screenshots, clicks, typing, navigations, queries
- AC2: Health score badge: Green (80-100), Orange (60-79), Red (0-59)
- AC3: Behavior pattern emoji: ✅ active_testing, 🚩 screenshot_spam, 🔄 query_loop
- AC4: Activity ratio: "X screenshots per interaction"
- AC5: Alert badges for suspicious patterns

**Technical Notes:**
- Activity bar visualization (stacked segments by category)
- Real-time updates via SSE
- Alert notifications with toast UI

---

### Story 7: CDP Alert System
**Effort:** 30 minutes
**Status:** Not Started

**As an** AI supervisor
**I want** real-time alerts when suspicious AI behavior is detected
**So that** I can intervene before wasting resources

**Acceptance Criteria:**
- AC1: Alert types: screenshot_spam, query_loop, navigation_loop, idle
- AC2: Severity levels: high, medium, low
- AC3: Alerts broadcast via SSE to dashboard
- AC4: Toast notification appears on alert
- AC5: Alert history stored in CDP activity table

**Technical Notes:**
- Heuristics: >50 screenshots + 0 interactions = screenshot_spam
- >500 queries in 60s = query_loop
- >5 minutes idle = idle alert

---

## Acceptance Criteria (Epic-Level)

### Functional
- ✅ System metrics collected and stored with 7-day retention
- ✅ Real-time dashboard updates via SSE
- ✅ Sparklines show CPU, Memory, Instances trends
- ✅ CSV/JSON export API works
- ✅ CDP activity tracked per instance
- ✅ AI behavior patterns detected and visualized
- ✅ Alerts fire for suspicious patterns

### Non-Functional
- ✅ Disk usage <10MB after 7 days (target: 9.5MB)
- ✅ CPU overhead <1% (target: 0.045%)
- ✅ No memory leaks from SSE connections
- ✅ Query latency <100ms for 1-hour range
- ✅ No crashes due to metrics system

### Quality
- ✅ All stories have E2E Playwright tests
- ✅ No HTTP 4xx/5xx errors in tests
- ✅ No console errors/warnings
- ✅ Screenshots reviewed and approved
- ✅ Code follows existing patterns

## Dependencies

- sqlite3 npm package (500KB) - ONLY new dependency
- Existing: Express, WebSocket gateway, Dashboard HTML

## Testing Strategy

### Unit Tests
- MetricsStore class methods
- CDPActivityTracker categorization logic
- Health score calculation

### Integration Tests
- SSE connection lifecycle
- SQLite concurrent reads/writes
- Cleanup job execution

### E2E Tests (Playwright)
- Dashboard displays sparklines
- Real-time updates work
- Export downloads CSV
- CDP activity cards render
- Alerts display on suspicious behavior

## Rollout Plan

1. **Phase 1 (MVP - 4h)**: Stories 1, 2, 3 - Basic metrics with sparklines
2. **Phase 2 (CDP - 3h)**: Stories 5, 6, 7 - AI activity tracking
3. **Phase 3 (Polish - 1h)**: Story 4 + documentation + testing

## Success Metrics

- Zero production incidents from metrics system
- <10MB disk usage validated after 7 days
- <1% CPU overhead validated via monitoring
- At least 1 false work detection in first week
- Positive user feedback on observability

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite corruption | High | WAL mode + NORMAL sync + backup strategy |
| SSE connection leaks | Medium | Max connection limit + cleanup on disconnect |
| Disk space exhaustion | Medium | Strict 7-day retention + VACUUM |
| Performance degradation | Low | Profiling + query optimization |

## Out of Scope (Future)

- Prometheus endpoint (avoid bloat)
- Alerting to external systems (Slack, PagerDuty)
- Per-user metrics (multi-tenancy)
- Machine learning for anomaly detection
- Downsampling older data
