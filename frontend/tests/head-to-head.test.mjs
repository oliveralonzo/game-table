import test from "node:test";
import assert from "node:assert/strict";
import { compareHeadToHead, compareHeadToHeadScore, formatOpponentsAhead } from "../dist/utils/headToHead.js";
const entry = (ahead, tied, behind) => ({ head_to_head: { ahead, tied, behind } });
test("compares fractions rather than opponent counts", () => {
    assert.ok(compareHeadToHeadScore(entry(2, 0, 1), entry(1, 0, 0)) > 0);
    assert.equal(compareHeadToHeadScore(entry(7, 1, 2), entry(14, 2, 4)), 0);
    assert.ok(compareHeadToHeadScore(entry(700, 0, 300), entry(701, 0, 299)) > 0);
});
test("ties count in the denominator and unplayed records have no percentage", () => {
    assert.equal(formatOpponentsAhead(entry(7, 1, 2).head_to_head, "en"), "70%");
    assert.equal(formatOpponentsAhead(entry(6, 1, 2).head_to_head, "en"), "67%");
    assert.equal(formatOpponentsAhead(entry(0, 1, 0).head_to_head, "en"), "0%");
    assert.equal(formatOpponentsAhead(entry(0, 0, 0).head_to_head, "en"), "—");
    assert.ok(compareHeadToHeadScore(entry(0, 0, 0), entry(0, 0, 1)) > 0);
});

test("overall win percentage orders tied matchup fractions without breaking their shared rank", () => {
    const lower = { ...entry(7, 1, 2), games_played: 20, win_percentage: 0.55, username: "alpha" };
    const higher = { ...entry(14, 2, 4), games_played: 40, win_percentage: 0.65, username: "zeta" };
    assert.equal(compareHeadToHeadScore(lower, higher), 0);
    assert.ok(compareHeadToHead(lower, higher) > 0);
});
