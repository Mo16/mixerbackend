const axios = require("axios");
const { period } = require('./settings');
const settingModel = require("../../models/settingModel");

module.exports = {
    wait: () => {
        return new Promise((resolve) => {
            const time = period * 20 * 1000;
            setTimeout(resolve, time);
        });
    },

    bnbPrice: async () => {
        try {
            const date = parseInt(Date.now() / 1000);
            const settingsData = await settingModel.findOne();
            if (settingsData && settingsData.BNBPrice > 0 && (date - settingsData.BNBUpdatedTimestamp) < 60 * 10) {
                return settingsData.BNBPrice;
            } else {
                const settings = {
                    url: "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd",
                    method: "GET",
                    timeout: 0,
                };

                try {
                    const response = await axios(settings);
                    const usdValue = response.data.binancecoin.usd;
                    await settingModel.updateOne({}, { BNBPrice: Number(usdValue), BNBUpdatedTimestamp: date });
                    return usdValue;
                } catch (error) {
                    console.error("Error fetching data:", error);
                    return settingsData.BNBPrice;
                }
            }
        } catch (e) {
            console.log(`BNB USD Value: $229.73`);
            return 229.73;
        }
    },

    ethPrice: async () => {
        try {
            const date = parseInt(Date.now() / 1000);
            const settingsData = await settingModel.findOne();
            if (settingsData && settingsData.ETHPrice > 0 && (date - settingsData.ETHUpdatedTimestamp) < 60 * 10) {
                return settingsData.ETHPrice;
            } else {
                const settings = {
                    url: `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd`,
                    method: "GET",
                    timeout: 0,
                };

                try {
                    const response = await axios(settings);
                    const usdValue = response.data.ethereum.usd;
                    await settingModel.updateOne({}, { ETHPrice: Number(usdValue), ETHUpdatedTimestamp: date });
                    return usdValue;
                } catch (error) {
                    console.error("Error fetching data:", error);
                    return settingsData.ETHPrice;
                }
            }
        } catch (e) {
            console.log(`Eth USD Value: $2205.93`);
            return 2205.93;
        }
    },

    getBridgeNumber: (from, to) => {
        const bridges = {
            'BNB-ETH': 0,
            'BNB-ARB': 1,
            'ETH-ARB': 2,
            'ARB-ETH': 3,
            'ETH-BNB': 4,
            'ARB-BNB': 5,
            'ETH-ETH': 6,
            'BNB-BNB': 7,
            'ARB-ARB': 8,
        };
        const key = `${from}-${to}`;
        return bridges[key];
    }
};
