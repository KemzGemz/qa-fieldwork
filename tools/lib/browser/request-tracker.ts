import type { Page } from "playwright";

export interface StuckRequest {
  age_s: number;
  method: string;
  type: string;
  url: string;
}

/** Times the requests of the page it is attached to, for the life of one tool call. */
export class RequestTracker {
  private readonly inflight = new Map<object, { started: number; method: string; type: string; url: string }>();

  attach(page: Page): void {
    page.on("request", (r) =>
      this.inflight.set(r, { started: Date.now(), method: r.method(), type: r.resourceType(), url: r.url() }),
    );
    page.on("requestfinished", (r) => this.inflight.delete(r));
    page.on("requestfailed", (r) => this.inflight.delete(r));
  }

  stuck(olderThanSeconds = 5): StuckRequest[] {
    const nowMs = Date.now();
    return [...this.inflight.values()]
      .filter((r) => nowMs - r.started >= olderThanSeconds * 1000)
      .map((r) => ({
        age_s: Math.round((nowMs - r.started) / 100) / 10,
        method: r.method,
        type: r.type,
        url: r.url.slice(0, 160),
      }));
  }
}
