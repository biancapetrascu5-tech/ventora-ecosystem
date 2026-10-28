// Work Better Auth runs after the response (advanced.backgroundTasks), today the password reset
// email. Sending it inside the request would make /request-password-reset slower for existing
// accounts only, which reveals which emails have an account (Better Auth equalises the timing
// for unknown emails, password.mjs). On Vercel an un-awaited promise can be cut off when the
// function returns, so the app injects Next's after() (decision B-6, no new package).
type BackgroundHandler = (task: Promise<unknown>) => void;

// Default (scripts, tests that use the production options): let the task run on its own.
// Better Auth already attaches a .catch that logs failures.
let handler: BackgroundHandler = () => {};

export function setAuthBackgroundTaskHandler(next: BackgroundHandler): void {
  handler = next;
}

export function runAuthBackgroundTask(task: Promise<unknown>): void {
  handler(task);
}
