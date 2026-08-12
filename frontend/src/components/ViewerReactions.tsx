/**
 * ViewerReactions component
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2026-01-14
 * Version: 1.0
 *
 * Renders ephemeral reactions sent by viewers (non-players).
 */

import type {
    ReactionEvent,
    ViewerReactionView,
} from "game-table/types/activity";
import { REACTION_DURATION_MS } from "game-table/constants/activity";
import InitialsAvatar from "game-table/components/InitialsAvatar";
import { DEFAULT_PLAYER_AVATAR_CLASS } from "game-table/styles/playerAvatar";

type ViewerReactionsProps = {
    reactions: ViewerReactionView[];
    onRemoveReaction: (reaction: ReactionEvent) => void;
};

export default function ViewerReactions({ 
    reactions,
}: ViewerReactionsProps) {
    function getReactionStyle(reaction: ViewerReactionView, index: number): React.CSSProperties {
        const duration = reaction.duration_ms ?? REACTION_DURATION_MS;

        return {
            "--reaction-enter-ms": `${duration * 0.9}ms`,
            "--reaction-exit-ms": `${duration * 0.1}ms`,
            transform: `translateY(-${index * 16}px)`,
        } as React.CSSProperties;
    }

    return (
        <div className="pointer-events-none absolute bottom-20 left-4 z-0 flex flex-col gap-2">
            {reactions.map((r, i) => (
                <div
                    key={r.id ?? `${r.sender_id}-${r.ts}-${r.value}`}
                    className="animate-viewer-reaction"
                    style={getReactionStyle(r, i)}
                >
                    <div className="text-4xl leading-none text-center">{r.value}</div>
                    <div className="mt-1 inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-medium text-black shadow-sm ring-1 ring-black/10 dark:bg-black dark:text-white dark:ring-white/15">
                        <InitialsAvatar
                            name={r.name}
                            label={r.initialLabel}
                            className={DEFAULT_PLAYER_AVATAR_CLASS}
                            spacingClassName="mr-1.5"
                        />
                        <span className="max-w-32 truncate">{r.name}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
