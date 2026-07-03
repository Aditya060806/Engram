### Measured recall routing

Measured over **10** queries against a populated graph on 2026-07-03:

```mermaid
pie showData
    title Measured recall resolution
    "Cognee graph (GRAPH_COMPLETION)" : 10
    "LLM fallback" : 0
```

- Cognee-served: **10/10 (100%)**
- LLM fallback: **0/10 (0%)**

| Query | Provider | Model |
|---|---|---|
| Who is the groom and when is the wedding? | cognee | graph-completion |
| What database do we use now? | cognee | graph-completion |
| What database did we use before? | cognee | graph-completion |
| What changed about our deploy process? | cognee | graph-completion |
| What does Engram use for its memory lifecycle? | cognee | graph-completion |
| Is Stu the groom? | cognee | graph-completion |
| When did we switch database? | cognee | graph-completion |
| Summarize the current architecture decisions. | cognee | graph-completion |
| What is the wedding location? | cognee | graph-completion |
| Which memory operations does Cognee provide? | cognee | graph-completion |
