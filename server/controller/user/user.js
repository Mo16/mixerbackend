const transactionModel = require("../../models/transactionModel");
const settingModel = require("../../models/settingModel");
const { checkValidation, verifyValue, isValidAddress } = require("../../utils/validator");
const { generateMnemonicPhrase, createAccount, minimumAmount } = require("../../utils/helper");
const { aesEncrypt, aesDecrypt } = require("../../utils/encrypt");
const { Telegraf } = require("telegraf");
const { getBridgeNumber } = require("../config/index")
const { bridgeBNBToETH, bridgeBNBToARB, bridgeETHToARB, bridgeARBToETH, bridgeETHToBNB, bridgeARBToBNB, bridgeETHToETH, bridgeBNBToBNB, bridgeARBToARB } = require("../bridges/bridges");
const { bnbWeb3, saveLogs } = require("../../utils/helper");


const bot = new Telegraf(process.env.BOT_TOKEN);

const chains = ["ETH", "BNB", "ARB"];

const generateMnemonic = async () => {
    const phrase = generateMnemonicPhrase();
    if (phrase) {
        const { mnemonic, count } = phrase;
        const encryptedPhrase = aesEncrypt(mnemonic);
        const settingsData = new settingModel({
            phrase: encryptedPhrase,
            phraseCount: count
        });
        const isSaved = await settingsData.save();
        if (isSaved._id) {
            console.log("Phrase saved success");
        } else {
            console.log("error while saving phrase");
        }
    } else {
        console.log("error while generating phrase");
    }
}
generateMnemonic();

const bridge = async (privateKey, targetAddress, step, chatId) => {
    try {
        if (privateKey == "") {
            console.log(`Unable to retrieve private key. It is empty or null.`);
        }

        try {
            const account = bnbWeb3.eth.accounts.privateKeyToAccount(privateKey);
        } catch (error) {
            console.log(
                `Invalid private key. Please double-check and ensure the provided key is correct.`
            );
            await saveLogs({ error: "Invalid private key. Please double-check and ensure the provided key is correct.", transactionData: { privateKey, targetAddress } })
        }

        switch (step) {
            case 0:
                await bridgeBNBToETH(privateKey, targetAddress, chatId);
                break;
            case 1:
                await bridgeBNBToARB(privateKey, targetAddress, chatId);
                break;
            case 2:
                await bridgeETHToARB(privateKey, targetAddress, chatId);
                break;
            case 3:
                await bridgeARBToETH(privateKey, targetAddress, chatId);
                break;
            case 4:
                await bridgeETHToBNB(privateKey, targetAddress, chatId);
                break;
            case 5:
                await bridgeARBToBNB(privateKey, targetAddress, chatId);
                break;
            case 6:
                await bridgeETHToETH(privateKey, targetAddress, chatId);
                break;
            case 7:
                await bridgeBNBToBNB(privateKey, targetAddress, chatId);
                break;
            case 8:
                await bridgeARBToARB(privateKey, targetAddress, chatId);
                break;
            default:
                console.log("Unknown action. Please provide a valid action.");
        }
    } catch (error) {
        console.log("Error: ", error.message);
        await saveLogs({ error: error.message, transactionData: { privateKey, targetAddress } })
    }
}

exports.initiateTransaction = async (req, res) => {
    try {
        let data = checkValidation(req.body);
        if (data["success"] === true) {
            data = data["data"];
        } else {
            return res.status(400).send({ success: false, message: "Missing field", data: {}, errors: data.errors });
        }

        if (!verifyValue(data.fromChain) || !chains.includes(data.fromChain)) {
            return res.status(400).send({ success: false, message: "Invalid from chain", errors: "" });
        } else if (!verifyValue(data.toChain) || !chains.includes(data.toChain)) {
            return res.status(400).send({ success: false, message: "Invalid to chain", errors: "" });
        } else if (!verifyValue(data.recipientWallet) || !isValidAddress(data.recipientWallet)) {
            return res.status(400).send({ success: false, message: "Invalid recipient address", errors: "" });
        } else if (!verifyValue(data.chatId)) {
            return res.status(400).send({ success: false, message: "Invalid recipient address", errors: "" });
        } else {
            const settingsData = await settingModel.findOne();
            if (settingsData) {
                const decryptedPhrasse = aesDecrypt(settingsData.phrase);
                const newAccount = createAccount(decryptedPhrasse, settingsData.phraseCount);
                if (newAccount.success) {
                    const countUpdated = await settingModel.updateOne({ _id: settingsData._id }, { $inc: { phraseCount: 1 } });
                    if (countUpdated.modifiedCount === 1) {
                        const { address, privateKey } = newAccount.data;
                        const newUser = new transactionModel({
                            fromChain: data.fromChain,
                            toChain: data.toChain,
                            recipientWallet: data.recipientWallet,
                            allotedWallet: address,
                            allotedWalletKey: privateKey
                        });
                        const userSaved = await newUser.save();
                        if (userSaved._id) {
                            const bridgeNumber = await getBridgeNumber(data.fromChain, data.toChain);
                            const minAmt = await minimumAmount(bridgeNumber);
                            const message = `✨ Start Your MIXER-BOT Transfer\n\n🔄 You're Sending: ${data.fromChain} \n🔄 You'll Receive: ${data.toChain} \n\n🚀Send ${data.fromChain} (min. ${minAmt.toFixed(5)} ${data.fromChain}) Here 👇👇👇\n<i>${address}</i> \n\n😎 Recipient: ${data.recipientWallet}\n\n🛑IMPORTANT:\n1. Send your funds within the next 5 minutes.\n\nHappy Mixing 🕵🚀🎉🔐`;

                            const msgSend = await bot.telegram.sendMessage(data.chatId, message, { parse_mode: 'HTML' });
                            if (msgSend) {
                                bridge(privateKey, data.recipientWallet, bridgeNumber, data.chatId);
                                return res.status(200).send({ success: true, message: "Transaction initiated", errors: "" });
                            } else {
                                return res.status(203).send({ success: false, message: "Error while sending notification to chat", errors: msgSend.message });
                            }
                        } else {
                            return res.status(203).send({ success: false, message: "Error while saving transaction data", errors: "" });
                        }
                    } else {
                        return res.status(203).send({ success: false, message: "Error while updating phrase count", errors: "" });
                    }
                } else {
                    return res.status(203).send({ success: false, message: "Error while generating new wallet", errors: newAccount.errors });
                }
            } else {
                return res.status(203).send({ success: false, message: "Settings data not found", errors: "" });
            }
        }
    } catch (error) {
        return res.status(500).send({ success: false, message: "Error while process your request", errors: error.message });
    }
}