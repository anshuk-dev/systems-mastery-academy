# Pillar 02: Modular Architecture

> **Structuring codebases and boundaries so change stays cheap as teams and systems grow**

Modularity is not about splitting one repo into 40 microservices. It is about high cohesion inside boundaries, narrow interfaces across them, and aligning change rates so one feature doesn't touch ten modules.

**Core Mental Model:** Modularity is measured by the blast radius of a requirement change. If changing tax rules requires editing UI controllers, database schemas, and three other teams' services, your boundaries are wrong regardless of how many repos you have.

---

## Cohesion, Coupling & Connascence (25 min)

### Core Knowledge (Mechanics & Laws)

- Cohesion: how strongly elements inside a module belong together because they change for the same business reason (Common Closure Principle).
- Coupling: the degree to which one module depends on the internal knowledge or timing of another.
- Connascence Hierarchy (weakest to strongest): Name -> Type -> Meaning -> Position -> Algorithm -> Execution Order -> Timing -> Value -> Identity. Stronger connascence across module boundaries makes change expensive.
- Vertical Slice Architecture vs Technical Layering: grouping by business capability/feature keeps changes localized, whereas horizontal layers (controllers/services/repos) scatter a single feature across every folder.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- DRY (Don't Repeat Yourself) is widely misunderstood: duplicating incidental code across two independent bounded contexts is far healthier than creating a shared 'common-domain' library that couples their release cycles.
- Physical separation (microservices) does NOT create logical modularity; if you split a tangled monolith over the network, you just traded fast in-process method calls for slow, flaky RPCs.
- Hide volatile design decisions (pricing engines, external vendor SDKs, storage formats) behind stable interfaces.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Vertical Slices / Feature Modules** | High cohesion per use case, minimal cross-module edits, easy onboarding and deletion. | Small amount of structural boilerplate repeated across slices if not kept lean. | Business applications where features evolve independently. |
| **Shared Core Library** | Consistent behavior for truly universal cross-cutting utilities (logging, auth parsing, telemetry). | Version lock-in and coordinated upgrades if domain logic sneaks in. | Pure technical primitives with near-zero churn; avoid for business rules. |

### Common Anti-Patterns

- God Util / Shared-Models Package containing every entity in the company.
- Anemic Domain Model: data bags with getters/setters and business invariants scattered across 15 service classes.
- Premature abstraction ('just in case' interfaces with only one implementation that mirrors the concrete class 1:1).

> **Rule of Thumb:** Duplicate code before coupling domains. Wait for three real divergent use cases (Rule of Three) before extracting a shared abstraction.

### Verified Primary Sources

- [Connascence (Software Engineering)](https://en.wikipedia.org/wiki/Connascence) — Meilir Page-Jones (via Wikipedia)
- [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) — Martin Fowler
- [Decompose by Business Capability](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html) — Chris Richardson (microservices.io)

---

## Hexagonal Boundaries & Modular Monoliths (30 min)

### Core Knowledge (Mechanics & Laws)

- Hexagonal Architecture (Ports & Adapters): core domain logic defines abstract Ports (interfaces); external details (DBs, HTTP, Kafka, Stripe) live in Adapters that depend inward on the core.
- Dependency Inversion Principle: high-level business policy never imports low-level infrastructure drivers.
- Modular Monolith: single deployable unit partitioned into strictly isolated domain modules communicating through explicit public module facades or in-process events, with separate logical schemas/tables.
- Distributed Monolith: separate deployables that still require lockstep releases, share databases, or fail together synchronously.

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Start with a Modular Monolith until you have concrete organizational scaling bottlenecks, independent scaling profiles, or regulatory isolation needs. Extracting a clean module into a service takes days; untangling premature microservices takes years.
- Enforce module boundaries automatically with build/lint tools (ArchUnit, Deptrac, ESLint boundaries, Go internal packages)—developer willpower always erodes under deadline pressure.
- A module should own its own data. If Module A joins against Module B's SQL tables, you do not have modular boundaries.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Modular Monolith** | ACID transactions inside modules, zero network serialization tax, single CI/CD, trivial refactoring across boundaries. | Shared failure domain (OOM kills process), single language/runtime, requires discipline to keep boundaries clean. | Early-to-mid scale systems and teams that do not yet face independent release or scaling bottlenecks (Fowler's MonolithFirst). |
| **Microservices** | Independent deployment velocity for large orgs, fault/resource isolation, polyglot tech when genuinely needed, independent horizontal scaling. | Distributed systems tax (tracing, service mesh, eventual consistency, contract testing, DevOps overhead). | Distinct scaling/security boundaries or 5+ autonomous teams stepping on each other's release cadence. |

### Common Anti-Patterns

- Nano-services: one service per database table or CRUD entity.
- Entity leakage: returning ORM database entities directly from REST controllers or cross-module APIs.
- Allowing Domain Core to import HTTP, SQL, or framework annotations.

> **Rule of Thumb:** If two services always have to be deployed together to ship one feature, they are one logical module pretending to be two.

### Verified Primary Sources

- [Hexagonal Architecture (Ports and Adapters)](https://alistair.cockburn.us/hexagonal-architecture/) — Alistair Cockburn
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — Martin Fowler
- [Microservices](https://martinfowler.com/articles/microservices.html) — James Lewis & Martin Fowler

---

## Evolutionary Architecture, Conway's Law & Migrations (25 min)

### Core Knowledge (Mechanics & Laws)

- Conway's Law: systems inevitably mirror the communication structures of the organizations that build them.
- Inverse Conway Maneuver: deliberately structure teams around desired bounded contexts (stream-aligned teams) rather than horizontal tech silos (DB team, API team, UI team).
- Strangler Fig Pattern: incrementally route traffic from legacy system to new modular components behind an edge proxy/facade until the legacy core shrinks to zero.
- Architectural Fitness Functions: automated tests in CI/production that verify structural invariants (no cyclic dependencies, latency budgets, bundle size, module isolation).

### Principal Engineering Wisdom (Judgment & Trade-offs)

- Never bet the company on a 'Big Bang Rewrite'. Legacy systems embody years of undocumented edge cases; strangling them slice-by-slice delivers value every week and caps blast radius.
- Dual-run shadow traffic and parity comparisons before cutting over critical read/write paths during a Strangler Fig migration.
- Architecture without automated governance (fitness functions) decays via entropy—every urgent hotfix bypasses the undocumented diagram on Confluence.

### Architectural Trade-off Matrix

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| **Strangler Fig Migration** | Incremental value delivery, low risk, continuous production validation, easy rollback per route. | Temporary coexistence complexity, data synchronization bridge needed during transition. | Modernizing business-critical legacy monoliths that must remain live. |
| **Branch by Abstraction** | Clean in-codebase replacement of a deeply embedded library/storage engine behind an abstraction without long-lived Git branches. | Requires temporary dual-implementation adapter and feature flags. | Swapping core dependencies (e.g., search engine, payment SDK, ORM) safely in trunk-based development. |

### Common Anti-Patterns

- Big Bang 18-month rewrite while feature work continues on the legacy branch (the moving-target trap).
- Siloed 'Backend / Frontend / DBA' teams building microservices—guarantees multi-team tickets for every trivial change.
- Unmonitored feature flags left behind after migrations, creating exponential test matrices.

> **Rule of Thumb:** Never start a migration without knowing how you will verify parity and how you will roll back in under 5 minutes.

### Verified Primary Sources

- [How Do Committees Invent? (Conway's Law, 1968)](https://www.melconway.com/Home/Conways_Law.html) — Melvin E. Conway
- [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) — Martin Fowler
- [Branch by Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html) — Martin Fowler
- [Fitness Function-Driven Development](https://www.thoughtworks.com/insights/articles/fitness-function-driven-development) — Thoughtworks

---
