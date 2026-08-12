"""
ChatMessage class
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-06-18
Version: 0.1

Represents a transient table chat message.

Responsibilities:
- Validate sender identity.
- Validate message content.
- Preserve client message ID for delivery tracking.
- Generate a timestamp for ordering.

Design:
- Immutable value object.
- No persistence.
- No table or game knowledge.
"""

from time import time

from game_table.activity.constants import MAX_CHAT_MESSAGE_LENGTH


class ChatMessage:
    """
    Value object for a transient table chat message.
    """

    def __init__(
        self,
        sender_id: str,
        text: str,
        client_message_id: str,
    ):
        if not sender_id:
            raise ValueError("Sender ID is required.")

        if not client_message_id or not client_message_id.strip():
            raise ValueError("Client message ID is required.")

        clean_text = text.strip()

        if not clean_text:
            raise ValueError("Message is required.")

        if len(clean_text) > MAX_CHAT_MESSAGE_LENGTH:
            raise ValueError(
                f"Message cannot exceed {MAX_CHAT_MESSAGE_LENGTH} characters."
            )

        self._sender_id = sender_id
        self._text = clean_text
        self._client_message_id = client_message_id.strip()
        self._ts = int(time() * 1000)

    @property
    def sender_id(self) -> str:
        return self._sender_id

    @property
    def text(self) -> str:
        return self._text

    @property
    def client_message_id(self) -> str:
        return self._client_message_id

    @property
    def ts(self) -> int:
        return self._ts

    def to_dict(self) -> dict:
        return {
            "sender_id": self._sender_id,
            "text": self._text,
            "client_message_id": self._client_message_id,
            "ts": self._ts,
        }