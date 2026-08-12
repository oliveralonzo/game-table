import { type Dispatch, type SetStateAction, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "konsta/react";

import { MAX_CHAT_MESSAGE_LENGTH } from "game-table/constants/activity";
import type { ChatMessage } from "game-table/types/activity";

type Props = {
    messages: ChatMessage[];
    selfId?: string | null;
    displayName: string;
    memberNamesById: Record<string, string>;
    chatDraft: string;
    setChatDraft: Dispatch<SetStateAction<string>>;
    onSendChat: (draft?: string) => void;
};

export default function Chat({
    messages,
    selfId,
    displayName,
    memberNamesById,
    chatDraft,
    setChatDraft,
    onSendChat,
}: Props) {
    const { t } = useTranslation();
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const previousMessageIdsRef = useRef(new Set(messages.map((message) => message.client_message_id)));
    const isAtBottomRef = useRef(true);
    const [newMessageCount, setNewMessageCount] = useState(0);

    const scrollToBottom = () => {
        const messageList = messagesRef.current;
        if (!messageList) return;

        messageList.scrollTop = messageList.scrollHeight;
        isAtBottomRef.current = true;
        setNewMessageCount(0);
    };

    useLayoutEffect(() => {
        scrollToBottom();
    }, []);

    useLayoutEffect(() => {
        const previousMessageIds = previousMessageIdsRef.current;
        const addedMessages = messages.filter(
            (message) => !previousMessageIds.has(message.client_message_id),
        );
        previousMessageIdsRef.current = new Set(
            messages.map((message) => message.client_message_id),
        );

        if (addedMessages.length === 0) return;

        const hasSelfMessage = addedMessages.some(
            (message) => message.sender_id === selfId || message.sender_id === "self",
        );
        if (hasSelfMessage || isAtBottomRef.current) {
            scrollToBottom();
            return;
        }

        const incomingCount = addedMessages.filter(
            (message) => message.sender_id !== selfId && message.sender_id !== "self",
        ).length;
        setNewMessageCount((count) => count + incomingCount);
    }, [messages, selfId]);

    useLayoutEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;

        composer.style.height = "auto";
        composer.style.height = `${Math.min(composer.scrollHeight, 120)}px`;
    }, [chatDraft]);

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <h2 className="mb-2 px-safe-4 text-[22px] font-bold leading-tight tracking-normal text-black dark:text-white">
                {t("table.tool.chat")}
            </h2>
            <div className="relative min-h-0 flex-1">
                <div
                    ref={messagesRef}
                    onScroll={(event) => {
                        const messageList = event.currentTarget;
                        const isAtBottom = messageList.scrollHeight
                            - messageList.scrollTop
                            - messageList.clientHeight < 24;
                        isAtBottomRef.current = isAtBottom;
                        if (isAtBottom) setNewMessageCount(0);
                    }}
                    className="h-full space-y-2 overflow-y-auto px-safe-4 pb-3"
                >
                    {messages.map((message) => {
                        const isSelf = message.sender_id === selfId || message.sender_id === "self";

                        return (
                            <div
                                key={message.client_message_id}
                                className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
                            >
                                <div className={[
                                    "max-w-[85%] rounded-2xl bg-ios-light-surface-2 px-3 py-2 text-sm text-black dark:bg-ios-dark-surface-2 dark:text-white",
                                    message.status === "pending" ? "animate-pulse" : "",
                                ].join(" ")}>
                                    <div className="text-xs text-black/45 dark:text-white/45">
                                        {memberNamesById[message.sender_id] ?? (isSelf ? displayName : "Unknown")}
                                    </div>
                                    <div className="break-words">
                                        {message.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {newMessageCount > 0 && (
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-lg"
                    >
                        {newMessageCount} new {newMessageCount === 1 ? "message" : "messages"}
                    </button>
                )}
            </div>
            <form
                className="flex shrink-0 items-end gap-2 px-safe-4 pt-1"
                onSubmit={(event) => {
                    event.preventDefault();
                    onSendChat(composerRef.current?.value);
                }}
            >
                <div className="relative min-w-0 flex-1">
                    <textarea
                        ref={composerRef}
                        rows={1}
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                onSendChat(event.currentTarget.value);
                            }
                        }}
                        maxLength={MAX_CHAT_MESSAGE_LENGTH}
                        className="block min-h-10 max-h-[120px] w-full resize-none overflow-y-auto rounded-2xl bg-ios-light-surface-2 py-[9px] pl-3 pr-12 text-[15px] leading-[22px] text-black outline-none ring-1 ring-black/10 dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                        placeholder="Message"
                    />
                    <span
                        className="pointer-events-none absolute bottom-[11px] right-3 text-[11px] tabular-nums text-black/35 dark:text-white/35"
                        aria-hidden="true"
                    >
                        {MAX_CHAT_MESSAGE_LENGTH - chatDraft.length}
                    </span>
                </div>
                <Button
                    type="submit"
                    inline
                    rounded
                    disabled={!chatDraft.trim()}
                    aria-label="Send message"
                    className="h-10 w-10 shrink-0 touch-manipulation p-0"
                >
                    <Send size={18} strokeWidth={2} />
                </Button>
            </form>
        </section>
    );
}
