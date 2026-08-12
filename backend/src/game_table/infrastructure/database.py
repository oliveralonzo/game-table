"""
Database connection helpers.
"""

import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from psycopg import Connection


def load_environment(env_path: Path | None = None) -> None:
    _load_environment_file(env_path or Path.cwd() / ".env")


def _load_environment_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    lines = env_path.read_text().splitlines()
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            index += 1
            continue

        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")

        if "-----BEGIN " in value and "-----END " not in value:
            block_lines = [value]
            index += 1

            while index < len(lines):
                block_line = lines[index].strip()
                block_lines.append(block_line)
                if "-----END " in block_line:
                    break
                index += 1

            value = "\n".join(block_lines)

        if key and _should_set_environment_value(key):
            os.environ[key] = value

        index += 1


def _should_set_environment_value(key: str) -> bool:
    current_value = os.environ.get(key)
    if current_value is None:
        return True

    return (
        "-----BEGIN " in current_value
        and "-----END " not in current_value
    )


def get_platform_database_url() -> str | None:
    return os.environ.get("PLATFORM_DATABASE_URL")


def create_database_connection(database_url: str) -> "Connection":
    from psycopg import connect

    if not database_url:
        raise RuntimeError("A database URL is required.")

    return connect(database_url)
