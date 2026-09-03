#!/usr/bin/env python
"""Download raw nutrition sources, resumably, and record what arrived.

Every fetched file gets a MANIFEST.json entry (url, size, sha256, time);
nothing downstream reads a file that is not in the manifest.

Usage:
    fetch.py sources.json              # fetch everything not already complete
    fetch.py sources.json --only usda  # fetch one group
    fetch.py sources.json --check      # HEAD only, report reachability
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "raw"
MANIFEST = RAW / "MANIFEST.json"


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 22), b""):
            digest.update(chunk)
    return digest.hexdigest()


def head(url: str) -> dict:
    """Ask the server what is there without pulling the body."""
    proc = subprocess.run(
        ["curl", "-sIL", "--max-time", "60", url],
        capture_output=True,
        text=True,
        check=False,
    )
    status, length, ctype = None, None, None
    for line in proc.stdout.splitlines():
        low = line.lower()
        if low.startswith("http/"):
            status = line.split()[1]
        elif low.startswith("content-length:"):
            length = line.split(":", 1)[1].strip()
        elif low.startswith("content-type:"):
            ctype = line.split(":", 1)[1].strip()
    return {"status": status, "content_length": length, "content_type": ctype}


def download(url: str, dest: Path) -> None:
    """curl with resume. Re-running after an interrupt continues the file."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "curl",
        "-L",
        "--fail",
        "--retry", "5",
        "--retry-delay", "5",
        "--retry-connrefused",
        "--continue-at", "-",
        "--connect-timeout", "30",
        "--progress-bar",
        "-o", str(dest),
        url,
    ]
    result = subprocess.run(cmd, check=False)
    if result.returncode not in (0, 33):  # 33 = server refuses range, file done
        raise SystemExit(f"curl failed ({result.returncode}) for {url}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", type=Path)
    parser.add_argument("--only", default=None, help="group key to fetch")
    parser.add_argument("--check", action="store_true", help="HEAD only")
    args = parser.parse_args()

    sources = json.loads(args.sources.read_text())
    manifest = load_manifest()

    for entry in sources["files"]:
        key = entry["key"]
        if args.only and not key.startswith(args.only):
            continue
        dest = RAW / entry["dest"]

        if args.check:
            info = head(entry["url"])
            size = info["content_length"]
            pretty = f"{int(size) / 1e6:,.1f} MB" if size and size.isdigit() else size
            print(f"{key:<34} {info['status']:<4} {str(pretty):<14} {entry['url']}")
            continue

        if dest.exists() and manifest.get(key, {}).get("complete"):
            print(f"[skip] {key} already complete ({dest.stat().st_size:,} bytes)")
            continue

        print(f"[get ] {key} -> {dest.relative_to(RAW.parent)}")
        started = time.time()
        download(entry["url"], dest)
        size = dest.stat().st_size
        print(f"[hash] {key} ({size:,} bytes)")
        manifest[key] = {
            "url": entry["url"],
            "dest": str(dest.relative_to(RAW)),
            "bytes": size,
            "sha256": sha256(dest),
            "source": entry.get("source"),
            "license": entry.get("license"),
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "seconds": round(time.time() - started, 1),
            "complete": True,
        }
        save_manifest(manifest)
        print(f"[done] {key} in {manifest[key]['seconds']}s")

    return 0


if __name__ == "__main__":
    sys.exit(main())
