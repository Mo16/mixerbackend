"use strict";
const mongoose = require('mongoose');

var schema = new mongoose.Schema({
    fromChain: {
        type: String,
        required: true
    },
    toChain: {
        type: String,
        required: true
    },
    recipientWallet: {
        type: String,
        required: true
    },
    allotedWallet: {
        type: String,
        required: true
    },
    allotedWalletKey: {
        type: String,
        required: true
    },
    status: {
        type: Boolean,
        default: false
    },
    trxHash: {
        type: String
    },
    timestamp: {
        type: Number,
        default: () => parseInt(Date.now() / 1000)
    }
})

const transactionModel = mongoose.model('transaction', schema);

module.exports = transactionModel;
