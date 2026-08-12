ERROR_CODES = {
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
}


def error_code(exc: Exception) -> str:
    return ERROR_CODES.get(str(exc), type(exc).__name__.upper())


def error_response(exc: Exception) -> dict:
    return {
        "error": type(exc).__name__,
        "code": error_code(exc),
        "message": str(exc),
    }
