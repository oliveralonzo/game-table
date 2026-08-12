export default function AppLoadingScreen() {
    return (
        <div className="grid min-h-[100svh] place-items-center bg-ios-light-surface px-6 text-center text-black dark:bg-ios-dark-surface dark:text-white">
            <div className="grid gap-4">
                <div className="font-lexend text-3xl font-bold tracking-normal">
                    doble6
                </div>
                <div className="mx-auto h-1.5 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div className="h-full w-1/2 animate-[loading-slide_1.05s_ease-in-out_infinite] rounded-full bg-black dark:bg-white" />
                </div>
            </div>
        </div>
    );
}
