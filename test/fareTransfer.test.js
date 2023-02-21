/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

'use strict';
const sinon = require('sinon');
const chai = require('chai');
const sinonChai = require('sinon-chai');
const expect = chai.expect;

const { Context } = require('fabric-contract-api');
const { ChaincodeStub } = require('fabric-shim');

const FareTransfer = require('../lib/fareTransfer.js');

let assert = sinon.assert;
chai.use(sinonChai);

describe('Fare Transfer Basic Tests', () => {
    let transactionContext, chaincodeStub, customer;
    beforeEach(() => {
        transactionContext = new Context();

        chaincodeStub = sinon.createStubInstance(ChaincodeStub);
        transactionContext.setChaincodeStub(chaincodeStub);

        chaincodeStub.putState.callsFake((key, value) => {
            if (!chaincodeStub.states) {
                chaincodeStub.states = {};
            }
            chaincodeStub.states[key] = value;
        });

        chaincodeStub.getState.callsFake(async (key) => {
            let ret;
            if (chaincodeStub.states) {
                ret = chaincodeStub.states[key];
            }
            return Promise.resolve(ret);
        });

        chaincodeStub.deleteState.callsFake(async (key) => {
            if (chaincodeStub.states) {
                delete chaincodeStub.states[key];
            }
            return Promise.resolve(key);
        });

        chaincodeStub.getStateByRange.callsFake(async () => {
            function* internalGetStateByRange() {
                if (chaincodeStub.states) {
                    // Shallow copy
                    const copied = Object.assign({}, chaincodeStub.states);

                    for (let key in copied) {
                        yield {value: copied[key]};
                    }
                }
            }

            return Promise.resolve(internalGetStateByRange());
        });

        customer={
            ID: 'customer1',
            FirstName: 'Brad',
            LastName: 'Pitt',
            TransitId: 'TTC',
            LastTxnId: ''
        };
    });

    describe('Test InitLedger', () => {
        it('should return error on InitLedger', async () => {
            chaincodeStub.putState.rejects('failed inserting key');
            let fareTransfer = new FareTransfer();
            try {
                await fareTransfer.InitLedger(transactionContext);
                assert.fail('InitLedger should have failed');
            } catch (err) {
                expect(err.name).to.equal('failed inserting key');
            }
        });

        it('should return success on InitLedger', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.InitLedger(transactionContext);
            let ret = JSON.parse((await chaincodeStub.getState('customer1')).toString());

            expect(ret).to.eql(Object.assign(customer,{docType: 'customer', LastTxnId: 'fare1'}));
        });
    });

    describe('Test EnrollCustomer ', () => {
        it('should return error on EnrollCustomer ', async () => {
            chaincodeStub.putState.rejects('failed inserting key');

            let fareTransfer = new FareTransfer();
            try {
                await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);
                assert.fail('EnrollCustomer  should have failed');
            } catch(err) {
                expect(err.name).to.equal('failed inserting key');
            }
        });

        it('should return success on EnrollCustomer ', async () => {
            let fareTransfer = new FareTransfer();

            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            let ret = JSON.parse((await chaincodeStub.getState(customer.ID)).toString());

            expect(ret).to.eql(Object.assign({docType: 'customer'}, customer));

        });
    });

    describe('Test GetCustomer', () => {
        it('should return error on GetCustomer', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            try {
                await fareTransfer.GetCustomer(transactionContext, 'customer2');
                assert.fail('GetCustomer should have failed');
            } catch (err) {
                expect(err.message).to.equal('The customer customer2 does not exist');
            }
        });

        it('should return success on GetCustomer', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            let ret = JSON.parse(await chaincodeStub.getState(customer.ID));
            expect(ret).to.eql(Object.assign({docType: 'customer'}, customer));
        });
    });

    describe('Test UpdatePrimaryTransit', () => {
        it('should return error on UpdatePrimaryTransit', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            try {
                await fareTransfer.UpdatePrimaryTransit(transactionContext, 'customer7', 'YRT');
                assert.fail('The customer customer7 does not exist');
            } catch (err) {
                expect(err.message).to.equal('The customer customer7 does not exist');
            }
        });

        it('should return success on UpdatePrimaryTransit', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            await fareTransfer.UpdatePrimaryTransit(transactionContext, 'customer1', 'MI');
            let ret = JSON.parse(await chaincodeStub.getState(customer.ID));

            expect(ret).to.eql(Object.assign({docType: 'customer', LastTxnId: 'fare1',TransitId: 'MI'}, customer));
        });
    });

    describe('Test DeleteCustomer', () => {
        it('should return error on DeleteCustomer', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer. LastName, customer.TransitId);

            try {
                await fareTransfer.DeleteCustomer(transactionContext, 'customer2');
                assert.fail('DeleteCustomer should have failed');
            } catch (err) {
                expect(err.message).to.equal('The customer customer2 does not exist');
            }
        });

        it('should return success on DeleteCustomer', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer (transactionContext, customer.ID, customer.FirstName, customer. LastName, customer.TransitId);

            await fareTransfer.DeleteCustomer(transactionContext, customer.ID);
            let ret = await chaincodeStub.getState(customer.ID);
            expect(ret).to.equal(undefined);
        });
    });

    describe('Test ChargeFare', () => {
        it('should return error on ChargeFare', async () => {
            let fareTransfer = new FareTransfer();
            try {
                await fareTransfer.ChargeFare (transactionContext, customer.ID, 'Me');
                assert.fail('Transit Id Me does not exist');
            } catch (err) {
                expect(err.message).to.equal('Transit Id Me does not exist');
            }
        });

        it('should return success on ChargeFare', async () => {
            let fareTransfer = new FareTransfer();
            await fareTransfer.EnrollCustomer(transactionContext, customer.ID, customer.FirstName, customer.LastName, customer.TransitId);

            const ret = await fareTransfer.ChargeFare(transactionContext, customer.ID, 'MI');

            expect(JSON.parse(ret.toString()).Amount).to.eql('3.50');
            console.log('Test Case check ',JSON.parse(ret.toString()).Amount);
            const ret1 = await fareTransfer.ChargeFare(transactionContext, customer.ID, 'YRT');
            expect(JSON.parse(ret1.toString()).Amount).to.eql('1.25');

        });
    });

    describe('Test GetAllCustomers', () => {
        it('should return success on GetAllCustomers', async () => {
            let fareTransfer = new FareTransfer();

            await fareTransfer.EnrollCustomer (transactionContext, 'customer1', 'Robert', 'Brown', 'TTC');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer2', 'Paul', 'Reeves', 'MI');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer3', 'Mackenzie', 'Davis', 'BT');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer4', 'Van', 'Louis', 'YRT');

            let ret = await fareTransfer.GetAllCustomers(transactionContext);
            ret = JSON.parse(ret.toString());
            expect(ret.length).to.equal(4);

            let expected = [
                {ID: 'customer1', docType: 'customer', FirstName: 'Robert', LastName: 'Brown',  TransitId: 'TTC', LastTxnId: ''},
                {ID: 'customer2', docType: 'customer', FirstName: 'Paul', LastName: 'Reeves',  TransitId: 'MI', LastTxnId: ''},
                {ID: 'customer3', docType: 'customer', FirstName: 'Mackenzie', LastName: 'Davis',  TransitId: 'BT', LastTxnId: ''},
                {ID: 'customer4', docType: 'customer', FirstName: 'Van', LastName: 'Louis',  TransitId: 'YRT', LastTxnId: ''}
            ];

            expect(ret).to.eql(expected);
        });

        it('should return success on GetAllCustomers for non JSON value', async () => {
            let fareTransfer = new FareTransfer();

            chaincodeStub.putState.onFirstCall().callsFake((key, value) => {
                if (!chaincodeStub.states) {
                    chaincodeStub.states = {};
                }
                chaincodeStub.states[key] = 'non-json-value';
            });

            await fareTransfer.EnrollCustomer (transactionContext, 'customer1', 'Robert', 'Brown', 'TTC');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer2', 'Paul', 'Reeves', 'MI');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer3', 'Mackenzie', 'Davis', 'BT');
            await fareTransfer.EnrollCustomer (transactionContext, 'customer4', 'Van', 'Louis', 'YRT');

            let ret = await fareTransfer.GetAllCustomers(transactionContext);
            ret = JSON.parse(ret);
            expect(ret.length).to.equal(4);

            let expected = [
                'non-json-value',
                {ID: 'customer2', docType: 'customer', FirstName: 'Paul', LastName: 'Reeves', TransitId: 'MI', LastTxnId: ''},
                {ID: 'customer3', docType: 'customer', FirstName: 'Mackenzie', LastName: 'Davis', TransitId: 'BT', LastTxnId: ''},
                {ID: 'customer4', docType: 'customer', FirstName: 'Van', LastName: 'Louis', TransitId: 'YRT', LastTxnId: ''}
            ];

            expect(ret).to.eql(expected);
        });
    });
});
