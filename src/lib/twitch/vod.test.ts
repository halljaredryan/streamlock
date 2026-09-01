import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_OVERLAP_SECONDS,
  PRE_ROLL_SECONDS,
  computeOverlap,
  formatTwitchOffset,
  isMeaningfulOverlap,
  normaliseTwitchLogin,
  parseTwitchDuration,
  resolveThumbnail,
} from "./vod.ts";

describe("parseTwitchDuration", () => {
  it("parses every component combination Twitch emits", () => {
    assert.equal(parseTwitchDuration("3h8m33s"), 3 * 3600 + 8 * 60 + 33);
    assert.equal(parseTwitchDuration("21m5s"), 21 * 60 + 5);
    assert.equal(parseTwitchDuration("45s"), 45);
    assert.equal(parseTwitchDuration("2h"), 7200);
    assert.equal(parseTwitchDuration("1d2h3m4s"), 86400 + 7200 + 180 + 4);
  });

  it("returns 0 for unparseable input rather than throwing", () => {
    assert.equal(parseTwitchDuration(""), 0);
    assert.equal(parseTwitchDuration("nonsense"), 0);
  });
});

describe("formatTwitchOffset", () => {
  it("zero-pads minutes and seconds", () => {
    assert.equal(formatTwitchOffset(0), "0h00m00s");
    assert.equal(formatTwitchOffset(3661), "1h01m01s");
    assert.equal(formatTwitchOffset(7325), "2h02m05s");
  });

  it("clamps negatives", () => {
    assert.equal(formatTwitchOffset(-50), "0h00m00s");
  });
});

describe("computeOverlap", () => {
  // A 30 minute match starting at t=10000.
  const match = { startSeconds: 10_000, endSeconds: 11_800 };

  it("reports full coverage when the broadcast contains the match", () => {
    const result = computeOverlap(match, { startSeconds: 5_000, endSeconds: 20_000 });
    assert.ok(result);
    assert.equal(result.confidence, "full");
    assert.equal(result.coverage, 1);
    assert.equal(result.overlapSeconds, 1_800);
    // Offset rewinds by the pre-roll so playback opens before the match does.
    assert.equal(result.offsetSeconds, 10_000 - 5_000 - PRE_ROLL_SECONDS);
  });

  it("reports partial coverage when the stream starts mid-match", () => {
    const result = computeOverlap(match, { startSeconds: 10_900, endSeconds: 20_000 });
    assert.ok(result);
    assert.equal(result.confidence, "partial");
    assert.equal(result.overlapSeconds, 900);
    assert.equal(result.coverage, 0.5);
    // The match began before the VOD, so the offset floors at zero.
    assert.equal(result.offsetSeconds, 0);
  });

  it("reports partial coverage when the stream ends mid-match", () => {
    const result = computeOverlap(match, { startSeconds: 9_000, endSeconds: 10_900 });
    assert.ok(result);
    assert.equal(result.confidence, "partial");
    assert.equal(result.overlapSeconds, 900);
  });

  it("returns null for non-overlapping windows", () => {
    assert.equal(computeOverlap(match, { startSeconds: 0, endSeconds: 9_999 }), null);
    assert.equal(computeOverlap(match, { startSeconds: 11_800, endSeconds: 20_000 }), null);
  });

  it("filters out slivers below the meaningful threshold", () => {
    const sliver = computeOverlap(match, { startSeconds: 11_770, endSeconds: 20_000 });
    assert.ok(sliver);
    assert.equal(sliver.overlapSeconds, 30);
    assert.equal(isMeaningfulOverlap(sliver), false);

    const real = computeOverlap(match, {
      startSeconds: 11_800 - MIN_OVERLAP_SECONDS,
      endSeconds: 20_000,
    });
    assert.ok(real);
    assert.equal(isMeaningfulOverlap(real), true);
  });
});

describe("normaliseTwitchLogin", () => {
  it("accepts the many shapes a user may have typed into Statlocker", () => {
    assert.equal(normaliseTwitchLogin("SomeStreamer"), "somestreamer");
    assert.equal(normaliseTwitchLogin("  SomeStreamer  "), "somestreamer");
    assert.equal(normaliseTwitchLogin("@SomeStreamer"), "somestreamer");
    assert.equal(normaliseTwitchLogin("https://twitch.tv/SomeStreamer"), "somestreamer");
    assert.equal(normaliseTwitchLogin("https://www.twitch.tv/SomeStreamer/videos"), "somestreamer");
    assert.equal(normaliseTwitchLogin("twitch.tv/some_streamer?x=1"), "some_streamer");
  });

  it("rejects values that cannot be Twitch logins", () => {
    assert.equal(normaliseTwitchLogin(null), null);
    assert.equal(normaliseTwitchLogin(""), null);
    assert.equal(normaliseTwitchLogin("no"), null);
    assert.equal(normaliseTwitchLogin("has spaces"), null);
    assert.equal(normaliseTwitchLogin("bad!chars"), null);
    assert.equal(normaliseTwitchLogin("a".repeat(26)), null);
  });
});

describe("resolveThumbnail", () => {
  it("fills both dimension placeholders", () => {
    assert.equal(
      resolveThumbnail("https://cdn/thumb-%{width}x%{height}.jpg"),
      "https://cdn/thumb-320x180.jpg",
    );
    assert.equal(resolveThumbnail("https://cdn/thumb-{width}x{height}.jpg", 640, 360), "https://cdn/thumb-640x360.jpg");
    assert.equal(resolveThumbnail(null), null);
  });
});
