import test from "node:test";
import assert from "node:assert/strict";
import { withAttendanceResponse } from "../dist/utils/tournamentAttendance.js";

test("optimistic RSVP changes only the current member's counts across every transition", () => {
    for (const previous of [null, "yes", "maybe", "no"]) {
        for (const next of ["yes", "maybe", "no"]) {
            const original = { id: "t", attendance_response: previous,
                attendance_intent_count: 8, attendance_maybe_count: 3 };
            const result = withAttendanceResponse(original, next);
            assert.equal(result.attendance_response, next);
            assert.equal(result.attendance_intent, next === "yes");
            assert.equal(result.attendance_intent_count, 8 - Number(previous === "yes") + Number(next === "yes"));
            assert.equal(result.attendance_maybe_count, 3 - Number(previous === "maybe") + Number(next === "maybe"));
            assert.equal(original.attendance_response, previous);
            assert.equal(original.attendance_intent_count, 8);
            assert.equal(result.id, "t");
        }
    }
});

test("repeating a response is idempotent and retaining the old snapshot permits rollback", () => {
    const original = { attendance_response: null, attendance_intent_count: 0, attendance_maybe_count: 0 };
    const pending = withAttendanceResponse(original, "maybe");
    assert.deepEqual(withAttendanceResponse(pending, "maybe"), pending);
    assert.deepEqual(original, { attendance_response: null, attendance_intent_count: 0, attendance_maybe_count: 0 });
    assert.equal(withAttendanceResponse({ attendance_intent: true }, "no").attendance_intent_count, 0);
});

test("optimistic roster moves only self and retains a declined response", () => {
    const self = { account_id: "self", username: "me", name: "Me", is_self: true };
    const other = { account_id: "other", username: "other", name: "Other", is_self: false, response: "yes" };
    const initial = { attendance_roster: [other], attendance_intent_count: 1, attendance_maybe_count: 0 };
    const yes = withAttendanceResponse(initial, "yes", self);
    assert.deepEqual(yes.attendance_roster.map(p => p.account_id), ["other", "self"]);
    const maybe = withAttendanceResponse(yes, "maybe", self);
    assert.equal(maybe.attendance_roster.find(p => p.is_self).response, "maybe");
    assert.equal(maybe.attendance_intent_count, 1);
    assert.equal(maybe.attendance_maybe_count, 1);
    const no = withAttendanceResponse(maybe, "no", self);
    assert.deepEqual(no.attendance_roster, [other, { ...self, response: "no" }]);
    assert.deepEqual(initial.attendance_roster, [other]);
});
