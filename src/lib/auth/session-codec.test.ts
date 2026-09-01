import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { constantTimeEqual, decodeSigned, encodeSigned } from "./session-codec.ts";

const SECRET = "test-secret-not-a-real-key";
const MAX_AGE = 60_000;

interface TestSession {
  issuedAt: number;
  steam?: { accountId: number };
}

describe("session codec", () => {
  it("round-trips a payload", () => {
    const token = encodeSigned<TestSession>(SECRET, {
      issuedAt: Date.now(),
      steam: { accountId: 479799201 },
    });
    const result = decodeSigned<TestSession>(SECRET, token, MAX_AGE);
    assert.ok(result.ok);
    assert.equal(result.data.steam?.accountId, 479799201);
  });

  it("rejects a payload edited without re-signing", () => {
    const issuedAt = Date.now();
    const token = encodeSigned<TestSession>(SECRET, { issuedAt, steam: { accountId: 1 } });
    const [, signature] = token.split(".");

    // Forge a different account id but keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ issuedAt, steam: { accountId: 999 } }),
    ).toString("base64url");

    const result = decodeSigned<TestSession>(SECRET, `${forgedPayload}.${signature}`, MAX_AGE);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "bad-signature");
  });

  it("rejects a token signed with a different secret", () => {
    const token = encodeSigned<TestSession>("other-secret", { issuedAt: Date.now() });
    const result = decodeSigned<TestSession>(SECRET, token, MAX_AGE);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "bad-signature");
  });

  it("rejects expired tokens", () => {
    const token = encodeSigned<TestSession>(SECRET, { issuedAt: 1_000 });
    const result = decodeSigned<TestSession>(SECRET, token, MAX_AGE, 1_000 + MAX_AGE + 1);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "expired");
  });

  it("accepts a token right at the age boundary", () => {
    const token = encodeSigned<TestSession>(SECRET, { issuedAt: 1_000 });
    const result = decodeSigned<TestSession>(SECRET, token, MAX_AGE, 1_000 + MAX_AGE);
    assert.equal(result.ok, true);
  });

  it("rejects missing and malformed values", () => {
    assert.equal(decodeSigned(SECRET, undefined, MAX_AGE).ok, false);
    assert.equal(decodeSigned(SECRET, "", MAX_AGE).ok, false);
    assert.equal(decodeSigned(SECRET, "nodot", MAX_AGE).ok, false);
    assert.equal(decodeSigned(SECRET, ".sig", MAX_AGE).ok, false);
    assert.equal(decodeSigned(SECRET, "payload.", MAX_AGE).ok, false);
  });

  it("rejects a validly signed payload with no issuedAt", () => {
    // Signed correctly, but not a session: must not be trusted.
    const payload = Buffer.from(JSON.stringify({ steam: { accountId: 5 } })).toString("base64url");
    const token = encodeSigned(SECRET, { issuedAt: 0 });
    const forged = `${payload}.${token.split(".")[1]}`;
    assert.equal(decodeSigned(SECRET, forged, MAX_AGE).ok, false);
  });
});

describe("constantTimeEqual", () => {
  it("compares by value and length", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "abcd"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });
});
