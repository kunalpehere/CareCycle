import test from 'node:test';
import assert from 'node:assert/strict';
import { ngoNextAction, positivePage } from '../src/services/ngoWorkspaceService.js';
import { discoveryContext } from '../src/controllers/discoveryController.js';

test('NGO next steps distinguish handover acknowledgement, corrections and pickup counterparties', () => {
    const action = values => ngoNextAction({ quantity: 2, status: 'accepted', ...values }, 'ngo');
    assert.equal(action({}), 'Arrange pickup');
    assert.match(action({ status: 'pending' }), /Waiting for donor decision/);
    assert.match(action({ pickup: { status: 'proposed', proposal: { proposedBy: 'donor' } } }), /Confirm donor/);
    assert.match(action({ pickup: { status: 'proposed', proposal: { proposedBy: 'ngo' } } }), /Waiting for donor/);
    assert.match(action({ pickup: { status: 'confirmed' } }), /confirmed pickup/);
    assert.match(action({ handedOverQuantity: 1 }), /older handover/);
    const transfer = { quantity: 1, status: 'awaiting_acknowledgement' };
    assert.match(action({ handedOverQuantity: 1, fulfillment: { transfers: [transfer] } }), /Acknowledge handover/);
    for (const resolution of [null, { quantity: 1 }]) assert.match(action({ handedOverQuantity: 1, fulfillment: { transfers: [{ ...transfer, status: 'disputed', resolution }] } }), resolution ? /Review donor correction/ : /Waiting for donor discrepancy/);
    const acknowledged = { handedOverQuantity: 1, acknowledgedQuantity: 1, fulfillment: { transfers: [{ quantity: 1, status: 'acknowledged' }] } };
    assert.equal(action(acknowledged), 'Arrange remaining pickup');
    for (const actor of ['ngo', 'donor']) assert.match(action({ ...acknowledged, fulfillment: { ...acknowledged.fulfillment, remainderProposal: { actor } } }), actor === 'ngo' ? /Waiting for donor/ : /Review remaining/);
    assert.match(action({ pickup: { status: 'missed' } }), /Review missed pickup/);
    assert.match(action({ status: 'cancelled' }), /cancellation history/);
    assert.match(action({ status: 'completed' }), /older handover evidence/);
    assert.equal(action({ quantity: 2, releasedQuantity: 2, status: 'completed', fulfillment: { transfers: [], completedAt: new Date() } }), 'Review completed collection history');
});

test('navigation context permits only normalized local filters and strict page numbers', () => {
    const context = new URLSearchParams(discoveryContext({ equipment: 'walker', condition: 'good', location: ' Pune & Nashik ', page: '2', returnTo: 'https://example.invalid' }));
    assert.equal(context.get('location'), 'Pune & Nashik'); assert.equal(context.get('page'), '2'); assert.equal(context.has('returnTo'), false);
    const invalid = new URLSearchParams(discoveryContext({ equipment: { $ne: '' }, location: ['unsafe'], page: '2junk' }));
    assert.equal(invalid.get('page'), '1'); assert.equal(invalid.has('equipment'), false); assert.equal(invalid.has('location'), false);
    for (const value of ['0', '-1', '1.5', {}, '999999999']) assert.equal(positivePage(value), 1);
});
