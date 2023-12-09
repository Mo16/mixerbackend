const { ethers } = require("ethers");
const Web3 = require('web3');
const { bnbRPCUrl, ethRPCUrl, arbRPCUrl, minTrxCount, maxTrxCount } = require('../controller/config/settings');
const logsModel = require("../models/logsModel");
const { bnbPrice, ethPrice } = require("../controller/config/index");


const bnbWeb3 = new Web3(new Web3.providers.HttpProvider(bnbRPCUrl));
const ethWeb3 = new Web3(new Web3.providers.HttpProvider(ethRPCUrl));
const arbWeb3 = new Web3(new Web3.providers.HttpProvider(arbRPCUrl));


const minimumBNBToETH = async (web3, secondWeb3) => {
    try {
        const gasPrice = Number(await web3.eth.getGasPrice());
        const gasPrice2 = Number(await secondWeb3.eth.getGasPrice());
        const transactionFeeOn1 = 21000 * gasPrice * (maxTrxCount + 1);
        const transactionFeeOn2 = 21000 * gasPrice2 * (maxTrxCount + 1);
        const bnbCurrentPrice = await bnbPrice();
        const ethCurrentPrice = await ethPrice();
        const ethTransactionFeeInUsd = (transactionFeeOn2 / 10 ** 18) * ethCurrentPrice
        const ethTransactionFeeInBNB = Math.round((ethTransactionFeeInUsd / bnbCurrentPrice) * 10 ** 18);
        console.log(`Total Transaction fee on BNB Chain: ${bnbWeb3.utils.fromWei(transactionFeeOn1.toString(), 'ether')} BNB`)
        console.log(`Total Transaction fee on ETH/ARB Chain: ${bnbWeb3.utils.fromWei(transactionFeeOn2.toString(), 'ether')} ETH`)
        let totalBNB = transactionFeeOn1 + ethTransactionFeeInBNB
        console.log(`Total Transaction fee in BNB: ${bnbWeb3.utils.fromWei(totalBNB.toString(), 'ether')} BNB`)
        return Number(bnbWeb3.utils.fromWei(totalBNB.toString(), 'ether'));
    } catch (error) {
        console.log(`Error while calculating minimum amount. ${error.message}`)
        return 0;
    }
}

const minimumETHToBNB = async (web3, secondWeb3) => {
    try {
        const gasPrice = Number(await web3.eth.getGasPrice());
        const gasPrice2 = Number(await secondWeb3.eth.getGasPrice());
        const transactionFeeOn1 = 21000 * gasPrice * (maxTrxCount + 1);
        const transactionFeeOn2 = 21000 * gasPrice2 * (maxTrxCount + 1);
        const bnbCurrentPrice = await bnbPrice();
        const ethCurrentPrice = await ethPrice();
        const bnbTransactionFeeInUsd = (transactionFeeOn2 / 10 ** 18) * bnbCurrentPrice
        const bnbTransactionFeeInEth = Math.round((bnbTransactionFeeInUsd / ethCurrentPrice) * 10 ** 18);
        console.log(`Total Transaction fee on ETH/BNB Chain: ${web3.utils.fromWei(transactionFeeOn1.toString(), 'ether')} ETH`)
        console.log(`Total Transaction fee on BNB Chain: ${web3.utils.fromWei(transactionFeeOn2.toString(), 'ether')} BNB`)
        let totalETH = transactionFeeOn1 + bnbTransactionFeeInEth
        console.log(`Total Transaction fee in ETH: ${web3.utils.fromWei(totalETH.toString(), 'ether')} ETH`)
        return Number(web3.utils.fromWei(totalETH.toString(), 'ether'));
    } catch (error) {
        console.log(`Error while calculating minimum amount. ${error.message}`)
        return 0;
    }
}

const minimumSame = async (web3, secondWeb3) => {
    try {
        const gasPrice = Number(await web3.eth.getGasPrice());
        const gasPrice2 = Number(await secondWeb3.eth.getGasPrice());
        const transactionFeeOn1 = 21000 * gasPrice * (maxTrxCount + 1);
        const transactionFeeOn2 = 21000 * gasPrice2 * (maxTrxCount + 1);
        console.log(`Total Transaction fee on first Chain: ${web3.utils.fromWei(transactionFeeOn1.toString(), 'ether')}`)
        console.log(`Total Transaction fee on second Chain: ${web3.utils.fromWei(transactionFeeOn2.toString(), 'ether')}`)
        let totalFee = transactionFeeOn1 + transactionFeeOn2
        console.log(`Total Transaction fee on first chain: ${web3.utils.fromWei(totalFee.toString(), 'ether')}`)
        return Number(web3.utils.fromWei(totalFee.toString(), 'ether'));
    } catch (error) {
        console.log(`Error while calculating minimum amount. ${error.message}`)
        return 0;
    }
}

module.exports = {
    bnbWeb3,
    ethWeb3,
    arbWeb3,

    generateMnemonicPhrase: () => {
        // Generate a random mnemonic phrase
        const mnemonic = ethers.Wallet.createRandom().mnemonic;
        return { mnemonic: mnemonic.phrase, count: 0 };
    },

    createAccount: (phrase, count) => {
        try {
            console.log('count', count)
            const newPath = `m/44'/60'/0'/0/${count}`;
            console.log('newPath', newPath)
            // Derive the master HD node from the mnemonic phrase
            const masterNode = ethers.utils.HDNode.fromMnemonic(phrase, newPath);
            // Derive the child HD node for the first Ethereum address
            const childNode = masterNode.derivePath(newPath);

            // // Create an Ethereum wallet from the child HD node
            const wallet = new ethers.Wallet(childNode.privateKey, ethers.getDefaultProvider('mainnet'));
            const { address, privateKey } = wallet;
            return { success: true, message: "success", data: { address, privateKey }, errors: "" };
        } catch (error) {
            return { success: false, message: "Error while creating account", data: "", errors: error.message };
        }
    },

    getRandomPrivateKey: (n) => {
        const arrayLength = n.length;
        const minCount = Math.min(minTrxCount, arrayLength);
        const maxCount = Math.min(maxTrxCount, arrayLength);
        const randomCount = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
        const shuffledArray = [...n];
        for (let i = shuffledArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
        }
        const selectedNumbers = shuffledArray.slice(0, randomCount);
        return selectedNumbers;
    },

    minimumAmount: async (step) => {
        try {
            let result;
            switch (step) {
                case 0:
                    console.log("BNB -> ETH");
                    result = await minimumBNBToETH(bnbWeb3, ethWeb3);
                    break;
                case 1:
                    console.log("BNB -> ARB");
                    result = await minimumBNBToETH(bnbWeb3, arbWeb3);
                    break;
                case 2:
                    console.log("ETH -> ARB");
                    result = await minimumSame(ethWeb3, arbWeb3);
                    break;
                case 3:
                    console.log("ARB -> ETH");
                    result = await minimumSame(arbWeb3, ethWeb3);
                    break;
                case 4:
                    console.log("ETH -> BNB");
                    result = await minimumETHToBNB(ethWeb3, bnbWeb3);
                    break;
                case 5:
                    console.log("ARB -> BNB");
                    result = await minimumETHToBNB(arbWeb3, bnbWeb3);
                    break;
                case 6:
                    console.log("ETH -> ETH");
                    result = await minimumSame(ethWeb3, ethWeb3);
                    break;
                case 7:
                    console.log("BNB -> BNB");
                    result = await minimumSame(bnbWeb3, bnbWeb3);
                    break;
                case 8:
                    console.log("ARB -> ARB");
                    result = await minimumSame(arbWeb3, arbWeb3);
                    break;
                default:
                    console.log("Unknown action. Please provide a valid action.");
            }
            if (result === 0) {
                result = 0.01
            }
            return result;
        } catch (error) {
            console.log("error", error.message);
            return 0.01;
        }
    },

    saveLogs: async (logs) => {
        try {
            const logsData = logsModel(logs);
            await logsData.save();
        } catch (error) {
            console.log('Error saving logs:', error);
        }
    }
}