# Pillar 03: System Optimization

> **Eliminating bottlenecks with physics, telemetry, and mechanical sympathy—never guesswork**

Premature optimization adds complexity for zero gain; disciplined optimization starts with measurement, targets the dominant bottleneck, and respects hardware, database, and caching physics.

**Core Mental Model:** Optimization is a closed scientific loop: Define SLO -> Measure (USE/RED + Profiles) -> Form Hypothesis -> Benchmark Change -> Verify Tail Latency & Cost. Guessing without a flamegraph optimizes the 2% while ignoring the 80%.

---

## Performance Physics, Little's Law & Tail Latency (25 min)

### Core Knowledge (Mechanics & Laws)

- Latency vs Throughput vs Goodput: Latency is duration of one operation; Throughput is ops/sec; Goodput is useful, non-retried, non-failed ops/sec.
- Little's Law: L = lambda * W (Average concurrency in system = Arrival rate x Average residence time). As latency W spikes under saturation, concurrency L explodes and exhausts threads/connections.
- Queueing Theory & Utilization Hockey Stick: as resource utilization approaches 100%, wait time grows nonlinearly (~1/(1 - rho)), causing p99 latency spikes long before 100% CPU.
- Tail Latency Amplification: if a user request fans out to N=20 parallel backends each with 1% slow requests (p99), the probability of at least one slow backend is 1 - 0.99^20 = 18.2%!

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Averages lie! If 99 requests take 10ms and 1 takes 10s, your mean is ~110ms while your VIP users experience 10-second timeouts. Always track p50, p95, p99, and p99.9.
- When a system saturates, adding retries without backoff increases lambda in Little's Law, pushing W higher in a death spiral (metastable failure).
- Instrument with RED (Rate, Errors, Duration) for services and USE (Utilization, Saturation, Errors) for infrastructure resources before touching a single line of code.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Hedged Requests (Speculative Retry)** | Dramatically cuts p99 tail latency caused by transient GC pauses or noisy neighbors. | Increases baseline load by ~1-5% (if triggered at p95 delay); dangerous without a strict hedge budget during outages. | Idempotent, low-cost read paths with large fan-out and strict p99 SLOs. |
| **Latency vs Throughput Batching** | Amortizes syscall, network, and fsync overhead—10x throughput gain. | Adds micro-batching wait delay (linger.ms) to individual request latency. | High-volume telemetry, event ingestion, Kafka producers, and bulk DB writes. |

### Common Anti-Patterns

- Optimizing CPU micro-benchmarks when 92% of wall-clock latency is serial database/network I/O.
- Reporting only average latency in executive dashboards.
- Disabling health/circuit protections during high utilization, triggering metastable collapse.

> **Rule of Thumb:** Never optimize what you haven't profiled under realistic concurrency. Use a flamegraph to find the widest bar, not the prettiest loop.

---

## Compute, Memory, I/O & Connection Efficiency (25 min)

### Core Knowledge (Mechanics & Laws)

- Latency Hierarchy: L1 cache (~1ns) < RAM (~100ns) < NVMe SSD (~25-100us) < Same-AZ Network RTT (~0.5ms) < Cross-Region RTT (~50-150ms).
- Connection Pooling: TCP + TLS handshakes cost multiple RTTs; pooling amortizes setup cost. Optimal DB pool size is surprisingly small: roughly (CPU_cores * 2) + effective_spindle_count—not 500 per pod.
- Lock Contention & Context Switching: oversubscribing CPU threads or coarse-grained locks serializes multi-core execution and thrash CPU caches.
- Zero-Copy & Streaming: avoid loading multi-hundred-MB payloads into heap memory (causes GC pauses and OOMs); stream buffers or use sendfile/mmap where applicable.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Massive DB connection pools (e.g., 100 pods x 50 connections = 5,000 DB connections) destroy Postgres throughput via context switching and lock contention. Put PgBouncer/proxy pooling in front and keep active server connections small.
- Serializing/deserializing huge JSON blobs on hot paths often burns more CPU than business logic; switch hot internal hops to binary Protobuf/MsgPack or project only needed fields.
- Compression (zstd/gzip) saves bandwidth and storage, but high compression levels burn CPU—match codec and level to whether you are network-bound or CPU-bound.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Async Non-Blocking Event Loop (Node/Netty/Tokio)** | Handles tens of thousands of concurrent I/O-bound connections with minimal memory per connection. | One blocking CPU call or synchronous driver freezes the entire worker loop. | I/O-heavy gateways, proxies, chat/streaming servers. |
| **Bounded Thread Pool / Virtual Threads** | Linear readable code, natural isolation for mixed workloads; virtual threads give high concurrency cheaply. | OS threads cost ~1MB stack + context switch overhead if unbounded; still constrained by downstream DB pool limits. | CPU+I/O business services where synchronous readability and strict concurrency caps matter. |

### Common Anti-Patterns

- Creating a new HTTP/DB client per request (ephemeral port exhaustion + TLS handshake penalty).
- Unbounded queues in front of worker pools (causes OOM crashes and stale timeouts).
- Loading entire paginated exports into RAM instead of cursor streaming.

> **Rule of Thumb:** Count your network round trips first. Eliminating 5 sequential 2ms RPCs saves 10ms instantly; optimizing a hash map saves 10 microseconds.

---

## Database Access & Caching Mastery (30 min)

### Core Knowledge (Mechanics & Laws)

- N+1 Query Problem: fetching N parent rows in 1 query and issuing N separate queries for children—turns 2ms into 200ms+ under load.
- Composite Indexes & Leftmost Prefix Rule: an index on (tenant_id, status, created_at) serves queries filtering on tenant_id, or (tenant_id, status), NOT status alone; covering indexes avoid heap lookups.
- Caching Patterns: Cache-Aside (lazy load), Read-Through, Write-Through, Write-Behind (async flush—risks data loss if cache crashes).
- Cache Failure Modes: Cache Stampede / Thundering Herd (popular key expires -> 1,000 requests hit DB simultaneously), Cache Penetration (queries for non-existent keys bypass cache), Hot Keys.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Offset pagination (`OFFSET 500000 LIMIT 20`) forces the DB to scan and discard 500,000 rows. Always use keyset/cursor pagination (`WHERE id > last_id LIMIT 20`) on deep datasets.
- Prevent cache stampedes using Singleflight (request coalescing per key in-process/distributed) or Probabilistic Early Expiration (XFetch) + jittered TTLs.
- Never add a cache to hide an unindexed `SELECT *` query—when the cache cold-starts or flushes, your unindexed DB will immediately melt down.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Cache-Aside (Lazy Population)** | Cache only holds actually requested data; resilient to cache downtime (degrades to DB). | Cache miss latency penalty; potential stale read window between DB write and cache invalidation. | Default general-purpose read caching for most web/API workloads. |
| **Local In-Memory L1 + Distributed Redis L2** | Sub-millisecond reads for extreme hot keys without saturating Redis network NIC. | Cross-node invalidation complexity; tolerable only with short TTLs (1-10s) or pub/sub invalidation. | Read-heavy config, feature flags, or viral hot keys. |

### Common Anti-Patterns

- Caching mutable user-specific data with identical TTLs (synchronized expiration storms).
- Negative caching omission: allowing bot attacks on random missing IDs to punch straight through Redis to primary SQL.
- Using `SELECT *` with ORMs that silently eager-load megabytes of unused text/JSON columns.

> **Rule of Thumb:** Fix the query plan and indexes FIRST, add connection pooling SECOND, and add caching THIRD—with explicit stampede and negative-lookup protection.

---
