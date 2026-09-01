import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDeadlockTimestamp, parseStatlockerDate } from "./time.ts";

// The whole point of this module: a zone-less UTC string must not be read as
// local time. Assert the host is not accidentally in UTC, which would hide it.
const HOST_OFFSET_MINUTES = new Date("2026-08-23T21:59:58Z").getTimezoneOffset();

describe("parseDeadlockTimestamp", () => {
  it("treats zone-less timestamps as UTC, not local time", () => {
    // Observed live: match 101283982 started at "2026-08-23 21:59:58" UTC.
    const expected = Math.floor(Date.parse("2026-08-23T21:59:58Z") / 1000);
    assert.equal(parseDeadlockTimestamp("2026-08-23 21:59:58"), expected);
    assert.equal(parseDeadlockTimestamp("2026-08-23T21:59:58"), expected);

    if (HOST_OFFSET_MINUTES !== 0) {
      // Prove the naive reading would have been wrong on this machine.
      assert.notEqual(Math.floor(Date.parse("2026-08-23T21:59:58") / 1000), expected);
    }
  });

  it("respects an explicit zone when one is present", () => {
    assert.equal(
      parseDeadlockTimestamp("2026-08-23T21:59:58Z"),
      Math.floor(Date.parse("2026-08-23T21:59:58Z") / 1000),
    );
    assert.equal(
      parseDeadlockTimestamp("2026-08-23T23:59:58+02:00"),
      Math.floor(Date.parse("2026-08-23T21:59:58Z") / 1000),
    );
  });

  it("throws on unparseable input", () => {
    assert.throws(() => parseDeadlockTimestamp("not a date"));
  });
});

describe("parseStatlockerDate", () => {
  it("parses ISO 8601 with an offset", () => {
    // Format taken from the Statlocker API docs.
    assert.equal(
      parseStatlockerDate("2025-09-08T15:45:41.000+00:00"),
      Math.floor(Date.parse("2025-09-08T15:45:41Z") / 1000),
    );
  });

  it("throws on unparseable input", () => {
    assert.throws(() => parseStatlockerDate(""));
  });
});
