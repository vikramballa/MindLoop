"""Writes the OpenAPI document: `python -m app.scripts.export_openapi [path]`."""

import json
import sys
from pathlib import Path

from app.main import app

out = Path(sys.argv[1] if len(sys.argv) > 1 else "../../docs/openapi.json")
out.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(f"wrote {out}")
