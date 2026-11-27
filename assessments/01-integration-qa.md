# Assessment & Distractor Analysis — 01: System Integration

10 scenario-based engineering questions with detailed explanations and option-by-option distractor analysis.

---

## INT-01 — Dual-Write Problem & Transactional Outbox (`Senior`)

**Scenario:** Your Order Service creates an order in PostgreSQL, commits the transaction, and then calls `kafkaProducer.send(orderCreatedEvent)` on the next line. During a broker blip or pod OOM right after DB commit, ~0.3% of paid orders never reach the Warehouse Service, causing unshipped orders.

**Question:** Which architectural change permanently eliminates this partial-state inconsistency without introducing distributed 2PC locks?

- **A.** Wrap the PostgreSQL commit and the Kafka `send()` call inside a single `try/catch` block and roll back the DB transaction if Kafka throws.
- **B.** Publish the Kafka event inside the DB transaction BEFORE calling `COMMIT` so both happen together.
- **C.** Write the order row and an `outbox_events` row in the SAME local PostgreSQL ACID transaction, and stream the outbox table to Kafka via CDC or a polling relay.
- **D.** Enable Kafka `acks=all` and `enable.idempotence=true` on the producer so the broker guarantees delivery after DB commit.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **C**

**Explanation:** PostgreSQL and Kafka are separate distributed systems with no shared atomic commit protocol here. By persisting the domain state (`orders`) and the event payload (`outbox_events`) inside the same local ACID transaction, either both commit or both roll back. A separate Debezium CDC connector or polling relay reads committed outbox rows and publishes them at-least-once to Kafka, completely eliminating the dual-write gap.

#### Option & Distractor Analysis

- **A (Distractor — _Illusion of cross-system rollback_):** Once `COMMIT` finishes in Postgres, `catch` cannot magically undo it cleanly—and if the pod is SIGKILLed or OOM-killed between commit and `send()`, the `catch` block never even executes. Conversely, rolling back after a transient network timeout when Kafka *did* receive the message creates the reverse ghost-event bug.
- **B (Distractor — _Holding DB transactions open across network I/O_):** Publishing to Kafka *before* `COMMIT` creates two severe failures: (a) if Postgres later fails to commit (constraint violation, deadlock, node crash), consumers act on an order that never existed; (b) network latency to Kafka holds database row locks and connections open, tanking DB throughput.
- **C (Correct — Key Insight):** Local ACID atomicity across state + event record paired with asynchronous relay guarantees zero lost events without 2PC.
- **D (Distractor — _Confusing transport guarantees with application atomicity_):** `acks=all` and producer idempotence only make Kafka's internal replication and retry within a live producer reliable—they cannot bridge the crash window between a separate PostgreSQL `COMMIT` and calling `send()`.

> **Wisdom Takeaway:** Whenever two separate data stores must stay consistent on write, pick ONE source of truth for the ACID commit and derive the second asynchronously via an Outbox.

</details>

---

## INT-02 — Timeout Semantics & Idempotency (`Senior`)

**Scenario:** A Checkout Service calls a third-party Payment Gateway's `POST /charges` endpoint with a 3-second read timeout. When the gateway gets slow, Checkout catches `SocketTimeoutException` and automatically retries twice. Finance reports double-charged customers.

**Question:** What is the root cause and the correct production fix?

- **A.** Increase the read timeout to 30 seconds and remove retries so the gateway always finishes in one attempt.
- **B.** A read timeout means 'outcome unknown', not 'charge failed'. Attach a deterministic client-generated Idempotency-Key persisted with the checkout attempt, and ensure the gateway (or an internal ledger wrapper) deduplicates retries.
- **C.** Switch from HTTP POST to HTTP PUT, because PUT requests are automatically safe from duplicate side effects on any server.
- **D.** Check the customer's recent charges via `GET /charges?user_id=...` before retrying `POST /charges`.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** On a read timeout, the TCP packet already reached the payment gateway and likely executed the charge; only the response packet was delayed or lost. Retrying without an idempotency key creates a second independent charge. Generating and persisting a deterministic `Idempotency-Key` tied to the order attempt lets safe retries return the original charge outcome without re-executing the debit.

#### Option & Distractor Analysis

- **A (Distractor — _Masking partial failure with huge timeouts_):** A 30s timeout ties up caller worker threads/connections during gateway degradation (Little's Law saturation) AND still fails to solve true network drops after the server processed the charge.
- **B (Correct — Key Insight):** Network timeouts represent ambiguity, not failure; explicit idempotency keys make ambiguity safe to retry.
- **C (Distractor — _Relying on HTTP verb theory instead of server semantics_):** HTTP specifications define PUT as idempotent conceptually, but an endpoint only becomes idempotent if the server implements deduplication or state replacement logic—a payment gateway won't change non-idempotent charge creation just because of the verb.
- **D (Distractor — _Time-of-Check to Time-of-Use (TOCTOU) race condition_):** If the first charge is still in-flight or replicated asynchronously when `GET` runs, `GET` returns nothing, Checkout retries `POST`, and both charges succeed concurrently. Also fails if a legitimate repeat purchase happens seconds apart.

> **Wisdom Takeaway:** Never interpret a read timeout as 'nothing happened'; assume the mutation might have succeeded and require idempotency before any retry.

</details>

---

## INT-03 — Retry Amplification & Jitter (`Staff / Principal`)

**Scenario:** An API Gateway calls Service A, which calls Service B, which calls Service C. Each hop has an HTTP client configured with 3 automatic retries and deterministic 100ms exponential backoff (100ms, 200ms, 400ms). Service C experiences a brief 2-second GC stall and recovers, yet the whole platform stays in a brownout for 20 minutes.

**Question:** Why did the outage persist long after Service C recovered, and which combination of fixes stops this pattern?

- **A.** Service C's circuit breaker stayed Open too long; remove circuit breakers so traffic immediately warms C back up.
- **B.** Multiplicative retry amplification (up to 4^3 = 64x requests) plus synchronized deterministic backoff created a thundering retry storm; retry at only ONE layer with Full Jitter, propagate remaining request deadlines, and enforce a retry budget (e.g., max 10% retry ratio).
- **C.** Switch all internal calls from REST/JSON to gRPC/Protobuf so retries finish faster.
- **D.** Increase the backoff base from 100ms to 5,000ms at every service layer so Service C gets longer rest periods.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Layered retries multiply exponentially: 4 attempts at Gateway x 4 at A x 4 at B = 64 attempts at C per user request! Deterministic backoff synchronizes thousands of callers into lockstep waves. Retrying at only one edge/client layer (with deadline propagation so expired user requests aren't retried), adding Full Jitter to desynchronize waves, and capping total retries via a retry budget prevents metastable collapse.

#### Option & Distractor Analysis

- **A (Distractor — _Misdiagnosing protection as the cause_):** Removing circuit breakers floods a recovering dependency with full traffic immediately, keeping it pinned in GC/CPU exhaustion.
- **B (Correct — Key Insight):** Eliminating multiplicative retry layers + desynchronizing with jitter + retry budgets breaks the metastable feedback loop.
- **C (Distractor — _Micro-optimizing serialization during a macro traffic storm_):** Protobuf reduces per-request CPU slightly, but a 64x traffic amplification storm still overwhelms connection pools, threads, and downstream databases regardless of wire format.
- **D (Distractor — _Holding resources hostage while sleeping_):** Sleeping 5s+ across all layers multiplies concurrency `L = lambda * W`, exhausting threads/file descriptors across Gateway, A, and B while still keeping the 64x multiplicative retry fan-out.

> **Wisdom Takeaway:** Retries across multiple network hops multiply into self-inflicted DDoS attacks—budget retries at one layer, add jitter, and respect caller deadlines.

</details>

---

## INT-04 — Anti-Corruption Layer (ACL) (`Intermediate`)

**Scenario:** Your modern E-commerce Checkout domain integrates with a 15-year-old legacy ERP over SOAP XML where statuses are cryptic codes (`STAT_04_HLD`), prices are strings in local quirks, and customer IDs change format per country. Three new teams need ERP data this quarter.

**Question:** Where should the translation logic live to protect your core domains from legacy schema churn and cryptic semantics?

- **A.** Expose the ERP SOAP models directly in your internal GraphQL schema so every frontend and microservice can map the fields it needs.
- **B.** Build a dedicated Anti-Corruption Layer (ACL) boundary adapter that translates ERP XML/quirks into clean, canonical domain types and events before any core service consumes them.
- **C.** Ask the ERP vendor to rewrite their SOAP API into clean JSON REST endpoints before starting your feature work.
- **D.** Replicate the ERP's internal database tables directly into every microservice's database using nightly CSV dumps.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** An Anti-Corruption Layer isolates legacy messy semantics, protocols, and brittle models behind a translation boundary. Core services speak clean ubiquitous domain concepts (`OrderStatus.ON_HOLD`, `Money`), while all SOAP parsing, code mapping, and ERP bug workarounds live in one replaceable adapter.

#### Option & Distractor Analysis

- **A (Distractor — _Spreading legacy corruption everywhere_):** Exposing raw ERP quirks to every caller duplicates fragile `if (STAT_04_HLD)` logic across multiple teams and locks the entire company to the legacy model.
- **B (Correct — Key Insight):** Quarantining external volatility inside an ACL keeps core business logic clean and makes eventual ERP replacement trivial.
- **C (Distractor — _Blocking delivery on an external dependency you don't control_):** Legacy vendor rewrites take quarters or years and carry high risk; you need architectural isolation that works against the ERP as it exists today.
- **D (Distractor — _Coupling directly to internal physical schemas_):** CSV table dumps bypass business invariants, create stale batch windows, and couple all microservices to internal ERP table layouts.

> **Wisdom Takeaway:** Never let an external vendor's data model become your internal domain language—translate at the border with an Anti-Corruption Layer.

</details>

---

## INT-05 — Schema Evolution & Expand-Contract (`Senior`)

**Scenario:** A Billing Service publishes `InvoiceIssued` Avro/Protobuf events to Kafka consumed by 6 independent downstream services. You need to rename `amount_cents` (int) to `total_money` (an object with `amount` and `currency`) without breaking any consumer or requiring coordinated big-bang deployments.

**Question:** Which rollout sequence guarantees zero-downtime backward and forward compatibility?

- **A.** Update the producer schema to replace `amount_cents` with `total_money`, bump the Kafka topic name to `invoice-issued-v2`, and force all 6 teams to deploy at midnight.
- **B.** Use Expand-and-Contract: (1) Add `total_money` as an optional field while still populating `amount_cents`, (2) Consumers migrate to read `total_money` with fallback to `amount_cents`, (3) Once telemetry confirms zero readers of `amount_cents`, deprecate/stop populating it.
- **C.** Keep the field name `amount_cents` in the schema and change its type from integer to a nested JSON string so no schema change is registered.
- **D.** Delete `amount_cents` from the Schema Registry and restart Kafka brokers with compatibility mode set to `NONE`.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Expand-and-Contract decouples producer and consumer release schedules. Adding an optional `total_money` field is backward/forward compatible; dual-populating during transition allows all 6 teams to migrate safely on their own schedules, and telemetry verifies zero legacy readers before contracting.

#### Option & Distractor Analysis

- **A (Distractor — _Coordinated midnight deployments_):** Forcing 6 independent teams into lockstep deployment destroys team autonomy and guarantees painful rollback coordination if one consumer fails.
- **B (Correct — Key Insight):** Additive expansion + dual population + telemetry-verified contraction enables zero-coordination schema evolution.
- **C (Distractor — _Silent semantic/type breaking change_):** Changing an integer field's payload into a stringified object breaks strongly typed deserializers and causes silent runtime parsing failures.
- **D (Distractor — _Disabling safety rails instead of evolving safely_):** Setting compatibility to `NONE` and deleting fields immediately crashes existing consumers deserializing either old historical events or new events.

> **Wisdom Takeaway:** In distributed event streams, never rename or change types in place—add the new field, populate both, verify consumers moved, then retire the old.

</details>

---

## INT-06 — Saga Orchestration vs Choreography (`Senior`)

**Scenario:** A Fintech lending workflow executes 6 ordered steps across KYC, Credit Scoring, Fraud Check, Escrow Hold, Loan Disbursement, and Ledger Booking—with strict regulatory SLA timeouts and distinct compensation rules if step 4 or 5 fails.

**Question:** Why is an explicit Saga Orchestrator strongly preferred over pure event Choreography here?

- **A.** Choreography cannot be used with Kafka or RabbitMQ when more than 3 services exist.
- **B.** Orchestration centralizes state transitions, SLA timeout timers, and compensating step order in one inspectable state machine, preventing scattered cyclic logic across 6 teams.
- **C.** Orchestration uses database 2PC locks under the hood so compensations are never needed.
- **D.** Choreography always duplicates network traffic 6x compared to orchestration.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** With 6 sequential conditional steps, strict timeouts, and ordered compensations, pure choreography scatters the workflow across 6 codebases—making it nearly impossible to answer 'what state is Loan #991 stuck in?' or change step ordering cleanly. An Orchestrator (e.g., Temporal or a dedicated state-machine service) keeps flow control, timers, and compensation explicit while domain services still own their business logic.

#### Option & Distractor Analysis

- **A (Distractor — _False technical limitation_):** Message brokers support dozens of choreographed consumers easily; the problem with choreography at 6+ conditional steps is cognitive and operational complexity, not broker capability.
- **B (Correct — Key Insight):** Complex multi-step workflows with timeouts and ordered rollbacks need centralized state visibility, not scattered implicit reactions.
- **C (Distractor — _Confusing Sagas with 2PC_):** Sagas explicitly avoid distributed 2PC locks and *always* rely on compensating actions when downstream steps fail after earlier local commits.
- **D (Distractor — _Invented performance metric_):** Orchestration actually sends command + reply messages through the coordinator (similar or slightly more hops than direct choreography); you choose orchestration for clarity and control, not fewer packets.

> **Wisdom Takeaway:** Use choreography for simple 'something happened, anyone interested react' fan-out; use orchestration when workflow order, timeouts, and compensation are core business invariants.

</details>

---

## INT-07 — Bulkhead Isolation (`Intermediate`)

**Scenario:** Your API server exposes `/search`, `/checkout`, and `/export-pdf`. The `/export-pdf` endpoint calls a slow third-party rendering service. Whenever the PDF vendor slows down to 20s responses, `/checkout` and `/search` also start timing out with 503s even though their own databases are healthy.

**Question:** Which pattern prevents the slow PDF dependency from starving unrelated healthy endpoints?

- **A.** Bulkhead Pattern: isolate thread pools, connection pools, or semaphores per downstream dependency/workload so PDF rendering can exhaust only its own capped quota.
- **B.** Increase the global web server worker thread pool from 200 to 2,000.
- **C.** Add a global LRU response cache in front of `/export-pdf`.
- **D.** Move `/export-pdf` from HTTP/1.1 to HTTP/2 multiplexing on the same shared worker pool.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **A**

**Explanation:** Like watertight compartments on a ship, Bulkheads partition concurrency resources (threads, HTTP client pools, semaphore slots) per dependency or route. If the PDF vendor hangs and consumes all 15 PDF slots, new PDF requests fail fast while the 185 slots reserved for `/checkout` and `/search` remain completely unaffected.

#### Option & Distractor Analysis

- **A (Correct — Key Insight):** Resource partitioning caps the blast radius of a single slow dependency so healthy paths keep their capacity.
- **B (Distractor — _Throwing unpartitioned capacity at a slow leak_):** Without bulkheads, 2,000 threads will simply also get consumed by slow PDF calls during sustained degradation—plus 2,000 threads increase memory footprint and CPU context switching.
- **C (Distractor — _Assuming every slow endpoint is cacheable_):** Custom user-specific PDF exports rarely have high cache hit rates, and cache misses still saturate the shared worker pool.
- **D (Distractor — _Confusing transport multiplexing with worker pool isolation_):** HTTP/2 multiplexes TCP frames over one socket, which doesn't stop slow PDF work from holding every application worker thread on the shared pool.

> **Wisdom Takeaway:** Shared resource pools turn one slow external vendor into a total platform outage; isolate slow or untrusted dependencies behind dedicated bulkheads.

</details>

---

## INT-08 — Poison Pill & Dead Letter Queue Hygiene (`Staff / Principal`)

**Scenario:** A Kafka consumer group processes `UserProfileUpdated` events across 12 partitions. One corrupted event triggers an unhandled `NullPointerException` during deserialization. Your consumer framework catches the exception, logs it, and refuses to commit the offset, retrying the same message forever.

**Question:** What happens to the system and what is the production-grade resolution?

- **A.** Only that single user is delayed; keep retrying indefinitely until a developer deploys a fix next week.
- **B.** That entire partition stalls behind the poison-pill message (head-of-line blocking), backing up thousands of healthy users on the same partition. Route non-transient/deserialization failures after bounded retries to a Dead Letter Topic (DLT) with schema metadata, alert on DLT depth, and provide an audited replay tool.
- **C.** Catch all exceptions and commit the offset anyway so throughput never drops.
- **D.** Increase partitions from 12 to 120 so the poison pill affects fewer users.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Kafka commits offsets sequentially per partition, so one unprocessable poison pill halts 1/12th of all users indefinitely. Distinguishing transient infrastructure failures (retry with backoff / pause) from non-transient poison pills (malformed payload/code bug -> route to DLT with error headers + original offset + alert + replay workflow) preserves flow for healthy traffic without silent data loss.

#### Option & Distractor Analysis

- **A (Distractor — _Forgetting partition-level head-of-line blocking_):** A Kafka partition holds events for ~8.3% of your entire keyspace, not just one user. Blocking offset commits freezes every user hashed to that partition.
- **B (Correct — Key Insight):** Separating non-transient poison pills into an alerted, replayable DLT unblocks healthy partition traffic without dropping data.
- **C (Distractor — _Silent data loss_):** Swallowing exceptions and committing offsets permanently deletes business events with zero recovery path once log retention expires.
- **D (Distractor — _Reducing blast radius from 8% to 0.8% instead of fixing the stall_):** 0.8% of your customer base completely frozen for days is still a major incident, and you still lack a mechanism to recover the broken message.

> **Wisdom Takeaway:** Distinguish 'dependency temporarily down' (pause/backoff) from 'this message is toxic' (bounded retry -> alerted Dead Letter Topic with replay).

</details>

---

## INT-09 — Thin Events vs Event-Carried State Transfer (`Intermediate`)

**Scenario:** Every time a popular creator uploads a post, `ContentService` emits a thin event `{ postId: 123 }`. Immediately, 14 downstream microservices (Notifications, Search, Feed, Analytics, Moderation, Billing, etc.) all call `GET /posts/123` simultaneously.

**Question:** What integration flaw is occurring and how does Event-Carried State Transfer (ECST) resolve it?

- **A.** The broker is misconfigured; enable Kafka compression to shrink `{ postId: 123 }`.
- **B.** Thin events force immediate synchronous callbacks from every consumer back to the producer (creating a self-inflicted read DDoS and restoring temporal coupling). Embedding the immutable snapshot of relevant post attributes in the event (ECST) lets consumers process asynchronously without calling back.
- **C.** Put the post content in a Redis key and pass the Redis password in the event.
- **D.** Replace Kafka with cron jobs polling `ContentService` every 5 seconds.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Thin notification events sound clean in theory, but when 14 services react concurrently, each event amplifies into 14 synchronous GET calls against `ContentService`—reintroducing temporal coupling and read spikes! Event-Carried State Transfer includes a well-versioned public state snapshot in the event so consumers remain autonomous.

#### Option & Distractor Analysis

- **A (Distractor — _Optimizing payload size when callback fan-out is the problem_):** The event is already tiny (`{ postId: 123 }`); the bottleneck is the 14 synchronous HTTP callbacks triggered upon delivery.
- **B (Correct — Key Insight):** Carrying a clean public state snapshot in the event eliminates synchronous callback storms and truly decouples availability.
- **C (Distractor — _Shared cache backdoor coupling_):** Sharing a private Redis cluster across 14 services couples everyone to internal cache serialization, TTL eviction races, and security boundaries.
- **D (Distractor — _Replacing event-driven push with wasteful polling_):** 14 services polling every 5 seconds wastes bandwidth, increases latency, and still hammers `ContentService`.

> **Wisdom Takeaway:** If an asynchronous event forces every subscriber to synchronously call the publisher right back, you haven't decoupled anything—you just added a broker in front of a stampede.

</details>

---

## INT-10 — Contract Testing vs End-to-End Environments (`Senior`)

**Scenario:** Your company has 18 microservices. Before every deploy, all 18 services must pass an integrated end-to-end test suite in a shared `staging` environment. The suite takes 90 minutes, flakes 35% of the time due to dirty shared test data and someone else's broken deploy, and stalls releases.

**Question:** How do you restore fast, reliable integration verification across the 18 services?

- **A.** Replace all integration tests with unit tests using handwritten mocks for every HTTP client.
- **B.** Adopt Consumer-Driven Contract Testing (e.g., Pact or OpenAPI/Protobuf schema verification in CI) alongside isolated ephemeral container tests per service, reserving a tiny smoke suite for staging.
- **C.** Deploy directly to production without integration tests and rely only on Rollback.
- **D.** Create 5 more shared staging environments so teams wait less in line.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Shared full-mesh staging environments scale quadratically in flakiness and wait time. Consumer-Driven Contract Tests verify in milliseconds during each service's CI build that producers satisfy every consumer's actual expectations (and consumers only depend on valid contract fields), drastically reducing reliance on brittle shared staging.

#### Option & Distractor Analysis

- **A (Distractor — _Handwritten mocks drift silently from reality_):** Mocks only verify what the consumer *assumes* the producer returns—when the producer renames a field, unit tests still pass green while production crashes.
- **B (Correct — Key Insight):** Contract tests verify both sides independently in seconds without needing all 18 live services running simultaneously.
- **C (Distractor — _Reckless removal of contract verification_):** Catching schema breaks in production hurts customers and still causes noisy rollbacks, especially for async queues where bad events pollute topics.
- **D (Distractor — _Scaling a broken architecture linearly_):** 5 staging environments multiply cloud cost and environment-drift maintenance while each individual 90-minute run still flakes 35% of the time.

> **Wisdom Takeaway:** Use contract tests to prove services agree on interfaces in isolation; never turn a shared staging environment into a distributed monolith bottleneck.

</details>

---
