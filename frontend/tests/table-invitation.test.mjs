import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableInviteUrl, routeInvitation } from '../dist/utils/tableRoute.js';
import { generateCode } from '../dist/utils/tableCode.js';

test('compact localized invitation URLs preserve numeric leading zeros', () => {
    assert.equal(tableInviteUrl('https://example.com', '001234', '0047', { key: 'grupo', value: 'Viernes de Dominó' }), 'https://example.com/001234?i=0047&grupo=viernes-de-domino');
    assert.equal(tableInviteUrl('https://example.com', '123456', '8047', { key: 'host', value: '@Oliver' }), 'https://example.com/123456?i=8047&host=oliver');
    assert.equal(tableInviteUrl('https://example.com', 'BABA-1234'), 'https://example.com/BABA-1234');
    assert.match(generateCode(), /^\d{6}$/);
});

test('URL tokens bind to their table and descriptive parameters have no transport role', () => {
    global.window = { location: { pathname: '/001234', search: '?i=0047&group=friday-dominoes' } };
    assert.deepEqual(routeInvitation('001234'), { invite_token: '0047' });
    assert.deepEqual(routeInvitation('654321'), {});
    window.location.pathname = '/%30%30%31%32%33%34/';
    assert.deepEqual(routeInvitation('001234'), { invite_token: '0047' });
    window.location.search = '?host=oliver';
    assert.deepEqual(routeInvitation('001234'), {});
    window.location.search = '?i=';
    assert.deepEqual(routeInvitation('001234'), { invite_token: '' });
    delete global.window;
});
