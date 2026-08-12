import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, List, ListItem } from "konsta/react";
import { generateNickname } from "game-table/utils/nicknameGenerator";
import { backendErrorToJoinKey } from "game-table/i18n/backendErrors";

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
                    className="h-11 rounded-xl bg-ios-light-surface-2 px-3 text-[17px] text-black outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-primary dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                />
            </label>
            {showGenerator ? (
                <Button
                    type="button"
                    clear
                    small
                    rounded
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

