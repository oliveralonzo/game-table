import { ListItem } from "konsta/react";
import { Check } from "lucide-react";

type Props = {
    title: string;
    type: "radio" | "checkbox";
    name?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
};

/** Native selection semantics with the trailing checkmark used by iOS lists. */
export default function SettingsSelectionItem({
    title, type, name, checked, disabled = false, onChange,
}: Props) {
    return (
        <ListItem
            label
            title={title}
            after={(
                <span className="relative flex h-6 w-6 items-center justify-center">
                    <input
                        className="peer sr-only"
                        type={type}
                        name={name}
                        aria-label={title}
                        checked={checked}
                        disabled={disabled}
                        onChange={onChange}
                    />
                    <span className="flex h-6 w-6 items-center justify-center rounded text-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                        <Check size={19} aria-hidden="true" className={checked ? "" : "invisible"} />
                    </span>
                </span>
            )}
            strongTitle={false}
            titleFontSizeIos="text-[17px]"
            className={disabled ? "opacity-45" : "cursor-pointer"}
        />
    );
}
