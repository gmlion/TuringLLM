# Goal

Rewrite the following technical paragraph in plain, non-expert English.

## Source Paragraph

> Prompt caching amortises the cost of fixed-prefix tokens across repeated API invocations by persisting the model's internal attention state for that prefix, so subsequent calls that reuse the same prefix skip re-encoding and pay a reduced rate for the cached portion of the context window.

## Acceptance Criterion

1. The rewrite is five sentences or fewer.
2. The rewrite contains none of these jargon terms verbatim: "amortise", "prefix tokens", "attention state", "re-encoding", "context window".
3. The rewrite preserves the three factual claims of the source: (a) that caching is applied to a fixed initial part of each request, (b) that reusing that part across calls is what unlocks the benefit, and (c) that the benefit is reduced cost for the cached portion.
