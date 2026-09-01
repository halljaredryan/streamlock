/**
 * Storage for links a user proved ownership of.
 *
 * `LinkStore` is the seam meant to be replaced by a database table. The
 * file-backed implementation is correct for a single instance: writes are
 * serialised through a promise chain and committed by atomic rename, so a crash
 * mid-write cannot truncate the file. It is *not* suitable for serverless or
 * multi-instance deployments, where the filesystem is ephemeral or unshared.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { clearCache } from "@/lib/cache";

export interface VerifiedLink {
  accountId: number;
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
  /** ISO 8601. */
  linkedAt: string;
}

export interface LinkStore {
  all(): Promise<VerifiedLink[]>;
  get(accountId: number): Promise<VerifiedLink | null>;
  put(link: VerifiedLink): Promise<void>;
  remove(accountId: number): Promise<boolean>;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "verified-links.json");

interface StoreFile {
  links: VerifiedLink[];
}

function isValidLink(value: unknown): value is VerifiedLink {
  if (!value || typeof value !== "object") return false;
  const link = value as Partial<VerifiedLink>;
  return (
    Number.isSafeInteger(link.accountId) &&
    (link.accountId as number) > 0 &&
    typeof link.twitchUserId === "string" &&
    typeof link.twitchLogin === "string" &&
    link.twitchLogin.length > 0
  );
}

class FileLinkStore implements LinkStore {
  /** Serialises writes so concurrent requests cannot clobber each other. */
  private queue: Promise<unknown> = Promise.resolve();

  private async read(): Promise<VerifiedLink[]> {
    try {
      const contents = await readFile(STORE_PATH, "utf8");
      const parsed = JSON.parse(contents) as StoreFile;
      return Array.isArray(parsed?.links) ? parsed.links.filter(isValidLink) : [];
    } catch {
      // Missing or unreadable file means "no links yet".
      return [];
    }
  }

  private async write(links: VerifiedLink[]): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    const temp = `${STORE_PATH}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify({ links } satisfies StoreFile, null, 2)}\n`, "utf8");
    await rename(temp, STORE_PATH);
    // The registry memoises links; invalidate so a new link takes effect at once.
    clearCache("links:");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  all(): Promise<VerifiedLink[]> {
    return this.read();
  }

  async get(accountId: number): Promise<VerifiedLink | null> {
    const links = await this.read();
    return links.find((link) => link.accountId === accountId) ?? null;
  }

  put(link: VerifiedLink): Promise<void> {
    return this.enqueue(async () => {
      const links = await this.read();
      const next = links.filter(
        (existing) =>
          // One channel per Steam account, and one Steam account per channel:
          // re-linking a channel moves it rather than duplicating it.
          existing.accountId !== link.accountId &&
          existing.twitchUserId !== link.twitchUserId,
      );
      next.push(link);
      await this.write(next);
    });
  }

  remove(accountId: number): Promise<boolean> {
    return this.enqueue(async () => {
      const links = await this.read();
      const next = links.filter((link) => link.accountId !== accountId);
      if (next.length === links.length) return false;
      await this.write(next);
      return true;
    });
  }
}

const globalRef = globalThis as typeof globalThis & { __streamlockLinkStore?: LinkStore };

export function getLinkStore(): LinkStore {
  return (globalRef.__streamlockLinkStore ??= new FileLinkStore());
}
