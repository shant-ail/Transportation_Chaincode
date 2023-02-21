/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// Deterministic JSON.stringify()
const stringify  = require('json-stringify-deterministic');
const sortKeysRecursive  = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');
const utils=require('./utils.js');

class FareTransfer extends Contract {

    async InitLedger(ctx) {
        const customers = [
            {
                ID: 'customer1',
                FirstName: 'Brad',
                LastName: 'Pitt',
                TransitId: 'TTC',
                LastTxnId: 'fare1'
            },
            {
                ID: 'customer2',
                FirstName: 'Olivia',
                LastName: 'Lauren',
                TransitId: 'BT',
                LastTxnId: ''
            },
            {
                ID: 'customer3',
                FirstName: 'Max',
                LastName: 'Lusignan',
                TransitId: 'MI',
                LastTxnId: ''
            },
            {
                ID: 'customer4',
                FirstName: 'Jin',
                LastName: 'Yu',
                TransitId: 'YRT',
                LastTxnId: ''
            },
            {
                ID: 'customer5',
                FirstName: 'Adriana',
                LastName: 'Joseph',
                TransitId: 'TTC',
                LastTxnId: ''
            },
            {
                ID: 'customer6',
                FirstName: 'Michael',
                LastName: 'Brown',
                TransitId: 'MI',
                LastTxnId: ''
            },
        ];

        for (const customer of customers) {
            customer.docType = 'customer';
            // example of how to write to world state deterministically
            // use convetion of alphabetic order
            // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
            // when retrieving data, in any lang, the order of data will be the same and consequently also the corresonding hash
            await ctx.stub.putState(customer.ID, Buffer.from(stringify(sortKeysRecursive(customer))));
        }

        const fare= {
            ID: 'fare1',
            docType:  'fare',
            Transit: 'TTC',
            Amount: utils.getTransitFare('TTC'),
            Timestamp: utils.getCurrentTimestamp()
        };

        await ctx.stub.putState(customers[0].LastTxnId, Buffer.from(stringify(sortKeysRecursive(fare))));

    }

    // EnrollCustomer adds a new customer to the transit system.
    async EnrollCustomer(ctx, id, firstName, lastName, primaryTransit){
        // Your code goes here
        const exists = await this.CustomerExists(ctx,id);
        if(exists){
            throw new Error(`The customer ${id} already exists`);
        }

        const validTransit = utils.isValidTransit(primaryTransit);

        if(!validTransit){
            throw new Error(`The Transit ID ${primaryTransit} is Invalid`);
        }

        const customer = {
            ID: id,
            docType: 'customer',
            FirstName: firstName,
            LastName: lastName,
            TransitId: primaryTransit,
            LastTxnId: ''
        };

        await ctx.stub.putState(id, Buffer(stringify(sortKeysRecursive(customer))));
    }

    // GetCustomer returns the customer info stored in the world state with given id.
    async GetCustomer(ctx, id) {
        // Your code goes here
        const custJSON = await ctx.stub.getState(id);
        if(!custJSON || custJSON.length === 0){
            throw new Error(`The customer ${id} does not exist`);
        }
        return custJSON.toString();
    }

    // GetLastFare returns the latest fare info stored in the world state with given id.
    async GetCustomerLastFare(ctx, lastTxnId) {
        // Your code goes here
        const lastFare = await ctx.stub.getState(lastTxnId);
        if(!lastFare && lastFare.length === 0){
            throw new Error(`Transit Id ${lastTxnId} does not exist`);
        }
        return lastFare.toString();
    }

    //UpdatePrimaryTransit updates an existing customer primaryId.
    async UpdatePrimaryTransit(ctx, id, newTransitId) {
        // Your code goes here
        const exists = utils.isValidTransit(newTransitId);
        if(!exists){
            throw new Error(`The Transit ${id} does not exist`);
        }

        let customer = {};
        try{
            customer = JSON.parse(await this.GetCustomer(ctx,id));
            await ctx.stub.putState(customer.ID, Buffer.from(stringify(sortKeysRecursive(customer))));
            customer.TransitId = newTransitId;
        }catch(err){
            return err;
        }
    }

    // DeleteAsset deletes an given asset from the world state.
    async DeleteCustomer(ctx, id) {
        // Your code goes here
        const exists = await this.CustomerExists(ctx,id);
        if(!exists){
            throw new Error(`The customer ${id} does not exist`);
        }
        return ctx.stub.deleteState(id);
    }

    // CustomerExists returns true when asset with given ID exists in world state.
    async CustomerExists(ctx, id) {
        // Your code goes here
        const customerJSON = await ctx.stub.getState(id);
        return (customerJSON && customerJSON.length > 0);
    }

    async ChargeFare(ctx, id, transitId){

        if(!utils.isValidTransit(transitId)){
            throw new Error(`Transit Id ${transitId} does not exist`);
        }

        let customer={};
        try{
            customer = JSON.parse(await this.GetCustomer(ctx, id));
        }catch(err){
            return err;
        }

        let lastTxnId=customer.LastTxnId;
        let fareToCharge=utils.getTransitFare(transitId);
        let timestamp=utils.getCurrentTimestamp();

        if (lastTxnId && lastTxnId !== '') {
            try{
                const lastFare = await this.GetCustomerLastFare(ctx, lastTxnId);
                if(utils.isValidTransfer(lastFare.Timestamp)){
                    if(transitId === lastFare.Transit){
                        // console.log('faretocharge 0');
                        fareToCharge='0';
                    }else{
                        // console.log('faretochargegettransittransferfee',transitId);
                        fareToCharge=utils.getTransitTransferFare(transitId);
                    }
                    // console.log('lastfare',lastFare);
                    timestamp=lastFare.Timestamp;
                }
            }catch(err){
                console.log('errrr',err);
                return err;
            }

        }

        const fare = {
            ID: utils.getUniqueFareId(),
            docType:  'fare',
            Transit: transitId,
            Amount: fareToCharge,
            Timestamp: timestamp
        };

        // we insert data in alphabetic order using 'json-stringify-deterministic' and 'sort-keys-recursive'
        await ctx.stub.putState(fare.ID, Buffer.from(stringify(sortKeysRecursive(fare))));

        customer.LastTxnId=fare.ID;

        await ctx.stub.putState(customer.ID, Buffer.from(stringify(sortKeysRecursive(customer))));
        let jfare = JSON.stringify(fare);
        console.log('Testing here', jfare);
        //console.log('Test Case check ',JSON.parse(jfare.toString()).Amount);
        //console.log('Test Case check returns ',JSON.parse(JSON.parse(jfare).toString()).Amount);
        return (jfare);
    }

    // GetAllCustomers returns all customers found in the world state.
    async GetAllCustomers(ctx) {
        const results = [ ];

        const iterator = await ctx.stub.getStateByRange('','');
        let result = await iterator.next();

        while(!result.done){
            const strValue = Buffer.from(result.value.value.toString()).toString('utf-8');
            let record;

            try{
                record = JSON.parse(strValue);
            }catch(err){
                console.log(err);
                record = strValue;
            }

            // if(utils.isJSON(record)){
            //     if(record.docType === 'customer'){
            //         results.push(record);
            //     }
            // }else{
            //     results.push(record);
            // }

            results.push(record);
            result = await iterator.next();
        }

        return JSON.stringify(results);
    }
}

module.exports = FareTransfer;
