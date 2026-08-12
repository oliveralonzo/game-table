"""
ActivityService
Author: Oliver Alonzo
Supported by ChatGPT (GPT-5)
Date: 2026-06-07
Version: 0.1

Application service for transient table-scoped activity events.
"""

from game_table.activity.reaction import Reaction
from game_table.activity.chat_message import ChatMessage


class ActivityService:
    """
    Coordinates transient activity events.

    Does not own table membership.
    """

    def create_reaction(self, sender_id: str, value: str) -> Reaction:
        return Reaction(sender_id=sender_id, value=value)

    def create_chat_message(
        self,
        sender_id: str,
        text: str,
        client_message_id: str,
    ) -> ChatMessage:
        return ChatMessage(
            sender_id=sender_id,
            text=text,
            client_message_id=client_message_id,
        )
