# Pillar 04: System Scalability

> **Growing capacity predictably by orders of magnitude without collapsing under coordination cost**

Scalability is not 'add Kubernetes'. True scalability means keeping latency, cost-per-unit-work, and operational toil linear—or sublinear—as traffic, data volume, and failure rates grow orders-of-magnitude.

**Core Mental Model:** Every system hits a wall where adding more machines stops helping or actually makes throughput WORSE. Your job is to identify the hidden serialization point—a lock, a primary DB, a shared counter, or cross-node chatter—and remove or partition it.

---

## Scalability Laws & Bottleneck Modeling (25 min)

### Core Knowledge (Mechanics & Laws)

- Amdahl's Law: speedup is bounded by the sequential fraction sigma: S(N) = 1 / (sigma + (1 - sigma)/N). Even 5% serial work caps speedup at 20x with infinite CPUs.
- Gunther's Universal Scalability Law (USL): C(N) = N / (1 + alpha*(N - 1) + beta*N*(N - 1)), modeling both contention (alpha, queueing on shared locks/DB) and coherency (beta, cross-node synchronization/cache invalidation).
- Retrograde Scalability: when beta > 0, throughput actually DROPS past an optimal N_max because nodes spend more time coordinating than serving work.
- Scale Cube (AKF): X-axis (clone stateless replicas), Y-axis (split by functional service/domain), Z-axis (partition/shard by data key like tenant_id or user_id).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Vertical scaling (scaling up) is underrated: upgrading a single Postgres primary with faster NVMe and RAM takes 10 minutes and preserves ACID transactions, whereas premature sharding adds permanent complexity.
- Load testing at 2x peak doesn't expose beta (coherency) bottlenecks—you only discover coordination collapse when cluster size grows or distributed locks thrash.
- Always look for the 'hidden singleton' in a horizontal design: a global sequence generator, a single distributed lock for all tenants, or a centralized session DB.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Vertical Scaling (Scale Up)** | Zero distributed coordination, linear simplicity, preserves single-node ACID and joins. | Hardware ceiling, blast radius of single node, higher marginal cost at extreme tiers. | Until single-node limits (write IOPS, RAM, or availability SLA) are genuinely approached. |
| **Horizontal Partitioning (Z-Axis Sharding)** | Near-linear write and storage scaling across commodity nodes; isolates blast radius per shard. | Cross-shard joins/transactions become hard or impossible; rebalancing and hot-shard skew. | Write throughput or dataset size exceeds single-node capacity. |

### Common Anti-Patterns

- Scaling stateless app servers from 20 to 200 pods when the single primary database is already at 95% CPU (just creates 10x more waiters!).
- Global distributed locking on high-frequency workflows.
- Ignoring capacity headroom (running at 85% steady state leaves zero room for a single AZ failure).

> **Rule of Thumb:** Whenever someone proposes 'just add more replicas', ask: 'What shared resource will those extra replicas contend on?'

### Verified Primary Sources

- [Amdahl's Law (AFIPS 1967)](https://en.wikipedia.org/wiki/Amdahl%27s_law) — Gene Amdahl (via Wikipedia)
- [A General Theory of Computational Scalability Based on Rational Functions (USL)](https://arxiv.org/abs/0808.1431) — Neil J. Gunther (arXiv:0808.1431)
- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann

---

## Data Partitioning, Replication & Consistency (30 min)

### Core Knowledge (Mechanics & Laws)

- Sharding Strategies: Hash-based (uniform distribution, poor range queries), Range-based (fast range scans, vulnerable to hot spots on monotonic keys like timestamps), Directory-based (flexible, lookup overhead).
- Consistent Hashing with Virtual Nodes (vnodes): maps both keys and nodes onto a hash ring so adding/removing a node moves only ~1/N keys instead of rehashing everything.
- Replication Models: Single-Leader (read replicas scale reads, replication lag breaks read-your-writes), Multi-Leader (multi-region writes, conflict resolution required), Leaderless/Quorum (W + R > N).
- CQRS (Command Query Responsibility Segregation): separate optimized write model from denormalized read projections (e.g., Postgres -> Kafka -> Elasticsearch).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Choosing the shard key is a near-irreversible architectural decision. A bad shard key (e.g., sharding multi-tenant SaaS by `created_at` or `country` when one country is 70% of traffic) creates permanent hot shards.
- Never route a user's immediate post-write redirect to an async read replica without session-stickiness or LSN/version pinning—users seeing their just-saved profile disappear triggers panic and duplicate submissions.
- Celebrity / Hot-Partition problem (e.g., Justin Bieber's posts or a Black Friday merchant): even consistent hashing puts one key on one shard. Mitigate by key salting (`key#0..k`), dedicated isolated shards, or edge caching.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Read Replicas + Session Pinning** | Scales read-heavy workloads 5-10x with minimal app rewrite; preserves SQL richness. | Write throughput still capped by single primary; replication lag spikes under heavy batch writes. | Read:Write ratio >= 10:1 where writes still fit on one primary. |
| **CQRS + Async Projections** | Tailor read store (search, graph, columnar) independently of transactional write store. | Eventual consistency lag, dual storage cost, projection rebuild operations. | Complex search/analytics/feed views that choke OLTP normalized tables. |

### Common Anti-Patterns

- Sharding by monotonically increasing auto-increment ID or timestamp for write-heavy ingestion.
- Doing scatter-gather cross-shard queries on hot user-facing endpoints.
- Assuming eventual consistency means 'zero UX work'—failing to design optimistic UI or read-your-own-writes guarantees.

> **Rule of Thumb:** Scale reads with caching and replicas first; scale writes by shedding/batching second; shard data ONLY when a single write primary truly cannot keep up.

### Verified Primary Sources

- [Consistent Hashing and Random Trees (STOC 1997)](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf) — David Karger et al. (MIT / Princeton CS)
- [Designing Data-Intensive Applications](https://dataintensive.net/) — Martin Kleppmann
- [CQRS pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) — Microsoft Azure Architecture Center

---

## Backpressure, Load Shedding & Geo-Distribution (30 min)

### Core Knowledge (Mechanics & Laws)

- Backpressure: propagating downstream saturation upstream so producers slow down instead of buffering infinitely until OOM.
- Load Shedding: intentionally dropping excess or low-priority requests early (at edge/gateway) so critical traffic still meets SLOs (fail fast > fail slow for everyone).
- Rate Limiting Algorithms: Token Bucket (allows controlled bursts), Leaky Bucket (smooths output rate), Sliding Window Log/Counter (avoids boundary-spike double-bursts of Fixed Window).
- Multi-Region Topologies: Active-Passive (warm/pilot-light DR, simpler consistency, higher failover RTO) vs Active-Active (low global latency, complex write conflicts, CRDTs or home-region pinning).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- A system at 300% load WITHOUT load shedding serves 0% successful requests because every request times out after wasting CPU. With load shedding of 67% at the edge, it serves 100% of capacity cleanly.
- Always shed by business priority and cost: drop background analytics, bots, and unauthenticated crawls before dropping checkout payments or login.
- Multi-region Active-Active is exponentially harder than multi-AZ. Most companies think they need Active-Active writes when Geo-routed reads + single-region/home-pinned writes delivers local read latency and compliance without multi-leader conflict complexity.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Token Bucket Rate Limiter** | Supports legitimate short traffic bursts while enforcing steady-state average; O(1) memory per key. | Distributed enforcement requires atomic Redis Lua scripts or local-approximation sync. | Public APIs and per-tenant fairness quotas. |
| **Active-Active with Home-Region Pinning** | Low local latency and regional blast-radius isolation without multi-master write conflicts. | Cross-region travel/collaboration requires forwarding writes to user's home region. | Global user bases (EU/US/APAC) with regional data residency (GDPR) and latency needs. |

### Common Anti-Patterns

- Fixed-window rate limiting on high-value endpoints (allows 2x burst right across the minute boundary).
- Retry-after omission on 429/503 responses, causing clients to immediately hammer the gateway again.
- Testing disaster failover only on paper (a DR plan that isn't exercised in chaos/gamedays doesn't work).

> **Rule of Thumb:** Protect goodput at all costs: reject early at the cheapest layer, prioritize critical revenue/control-plane paths, and propagate deadlines downstream.

### Verified Primary Sources

- [Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) — David Yanacek (AWS Builders' Library)
- [Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters) — Paul Tarjan (Stripe Engineering)
- [Rate Limiting Algorithms](https://redis.io/glossary/rate-limiting/) — Redis Glossary

---
