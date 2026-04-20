from __future__ import annotations

import os
import tempfile
import json
from pathlib import Path

import ifcopenshell
from flask import Flask, jsonify, request
from ifctester import ids, reporter

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "engine": "ifctester"})


@app.post("/validate")
def validate():
    ids_file = request.files.get("ids_file")
    if not ids_file:
        return jsonify({"error": "Missing ids_file"}), 400

    ifc_files = request.files.getlist("ifc_files")
    if not ifc_files:
        return jsonify({"error": "Missing ifc_files"}), 400

    with tempfile.TemporaryDirectory(prefix="ids-svv-ifctester-") as tmp:
        tmpdir = Path(tmp)
        ids_path = tmpdir / (ids_file.filename or "validation.ids")
        ids_file.save(ids_path)

        runs = []
        for ifc_upload in ifc_files:
            ifc_name = ifc_upload.filename or "model.ifc"
            ifc_path = tmpdir / ifc_name
            ifc_upload.save(ifc_path)

            try:
                spec = ids.open(str(ids_path))
                model = ifcopenshell.open(str(ifc_path))
                spec.validate(model)
                raw_report = reporter.Json(spec).report()
                report = json.loads(json.dumps(raw_report, default=str))
            except Exception as exc:
                return (
                    jsonify(
                        {
                            "error": f"IfcTester validation failed for {ifc_name}",
                            "detail": str(exc),
                        }
                    ),
                    500,
                )

            runs.append({"ifc_file": ifc_name, "report": report})

    return jsonify({"engine": "ifctester", "runs": runs})


if __name__ == "__main__":
    port = int(os.environ.get("IFCTESTER_PORT", "8765"))
    app.run(host="127.0.0.1", port=port)
