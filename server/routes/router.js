"use strict";
const express = require("express");
const route = express.Router();
const user = require("../controller/user/user");

route.get("/api", (req, res) => {
    res.status(200).send({ success: true, message: "API Is running", errors: "" })
});

route.post("/api/initiate-transaction", user.initiateTransaction);


module.exports = route;