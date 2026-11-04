import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock } from "../../src/server/clock";
export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "facedown-m3-"));
  return {
    db: join(dir, "fd.db"),
    clean: () => rmSync(dir, { recursive: true }),
  };
}
export class FakeClock implements Clock {
  time = 0;
  private next = 0;
  private jobs = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  after(ms: number, callback: () => void) {
    const id = this.next++;
    this.jobs.set(id, { at: this.time + ms, callback });
    return () => {
      this.jobs.delete(id);
    };
  }
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const job = [...this.jobs.entries()]
        .filter(([, v]) => v.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!job) break;
      this.time = job[1].at;
      this.jobs.delete(job[0]);
      job[1].callback();
    }
    this.time = target;
  }
  get pending() {
    return this.jobs.size;
  }
}
