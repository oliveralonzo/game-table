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

export function tableInviteUrl(origin: string, code: string): string {
    return `${origin}${encodeTableCodePath(code)}`;
}
