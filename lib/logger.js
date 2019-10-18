"use strict";

global.info = console.log;
global.error = console.log;
global.warn = console.log;

exports.init = (RED) => {
    global.info = RED.log.info;
    global.error = RED.log.error;
    global.warn = RED.log.warn;
};

// Catch all
process.on('uncaughtException', (err) => {
    error('Caught exception: ' + err.stack);
});
