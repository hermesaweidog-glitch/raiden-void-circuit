#!/usr/bin/env python3
"""Fail closed on common credentials before they reach GitHub."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PATTERNS = [
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("OpenAI-style key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("secret assignment", re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password|client[_-]?secret)\s*[:=]\s*[\"']?[^\"'\s]{8,}")),
]

TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".md", ".txt", ".yml", ".yaml", ".toml", ".py", ".sh", ".env", ".ini", ".cfg"}

def tracked_files() -> list[Path]:
    result = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True)
    return [Path(p) for p in result.stdout.decode().split("\0") if p]

def main() -> int:
    findings: list[str] = []
    for path in tracked_files():
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for label, pattern in PATTERNS:
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                findings.append(f"{path}:{line}: possible {label}")
    if findings:
        print("Secret scan failed. Review these findings before pushing:")
        print("\n".join(findings))
        return 1
    print(f"Secret scan passed: {len(tracked_files())} tracked files checked.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
