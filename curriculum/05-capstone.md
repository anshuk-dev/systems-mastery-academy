# Pillar 05: Integrated Systems Capstone

> **Synthesizing Integration, Modularity, Optimization, and Scalability under real-world constraints**

Real engineering problems never arrive labeled 'This is a Scalability question'. A caching fix breaks consistency; a modular microservice split blows up tail latency; an integration retry triggers a cascading outage.

**Core Mental Model:** Every architectural decision shifts complexity rather than destroying it. Principal engineering wisdom is knowing *where* to place the complexity so it stays observable, reversible, and proportional to your team's operational maturity.

---

## Cross-Pillar Trade-offs & Principal Decision Framework (30 min)

### Core Knowledge (Mechanics & Laws)

- Tension 1 (Modularity vs Optimization): splitting into fine-grained network services improves team autonomy but replaces sub-microsecond function calls with millisecond serialization and tail-latency amplification.
- Tension 2 (Integration vs Scalability): synchronous request-reply preserves immediate invariants but couples availability and limits burst absorption compared to async outbox pipelines.
- Tension 3 (Optimization vs Consistency): aggressive caching and read replicas slash DB load and latency, but introduce stale-read windows and cache invalidation races.
- Reversibility Matrix (Two-Way vs One-Way Doors): invest deep upfront design only in hard-to-reverse decisions (data ownership boundaries, shard keys, public contracts, consistency guarantees).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- When diagnosing an incident, trace in reverse order of layers: Load/Traffic -> Edge/Gateway -> App Threads/Pools -> Cache -> Database/Locks -> Downstream Integrations.
- Never adopt a pattern just because a hyperscaler blogged about it—Google/Netflix solve problems at 10,000-engineer and million-QPS scale where the cost of coordination differs completely from yours.
- Write RFCs that explicitly list 'What breaks first at 10x load?' and 'How do we disable/roll back this integration in 60 seconds?'

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Boring Monolith + Outbox + Read Replica + Redis** | Handles 10k-50k+ RPS easily, small team velocity, high observability, minimal distributed failure modes. | Requires modular discipline inside repo; less suited for 200+ engineers sharing one deploy pipeline. | Default baseline architecture until concrete bottlenecks prove otherwise. |
| **Distributed Event-Driven + Sharded Services** | Extreme scale, independent fault/deploy domains, multi-region resilience. | High operational floor (meshes, tracing, schema registries, distributed debugging, SRE staffing). | High-scale, multi-team enterprises with mature platform engineering. |

### Common Anti-Patterns

- Resume-Driven Architecture: adopting Kafka + 15 microservices + GraphQL federation for 50 requests/second.
- Local Optimization Bias: speeding up one service 10x only to discover it now overwhelms the unscaled downstream payment partner.
- Missing Ownership: 'shared' infrastructure or queues that belong to everyone and therefore no one during a 2 AM outage.

> **Rule of Thumb:** Optimize for reversibility, debuggability at 2 AM, and alignment with team topology—not diagram elegance.

---
