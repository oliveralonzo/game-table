"""
Socket.IO adapter for account workflows.
"""

from socketio import AsyncServer

from game_table.account.account import Account
from game_table.application.account_service import AccountService
from game_table.application.history_service import HistoryService
from game_table.auth.auth_verifier import AuthVerifier
from game_table.api.ws.errors import error_response as _error_response


def register_account_events(
    sio: AsyncServer,
    account_service: AccountService | None,
    history_service: HistoryService | None,
    auth_verifier: AuthVerifier | None,
) -> None:
    def _require_account_dependencies() -> None:
        if account_service is None or auth_verifier is None:
            raise RuntimeError("Accounts are not configured.")

    def _require_history_dependencies() -> None:
        if history_service is None:
            raise RuntimeError("History is not configured.")

    def _verify_payload_token(data):
        _require_account_dependencies()
        token = (data or {}).get("token")
        return auth_verifier.verify_token(token)

    @sio.on("account:me")
    async def account_me(sid, data):
        try:
            identity = _verify_payload_token(data)
            account = account_service.find_by_auth_identity(
                identity.provider,
                identity.subject,
            )

            return {
                "account": account.to_dict() if account else None,
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:username_available")
    async def account_username_available(sid, data):
        try:
            _require_account_dependencies()
            username = (data or {}).get("username", "")

            return {
                "username": Account.clean_username(username),
                "username_key": Account.username_key(username),
                "available": account_service.is_username_available(username),
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:create")
    async def account_create(sid, data):
        try:
            identity = _verify_payload_token(data)
            username = (data or {}).get("username", "")
            account = account_service.create_account(
                auth_provider=identity.provider,
                auth_subject=identity.subject,
                username=username,
            )

            return {
                "account": account.to_dict(),
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:rename_username")
    async def account_rename_username(sid, data):
        try:
            identity = _verify_payload_token(data)
            account = account_service.find_by_auth_identity(
                identity.provider,
                identity.subject,
            )

            if account is None:
                raise ValueError("Account does not exist.")

            renamed = account_service.rename_username(
                account_id=account.id,
                username=(data or {}).get("username", ""),
            )

            return {
                "account": renamed.to_dict(),
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:update_table_nickname")
    async def account_update_table_nickname(sid, data):
        try:
            identity = _verify_payload_token(data)
            account = account_service.find_by_auth_identity(
                identity.provider,
                identity.subject,
            )

            if account is None:
                raise ValueError("Account does not exist.")

            updated = account_service.update_table_nickname(
                account_id=account.id,
                table_nickname=(data or {}).get("table_nickname"),
            )

            return {
                "account": updated.to_dict(),
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:history")
    async def account_history(sid, data):
        try:
            _require_account_dependencies()
            _require_history_dependencies()
            identity = _verify_payload_token(data)
            account = account_service.find_by_auth_identity(
                identity.provider,
                identity.subject,
            )

            if account is None:
                raise ValueError("Account does not exist.")

            entries = history_service.list_history_for_account(account.id)

            return {
                "history": [entry.to_dict() for entry in entries],
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:leaderboard")
    async def account_leaderboard(sid, data):
        try:
            _require_history_dependencies()
            leaderboard_page = history_service.list_leaderboard(
                sort=(data or {}).get("sort", "games_won"),
                page=(data or {}).get("page", 1),
                page_size=(data or {}).get("page_size", 10),
            )

            return {
                "leaderboard": [
                    entry.to_dict()
                    for entry in leaderboard_page["entries"]
                ],
                "page": leaderboard_page["page"],
                "page_size": leaderboard_page["page_size"],
                "has_more": leaderboard_page["has_more"],
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:stats")
    async def account_stats(sid, data):
        try:
            _require_history_dependencies()
            entries = history_service.list_stats_for_accounts(
                (data or {}).get("account_ids", []),
            )
            return {
                "stats": [entry.to_dict() for entry in entries],
            }
        except Exception as exc:
            return _error_response(exc)

    @sio.on("account:delete")
    async def account_delete(sid, data):
        try:
            identity = _verify_payload_token(data)
            account = account_service.find_by_auth_identity(
                identity.provider,
                identity.subject,
            )

            if account is None:
                raise ValueError("Account does not exist.")

            account_service.delete_account(account.id)

            return {
                "deleted": True,
            }
        except Exception as exc:
            return _error_response(exc)
