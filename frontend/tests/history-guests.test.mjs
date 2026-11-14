import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { HistoryParticipantCell } from '../dist/components/HistoryCells.js';

async function render(participants, language = 'en') {
    const i18n = i18next.createInstance();
    const label = language === 'es' ? 'Invitado' : 'Guest';
    await i18n.init({ lng: language, resources: { [language]: { translation: { account: { history: { forfeit: 'Forfeit' } } } } } });
    return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
        React.createElement(HistoryParticipantCell, { participants, fallback: label, guestLabel: label })));
}

test('saved names distinguish members and guests without implying an account for signed-out players', async () => {
    const html = await render([
        { username: 'oliver', account_id: 'a', display_name: 'Oliver at play', is_guest: false },
        { username: 'JonathanPrez', account_id: 'b', display_name: 'Jonathan', is_guest: true },
        { username: null, account_id: null, display_name: 'El Chepe', is_guest: true },
    ]);
    assert.ok(html.includes('Oliver at play, Jonathan (Guest), El Chepe (Guest)'));
    assert.ok(!html.includes('@El Chepe'));
});

test('Spanish and legacy history use Invitado and retain forfeits', async () => {
    const html = await render([
        { username: 'JonathanPrez', is_guest: true },
        { username: null, is_guest: true },
        { username: null, forfeited: true },
    ], 'es');
    assert.ok(html.includes('@JonathanPrez (Invitado), Invitado, Forfeit'));
});
