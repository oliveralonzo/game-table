import { useEffect, useState } from "react";

import type { TableTool } from "game-table/components/TableFrame";
import type { ChatMessage } from "game-table/types/activity";

type UseRoomChatArgs = {
    roomKey?: string | null;
    selfId?: string | null;
    messages: ChatMessage[];
    sendMessage: (message: string) => void;
    activeTool: TableTool | null;
    ignoreSelfAliasForUnread?: boolean;
};

export function useRoomChat({
    roomKey,
    selfId,
    messages,
    sendMessage,
    activeTool,
    ignoreSelfAliasForUnread = true,
}: UseRoomChatArgs) {
    const [chatDraft, setChatDraft] = useState("");
    const [lastViewedChat, setLastViewedChat] = useState<{
        key: string | null;
        ts: number;
    }>({ key: null, ts: 0 });

    const chatViewedStorageKey = roomKey ? `chatViewed:${roomKey}` : null;
    const latestChatTs = messages.reduce(
        (latest, message) => Math.max(latest, message.ts),
        0
    );

    useEffect(() => {
        if (!chatViewedStorageKey) {
            setLastViewedChat({ key: null, ts: 0 });
            return;
        }

        setLastViewedChat({
            key: chatViewedStorageKey,
            ts: Number(localStorage.getItem(chatViewedStorageKey) ?? 0),
        });
    }, [chatViewedStorageKey]);

    useEffect(() => {
        if (!chatViewedStorageKey) return;
        if (activeTool !== "chat") return;

        localStorage.setItem(chatViewedStorageKey, String(latestChatTs));
        setLastViewedChat({ key: chatViewedStorageKey, ts: latestChatTs });
    }, [activeTool, chatViewedStorageKey, latestChatTs]);

    const chatUnreadCount = lastViewedChat.key === chatViewedStorageKey
        ? messages.filter((message) =>
            message.ts > lastViewedChat.ts &&
            message.sender_id !== selfId &&
            (!ignoreSelfAliasForUnread || message.sender_id !== "self")
        ).length
        : 0;

    const handleSendChat = (draft = chatDraft) => {
        const trimmed = draft.trim();
        if (!trimmed) return;

        sendMessage(trimmed);
        setChatDraft("");
    };

    return {
        chatDraft,
        setChatDraft,
        chatUnreadCount,
        handleSendChat,
    };
}
