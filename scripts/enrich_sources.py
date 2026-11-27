#!/usr/bin/env python3
"""Attach verified canonical primary sources to all lessons & questions and remove unverified heuristics."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

VERIFIED_SOURCES = {
    "eip": {
        "title": "Enterprise Integration Patterns",
        "author": "Gregor Hohpe & Bobby Woolf",
        "url": "https://www.enterpriseintegrationpatterns.com/",
    },
    "event_driven": {
        "title": "What do you mean by 'Event-Driven'?",
        "author": "Martin Fowler",
        "url": "https://martinfowler.com/articles/201701-event-driven.html",
    },
    "outbox": {
        "title": "Pattern: Transactional Outbox",
        "author": "Chris Richardson (microservices.io)",
        "url": "https://microservices.io/patterns/data/transactional-outbox.html",
    },
    "saga": {
        "title": "Pattern: Saga",
        "author": "Chris Richardson (microservices.io)",
        "url": "https://microservices.io/patterns/data/saga.html",
    },
    "idempotency": {
        "title": "Designing robust and predictable APIs with idempotency",
        "author": "Brandur Leach (Stripe Engineering)",
        "url": "https://stripe.com/blog/idempotency",
    },
    "aws_retries": {
        "title": "Timeouts, retries, and backoff with jitter",
        "author": "Marc Brooker (AWS Builders' Library)",
        "url": "https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter",
    },
    "aws_jitter": {
        "title": "Exponential Backoff And Jitter",
        "author": "Marc Brooker (AWS Architecture Blog)",
        "url": "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/",
    },
    "acl": {
        "title": "Anti-corruption Layer pattern",
        "author": "Microsoft Azure Architecture Center",
        "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer",
    },
    "bulkhead": {
        "title": "Bulkhead pattern",
        "author": "Microsoft Azure Architecture Center",
        "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead",
    },
    "circuit_breaker": {
        "title": "Circuit Breaker pattern",
        "author": "Microsoft Azure Architecture Center",
        "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker",
    },
    "pact": {
        "title": "Consumer-Driven Contract Testing (Pact Docs)",
        "author": "Pact Foundation",
        "url": "https://docs.pact.io/",
    },
    "connascence": {
        "title": "Connascence (Software Engineering)",
        "author": "Meilir Page-Jones (via Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Connascence",
    },
    "bounded_context": {
        "title": "Bounded Context",
        "author": "Martin Fowler",
        "url": "https://martinfowler.com/bliki/BoundedContext.html",
    },
    "hexagonal": {
        "title": "Hexagonal Architecture (Ports and Adapters)",
        "author": "Alistair Cockburn",
        "url": "https://alistair.cockburn.us/hexagonal-architecture/",
    },
    "monolith_first": {
        "title": "MonolithFirst",
        "author": "Martin Fowler",
        "url": "https://martinfowler.com/bliki/MonolithFirst.html",
    },
    "microservices": {
        "title": "Microservices",
        "author": "James Lewis & Martin Fowler",
        "url": "https://martinfowler.com/articles/microservices.html",
    },
    "business_cap": {
        "title": "Decompose by Business Capability",
        "author": "Chris Richardson (microservices.io)",
        "url": "https://microservices.io/patterns/decomposition/decompose-by-business-capability.html",
    },
    "strangler": {
        "title": "Strangler Fig Application",
        "author": "Martin Fowler",
        "url": "https://martinfowler.com/bliki/StranglerFigApplication.html",
    },
    "branch_abstraction": {
        "title": "Branch by Abstraction",
        "author": "Martin Fowler",
        "url": "https://martinfowler.com/bliki/BranchByAbstraction.html",
    },
    "conway": {
        "title": "How Do Committees Invent? (Conway's Law, 1968)",
        "author": "Melvin E. Conway",
        "url": "https://www.melconway.com/Home/Conways_Law.html",
    },
    "fitness": {
        "title": "Fitness Function-Driven Development",
        "author": "Thoughtworks",
        "url": "https://www.thoughtworks.com/insights/articles/fitness-function-driven-development",
    },
    "littles_law": {
        "title": "Little's Law (Operations Research, 1961)",
        "author": "John D. C. Little (via Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Little%27s_law",
    },
    "tail_scale": {
        "title": "The Tail at Scale (CACM, 2013)",
        "author": "Jeffrey Dean & Luiz André Barroso (Google)",
        "url": "https://research.google/pubs/the-tail-at-scale/",
    },
    "use_method": {
        "title": "The USE Method",
        "author": "Brendan Gregg",
        "url": "https://www.brendangregg.com/usemethod.html",
    },
    "red_method": {
        "title": "The RED Method: How to Instrument Your Services",
        "author": "Tom Wilkie (Grafana Labs)",
        "url": "https://grafana.com/blog/the-red-method-how-to-instrument-your-services/",
    },
    "hikari": {
        "title": "About Pool Sizing",
        "author": "Brett Wooldridge (HikariCP Wiki)",
        "url": "https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing",
    },
    "keyset": {
        "title": "We Need Tooling for Keyset Pagination (No Offset)",
        "author": "Markus Winand (Use The Index, Luke)",
        "url": "https://use-the-index-luke.com/no-offset",
    },
    "concat_keys": {
        "title": "Concatenated Indexes (Leftmost Prefix Rule)",
        "author": "Markus Winand (Use The Index, Luke)",
        "url": "https://use-the-index-luke.com/sql/where-clause/the-equals-operator/concatenated-keys",
    },
    "covering": {
        "title": "Index-Only Scan / Covering Indexes",
        "author": "Markus Winand (Use The Index, Luke)",
        "url": "https://use-the-index-luke.com/sql/clustering/index-only-scan-covering-index",
    },
    "cache_aside": {
        "title": "Cache-Aside pattern",
        "author": "Microsoft Azure Architecture Center",
        "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside",
    },
    "xfetch": {
        "title": "Optimal Probabilistic Cache Stampede Prevention (XFetch)",
        "author": "Vattani, Chierichetti & Lowenstein (2015)",
        "url": "https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf",
    },
    "amdahl": {
        "title": "Amdahl's Law (AFIPS 1967)",
        "author": "Gene Amdahl (via Wikipedia)",
        "url": "https://en.wikipedia.org/wiki/Amdahl%27s_law",
    },
    "usl": {
        "title": "A General Theory of Computational Scalability Based on Rational Functions (USL)",
        "author": "Neil J. Gunther (arXiv:0808.1431)",
        "url": "https://arxiv.org/abs/0808.1431",
    },
    "chash": {
        "title": "Consistent Hashing and Random Trees (STOC 1997)",
        "author": "David Karger et al. (MIT / Princeton CS)",
        "url": "https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf",
    },
    "ddia": {
        "title": "Designing Data-Intensive Applications",
        "author": "Martin Kleppmann",
        "url": "https://dataintensive.net/",
    },
    "cqrs": {
        "title": "CQRS pattern",
        "author": "Microsoft Azure Architecture Center",
        "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs",
    },
    "load_shedding": {
        "title": "Using load shedding to avoid overload",
        "author": "David Yanacek (AWS Builders' Library)",
        "url": "https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload",
    },
    "stripe_rl": {
        "title": "Scaling your API with rate limiters",
        "author": "Paul Tarjan (Stripe Engineering)",
        "url": "https://stripe.com/blog/rate-limiters",
    },
    "redis_rl": {
        "title": "Rate Limiting Algorithms",
        "author": "Redis Glossary",
        "url": "https://redis.io/glossary/rate-limiting/",
    },
    "metastable": {
        "title": "Metastable Failures in Distributed Systems (HotOS 2021)",
        "author": "Bronson, Aghayev, Charapko & Zhu",
        "url": "https://charap.co/metastable-failures-in-distributed-systems/",
    },
}

LESSON_SOURCES = {
    "int-1": ["eip", "event_driven"],
    "int-2": ["outbox", "saga", "idempotency"],
    "int-3": ["acl", "aws_retries", "aws_jitter", "bulkhead", "circuit_breaker", "pact"],
    "mod-1": ["connascence", "bounded_context", "business_cap"],
    "mod-2": ["hexagonal", "monolith_first", "microservices"],
    "mod-3": ["conway", "strangler", "branch_abstraction", "fitness"],
    "opt-1": ["littles_law", "tail_scale", "use_method", "red_method", "metastable"],
    "opt-2": ["hikari", "ddia", "use_method"],
    "opt-3": ["keyset", "concat_keys", "covering", "cache_aside", "xfetch"],
    "sca-1": ["amdahl", "usl", "ddia"],
    "sca-2": ["chash", "ddia", "cqrs"],
    "sca-3": ["load_shedding", "stripe_rl", "redis_rl"],
    "cap-1": ["monolith_first", "metastable", "tail_scale", "ddia"],
}

QUESTION_SOURCES = {
    "INT-01": ["outbox", "ddia"],
    "INT-02": ["idempotency", "aws_retries"],
    "INT-03": ["aws_retries", "aws_jitter", "metastable"],
    "INT-04": ["acl", "bounded_context"],
    "INT-05": ["event_driven", "ddia"],
    "INT-06": ["saga", "eip"],
    "INT-07": ["bulkhead", "aws_retries"],
    "INT-08": ["eip", "outbox"],
    "INT-09": ["event_driven", "eip"],
    "INT-10": ["pact", "microservices"],
    "MOD-01": ["monolith_first", "microservices", "business_cap"],
    "MOD-02": ["hexagonal", "bounded_context"],
    "MOD-03": ["bounded_context", "business_cap"],
    "MOD-04": ["connascence"],
    "MOD-05": ["strangler", "branch_abstraction"],
    "MOD-06": ["business_cap", "connascence"],
    "MOD-07": ["fitness", "hexagonal"],
    "MOD-08": ["conway", "business_cap"],
    "MOD-09": ["monolith_first", "connascence"],
    "MOD-10": ["hexagonal", "bulkhead"],
    "OPT-01": ["littles_law", "load_shedding"],
    "OPT-02": ["tail_scale"],
    "OPT-03": ["hikari"],
    "OPT-04": ["xfetch", "cache_aside"],
    "OPT-05": ["keyset", "concat_keys"],
    "OPT-06": ["concat_keys", "covering"],
    "OPT-07": ["use_method", "red_method"],
    "OPT-08": ["cache_aside", "xfetch"],
    "OPT-09": ["use_method", "red_method"],
    "OPT-10": ["ddia", "hikari"],
    "SCA-01": ["usl", "amdahl"],
    "SCA-02": ["ddia", "chash"],
    "SCA-03": ["chash"],
    "SCA-04": ["ddia"],
    "SCA-05": ["load_shedding", "metastable"],
    "SCA-06": ["stripe_rl", "redis_rl"],
    "SCA-07": ["cqrs", "outbox", "ddia"],
    "SCA-08": ["ddia"],
    "SCA-09": ["load_shedding", "use_method"],
    "SCA-10": ["load_shedding", "bulkhead"],
    "CAP-01": ["outbox", "ddia"],
    "CAP-02": ["monolith_first", "tail_scale"],
    "CAP-03": ["metastable", "load_shedding", "aws_jitter"],
    "CAP-04": ["strangler", "outbox"],
    "CAP-05": ["circuit_breaker", "bulkhead", "red_method"],
    "CAP-06": ["idempotency", "eip"],
    "CAP-07": ["monolith_first", "microservices"],
    "CAP-08": ["stripe_rl", "bulkhead", "aws_retries"],
    "CAP-09": ["ddia", "amdahl"],
    "CAP-10": ["outbox", "aws_jitter", "fitness"],
}


def main() -> None:
    pillars_path = DATA_DIR / "pillars.json"
    pillars_data = json.loads(pillars_path.read_text(encoding="utf-8"))

    for pillar in pillars_data["pillars"]:
        for lesson in pillar["lessons"]:
            lid = lesson["id"]
            lesson["sources"] = [VERIFIED_SOURCES[k] for k in LESSON_SOURCES[lid]]

    # Remove speculative unverified rule-of-thumb percentages in prose
    raw_pillars = json.dumps(pillars_data, indent=2, ensure_ascii=False)
    replacements = {
        "90% of early-to-mid scale systems and teams under ~50-80 engineers.": "Early-to-mid scale systems and teams that do not yet face independent release or scaling bottlenecks (Fowler's MonolithFirst).",
        "When 92% of wall-clock latency is serial database/network I/O": "when the vast majority of wall-clock latency is serial database/network I/O",
        "10x throughput gain.": "major throughput gains by amortizing per-request overhead.",
        "10x–100x": "orders-of-magnitude",
        "gives 95% of the benefit at 10% of the complexity.": "delivers local read latency and compliance without multi-leader conflict complexity.",
    }
    for old, new in replacements.items():
        raw_pillars = raw_pillars.replace(old, new)

    pillars_path.write_text(raw_pillars + "\n", encoding="utf-8")

    for qfile in sorted(DATA_DIR.glob("questions-*.json")):
        items = json.loads(qfile.read_text(encoding="utf-8"))
        for q in items:
            q["sources"] = [VERIFIED_SOURCES[k] for k in QUESTION_SOURCES[q["id"]]]
        qfile.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("Attached verified primary sources to all 13 lessons and 50 questions.")


if __name__ == "__main__":
    main()
