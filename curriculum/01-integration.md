# Pillar 01: System Integration

> **Connecting heterogeneous systems without cascading failure or schema lock-in**

Integration is where clean diagrams meet messy distributed reality: partial failures, network partitions, clock skew, duplicate deliveries, and competing schema lifecycles.

**Core Mental Model:** Every integration boundary is a coupling contract across four axes: temporal, spatial, semantic (schema), and operational. Expert integration minimizes unintended coupling across all four.

---

## Integration Styles & Coupling Axes (25 min)

### Core Knowledge (Mechanics & Laws)

- Four primary integration topologies: Shared Database (tightest coupling), File/Batch Transfer, Synchronous Request-Reply (REST, gRPC, GraphQL), and Asynchronous Messaging/Streaming (Queues, Pub/Sub, Kafka).
- Temporal coupling: synchronous calls require caller and callee to be available simultaneously; asynchronous queues decouple availability windows.
- Semantic coupling: sharing internal domain models across service boundaries forces coordinated deployments whenever internals change.
- Command vs Event vs Query semantics: Commands express intent to mutate a specific target; Events broadcast immutable facts about what happened; Queries request state.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Shared database integration feels fastest on Day 1 and becomes an unrefactorable tar pit by Month 6 because schema migrations break unknown downstream readers.
- Prefer choreography (reacting to events) when downstream workflows are independent and extensible; prefer orchestration when multi-step business invariants, timeouts, and compensation order must be visible in one place.
- Do not use Kafka as a request-reply RPC bus unless you enjoy debugging correlation IDs, partition skew, and consumer lag under user-facing latency budgets.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Synchronous REST / gRPC** | Simple mental model, immediate feedback, easy debugging and tracing, natural backpressure via caller timeout. | Temporal coupling, availability is product of chain (0.99^5 = 0.951), tail latency compounds across hops. | Read paths requiring fresh state, low-latency user decisions, or thin internal gateways with bounded fan-out. |
| **Asynchronous Queue / Event Stream** | Temporal decoupling, traffic spike buffering, independent consumer scaling, easy fan-out to new subscribers. | Eventual consistency UX, harder end-to-end debugging, requires idempotency and dead-letter handling. | Side-effects, cross-domain state propagation, bursty workloads, and slow downstream third-party APIs. |
| **CDC (Change Data Capture)** | Captures committed DB state reliably without dual-write bugs; zero application-code polling. | Couples consumers to source table schemas unless paired with an Outbox table; operational complexity of Debezium/connectors. | Syncing legacy databases to search/analytics or implementing the Transactional Outbox reliably. |

### Common Anti-Patterns

- Distributed Shared Database: multiple services reading/writing each other's internal tables directly.
- Event-Carried State Bloat / Thin-Event Ping-Pong: publishing empty events that force 10 consumers to immediately DDoS the producer's GET endpoint.
- Synchronous Call Chains (>3 hops) on critical user checkout or login paths.

> **Rule of Thumb:** Ask: 'If the downstream system goes down for 15 minutes, must my caller fail immediately?' If no, never put a synchronous network call on that path.

---

## Reliability Across Unreliable Networks (30 min)

### Core Knowledge (Mechanics & Laws)

- Delivery guarantees: At-most-once (may lose), At-least-once (may duplicate), and Effectively-once (at-least-once transport + idempotent consumer + deduplication state).
- Dual-Write Problem: writing to a database AND publishing to a message broker in separate operations is non-atomic—a crash in between leaves permanent inconsistency.
- Transactional Outbox Pattern: persist domain changes and an outbox event row in the SAME local ACID transaction, then relay asynchronously via polling or CDC.
- Saga Pattern: manages distributed transactions without 2PC locks by chaining local transactions with explicit compensating actions for failures.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Exact-once delivery over an arbitrary network is mathematically impossible (Two Generals Problem); what production systems actually build is at-least-once delivery with idempotent execution.
- Idempotency keys must be scoped to (tenant/actor + operation + payload hash) and stored atomically with the side effect—never in a separate non-transactional cache check.
- Every Dead Letter Queue (DLQ) without an alerting threshold, inspection UI, and replay runbook is just a silent data graveyard.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Two-Phase Commit (2PC / XA)** | Strong atomic illusion across resources without custom compensation logic. | Coordinator single point of failure, holds locks across network RTTs, terrible tail latency, unsupported by modern SaaS APIs. | Rarely in distributed microservices; mostly inside single-engine distributed databases. |
| **Saga with Orchestrator** | Centralizes workflow state, explicit timeouts, clear compensation paths, avoids cyclic event dependencies. | Orchestrator can become a 'god service' if business logic leaks into it; extra state store to operate. | Complex multi-step workflows (payments, travel booking, order fulfillment) with 3+ steps. |
| **Transactional Outbox + CDC** | Eliminates dual-write inconsistency using local DB ACID guarantees; clean separation of domain and transport. | Requires outbox table cleanup/retention and deduplication on the consumer side. | Default pattern whenever a service must reliably emit events on state changes. |

### Common Anti-Patterns

- Fire-and-forget publish inside an HTTP handler after DB commit without an outbox.
- Blindly retrying non-idempotent POST/charge requests on socket timeouts (read timeout != request failed).
- Infinite retry loops on poison-pill messages that block an entire Kafka partition.

> **Rule of Thumb:** Never trust a timeout to mean 'nothing happened'. Treat timeouts as 'unknown outcome' and require idempotency before retrying.

---

## Contracts, Evolution & Fault Isolation (25 min)

### Core Knowledge (Mechanics & Laws)

- Anti-Corruption Layer (ACL): translates between an external/legacy system's messy model and your clean internal domain model so external quirks don't leak inward.
- Schema Compatibility: Backward (new reader reads old data), Forward (old reader reads new data), Full (both). Additive optional fields preserve compatibility; renames/type changes break it.
- Expand-and-Contract Migration: (1) Expand schema to support old+new, (2) Dual-write/backfill, (3) Switch readers, (4) Contract/remove old fields.
- Resilience Primitives: Timeouts (connect + read), Bounded Retries with Exponential Backoff + Full Jitter, Circuit Breakers (Closed/Open/Half-Open), and Bulkheads (isolating thread/connection pools per dependency).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Retries without jitter synchronize failing clients into retry storms that keep an overloaded dependency dead long after traffic drops.
- A timeout without a bulkhead still lets one slow dependency exhaust all worker threads in your service, taking down unrelated healthy endpoints.
- Contract tests (e.g., Pact or schema registry checks in CI) catch breaking changes in seconds; full end-to-end staging environments catch them days too late—or miss them due to environment drift.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **URL/Header API Versioning (v1 -> v2)** | Explicit breaking transitions, clean separation for external third-party integrators. | Forces long-term maintenance of parallel handlers and bugfixes across versions. | Public/partner APIs with external consumers you cannot deploy alongside. |
| **Continuous Backward-Compatible Evolution** | Zero version sprawl, continuous delivery, consumers upgrade at their own pace. | Requires strict discipline (no field reuse, additive changes, deprecation telemetry). | Internal APIs, Protobuf/Avro event streams, and fast-moving product teams. |

### Common Anti-Patterns

- Retry amplification across layers: 3 retries at Gateway x 3 at Service A x 3 at Service B = 27x load during an outage.
- Default infinite or 60-second HTTP client timeouts.
- Exposing raw vendor/ERP field names directly in your public API responses.

> **Rule of Thumb:** Retry only at ONE layer (typically closest to the origin or via explicit deadline propagation), always with jitter and a retry budget.

---
