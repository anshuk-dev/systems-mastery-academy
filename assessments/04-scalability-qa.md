# Assessment & Distractor Analysis — 04: System Scalability

10 scenario-based engineering questions grounded in verified primary engineering literature.

---

## SCA-01 — Universal Scalability Law (Contention vs Coherency) (`Staff / Principal`)

**Scenario:** Your team scales a stateful cluster from 4 nodes to 16 nodes. At 8 nodes, throughput reaches 6,200 TPS. At 16 nodes, throughput unexpectedly DROPS to 4,800 TPS even though CPU is only 55% on each node, and cross-node cache-invalidation/lock-coordination network traffic has quadrupled.

**Question:** According to Gunther's Universal Scalability Law (USL), what explains throughput *decreasing* as nodes increase?

- **A.** Amdahl's Law predicts throughput drops past 8 nodes for every distributed system.
- **B.** Non-zero coherency penalty (`beta > 0`) from pairwise cross-node synchronization/cache invalidation grows quadratically `O(N^2)`, causing retrograde scaling where nodes spend more cycles coordinating state than doing useful work. Eliminate or partition shared mutable state.
- **C.** TCP ports wrap around past 8 nodes.
- **D.** Because 16 is an even power of 2, hash collisions double.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Amdahl's Law only plateaus asymptotically; it never goes downward. Gunther's USL (`C(N) = N / (1 + alpha(N-1) + beta*N*(N-1))`) adds the quadratic coherency term `beta*N*(N-1)`. When `beta > 0` (chatty distributed locks, cluster-wide cache coherency, synchronous consensus across all nodes), adding more nodes actively *reduces* total throughput past `N_max`. The fix is sharding/partitioning state so nodes don't synchronize globally.

#### Option & Distractor Analysis

- **A (Distractor — _Confusing Amdahl's plateau with USL retrograde collapse_):** Amdahl's Law `1 / (sigma + (1-sigma)/N)` is strictly monotonically increasing—it approaches `1/sigma` asymptotically and never predicts throughput *dropping*.
- **B (Correct — Key Insight):** Pairwise cross-node coordination (`beta`) scales quadratically; past the inflection point, adding nodes shrinks total capacity until you shard/decouple state.
- **C (Distractor — _Invented OS networking myth_):** TCP has 65,535 ports per IP tuple and does not wrap around at 8 cluster nodes.
- **D (Distractor — _Misunderstanding power-of-two sizing_):** Powers of two are standard in consistent hashing and memory alignment and do not trigger quadratic collision spikes.

> **Wisdom Takeaway:** If adding nodes makes your cluster slower, you have a coherency tax (`beta > 0`)—stop adding machines and remove the global cross-node coordination.

#### Verified Primary Sources

- [A General Theory of Computational Scalability Based on Rational Functions (USL)](https://arxiv.org/abs/0808.1431) — Neil J. Gunther (arXiv:0808.1431)
- [Amdahl's Law (AFIPS 1967)](https://en.wikipedia.org/wiki/Amdahl%27s_law) — Gene Amdahl (via Wikipedia)

</details>

---

## SCA-02 — Shard Key Selection & Hot Partitions (`Senior`)

**Scenario:** A multi-tenant B2B analytics platform shards a 40TB `events` table across 16 PostgreSQL shards. An engineer proposes sharding by `tenant_id`, knowing 1 enterprise tenant ('MegaCorp') generates 65% of all daily events while 4,999 SMB tenants share the remaining 35%.

**Question:** What failure will `hash(tenant_id)` cause, and how should you design the sharding key?

- **A.** `hash(tenant_id)` guarantees 1/16th of rows on every shard because MD5 is uniform.
- **B.** MegaCorp's single `tenant_id` always hashes to ONE shard, leaving 1 shard at 100% disk/CPU saturation while 15 shards sit mostly idle. Use a composite/salted shard key such as `(tenant_id, bucket_id)` or `(tenant_id, event_id_prefix)` (with isolated/dedicated shards for giant tenants) so MegaCorp spreads across shards while queries still prune cleanly.
- **C.** Shard strictly by `created_at` (current timestamp) so all shards stay balanced.
- **D.** Add 16 more virtual nodes on MegaCorp's single shard.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** A uniform hash function distributes *distinct keys* evenly, NOT *skewed volume per key*. One giant tenant still lands entirely on one shard! Splitting mega-tenants across bounded buckets `(tenant_id, hash(event_id) % K)` (or routing giant tenants to dedicated multi-shard pools while SMBs share normal tenant-keyed shards) balances load without turning every SMB query into a full cluster scatter-gather.

#### Option & Distractor Analysis

- **A (Distractor — _Confusing key-count uniformity with traffic/data-volume uniformity_):** Hashing `MegaCorp` always yields the exact same integer, putting 65% of global traffic on 1/16th of your hardware.
- **B (Correct — Key Insight):** Bounded key salting / adaptive tenant-bucket sharding spreads mega-tenants without forcing scatter-gather for normal tenants.
- **C (Distractor — _Creating a moving write hot-spot on the newest time range_):** Sharding by `created_at` directs 100% of current-second inserts to the single shard owning 'today', leaving all historical shards write-idle.
- **D (Distractor — _Confusing virtual nodes with splitting a single key_):** Virtual nodes balance key ranges across physical servers; a single key (`MegaCorp`) still maps to only one vnode on one physical server at a time.

> **Wisdom Takeaway:** Uniform hashing only balances keys, never skew—design shard keys for cardinality AND volume distribution, especially with enterprise whales.

#### Verified Primary Sources

- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann
- [Consistent Hashing and Random Trees (STOC 1997)](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf) — David Karger et al. (MIT / Princeton CS)

</details>

---

## SCA-03 — Consistent Hashing & Rebalancing (`Intermediate`)

**Scenario:** You cache 10TB of user sessions across 10 Memcached servers using `server = hash(user_id) % 10`. One server dies and you switch to `% 9` (or scale out to `% 11`). Suddenly cache hit rate collapses from 98% to ~9%, crashing your database.

**Question:** Why did losing 1 of 10 servers invalidate ~90% of the cache, and what fixes it?

- **A.** Memcached deletes all keys whenever a peer disconnects.
- **B.** Modular hashing (`% N`) changes the target server for nearly every key (`~90%` remapped) whenever `N` changes. Use Consistent Hashing with Virtual Nodes so adding or removing 1 of N servers moves only `~1/N` (10%) of keys.
- **C.** Store all 10TB of sessions in a single server so `N` is always 1.
- **D.** Switch from MD5 to SHA-256 inside `hash(user_id) % N`.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Changing the modulus from 10 to 9 shifts `k % 10` to `k % 9` for ~90% of keys, causing a massive global cache miss storm. Consistent hashing arranges nodes (with ~100–200 virtual nodes each for smooth balance) on a hash ring so losing 1 of 10 nodes only relocates the ~10% of keys owned by that node.

#### Option & Distractor Analysis

- **A (Distractor — _Blaming the cache daemon instead of the client routing formula_):** The surviving 9 Memcached servers still hold their old keys—clients just stopped routing to them because `% 9` sends requests elsewhere.
- **B (Correct — Key Insight):** Consistent hashing decouples key placement from cluster size N, bounding key churn to `O(1/N)` during scaling or failures.
- **C (Distractor — _Giving up horizontal scale and high availability_):** 10TB exceeds typical single-node RAM and creates a catastrophic single point of failure.
- **D (Distractor — _Changing hash algorithm doesn't fix modulo instability_):** `sha256(key) % 9` still remaps ~90% of keys compared to `sha256(key) % 10`.

> **Wisdom Takeaway:** Never use `hash(key) % N` for stateful partitions or caches where N can change—use consistent hashing with virtual nodes.

#### Verified Primary Sources

- [Consistent Hashing and Random Trees (STOC 1997)](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf) — David Karger et al. (MIT / Princeton CS)

</details>

---

## SCA-04 — Replication Lag & Read-Your-Writes Consistency (`Senior`)

**Scenario:** To scale reads, you route all `GET` requests to asynchronous PostgreSQL read replicas (typical lag 50ms, peaking at 3s during bulk jobs). Users edit their profile (`POST /profile` -> primary), get redirected immediately (`GET /profile` -> replica), see their OLD bio, panic, and click Save 5 times.

**Question:** How do you preserve read-replica scalability while guaranteeing Read-Your-Writes consistency for the author?

- **A.** Make all PostgreSQL replication synchronous across every replica on every query.
- **B.** Track a brief read-your-own-writes window (or store the user's latest write WAL LSN/timestamp in a cookie/session) and route that user's own reads to the primary (or wait briefly for a replica whose applied LSN >= user's write LSN) while keeping general traffic on replicas.
- **C.** Eliminate read replicas and run every `GET` against the primary.
- **D.** Add a `sleep(5000)` in the frontend after every `POST`.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Full synchronous replication hurts write latency and availability if one replica lags. Instead, Read-Your-Writes only needs consistency for the *specific user who just mutated state*. Passing the commit WAL LSN (or a 5-second session 'recently wrote' flag) routes only that user's immediate reads to the primary or a caught-up replica—99%+ of read traffic still scales cleanly on replicas.

#### Option & Distractor Analysis

- **A (Distractor — _Sacrificing write availability and latency globally_):** Synchronous wait across all read replicas makes a single slow replica stall every write in the system.
- **B (Correct — Key Insight):** Causal/LSN session tracking gives users strong read-your-writes illusions while keeping 99% of reads horizontally scaled on async replicas.
- **C (Distractor — _Throwing away read scalability unnecessarily_):** General browsing reads by other users rarely need sub-second consistency with another stranger's profile edit.
- **D (Distractor — _Punishing UX and still failing during >5s lag spikes_):** Forcing every user to stare at a 5-second spinner feels broken and still fails whenever replication lag exceeds 5 seconds.

> **Wisdom Takeaway:** Don't make the whole database synchronous just for Read-Your-Writes—pin the mutating user's session to the primary or track their commit LSN.

#### Verified Primary Sources

- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann

</details>

---

## SCA-05 — Load Shedding & Protecting Goodput (`Staff / Principal`)

**Scenario:** During a viral Super Bowl ad spike (5x normal load), your API pods auto-scale slowly (3 minutes to boot + warm caches). For those 3 minutes, incoming traffic queues in NGINX/app workers, every request takes 12s and times out at the 5s mobile client boundary, resulting in **0% successful checkouts** even though the backend has capacity for 1x–1.5x load.

**Question:** What scalability mechanism preserves maximum successful checkouts during sudden overload spikes?

- **A.** Increase NGINX `proxy_read_timeout` and queue buffers to 60 seconds so no request is dropped.
- **B.** Priority-aware Load Shedding at the edge/ingress (e.g., adaptive concurrency limits like Little's Law/Vegas or priority queues): immediately reject excess and low-priority traffic (analytics, browse, bots) with 503 + `Retry-After` so critical `/checkout` requests within capacity finish in <200ms (100% goodput of available capacity).
- **C.** Disable health checks so Kubernetes stops killing slow pods.
- **D.** Ask the mobile app to automatically retry every timed-out 5s request 5 times immediately.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Without load shedding, queueing theory drives latency past client deadlines, meaning 100% of CPU work produces aborted responses (0% goodput!). Shedding excess traffic cheaply at the edge—prioritizing revenue/critical paths over background or non-essential calls—keeps latency inside SLO for the capacity you *do* have.

#### Option & Distractor Analysis

- **A (Distractor — _Deepening queues during overload (Bufferbloat)_):** Longer server timeouts and huge queues force pods to waste CPU processing requests whose mobile users already disconnected 5 seconds ago.
- **B (Correct — Key Insight):** Serving 100% of your available capacity cleanly beats trying to serve 500% and failing everyone.
- **C (Distractor — _Hiding broken pods behind blind load balancing_):** Disabling health checks keeps wedged pods in rotation and does nothing to reduce the 5x overload.
- **D (Distractor — _Turning a 5x spike into a 25x retry flood_):** Immediate retries during overload amplify traffic into total collapse.

> **Wisdom Takeaway:** Under extreme overload, failing fast for excess low-priority load is the only way to keep critical paths fast and alive.

#### Verified Primary Sources

- [Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) — David Yanacek (AWS Builders' Library)
- [Metastable Failures in Distributed Systems (HotOS 2021)](https://charap.co/metastable-failures-in-distributed-systems/) — Bronson, Aghayev, Charapko & Zhu

</details>

---

## SCA-06 — Rate Limiting Algorithms (Fixed vs Sliding Window vs Token Bucket) (`Intermediate`)

**Scenario:** You enforce a public API limit of `100 requests/minute` per API key using a naive Fixed Window counter (`INCR key:{minute}`). Attackers send 100 requests at `12:00:59` and another 100 requests at `12:01:01`—hitting your backend with 200 requests in 2 seconds.

**Question:** Which rate-limiting approach eliminates this boundary double-burst while supporting controlled short bursts cleanly?

- **A.** Switch to a Sliding Window Counter / Token Bucket algorithm (atomically enforced via Redis Lua script or edge Envoy/Cloudflare limiter).
- **B.** Lower the fixed window limit to 1 request/minute.
- **C.** Store all request timestamps per user in PostgreSQL and run `COUNT(*)` on every API request.
- **D.** Move the counter from Redis to an in-memory `HashMap` inside each of your 30 API pods.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **A**

**Explanation:** Fixed windows suffer up to 2x boundary bursts across minute edges. Sliding Window Counter smooths boundary edges in O(1) memory, and Token Bucket enforces a steady refill rate while allowing a explicitly bounded burst capacity (`bucket_size`), both executed atomically in Redis Lua scripts without race conditions.

#### Option & Distractor Analysis

- **A (Correct — Key Insight):** Token Bucket / Sliding Window algorithms eliminate fixed-boundary double-bursts in O(1) per-key memory.
- **B (Distractor — _Breaking legitimate users instead of fixing the algorithm_):** 1 req/min makes normal API usage unusable while still permitting 2 requests across the boundary.
- **C (Distractor — _Turning your rate limiter into a database DDoS vector_):** Writing and counting rows in PostgreSQL on every API call makes the rate limiter slower and weaker than the API it protects.
- **D (Distractor — _Per-pod local counters silently multiply limits by pod count_):** 30 independent in-memory HashMaps let an attacker send `30 * 100 = 3,000` requests/min under round-robin load balancing.

> **Wisdom Takeaway:** Never use uncoordinated per-pod counters or naive fixed windows for strict rate limits—use atomic Token Bucket or Sliding Window limiters.

#### Verified Primary Sources

- [Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters) — Paul Tarjan (Stripe Engineering)
- [Rate Limiting Algorithms](https://redis.io/glossary/rate-limiting/) — Redis Glossary

</details>

---

## SCA-07 — CQRS & Search/Analytics Offloading (`Senior`)

**Scenario:** Your OLTP Orders PostgreSQL primary handles high-concurrency checkout writes cleanly, but Operations & Merchant Dashboards run complex multi-filter wildcard searches, facet counts, and aggregations (`LIKE '%shoe%'`, `GROUP BY status, region`), causing write lock contention and I/O stalls during checkout.

**Question:** Which architectural pattern decouples complex analytical/search reads from transactional write performance?

- **A.** Add 15 full-text GIN and composite indexes to the transactional `orders` table.
- **B.** Apply CQRS: keep the normalized PostgreSQL primary purely for ACID transactional writes/single-key lookups, stream changes asynchronously (Outbox/CDC -> Kafka), and materialize denormalized search/facet projections in Elasticsearch/ClickHouse for merchant dashboards.
- **C.** Run all merchant dashboard queries at 3 AM only and disable live dashboards.
- **D.** Store orders in Elasticsearch as the primary source of truth for checkout payments.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** OLTP writes and multi-facet wildcard search have fundamentally opposite storage and indexing physics. CQRS lets PostgreSQL stay lean and fast for ACID order mutations while an async CDC/Outbox pipeline feeds a read-optimized projection store (Elasticsearch for search/facets, ClickHouse for analytics), isolating dashboard spikes from checkout completely.

#### Option & Distractor Analysis

- **A (Distractor — _Death by write amplification_):** Every extra GIN/composite index must be updated and WAL-logged on every order INSERT/UPDATE, directly slowing checkout writes and bloating RAM.
- **B (Correct — Key Insight):** Separate the transactional write model from specialized read projections when query shapes diverge sharply from write invariants.
- **C (Distractor — _Sacrificing core product capabilities unnecessarily_):** Merchants need near-real-time order visibility during peak sales, not yesterday's stale batch report.
- **D (Distractor — _Using an eventually consistent search index as a financial ledger_):** Elasticsearch lacks multi-row ACID transactions, foreign keys, and strict durable isolation needed for payment/inventory invariants.

> **Wisdom Takeaway:** When search/analytics queries start hurting transactional writes, don't overload OLTP with 20 indexes—project an async CQRS read model.

#### Verified Primary Sources

- [CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) — Microsoft Azure Architecture Center
- [Pattern: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — Chris Richardson (microservices.io)
- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann

</details>

---

## SCA-08 — Multi-Region Architecture: Home-Pinned vs Naive Active-Active (`Staff / Principal`)

**Scenario:** Your collaboration SaaS expands from US to EU and APAC. Leadership asks for 'Active-Active multi-region' so EU users get <40ms latency and GDPR EU data residency, while global availability survives an entire AWS region outage.

**Question:** Why is naive Active-Active multi-master writes across US/EU/APAC usually a trap, and what is the superior scalable design?

- **A.** Naive cross-ocean multi-master writes hit speed-of-light RTT (~100-200ms) for synchronous consensus OR suffer painful split-brain write conflicts for async replication. Use Cellular / Home-Region Pinning (EU tenants' data & writes live in EU cells, US in US, APAC in APAC) with Geo-DNS edge routing and per-cell warm DR failover.
- **B.** Run a single synchronous Raft cluster stretched across US-East, Frankfurt, and Tokyo for every user write.
- **C.** Use eventual-consistency last-write-wins (LWW) on financial balances and permissions across all 3 regions.
- **D.** Keep all databases in US-East and just deploy static CDN HTML in EU and APAC.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **A**

**Explanation:** You cannot beat the speed of light (~140ms RTT US<->EU, ~200ms EU<->APAC). Global synchronous consensus makes every write slow everywhere; async multi-master causes lost updates/conflicts. Cellular home-region pinning keeps 99% of user writes fast and strictly compliant within their home region, while edge routing forwards rare cross-region access cleanly.

#### Option & Distractor Analysis

- **A (Correct — Key Insight):** Cellular/home-region architectures deliver local latency, data residency, and regional fault isolation without distributed multi-master chaos.
- **B (Distractor — _Fighting the speed of light_):** A Raft quorum across US-EU-Tokyo forces every write to wait ~150–250ms for cross-ocean RTTs AND still violates EU data-residency expectations if EU PII replicates to US.
- **C (Distractor — _Silent data corruption via LWW on non-commutative state_):** Clock skew + Last-Write-Wins silently overwrites concurrent balance deductions or revokes/grants permissions unpredictably.
- **D (Distractor — _Ignoring API/DB latency and GDPR_):** Static CDN assets don't fix 200ms dynamic API round trips to US-East or keep EU user data inside the EU.

> **Wisdom Takeaway:** Prefer home-region cellular isolation over global multi-master write complexity—respect both the speed of light and GDPR.

#### Verified Primary Sources

- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann

</details>

---

## SCA-09 — Auto-Scaling Lag & Warm Capacity (`Senior`)

**Scenario:** Every weekday at 9:00 AM sharp, 200,000 students log into an online exam platform within 90 seconds. CPU-based Kubernetes HPA (Horizontal Pod Autoscaler) scales pods when average CPU hits 70%, taking ~4 minutes to detect, provision nodes via Cluster Autoscaler, pull images, and warm JVM JIT caches. Exams fail at 9:00–9:05 AM daily.

**Question:** Why does reactive CPU HPA fail here, and what fixes predictable burst scaling?

- **A.** Lower the HPA CPU target from 70% to 65%.
- **B.** Reactive CPU scaling is too slow for sub-2-minute step spikes and ignores cold-start/JVM warmup time. Combine Predictive/Scheduled pre-scaling (warm capacity scaled up at 8:50 AM), low-overhead overprovisioned buffer pods (pause-pod priority preemption), and fast-booting/pre-warmed runtimes—plus request queuing/admission jitter at login.
- **C.** Switch from Kubernetes to bare metal and buy 10x servers running 24/7.
- **D.** Scale based on Pod Disk Usage instead of CPU.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** HPA polling + node provisioning + image pull + JVM warmup takes minutes, whereas a 9:00 AM class bell creates a vertical step-function spike in seconds. Scheduled pre-warming before known traffic waves, buffer capacity pods for instant preemption, and client login jitter absorb the cliff effortlessly without paying 24/7 idle hardware costs.

#### Option & Distractor Analysis

- **A (Distractor — _Tweaking threshold slightly while keeping the multi-minute lag_):** 65% vs 70% only triggers scaling a few seconds earlier; node provisioning, image pulls, and JVM warmup still miss the 90-second spike.
- **B (Correct — Key Insight):** When traffic spikes faster than infrastructure cold-starts, reactive auto-scaling is always too late—pre-scale predictably and maintain warm headroom.
- **C (Distractor — _Massive permanent overprovisioning for a 5-minute daily spike_):** Paying 10x hardware 24 hours a day for predictable morning bursts wastes budget when scheduled cloud scaling works cleanly.
- **D (Distractor — _Using an irrelevant metric_):** Login traffic spikes CPU, memory, and connections—disk usage barely moves during authentication bursts.

> **Wisdom Takeaway:** Reactive auto-scaling handles gradual diurnal curves, never vertical 9:00 AM cliff spikes—pre-warm predictably and design fast startup.

#### Verified Primary Sources

- [Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) — David Yanacek (AWS Builders' Library)
- [The USE Method](https://www.brendangregg.com/usemethod.html) — Brendan Gregg

</details>

---

## SCA-10 — Backpressure Across Async Pipelines (`Intermediate`)

**Scenario:** A Video Transcoding API accepts uploads, pushes jobs into an in-memory unbounded `ArrayBlockingQueue` inside the API pods, and spawns worker goroutines/threads. When 5,000 users upload videos simultaneously, API pods crash with `OutOfMemoryError` (OOMKilled), losing all queued jobs.

**Question:** What fundamental scalability safeguard is missing and how do you fix it?

- **A.** Give the Kubernetes pods 128GB RAM so the in-memory queue never fills.
- **B.** Replace unbounded in-memory queues with durable external queueing (SQS/Kafka) AND enforce bounded capacity + Backpressure (reject or throttle uploads at the edge with 429/503 once queue/token budgets saturate, and stream uploads directly to object storage via pre-signed URLs instead of buffering through API RAM).
- **C.** Catch `OutOfMemoryError` in a `try/catch` block and continue accepting uploads.
- **D.** Spawn 5,000 more transcoding threads inside the same API pod.

<details>
<summary>Show Answer, Explanation, Distractor Analysis &amp; Verified Sources</summary>

**Correct Answer:** **B**

**Explanation:** Unbounded in-memory queues violate backpressure: when producers outpace consumers, RAM fills until the process OOMs and loses every buffered job. Streaming binary video directly to S3 via pre-signed URLs keeps API pods lightweight, durable queues persist jobs outside pod memory, and bounded admission control pushes back upstream before memory exhausts.

#### Option & Distractor Analysis

- **A (Distractor — _Delaying OOM instead of bounding queues_):** Even 128GB RAM fills during a sustained burst or downstream stall—and losing 128GB of unpersisted in-memory jobs on crash is worse, not better.
- **B (Correct — Key Insight):** Bound every queue, persist durable work outside ephemeral app RAM, and bypass API memory for large binary streams.
- **C (Distractor — _Attempting recovery after JVM/runtime heap exhaustion_):** Once heap is exhausted, even allocating exception handlers or health responses fails, and Kubernetes cgroup OOMKiller terminates the container with SIGKILL.
- **D (Distractor — _Accelerating CPU and memory exhaustion_):** 5,000 concurrent video transcodes on one pod immediately exhaust both RAM and CPU cores.

> **Wisdom Takeaway:** An unbounded queue is just a delayed OOM crash; every buffer must be bounded, durable if critical, and capable of signaling backpressure.

#### Verified Primary Sources

- [Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) — David Yanacek (AWS Builders' Library)
- [Bulkhead pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead) — Microsoft Azure Architecture Center

</details>

---
