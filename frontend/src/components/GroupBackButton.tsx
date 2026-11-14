import type { ReactNode } from "react";
import { Button } from "konsta/react";
import { ArrowLeft } from "lucide-react";

export default function GroupBackButton({ onClick, children }: {
    onClick: () => void;
    children: ReactNode;
}) {
    return <Button clear inline rounded onClick={onClick} className="mb-3 h-11 !px-1">
        <ArrowLeft size={18} className="mr-1" aria-hidden="true" />{children}
    </Button>;
}
