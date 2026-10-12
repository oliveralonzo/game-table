import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBadgeOptions, getNameInitials, buildInitialLabelsById } from '../dist/utils/playerInitialLabels.js';

test('badge options keep the first word and at most two characters', () => {
    assert.deepEqual(getBadgeOptions('El Papa de Chepe'), ['E','EP','ED','EC']);
    assert.deepEqual(getBadgeOptions('Ana Ana Alba'), ['A','AA']);
    assert.equal(getNameInitials('El Papa de Chepe'), 'E');
    assert.deepEqual(getBadgeOptions(''), []);
});
test('chosen badges and automatic duplicate numbers are consistent', () => {
    assert.deepEqual(buildInitialLabelsById([
        {id:'1',name:'El Papa de Chepe',badge_label:'EC'},
        {id:'2',name:'El Chepe',badge_label:'EC'},
        {id:'3',name:'El Gato',badge_label:'PC'},
    ]), {
        '1':{label:'EC1',isDuplicate:true},
        '2':{label:'EC2',isDuplicate:true},
        '3':{label:'E',isDuplicate:false},
    });
});

test('duplicate suffixes never collide with another chosen badge', () => {
    const labels = Object.values(buildInitialLabelsById([
        {id:'1',name:'El Papa'}, {id:'2',name:'El Chepe'},
        {id:'3',name:'El 1',badge_label:'E1'},
    ])).map(item => item.label);
    assert.deepEqual(labels, ['E2','E3','E1']);
});
