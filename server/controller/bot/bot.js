const { Telegraf } = require("telegraf");
const path = require("path");
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const imagePath = path.join(__dirname, 'mixer-bot.jpg');
const imageBuffer = fs.readFileSync(imagePath);

const start = async (ctx) => {
    ctx.replyWithPhoto(
    { source: imageBuffer },
    {
        caption: "Let's get started, shall we?\n",
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{
                    text: '👉 Click Here 👈',
                    web_app: { url: `${process.env.WEB_LINK}/?id=${ctx.update.message.chat.id}` },
                }],
            ],
        },
    });
};


exports.runBot = async () => {
    try {
        bot.start(async (ctx) => {
            if (ctx.update.message.chat.type === "private") {
                await start(ctx)
            }
        });

        bot.launch();
    } catch (error) {
        console.log(" error: " + error.message);
    }
};