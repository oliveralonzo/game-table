/**
 * useReactions.ts
 * Author: Oliver Alonzo
 * Supported by ChatGPT (GPT-5)
 * Date: 2025-09-14
 *
 * Tracks emoji usage and returns reactions sorted by recency.
 * - Starts with a fixed initial order.
 * - Each time a reaction is used, it moves to the front.
 * - Preserves uniqueness and stability otherwise.
 */

import { useState, useCallback } from "react";

export function useReactions(initial: readonly string[]) {
  const [order, setOrder] = useState<string[]>([...initial]);

  const recordUse = useCallback((reaction: string) => {
    setOrder((prev) => {
      // Move reaction to the front, preserve others
      const filtered = prev.filter((r) => r !== reaction);
      return [reaction, ...filtered];
    });
  }, []);

  return { reactions: order, recordUse };
}
