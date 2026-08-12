import { getNameInitials } from "game-table/utils/playerInitialLabels";

type Props = {
    name?: string | null;
    label?: string;
    className?: string;
    spacingClassName?: string;
};

export default function InitialsAvatar({
    name,
    label,
    className = "bg-black text-white ring-black/15 dark:bg-white dark:text-black dark:ring-white/25",
    spacingClassName = "ml-1",
}: Props) {
    return (
        <span className={`${spacingClassName} grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-medium leading-none ring-1 ${className}`}>
            {label ?? getNameInitials(name, "?")}
        </span>
    );
}
