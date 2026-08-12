"""
Reaction class
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-06-07
Version: 0.1

Represents a transient activity reaction.

Responsibilities:
- Validate sender identity.
- Validate reaction value.
- Generate a timestamp for UI animation/event ordering.

Design:
- Immutable value object.
- No persistence.
- No table or game knowledge.
"""

from time import time

class Reaction:
    """
    Value object for a transient activity reaction.
    """

    def __init__(self, sender_id: str, value: str):
        if not sender_id:
            raise ValueError("Sender ID is required.")

        if not value or not value.strip():
            raise ValueError("Reaction value is required.")

        self._sender_id = sender_id
        self._value = value.strip()
        self._ts = int(time() * 1000)

    @property
    def sender_id(self) -> str:
        return self._sender_id

    @property
    def value(self) -> str:
        return self._value

    @property
    def ts(self) -> int:
        return self._ts

    def to_dict(self) -> dict:
        return {
            "sender_id": self._sender_id,
            "value": self._value,
            "ts": self._ts,
        }