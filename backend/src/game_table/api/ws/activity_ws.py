from socketio import AsyncServer

from game_table.application.table_service import TableService
from game_table.application.activity_service import ActivityService
from game_table.api.ws.session_registry import SessionRegistry


def register_activity_events(
    sio: AsyncServer,
    table_service: TableService,
    activity_service: ActivityService,
    session_registry: SessionRegistry,
) -> None:
    """
    Socket.IO adapter for transient activity events.
    """

    @sio.on("activity:reaction")
    async def react(sid, data):
        try:
            value = data["reaction"]

            sender_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(sender_id)

            reaction = activity_service.create_reaction(
                sender_id=sender_id,
                value=value,
            )

            await sio.emit(
                "activity:reaction",
                reaction.to_dict(),
                room=table_code,
            )

            return {"ok": True}

        except Exception as exc:
            return {"error": type(exc).__name__, "message": str(exc)}

    @sio.on("activity:chat_message")
    async def chat_message(sid, data):
        try:
            text = data["text"]
            client_message_id = data["client_message_id"]

            sender_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(sender_id)

            message = activity_service.create_chat_message(
                sender_id=sender_id,
                text=text,
                client_message_id=client_message_id,
            )

            await sio.emit(
                "activity:chat_message",
                message.to_dict(),
                room=table_code,
            )

            return {
                "ok": True,
                "client_message_id": client_message_id,
            }

        except Exception as exc:
            return {"error": type(exc).__name__, "message": str(exc)}
