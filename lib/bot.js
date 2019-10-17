"use strict";

const helper  = require('node-red-viseo-helper');
const botmgr  = require('node-red-viseo-bot-manager');

const bindDialogs = exports.bindDialogs = (bot, callback) => {

    bot.on('contactRelationUpdate', (message) => {
        if (message.action !== 'add') { /* delete user data */ return; }

        let data = helper.buildMessageFlow({ message, 'payload': message.text }, {});

        let context = botmgr.getContext(data);
        context.bot = bot;
        context.lastMessageDate = message.timestamp;

        callback(undefined, data, 'greeting');
    });

    // Root Dialog
    bot.on('incoming', (msg) => { handleIncomingMessage(bot, msg, callback); });
    bot.dialog('/', [(session) => { }]);
};

const handleIncomingMessage = (bot, message, callback) => {
    // Fix
    if (!message.address || !message.address.serviceUrl ){ return; }

    // Build data
    let data = botmgr.buildMessageFlow({ 'message': JSON.parse(JSON.stringify(message)), 'payload': message.text }, { agent: 'botbuilder' })

    // Add context object to store the lifetime of the stream
    let context     = botmgr.getContext(data);
    context.bot     = bot;

    // Clear timeouts
    let convId  = botmgr.getConvId(data);
    clearHandles(convId);

    // Handle Prompt
    if (botmgr.hasDelayedCallback(convId, data.message)) return;
    context.lastMessageDate = message.timestamp;
    callback(undefined, data, 'received');
};

var TIMEOUT_HANDLES = {};
const saveTimeout = exports.saveTimeout = (convId, handle) => {
    if (!TIMEOUT_HANDLES[convId])
        TIMEOUT_HANDLES[convId] = [];
    TIMEOUT_HANDLES[convId].push(handle)
};

const clearHandles = exports.clearTimeout = (convId) => {
    if (!TIMEOUT_HANDLES[convId]) return;

    for (let handle of TIMEOUT_HANDLES[convId]){
        clearTimeout(handle);
    }
    TIMEOUT_HANDLES[convId] = []
};

const typing = exports.typing = (session, callback) => {
    if (undefined === session) return;
    session.sendTyping();
    callback();
};
