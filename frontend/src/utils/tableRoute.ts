export function normalizeTableCode(code: string | null | undefined): string {
    return (code ?? "").trim().toUpperCase();
}

function replaceInvalidSurrogates(value: string): string {
    let output = "";

    for (let index = 0; index < value.length; index += 1) {
        const codeUnit = value.charCodeAt(index);
        const isHighSurrogate = codeUnit >= 0xd800 && codeUnit <= 0xdbff;
        const isLowSurrogate = codeUnit >= 0xdc00 && codeUnit <= 0xdfff;

        if (isHighSurrogate) {
            const nextCodeUnit = value.charCodeAt(index + 1);
            const hasPair = nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff;

            if (hasPair) {
                output += value[index] + value[index + 1];
                index += 1;
            } else {
                output += "\uFFFD";
            }
            continue;
        }

        output += isLowSurrogate ? "\uFFFD" : value[index];
    }

    return output;
}

export function encodeTableCodePath(code: string): string {
    return `/${encodeURIComponent(replaceInvalidSurrogates(normalizeTableCode(code)))}`;
}

export function invitationLabel(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

export function tableInviteUrl(origin: string, code: string, token?: string | null,
    context?: { key: string; value: string }): string {
    const params = new URLSearchParams();
    if (token != null) params.set("i", token);
    if (context) params.set(context.key, invitationLabel(context.value));
    const query = params.toString();
    return `${origin}${encodeTableCodePath(code)}${query ? `?${query}` : ""}`;
}

// Only attach an invitation token to requests for the table in that URL.
export function routeInvitation(code: string): { invite_token?: string } {
    const params = new URLSearchParams(window.location.search);
    let routeCode: string;
    try {
        routeCode = decodeURIComponent(window.location.pathname.replace(/^\/|\/$/g, ""));
    } catch { return {}; }
    if (normalizeTableCode(routeCode) !== normalizeTableCode(code) || !params.has("i")) return {};
    return { invite_token: params.get("i") ?? "" };
}
