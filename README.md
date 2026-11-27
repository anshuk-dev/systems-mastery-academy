# Systems Mastery Academy: Knowledge & Wisdom in Architecture

**Live Interactive Course & Distractor Analysis Lab:**
[https://anshuk-dev.github.io/systems-mastery-academy/](https://anshuk-dev.github.io/systems-mastery-academy/)

> A Staff / Principal Engineer-level curriculum and scenario-based assessment bank built to develop both **Knowledge** (first-principles laws, patterns, and mechanisms) and **Wisdom** (architectural judgment, trade-offs, failure modes, and spotting plausible traps) across **System Integration**, **Modular Architecture**, **System Optimization**, and **System Scalability**.

---

## Live Web App Features

Open **[https://anshuk-dev.github.io/systems-mastery-academy/](https://anshuk-dev.github.io/systems-mastery-academy/)** for:

- **Course Modules (5 Pillars, 13 Deep Lessons):** Side-by-side **Knowledge vs. Wisdom** breakdowns, architectural trade-off matrices, anti-pattern warnings, and Principal Engineer rules of thumb with `localStorage` completion tracking.
- **Q&A + Distractor Analysis Lab (50 Production Scenarios, 150 Distractor Analyses):**
  - Filter by Pillar, Difficulty (`Intermediate`, `Senior`, `Staff / Principal`), keyword search, or Missed/Bookmarked review.
  - **Practice Mode:** Instant answer verification with deep explanation AND option-by-option **Distractor Analysis** explaining the exact misconception/trap behind every wrong option (`A`, `B`, `C`, `D`).
  - **Exam Mode:** Batch diagnostic scorecard broken down by pillar with full post-exam distractor review.
- **Systems Physics Calculators:** Live interactive calculators for **Little's Law (`L = λ · W`)**, **Tail Latency Amplification (`1 - p^N`)**, and **Gunther's Universal Scalability Law (`C(N)`)**.

---

## Curriculum & GitHub Markdown Index

Every module and Q&A bank is also readable directly in GitHub Markdown:

| # | Pillar | Core Curriculum | Scenario Q&A + Distractor Analysis |
|---|---|---|---|
| **01** | **System Integration** | [01-integration.md](curriculum/01-integration.md) | [01-integration-qa.md](assessments/01-integration-qa.md) (10 Qs) |
| **02** | **Modular Architecture** | [02-modularity.md](curriculum/02-modularity.md) | [02-modularity-qa.md](assessments/02-modularity-qa.md) (10 Qs) |
| **03** | **System Optimization** | [03-optimization.md](curriculum/03-optimization.md) | [03-optimization-qa.md](assessments/03-optimization-qa.md) (10 Qs) |
| **04** | **System Scalability** | [04-scalability.md](curriculum/04-scalability.md) | [04-scalability-qa.md](assessments/04-scalability-qa.md) (10 Qs) |
| **05** | **Integrated Systems Capstone** | [05-capstone.md](curriculum/05-capstone.md) | [05-capstone-qa.md](assessments/05-capstone-qa.md) (10 Qs) |

---

## Pillar Breakdown

### 01. System Integration
- **Lesson 1.1:** Integration Styles & Coupling Axes (Temporal, Spatial, Semantic, Operational)
- **Lesson 1.2:** Reliability Across Unreliable Networks (Idempotency, Dual-Write, Transactional Outbox + CDC, Sagas, DLQs)
- **Lesson 1.3:** Contracts, Evolution & Fault Isolation (Anti-Corruption Layers, Expand-Contract, Circuit Breakers, Bulkheads, Jittered Retries)

### 02. Modular Architecture
- **Lesson 2.1:** Cohesion, Coupling & Connascence (Bounded Contexts, Vertical Slices, Rule of Three)
- **Lesson 2.2:** Hexagonal Boundaries & Modular Monoliths (Ports & Adapters, Avoiding Distributed Monoliths)
- **Lesson 2.3:** Evolutionary Architecture, Conway's Law & Migrations (Strangler Fig, Branch by Abstraction, CI Fitness Functions)

### 03. System Optimization
- **Lesson 3.1:** Performance Physics, Little's Law & Tail Latency (USE/RED Methods, Flamegraphs, Hedged Reads)
- **Lesson 3.2:** Compute, Memory, I/O & Connection Efficiency (PgBouncer Pool Sizing, Event Loop Non-Blocking, Batching)
- **Lesson 3.3:** Database Access & Caching Mastery (Composite/Covering Indexes, Keyset Pagination, Singleflight Stampede & Negative-Cache Penetration Defense)

### 04. System Scalability
- **Lesson 4.1:** Scalability Laws & Bottleneck Modeling (Amdahl's Law, Gunther's Universal Scalability Law `α` & `β`)
- **Lesson 4.2:** Data Partitioning, Replication & Consistency (Skew-Aware Sharding, Consistent Hashing, Read-Your-Writes LSN Pinning, CQRS)
- **Lesson 4.3:** Backpressure, Load Shedding & Geo-Distribution (Token/Leaky Buckets, Priority Shedding, Cellular Home-Region Multi-Region)

### 05. Integrated Systems Capstone
- **Synthesis:** Cross-Pillar Trade-offs, Metastable Failures, RFC Risk Triage & Reversibility Framework

---

## Local Development & Verification

```bash
# Validate JSON schema & regenerate data/course-bundle.js + curriculum/ + assessments/
python3 scripts/build_assets.py

# Serve locally
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
