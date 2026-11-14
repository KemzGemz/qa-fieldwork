/** Target configuration: tools/defaults.yaml merged with targets/<id>/target.yaml, validated. */
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { fail } from "./errors.ts";
import { DEFAULTS_FILE, targetDir } from "./paths.ts";
import { readText } from "./store.ts";

const emptyWhenNull = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value) => value ?? []);

const Role = z.looseObject({
  description: z.string().optional(),
  sign_in: z.string().optional(),
  identity_shown: z.string().optional(),
});

export const TargetConfig = z.looseObject({
  id: z.string().optional(),
  name: z.string().default(""),
  base_url: z.string(),
  allowed_origins: emptyWhenNull(z.string()),
  environment: z.string().default("test"),
  version_hint: z.string().optional(),
  roles: z
    .record(z.string(), Role.nullable())
    .nullish()
    .transform((value) => value ?? {}),
  scope: z
    .object({ include: emptyWhenNull(z.string()), exclude: emptyWhenNull(z.string()) })
    .default({ include: [], exclude: [] }),
  permissions: z.object({
    change_data: z.boolean(),
    destructive: z.boolean(),
    create_accounts: z.boolean(),
  }),
  budget: z.object({ actions: z.number().int().positive(), report_reserve: z.number().min(0).max(1) }),
  browser: z.object({
    headless: z.boolean(),
    viewport: z.tuple([z.number(), z.number()]),
    one_tab: z.boolean(),
    action_timeout_ms: z.number(),
    load_timeout_ms: z.number(),
    quiet_ms: z.number(),
    dialogs: z.enum(["dismiss", "accept"]),
    direct_navigation: z.enum(["start-only", "any"]),
  }),
  recovery: z.object({ max_attempts: z.number().int(), repeat_limit: z.number().int() }),
});
export type TargetConfig = z.infer<typeof TargetConfig>;

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One level deep: a target overrides single keys of `browser`, `budget`, ... without restating the rest. */
function merge(base: Plain, own: Plain): Plain {
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(own)) {
    const existing = out[key];
    out[key] = isPlain(value) && isPlain(existing) ? { ...existing, ...value } : value;
  }
  return out;
}

export function loadConfig(target: string): TargetConfig {
  const defaults = (parse(readText(DEFAULTS_FILE)) ?? {}) as Plain;
  const own = (parse(readText(join(targetDir(target), "target.yaml"))) ?? {}) as Plain;
  const result = TargetConfig.safeParse(merge(defaults, own));
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    fail(`targets/${target}/target.yaml is not valid: ${issues}`);
  }
  return result.data;
}

/** scheme://host[:port], lower-cased. */
export function originOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(`not an http(s) URL: '${url}'`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") fail(`not an http(s) URL: '${url}'`);
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

export function allowedOrigins(config: TargetConfig): Set<string> {
  return new Set([originOf(config.base_url), ...config.allowed_origins.map(originOf)]);
}
