/**
 * ReactionBar component
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-09-27
 * Version: 5.6
 *
 * Closed: collapses into a circle showing the first emoji.
 * Open: expands into a pill with ✕ + all reactions.
 * Height is inherited from parent; children use h-full + aspect-square.
 * Emoji font size is computed dynamically from parent height (≈70%).
 */

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useReactions } from "game-table/hooks/useReactions";
import { X } from "lucide-react";
import {
  Button,
  Glass,
} from "konsta/react";

type ReactionBarProps = {
    reactions: readonly string[];
  onEmit: (reaction: string) => void;
};

export default function ReactionBar({ reactions, onEmit }: ReactionBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { reactions: ordered, recordUse } = useReactions(reactions);
  const ref = useRef<HTMLDivElement>(null);
  const [emojiSize, setEmojiSize] = useState<number>();

  const handleClick = (reaction: string) => {
    recordUse(reaction);
    onEmit(reaction);
    setOpen(false);
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // ResizeObserver for dynamic emoji size
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    const updateSize = () => {
      const h = el.offsetHeight;
      setEmojiSize(h * 0.7); // 70% of parent height
    };

    const ro = new ResizeObserver(updateSize);
    ro.observe(el);

    updateSize();

    return () => ro.disconnect();
  }, []);

  const emojiStyle = {
    fontSize: emojiSize ? `${emojiSize}px` : undefined,
  };

  return (
    <div
      ref={ref}
      data-reaction-bar
      className="flex h-full items-center overflow-visible"
      style={{ width: open ? "auto" : undefined }}
    >
      {open ? (
        <Glass
          className="flex h-full rounded-full px-2 [--color-ios-hover-highlight:transparent]"
        >
          <Button
            type="button"
            inline
            rounded
            clear
            title={t("table.reaction.close")}
            onClick={() => setOpen(false)}
            className="h-full aspect-square px-0 text-black/45 transition-opacity hover:opacity-70 active:opacity-55 dark:text-white/45"
          >
            <X size={18} strokeWidth={2} />
          </Button>
          {ordered.map((reaction) => (
            <Button
              key={reaction}
              type="button"
              inline
              rounded
              clear
              onClick={() => handleClick(reaction)}
              title={t("table.reaction.send", { reaction })}
              className="h-full aspect-square px-0 transition-opacity hover:opacity-70 active:opacity-55 [--color-ios-hover-highlight:transparent]"
            >
              <span
                style={emojiStyle}
                className="leading-none"
              >
                {reaction}
              </span>
            </Button>
          ))}
        </Glass>
      ) : ordered.length > 0 ? (
        <Glass
          className="h-full rounded-full [--color-ios-hover-highlight:transparent]"
        >
          <Button
            type="button"
            inline
            rounded
            clear
            onClick={() => setOpen(true)}
            title={t("table.reaction.open")}
            className="h-full aspect-square px-0 transition-opacity hover:opacity-70 active:opacity-55 [--color-ios-hover-highlight:transparent]"
          >
            <span
              style={emojiStyle}
              className="leading-none"
            >
              {ordered[0]}
            </span>
          </Button>
        </Glass>
      ) : null}
    </div>
  );
}
