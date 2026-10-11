import { readFileSync } from "node:fs";
import { closeDb } from "@aihot/backend/db";
import { importResearch } from "../modules/game-radar/import.ts";
const [input,mapping] = process.argv.slice(2);
if (!input || !mapping) throw new Error("Usage: node scripts/import-research.ts input.json mapping.json");
try {
  const result = await importResearch(JSON.parse(readFileSync(input,"utf8").replace(/^\uFEFF/,"")), JSON.parse(readFileSync(mapping,"utf8").replace(/^\uFEFF/,"")));
  console.log(JSON.stringify(result,null,2));
} finally { await closeDb(); }
