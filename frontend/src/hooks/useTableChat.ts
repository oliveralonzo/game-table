import { useRoomChat } from "./useRoomChat";

export function useTableChat({ tableCode, ...args }: Omit<Parameters<typeof useRoomChat>[0], "roomKey"> & { tableCode?: string | null }) {
    return useRoomChat({ ...args, roomKey: tableCode });
}
