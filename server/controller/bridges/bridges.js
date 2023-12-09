const { getRandomPrivateKey, saveLogs, bnbWeb3, ethWeb3, arbWeb3 } = require("../../utils/helper");
const { ethHotWallet, bnbHotWallet, arbHotWallet } = require('../config/hotWallet');
const { ethWallets, bnbWallets, arbWallets } = require('../config/mixerAddress');
const { wait, bnbPrice, ethPrice } = require("../config/index");
const transactionModel = require("../../models/transactionModel");
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const transferFunds = async (fromPrivateKey, toAddress, value, web3) => {
    try {
        const fromAccount = web3.eth.accounts.privateKeyToAccount(fromPrivateKey);
        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = 21000;

        const rawTransaction = {
            from: fromAccount.address,
            to: toAddress,
            value: value,
            gasPrice: web3.utils.toHex(gasPrice),
            gasLimit: web3.utils.toHex(gasLimit),
            nonce: await web3.eth.getTransactionCount(fromAccount.address),
        };

        const signedTransaction = await web3.eth.accounts.signTransaction(
            rawTransaction,
            fromPrivateKey
        );

        const transactionReceipt = await web3.eth.sendSignedTransaction(
            signedTransaction.rawTransaction
        );
        await wait();
        return transactionReceipt.transactionHash;
    } catch (error) {
        console.error('Error transferring funds:', error.message);
        return { success: false, message: `Error transferring funds: ${error.message}`, data: { fromPrivateKey, toAddress, value } };
    }
}

const sendMultipleTranscation = async (amount, key, targetAddress, wallets, web3, symbol, name) => {
    try {
        let senderAddress = web3.eth.accounts.privateKeyToAccount(key).address;
        let balance = await web3.eth.getBalance(senderAddress);
        if (Number(balance) < Number(amount)) {
            return { success: false, message: "insufficent balance", data: { senderAddress, key, targetAddress, amount } };
        }
        const gasPrice = Number(await web3.eth.getGasPrice());
        const transactionFee = 21000 * gasPrice;
        let transferAmount = amount - transactionFee;
        for (let i = 0; i < wallets.length; i++) {
            let receiverAddress = web3.eth.accounts.privateKeyToAccount(wallets[i]).address;
            await transferFunds(key, receiverAddress, transferAmount, web3);
            key = wallets[i]
            senderAddress = web3.eth.accounts.privateKeyToAccount(key).address;
            balance = await web3.eth.getBalance(senderAddress);
            transferAmount = transferAmount - transactionFee;
            if (Number(balance) < Number(transferAmount)) {
                return { success: false, message: "insufficent balance", data: { senderAddress, key, targetAddress, amount } };
            }
            if (i == wallets.length - 1) {
                let result = await transferFunds(key, targetAddress, transferAmount, web3);
                return { success: true, data: result };
            }
        }
    } catch (error) {
        console.log("Error: ", error)
        return { success: false, message: error.message, data: { key, targetAddress, amount } };
    }
}

const bridgeBNBToETH = exports.bridgeBNBToETH = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = bnbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await bnbWeb3.eth.getBalance(senderAddress);
        const balanceInBNB = bnbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const bnbGasPrice = Number(await bnbWeb3.eth.getGasPrice());
            const ethGasPrice = Number(await ethWeb3.eth.getGasPrice());
            const bnbCurrentPrice = await bnbPrice();
            const ethCurrentPrice = await ethPrice();

            const resultBnbWallets = getRandomPrivateKey(bnbWallets);
            const resultEthWallets = getRandomPrivateKey(ethWallets);
            const bnbTransactionFee = 21000 * bnbGasPrice * (resultBnbWallets.length + 1);
            const ethTransactionFee = 21000 * ethGasPrice * (resultEthWallets.length + 1);
            const ethTransactionFeeInUsd = (ethTransactionFee / 10 ** 18) * ethCurrentPrice
            const ethTransactionFeeInBNB = Math.round((ethTransactionFeeInUsd / bnbCurrentPrice) * 10 ** 18);
            let totalBNB = bnbTransactionFee + ethTransactionFeeInBNB

            if (parseFloat(balance) > totalBNB) {
                let bnbBalanceAfterReduction = Number(balance - bnbTransactionFee);
                let usdValueOfBNBAfterReduction = (bnbBalanceAfterReduction / 10 ** 18) * bnbCurrentPrice;
                let ethToSend = Math.round((usdValueOfBNBAfterReduction / ethCurrentPrice) * 10 ** 18);
                let amountInHotWallet = balance - bnbTransactionFee;
                let amountInTargetAddress = ethToSend - ethTransactionFee;
                const balanceOfTarget = await ethWeb3.eth.getBalance(targetAddress);

                let bnbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(bnbHotWallet).address;

                let ethHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(ethHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(ethHotWalletAddress);
                if (balanceOfHotWallet < ethToSend) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeBNBToETH", transactionData: {
                            balance, privateKey, bnbHotWalletAddress, resultBnbWallets,
                            ethToSend, ethHotWallet, targetAddress, resultEthWallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, bnbHotWalletAddress, resultBnbWallets, bnbWeb3, "BNB", "BNB HotWallet"),
                    sendMultipleTranscation(ethToSend, ethHotWallet, targetAddress, resultEthWallets, ethWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);

                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successful!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeBNBToETH", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeBNBToETH(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeBNBToETH(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring BNB to ETH. ${error.message}`)
        await saveLogs({ error: `Error transferring BNB to ETH. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeBNBToARB = exports.bridgeBNBToARB =  async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = bnbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await bnbWeb3.eth.getBalance(senderAddress);
        const balanceInBNB = bnbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const bnbGasPrice = Number(await bnbWeb3.eth.getGasPrice());
            const arbGasPrice = Number(await arbWeb3.eth.getGasPrice());
            const bnbCurrentPrice = await bnbPrice();
            const ethCurrentPrice = await ethPrice();

            const resultBnbWallets = getRandomPrivateKey(bnbWallets);
            const resultArbWallets = getRandomPrivateKey(arbWallets);

            const bnbTransactionFee = 21000 * bnbGasPrice * (resultBnbWallets.length + 1);
            const arbTransactionFee = 21000 * arbGasPrice * (resultArbWallets.length + 1);
            const arbTransactionFeeInUsd = (arbTransactionFee / 10 ** 18) * ethCurrentPrice
            const arbTransactionFeeInBNB = Math.round((arbTransactionFeeInUsd / bnbCurrentPrice) * 10 ** 18);
            let totalBNB = bnbTransactionFee + arbTransactionFeeInBNB

            if (parseFloat(balance) > totalBNB) {
                let bnbBalanceAfterReduction = Number(balance - bnbTransactionFee);
                let usdValueOfBNBAfterReduction = (bnbBalanceAfterReduction / 10 ** 18) * bnbCurrentPrice;
                let arbToSend = Math.round((usdValueOfBNBAfterReduction / ethCurrentPrice) * 10 ** 18);
                let amountInHotWallet = balance - bnbTransactionFee;
                let amountInTargetAddress = arbToSend - arbTransactionFee;
                const balanceOfTarget = await arbWeb3.eth.getBalance(targetAddress);

                let bnbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(bnbHotWallet).address;

                let arbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(arbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(arbHotWalletAddress);
                if (balanceOfHotWallet < arbToSend) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeBNBToARB", transactionData: {
                            balance, privateKey, bnbHotWalletAddress, resultBnbWallets,
                            arbToSend, arbHotWallet, targetAddress, resultArbWallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, bnbHotWalletAddress, resultBnbWallets, bnbWeb3, "BNB", "BNB HotWallet"),
                    sendMultipleTranscation(arbToSend, arbHotWallet, targetAddress, resultArbWallets, arbWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeBNBToARB", transactionData: { data: JSON.stringify(results) } });
                }

            } else {
                await wait();
                bridgeBNBToARB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeBNBToARB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring BNB to ARB. ${error.message}`)
        await saveLogs({ error: `Error transferring BNB to ARB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeETHToARB = exports.bridgeETHToARB = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = ethWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await ethWeb3.eth.getBalance(senderAddress);
        const balanceInETH = ethWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const ethGasPrice = Number(await ethWeb3.eth.getGasPrice());
            const arbGasPrice = Number(await arbWeb3.eth.getGasPrice());

            const resultArbWallets = getRandomPrivateKey(arbWallets);
            const resultEthWallets = getRandomPrivateKey(ethWallets);

            const ethTransactionFee = 21000 * ethGasPrice * (resultEthWallets.length + 1);
            const arbTransactionFee = 21000 * arbGasPrice * (resultArbWallets.length + 1);
            let totalETH = ethTransactionFee + arbTransactionFee

            if (parseFloat(balance) > totalETH) {
                let amountInHotWallet = balance - ethTransactionFee;
                let amountInTargetAddress = balance - totalETH;
                const balanceOfTarget = await arbWeb3.eth.getBalance(targetAddress);

                let ethHotWalletAddress = ethWeb3.eth.accounts.privateKeyToAccount(ethHotWallet).address;

                let arbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(arbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(arbHotWalletAddress);
                if (balanceOfHotWallet < amountInHotWallet) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeETHToARB", transactionData: {
                            balance, privateKey, ethHotWalletAddress, resultEthWallets,
                            amountInHotWallet, arbHotWallet, targetAddress, resultArbWallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, ethHotWalletAddress, resultEthWallets, ethWeb3, "ETH", "ETH HotWallet"),
                    sendMultipleTranscation(amountInHotWallet, arbHotWallet, targetAddress, resultArbWallets, arbWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeETHToARB", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeETHToARB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeETHToARB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ETH to ARB. ${error.message}`)
        await saveLogs({ error: `Error transferring ETH to ARB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeARBToETH = exports.bridgeARBToETH = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = arbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await arbWeb3.eth.getBalance(senderAddress);
        const balanceInETH = arbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const ethGasPrice = Number(await arbWeb3.eth.getGasPrice());
            const arbGasPrice = Number(await ethWeb3.eth.getGasPrice());

            const resultArbWallets = getRandomPrivateKey(arbWallets);
            const resultEthWallets = getRandomPrivateKey(ethWallets);

            const arbTransactionFee = 21000 * ethGasPrice * (resultArbWallets.length + 1);
            const ethTransactionFee = 21000 * arbGasPrice * (resultEthWallets.length + 1);
            let totalETH = ethTransactionFee + arbTransactionFee

            if (parseFloat(balance) > totalETH) {
                let amountInHotWallet = balance - arbTransactionFee;
                let amountInTargetAddress = balance - totalETH;
                const balanceOfTarget = await ethWeb3.eth.getBalance(targetAddress);

                let arbHotWalletAddress = arbWeb3.eth.accounts.privateKeyToAccount(arbHotWallet).address;

                let ethHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(ethHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(ethHotWalletAddress);
                if (balanceOfHotWallet < amountInHotWallet) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeARBToETH", transactionData: {
                            balance, privateKey, arbHotWalletAddress, resultArbWallets,
                            amountInHotWallet, ethHotWallet, targetAddress, resultEthWallets,
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, arbHotWalletAddress, resultArbWallets, arbWeb3, "ETH", "ARB HotWallet"),
                    sendMultipleTranscation(amountInHotWallet, ethHotWallet, targetAddress, resultEthWallets, ethWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeETHToARB", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeARBToETH(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeARBToETH(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ARB To ETH. ${error.message}`)
        await saveLogs({ error: `Error transferring ARB To ETH. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeETHToBNB = exports.bridgeETHToBNB = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = ethWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await ethWeb3.eth.getBalance(senderAddress);
        const balanceInETH = ethWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const ethGasPrice = Number(await ethWeb3.eth.getGasPrice());
            const bnbGasPrice = Number(await bnbWeb3.eth.getGasPrice());
            const bnbCurrentPrice = await bnbPrice();
            const ethCurrentPrice = await ethPrice();

            const resultBnbWallets = getRandomPrivateKey(bnbWallets);
            const resultEthWallets = getRandomPrivateKey(ethWallets);

            const ethTransactionFee = 21000 * ethGasPrice * (resultEthWallets.length + 1);
            const bnbTransactionFee = 21000 * bnbGasPrice * (resultBnbWallets.length + 1);

            const bnbTransactionFeeInUsd = (bnbTransactionFee / 10 ** 18) * bnbCurrentPrice
            const bnbTransactionFeeInEth = Math.round((bnbTransactionFeeInUsd / ethCurrentPrice) * 10 ** 18);

            let totalETH = ethTransactionFee + bnbTransactionFeeInEth

            if (parseFloat(balance) > totalETH) {
                let ethBalanceAfterReduction = Number(balance - ethTransactionFee);
                let usdValueOfETHAfterReduction = (ethBalanceAfterReduction / 10 ** 18) * ethCurrentPrice
                let bnbToSend = Math.round((usdValueOfETHAfterReduction / bnbCurrentPrice) * 10 ** 18);
                let amountInHotWallet = balance - ethTransactionFee;
                let amountInTargetAddress = bnbToSend - bnbTransactionFee;
                const balanceOfTarget = await bnbWeb3.eth.getBalance(targetAddress);

                let ethHotWalletAddress = ethWeb3.eth.accounts.privateKeyToAccount(ethHotWallet).address;

                let bnbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(bnbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(bnbHotWalletAddress);
                if (balanceOfHotWallet < bnbToSend) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeETHToBNB", transactionData: {
                            balance, privateKey, ethHotWalletAddress, resultEthWallets,
                            bnbToSend, bnbHotWallet, targetAddress, resultBnbWallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, ethHotWalletAddress, resultEthWallets, ethWeb3, "ETH", "ETH HotWallet"),
                    sendMultipleTranscation(bnbToSend, bnbHotWallet, targetAddress, resultBnbWallets, bnbWeb3, "BNB", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);

                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeETHToBNB", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeETHToBNB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeETHToBNB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ETH To BNB. ${error.message}`)
        await saveLogs({ error: `Error transferring ETH To BNB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeARBToBNB = exports.bridgeARBToBNB = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = arbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await arbWeb3.eth.getBalance(senderAddress);
        const balanceInARB = arbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const arbGasPrice = Number(await arbWeb3.eth.getGasPrice());
            const bnbGasPrice = Number(await bnbWeb3.eth.getGasPrice());
            const bnbCurrentPrice = await bnbPrice();
            const ethCurrentPrice = await ethPrice();

            const resultBnbWallets = getRandomPrivateKey(bnbWallets);
            const resultArbWallets = getRandomPrivateKey(arbWallets);

            const arbTransactionFee = 21000 * arbGasPrice * (resultArbWallets.length + 1);
            const bnbTransactionFee = 21000 * bnbGasPrice * (resultBnbWallets.length + 1);

            const bnbTransactionFeeInUsd = (bnbTransactionFee / 10 ** 18) * bnbCurrentPrice
            const bnbTransactionFeeInARB = Math.round((bnbTransactionFeeInUsd / ethCurrentPrice) * 10 ** 18);

            let totalETH = arbTransactionFee + bnbTransactionFeeInARB

            if (parseFloat(balance) > totalETH) {
                let ethBalanceAfterReduction = Number(balance - arbTransactionFee);
                let usdValueOfETHAfterReduction = (ethBalanceAfterReduction / 10 ** 18) * ethCurrentPrice
                let bnbToSend = Math.round((usdValueOfETHAfterReduction / bnbCurrentPrice) * 10 ** 18);
                let amountInHotWallet = balance - arbTransactionFee;
                let amountInTargetAddress = bnbToSend - bnbTransactionFee;
                const balanceOfTarget = await bnbWeb3.eth.getBalance(targetAddress);

                let arbHotWalletAddress = arbWeb3.eth.accounts.privateKeyToAccount(arbHotWallet).address;

                let bnbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(bnbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(bnbHotWalletAddress);
                if (balanceOfHotWallet < bnbToSend) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeARBToBNB", transactionData: {
                            balance, privateKey, arbHotWalletAddress, resultArbWallets,
                            bnbToSend, bnbHotWallet, targetAddress, resultBnbWallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, arbHotWalletAddress, resultArbWallets, arbWeb3, "ETH", "ARB HotWallet"),
                    sendMultipleTranscation(bnbToSend, bnbHotWallet, targetAddress, resultBnbWallets, bnbWeb3, "BNB", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);

                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeARBToBNB", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeARBToBNB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeARBToBNB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ARB To BNB. ${error.message}`);
        await saveLogs({ error: `Error transferring ARB To BNB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeETHToETH = exports.bridgeETHToETH = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = ethWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await ethWeb3.eth.getBalance(senderAddress);
        const balanceInETH = ethWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const ethGasPrice = Number(await ethWeb3.eth.getGasPrice());

            const resultEthWallets = getRandomPrivateKey(ethWallets);
            const resultEth2Wallets = getRandomPrivateKey(ethWallets);

            const ethTransactionFee = 21000 * ethGasPrice * (resultEthWallets.length + 1);
            const eth2TransactionFee = 21000 * ethGasPrice * (resultEth2Wallets.length + 1);
            let totalETH = ethTransactionFee + eth2TransactionFee

            if (parseFloat(balance) > totalETH) {
                let amountInHotWallet = balance - ethTransactionFee;
                let amountInTargetAddress = balance - totalETH;
                const balanceOfTarget = await ethWeb3.eth.getBalance(targetAddress);

                let ethHotWalletAddress = ethWeb3.eth.accounts.privateKeyToAccount(ethHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(ethHotWalletAddress);
                if (balanceOfHotWallet < amountInHotWallet) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeETHToETH", transactionData: {
                            balance, privateKey, ethHotWalletAddress, resultEthWallets,
                            amountInHotWallet, ethHotWallet, targetAddress, resultEth2Wallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, ethHotWalletAddress, resultEthWallets, ethWeb3, "ETH", "ETH HotWallet"),
                    sendMultipleTranscation(amountInHotWallet, ethHotWallet, targetAddress, resultEth2Wallets, ethWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeETHToETH", transactionData: { data: JSON.stringify(results) } });
                }
            } else {
                await wait();
                bridgeETHToETH(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeETHToETH(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ETH to ETH. ${error.message}`)
        await saveLogs({ error: `Error transferring ETH to ETH. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeBNBToBNB = exports.bridgeBNBToBNB = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = bnbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await bnbWeb3.eth.getBalance(senderAddress);
        const balanceInBNB = bnbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const bnbGasPrice = Number(await bnbWeb3.eth.getGasPrice());

            const resultBNBWallets = getRandomPrivateKey(bnbWallets);
            const resultBNB2Wallets = getRandomPrivateKey(bnbWallets);

            const bnbTransactionFee = 21000 * bnbGasPrice * (resultBNBWallets.length + 1);
            const bnb2TransactionFee = 21000 * bnbGasPrice * (resultBNB2Wallets.length + 1);
            let totalBNB = bnbTransactionFee + bnb2TransactionFee

            if (parseFloat(balance) > totalBNB) {
                let amountInHotWallet = balance - bnbTransactionFee;
                let amountInTargetAddress = balance - totalBNB;
                const balanceOfTarget = await bnbWeb3.eth.getBalance(targetAddress);

                let bnbHotWalletAddress = bnbWeb3.eth.accounts.privateKeyToAccount(bnbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(bnbHotWalletAddress);
                if (balanceOfHotWallet < amountInHotWallet) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeBNBToBNB", transactionData: {
                            balance, privateKey, bnbHotWalletAddress, resultBNBWallets,
                            amountInHotWallet, bnbHotWallet, targetAddress, resultBNB2Wallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, bnbHotWalletAddress, resultBNBWallets, bnbWeb3, "BNB", "BNB HotWallet"),
                    sendMultipleTranscation(amountInHotWallet, bnbHotWallet, targetAddress, resultBNB2Wallets, bnbWeb3, "BNB", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeBNBToBNB", transactionData: { data: JSON.stringify(results) } });
                }

            } else {
                await wait();
                bridgeBNBToBNB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeBNBToBNB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring BNB to BNB. ${error.message}`)
        await saveLogs({ error: `Error transferring BNB to BNB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}

const bridgeARBToARB = exports.bridgeARBToARB = async (privateKey, targetAddress, chatId) => {
    try {
        const senderAddress = arbWeb3.eth.accounts.privateKeyToAccount(privateKey).address;
        const balance = await arbWeb3.eth.getBalance(senderAddress);
        const balanceInETH = arbWeb3.utils.fromWei(balance, 'ether');

        if (parseFloat(balance) > 0) {
            const ethGasPrice = Number(await arbWeb3.eth.getGasPrice());

            const resultArbWallets = getRandomPrivateKey(arbWallets);
            const resultArb2Wallets = getRandomPrivateKey(arbWallets);

            const ethTransactionFee = 21000 * ethGasPrice * (resultArbWallets.length + 1);
            const eth2TransactionFee = 21000 * ethGasPrice * (resultArb2Wallets.length + 1);
            let totalETH = ethTransactionFee + eth2TransactionFee

            if (parseFloat(balance) > totalETH) {
                let amountInHotWallet = balance - ethTransactionFee;
                let amountInTargetAddress = balance - totalETH;
                const balanceOfTarget = await arbWeb3.eth.getBalance(targetAddress);

                let arbHotWalletAddress = arbWeb3.eth.accounts.privateKeyToAccount(arbHotWallet).address;
                const balanceOfHotWallet = await bnbWeb3.eth.getBalance(arbHotWalletAddress);
                if (balanceOfHotWallet < amountInHotWallet) {
                    await saveLogs({
                        error: "insufficent balance in hot wallet! in bridgeARBToARB", transactionData: {
                            balance, privateKey, arbHotWalletAddress, resultArbWallets,
                            amountInHotWallet, arbHotWallet, targetAddress, resultArb2Wallets
                        }
                    });
                    return false;
                }

                const promises = [
                    sendMultipleTranscation(balance, privateKey, arbHotWalletAddress, resultArbWallets, arbWeb3, "ETH", "ARB HotWallet"),
                    sendMultipleTranscation(amountInHotWallet, arbHotWallet, targetAddress, resultArb2Wallets, arbWeb3, "ETH", "target")
                ];

                const results = await Promise.all(promises);
                const allFulfilled = results.every(result => result.success === true);
                if (allFulfilled) {
                    await transactionModel.updateOne({ allotedWallet: { $regex: senderAddress, $options: "i" } }, { status: true, trxHash: results[1].data });
                    await bot.telegram.sendMessage(chatId, "Transaction was successfull!", { parse_mode: 'HTML' });
                } else {
                    await saveLogs({ error: "Transaction failed in bridgeARBToARB", transactionData: { data: JSON.stringify(results) } });
                }

            } else {
                console.log("insufficient balance for mixer transactions!, please send more amount");
                await wait();
                bridgeARBToARB(privateKey, targetAddress, chatId)
            }
        } else {
            await wait();
            bridgeARBToARB(privateKey, targetAddress, chatId)
        }
    } catch (error) {
        console.log(`Error transferring ARB to ARB. ${error.message}`)
        await saveLogs({ error: `Error transferring ARB to ARB. ${error.message}`, transactionData: { privateKey, targetAddress } });
    }
}