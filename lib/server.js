"use strict";

const fs = require('fs');
const builder = require('botbuilder');
const express = require('express');
const app = express();

let bot;

let verbose = (CONFIG.server || {}).verbose;

let server;

// Exports methods

exports.start = (callback, options, RED) => {
    verbose = options.verbose;
    createServer((err, bot) => {
        if (err) return callback(err);
        callback(undefined, bot);
    }, options, RED)
};

const createServer = (callback, options, RED) => {
    let opt = options || {};

    let azureConfig = {};
    if (opt.appId) {
        azureConfig.appId = opt.appId;
        azureConfig.appPassword = opt.appPass;
    } else if (CONFIG.microsoft) {
        azureConfig.appId = CONFIG.microsoft.bot.appId;
        azureConfig.appPassword = CONFIG.microsoft.bot.appPassword;
    }
    let connector = new builder.ChatConnector(azureConfig);

    if (!server) {


        // Create server
        server = require('http').createServer(app);

        // Trap errors
        server.on('error', function (err) {
            error(err.message);
            callback(err);
        });

        // Start listening on port
        server.listen(opt.port, () => {
            if (verbose) info('Server listening to ' + (opt.port || CONFIG.server.port));
        });

        // Add GET path for debugging
        app.get('/api/v1/messages/', (req, res, next) => {
            res.send("Hello I'm a Bot !");
            return next();
        });

        // Add ChatBot connector
        // let azureConfig = {};
        // if (opt.appId) {
        //     azureConfig.appId = opt.appId;
        //     azureConfig.appPassword = opt.appPass;
        // } else if (CONFIG.microsoft) {
        //     azureConfig.appId = CONFIG.microsoft.bot.appId;
        //     azureConfig.appPassword = CONFIG.microsoft.bot.appPassword;
        // }
        // let connector = new builder.ChatConnector(azureConfig);

        // app.post('/api/v1/messages', /*connector.listen()*/ (req, res) => {
        //     connector.listen()(req, res);
        // });

        // bot = bindConnector(connector, opt);
    }

    app.post('/api/v1/messages', /*connector.listen()*/ (req, res) => {
        connector.listen()(req, res);
    });


    // bot = bindConnector(connector, opt);
    callback(undefined, connector);

};

const bindConnector = exports.bindConnector = (connector, options) => {

    let bot = new builder.UniversalBot(connector, {
        persistUserData: false,
        persistConversationData: false,
        autoBatchDelay: 0,
        storage: new builder.MemoryBotStorage(),
        localizerSettings: {
            botLocalePath: "./locale",
            defaultLocale: options.defaultLocale || "en_US"
        }
    });

    bot.use(builder.Middleware.dialogVersion(
        {
            version: 1.0,
            resetCommand: options.resetCommand || /^reset/i
        }
    ));

    // Logging Middleware
    if (verbose) {
        bot.on('incoming', (msg) => {
            if (!msg.address || !msg.address.serviceUrl) return;
            info("Message incoming:" + JSON.stringify(msg));
        });
        bot.on('send', (msg) => {
            if (!msg.address || !msg.address.serviceUrl) return;
            info("Message outgoing:" + JSON.stringify(msg));
        });
    }

    bot.on('error', (err) => {
        console.log("Message error:", err);
    });
    return bot;
};


