import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountIdToSteamId64,
  parseSteamClaimedId,
  parseSteamInput,
  steamId64ToAccountId,
} from "./id.ts";

// Real pairing observed from the Deadlock API.
const ACCOUNT_ID = 479799201;
const STEAM_ID_64 = "76561198440064929";

describe("account id <-> SteamID64", () => {
  it("round-trips", () => {
    assert.equal(accountIdToSteamId64(ACCOUNT_ID), STEAM_ID_64);
    assert.equal(steamId64ToAccountId(STEAM_ID_64), ACCOUNT_ID);
  });

  it("rejects out-of-range SteamID64s", () => {
    assert.throws(() => steamId64ToAccountId("1"));
  });
});

describe("parseSteamInput", () => {
  it("recognises bare ids", () => {
    assert.deepEqual(parseSteamInput(String(ACCOUNT_ID)), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
    assert.deepEqual(parseSteamInput(STEAM_ID_64), { kind: "accountId", accountId: ACCOUNT_ID });
  });

  it("recognises legacy and modern textual forms", () => {
    assert.deepEqual(parseSteamInput("STEAM_0:1:12345"), {
      kind: "accountId",
      accountId: 24_691,
    });
    assert.deepEqual(parseSteamInput("STEAM_1:0:12345"), {
      kind: "accountId",
      accountId: 24_690,
    });
    assert.deepEqual(parseSteamInput("[U:1:479799201]"), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
    assert.deepEqual(parseSteamInput("U:1:479799201"), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
  });

  it("extracts ids from profile URLs", () => {
    assert.deepEqual(parseSteamInput(`https://steamcommunity.com/profiles/${STEAM_ID_64}/`), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
    assert.deepEqual(parseSteamInput(`steamcommunity.com/profiles/${STEAM_ID_64}`), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
    assert.deepEqual(parseSteamInput(`https://statlocker.gg/profile/${ACCOUNT_ID}`), {
      kind: "accountId",
      accountId: ACCOUNT_ID,
    });
  });

  it("flags vanity URLs so they can be resolved via the Steam Web API", () => {
    assert.deepEqual(parseSteamInput("https://steamcommunity.com/id/oogaingmychaka/"), {
      kind: "search",
      query: "oogaingmychaka",
      fromVanityUrl: true,
    });
  });

  it("treats bare names as persona searches", () => {
    assert.deepEqual(parseSteamInput("OogaChaka"), {
      kind: "search",
      query: "OogaChaka",
      fromVanityUrl: false,
    });
    assert.deepEqual(parseSteamInput("  Ooga Chaka  "), {
      kind: "search",
      query: "Ooga Chaka",
      fromVanityUrl: false,
    });
  });

  it("rejects empty input", () => {
    assert.throws(() => parseSteamInput("   "));
  });
});

describe("parseSteamClaimedId", () => {
  it("accepts a genuine OpenID identity URL", () => {
    assert.equal(
      parseSteamClaimedId(`https://steamcommunity.com/openid/id/${STEAM_ID_64}`),
      STEAM_ID_64,
    );
    assert.equal(
      parseSteamClaimedId(`http://steamcommunity.com/openid/id/${STEAM_ID_64}`),
      STEAM_ID_64,
    );
  });

  it("rejects lookalike hosts and paths", () => {
    // These are the values an attacker would try in the callback query string.
    assert.equal(parseSteamClaimedId(`https://evil.com/openid/id/${STEAM_ID_64}`), null);
    assert.equal(
      parseSteamClaimedId(`https://steamcommunity.com.evil.com/openid/id/${STEAM_ID_64}`),
      null,
    );
    assert.equal(
      parseSteamClaimedId(`https://notsteamcommunity.com/openid/id/${STEAM_ID_64}`),
      null,
    );
    assert.equal(parseSteamClaimedId(`https://steamcommunity.com/profiles/${STEAM_ID_64}`), null);
    assert.equal(
      parseSteamClaimedId(`https://steamcommunity.com/openid/id/${STEAM_ID_64}?x=1`),
      null,
    );
    assert.equal(parseSteamClaimedId("https://steamcommunity.com/openid/id/123"), null);
    assert.equal(parseSteamClaimedId(""), null);
  });
});
