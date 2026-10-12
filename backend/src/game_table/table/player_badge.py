MAX_DISPLAY_NAME_LENGTH = 24


def badge_options(name: str) -> list[str]:
    letters = [word[0].upper() for word in name.split()]
    if not letters:
        return []
    return list(dict.fromkeys(label for label in [letters[0], *[letters[0] + letter for letter in letters[1:]]] if len(label) <= 2))


def valid_badge(name: str, label: str | None) -> str | None:
    return label if label in badge_options(name) else None


def validate_badge(name: str, label: str) -> str:
    if label not in badge_options(name):
        raise ValueError("Choose a badge from your display name.")
    return label
