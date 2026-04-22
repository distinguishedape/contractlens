/**
 * Standalone extraction test.
 *
 * Usage:
 *   npx tsx scripts/test-extract.ts path/to/contract.pdf
 *   npx tsx scripts/test-extract.ts --text path/to/contract.txt
 *
 * Prints: the extraction result, every retry attempt, and whether Zod
 * validation passed. This is the verification step for the extraction
 * pipeline before we wire it into the Next.js API route.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env.local into process.env before the Gemini client reads it.
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { extractPdfText } from "../lib/pdf";
import { extractContract } from "../lib/gemini";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/test-extract.ts <file.pdf>");
    console.error("       npx tsx scripts/test-extract.ts --text <file.txt>");
    process.exit(1);
  }

  const textMode = args[0] === "--text";
  const filePath = textMode ? args[1] : args[0];
  if (!filePath) {
    console.error("Missing file path.");
    process.exit(1);
  }

  const absolute = resolve(filePath);
  console.log(`Reading ${absolute}...`);
  const buffer = await readFile(absolute);

  const documentText = textMode
    ? buffer.toString("utf-8")
    : await extractPdfText(buffer);

  console.log(`Document length: ${documentText.length} chars`);
  console.log(`First 400 chars:\n${documentText.slice(0, 400)}\n---`);

  console.log("Running extraction...");
  const start = Date.now();
  const result = await extractContract(documentText);
  const elapsed = Date.now() - start;

  console.log(`\n=== ATTEMPTS (${result.attempts.length}) ===`);
  for (const attempt of result.attempts) {
    console.log(
      `  [attempt ${attempt.attempt}] ${attempt.error ? "FAIL" : "OK"}`
    );
    if (attempt.error) console.log(`    error: ${attempt.error.slice(0, 500)}`);
  }

  console.log(`\n=== RESULT (${elapsed}ms) ===`);
  if (result.success) {
    console.log("SUCCESS");
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.log("FAILURE:", result.error);
    if (result.partial) {
      console.log("\nPartial JSON from last attempt:");
      console.log(JSON.stringify(result.partial, null, 2));
    }
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
