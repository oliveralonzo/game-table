import { Button } from "konsta/react";
import { Share } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function InviteButton({ onInvite, inviteCopied, fullWidth = false }: {
    onInvite: () => void;
    inviteCopied: boolean;
    fullWidth?: boolean;
}) {
    const { t } = useTranslation();
    return (
        <Button
            type="button"
            inline={!fullWidth}
            clear
            rounded
            onClick={onInvite}
            className={fullWidth ? "h-10 w-full px-3 font-semibold" : "h-10 px-4 font-semibold"}
        >
            <span className="inline-flex items-center gap-2">
                <Share size={18} strokeWidth={2.2} aria-hidden="true" />
                {inviteCopied ? t("table.action.copied") : t("table.action.invite")}
            </span>
        </Button>
    );
}
