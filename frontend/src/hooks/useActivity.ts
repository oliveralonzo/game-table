// src/hooks/useActivity.ts

import { useCallback, useEffect, useState } from "react";

import { useTableSocket } from "game-table/context/TableSocket";
import { REACTION_DURATION_MS } from "game-table/constants/activity";
import type { ChatMessage, ReactionEvent } from "game-table/types/activity";
import { createClientId } from "game-table/utils/clientId";

type ServerChatMessage = Omit<ChatMessage, "status">;
type SocketAck = {
    ok?: boolean;
} | null | undefined;

export function useActivity(
    roundKey?: string | number,
    tableCode?: string,
    selfMemberId?: string | null,
) {
    const tableSocket = useTableSocket();

    const [reactionsBySender, setReactionsBySender] = useState<
        Record<string, ReactionEvent>
    >({});
    const [reactions, setReactions] = useState<ReactionEvent[]>([]);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    
    const chatStorageKey = tableCode
        ? `chat:${tableCode}`
        : null;

    useEffect(() => {
        if (!chatStorageKey) return;

        const raw = sessionStorage.getItem(chatStorageKey);

        if (!raw) {
            setMessages([]);
            return;
        }

        try {
            setMessages(JSON.parse(raw));
        } catch {
            sessionStorage.removeItem(chatStorageKey);
            setMessages([]);
        }
    }, [chatStorageKey]);

    const persistMessages = useCallback((next: ChatMessage[]) => {
        if (!chatStorageKey) return;
        sessionStorage.setItem(chatStorageKey, JSON.stringify(next));
    }, [chatStorageKey]);

    useEffect(() => {
        const handleReaction = (reaction: ReactionEvent) => {
            const timedReaction: ReactionEvent = {
                ...reaction,
                id: `${reaction.sender_id}-${reaction.ts}-${reaction.value}-${createClientId()}`,
                duration_ms: REACTION_DURATION_MS,
            };

            setReactions(prev => [...prev, timedReaction]);
            setReactionsBySender(prev => ({
                ...prev,
                [timedReaction.sender_id]: timedReaction,
            }));

            const delay = Math.max(
                0,
                timedReaction.ts +
                (timedReaction.duration_ms ?? REACTION_DURATION_MS) -
                Date.now()
            );

            window.setTimeout(() => {
                setReactions(prev => prev.filter(item => item.id !== timedReaction.id));
                setReactionsBySender(prev => {
                    const current = prev[timedReaction.sender_id];

                    // Ignore if a newer reaction has replaced this one.
                    if (!current || current.ts !== timedReaction.ts) {
                        return prev;
                    }

                    const next = { ...prev };
                    delete next[timedReaction.sender_id];
                    return next;
                });
            }, delay);
        };

        const handleChatMessage = (message: ServerChatMessage) => {
            const sentMessage: ChatMessage = {
                ...message,
                status: "sent",
            };

            setMessages(prev => {
                const existing = prev.find(
                    m => m.client_message_id === message.client_message_id
                );

                const next = existing
                    ? prev.map(m =>
                        m.client_message_id === message.client_message_id
                            ? sentMessage 
                            : m
                    )
                    : [...prev, sentMessage ];

                persistMessages(next);
                return next;
            });
        };

        tableSocket.on("activity:reaction", handleReaction);
        tableSocket.on("activity:chat_message", handleChatMessage);

        return () => {
            tableSocket.off("activity:reaction", handleReaction);
            tableSocket.off("activity:chat_message", handleChatMessage);
        };
    }, [tableSocket, persistMessages]);

    useEffect(() => {
        setReactions([]);
        setReactionsBySender({});
    }, [roundKey]);


    function emitReaction(reaction: string) {
        tableSocket.emit("activity:reaction", { reaction });
    }

    function sendMessage(text: string) {
        const trimmed = text.trim();
        if (!trimmed) return;

        const client_message_id = createClientId();

        const pending: ChatMessage = {
            client_message_id,
            sender_id: selfMemberId ?? "self",
            text: trimmed,
            ts: Date.now(),
            status: "pending",
        };

        setMessages(prev => {
            const next = [...prev, pending];
            persistMessages(next);
            return next;
        });

        window.setTimeout(() => {
            setMessages(prev => {
                const next = prev.map(m =>
                    m.client_message_id === client_message_id &&
                        m.status === "pending"
                        ? { ...m, status: "failed" as const }
                        : m
                );

                persistMessages(next);
                return next;
            });
        }, 5000);

        tableSocket.emit(
            "activity:chat_message",
            { text: trimmed, client_message_id },
            (response: SocketAck) => {
                if (response?.ok) return;

                setMessages(prev => {
                    const next = prev.map(m =>
                        m.client_message_id === client_message_id &&
                            m.status === "pending"
                            ? { ...m, status: "failed" as const }
                            : m
                    );

                    persistMessages(next);
                    return next;
                });
            }
        );
    }

    function removeReaction(reaction: ReactionEvent) {
        setReactions(prev => prev.filter(item => (
            reaction.id
                ? item.id !== reaction.id
                : !(item.sender_id === reaction.sender_id && item.ts === reaction.ts && item.value === reaction.value)
        )));
        setReactionsBySender(prev => {
            const current = prev[reaction.sender_id];

            if (!current || current.ts !== reaction.ts) {
                return prev;
            }

            const next = { ...prev };
            delete next[reaction.sender_id];
            return next;
        });
    }

    return {
        reactions,
        reactionsBySender,
        emitReaction,
        removeReaction,
        messages,
        sendMessage,
    };
}
