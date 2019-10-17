"use strict";

const builder = require("botbuilder");
const logger = require("../lib/logger.js");
const helper = require("node-red-viseo-helper");
const botmgr = require("node-red-viseo-bot-manager");

// server
const msbot = require("../lib/bot.js");
// const server = require("../lib/server.js");

const DEFAULT_TYPING_DELAY = 2000;
const MINIMUM_TYPING_DELAY = 200;
var globalTypingDelay;

module.exports = function (RED){
    logger.init(RED);

    const MSBotNode = function(n) {

        RED.nodes.createNode(this, n);
        let self = this;
        this.status = "disconected";

       // Reading configuration properties...
        this.botname = n.botname;
        this.baseapiurl = n.baseapiurl;
        this.verbose = n.verboselogging;
        this.port = n.port;
        this.appId = n.appId;
        this.appPass = n.appPass;

    };

    RED.nodes.registerType("MS bot", MSBotNode, {
        credentials: {
            port: { type: "text" },
            appId: { type: "text" },
            appPass: { type: "text" }
        }
    });

    const MSBotInNode = function(config){

        const botConfig = RED.nodes.getNode(config.bot);

        RED.nodes.createNode(this, config);

        let node = this;

        

    };
    RED.nodes.registerType("MSBot receiver", MSBotInNode);
};
