"""Read the canonical contract artifacts; never maintain a second tool catalog."""

import json
import os
import re
from pathlib import Path

import json5
from jsonschema import Draft202012Validator

CONTRACTS = Path(
    os.environ.get(
        "JARVIS_CONTRACTS_DIR", Path(__file__).resolve().parents[3] / "packages/contracts"
    )
)


def literal(path: str, pattern: str) -> dict:
    match = re.search(pattern, (CONTRACTS / path).read_text(), re.DOTALL)
    if not match:
        raise RuntimeError(f"Cannot read canonical contract literal: {path}")
    return json5.loads(match.group(1))


# TOOL_META/PORTS are plain object literals in the TS source. JSON5 reads that
# literal only (no code execution); names must agree with the generated schemas.
META = literal("src/tools.ts", r"export const TOOL_META:.*?=\s*(\{.*?\n\});")
PORTS = literal("src/ports.ts", r"export const PORTS =\s*(\{.*?\n\}) as const;")
INPUTS = json.loads((CONTRACTS / "schema/tool-inputs.schema.json").read_text())
if META.keys() != INPUTS.keys():
    raise RuntimeError("TOOL_META and generated ToolInputs differ; run make gen")
VALIDATORS = {name: Draft202012Validator(schema) for name, schema in INPUTS.items()}


def catalog() -> list[dict]:
    return [
        dict(name=name, needsApproval=False, **meta, inputSchema=INPUTS[name])
        if "needsApproval" not in meta
        else dict(name=name, **meta, inputSchema=INPUTS[name])
        for name, meta in META.items()
    ]


def validate_input(name: str, args: object) -> dict:
    if name not in VALIDATORS:
        raise KeyError(name)
    VALIDATORS[name].validate(args)
    # Match Zod's default stripping of unknown object fields.
    return {k: v for k, v in args.items() if k in INPUTS[name]["properties"]}
