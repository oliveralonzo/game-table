import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'konsta/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import PostGameDialog from '../dist/components/PostGameDialog.js';
import SeatsPanel from '../dist/components/SeatsPanel.js';
import { en } from '../dist/i18n/resources/en.js';
import { es } from '../dist/i18n/resources/es.js';
import { ptBR } from '../dist/i18n/resources/pt-BR.js';

const i18n = createInstance();
await i18n.init({ lng: 'es', resources: { en: { translation: en }, es: { translation: es }, 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
function render(component) {
    return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(App, { theme: 'ios' }, component)));
}
function dialog(decision, blocked = true) {
    const transition = { id: 'offer', phase: blocked ? 'winner_checks' : 'seating_ready', seating_blocked: blocked,
        players: { me: { decision, deadline: ['keep_playing', 'team_choice', 'ready', 'partner_choice'].includes(decision) ? Date.now() / 1000 + 20 : null } } };
    return render(React.createElement(PostGameDialog, { transition, selfId: 'me', onRespond() {} }));
}
test('Spanish active prompts use agreed frente and leaving copy with countdowns', () => {
    assert.match(dialog('keep_playing'), /¿Sigues jugando\?/);
    assert.match(dialog('keep_playing'), /Me voy/);
    assert.match(dialog('keep_playing'), /Tu lugar vence en 20 segundos/);
    const choice = dialog('team_choice');
    assert.match(choice, /¿Cambiar de frente\?/);
    assert.match(choice, /Mismo frente/);
    assert.match(choice, /Cambiar de frente/);
    assert.match(choice, /Elige en 20 segundos/);
    assert.doesNotMatch(choice, /pareja|equipo/i);
});
test('waiting, accepted, and departed players have no blocking modal', () => {
    for (const decision of ['waiting','accepted','left','timed_out']) assert.doesNotMatch(dialog(decision), /role="dialog"|k-dialog/);
});
test('each language supplies singular and plural countdown forms', () => {
    for (const language of ['en', 'es', 'pt-BR']) {
        for (const key of ['spotExpires', 'chooseWithin']) {
            const singular = i18n.t(`table.postGame.${key}`, { lng: language, count: 1 });
            const plural = i18n.t(`table.postGame.${key}`, { lng: language, count: 2 });
            assert.ok(singular.includes('1') && plural.includes('2'));
            assert.notEqual(singular.replace('1', ''), plural.replace('2', ''));
        }
    }
});
test('blocked seating removes keyboard and pointer seat actions, including shuffle', () => {
    const html = render(React.createElement(SeatsPanel, { seats: Array.from({ length: 4 }, () => ({ name: null, ready: false })),
        seatCount: 4, playerIndex: null, isHost: true, tableState: 'open', seatingBlocked: true,
        showSeatActions: true, onAssignSeat() {}, onUnassignSeat() {} }));
    assert.equal((html.match(/aria-disabled="true"/g) || []).length, 4);
    assert.doesNotMatch(html, /tabindex="0"/);
    assert.equal((html.match(/<button/g) || []).length, 4);
    assert.doesNotMatch(html, /lucide-shuffle/);
});


test('challenger readiness and player selection use neutral prompts', () => {
    const ready = dialog('ready');
    assert.match(ready, /Te toca. ¿Listo para jugar/);
    assert.match(ready, /Estoy listo/);
    assert.match(ready, /Pasar mi turno/);
    const transition = { id: 'offer', phase: 'partner_selection', seating_blocked: true,
        selection_candidates: ['b', 'd'], players: { me: { decision: 'partner_choice', deadline: Date.now() / 1000 + 20 } } };
    const html = render(React.createElement(PostGameDialog, { transition, selfId: 'me', memberNames: { b: 'Ana', d: 'Luis' }, onRespond() {} }));
    assert.match(html, /¿Con quién quieres jugar/);
    assert.match(html, /Ana/);
    assert.match(html, /Luis/);
    assert.match(html, /Elige en 20 segundos/);
});

test('invited loser sees who chose them to continue', () => {
    const transition = { id: 'offer', phase: 'loser_checks', seating_blocked: true,
        invited_by: { me: 'challenger' }, players: { me: { decision: 'keep_playing', deadline: Date.now() / 1000 + 20 } } };
    const html = render(React.createElement(PostGameDialog, { transition, selfId: 'me', memberNames: { challenger: 'Ana' }, onRespond() {} }));
    assert.match(html, /Ana te eligió para seguir jugando/);
    assert.match(html, /Me voy/);
});


test('People panel reuses avatar rows for pending and confirmed responses', async () => {
    const { default: PeoplePanel } = await import('../dist/components/PeoplePanel.js');
    const person = (id, name, statusLabel) => ({ id, name, statusLabel, isHost: false, hasSeat: false });
    const html = render(React.createElement(PeoplePanel, {
        pendingRoster: [person('a','Ana','Decidiendo…')],
        seatedRoster: [person('l','Luis','Mismo frente')],
        queuedRoster: [person('s','Sofía','Esperando un lugar')],
        viewerRoster: [], seatCount: 4, showSeatLocation: false,
    }));
    for (const text of ['Pendientes','Jugadores','Retando','Ana','Luis','Sofía','Decidiendo…','Mismo frente']) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /k-dialog/);
});
