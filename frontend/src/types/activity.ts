// src/types/activity.ts

export type ReactionEvent = {
    id?: string;
    sender_id: string;
    value: string;
    ts: number;
    duration_ms?: number;
    expired?: boolean;
};

export type ViewerReactionView = ReactionEvent & {
    name: string;
    initialLabel?: string;
};

export type ChatMessageStatus = "pending" | "sent" | "failed";

export type ChatMessage = {
    client_message_id: string;
    sender_id: string;
    text: string;
    ts: number;
    status: ChatMessageStatus;
};
