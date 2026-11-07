import { execFileSync } from 'node:child_process';

/** Short git commit id for the build; falls back to `GITHUB_SHA`, then `dev` when git is unavailable. */
export function gitShortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
  }
}