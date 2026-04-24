---
name: rag-best-practices
description: "Use when building, debugging, or reviewing RAG (Retrieval-Augmented Generation) pipelines — separating ingestion/retrieval/generation, chunking, embeddings, hybrid search, reranking, evals. TRIGGER: 'RAG', 'retrieval', 'vector search', 'embedding', 'chunk', ChromaDB/Pinecone/Weaviate/pgvector, LangChain retrievers, semantic search, RAG eval, answer grounding. SKIP: simple keyword search, static docs lookup (use documentation-lookup), non-AI projects, library docs (use Context7)."
origin: ECC
---

# RAG Best Practices

Principles for retrieval-augmented generation that apply regardless of the vector DB (ChromaDB, Pinecone, Weaviate, pgvector, Qdrant) or orchestration framework (LangChain, LlamaIndex, Haystack, or none).

## Separate the Three Jobs

RAG is always three distinct pipelines that people wrongly merge into one:

1. **Ingestion** — read source, chunk, embed, write to vector store. Runs offline or on-demand when sources change.
2. **Retrieval** — at query time: embed the query, search the store, rerank, filter.
3. **Generation** — hand the retrieved context to the LLM with a prompt that tells it what to do with the context.

Bugs compound when these jobs share code. Keep them in separate modules with clear boundaries.

## Chunking Is the Hidden 80%

Most "RAG quality" problems are actually chunking problems.

- **Chunk by semantic unit, not by character count.** Paragraphs, sections, headers — not "500 chars at a time."
- **Preserve document hierarchy** (page, section, subsection) as metadata so the retriever can filter by structure.
- **Include overlap between chunks** (~15–20%) to avoid losing context at boundaries.
- **Embed the chunk + a short parent summary** together for better retrieval on ambiguous queries.
- **Store the original raw text** alongside the embedding. You'll need it to debug.

## Embeddings

- Use `text-embedding-3-small` for cost, `text-embedding-3-large` only when quality matters more than 5× cost.
- **Batch embedding requests** — the single-request overhead dominates otherwise.
- **Cache embeddings by content hash.** Re-embedding identical content is waste.
- **Normalize vectors** if your DB uses cosine similarity (some do it automatically, some don't — check).
- **Dimension matters** — `text-embedding-3-*` supports truncation via the `dimensions` parameter. Lower dimensions = cheaper storage and faster search, at a quality cost.

## Retrieval

- **Top-k by similarity is the naive baseline.** Use it as a starting point, not a destination.
- **Hybrid search**: combine vector similarity with BM25/lexical search. Pure vector misses exact keyword matches; pure lexical misses semantic paraphrases.
- **Metadata filtering first, then vector search.** If the query is scoped (e.g., "for user X"), filter by metadata before scoring — much faster and more accurate.
- **Rerank the top results** with a cross-encoder or a cheap LLM call. The top-10 from vector search is rarely optimally ordered.
- **Iterate the retrieval** — when one-shot retrieval is insufficient, loop through dispatch → evaluate → refine up to 3 cycles (cap to avoid runaway cost).

## Generation Prompt

- **Be explicit about what to do with the context.** "Answer from the context below. If the context doesn't contain the answer, say so — don't invent."
- **Cite sources** in the response by including `[doc:id]` markers and rendering them as links client-side.
- **Cap retrieved context size** — more context past a point hurts answer quality (lost-in-the-middle). 4–8 well-chosen chunks beats 20 noisy ones.
- **Return a refusal path.** If no context passes a relevance threshold, return "I don't know" rather than hallucinating.

## Evaluation

RAG needs dedicated evals, not just chat vibes.

- **Build a golden dataset** of Q + expected-answer pairs (or Q + expected-doc-ids). 30 is enough to start.
- **Measure retrieval separately from generation.** Retrieval recall@k, MRR. Generation: answer relevance, faithfulness to sources, hallucination rate.
- **Use a trace tool** (LangSmith, Langfuse, Helicone, or home-grown) for regression tracking. Tag production queries that got thumbs-down — they become new golden set entries.
- Use the `eval-harness` skill for structured evaluation workflows.

## Security & Safety

- **Sanitize retrieved content before embedding it in the prompt.** A poisoned document can contain prompt-injection payloads that hijack the agent.
- **Authorization must happen at query time**, not at generation time. Filter by user-accessible docs in the retrieval query, don't rely on the LLM to respect ACLs.
- **Log queries and retrieved doc ids** (not full content) for audit. PII in queries should be redacted before storage.
- **Rate limit embedding calls** per user — cheap per-call but abusable.

## Relevant Skills

- `documentation-lookup` — lookup via Context7 (for library docs, not your own content)
- `deep-research` — multi-source research (different problem, but related patterns)
- `cost-aware-llm-pipeline` — cost patterns for RAG pipelines
- `eval-harness` — eval framework
