#!/usr/bin/env python3
"""Validate the structure of a migrated gpt-realtime-2 prompt.

Checks which canonical sections are present and reports missing
recommended sections based on detected use case hints.

Usage:
    python validate_structure.py path/to/prompt.md
    python validate_structure.py path/to/prompt.md --json

Exit codes:
    0 — all critical sections present
    1 — missing critical sections
    2 — file not readable or empty
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CANONICAL_SECTIONS = [
    "Role and Objective",
    "Personality and Tone",
    "Language",
    "Reasoning",
    "Preambles",
    "Message Channels",
    "Verbosity",
    "Tools",
    "Unclear Audio",
    "Entity Capture",
    "Long Context Behavior",
    "Escalation",
]

# Sections that are always recommended
ALWAYS_RECOMMENDED = {"Role and Objective", "Unclear Audio"}

# Hint patterns that signal a section is needed
HINTS = {
    "Preambles": [
        r"\btool[_\s]*call",
        r"\bcheck_",
        r"\blook[_\s]*up",
        r"\bfetch",
        r"\bcreate_",
        r"\bcancel_",
        r"\bschedule_",
    ],
    "Entity Capture": [
        r"\border[_\s]*id",
        r"\bphone[_\s]*number",
        r"\bemail",
        r"\bconfirmation[_\s]*code",
        r"\baccount[_\s]*number",
        r"\breservation[_\s]*id",
        r"\btracking[_\s]*number",
    ],
    "Tools": [
        r"\btool[_\s]*call",
        r"\bfunction[_\s]*call",
        r"\bcall.{0,20}tool",
    ],
    "Language": [
        r"\bfrench\b|\bfrancais\b|\bfrançais\b",
        r"\benglish\b|\banglais\b",
        r"\bspanish\b|\bespagnol\b",
        r"\bmultilingual\b",
        r"\blanguage\b",
    ],
}


def find_sections(text: str) -> list[str]:
    """Return canonical section names found in the prompt."""
    found = []
    for section in CANONICAL_SECTIONS:
        # match "# Section Name" or "## Section Name" at line start
        pattern = rf"^#{{1,3}}\s+{re.escape(section)}\s*$"
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            found.append(section)
    return found


def detect_use_case_hints(text: str) -> dict[str, list[str]]:
    """Return sections that are recommended based on text content."""
    text_lower = text.lower()
    recommended = {}
    for section, patterns in HINTS.items():
        matches = []
        for pattern in patterns:
            if re.search(pattern, text_lower):
                matches.append(pattern)
        if matches:
            recommended[section] = matches
    return recommended


def analyze(prompt_path: Path) -> dict:
    text = prompt_path.read_text(encoding="utf-8")
    if not text.strip():
        return {"error": "empty file"}

    found = find_sections(text)
    hints = detect_use_case_hints(text)

    # Sections that are recommended but missing
    recommended_set = set(ALWAYS_RECOMMENDED) | set(hints.keys())
    missing_recommended = sorted(recommended_set - set(found))

    # Critical missing = recommended AND has strong hints
    critical_missing = []
    for section in missing_recommended:
        if section in ALWAYS_RECOMMENDED:
            critical_missing.append(section)
        elif section in hints and len(hints[section]) >= 2:
            critical_missing.append(section)

    return {
        "file": str(prompt_path),
        "found_sections": found,
        "found_count": len(found),
        "use_case_hints": hints,
        "missing_recommended": missing_recommended,
        "critical_missing": critical_missing,
        "all_canonical": CANONICAL_SECTIONS,
    }


def print_human(report: dict) -> None:
    if "error" in report:
        print(f"ERROR: {report['error']}", file=sys.stderr)
        return

    print(f"File: {report['file']}")
    print()
    print(f"Sections found ({report['found_count']}/{len(report['all_canonical'])}):")
    for section in report["found_sections"]:
        print(f"  [x] # {section}")
    print()

    not_found = set(report["all_canonical"]) - set(report["found_sections"])
    if not_found:
        print("Sections not found:")
        for section in sorted(not_found):
            marker = " [!]" if section in report["critical_missing"] else ""
            print(f"  [ ] # {section}{marker}")
        print()

    if report["use_case_hints"]:
        print("Use case hints detected:")
        for section, patterns in report["use_case_hints"].items():
            present = section in report["found_sections"]
            tag = "ok" if present else "MISSING"
            print(f"  {section}: {len(patterns)} hint(s) -> {tag}")
        print()

    if report["critical_missing"]:
        print(f"CRITICAL: {len(report['critical_missing'])} recommended section(s) missing:")
        for section in report["critical_missing"]:
            print(f"  - # {section}")
        print()
        print("These are needed based on the prompt's content. See")
        print("references/canonical-sections.md for guidance.")
    else:
        print("OK: all critical recommended sections present.")


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
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print_human(report)

    return 1 if report["critical_missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
