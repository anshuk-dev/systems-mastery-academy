# Assessment & Distractor Analysis — 03: System Optimization

10 scenario-based engineering questions grounded in verified primary engineering literature.

---

## OPT-01 — Little's Law & Saturation Collapse (`Senior`)

**Scenario:** Your API normally serves 400 req/s with 50ms average latency. A downstream fraud API degrades from 20ms to 2,000ms (2s). Your app runs 10 pods with 50 worker threads each (500 total threads). Within seconds, all 500 threads hang and even non-fraud health checks time out.

**Question:** Using Little's Law (L = lambda * W), what mathematically caused total pod thread exhaustion?

- **A.** The garbage collector stopped all threads because JSON payloads grew.
- **B.** With arrival rate lambda = 400 req/s and residence time jumping to W = 2.0s, required concurrency became L = 400 * 2.0 = 800 concurrent threads—exceeding your 500-thread capacity and queuing every incoming request behind stalled downstream calls.
- **C.** 400 req/s exceeded the 1Gbps Linux loopback interface limit.
- **D.** The CPU hit 100% computing TLS checksums.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Little's Law (`L = lambda * W`) governs concurrency under steady arrivals. Before degradation, `L = 400 * 0.05 = 20` active threads (plenty of headroom in 500). When downstream latency jumped 40x to 2s, required concurrency jumped to `400 * 2.0 = 800 > 500`, saturating all worker threads, failing health probes, and triggering cascading restarts.

#### Option & Distractor Analysis

- **A (Distractor — _Blaming GC without evidence when concurrency math explains everything_):** Threads are blocked waiting on downstream socket reads, not burning CPU or allocating garbage.
- **B (Correct — Key Insight):** Latency spikes linearly multiply concurrency (`L = lambda * W`), exhausting fixed thread/connection pools almost instantly.
- **C (Distractor — _Imaginary network bandwidth ceiling_):** 400 requests/sec of typical API JSON is a few megabits/sec, orders of magnitude below 1Gbps.
- **D (Distractor — _Confusing I/O wait saturation with CPU saturation_):** Worker threads waiting on slow 2s socket I/O use near-zero CPU while completely blocking request intake.

> **Wisdom Takeaway:** Slow dependencies are deadlier than fast crashes: rising W multiplies concurrency L until every thread pool upstream suffocates.

#### Verified Primary Sources

- [Little's Law (Operations Research, 1961)](https://en.wikipedia.org/wiki/Little%27s_law) — John D. C. Little (via Wikipedia)
- [Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) — David Yanacek (AWS Builders' Library)

</details>

---

## OPT-02 — Tail Latency Amplification & Hedged Requests (`Staff / Principal`)

**Scenario:** A Search Aggregator fans out in parallel to 25 storage shards to build a results page. Each individual shard has an impressive p99 latency of 40ms (99% complete <= 40ms, 1% take 400ms due to occasional compaction/GC). Yet users complain the aggregator exceeds 400ms nearly 1 in 4 searches.

**Question:** Why does p99 fail so dramatically at the aggregator, and what optimization fixes it for idempotent shard reads?

- **A.** The aggregator is running single-threaded; add async threads.
- **B.** Tail latency amplification: the probability all 25 shards are fast is `0.99^25 = 77.8%`, meaning `22.2%` of requests wait on at least one 400ms straggler! Issue hedged requests (send a backup read to a replica if a shard hasn't responded by its p95, ~15ms, with a strict hedge budget).
- **C.** Replace parallel fan-out with sequential calls to the 25 shards so network congestion drops.
- **D.** Lower the aggregator's shard timeout to 10ms and return empty results from timed-out shards.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** In parallel fan-out, user latency equals the *maximum* of N shard latencies. Even at 99% per-shard reliability, across 25 shards `1 - 0.99^25 = 22.2%` hit the tail! Hedged requests (sending a speculative duplicate read to another replica only after the p95 delay threshold passes, plus a global hedge budget to protect during outages) slash tail latency while adding <=5% extra load.

#### Option & Distractor Analysis

- **A (Distractor — _Misdiagnosing parallel straggler math as client concurrency_):** Even with infinitely fast parallel async I/O, waiting for 25 responses means waiting for the slowest 1 of 25.
- **B (Correct — Key Insight):** Parallel fan-out amplifies tail probabilities exponentially (`1 - p^N`); delayed hedged reads cut stragglers without flooding replicas.
- **C (Distractor — _Turning 40ms parallel into 25x latency sequential_):** Sequential calls sum all 25 shard latencies (even 25 * 10ms = 250ms baseline, plus any straggler!).
- **D (Distractor — _Sacrificing result correctness via ultra-aggressive timeouts_):** A 10ms timeout drops valid shards routinely, degrading search relevance and user trust.

> **Wisdom Takeaway:** At scale, the average doesn't matter—when fanning out across N components, everyone experiences the tail.

#### Verified Primary Sources

- [The Tail at Scale (CACM, 2013)](https://research.google/pubs/the-tail-at-scale/) — Jeffrey Dean & Luiz André Barroso (Google)

</details>

---

## OPT-03 — Database Connection Pool Sizing (`Senior`)

**Scenario:** Your Kubernetes cluster runs 80 Python API pods. An engineer notices occasional `QueuePool limit reached` errors during traffic bursts and increases `pool_size` from 10 to 100 connections per pod against a 16-vCPU PostgreSQL primary. Suddenly, DB CPU spikes to 100% and query throughput drops by 60%.

**Question:** Why did raising the pool size to 8,000 potential connections wreck database throughput, and what is the optimal architecture?

- **A.** PostgreSQL drops packets when >1,000 ports open; switch to MySQL.
- **B.** 80 pods x 100 connections flooded Postgres with thousands of active backend processes fighting over 16 CPU cores, causing massive context-switching, spinlock contention, and cache thrashing. Keep active Postgres connections small (near `cores * 2 + spindles`, ~32-64) via a transaction pooler like PgBouncer.
- **C.** Set `pool_size` to 1 per pod and disable TCP keepalive.
- **D.** Increase PostgreSQL `max_connections` to 10,000 and double pod count to 160.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Each Postgres connection spawns an OS backend process. With 16 vCPUs, only 16 queries truly execute simultaneously; having hundreds or thousands of concurrent active connections causes OS scheduler thrashing and internal buffer/lock contention. Placing PgBouncer (transaction-mode pooling) in front keeps thousands of app pods multiplexed onto ~32–64 active DB backends—maximizing throughput.

#### Option & Distractor Analysis

- **A (Distractor — _Blaming the database vendor for queueing physics_):** Any database on 16 cores suffers severe lock/CPU contention with thousands of concurrent active threads.
- **B (Correct — Key Insight):** Throughput peaks at a small active connection count (~2x-4x CPU cores); multiplex excess app pods through a pooler like PgBouncer.
- **C (Distractor — _Artificial starvation + handshake overhead_):** 1 connection per pod with disabled keepalive forces frequent TCP/TLS re-handshakes and stalls concurrent async coroutines inside a pod.
- **D (Distractor — _Removing the safety cap and adding more attackers_):** Raising `max_connections` to 10,000 and doubling pods makes lock contention and RAM exhaustion (each Postgres backend consumes several MB) catastrophically worse.

> **Wisdom Takeaway:** More database connections almost never equal more database throughput—a 16-core DB runs fastest with dozens of active connections, not thousands.

#### Verified Primary Sources

- [About Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing) — Brett Wooldridge (HikariCP Wiki)

</details>

---

## OPT-04 — Cache Stampede (Thundering Herd) Prevention (`Senior`)

**Scenario:** Your homepage product catalog JSON lives in Redis under one hot key (`homepage:featured`, 5-minute TTL) serving 15,000 RPS. Every 5 minutes sharp, Redis evicts the key and for 800ms all 15,000 RPS miss the cache and execute the heavy SQL aggregation concurrently, spiking Postgres CPU to 100%.

**Question:** Which solution cleanly prevents this periodic 5-minute database meltdown?

- **A.** Increase Redis memory maxmemory by 4x.
- **B.** Combine Request Coalescing (Singleflight: only 1 worker rebuilds the key while concurrent callers await that single result or serve stale) with Probabilistic Early Expiration (XFetch) / background refresh + jittered TTLs.
- **C.** Set the Redis TTL to `infinite` (never expire) and never invalidate.
- **D.** Add 5 more Redis read replicas.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** The stampede happens because thousands of requests observe a cache miss simultaneously during the 800ms rebuild window. Singleflight (or a distributed lock + serve-stale-while-revalidate) ensures only ONE query hits Postgres per miss, while Probabilistic Early Expiration refreshes hot keys proactively just before TTL expiry without synchronizing misses.

#### Option & Distractor Analysis

- **A (Distractor — _Throwing RAM at a TTL-expiration problem_):** The key wasn't evicted due to OOM; it expired deterministically at 5 minutes. Extra Redis RAM doesn't change TTL expiry.
- **B (Correct — Key Insight):** Coalesce concurrent misses (Singleflight) and refresh hot keys asynchronously before expiration so only 1 DB query ever runs.
- **C (Distractor — _Trading stampedes for permanently stale pricing/inventory_):** Never expiring or invalidating product data shows wrong prices and out-of-stock items forever—plus a Redis restart still causes a cold-start stampede.
- **D (Distractor — _Scaling the cache layer when the problem is a cache miss_):** All 5 Redis replicas expire the same key at the exact same second and still forward 15,000 misses to Postgres.

> **Wisdom Takeaway:** Never let 10,000 concurrent cache misses each independently ask the database the exact same question—coalesce with Singleflight or refresh before expiry.

#### Verified Primary Sources

- [Optimal Probabilistic Cache Stampede Prevention (XFetch)](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf) — Vattani, Chierichetti & Lowenstein (2015)
- [Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) — Microsoft Azure Architecture Center

</details>

---

## OPT-05 — Keyset Pagination vs Deep Offset (`Intermediate`)

**Scenario:** Your mobile feed endpoint runs `SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?`. Page 1 takes 3ms, but users scrolling to Page 500 (`OFFSET 10000`) or bots scraping `OFFSET 500000` cause 2-second DB queries.

**Question:** Why does `OFFSET` degrade linearly with depth, and what fixes it?

- **A.** SQL databases always sort in memory on `OFFSET`; add more RAM.
- **B.** `OFFSET 500000` forces the database engine to scan and discard 500,000 index/heap rows on every page request. Switch to Keyset (Cursor) Pagination (`WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 20`) backed by a composite index `(user_id, created_at DESC, id DESC)` for constant O(log N) seek time.
- **C.** Cache every page from 1 to 25,000 in Redis on every new post.
- **D.** Replace `LIMIT 20` with `LIMIT 1000` so clients fetch fewer pages.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** SQL `OFFSET K` cannot jump directly to row K in a filtered B-Tree; it must walk and count K rows before returning the next 20. Keyset/Cursor pagination seeks directly to the exact tuple `(last_created_at, last_id)` via B-Tree binary search in O(log N) regardless of depth, and also avoids duplicate/skipped rows when new posts arrive.

#### Option & Distractor Analysis

- **A (Distractor — _RAM doesn't eliminate linear row scanning/counting_):** Even fully cached in RAM (`shared_buffers`), walking and discarding 500,000 rows per query burns CPU and degrades linearly with depth.
- **B (Correct — Key Insight):** Seeking directly from the last seen `(created_at, id)` cursor turns O(offset) linear scans into O(log N) B-Tree lookups.
- **C (Distractor — _Exploding write amplification on every insert_):** Recomputing or invalidating 25,000 cached pages every time a user inserts a post turns every write into massive cache churn.
- **D (Distractor — _Increasing payload size and initial load latency_):** Fetching 1,000 rows on initial page load wastes bandwidth, memory, and DB I/O when users typically read only the first 20 items.

> **Wisdom Takeaway:** For feeds, logs, and APIs over large datasets, `OFFSET` is a ticking latency bomb—default to cursor/keyset pagination.

#### Verified Primary Sources

- [We Need Tooling for Keyset Pagination (No Offset)](https://use-the-index-luke.com/no-offset) — Markus Winand (Use The Index, Luke)
- [Concatenated Indexes (Leftmost Prefix Rule)](https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys) — Markus Winand (Use The Index, Luke)

</details>

---

## OPT-06 — Composite Index Leftmost Prefix & Covering Indexes (`Intermediate`)

**Scenario:** A `transactions` table (100M rows) has an index `CREATE INDEX idx_tx ON transactions (merchant_id, status, created_at)`. Yet the query `SELECT id, amount FROM transactions WHERE status = 'FAILED' AND created_at > now() - interval '1 hour'` performs a 12-second sequential table scan.

**Question:** Why did PostgreSQL ignore `idx_tx`, and how do you optimize this query?

- **A.** PostgreSQL only uses indexes when `SELECT *` is used.
- **B.** Because `merchant_id` is the leading column of the composite B-Tree index and isn't in the `WHERE` clause, the leftmost prefix rule prevents efficient range seeking on `(status, created_at)`. Add a partial or composite index on `(status, created_at) INCLUDE (id, amount)` (or `WHERE status = 'FAILED'`) so it resolves as an Index-Only Scan.
- **C.** Run `VACUUM FULL` every 5 minutes so Postgres remembers the old index.
- **D.** Convert `status` from `VARCHAR` to `TEXT`.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** A composite B-Tree `(A, B, C)` is sorted first by `A`, then `B`, then `C`—like a phone book sorted by `(City, LastName, FirstName)`. Searching without `A` (`merchant_id`) scatters matching `status` rows across every merchant subtree. Creating `(status, created_at) INCLUDE (id, amount)` (or a partial index `WHERE status = 'FAILED'`) lets Postgres seek directly and even skip heap table fetches via an Index-Only Scan.

#### Option & Distractor Analysis

- **A (Distractor — _Backwards belief about `SELECT *`_):** `SELECT *` actually prevents Index-Only Scans because extra columns force heap fetches; projecting only needed columns enables covering indexes.
- **B (Correct — Key Insight):** Match composite index column order to equality predicates first, range predicates second, and `INCLUDE` projected columns for Index-Only Scans.
- **C (Distractor — _Maintenance cargo-culting_):** `VACUUM FULL` takes an exclusive table lock and reclaims bloat, but cannot make a non-leading-column B-Tree searchable by `status`.
- **D (Distractor — _Irrelevant column type swap_):** In PostgreSQL `VARCHAR` and `TEXT` share the exact same underlying varlena storage and B-Tree mechanics.

> **Wisdom Takeaway:** Design composite indexes like phone books: equality columns first, range/sort columns next, and `INCLUDE` payload columns to eliminate table heap hops.

#### Verified Primary Sources

- [Concatenated Indexes (Leftmost Prefix Rule)](https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys) — Markus Winand (Use The Index, Luke)
- [Index-Only Scan / Covering Indexes](https://use-the-index-luke.com/sql/clustering/index-only-scan-covering-index) — Markus Winand (Use The Index, Luke)

</details>

---

## OPT-07 — Profiling First & N+1 Detection (`Senior`)

**Scenario:** A `/dashboard` endpoint takes 950ms p95. A developer guesses JSON serialization is slow and spends 3 days swapping Jackson for a faster JSON library, gaining only 4ms. Flamegraphs and SQL traces then show 1 query for 80 projects followed by 80 separate `SELECT * FROM tasks WHERE project_id = ?` queries and 80 `GET /users/:id` calls.

**Question:** What two optimization principles were violated, and what fixes the endpoint?

- **A.** Always rewrite JSON serializers in C++ first; keep the 80 queries.
- **B.** Profile before optimizing (measuring showed I/O round trips dominated 99% of time, not CPU serialization), and eliminate the N+1 query/RPC loop using a batched `WHERE project_id = ANY(?)` SQL query and a batched `POST /users:batchGet` (or DataLoader) call.
- **C.** Move the 80 SQL queries into 80 parallel cron jobs.
- **D.** Increase database CPU cores from 4 to 64 so each of the 80 queries runs faster.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Guessing without profiling optimizes a 4ms CPU step while ignoring 940ms of serial network round trips! Replacing 80 sequential SQL queries and 80 HTTP calls with 1 batched SQL query (`JOIN` or `ANY($1)`) and 1 batched user lookup slashes network RTTs from 161 down to 2, often cutting latency from 950ms to <25ms.

#### Option & Distractor Analysis

- **A (Distractor — _Sunk-cost micro-optimization_):** Serializing 80 items in memory takes ~2-5ms in any modern runtime; you cannot CPU-optimize away 160 network round trips.
- **B (Correct — Key Insight):** Measure with distributed traces/flamegraphs first, then collapse N+1 round trips into batched queries.
- **C (Distractor — _Cron jobs don't serve live synchronous dashboard requests_):** Unless precomputing materialized views (a much bigger architectural choice), arbitrary cron jobs don't fix live request queries.
- **D (Distractor — _Scaling CPU for a sequential network-RTT bottleneck_):** Even if each SQL query ran in 0.1ms on 64 cores, 160 sequential network round trips over TCP still burn hundreds of milliseconds.

> **Wisdom Takeaway:** Never optimize by intuition: look at a trace/flamegraph first, and crush network round trips (N+1s) before touching micro-benchmarks.

#### Verified Primary Sources

- [The USE Method](https://www.brendangregg.com/usemethod.html) — Brendan Gregg
- [The RED Method: How to Instrument Your Services](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/) — Tom Wilkie (Grafana Labs)

</details>

---

## OPT-08 — Negative Caching & Cache Penetration (`Staff / Principal`)

**Scenario:** A botnet scrapes `/products/{random_uuid}` at 20,000 RPS with invalid UUIDs. Your Cache-Aside layer checks Redis, gets a miss for every fake UUID, queries PostgreSQL `WHERE id = ?`, gets 0 rows, and skips writing to Redis because 'there's nothing to cache'. PostgreSQL falls over.

**Question:** What cache vulnerability is this, and how do you harden the read path?

- **A.** Cache Stampede; increase product cache TTL from 1 hour to 24 hours.
- **B.** Cache Penetration; defend with Negative Caching (store a short-TTL sentinel like `NULL_ENTRY` for 60s on misses) and/or an in-memory Bloom Filter / input format validation in front of Redis/DB to reject non-existent IDs before touching Postgres.
- **C.** Hot-Key skew; enable Redis Cluster sharding.
- **D.** Write-Behind lag; switch Redis to AOF `fsync=always`.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Cache Penetration happens when queries for non-existent keys bypass the cache every single time and hit the backing database directly. Negative caching (caching 'does not exist' with a short 30–120s TTL, carefully invalidating if created) plus a Bloom filter / strict ID pre-check absorbs bot floods in RAM before PostgreSQL sees a single query.

#### Option & Distractor Analysis

- **A (Distractor — _Misidentifying Penetration as Stampede_):** Stampede is one hot valid key expiring; Penetration is millions of *non-existent* distinct keys bypassing the cache completely.
- **B (Correct — Key Insight):** Caching absence (with short TTLs) or checking a Bloom Filter turns uncached 404 floods into cheap O(1) memory hits.
- **C (Distractor — _Adding shards when every key is a unique miss_):** 20,000 distinct random UUIDs already hash evenly across Redis shards—and still miss on every shard, hitting Postgres at 20,000 RPS.
- **D (Distractor — _Tuning Redis disk persistence for a read-miss attack_):** AOF `fsync=always` slows down Redis writes and has zero effect on read-miss penetration.

> **Wisdom Takeaway:** Your cache must protect the database from 'not found' floods too—validate shapes early, negative-cache misses briefly, or filter with a Bloom filter.

#### Verified Primary Sources

- [Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) — Microsoft Azure Architecture Center
- [Optimal Probabilistic Cache Stampede Prevention (XFetch)](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf) — Vattani, Chierichetti & Lowenstein (2015)

</details>

---

## OPT-09 — Event Loop Blocking & Mixed CPU/IO Workloads (`Senior`)

**Scenario:** A Node.js API Gateway normally handles 8,000 RPS at 12ms p99 using <25% CPU. After a team adds PDF thumbnail generation and large 5MB regex/bcrypt parsing directly inside one route handler, ALL unrelated `/health` and `/auth` routes freeze for 300–900ms every few seconds.

**Question:** Why does one route freeze the entire gateway, and how do you restore low p99 latency?

- **A.** Node.js garbage collection runs on TCP sockets; switch from JSON to XML.
- **B.** CPU-bound synchronous work (PDF/bcrypt/catastrophic regex) blocks the single-threaded JavaScript event loop, starving every queued I/O callback on that process. Offload CPU-heavy tasks to worker threads / separate isolated worker services, and enforce async non-blocking limits.
- **C.** Increase `UV_THREADPOOL_SIZE` to 1,024 while keeping PDF rendering synchronous in the handler.
- **D.** Add more async `Promise.all()` wrappers around the synchronous PDF function.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Single-threaded event loops (Node.js, Python asyncio, single-threaded Redis) achieve huge I/O concurrency ONLY when every callback yields in microseconds. A 300ms synchronous CPU block freezes the entire event loop for all concurrent requests on that process. Isolating heavy CPU work into dedicated worker pools/services keeps the I/O event loop responsive.

#### Option & Distractor Analysis

- **A (Distractor — _Nonsensical diagnosis_):** XML parsing is actually heavier than JSON and doesn't fix synchronous event-loop CPU starvation.
- **B (Correct — Key Insight):** Never execute synchronous CPU-intensive or blocking work on an asynchronous I/O event-loop thread.
- **C (Distractor — _Thinking libuv threadpool helps main-thread synchronous JS_):** `UV_THREADPOOL_SIZE` only expands background C++ libuv workers (fs/dns/crypto async APIs); synchronous JS execution in the handler still runs on the single main event-loop thread.
- **D (Distractor — _`Promise.all` illusion of parallelism_):** Wrapping synchronous CPU code in `async/await` or `Promise.all` still executes sequentially on the single main JS thread.

> **Wisdom Takeaway:** Event-loop architectures scale I/O concurrency brilliantly and collapse catastrophically the moment someone puts synchronous CPU work on the loop.

#### Verified Primary Sources

- [The USE Method](https://www.brendangregg.com/usemethod.html) — Brendan Gregg
- [The RED Method: How to Instrument Your Services](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/) — Tom Wilkie (Grafana Labs)

</details>

---

## OPT-10 — Batching vs Latency Trade-off & Streaming (`Intermediate`)

**Scenario:** An IoT Telemetry Ingestion Service receives 50,000 sensor events/sec and inserts each event as a single-row `INSERT INTO readings ...` transaction into PostgreSQL/TimescaleDB with `synchronous_commit = on`. Disk fsync IOPS hits 100% and ingestion falls behind.

**Question:** Which optimization gives the largest immediate throughput jump at the lowest complexity?

- **A.** Micro-batch incoming events in memory (e.g., flush every 500 events OR every 50ms, whichever comes first) using bulk `COPY` / multi-row `INSERT`, amortizing per-transaction fsync and network RTT overhead by 100x+.
- **B.** Open 50,000 concurrent connections so every sensor writes in parallel.
- **C.** Disable all indexes AND delete primary keys permanently while keeping 50,000 single-row transactions/sec.
- **D.** Store every single sensor reading as a separate `.json` file on NFS.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **A**

**Explanation:** Every individual ACID `INSERT` pays a network RTT, WAL write, and disk `fsync()` penalty. Micro-batching 500 rows (or capping max wait at 50ms) collapses 50,000 WAL flushes/sec down to ~100 bulk `COPY` flushes/sec—boosting write throughput by 10x–100x with bounded 50ms ingestion delay.

#### Option & Distractor Analysis

- **A (Correct — Key Insight):** Amortizing network round trips and disk `fsync()` via bounded time/size micro-batching unlocks massive write throughput.
- **B (Distractor — _Multiplying concurrency into a disk fsync bottleneck_):** 50,000 concurrent connections thrash CPU and still demand 50,000 WAL commits unless group-commit/batching occurs.
- **C (Distractor — _Breaking queryability without removing the per-tx fsync bottleneck_):** 50,000 separate transactions/sec still choke on WAL `fsync()` and network RTT even on an unindexed heap table.
- **D (Distractor — _Catastrophic metadata I/O explosion_):** Creating 50,000 tiny files/sec on NFS obliterates filesystem metadata ops and makes querying impossible.

> **Wisdom Takeaway:** When write IOPS or network RTT bottlenecks ingestion, micro-batch with a tight `(max_count, max_wait_ms)` bound to trade milliseconds for orders-of-magnitude throughput.

#### Verified Primary Sources

- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann
- [About Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing) — Brett Wooldridge (HikariCP Wiki)

</details>

---
