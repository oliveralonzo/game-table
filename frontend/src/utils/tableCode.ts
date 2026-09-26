export function generateCode(): string {
    const CONSONANTS = "BCDFGJKLMNPRSTV";
    const VOWELS = "AEIU";

    const rnd = (n: number) => {
        try {
            const a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return a[0] % n;
        } catch {
            return Math.floor(Math.random() * n);
        }
    };

    const pick = (s: string) => s.charAt(rnd(s.length));

    const letters =
        pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS);

    let digits = "";
    for (let i = 0; i < 4; i++) digits += String(rnd(10));

    return `${letters}-${digits}`;
}
