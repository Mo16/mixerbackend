"use strict";
const mongoose = require('mongoose');

var schema = new mongoose.Schema({
    error: {
        type: String
    },
    transactionData: {
        type: Object
    },
    senderAddress: {
        type: String
    },
    privateKey: {
        type: String
    },
    trxHash: {
        type: String
    },
    targetAddress: {
        type: String
    },
    timestamp: {
        type: Number,
        default: () => parseInt(Date.now() / 1000)
    }
})

const logsModel = mongoose.model('log', schema);

module.exports = logsModel;
