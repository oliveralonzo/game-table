import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, List, ListItem, Navbar } from "konsta/react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import DismissibleNotice from "game-table/components/DismissibleNotice";
import type { FrontendGamePlugin } from "game-table/gamePlugin";

type Props = {
    groupName: string; gamePlugin: FrontendGamePlugin; rules: unknown;
    onRulesChange: (rules: unknown) => void; schedulingRows: ReactNode;
    canEdit: boolean; saving: boolean; canSubmit: boolean;
    error: string | null; onDismissError: () => void; onRetry: () => void; onCancel: () => void;
    onCreate: (event: FormEvent) => void;
};

export default function TournamentCreateSheet(props: Props) {
    const { t } = useTranslation();
    const [editingRules, setEditingRules] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    const formId = useId();
    const SettingsPanel = props.gamePlugin.SettingsPanel;
    useEffect(() => {
        const element = dialog.current;
        const previousFocus = document.activeElement;
        element?.showModal();
        return () => {
            element?.close();
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);
    return createPortal(<dialog ref={dialog} aria-labelledby={headingId}
        onCancel={event => { event.preventDefault(); if (!props.saving) props.onCancel(); }}
        className="m-auto h-[min(90dvh,720px)] w-[calc(100%_-_1rem)] max-w-lg overflow-hidden rounded-3xl border-0 bg-ios-light-surface p-0 text-black backdrop:bg-black/40 dark:bg-ios-dark-surface dark:text-white">
        <div className="flex h-full flex-col">
            <Navbar centerTitle
                title={<span id={headingId}>{t(editingRules ? "groups.tournaments.gameSettings" : "groups.tournaments.new")}</span>}
                left={editingRules ? <Button clear inline rounded type="button" onClick={() => setEditingRules(false)}>
                    <ChevronLeft size={20} />{t("groups.tournaments.back")}</Button>
                    : <Button clear inline rounded type="button" disabled={props.saving} onClick={props.onCancel}>{t("groups.tournaments.cancel")}</Button>}
                right={!editingRules && <Button clear inline rounded type="submit" form={formId}
                    className="font-semibold" disabled={!props.canSubmit || props.saving || !props.canEdit}>{t("groups.tournaments.createShort")}</Button>} />
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5">
                {props.error && <DismissibleNotice onDismiss={props.onDismissError}>{props.error} <Button clear inline type="button" onClick={props.onRetry}>{t("groups.list.retry")}</Button></DismissibleNotice>}
                {editingRules ? <>
                    <p className="mb-4 px-1 text-sm text-black/55 dark:text-white/55">{t("groups.tournaments.rulesNote")}</p>
                    <SettingsPanel value={props.gamePlugin.resolveSettings(props.rules)} onChange={props.onRulesChange}
                    readOnly={props.saving} isFourPlayer seatCount={4} gameOnly collapsible={false} flush showHeading={false}
                    sections={{ profile: false, display: false, language: false }} />
                    </> : props.canEdit ? <form id={formId} onSubmit={props.onCreate}>
                        <List inset nested={false} strong className="!m-0 overflow-hidden">
                            <ListItem titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]"
                                title={t("groups.tournaments.group")} after={props.groupName} />
                        </List>
                        <List inset nested={false} strong className="!mx-0 !my-6 overflow-hidden">{props.schedulingRows}</List>
                        <List inset nested={false} strong className="!m-0 overflow-hidden">
                            <ListItem titleFontSizeIos="text-[17px]" titleFontSizeMaterial="text-[16px]"
                                title={t("groups.tournaments.gameSettings")}
                                contentClassName="w-full text-left" link linkComponent="button" linkProps={{ type: "button" }} onClick={() => setEditingRules(true)} />
                        </List>
                    </form> : <p className="text-black/55 dark:text-white/55">{!props.error && t("groups.tournaments.adminOnly")}</p>}
            </div>
        </div>
    </dialog>, document.body);
}
