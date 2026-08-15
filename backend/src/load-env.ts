/**
 * Must be the first side-effect import in `index.ts`.
 * ESM hoists `import` above inline `dotenv.config()`, so env was empty when `db.ts` loaded.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

import { installProcessGuards } from "./process-guards.js";
installProcessGuards();
