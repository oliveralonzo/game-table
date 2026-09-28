"""Table availability notifications, separate from lobby presence and chat."""
def discovery_room(group_id):
    return f"group-tables:{group_id}"


async def emit_group_table_availability(sio, tables, group_id):
    await sio.emit("group:table_availability", {
        "group_id": group_id,
        "has_open_tables": tables.has_open_group_tables(group_id),
    }, room=discovery_room(group_id))
