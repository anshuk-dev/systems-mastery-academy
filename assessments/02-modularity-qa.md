# Assessment & Distractor Analysis — 02: Modular Architecture

10 scenario-based engineering questions with detailed explanations and option-by-option distractor analysis.

---

## MOD-01 — Distributed Monolith Anti-Pattern (`Senior`)

**Scenario:** A startup split its Rails app into 12 microservices. Today, shipping a simple 'Add Coupon Discount' feature requires opening PRs in 6 repositories, migrating a shared PostgreSQL database used by 4 services, and deploying all 6 services in a strict manual sequence.

**Question:** What architectural failure occurred, and what is the wisest corrective strategy?

- **A.** They haven't split far enough; split the 12 services into 30 smaller single-entity services.
- **B.** They built a Distributed Monolith—physical separation without logical boundaries or data ownership. Consolidate tightly coupled services back into a Modular Monolith (or realign around true Bounded Contexts where each module owns its own data and public facade).
- **C.** Install Istio Service Mesh and Kubernetes ArgoCD to automate the 6-service synchronized deploys.
- **D.** Introduce GraphQL Federation on top of the 12 services so frontend only makes one call.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Lockstep deployments and shared database tables prove the 12 services are not independent bounded contexts—they just added network serialization and operational overhead on top of coupled logic. Merging coupled pieces into a Modular Monolith (or carving clean data-owning boundaries) eliminates distributed friction while preserving clean internal modules.

#### Option & Distractor Analysis

- **A (Distractor — _Doubling down on the wrong decomposition axis_):** Splitting 12 coupled services into 30 nano-services makes one feature touch 15 repos instead of 6, multiplying network latency and deployment choreography.
- **B (Correct — Key Insight):** Modularity is determined by independent changeability and data ownership, not deployment count.
- **C (Distractor — _Using DevOps tooling to mask bad domain boundaries_):** ArgoCD and service meshes automate deployment mechanics, but they cannot fix a shared database schema or cross-service domain coupling.
- **D (Distractor — _Beautifying the storefront while the kitchen is tangled_):** GraphQL Federation only simplifies client querying; backend feature changes still require 6 coordinated PRs and shared DB migrations.

> **Wisdom Takeaway:** If a single business change consistently requires synchronized releases across multiple services, you don't have microservices—you have a distributed monolith.

</details>

---

## MOD-02 — Hexagonal Architecture & Dependency Inversion (`Intermediate`)

**Scenario:** Your core Tax & Pricing calculation engine imports `sqlalchemy.orm.Session`, `stripe.Charge`, and `flask.request` directly inside pricing methods. Writing unit tests takes 40 seconds per run using Docker Postgres, and swapping Stripe for Adyen looks terrifying.

**Question:** How does Hexagonal (Ports & Adapters) Architecture solve this cleanly?

- **A.** Keep all SQL and Stripe calls inside the pricing engine, but mock `flask.request` and `stripe.Charge` globally in `conftest.py`.
- **B.** Move pure pricing rules into a framework-free Domain Core that defines narrow Port interfaces (`PaymentPort`, `TaxRateRepository`). Implement SQLAlchemy, Stripe/Adyen, and Flask HTTP handlers as outer Adapters that depend inward on the core.
- **C.** Rewrite the pricing engine as stored procedures inside PostgreSQL so Python tests aren't needed.
- **D.** Split every pricing class into its own AWS Lambda function.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** In Hexagonal Architecture, business policy never depends on I/O frameworks or vendor SDKs. By defining Ports owned by the domain core and plugging in outer Adapters, core pricing logic tests in milliseconds with in-memory fakes, and swapping Stripe for Adyen only requires writing a new Adapter.

#### Option & Distractor Analysis

- **A (Distractor — _Brittle monkeypatching to compensate for inverted dependencies_):** Mocking third-party SDK internals across tests ties your test suite to Stripe's library structure and leaves domain rules entangled with HTTP/ORM lifecycles.
- **B (Correct — Key Insight):** Dependencies must point INWARD toward stable business rules, never outward from business rules to volatile infrastructure.
- **C (Distractor — _Locking business logic into the database engine_):** Stored procedures make versioning, local testing, horizontal compute scaling, and vendor integrations dramatically harder.
- **D (Distractor — _Confusing serverless packaging with clean dependency structure_):** A Lambda function whose handler still entangles Stripe SDK, HTTP parsing, and pricing math has the exact same coupling problem—now with cold starts.

> **Wisdom Takeaway:** Your business logic should have zero idea whether it was invoked by HTTP, Kafka, or a CLI test—and zero idea whether data lives in Postgres or memory.

</details>

---

## MOD-03 — DRY Misuse vs Bounded Context Autonomy (`Senior`)

**Scenario:** Both the `OrderFulfillment` module and the `CustomerBilling` module have a `Customer` class with `name`, `address`, and `status`. A well-meaning engineer proposes extracting `Customer` into a single `company-common-domain` npm/PyPI package shared by both modules.

**Question:** Why should a Principal Engineer push back on merging these two `Customer` models into one shared domain package?

- **A.** Shared npm/PyPI packages are always slower at runtime than duplicated classes.
- **B.** Although they share the word 'Customer', Fulfillment cares about shipping addresses and delivery instructions while Billing cares about tax IDs, credit limits, and invoicing cycles. Merging them creates semantic coupling across independent change axes.
- **C.** JavaScript and Python cannot import shared classes across directories.
- **D.** Because DRY only applies to UI components, never backend code.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** This is the classic Bounded Context trap: two domains share a vocabulary word ('Customer') but represent distinct concepts evolving on different schedules. Sharing a unified domain model forces Billing changes to trigger Fulfillment redeployments and breeds giant classes full of nullable fields (`shippingGateCode` mixed with `vatNumber`).

#### Option & Distractor Analysis

- **A (Distractor — _Inventing runtime performance reasons for an architectural coupling problem_):** Importing a package adds negligible runtime cost; the real damage is release coupling, bloated god-entities, and accidental cross-team breakage.
- **B (Correct — Key Insight):** DRY applies to duplicating single business knowledge, NOT to accidentally uniting concepts from separate Bounded Contexts that happen to share a noun.
- **C (Distractor — _False technical claim_):** Sharing packages is mechanically easy—that's precisely why developers overdo it before feeling the organizational pain.
- **D (Distractor — _Overgeneralized dismissal of DRY_):** DRY is valuable *within* a single cohesive concept (e.g., one authoritative tax calculation formula), just harmful when forcing artificial unification *across* bounded contexts.

> **Wisdom Takeaway:** A little duplication across bounded contexts is far cheaper than the wrong shared abstraction.

</details>

---

## MOD-04 — Connascence & Coupling Strength (`Staff / Principal`)

**Scenario:** Module A exports a function `process_order(data: tuple)` where callers must pass `(user_id, coupon_code, total_cents, is_vip)` in that exact positional order, and `process_order` relies on `validate_inventory()` having mutated a global cache right before it runs.

**Question:** Which statement accurately diagnoses the coupling risks using Connascence theory?

- **A.** This is only Connascence of Name, which is the weakest and safest form of coupling.
- **B.** The tuple exhibits Connascence of Position (fragile argument ordering), while the hidden cache mutation exhibits Connascence of Execution Order (temporal coupling). Replacing the tuple with an explicit typed DTO/command and passing validated state explicitly weakens coupling to Connascence of Name/Type.
- **C.** This is Connascence of Algorithm and can only be fixed by splitting Module A into a microservice.
- **D.** Positional tuples are safer than named fields because they avoid naming conflicts.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Connascence measures how painful a change is. Positional tuples break silently if two integers or booleans swap positions (Connascence of Position). Requiring a prior secret global mutation is Connascence of Execution Order—any refactor or async reordering causes subtle bugs. Explicit typed objects and pure data-flow weaken coupling to Name & Type, caught at compile/lint time.

#### Option & Distractor Analysis

- **A (Distractor — _Misidentifying strong positional & temporal coupling as harmless name coupling_):** Connascence of Name (agreeing on a method/field identifier) is trivial to refactor with IDE tooling; positional tuples and hidden order-dependent mutations break silently at runtime.
- **B (Correct — Key Insight):** Good modular design systematically converts dynamic/positional/order coupling into explicit static Type and Name contracts.
- **C (Distractor — _Overkill physical split for an interface-design flaw_):** Moving bad function contracts over HTTP just makes positional and order coupling even harder to debug.
- **D (Distractor — _Confusing brevity with safety_):** Short positional tuples invite silent transposition bugs (swapping `amount` and `user_id` if both are ints) and hurt readability across module borders.

> **Wisdom Takeaway:** Push module interfaces toward weak, static coupling (explicit types and names) and eliminate hidden execution-order assumptions.

</details>

---

## MOD-05 — Strangler Fig Migration (`Senior`)

**Scenario:** A 10-year-old Java monolith handles authentication, catalog, cart, and checkout, generating $50M/year. Leadership demands modernizing Checkout first because promo-code velocity is blocked, without pausing business features or risking downtime.

**Question:** Which migration strategy safely replaces the legacy checkout without a catastrophic rewrite?

- **A.** Freeze all feature work for 9 months, build the entire new system in parallel from scratch, and switch DNS over one weekend.
- **B.** Apply the Strangler Fig pattern: place a routing facade/API gateway in front of the monolith, build the new Checkout module/service incrementally, mirror shadow traffic or dual-check parity on one route at a time, cut traffic over via feature flags, and decommission legacy code slice by slice.
- **C.** Copy-paste the entire Java monolith repo into a second repo and delete non-checkout code gradually.
- **D.** Rewrite the database schema first while both old and new checkout code write randomly to overlapping tables.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Big-bang rewrites fail because the legacy system keeps evolving while the rewrite tries to rediscover 10 years of edge cases. Strangler Fig intercepts routes at an edge facade, migrates narrow vertical slices incrementally with shadow/parity verification and instant rollback, delivering business value early with bounded blast radius.

#### Option & Distractor Analysis

- **A (Distractor — _The Big-Bang Rewrite Trap_):** 9-month feature freezes rarely hold in real businesses, scope balloons, undocumented edge cases emerge at cutover, and rollback after schema divergence is a nightmare.
- **B (Correct — Key Insight):** Incremental slicing behind a routing seam with parity validation turns a binary all-or-nothing gamble into reversible weekly wins.
- **C (Distractor — _Cloning a ball of mud_):** Cloning the entire codebase carries all legacy dependencies and database entanglement forward without establishing a clean boundary or traffic cutover seam.
- **D (Distractor — _Uncontrolled dual-writes on live tables_):** Two codebases mutating overlapping legacy tables with different invariants corrupts financial state and makes rollback impossible.

> **Wisdom Takeaway:** Never bet the business on a big-bang cutover—strangle legacy systems one vertical slice at a time with instant rollback.

</details>

---

## MOD-06 — Vertical Slice Architecture vs Technical Layers (`Intermediate`)

**Scenario:** In a large backend repository organized strictly into `controllers/`, `services/`, `mappers/`, `validators/`, and `repositories/`, adding a single 'Pause Subscription' endpoint forces developers to edit 7 folders, resolve merge conflicts daily, and wade through 2,000-line `SubscriptionService` files.

**Question:** What structural reorganization improves modularity inside the codebase?

- **A.** Split `controllers/`, `services/`, and `repositories/` into three separate Git repositories.
- **B.** Reorganize by Vertical Slices / Feature Modules (e.g., `subscriptions/pause/`, `subscriptions/upgrade/`) where each slice encapsulates its own handler, validation, domain logic, and persistence query.
- **C.** Merge all methods into one `MainController` to reduce file switching.
- **D.** Move all validation logic into frontend React components so backend folders shrink.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Horizontal technical layers maximize intra-layer grouping of unrelated things while scattering every real business change across 5–7 directories. Vertical Slices align code structure with the axis of change (business use cases), keeping cohesion high, files small, and merge conflicts low.

#### Option & Distractor Analysis

- **A (Distractor — _Siloing technical layers into separate repos_):** Splitting horizontal layers across repos is even worse—now adding one field requires coordinated PRs across three repositories.
- **B (Correct — Key Insight):** Things that change together for the same business capability should live together in one cohesive vertical slice.
- **C (Distractor — _Trading scattered files for a massive God Object_):** Dumping unrelated workflows into one giant controller destroys cohesion and worsens merge conflicts.
- **D (Distractor — _Violating server-side trust boundaries_):** Frontend validation is UX only; skipping backend validation opens security and data-corruption vulnerabilities.

> **Wisdom Takeaway:** Organize folders by business capability and use case, not by technical layer—optimize for how features actually change.

</details>

---

## MOD-07 — Architectural Fitness Functions (`Staff / Principal`)

**Scenario:** Six months ago your team agreed on strict module boundaries inside a Modular Monolith (`billing` cannot import `inventory` internals or query `inventory_*` SQL tables directly). During recent crunch weeks, engineers added quick direct imports and cross-module SQL joins.

**Question:** Why did the modularity erode, and how do high-performing teams keep boundaries intact over years?

- **A.** Hold monthly architecture review meetings where senior engineers manually read every file in the repo.
- **B.** Encode structural rules as automated Architectural Fitness Functions in CI (e.g., ArchUnit/Deptrac/ESLint import boundary checks, SQL table-ownership linters, and cycle detection) that fail the build on violations.
- **C.** Write a longer Confluence page with bolder red warning boxes.
- **D.** Require every engineer to obtain VP approval before adding any `import` statement.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** Architecture rules documented only in wikis always decay under deadline pressure (architectural entropy). Automated Fitness Functions turn boundary rules into fast, objective CI checks—catching illegal cross-module imports, cyclic dependencies, or table leaks before code ever merges.

#### Option & Distractor Analysis

- **A (Distractor — _Unscalable manual gatekeeping_):** Manual audits happen too late, create resentment, and miss subtle transitive imports.
- **B (Correct — Key Insight):** If an architectural boundary isn't enforced automatically in CI, it is only a suggestion.
- **C (Distractor — _Documentation as enforcement_):** New hires and rushed engineers rarely re-read static Confluence diagrams during an incident hotfix.
- **D (Distractor — _Bureaucratic friction instead of automated feedback_):** Human approval queues kill velocity without giving instant local IDE/CI feedback.

> **Wisdom Takeaway:** Good intentions don't preserve modular boundaries—automated CI fitness functions do.

</details>

---

## MOD-08 — Conway's Law & Inverse Conway Maneuver (`Senior`)

**Scenario:** Your company has 4 functional teams: UI Team, Backend API Team, Database Team, and QA Team. Yet leadership wants an architecture of 6 autonomous domain microservices so features ship independently. Instead, every tiny feature requires a 4-team Jira handoff chain taking 3 weeks.

**Question:** What explains this friction, and what organizational/architectural fix addresses the root cause?

- **A.** Conway's Law: horizontal team silos naturally produce horizontally coupled layers, not autonomous domain modules. Apply the Inverse Conway Maneuver by reorganizing into cross-functional stream-aligned teams owning vertical domain contexts end-to-end.
- **B.** Add a Scrum Master to each of the 4 horizontal teams to speed up Jira handoffs.
- **C.** Force the 4 teams to share a single Slack channel so communication is faster.
- **D.** Switch from microservices to serverless functions while keeping the exact same 4 siloed teams.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **A**

**Explanation:** Conway's Law guarantees your software architecture mirrors your org chart's communication paths. Siloed UI/API/DB/QA teams cannot cleanly own autonomous domain verticals because every change crosses 4 organizational boundaries. Stream-aligned cross-functional teams align human ownership with modular domain boundaries.

#### Option & Distractor Analysis

- **A (Correct — Key Insight):** You cannot sustain modular domain architecture on top of horizontal functional team silos; align teams with bounded contexts.
- **B (Distractor — _Optimizing handoff paperwork instead of removing handoffs_):** Faster Jira grooming does not eliminate wait queues, competing team backlogs, and fragmented domain knowledge.
- **C (Distractor — _Confusing chat volume with structural alignment_):** One noisy Slack channel still preserves 4 separate backlogs and priority conflicts.
- **D (Distractor — _Changing compute runtime without changing ownership_):** Serverless functions built by siloed UI/API/DB teams simply reproduce the same cross-team handoff bottlenecks.

> **Wisdom Takeaway:** Architecture and org design are two halves of one system—if your teams are sliced horizontally, your system will fight vertical modularity.

</details>

---

## MOD-09 — Premature Abstraction & Rule of Three (`Intermediate`)

**Scenario:** On Week 1 of a greenfield project, an engineer creates `AbstractGenericRepositoryFactory<T, ID>`, `IBaseCrudService<T>`, and 5 layers of pass-through interfaces for a single `User` entity with 2 endpoints. Changing one column now touches 9 files.

**Question:** What modularity mistake is being made and how should the engineer refactor?

- **A.** Keep the interfaces because having 100% interface coverage is mandatory for enterprise quality.
- **B.** Speculative generality / premature abstraction creates indirection without real variation. Collapse pass-through layers into concrete, readable module code and extract abstractions only when genuinely distinct implementations or domain boundaries emerge (Rule of Three).
- **C.** Add a code generator to auto-create the 9 files for every new entity.
- **D.** Move the abstract classes into a separate Git repository so the main repo looks cleaner.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** True modularity reduces cognitive load and change cost; cargo-cult interfaces that mirror a single implementation 1:1 double the files touched per change with zero decoupling benefit. Keep interfaces for real architectural seams (external I/O ports, module public facades, genuine strategy variants) and drop speculative wrappers.

#### Option & Distractor Analysis

- **A (Distractor — _Confusing interface count with architectural quality_):** 1:1 mirror interfaces (`UserService` + `IUserService` with one implementation and direct ORM leakage) add boilerplate without isolating volatility.
- **B (Correct — Key Insight):** Every abstraction carries maintenance weight; earn abstractions through real variation or boundary isolation, not speculation.
- **C (Distractor — _Automating unnecessary complexity_):** Generating 9 boilerplate files per entity still leaves humans reading and debugging 9 files for trivial changes.
- **D (Distractor — _Hiding bloat in another repository_):** Moving speculative base classes to another repo makes debugging and evolving them even more painful.

> **Wisdom Takeaway:** Duplication is cheap; the wrong abstraction is expensive. Abstract at real boundaries and real points of variation.

</details>

---

## MOD-10 — Plugin / SPI Architecture & Sandboxing (`Staff / Principal`)

**Scenario:** Your SaaS workflow platform lets enterprise customers run custom validation and enrichment rules. Initially you added `if (tenant == 'acme')` branches inside core code, causing regressions for all customers whenever one tenant requested a tweak.

**Question:** How should you modularize tenant-specific extensions without destabilizing the core platform?

- **A.** Give each enterprise customer their own forked Git branch of the entire SaaS repository.
- **B.** Define a stable, versioned Extension/SPI (Service Provider Interface) contract with strict input/output DTOs, resource limits/timeouts, and isolate tenant plugins out-of-process or in sandboxed runtimes (e.g., WASM/webhooks/isolated workers) decoupled from core release cycles.
- **C.** Let customers upload arbitrary SQL queries to run directly on your primary database.
- **D.** Keep `if (tenant == ...)` branches inside core code, just require 2 reviewers per PR.

<details>
<summary>Show Answer, Explanation & Distractor Analysis</summary>

**Correct Answer:** **B**

**Explanation:** A Plugin/SPI architecture follows the Open-Closed Principle at system scale: the core platform stays closed to per-tenant hacks while open to extensions through a narrow, versioned contract. Sandboxing (WASM, isolated worker containers, or signed webhooks with strict timeouts) ensures a buggy tenant plugin cannot crash or hog resources for other tenants.

#### Option & Distractor Analysis

- **A (Distractor — _Fork-and-forget maintenance suicide_):** Maintaining N separate forks of your core platform makes security patches and product upgrades quadratically expensive.
- **B (Correct — Key Insight):** Versioned SPI contracts + execution isolation turn bespoke tenant chaos into safe, composable extensibility.
- **C (Distractor — _Catastrophic security and performance hole_):** Unbounded tenant SQL exposes cross-tenant data risks and lets one bad query lock or OOM the shared primary DB.
- **D (Distractor — _Process review cannot fix structural coupling_):** Core releases stay blocked by tenant rules, and every new tenant grows conditional spaghetti inside shared business paths.

> **Wisdom Takeaway:** When core logic accumulates `if (customer == X)` branches, extract a stable Extension SPI and isolate custom behavior outside the core blast radius.

</details>

---
