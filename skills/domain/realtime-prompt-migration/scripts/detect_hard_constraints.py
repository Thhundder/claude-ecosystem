#!/usr/bin/env python3
"""Detect hard constraint words in a prompt.

gpt-realtime-2 follows constraint words literally. Overuse causes
rigid, over-confirming behavior. This script counts each constraint
word, shows where it appears, and flags lines with multiple constraints.

Usage:
    python detect_hard_constraints.py path/to/prompt.md
    python detect_hard_constraints.py path/to/prompt.md --json

Exit codes:
    0 — under threshold
    1 — over threshold (review needed)
    2 — file not readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

# Constraint words to flag. Pattern uses word boundaries.
CONSTRAINTS = {
    "always": r"\balways\b",
    "never": r"\bnever\b",
    "must": r"\bmust\b",
    "only": r"\bonly\b",
    "forbidden": r"\bforbidden\b",
    "required": r"\brequired\b",
    "absolutely": r"\babsolutely\b",
    # French equivalents
    "toujours": r"\btoujours\b",
    "jamais": r"\bjamais\b",
    "doit": r"\bdoit\b",
    "doivent": r"\bdoivent\b",
    "uniquement": r"\buniquement\b",
    "seulement": r"\bseulement\b",
    "interdit": r"\binterdit\b",
    "obligatoire": r"\bobligatoire\b",
}

# Threshold: more constraint usages than this triggers a warning.
# Tunable; based on empirical observation of v2 rigidity.
THRESHOLD = 15


def analyze(prompt_path: Path) -> dict:
    text = prompt_path.read_text(encoding="utf-8")
    if not text.strip():
        return {"error": "empty file"}

    lines = text.split("\n")
    counts = defaultdict(int)
    occurrences = []  # list of {line_no, line_text, words}
    per_line_words = defaultdict(list)

    for line_no, line in enumerate(lines, 1):
        line_lower = line.lower()
        words_on_line = []
        for word, pattern in CONSTRAINTS.items():
            matches = re.findall(pattern, line_lower)
            if matches:
                counts[word] += len(matches)
                words_on_line.extend([word] * len(matches))
        if words_on_line:
            per_line_words[line_no] = words_on_line
            occurrences.append({
                "line": line_no,
                "text": line.strip(),
                "constraints": words_on_line,
            })

    total = sum(counts.values())
    # Lines with 2+ different constraint words = high conflict risk
    multi_constraint_lines = [
        {"line": ln, "text": next(o["text"] for o in occurrences if o["line"] == ln),
         "constraints": set(words)}
        for ln, words in per_line_words.items()
        if len(set(words)) >= 2
    ]

    return {
        "file": str(prompt_path),
        "total_constraints": total,
        "counts_by_word": dict(counts),
        "occurrences": occurrences,
        "multi_constraint_lines": [
            {**ml, "constraints": sorted(ml["constraints"])}
            for ml in multi_constraint_lines
        ],
        "threshold": THRESHOLD,
        "over_threshold": total > THRESHOLD,
    }


def print_human(report: dict) -> None:
    if "error" in report:
        print(f"ERROR: {report['error']}", file=sys.stderr)
        return

    print(f"File: {report['file']}")
    print()
    print(f"Total hard constraints: {report['total_constraints']} "
          f"(threshold: {report['threshold']})")
    print()

    if report["counts_by_word"]:
        print("Counts by word:")
        for word, count in sorted(report["counts_by_word"].items(),
                                  key=lambda x: -x[1]):
            print(f"  {word:20s} {count}")
        print()

    if report["multi_constraint_lines"]:
        print(f"Lines with multiple constraint words "
              f"({len(report['multi_constraint_lines'])}):")
        for ml in report["multi_constraint_lines"]:
            print(f"  L{ml['line']:>4d}: [{', '.join(ml['constraints'])}]")
            print(f"        > {ml['text'][:80]}")
        print()
        print("Multiple constraints on one line often indicate over-emphasis")
        print("or conflicting rules. Audit each.")
        print()

    if report["over_threshold"]:
        print(f"WARNING: {report['total_constraints']} constraints exceeds "
              f"threshold of {report['threshold']}.")
        print("v2 enforces these literally. Audit each occurrence:")
        print("  - Keep if behavior truly must be rigid (safety, payments, etc.)")
        print("  - Scope to specific case (e.g., 'always confirm' -> 'confirm before write actions')")
        print("  - Remove if redundant or emergent from other rules")
    else:
        print("OK: constraint count under threshold.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prompt_path", type=Path)
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    if not args.prompt_path.exists():
        print(f"ERROR: file not found: {args.prompt_path}", file=sys.stderr)
        return 2

    report = analyze(args.prompt_path)
    if "error" in report:
        if args.json:
            print(json.dumps(report))
        else:
            print_human(report)
        return 2

    if args.json:
        # multi_constraint_lines contains sets that aren't JSON-serializable
        # — they're already converted to lists in analyze(). Safe.
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_human(report)

    return 1 if report["over_threshold"] else 0


if __name__ == "__main__":
    sys.exit(main())
