// Generates JSON Schema (schema/contracts.schema.json) and Python Pydantic models
// (python/jarvis_contracts/models.py) from the Zod source of truth.
// Run: pnpm gen   (needs uv on PATH)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JarvisEvent } from "../src/events.js";
import { Appointment, CalendarEvent, ChatMessage, Email, Lead, Patient } from "../src/domain.js";
import { ToolInputs, ToolResult, AsyncAccepted } from "../src/tools.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const toolInputSchemas = Object.fromEntries(
  Object.entries(ToolInputs).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: "input" })]),
);

const bundle = z.object({
  event: JarvisEvent,
  lead: Lead,
  email: Email,
  calendarEvent: CalendarEvent,
  chatMessage: ChatMessage,
  patient: Patient,
  appointment: Appointment,
  toolResult: ToolResult,
  asyncAccepted: AsyncAccepted,
});

const schema = z.toJSONSchema(bundle, { target: "draft-2020-12", io: "output" }) as Record<string, unknown>;
schema.title = "JarvisContracts";

mkdirSync(join(root, "schema"), { recursive: true });
const schemaPath = join(root, "schema", "contracts.schema.json");
writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n");
writeFileSync(join(root, "schema", "tool-inputs.schema.json"), JSON.stringify(toolInputSchemas, null, 2) + "\n");

const out = join(root, "python", "jarvis_contracts", "models.py");
execFileSync(
  "uvx",
  [
    "--from", "datamodel-code-generator==0.*",
    "datamodel-codegen",
    "--input", schemaPath,
    "--input-file-type", "jsonschema",
    "--output", out,
    "--output-model-type", "pydantic_v2.BaseModel",
    "--target-python-version", "3.12",
    "--use-annotated",
    "--use-standard-collections",
    "--use-union-operator",
    "--enum-field-as-literal", "all",
    "--use-title-as-name",
    "--disable-timestamp",
  ],
  { stdio: "inherit" },
);
console.log("generated", schemaPath, out);
