import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) throw new Error(".env already exists; not overwritten");
const secrets: Record<string, string> = {
  ADMIN_PASSWORD: randomBytes(18).toString("base64url"),
  SESSION_SECRET: randomBytes(32).toString("hex"),
  IMG_PROXY_SIGN_SECRET: randomBytes(32).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
};
let text = readFileSync(".env.example", "utf8");
for (const [key, value] of Object.entries(secrets)) text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
for (const key of ["COLLECT_ENABLED", "MODEL_CALLS_ENABLED", "FEISHU_INTERNAL_ENABLED", "FEISHU_CONTENT_ENABLED", "INDEXNOW_SUBMIT_ENABLED"]) {
  text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=false`);
}
text = text.replace(/^SITE_URL=.*$/m, "SITE_URL=http://127.0.0.1:8788").replace(/^PORT=.*$/m, "PORT=127.0.0.1:8788");
writeFileSync(".env", text, { mode: 0o600 });
console.log("Local configuration created. API disabled. Credentials stay in .env; not printed.");
