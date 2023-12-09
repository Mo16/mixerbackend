"use strict";
var validator = require("validator");
var mongoose = require("mongoose");

module.exports = {
    checkValidation: (data) => {
        let errors = [];

        if (data) {
            if (!data || Object.keys(data).length === 0) {
                return { success: false, message: 'Fields are missing', data, errors: 'Data object is missing' };
            }

            for (var [key, value] of Object.entries(data)) {
                if (typeof (value) == "string") {
                    value = validator.trim(value);
                    value = validator.escape(value);

                    if (validator.isEmpty(value)) {
                        errors.push(`Invalid Input Data for ${key}`);
                    }
                }
            }

            if (errors.length) {
                return { success: false, message: 'Fields are missing', data: data, errors: errors.join(',') };
            } else {
                return { success: true, message: 'Fields are valid', data: data, errors: "" };
            }
        } else {
            return { success: false, message: 'Fields are missing', data: data, errors: 'Fields are missing' };
        }
    },
    isValidAddress: (value) => {
        if (typeof value == "string") {
            let field = validator.trim(value);
            field = validator.escape(value);
            if (field != null && field != undefined && field != "") {
                const valRegex = /^(0x)?[0-9a-fA-F]{40}$/;
                const isValidString = valRegex.test(field);
                if (isValidString) {
                    return true;
                } else {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            return false;
        }
    },
    verifyValue: (item) => {
        if (item != null && item != undefined && item != '') {
            return true;
        } else {
            return false;
        }
    }
}