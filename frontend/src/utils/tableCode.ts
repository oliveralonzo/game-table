export function generateCode(): string {
    const rnd = (n: number) => {
        try {
            const a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return a[0] % n;
        } catch {
            return Math.floor(Math.random() * n);
        }
    };

    return Array.from({ length: 6 }, () => String(rnd(10))).join("");
}
