/** Parse Spanish day/month/year entry without accepting rolled-over dates. */
export function parseSpanishTournamentDate(value: string): string {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return "";
    const [, day, month, year] = match;
    const parsed = new Date(`${year}-${month}-${day}T12:00:00`);
    return Number(year) >= 1000 && parsed.getFullYear() === Number(year)
        && parsed.getMonth() + 1 === Number(month) && parsed.getDate() === Number(day)
        ? `${year}-${month}-${day}` : "";
}

export function formatSpanishTournamentDate(value: string): string {
    return value ? value.split("-").reverse().join("/") : "";
}
