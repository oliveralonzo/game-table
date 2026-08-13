import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, List, ListItem } from "konsta/react";
import { generateNickname } from "game-table/utils/nicknameGenerator";
import { backendErrorToJoinKey } from "game-table/i18n/backendErrors";
import { getNameInitials } from "game-table/utils/playerInitialLabels";

export type NicknameChangeHandler = (
    name: string,
    onSuccess?: () => void,
    onError?: (message: string, code?: string) => void,
) => void;

type Props = {
    value: string;
    onDraftChange?: (name: string) => void;
    onChange: NicknameChangeHandler;
    showGenerator?: boolean;
    compact?: boolean;
};

export default function NicknameSettings({
    value,
    onDraftChange,
    onChange,
    showGenerator = false,
    compact = false,
}: Props) {
    const { t, i18n } = useTranslation();
    const [draft, setDraft] = useState(value);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => setDraft(value), [value]);

    const save = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError(t("table.status.nameRequired"));
            return;
        }
        if (trimmed === value) return;

        onChange(
            trimmed,
            () => setError(null),
            (message, code) => setError(t(backendErrorToJoinKey(code, message))),
        );
    };

    const content = (
        <div className="grid gap-2 p-3">
            <label className="grid gap-1.5">
                <span className="text-xs font-medium text-black/45 dark:text-white/45">
                    {t("table.label.displayName")}
                </span>
                <span className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-sm font-medium tabular-nums text-black ring-1 ring-inset ring-[#A97142] dark:bg-white dark:text-black dark:ring-[#A97142]"
                    >
                        {getNameInitials(draft)}
                    </span>
                    <span className={`grid min-w-0 gap-2 ${showGenerator ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1"}`}>
                        <input
                            value={draft}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                onDraftChange?.(event.target.value);
                            }}
                            onBlur={() => save(draft)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                            }}
                            className="h-11 min-w-0 rounded-2xl bg-ios-light-surface-2 px-4 text-[17px] text-black outline-none ring-1 ring-inset ring-black/10 transition focus:ring-2 focus:ring-primary dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                        />
                        {showGenerator ? (
                            <Button
                                type="button"
                                tonal
                                rounded
                                title={t("table.action.generateName")}
                                className="h-11 min-w-24 px-3 font-semibold"
                                onClick={() => {
                                    const generated = generateNickname(i18n.language);
                                    setDraft(generated);
                                    onDraftChange?.(generated);
                                    save(generated);
                                }}
                            >
                                {t("table.action.generateName")}
                            </Button>
                        ) : null}
                    </span>
                </span>
            </label>
            {error ? <span className="text-xs text-red-500">{error}</span> : null}
        </div>
    );

    if (compact) return content;

    return (
        <List inset nested={false} outline strong className="m-0 overflow-hidden">
            <ListItem title={content} strongTitle={false} />
        </List>
    );
}
