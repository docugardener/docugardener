"use client";

import { useEffect } from "react";

type KeyCombo = string;

export function useHotkeys(keyMap: Record<KeyCombo, () => void>) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger if user is typing in an input
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                (event.target as HTMLElement).isContentEditable
            ) {
                return;
            }

            const key = event.key.toLowerCase();
            const ctrl = event.ctrlKey || event.metaKey;
            const shift = event.shiftKey;

            let combo = "";
            if (ctrl) combo += "ctrl+";
            if (shift) combo += "shift+";
            combo += key;

            // Also check for raw key
            if (keyMap[key]) {
                keyMap[key]();
            } else if (keyMap[combo]) {
                keyMap[combo]();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [keyMap]);
}
