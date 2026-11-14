import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBadgeOptions, getOrderedBadgeOptions, getNameInitials, buildInitialLabelsById } from '../dist/utils/playerInitialLabels.js';

test('badge options keep the first word and at most two characters', () => {
    assert.deepEqual(getBadgeOptions('El Papa de Chepe'), ['E','EP','ED','EC']);
    assert.deepEqual(getBadgeOptions('Ana Ana Alba'), ['A','AA']);
    assert.equal(getNameInitials('El Papa de Chepe'), 'EP');
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
        '3':{label:'EG',isDuplicate:false},
    });
});

test('duplicate suffixes never collide with another chosen badge', () => {
    const labels = Object.values(buildInitialLabelsById([
        {id:'1',name:'El Papa',badge_label:'E'}, {id:'2',name:'El Chepe',badge_label:'E'},
        {id:'3',name:'El 1',badge_label:'E1'},
    ])).map(item => item.label);
    assert.deepEqual(labels, ['E2','E3','E1']);
});

test('defaults use the first two words, while explicit single-letter choices are preserved', () => {
    assert.equal(getNameInitials('  El  Papa de Chepe '), 'EP');
    assert.equal(getNameInitials('Chepe'), 'C');
    assert.equal(getNameInitials(''), '');
    assert.deepEqual(buildInitialLabelsById([{id:'1',name:'El Papa',badge_label:'E'}]), {
        '1': {label:'E',isDuplicate:false},
    });
});
test('selected choice comes first and the remaining choices are alphabetical', () => {
    assert.deepEqual(getOrderedBadgeOptions('El Papa de Chepe', 'ED'), ['ED','E','EC','EP']);
    assert.deepEqual(getOrderedBadgeOptions('El Papa de Chepe'), ['EP','E','EC','ED']);
    assert.deepEqual(getOrderedBadgeOptions('El Papa de Chepe', 'E'), ['E','EC','ED','EP']);
    assert.deepEqual(getOrderedBadgeOptions('Chepe'), ['C']);
    assert.deepEqual(getOrderedBadgeOptions(''), []);
});
