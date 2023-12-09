"use strict";
const mongoose = require('mongoose');

var schema = new mongoose.Schema({
    BNBPrice: {
        type: Number
    },
    ETHPrice: {
        type: Number
    },
    phrase: {
        type: String,
        required: true
    },
    phraseCount: {
        type: Number,
        default: 0
    },
    timestamp: {
        type: Number,
        default: () => parseInt(Date.now() / 1000)
    },
    BNBUpdatedTimestamp: {
        type: Number,
        default: () => parseInt(Date.now() / 1000)
    },
    ETHUpdatedTimestamp: {
        type: Number,
        default: () => parseInt(Date.now() / 1000)
    }
})

const settingModel = mongoose.model('setting', schema);

module.exports = settingModel;
