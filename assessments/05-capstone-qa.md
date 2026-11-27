# Assessment & Distractor Analysis — 05: Integrated Systems Capstone

10 scenario-based engineering questions with detailed explanations and option-by-option distractor analysis.

---

## CAP-01 — Cross-Pillar Failure: Caching vs Consistency vs Integration (`Staff / Principal`)

**Scenario:** An E-commerce platform caches inventory counts in Redis (`TTL = 60s`), runs async order-fulfillment workers via Kafka, and recently scaled Checkout pods from 10 to 80. During a flash sale on 500 limited-edition sneakers, 1,400 customers successfully pay and receive confirmation emails before `inventory` finishes decrementing.

**Question:** Which combination of Integration, Optimization, and Scalability design errors caused the oversell, and what is the clean fix?

- **A.** Kafka delivered messages too fast; slow down Kafka consumers.
- **B.** Using a stale 60s cache + async eventual inventory check for a strict scarcity invariant! Keep authoritative atomic inventory reservation (`UPDATE inventory SET stock = stock - 1 WHERE sku = ? AND stock >= 1` or atomic Redis Lua reservation synced with DB) synchronously in the critical boundary, while keeping non-invariant side effects (emails, analytics, shipping labels) async via Outbox.
- **C.** Increase Redis TTL from 60s to 10 minutes so inventory doesn't fluctuate.
- **D.** Switch Checkout from REST to GraphQL so stock updates are typed.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Principal engineering wisdom separates *hard business invariants* (cannot sell 1,400 units of 500 physical sneakers) from *eventual side effects* (sending receipt emails). Caching stock for 60s and deferring deduction to an async queue guarantees overselling under flash concurrency. Atomic conditional reservation at the authoritative inventory boundary enforces correctness, while Outbox/Kafka scales downstream fulfillment asynchronously.

#### Option & Distractor Analysis

- **A (Distractor — _Blaming broker speed for an eventual-consistency invariant bug_):** Slower Kafka delivery actually widens the oversell window rather than narrowing it.
- **B (Correct — Key Insight):** Never cache or defer hard scarcity/financial invariants behind eventual consistency; reserve atomically at the source of truth and make only downstream side effects async.
- **C (Distractor — _Worsening staleness 10x_):** A 10-minute stale cache lets even more buyers pass validation after physical stock hits zero.
- **D (Distractor — _Wire protocol swap with zero effect on concurrency control_):** GraphQL provides typed schemas, not atomic transactional stock reservation.

> **Wisdom Takeaway:** Know which invariants MUST be strongly consistent synchronously (money, scarce inventory) and which can be eventual (emails, search, analytics).

</details>

---

## CAP-02 — Modularity vs Tail Latency vs Integration (`Staff / Principal`)

**Scenario:** A team decomposes an Order Page into 14 fine-grained microservices (`CurrencyService`, `TaxRateService`, `PromoService`, `RoundingService`, etc.) communicating synchronously over HTTP. Now rendering `/order-preview` takes 680ms p99 (budget: 150ms), requires 14 circuit breakers, and fails whenever any of the 14 services has a deploy hiccup.

**Question:** How do you diagnose and rebalance Modularity, Integration, and Optimization here?

- **A.** Keep all 14 microservices and enable HTTP gzip compression between them.
- **B.** Over-decomposition confused 'small functions' with 'network services'. Consolidate tightly coupled, chatty calculation modules (`Rounding`, `TaxRate`, `Currency`, `Promo`) into cohesive in-process modules inside one Pricing/Order Modular Monolith (turning 14 network RTTs into ~10 microseconds), and reserve service boundaries for genuinely independent scaling/ownership domains.
- **C.** Add a global Redis cache in front of `RoundingService`.
- **D.** Disable timeouts on all 14 HTTP clients so partial deploys don't trigger errors.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** A service boundary should wrap a coarse-grained business capability, not a 50-line helper function. Splitting pure pricing/rounding calculations across 14 synchronous network hops destroys both availability (`0.999^14`) and tail latency while adding massive operational overhead. Folding chatty, co-changing pieces back into a Modular Monolith restores sub-millisecond in-process calls while keeping internal module boundaries crisp.

#### Option & Distractor Analysis

- **A (Distractor — _Optimizing wire bytes while 14x network RTT + tail amplification dominates_):** Gzip on tiny pricing JSON payloads actually adds CPU latency and doesn't eliminate 14 serial/fan-out network hops or availability coupling.
- **B (Correct — Key Insight):** Cohesive, chatty logic belongs inside one process boundary; reserve network hops for true autonomous scaling or organizational boundaries.
- **C (Distractor — _Caching trivial CPU arithmetic over a network hop_):** Calling Redis over the network to round a currency number is ~1,000x slower than computing it in process!
- **D (Distractor — _Hiding outages via infinite hang_):** Disabling timeouts turns every minor downstream hiccup into complete thread-pool starvation across the platform.

> **Wisdom Takeaway:** Every network hop you add taxes latency, availability, and debuggability—only cross the network when the autonomy payoff genuinely exceeds the distributed tax.

</details>

---

## CAP-03 — Metastable Failure Cascade (`Staff / Principal`)

**Scenario:** Your platform normally handles 2,000 RPS smoothly at 35% DB CPU. A brief 10-second BGP route flap drops cache hit rate from 95% to 40%, pushing DB CPU to 100%, which pushes API latency from 40ms to 4s. The BGP flap heals in 10 seconds, yet 45 minutes later the entire platform is STILL wedged at 100% DB CPU and 4s latency.

**Question:** What phenomenon locked the system in a permanent degraded state after the trigger vanished, and how do you break the cycle?

- **A.** The BGP flap corrupted PostgreSQL's binary installation.
- **B.** Metastable Failure: high latency caused threads to saturate (`L = lambda * W`), client/gateway retries multiplied DB queries, and cache rebuilds kept timing out before repopulating Redis—creating a self-sustaining overload loop. Break it via fast load shedding / circuit breaking to let DB recover and Redis repopulate (Singleflight), plus retry budgets.
- **C.** Auto-scale API pods from 20 to 200 immediately so more pods hit the 100% saturated DB.
- **D.** Flush all remaining keys in Redis to start fresh.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Metastable failures occur when a transient trigger pushes a system into a bad feedback equilibrium (retries + timed-out cache rebuilds + GC/lock thrashing) that sustains itself even after normal external load resumes. Only dropping excess work (circuit breakers, load shedding, retry budgets) drops DB load below the knee of the utilization curve so caches warm and normal equilibrium returns.

#### Option & Distractor Analysis

- **A (Distractor — _Superstitious binary blame_):** Network route flaps don't corrupt database binaries; the system is trapped in queueing + retry dynamics.
- **B (Correct — Key Insight):** To escape a metastable failure state, you must deliberately cut incoming work (shed load + stop retries) below capacity until queues drain and caches warm.
- **C (Distractor — _Pouring gasoline on a database fire_):** Adding 180 more API pods opens more DB connections and sends even more retries into a 100% saturated database.
- **D (Distractor — _Dropping remaining 40% cache hits to 0%_):** Flushing Redis forces 100% of reads onto the already-collapsed database.

> **Wisdom Takeaway:** In a metastable outage, waiting it out fails—you must actively shed load and halt retries to drop utilization below the recovery threshold.

</details>

---

## CAP-04 — Read-Through Migration & Zero-Downtime Cutover (`Senior`)

**Scenario:** You are extracting `Notifications` out of a 12-year-old monolith into a new modular service (Strangler Fig). Millions of user notification preferences still live in the monolith's `users` table, and legacy monolith code still updates them in 18 places while you build the new service.

**Question:** How do you integrate and synchronize data cleanly during the multi-week transition without losing updates or breaking rollback?

- **A.** Take a one-time `pg_dump` on Monday and tell users not to change preferences for 3 weeks.
- **B.** Use CDC/Outbox from the monolith's `users` preference columns to stream live updates into the new Notifications DB, run shadow read-parity checks comparing old vs new results, cut over reads first via feature flag, then flip writes to the new service (with reverse-sync or clean cutover) once parity hits 100%.
- **C.** Have the new Notifications service execute direct cross-DB `JOIN`s against the monolith's `users` table forever.
- **D.** Delete the preference columns from the monolith immediately before building the new UI.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Strangler Fig data migrations require keeping the new module's store continuously synchronized via CDC/Outbox while legacy writers are still active, verifying parity silently in production using shadow comparisons, migrating reads first (zero write risk, trivial rollback), and migrating writes last once confidence is 100%.

#### Option & Distractor Analysis

- **A (Distractor — _Static snapshot drift_):** A static dump goes stale the second a user updates preferences on Monday afternoon.
- **B (Correct — Key Insight):** Continuous CDC backfill + shadow parity verification + read-then-write flag flip keeps migration reversible at every step.
- **C (Distractor — _Permanent database coupling_):** Leaving cross-DB joins against the monolith's `users` table defeats the entire modular extraction.
- **D (Distractor — _Breaking live production callers before replacement exists_):** Deleting legacy columns breaks 18 active monolith paths immediately.

> **Wisdom Takeaway:** Migrate data-heavy modules in four safe beats: Backfill + Live Sync -> Shadow Read Parity -> Cutover Reads -> Cutover Writes.

</details>

---

## CAP-05 — Observability & Incident Triage Order (`Staff / Principal`)

**Scenario:** At 2:14 PM, p99 latency on `/api/v1/feed` jumps from 120ms to 8.5s and 502 errors climb to 18%. Dashboards show: API CPU is 15% (very low!), Redis hit rate is 97%, DB primary CPU is 22%, yet `active_http_workers` is pinned at 100% and outbound socket wait time to `recommendation-ml` jumped from 35ms to 8,200ms.

**Question:** Following disciplined diagnostic reasoning, what is the immediate bottleneck and highest-leverage mitigation?

- **A.** API CPU is low because Python/Go needs more compiler optimization flags; redeploy with `-O3`.
- **B.** API worker pools are saturated waiting on a severely degraded `recommendation-ml` dependency (`L = lambda * W`). Immediately trip/tune the circuit breaker + tight timeout + bulkhead on `recommendation-ml` and serve a graceful fallback (popular/cached feed) so `/api/v1/feed` recovers in seconds.
- **C.** Scale up the PostgreSQL primary to twice as many vCPUs.
- **D.** Disable Redis caching because 97% hit rate isn't 100%.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Low API CPU + low DB CPU + 100% active worker threads + 8.2s outbound wait on `recommendation-ml` proves the bottleneck is downstream I/O stall, not local compute or DB. Tripping the circuit breaker / degrading gracefully to a fallback non-ML feed frees all blocked workers immediately and restores core user experience.

#### Option & Distractor Analysis

- **A (Distractor — _Ignoring I/O wait telemetry_):** CPU is at 15% because workers are asleep waiting on slow sockets—compiler flags won't speed up a stalled remote ML service.
- **B (Correct — Key Insight):** Low CPU + pinned worker threads almost always means downstream I/O stall; degrade non-essential ML/enrichment dependencies to protect core UX.
- **C (Distractor — _Scaling a healthy database at 22% CPU_):** The DB isn't even busy; scaling Postgres adds cost and causes a brief failover blip during an unrelated incident.
- **D (Distractor — _Destroying a healthy 97% cache shield_):** Turning off Redis would overload the healthy DB on top of the ML outage.

> **Wisdom Takeaway:** Always build graceful degradation fallbacks for non-critical enrichments (recommendations, avatars, badges)—never let an ML sidecar take down your core feed.

</details>

---

## CAP-06 — Idempotency + Webhook Storms (`Senior`)

**Scenario:** You integrate with a Shipping Carrier webhook (`POST /webhooks/tracking`). Due to a carrier bug, they deliver the same `package_delivered` webhook 40 times in 3 seconds for each parcel, and occasionally out of order (`delivered` arrives 200ms before `out_for_delivery`).

**Question:** How do you harden your webhook ingestion endpoint against duplicates AND out-of-order state regressions?

- **A.** Return HTTP 500 on duplicate webhooks so the carrier stops sending them.
- **B.** Verify webhook cryptographic signature, persist/deduplicate by `(provider, event_id)` atomically, enforce monotonic state-transition rules (ignore `out_for_delivery` if order is already `delivered` via state machine or event timestamp/version guard), and enqueue heavy processing asynchronously while returning HTTP 200 fast.
- **C.** Put a `sleep(5)` inside the webhook HTTP handler to wait for all events to arrive in order.
- **D.** Overwrite `shipment.status = payload.status` blindly on every webhook.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** External webhooks are famously at-least-once and out-of-order. Returning 200 fast after signature verification + durable enqueueing avoids timeout retries from the carrier; atomic deduplication handles duplicates; and monotonic state-machine guards prevent an old `out_for_delivery` event from regressing a `delivered` shipment.

#### Option & Distractor Analysis

- **A (Distractor — _Triggering even MORE retries from the sender_):** HTTP 500 tells every webhook provider 'delivery failed, keep retrying with backoff for 24 hours', amplifying the storm.
- **B (Correct — Key Insight):** External webhooks demand three shields: fast async 200 ack, idempotent event_id deduplication, and monotonic state-machine guards.
- **C (Distractor — _Blocking HTTP threads and triggering sender timeouts_):** Sleeping 5 seconds exhausts your webhook workers and makes the carrier time out and retry even more.
- **D (Distractor — _Blind state overwrite regression_):** Blindly overwriting status lets late `out_for_delivery` events falsely tell customers their already-delivered package isn't delivered.

> **Wisdom Takeaway:** Never trust external webhooks to arrive once or in order—ack fast, deduplicate atomically, and guard state transitions monotonically.

</details>

---

## CAP-07 — Right-Sizing Architecture (Anti-Resume-Driven Design) (`Staff / Principal`)

**Scenario:** A 6-engineer B2B SaaS team handles 30 req/s steady (150 req/s peak) with 400GB of relational data. A new architect proposes splitting the codebase into 11 Go/Rust microservices, Kafka, Cassandra, Istio, and multi-region Active-Active Kubernetes clusters before launching v2.

**Question:** What is the wisest Principal Engineer critique of this proposal?

- **A.** Approve it because every serious modern system must start on Kafka, Cassandra, and 11+ microservices.
- **B.** Reject the premature distributed complexity: 150 req/s and 400GB fit effortlessly inside a well-structured Modular Monolith on managed PostgreSQL (+ Outbox/worker queue + Redis + read replica if needed). 6 engineers operating 11 microservices + Istio + Cassandra will spend 80% of their capacity on infra toil instead of customer value.
- **C.** Recommend switching the 11 microservices to 45 AWS Step Functions instead.
- **D.** Tell them to drop all modularity and put all SQL queries inside frontend React components.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Architecture must be proportional to team size, operational maturity, and actual scale. At 150 req/s and 400GB, a single managed Postgres instance + Modular Monolith runs at ~5% utilization with full ACID guarantees and sub-10ms latency. Burdening 6 engineers with distributed consensus, Kafka/Cassandra ops, and multi-region conflict resolution destroys product velocity.

#### Option & Distractor Analysis

- **A (Distractor — _Cargo-culting hyperscaler complexity at startup scale_):** Netflix/Uber infrastructure solves 1,000-engineer and 1M-RPS problems—at 6 engineers and 150 RPS, it creates pure drag.
- **B (Correct — Key Insight):** Simplicity with clean internal module seams beats premature distributed complexity—scale complexity only when real bottlenecks demand it.
- **C (Distractor — _Swapping microservice sprawl for serverless state-machine sprawl_):** 45 Step Functions still scatter domain cohesion and introduce distributed debugging complexity for a 6-person team.
- **D (Distractor — _False dichotomy between 'over-engineered microservices' and 'no modularity'_):** Rejecting microservices does NOT mean abandoning modularity—a Modular Monolith gives clean boundaries with zero network tax.

> **Wisdom Takeaway:** Don't solve 10-million-QPS problems for a 150-QPS system; earn your distributed complexity one real bottleneck at a time.

</details>

---

## CAP-08 — Rate-Limited Third-Party Integration + Queue Smoothing (`Senior`)

**Scenario:** Your SaaS sends email/SMS campaigns. When a customer clicks 'Send to 500,000 users', your API fires 500k requests at a partner SMS vendor whose strict contract rate limit is 200 req/s. The vendor returns HTTP 429s, blocks your API key for 15 minutes, and drops 40% of messages.

**Question:** How do you integrate a bursty internal workflow with a strictly rate-limited external vendor cleanly?

- **A.** Reject customers with >200 subscribers from using your product.
- **B.** Persist campaign recipients cleanly (Outbox/chunked batch jobs -> partitioned queue), process through a distributed Token Bucket / Leaky Bucket rate-limited worker pool capped at <=180 req/s (with per-tenant fair-share sub-queues so one 500k campaign doesn't starve 2FA OTPs!), and honor `Retry-After` on 429s.
- **C.** Buy 50 different vendor API keys and rotate them blindly to bypass their rate limit.
- **D.** Spin up 1,000 Lambda functions all calling the vendor simultaneously with 10 retries each.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** External partner limits require decoupling bursty user triggers from steady-rate delivery. Queuing messages smoothly through a Leaky/Token Bucket paced below 200 req/s prevents 429 bans—and separating priority lanes (transactional 2FA OTPs vs bulk marketing campaigns) ensures one customer's 500k blast doesn't delay everyone else's login codes.

#### Option & Distractor Analysis

- **A (Distractor — _Breaking core product business value instead of engineering queue smoothing_):** Campaign blasts are literally why customers pay for the platform; queuing smooths 500k spikes effortlessly.
- **B (Correct — Key Insight):** Buffer bursty demand into priority-isolated queues and pace outbound workers with a leaky/token bucket below the partner's ceiling.
- **C (Distractor — _Violating vendor Terms of Service and risking permanent account suspension_):** Circumventing API limits via multi-key evasion violates contracts and leads to sudden account termination.
- **D (Distractor — _Amplifying the 429 ban with 1,000 concurrent callers_):** 1,000 Lambdas x 10 retries hits the vendor even harder and triggers immediate key revocation.

> **Wisdom Takeaway:** Always isolate priority lanes (OTPs vs bulk marketing) and pace outbound calls to external rate-limited vendors via queued leaky buckets.

</details>

---

## CAP-09 — Write Amplification, Hot Counter Contention & Sharded Counters (`Staff / Principal`)

**Scenario:** On a social video platform, a viral video receives 25,000 `like` taps per second. Each tap executes `UPDATE videos SET likes_count = likes_count + 1 WHERE id = 42` inside PostgreSQL. Row-level locking on `id = 42` serializes all 25,000 updates, creating huge lock queues and degrading the entire database.

**Question:** How do you scale single-row hot counter updates without breaking database throughput or losing counts?

- **A.** Switch transaction isolation level to `SERIALIZABLE`.
- **B.** Decouple the hot row lock: either buffer/aggregate increments in Redis/Kafka micro-batches (flushing delta `+N` every 1–2s to Postgres) OR shard the counter row into K sub-rows `(video_id=42, bucket=0..63)` so writers spread across 64 rows and readers sum or read a cached total.
- **C.** Add 10 read replicas to handle the 25,000 `UPDATE` statements.
- **D.** Index `likes_count` with a B-Tree index.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** In PostgreSQL/MySQL, updating the exact same row acquires an exclusive row lock—making 25,000 concurrent taps strictly serial (Amdahl's Law `sigma = 1`!). Sharding the counter into 64 buckets cuts row-lock contention 64x, and stream/Redis delta-batching collapses 25,000 row updates/sec into ~1 `likes_count = likes_count + 25000` update/sec.

#### Option & Distractor Analysis

- **A (Distractor — _Increasing serialization aborts instead of reducing row contention_):** `SERIALIZABLE` triggers massive serialization failure retries on hot rows, making throughput even worse.
- **B (Correct — Key Insight):** Eliminate single-row write hotspots by either coalescing deltas asynchronously or sharding one logical counter across K physical sub-rows.
- **C (Distractor — _Trying to scale writes with read-only replicas_):** Read replicas cannot accept `UPDATE` statements; all 25,000 writes still collide on the single primary row.
- **D (Distractor — _Adding index maintenance overhead to a locked row_):** Indexing `likes_count` forces extra index-entry churn on every tap while doing zero to relieve the single-row exclusive lock.

> **Wisdom Takeaway:** Single-row counters serialize writes completely—either batch increments before writing or shard the counter across N buckets.

</details>

---

## CAP-10 — End-to-End Architecture Review & Failure Mode Analysis (`Staff / Principal`)

**Scenario:** You are reviewing an RFC for a new high-volume Payment Ledger & Notification integration: (A) Core Ledger service exposes synchronous gRPC; (B) Webhook dispatcher reads Ledger tables directly via DB link; (C) Retries are unbounded with fixed 50ms sleep; (D) All tenant ledger rows live on one unpartitioned table with an integer auto-increment PK.

**Question:** Which assessment correctly prioritizes the architectural risks from most urgent correctness/availability threat to future scale?

- **A.** The integer PK is the only concern; items B and C are harmless implementation details.
- **B.** Critical immediate risks: (1) Direct DB link breaks modular ownership & schema evolution (replace with Transactional Outbox + ACL/event contract), (2) Unbounded fixed-50ms retries guarantee retry storms on outage (add bounded exponential backoff + jitter + DLQ + idempotency). Medium-term scale risk: single unpartitioned ledger table will eventually hit write/vacuum limits (plan time/tenant partitioning early using UUIDv7/ULID or composite keys).
- **C.** Replace gRPC with SOAP XML so notifications and ledger run in one process.
- **D.** Remove the Ledger database entirely and store balances only in Kafka topics.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** A Principal review distinguishes immediate outage/corruption traps from medium-term scaling curves. Direct cross-service DB links (Modularity/Integration) cause uncoordinated breakages and lock coupling, while unbounded non-jittered retries (Integration/Scalability) turn any hiccup into a full platform outage. Meanwhile, planning clean partitioning/IDs prepares the ledger for 10x growth without premature sharding today.

#### Option & Distractor Analysis

- **A (Distractor — _Obsessing over PK formatting while ignoring active outage & coupling bombs_):** Unbounded retries and cross-service DB table coupling cause real production incidents within weeks, far before integer overflow or table size.
- **B (Correct — Key Insight):** Triage RFCs by blast radius: fix coupling and cascading-failure traps immediately, then design clean evolutionary seams for future data scale.
- **C (Distractor — _Regressing wire protocols without fixing architecture_):** SOAP XML adds parsing overhead and doesn't fix DB coupling or unbounded retry storms.
- **D (Distractor — _Replacing transactional ACID ledger guarantees with raw topic scans_):** Kafka isn't designed for random-access ACID balance checks and point-in-time relational queries.

> **Wisdom Takeaway:** Great RFC reviews rank risks ruthlessly: stop data corruption and cascading outages first, remove cross-boundary DB coupling second, and leave clean seams for 10x scale.

</details>

---
