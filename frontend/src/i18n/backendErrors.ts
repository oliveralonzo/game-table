const MESSAGE_CODE_FALLBACKS: Record<string, string> = {
    "Table already exists.": "TABLE_ALREADY_EXISTS",
    "Table does not exist.": "TABLE_NOT_FOUND",
    "Name already taken.": "NAME_TAKEN",
    "Name is required.": "NAME_REQUIRED",
    "Host name is required.": "NAME_REQUIRED",
    "Member already belongs to a table.": "MEMBER_ALREADY_IN_TABLE",
    "Member not associated with any table.": "MEMBER_NOT_IN_TABLE",
    "Acting member not in specified table.": "MEMBER_NOT_IN_TABLE",
    "Member must belong to same table.": "MEMBER_NOT_IN_TABLE",
    "Target member not in same table.": "MEMBER_NOT_IN_TABLE",
    "New host must belong to same table.": "MEMBER_NOT_IN_TABLE",
    "Member does not exist.": "MEMBER_NOT_FOUND",
};

export function resolveBackendErrorCode(
    code?: string,
    message?: string
): string {
    return code || (message ? MESSAGE_CODE_FALLBACKS[message] : undefined) || "UNKNOWN";
}

export function backendErrorToJoinKey(
    code?: string,
    message?: string
): string {
    return `join.backendErrors.${resolveBackendErrorCode(code, message)}`;
}
