"use strict";
const CryptoJS = require("crypto-js");

module.exports = {
    aesEncrypt: (content) => {
        const b64 = CryptoJS.AES.encrypt(content, process.env.CRYPTO_SECRET_KEY).toString();
        const e64 = CryptoJS.enc.Base64.parse(b64);
        return e64.toString(CryptoJS.enc.Hex);
    },
    aesDecrypt: (word) => {
        const reb64 = CryptoJS.enc.Hex.parse(word);
        const bytes = reb64.toString(CryptoJS.enc.Base64);
        const decrypt = CryptoJS.AES.decrypt(bytes, process.env.CRYPTO_SECRET_KEY);
        return decrypt.toString(CryptoJS.enc.Utf8);
    }
}