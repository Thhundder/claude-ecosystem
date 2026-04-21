# Testing Requirements

## Minimum Coverage: 80%

For new code and touched files, aim for ≥80% test coverage across three test types:

1. **Unit tests** — individual functions, pure utilities, components in isolation.
2. **Integration tests** — API endpoints, DB operations, MCP tool calls, LLM client wrappers.
3. **E2E tests** — critical user flows end-to-end via the real stack (or a close fake).

## Test-Driven Development (mandatory cycle)

1. Write test first — it must FAIL (RED).
2. Run the test and confirm it fails for the right reason.
3. Write minimal implementation (GREEN).
4. Run tests — confirm pass.
5. Refactor with tests green (IMPROVE).
6. Verify coverage didn't regress.

Use the **tdd-guide** agent proactively for new features and bug fixes.

## Test Structure — AAA Pattern

```
test('<behavior description>', () => {
  // Arrange — set up inputs and dependencies
  const input = ...

  // Act — invoke the unit under test
  const result = subject(input)

  // Assert — check expected outcome
  expect(result).toBe(expected)
})
```

## Test Naming

Descriptive names that explain the behavior under test, not the implementation.

```
✓ 'returns empty array when no markets match query'
✓ 'throws error when API key is missing'
✓ 'falls back to substring search when Redis is unavailable'

✗ 'test1'
✗ 'test search'
```

## When Tests Fail

1. Check test isolation first — flaky tests usually indicate shared state.
2. Verify mocks are accurate. **If your mock drifts from the real API, fix the test, not production.**
3. Fix the implementation, not the test — unless the test is genuinely wrong.
4. Use **tdd-guide** or **silent-failure-hunter** agents when you can't find the root cause.

## Integration Testing — No Fake Databases

For DB-touching tests, hit a real database (Docker testcontainers, local instance, or a dedicated test DB). Mocks hide schema and migration issues.

## External API Mocking

- Mock at the HTTP layer, not at the SDK layer. SDK mocks drift.
- Record real responses once (`nock`, `vcr`, or equivalent), replay in tests.
- Have one real smoke test that hits the live API on a schedule (daily).

## Framework Defaults

- **JavaScript/TypeScript**: `bun test`, `vitest`, or `jest`. Default to `bun test` when the project uses Bun.
- **Python**: `pytest` with `pytest-asyncio` for async code, `pytest-cov` for coverage.
- **E2E web**: Playwright (`webapp-testing` skill).

## Coverage Command Examples

```
# Python
pytest --cov=src --cov-report=term-missing

# Node/Bun
bun test --coverage
```
