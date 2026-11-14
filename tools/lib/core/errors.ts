/** A user-facing error: printed as `ERROR: ...` and the process exits with code 2. */
export class ToolError extends Error {
  override readonly name = "ToolError";
}

export function fail(message: string): never {
  throw new ToolError(message);
}

/** Process exit codes shared by the tools. */
export const Exit = {
  ok: 0,
  recordCheckFailed: 1,
  usage: 2,
  targetMismatch: 3,
  actionFailed: 4,
} as const;

/** Run a CLI entry point; turn a ToolError into a clean message instead of a stack trace. */
export async function runCli(main: () => unknown): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (error instanceof ToolError) {
      console.error(`ERROR: ${error.message}`);
      process.exit(Exit.usage);
    }
    throw error;
  }
}
