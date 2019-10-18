"use strict";

const builder = require("botbuilder");
const logger = require("../lib/logger.js");
const helper = require("node-red-viseo-helper");
const botmgr = require("node-red-viseo-bot-manager");

// server
const msBot = require("../lib/bot.js");
const server = require("../lib/server.js");

const DEFAULT_TYPING_DELAY = 2000;
const MINIMUM_TYPING_DELAY = 200;
let globalTypingDelay;


module.exports = function (RED) {
    logger.init(RED);

    //******************************************
    //
    // *****************************************
    const MSBotNode = function (n) {

        RED.nodes.createNode(this, n);
        let node = this;

        node.context().global.set("VISEO_BOT_MAKER_KEY", n.VISEOkey);

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
            port: {type: "text"},
            appId: {type: "text"},
            appPass: {type: "text"}
        }
    });

    //******************************************
    // * node
    // *****************************************

    const MSBotInNode = function (config) {

        const botConfig = RED.nodes.getNode(config.bot);
        RED.nodes.createNode(this, config);
        let node = this;

        if (botConfig.port) {
            botConfig.port = parseInt(botConfig.port);
        }

        globalTypingDelay = botConfig.delay || DEFAULT_TYPING_DELAY;

        config.appId = botConfig.appId;
        config.appPass = botConfig.appPass;
        config.verbose = botConfig.verbose;
        config.port = botConfig.port;

        startServer(node, config, RED);
    };
    RED.nodes.registerType("MSBot receiver", MSBotInNode);
};

// *****************************************************
// * SERVER                                            *
// *****************************************************

let REPLY_HANDLER = {};
const startServer = (node, config, RED) => {

    //restart server
    if (REPLY_HANDLER[node.id]) helper.removeListener('reply', REPLY_HANDLER[node.id]);

    // **********************************

    server.start((err, bot) => {

        if (err) {
            let status = "disconected (" + err.message + ")";
            return node.status({fill: "red", shape: "ring", text: status});
        }
        node.status({fill: "green", shape: "dot", text: "connected"});

       try{
           msBot.bindDialogs(bot, (err, data, type) => {
               helper.emitEvent(type, node, data, config);

               // Log activity
               try { setTimeout(function() { helper.trackActivities(node)},0); }
               catch(err) { console.log(err); }

               if (type === "received") {
                   return node.send(data);
               }
           });
       } catch(err){}

        // Handle all reply
        REPLY_HANDLER[node.id] = (node, data, config) => {
            try {
                reply(bot, node, data, config)
            } catch (ex) {
                console.log(ex);
            }
        };
        helper.listenEvent('reply', REPLY_HANDLER[node.id])

    }, config, RED);
};

// ************************************************************************
// * REPLY                                                                *
// ************************************************************************

const reply = (bot, node, data, config) => {
    //check it's the last message
    let timestamp = data.message.timestamp;

    let context = botmgr.getContext(data);

    if (timestamp && context.lastMessageDate !== timestamp) {
        return false;
    }

    // Assume we send the message to the current user address
    let address = botmgr.getUserAddress(data);
    if (!address || address.carrier !== "botbuilder") return false;

    // Building the message
    let message;

    if (data.customReply) {
        message = data.customReply;
        message.address = address;
        message.data = {
            type: message.type
        };
    } else {
        message = getMessage(node, address, data.reply, timestamp === undefined);
        if (!message) return false;

        message.address(address);

        // Adding the metadata
        if (data.metadata) {
            message.data.value = data.metadata;
            message.data.valueType = data.metadataType;
        }
    }

    let customTyping = callback => {
        try {
            let typing = new builder.Message();
            typing.data.type = "typing";
            typing.address(address);
            bot.send(typing, err => {
                if (err) {
                    return node.warn(err);
                }
                // <continue> and consume the event
                callback();
            });
        } catch (ex) {
            node.warn(ex);
        }
    };

    // Send the message
    let doReply = () => {
        try {
            bot.send(message, err => {
                if (err) {
                    return node.warn(err);
                }
                // <continue> and consume the event
                helper.fireAsyncCallback(data);
            });
        } catch (ex) {
            node.warn(ex);
        }
    };

    if (message.data.type === "event") {
        doReply();
    } else {
        // Handle the delay
        let delay;
        if (!config.delay || config.delay === 0) {
            delay = globalTypingDelay;
        } else {
            delay = config.delay;
        }
        delay = delay <= MINIMUM_TYPING_DELAY ? MINIMUM_TYPING_DELAY : delay;
        delayReply(delay, data, doReply, customTyping);
    }
};

const delayReply = (delay, data, callback, customTyping) => {
    let convId = botmgr.getConvId(data);
    let session = getSession(data);
    if (session) {
        msBot.typing(session, () => {
            let handle = setTimeout(callback, delay);
            msBot.saveTimeout(convId, handle);
        });
    } else {
        customTyping(function () {
            let handle = setTimeout(callback, delay);
            msBot.saveTimeout(convId, handle);
        });
    }
};

// ------------------------------------------
//  HELPERS
// ------------------------------------------

const CONTENT_TYPE = {
    jpe: "image/jpeg",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    png: "image/png",
    tif: "image/tiff",
    tiff: "image/tiff",
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    mpe: "video/mpeg",
    mpg: "video/mpeg",
    mov: "video/quicktime"
};

const getSession = data => {
    let context = botmgr.getContext(data);
    return context.session;
};

// ------------------------------------------
//  MESSAGES
// ------------------------------------------

const getMessage = (node, address, replies, isPush) => {
    let msg = new builder.Message();

    // The message will be a carousel
    if (replies.length > 1) {
        msg.attachmentLayout(builder.AttachmentLayout.carousel);
    }

    // Is RAW message
    else if (buildRawMessage(node, msg, replies[0], address, isPush)) {
        // Botbuilder Message (Cortana) should set that for prompt
        if (replies[0].prompt && msg.inputHint) {
            msg.inputHint("expectingInput");
        }
        return msg;
    }

    // One or multiple cards
    for (let reply of replies) {

        let card = (reply.type === "AdaptiveCard") ? getAdaptiveCard(reply) : getHeroCard(reply);

        msg.textFormat("markdown");
        msg.addAttachment(card);

        // Only the latest speech is used
        if (msg.speak && reply.speech) {
            msg.speak(reply.speech === true ? card._speech || "" : reply.speech);
        }

        // Botbuilder Message (Cortana) should set that for prompt
        if (reply.prompt && msg.inputHint) {
            msg.inputHint("expectingInput");
        }
    }

    return msg;
};

const buildQuickReplyObject = obj => {
    return {
        content_type: obj.action === "askLocation" ? "location" : "text",
        title: obj.title,
        payload: obj.value
    };
};

const buildRawMessage = (node, msg, opts, address, isPush) => {
    let contentShare = false;
    for (let button of opts.buttons || [])
        if (button.action === "share") contentShare = true;

    if (opts.type === "signin") {
        const card = new builder.SigninCard();
        card.text(opts.text);

        if (msg.speak && opts.speech) {
            // Set speech value
            msg.speak(opts.speech === true ? opts.text : opts.speech);
        }

        card.button(opts.title, opts.url);
        msg.addAttachment(card);
        return true;
    }

    if (opts.type === "text") {
        let fText = opts.text;

        msg.text(fText);
        if (msg.speak && opts.speech) {
            // Set speech value
            msg.speak(opts.speech === true ? fText : opts.speech);
        }
        return true;
    }

    if (opts.type === "media") {
        let url = helper.absURL(opts.media);
        let type = opts.mediaContentType;

        if (!type || type === "image" || type === "video") {
            let extension = url.split(".").pop();
            let testType = CONTENT_TYPE[extension.toLowerCase()];
            if (testType) type = testType;
            else if (type === "image") type = CONTENT_TYPE["png"];
            else type = CONTENT_TYPE["mp4"];
        }

        msg.attachments([
            {
                contentType: type,
                contentUrl: url
            }
        ]);
        return true;
    }

    if (opts.type === "event") {
        msg.data.type = "event";
        msg.data.name = opts.event.name;
        msg.data.value = opts.event.value;
        return true;
    }

    // Work In Progress: Facebook Quick Buttons: Should be exported to a facebook.js hook
    if (opts.type === "quick") {
        let fText = opts.quicktext;
        if (address.channelId === "facebook") {
            fText = fText.replace(/\n\n/g, "\n");
            fText = fText.replace(/\n/g, "\n\n");
        }
        msg.text(fText);

        if (msg.speak && opts.speech) {
            // Set speech value
            msg.speak(opts.speech === true ? fText : opts.speech);
        }

        let isLocation = false;
        let newQuick = [];
        for (let button of opts.buttons) {
            let card = builder.CardAction.imBack(
                undefined,
                button.value,
                button.title
            );
            newQuick.push(card);
            if (button.action === "askLocation") isLocation = true;
        }

        if (isLocation) {
            msg.data.address = {channelId: "facebook"};
            const quickRepliesObject = {
                facebook: {quick_replies: []}
            };
            for (let button of opts.buttons)
                quickRepliesObject.facebook.quick_replies.push(
                    buildQuickReplyObject(button)
                );
            msg.sourceEvent(quickRepliesObject);
        }

        msg.suggestedActions(builder.SuggestedActions.create(undefined, newQuick));
        return true;
    }

    // Backward compatibility
    if (!!opts.attach && undefined === opts.buttons) {
        let url = helper.absURL(opts.attach);
        let extension = url.split(".").pop();
        let type = CONTENT_TYPE[extension.toLowerCase()];
        if (!type) type = url.match(/youtube/) ? "video/mp4" : CONTENT_TYPE["png"];

        msg.attachments([
            {
                contentType: type,
                contentUrl: url
            }
        ]);
        return true;
    }

    return false;
};

const getHeroCard = opts => {
    let card = new builder.HeroCard();
    opts._speech = '';

    // Attach Images to card
    if (!!opts.attach) {
        let url = helper.absURL(opts.attach);
        card.images([builder.CardImage.create(undefined, url)]);
    }

    // Attach Title to card
    if (!!opts.title) {
        opts._speech += opts.title + " ";
        card.title(opts.title);
    }

    // Attach Subtext, appears just below subtitle, differs from Subtitle in font styling only.
    if (!!opts.subtext) {
        opts._speech += opts.subtext;
        card.text(opts.subtext);
    }

    // Attach Subtitle, appears just below Title field, differs from Title in font styling only.
    if (!!opts.subtitle) {
        opts._speech += opts.subtitle;
        card.subtitle(opts.subtitle);
    }

    // Attach Buttons to card
    let buttons = opts.buttons;
    if (undefined !== buttons) {
        var btns = [];
        for (let button of buttons) {
            if ("string" === typeof button) {
                btns.push(builder.CardAction.postBack(undefined, button, button));
            } else {
                btns.push(
                    builder.CardAction[button.action](
                        undefined,
                        button.value,
                        button.title
                    )
                );
            }
        }
        card.buttons(btns);
    }

    return card;
};

const getAdaptiveCard = opts => {
    opts._speech = "";
    // Attach Title to card
    if (!!opts.title) {
        opts._speech += opts.title + " ";
    }

    // Attach Subtext, appears just below subtitle, differs from Subtitle in font styling only.
    if (!!opts.subtext) {
        opts._speech += opts.subtext;
    }

    // Attach Subtitle, appears just below Title field, differs from Title in font styling only.
    if (!!opts.subtitle) {
        opts._speech += opts.subtitle;
    }

    return {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: opts
    };
};
