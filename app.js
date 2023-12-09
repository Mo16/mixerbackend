"use strict";
require("dotenv").config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const morgan = require('morgan');
const bodyparser = require("body-parser");
const cors = require('cors');
const mongoSanitize = require("express-mongo-sanitize")
const connectDB = require('./server/database/connection');
const { runBot } = require('./server/controller/bot/bot')
require('./server/controller/user/user').exec;
const PORT = process.env.PORT || 8775;
const app = express();
app.use(cors());

const options = {
  key: fs.readFileSync("./ssl/private.key"),
  cert: fs.readFileSync("./ssl/certificate.crt")
};

//log requests
app.use(morgan('tiny'));

app.use(
    mongoSanitize({
        replaceWith: '_',
    }),
);

// mongodb connection
connectDB();

// support parsing of application/json type post data
app.use(bodyparser.json());
// parse request to body-parser
app.use(bodyparser.urlencoded({ extended: true }));

app.use('/', require('./server/routes/router'));

runBot();

https.createServer(options, app).listen(PORT, ()=> { console.log(`Server is running on ${Date.now()}`)});