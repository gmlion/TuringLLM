# Goal

Recommend a TypeScript HTTP framework for a small SaaS API I'm starting. Investigate the major options, weigh them against my constraints, and produce a structured comparison report at `../../workspace/report.md`.

The report must cover at least:

1. **Performance** — request throughput and latency profile under typical SaaS workloads (JSON in, JSON out, mixed read/write).
2. **Ergonomics** — routing, middleware, validation story, TypeScript-native vs. typed wrappers, learning curve.
3. **Ecosystem** — auth, ORM integrations, observability, deployment targets (containers, edge, serverless).
4. **Operational maturity** — release cadence, breaking-change history, real-world adoption, who's running it in production.

The goal is deliberately under-specified: many of the trade-offs collapse to a single answer once you know my team size, latency budget, deployment target, and whether I want to use existing libraries or build everything in-house. The strategy frame should ask me a small number of clarifying questions up-front, but **must not block waiting** for the answers — keep gathering background while I think.

You may use the available web tools (`web_search` / `web_fetch` under non-CC providers, or `WebSearch` / `WebFetch` under Claude Code) to ground your answers in current sources. Cite sources in the final report.
