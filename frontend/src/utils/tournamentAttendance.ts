export type AttendanceResponse = "yes" | "maybe" | "no";
export type AttendancePerson = {
    account_id: string; username: string; name: string; badge_label?: string | null;
    is_self: boolean; response: AttendanceResponse;
};
export type AttendanceState = {
    attendance_roster?: AttendancePerson[];
    attendance_response?: AttendanceResponse | null;
    attendance_intent?: boolean;
    attendance_intent_count?: number | null;
    attendance_maybe_count?: number;
};

/** Update only this member's contribution; preserve everyone else's counts. */
export function withAttendanceResponse<T extends AttendanceState>(value: T, response: AttendanceResponse, self?: Omit<AttendancePerson, "response">): T {
    const previous = value.attendance_response ?? (value.attendance_intent ? "yes" : null);
    return {
        ...value,
        ...(self ? { attendance_roster: [
            ...(value.attendance_roster ?? []).filter(person => person.account_id !== self.account_id),
            { ...self, response },
        ] } : {}),
        attendance_response: response, attendance_intent: response === "yes",
        attendance_intent_count: Math.max(0, (value.attendance_intent_count ?? 0)
            - Number(previous === "yes") + Number(response === "yes")),
        attendance_maybe_count: Math.max(0, (value.attendance_maybe_count ?? 0)
            - Number(previous === "maybe") + Number(response === "maybe")),
    };
}
