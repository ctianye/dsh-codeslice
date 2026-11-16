"""Desktop-side half of the community comparison.

Reads `{nodes:[{id,path,kind,label}], edges:[{source,target,relation}]}` as JSON on
stdin, runs the **desktop** implementation verbatim
(`D:\\CodeSplit\\backend\\app\\graph\\cluster.py`), and writes its
`{assignment, summaries}` as JSON on stdout.

Why a separate process: the point of this check is to compare against the real
desktop code, not against a second paraphrase of it. networkx ships only in the
desktop backend's venv, so the import has to happen there.

    set PYTHONPATH=D:\\CodeSplit\\backend
    D:\\CodeSplit\\backend\\.venv\\Scripts\\python.exe cluster-desktop.py < payload.json
"""

from __future__ import annotations

import json
import sys

from app.graph.cluster import detect_communities


def main() -> int:
    payload = json.load(sys.stdin)
    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []
    assignment, summaries = detect_communities(nodes, edges, seed=0)
    json.dump({"assignment": assignment, "summaries": summaries}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
