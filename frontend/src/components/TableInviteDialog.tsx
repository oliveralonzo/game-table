import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogButton } from "konsta/react";

type Props = {
    fallbackInviteUrl?: string | null;
    onCloseInviteFallback?: () => void;
};

export default function TableInviteDialog({ fallbackInviteUrl, onCloseInviteFallback }: Props) {
    const { t } = useTranslation();
    const fallbackInviteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fallbackInviteText = fallbackInviteUrl
        ? `${t("table.dialog.inviteShareText")}\n${fallbackInviteUrl}`
        : "";
    const [editableFallbackInviteText, setEditableFallbackInviteText] = useState(fallbackInviteText);

    useEffect(() => {
        setEditableFallbackInviteText(fallbackInviteText);
    }, [fallbackInviteText]);
    const closeFallbackInviteDialog = () => {
        fallbackInviteTextareaRef.current?.blur();
        onCloseInviteFallback?.();
    };

    return (
        <Dialog
            opened={!!fallbackInviteUrl}
            title={t("table.dialog.inviteLink")}
            content={(
                <div className="space-y-3 text-left">
                    <p className="text-sm text-black/70 dark:text-white/70">
                        {t("table.dialog.inviteCopyInstruction")}
                    </p>
                    <textarea
                        ref={fallbackInviteTextareaRef}
                        rows={3}
                        value={editableFallbackInviteText}
                        onChange={(event) => setEditableFallbackInviteText(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.select();
                            }
                        }}
                        className="w-full resize-none rounded-xl bg-ios-light-surface-2 px-3 py-2 text-[16px] leading-snug text-black outline-none ring-1 ring-black/10 dark:bg-ios-dark-surface-2 dark:text-white dark:ring-white/15"
                    />
                </div>
            )}
            buttons={(
                <DialogButton strong onClick={closeFallbackInviteDialog}>
                    {t("table.action.done")}
                </DialogButton>
            )}
            onBackdropClick={closeFallbackInviteDialog}
        />
    );
}
