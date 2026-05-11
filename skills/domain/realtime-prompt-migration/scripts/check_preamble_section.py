#!/usr/bin/env python3
"""Check if a prompt has the Preambles section it needs.

If tools are referenced but no Preambles section exists, the agent
will produce 500-2000ms silences during tool calls. This script
flags that risk.

Usage:
    python check_preamble_section.py path/to/prompt.md
    python check_preamble_section.py path/to/prompt.md --json

Exit codes:
    0 — no risk (either preambles present, or no tools referenced)
    1 — tools referenced but no preambles section (latency risk)
    2 — file not readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Patterns that suggest tool calls are part of the workflow
TOOL_HINTS = [
    r"\btool[_\s]*call",
    r"\bfunction[_\s]*call",
    r"\bcheck_\w+",
    r"\blook[_\s]*up",
    r"\bfetch_\w+",
    r"\bcreate_\w+",
    r"\bcancel_\w+",
    r"\bschedule_\w+",
    r"\bsearch_\w+",
    r"\blookup_\w+",
    r"\bget_\w+",
    r"\bcall\s+the\s+\w+",
    r"\bappel(er|le|le)\s+(la|le)?\s*fonction",
    r"\boutil\s+de",
]

PREAMBLE_SECTION_PATTERNS = [
    r"^#{1,3}\s+Preambles\s*$",
    r"^#{1,3}\s+Pr[ée]ambules?\s*$",
    r"^#{1,3}\s+Tool[_\s]Call[_\s]Preambles?\s*$",
]

# Patterns suggesting preamble-like guidance exists informally
INFORMAL_PREAMBLE_HINTS = [
    r"preamble",
    r"préambule",
    r"filler\s+phrase",
    r"phrase\s+de\s+remplissage",
    r"say\s+something\s+(before|while|like)",
    r"dis\s+(quelque\s+chose|une\s+phrase)",
]


def has_preamble_section(text: str) -> bool:
    for pattern in PREAMBLE_SECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            return True
    return False


def has_informal_preamble_guidance(text: str) -> list[str]:
    found = []
    text_lower = text.lower()
    for pattern in INFORMAL_PREAMBLE_HINTS:
        if re.search(pattern, text_lower):
            found.append(pattern)
    return found


def count_tool_hints(text: str) -> dict[str, int]:
    text_lower = text.lower()
    hits = {}
    for pattern in TOOL_HINTS:
        matches = re.findall(pattern, text_lower)
        if matches:
            hits[pattern] = len(matches)
    return hits


def analyze(prompt_path: Path) -> dict:
    text = prompt_path.read_text(encoding="utf-8")
    if not text.strip():
        return {"error": "empty file"}

    has_section = has_preamble_section(text)
    tool_hints = count_tool_hints(text)
    total_tool_hits = sum(tool_hints.values())
    has_informal = has_informal_preamble_guidance(text)

    needs_preamble = total_tool_hits >= 3
    at_risk = needs_preamble and not has_section

    return {
        "file": str(prompt_path),
        "has_preamble_section": has_section,
        "tool_hints": tool_hints,
        "total_tool_hits": total_tool_hits,
        "informal_preamble_hints": has_informal,
        "needs_preamble_section": needs_preamble,
        "at_risk": at_risk,
    }


def print_human(report: dict) -> None:
    if "error" in report:
        print(f"ERROR: {report['error']}", file=sys.stderr)
        return

    print(f"File: {report['file']}")
    print()
    print(f"Preamble section present:  {report['has_preamble_section']}")
    print(f"Tool hints detected:       {report['total_tool_hits']}")
    print(f"Informal preamble guidance: {len(report['informal_preamble_hints'])} hint(s)")
    print()

    if report["tool_hints"]:
        print("Tool hint patterns matched:")
        for pattern, count in sorted(report["tool_hints"].items(),
                                     key=lambda x: -x[1]):
            print(f"  {pattern:40s} {count}")
        print()

    if report["at_risk"]:
        print("AT RISK: tools are referenced but no Preambles section exists.")
        print()
        print("Without preambles, gpt-realtime-2 may produce 500-2000ms of")
        print("silence during tool calls while it reasons internally.")
        print()
        print("Minimum viable fix — add this section to the prompt:")
        print()
        print("    # Preambles")
        print("    Before calling a tool that takes noticeable time, say one")
        print("    short phrase like 'Je vérifie tout de suite' or 'Un instant,")
        print("    je regarde'. Keep it natural, vary the wording. Do not use")
        print("    preambles for direct answers, unclear audio, or simple")
        print("    confirmations.")
        print()
        print("See references/canonical-sections.md for the full version.")
    elif report["has_preamble_section"]:
        print("OK: preamble section is present.")
    else:
        print("OK: no tool references, preamble section not required.")


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

    return 1 if report["at_risk"] else 0


if __name__ == "__main__":
    sys.exit(main())
