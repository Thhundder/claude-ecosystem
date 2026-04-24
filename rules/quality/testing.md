# Testing Requirements

## Minimum Coverage: 80%

For new code and touched files, aim for ≥80% test coverage across unit, integration, and E2E tests.

## Test-Driven Development (mandatory cycle)

1. Write test first — it must FAIL (RED).
2. Run the test and confirm it fails for the right reason.
3. Write minimal implementation (GREEN).
4. Run tests — confirm pass.
5. Refactor with tests green (IMPROVE).
6. Verify coverage didn't regress.

Use the **tdd-guide** agent proactively for new features and bug fixes.

When the root cause of a failing test stays elusive, use **silent-failure-hunter** to audit swallowed errors.

## Details on Demand

For AAA pattern, test naming, when-tests-fail playbook, no-fake-databases policy, API mocking, framework defaults, and coverage commands — see the **`tdd-workflow`** skill.
