# Systems Mastery — Monograph & Distractor Analysis Lab

**Live Website (GitHub Pages):**
[https://anshuk-dev.github.io/systems-mastery-academy/](https://anshuk-dev.github.io/systems-mastery-academy/)

> A source-verified Staff / Principal Systems Engineering curriculum and scenario-based Q&A lab covering **System Integration**, **Modular Architecture**, **System Optimization**, and **System Scalability** — grounded in original papers, engineering postmortems, and architecture canon.

---

## Design & Engineering Foundation

- **UI Design Direction:** Redesigned using the **`frontend-design`** skill from [`anthropics/skills`](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) — adopting an archival *Systems Engineering Monograph* editorial aesthetic (`Newsreader` + `IBM Plex Sans` + `IBM Plex Mono`, warm paper & slate drafting themes, hairline structural grids, zero generic SaaS gradient templates).
- **Web Interface & Accessibility Audit:** Follows [`vercel-labs/agent-skills` (`web-design-guidelines`)](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) — skip links, `:focus-visible` outlines, `prefers-reduced-motion` support, `tabular-nums` telemetry readouts, keyboard shortcuts (`A–D` / `1–4`, `←`/`→`), URL hash deep-linking, and `aria-live` feedback.
- **100% Source-Verified Content:** Every lesson and all 50 scenario Q&As link directly to live-verified primary engineering literature (40 canonical references).

---

## Curriculum & Assessment Index

| # | Pillar | Curriculum Monograph | Q&A + Distractor Analysis |
|---|---|---|---|
| **01** | **System Integration** | [01-integration.md](curriculum/01-integration.md) | [01-integration-qa.md](assessments/01-integration-qa.md) (10 Qs) |
| **02** | **Modular Architecture** | [02-modularity.md](curriculum/02-modularity.md) | [02-modularity-qa.md](assessments/02-modularity-qa.md) (10 Qs) |
| **03** | **System Optimization** | [03-optimization.md](curriculum/03-optimization.md) | [03-optimization-qa.md](assessments/03-optimization-qa.md) (10 Qs) |
| **04** | **System Scalability** | [04-scalability.md](curriculum/04-scalability.md) | [04-scalability-qa.md](assessments/04-scalability-qa.md) (10 Qs) |
| **05** | **Integrated Systems Capstone** | [05-capstone.md](curriculum/05-capstone.md) | [05-capstone-qa.md](assessments/05-capstone-qa.md) (10 Qs) |

---

## Key Primary Sources Cited Across the Course

- **System Integration:** [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/) (Hohpe & Woolf), [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) & [Saga Pattern](https://microservices.io/patterns/data/saga.html) (Chris Richardson), [Stripe Idempotency](https://stripe.com/blog/idempotency) (Brandur Leach), [AWS Builders' Library: Timeouts, retries, and backoff with jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) (Marc Brooker), [Pact Contract Testing](https://docs.pact.io/).
- **Modular Architecture:** [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (Alistair Cockburn), [How Do Committees Invent? (Conway's Law, 1968)](https://www.melconway.com/Home/Conways_Law.html) (Melvin Conway), [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) & [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) (Martin Fowler), [Connascence](https://en.wikipedia.org/wiki/Connascence) (Meilir Page-Jones), [Fitness Function-Driven Development](https://www.thoughtworks.com/insights/articles/fitness-function-driven-development).
- **System Optimization:** [The Tail at Scale](https://research.google/pubs/the-tail-at-scale/) (Dean & Barroso), [Little's Law](https://en.wikipedia.org/wiki/Little%27s_law), [The USE Method](https://www.brendangregg.com/usemethod.html) (Brendan Gregg), [The RED Method](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/) (Tom Wilkie), [HikariCP: About Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing) (Brett Wooldridge), [Use The Index, Luke: No Offset](https://use-the-index-luke.com/no-offset) (Markus Winand), [XFetch Cache Stampede Paper](https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf) (Vattani et al.).
- **System Scalability:** [Universal Scalability Law](https://arxiv.org/abs/0808.1431) (Neil J. Gunther), [Amdahl's Law](https://en.wikipedia.org/wiki/Amdahl%27s_law), [Consistent Hashing and Random Trees](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf) (Karger et al.), [Designing Data-Intensive Applications](https://dataintensive.net/) (Martin Kleppmann), [AWS Builders' Library: Using load shedding to avoid overload](https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload) (David Yanacek), [Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters) (Stripe), [Metastable Failures in Distributed Systems](https://charap.co/metastable-failures-in-distributed-systems/) (Bronson et al.).

---

## Local Verification

```bash
python3 scripts/build_assets.py
python3 -m http.server 8080
```
