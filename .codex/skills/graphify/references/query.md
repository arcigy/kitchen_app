# Graphify query, path, and explain

Use this reference only for questions against an existing graph.

## Hard rules

- Use the `graphify` CLI only. Never manually load, parse, print, attach, or scan the full `graphify-out/graph.json` or `graphify-out/GRAPH_REPORT.md`.
- Start every codebase question with a narrow query capped at 1,200 tokens.
- Only read source files explicitly surfaced by a query, explain, or path result. If the CLI fails, repair it or report the limitation; do not use an inline JSON or NetworkX fallback.

## Query

```bash
graphify query "QUESTION" --budget 1200
```

Use `--context RELATION` whenever the question names a known relation such as `imports_from` or `calls`; this is preferred over a broad traversal. Use `--dfs --budget 1200` only when tracing a specific chain. If the result is stale, run `graphify update .` and repeat the same narrow query.

## Path

```bash
graphify path "NODE_A" "NODE_B"
```

Use exact node names shown by a preceding query or explain result.

## Explain

```bash
graphify explain "NODE_NAME"
```

Use this for a focused symbol or file. Read only the exact source paths returned by the CLI when line-level verification is necessary.
