# backend/api/ws/table_ws.py

import asyncio

from socketio import AsyncServer
from game_table.application.account_service import AccountService
from game_table.application.table_service import TableService
from game_table.application.game_table_service import GameTableService
from game_table.game_settings_provider import GameSettingsProvider
from game_table.api.ws.errors import error_response as _error_response
from game_table.api.ws.session_registry import SessionRegistry
from game_table.auth.auth_verifier import AuthVerifier


DISCONNECTED_MEMBER_GRACE_SECONDS = 10 * 60
PAGE_EXIT_GRACE_SECONDS = 3


def _get_serialized_table_view(
    table_service: TableService,
    game_settings_provider: GameSettingsProvider,
    table_code: str,
) -> dict:
    table_view = table_service.get_table_view(table_code)
    rules = table_view.get("pending_rules")
    if rules is not None:
        table_view["pending_rules"] = game_settings_provider.serialize_settings(rules)
    return table_view


async def leave_member_and_broadcast(
    sio: AsyncServer,
    table_service: TableService,
    session_registry: SessionRegistry,
    game_settings_provider: GameSettingsProvider,
    member_id: str,
) -> str:
    """Apply canonical leave semantics for sockets and lifecycle HTTP calls."""
    table_code = table_service.get_table_code_for_member(member_id)
    table_service.leave_table(member_id)
    session_registry.remove_member_sessions(member_id)

    tables = table_service.list_tables()
    await sio.emit("table:list_updated", {"tables": tables})

    if table_service.table_exists(table_code):
        table_view = _get_serialized_table_view(
            table_service,
            game_settings_provider,
            table_code,
        )
        await sio.emit("table:updated", table_view, room=table_code)
    else:
        await emit_table_deleted(sio, table_code)

    return table_code


def register_table_events(
    sio: AsyncServer,
    table_service: TableService,
    game_table_service: GameTableService,
    session_registry: SessionRegistry,
    game_settings_provider: GameSettingsProvider,
    account_service: AccountService | None = None,
    auth_verifier: AuthVerifier | None = None,
    settings_enabled: bool = True,
) -> None:
    """
    Socket.IO adapter for TableService.
    """
    disconnect_cleanup_tasks: dict[str, asyncio.Task] = {}
    intentional_unload_sessions: set[str] = set()

    def _get_table_view(table_code: str) -> dict:
        return _get_serialized_table_view(
            table_service,
            game_settings_provider,
            table_code,
        )

    # ---------------------------- Utilities ---------------------------- #

    async def _broadcast_table_list_update():
        tables = table_service.list_tables()
        await sio.emit("table:list_updated", {"tables": tables})

    async def _broadcast_table_state_update(table_code: str):
        await _broadcast_table_list_update()

        try:
            table_view = _get_table_view(table_code)
            await sio.emit("table:updated", table_view, room=table_code)
        except ValueError:
            pass

    def _resolve_account_identity(data) -> tuple[str | None, str | None]:
        token = (data or {}).get("auth_token")
        if not token:
            return None, None

        if account_service is None or auth_verifier is None:
            raise RuntimeError("Accounts are not configured.")

        identity = auth_verifier.verify_token(token)
        account = account_service.find_by_auth_identity(
            identity.provider,
            identity.subject,
        )

        if account is None:
            raise ValueError("Account does not exist.")

        return account.id, account.username

    async def _enter_table_room_and_broadcast(
        sid: str,
        table_code: str,
        member_id: str,
    ) -> None:
        await sio.enter_room(sid, table_code)
        await sio.enter_room(sid, f"member:{member_id}")

        await _broadcast_table_list_update()

        table_view = _get_table_view(table_code)
        await sio.emit("table:updated", table_view, room=table_code)

    async def _restore_existing_table_session(sid: str, member_id: str) -> bool:
        try:
            table_code = table_service.get_table_code_for_member(member_id)
        except ValueError:
            return False

        await sio.enter_room(sid, table_code)
        await sio.enter_room(sid, f"member:{member_id}")

        await sio.emit(
            "table:restored",
            {
                "member_id": member_id,
                "table": _get_table_view(table_code),
            },
            to=sid,
        )
        return True

    async def _leave_disconnected_member_after_grace(
        client_session_id: str,
        member_id: str,
        grace_seconds: float = DISCONNECTED_MEMBER_GRACE_SECONDS,
    ) -> None:
        try:
            await asyncio.sleep(grace_seconds)

            if session_registry.has_connection(client_session_id):
                return

            if (
                session_registry.get_member_id_for_client_session(
                    client_session_id
                ) != member_id
            ):
                return

            try:
                await leave_member_and_broadcast(
                    sio,
                    table_service,
                    session_registry,
                    game_settings_provider,
                    member_id,
                )
            except ValueError:
                return
        finally:
            if (
                disconnect_cleanup_tasks.get(client_session_id)
                is asyncio.current_task()
            ):
                disconnect_cleanup_tasks.pop(client_session_id, None)

    # ---------------------------- Connection ---------------------------- #

    @sio.event
    async def connect(sid, environ, auth):
        client_session_id = (auth or {}).get("client_session_id")
        if not client_session_id:
            raise ConnectionRefusedError("Missing client_session_id.")

        intentional_unload_sessions.discard(client_session_id)
        session_registry.bind_connection(
            sid,
            client_session_id,
        )

        pending_cleanup = disconnect_cleanup_tasks.get(client_session_id)

        member_id = session_registry.get_member_id(sid)

        if member_id is not None:
            restored = await _restore_existing_table_session(sid, member_id)
            if restored:
                pending_cleanup = disconnect_cleanup_tasks.pop(client_session_id, None)
                if pending_cleanup is not None:
                    pending_cleanup.cancel()
                return

            session_registry.remove_client_session_member(client_session_id)

        pending_cleanup = disconnect_cleanup_tasks.pop(client_session_id, None)
        if pending_cleanup is not None:
            pending_cleanup.cancel()

    @sio.event
    async def disconnect(sid):
        try:
            client_session_id = session_registry.resolve_client_session_id(sid)
            member_id = session_registry.get_member_id(sid)
        except ValueError:
            client_session_id = None
            member_id = None

        session_registry.unbind_connection(sid)

        if client_session_id is None or member_id is None:
            return

        if session_registry.has_connection(client_session_id):
            return

        grace_seconds = DISCONNECTED_MEMBER_GRACE_SECONDS
        if client_session_id in intentional_unload_sessions:
            intentional_unload_sessions.discard(client_session_id)
            grace_seconds = PAGE_EXIT_GRACE_SECONDS

        existing_cleanup = disconnect_cleanup_tasks.get(client_session_id)
        if existing_cleanup is not None and not existing_cleanup.done():
            return

        disconnect_cleanup_tasks[client_session_id] = asyncio.create_task(
            _leave_disconnected_member_after_grace(
                client_session_id,
                member_id,
                grace_seconds,
            )
        )

    # ---------------------------- Table Control ---------------------------- #

    @sio.on("table:prepare_unload")
    async def prepare_table_unload(sid, data=None):
        try:
            client_session_id = session_registry.resolve_client_session_id(sid)
            session_registry.resolve_member_id(sid)
        except ValueError:
            return

        intentional_unload_sessions.add(client_session_id)

    @sio.on("table:cancel_unload")
    async def cancel_table_unload(sid, data=None):
        try:
            client_session_id = session_registry.resolve_client_session_id(sid)
        except ValueError:
            return

        intentional_unload_sessions.discard(client_session_id)

    @sio.on("table:create")
    async def create_table(sid, data):
        try:
            table_code = data["table_code"]
            name = data["name"]

            member_id = session_registry.get_or_create_member_id(sid)
            account_id, account_username = _resolve_account_identity(data)

            table_service.create_table(
                member_id=member_id,
                table_code=table_code,
                host_name=name,
                account_id=account_id,
                account_username=account_username,
                rules=game_settings_provider.default_settings(),
            )

            await _enter_table_room_and_broadcast(
                sid,
                table_code,
                member_id,
            )

            return {
                "table_code": table_code,
                "member_id": member_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:delete")
    async def delete_table(sid, data):
        try:
            table_code = data["table_code"]
            table = table_service.get_table(table_code)
            member_id = session_registry.resolve_member_id(sid)
            member_ids = list(table.members.keys())

            table_service.delete_table(
                member_id=member_id,
                table_code=table_code,
            )

            for removed_member_id in member_ids:
                session_registry.remove_member_sessions(removed_member_id)

            await emit_table_deleted(sio, table_code)
            await _broadcast_table_list_update()

            return {
                "table_code": table_code,
                "deleted": True,
            }

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Membership ---------------------------- #

    @sio.on("table:join")
    async def join_table(sid, data):
        try:
            table_code = data["table_code"]
            name = data["name"]

            member_id = session_registry.get_or_create_member_id(sid)
            account_id, account_username = _resolve_account_identity(data)

            removed_member_id = table_service.join_table(
                member_id=member_id,
                table_code=table_code,
                name=name,
                account_id=account_id,
                account_username=account_username,
            )

            if removed_member_id is not None:
                removed_sids = [
                    removed_sid
                    for removed_sid
                    in session_registry.get_sids_for_member_id(removed_member_id)
                    if removed_sid != sid
                ]

                for removed_sid in removed_sids:
                    await sio.emit(
                        "table:replaced",
                        {
                            "table_code": table_code,
                            "member_id": removed_member_id,
                        },
                        to=removed_sid,
                    )
                    await sio.leave_room(removed_sid, table_code)
                    await sio.leave_room(
                        removed_sid,
                        f"member:{removed_member_id}",
                    )

                session_registry.remove_member_sessions(removed_member_id)

            await _enter_table_room_and_broadcast(
                sid,
                table_code,
                member_id,
            )

            return {
                "table_code": table_code,
                "member_id": member_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:leave")
    async def leave_table(sid, data=None):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = await leave_member_and_broadcast(
                sio,
                table_service,
                session_registry,
                game_settings_provider,
                member_id,
            )

            await sio.leave_room(sid, table_code)

            return {
                "left": True,
                "table_code": table_code,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:update_name")
    async def update_name(sid, data):
        try:
            name = data["name"]
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.update_name(
                member_id=member_id,
                name=name,
            )

            account_id, _ = _resolve_account_identity(data)
            if account_id and account_service is not None:
                account_service.update_table_nickname(account_id, name)

            await _broadcast_table_state_update(table_code)

            return {"updated": True}

        except Exception as exc:
            return _error_response(exc)
    
    @sio.on("table:remove_member")
    async def remove_member(sid, data):
        try:
            target_member_id = data["member_id"]
            member_id = session_registry.resolve_member_id(sid)

            table_code = table_service.get_table_code_for_member(member_id)
            target_sids = session_registry.get_sids_for_member_id(target_member_id)

            table_service.remove_member(
                member_id=member_id,
                target_member_id=target_member_id,
            )

            await sio.emit(
                "table:removed",
                {"table_code": table_code},
                room=f"member:{target_member_id}",
            )

            for target_sid in target_sids:
                await sio.leave_room(target_sid, table_code)
                await sio.leave_room(target_sid, f"member:{target_member_id}")

            session_registry.remove_member_sessions(target_member_id)

            await _broadcast_table_state_update(table_code)

            return {
                "removed": True,
                "member_id": target_member_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:transfer_host")
    async def transfer_host(sid, data):
        try:
            new_host_id = data["member_id"]
            member_id = session_registry.resolve_member_id(sid)

            table_code = table_service.get_table_code_for_member(member_id)

            table_service.transfer_host(
                member_id=member_id,
                new_host_id=new_host_id,
            )

            await _broadcast_table_state_update(table_code)

            return {
                "transferred": True,
                "new_host_id": new_host_id,
            }

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Seats ---------------------------- #

    @sio.on("table:add_seat")
    async def add_seat(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.add_seat(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"added": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:remove_seat")
    async def remove_seat(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.remove_seat(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"removed": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:assign_seat")
    async def assign_seat(sid, data):
        try:
            seat_index = data["seat_index"]
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.assign_seat(
                member_id=member_id,
                seat_index=seat_index,
            )

            await _broadcast_table_state_update(table_code)

            return {
                "assigned": True,
                "seat_index": seat_index,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:unassign_seat")
    async def unassign_seat(sid, data):
        try:
            seat_index = data["seat_index"]
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.unassign_seat(
                member_id=member_id,
                seat_index=seat_index,
            )

            await _broadcast_table_state_update(table_code)

            return {
                "unassigned": True,
                "seat_index": seat_index,
            }

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Configuration ---------------------------- #

    @sio.on("table:update_rules")
    async def update_rules(sid, data):
        try:
            if not settings_enabled:
                raise RuntimeError("Settings are disabled.")
            rules = game_settings_provider.parse_settings(data["rules"])
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.update_rules(
                member_id=member_id,
                rules=rules,
            )

            await _broadcast_table_state_update(table_code)

            return {"updated": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:get_pending_rules")
    async def get_pending_rules(sid, data):
        try:
            table_code = data["table_code"]
            rules = table_service.get_pending_rules(table_code)

            return {
                "rules": game_settings_provider.serialize_settings(rules)
                if rules is not None
                else None
            }

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Game Control ---------------------------- #

    @sio.on("table:start_game")
    async def start_game(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            game_id = game_table_service.start_game_for_table(member_id)

            await _broadcast_table_state_update(table_code)
            table_view = _get_table_view(table_code)
            seats = table_view.get("seats", [])
            host_id = table_view.get("host_id")
            shuffler_seat = seats.index(host_id) if host_id in seats else None
            await sio.emit(
                "game:round_transition",
                {
                    "phase": "shuffle",
                    "shuffler_seat": shuffler_seat,
                },
                room=table_code,
            )

            return {
                "started": True,
                "game_id": game_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:end_game")
    async def end_game(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            game_table_service.end_game_for_table(member_id)

            await _broadcast_table_state_update(table_code)

            return {"ended": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:block_game")
    async def block_game(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.block_game(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"blocked": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:resume_game")
    async def resume_game(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.resume_game(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"resumed": True}

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Persistence ---------------------------- #

    @sio.on("table:mark_persistent")
    async def mark_persistent(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.mark_persistent(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"persistent": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:unmark_persistent")
    async def unmark_persistent(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.unmark_persistent(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"persistent": False}

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Hand Visibility ---------------------------- #

    @sio.on("table:enable_hand_visibility")
    async def enable_hand_visibility(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.enable_hand_visibility(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"enabled": True}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:disable_hand_visibility")
    async def disable_hand_visibility(sid, data):
        try:
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.disable_hand_visibility(member_id=member_id)

            await _broadcast_table_state_update(table_code)

            return {"enabled": False}

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:grant_hand_view")
    async def grant_hand_view(sid, data):
        try:
            viewer_id = data["viewer_id"]
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.grant_hand_view(
                member_id=member_id,
                viewer_id=viewer_id,
            )

            await _broadcast_table_state_update(table_code)

            return {
                "granted": True,
                "viewer_id": viewer_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:revoke_hand_view")
    async def revoke_hand_view(sid, data):
        try:
            viewer_id = data["viewer_id"]
            member_id = session_registry.resolve_member_id(sid)
            table_code = table_service.get_table_code_for_member(member_id)

            table_service.revoke_hand_view(
                member_id=member_id,
                viewer_id=viewer_id,
            )

            await _broadcast_table_state_update(table_code)

            return {
                "revoked": True,
                "viewer_id": viewer_id,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:can_view_hand")
    async def can_view_hand(sid, data):
        try:
            table_code = data["table_code"]
            player_id = data["player_id"]
            viewer_id = data["viewer_id"]

            allowed = table_service.can_view_hand(
                table_code=table_code,
                player_id=player_id,
                viewer_id=viewer_id,
            )

            return {"allowed": allowed}

        except Exception as exc:
            return _error_response(exc)

    # ---------------------------- Listing ---------------------------- #

    @sio.on("table:lookup")
    async def lookup_table(sid, data):
        try:
            table_code = data["table_code"]
            exists = table_service.table_exists(table_code)
            account_member_name = None

            if exists:
                account_id, _ = _resolve_account_identity(data)
                if account_id:
                    account_member_name = (
                        table_service.get_table_member_name_for_account(
                            table_code,
                            account_id,
                        )
                    )

            return {
                "table_code": table_code,
                "exists": exists,
                "joinable": exists,
                "account_member_name": account_member_name,
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:membership")
    async def check_table_membership(sid, data):
        try:
            table_code = data["table_code"]
            member_id = session_registry.get_member_id(sid)

            if member_id is None:
                return {"table_code": table_code, "member": False}

            try:
                member_table_code = table_service.get_table_code_for_member(member_id)
            except ValueError:
                client_session_id = session_registry.resolve_client_session_id(sid)
                session_registry.remove_client_session_member(client_session_id)
                return {"table_code": table_code, "member": False}

            if member_table_code != table_code:
                return {"table_code": table_code, "member": False}

            await sio.enter_room(sid, table_code)
            await sio.enter_room(sid, f"member:{member_id}")

            return {
                "table_code": table_code,
                "member": True,
                "member_id": member_id,
                "table": _get_table_view(table_code),
            }

        except Exception as exc:
            return _error_response(exc)

    @sio.on("table:list")
    async def list_tables(sid):
        tables = table_service.list_tables()
        await sio.emit(
            "table:list_updated",
            {"tables": tables},
            to=sid,
        )


async def emit_table_deleted(sio: AsyncServer, table_code: str) -> None:
    await sio.emit(
        "table:deleted",
        {"table_code": table_code},
        room=table_code,
    )


async def emit_table_updated(sio: AsyncServer, table_code: str, payload: dict) -> None:
    pass
