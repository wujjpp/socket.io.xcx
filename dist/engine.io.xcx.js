(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.xcxEngineIO = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":2}],2:[function(require,module,exports){
module.exports = require('./socket');

/**
 * Exports parser
 *
 * @api public
 *
 */
module.exports.parser = require('engine.io-parser');

},{"./socket":4,"engine.io-parser":16}],3:[function(require,module,exports){
(function (global){
/**
 * JSON parse.
 *
 * @see Based on jQuery#parseJSON (MIT) and JSON2
 * @api private
 */

var rvalidchars = /^[\],:{}\s]*$/;
var rvalidescape = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
var rvalidtokens = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
var rtrimLeft = /^\s+/;
var rtrimRight = /\s+$/;

module.exports = function parsejson(data) {

  if ('string' != typeof data || !data) {
    return null;
  }

  data = data.replace(rtrimLeft, '').replace(rtrimRight, '');

  // Attempt to parse using the native JSON parser first
  if ((JSON && JSON.parse) || (global && global.JSON && global.JSON.parse)) {
    return JSON.parse(data);
  }

  if (rvalidchars.test(data.replace(rvalidescape, '@')
      .replace(rvalidtokens, ']')
      .replace(rvalidbraces, ''))) {
    return (new Function('return ' + data))();
  }
};
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],4:[function(require,module,exports){
(function (global){
/**
 * Module dependencies.
 */

var transports = require('./transports/index');
var Emitter = require('component-emitter');
var debug = require('debug')('engine.io-client:socket');
var index = require('indexof');
var parser = require('engine.io-parser');
var parseuri = require('parseuri');
var parsejson = require('./parsejson');
var parseqs = require('parseqs');

/**
 * Module exports.
 */

module.exports = Socket;

/**
 * Socket constructor.
 *
 * @param {String|Object} uri or options
 * @param {Object} options
 * @api public
 */

function Socket(uri, opts) {
    if (!(this instanceof Socket)) return new Socket(uri, opts);

    opts = opts || {};

    if (uri && 'object' === typeof uri) {
        opts = uri;
        uri = null;
    }

    if (uri) {
        uri = parseuri(uri);
        opts.hostname = uri.host;
        opts.secure = uri.protocol === 'https' || uri.protocol === 'wss';
        opts.port = uri.port;
        if (uri.query) opts.query = uri.query;
    } else if (opts.host) {
        opts.hostname = parseuri(opts.host).host;
    }

    this.secure = null != opts.secure ? opts.secure
        : (global.location && 'https:' === location.protocol);

    if (opts.hostname && !opts.port) {
        // if no port is specified manually, use the protocol default
        opts.port = this.secure ? '443' : '80';
    }

    this.agent = opts.agent || false;
    this.hostname = opts.hostname ||
        (global.location ? location.hostname : 'localhost');
    this.port = opts.port || (global.location && location.port
            ? location.port
            : (this.secure ? 443 : 80));
    this.query = opts.query || {};
    if ('string' === typeof this.query) this.query = parseqs.decode(this.query);
    this.upgrade = false !== opts.upgrade;
    this.path = (opts.path || '/engine.io').replace(/\/$/, '') + '/';
    this.forceJSONP = !!opts.forceJSONP;
    this.jsonp = false !== opts.jsonp;
    this.forceBase64 = !!opts.forceBase64;
    this.enablesXDR = !!opts.enablesXDR;
    this.timestampParam = opts.timestampParam || 't';
    this.timestampRequests = opts.timestampRequests;
    this.transports = opts.transports || ['websocket'];
    this.readyState = '';
    this.writeBuffer = [];
    this.prevBufferLen = 0;
    this.policyPort = opts.policyPort || 843;
    this.rememberUpgrade = opts.rememberUpgrade || false;
    this.binaryType = null;
    this.onlyBinaryUpgrades = opts.onlyBinaryUpgrades;
    this.perMessageDeflate = false !== opts.perMessageDeflate ? (opts.perMessageDeflate || {}) : false;

    if (true === this.perMessageDeflate) this.perMessageDeflate = {};
    if (this.perMessageDeflate && null == this.perMessageDeflate.threshold) {
        this.perMessageDeflate.threshold = 1024;
    }

    // SSL options for Node.js client
    this.pfx = opts.pfx || null;
    this.key = opts.key || null;
    this.passphrase = opts.passphrase || null;
    this.cert = opts.cert || null;
    this.ca = opts.ca || null;
    this.ciphers = opts.ciphers || null;
    this.rejectUnauthorized = opts.rejectUnauthorized === undefined ? null : opts.rejectUnauthorized;
    this.forceNode = !!opts.forceNode;

    // other options for Node.js client
    var freeGlobal = typeof global === 'object' && global;
    if (freeGlobal.global === freeGlobal) {
        if (opts.extraHeaders && Object.keys(opts.extraHeaders).length > 0) {
            this.extraHeaders = opts.extraHeaders;
        }

        if (opts.localAddress) {
            this.localAddress = opts.localAddress;
        }
    }

    // set on handshake
    this.id = null;
    this.upgrades = null;
    this.pingInterval = null;
    this.pingTimeout = null;

    // set on heartbeat
    this.pingIntervalTimer = null;
    this.pingTimeoutTimer = null;

    this.open();
}

Socket.priorWebsocketSuccess = false;

/**
 * Mix in `Emitter`.
 */

Emitter(Socket.prototype);

/**
 * Protocol version.
 *
 * @api public
 */

Socket.protocol = parser.protocol; // this is an int

/**
 * Expose deps for legacy compatibility
 * and standalone browser access.
 */

Socket.Socket = Socket;
Socket.Transport = require('./transport');
Socket.transports = require('./transports/index');
Socket.parser = require('engine.io-parser');

/**
 * Creates transport of the given type.
 *
 * @param {String} transport name
 * @return {Transport}
 * @api private
 */

Socket.prototype.createTransport = function (name) {
    debug('creating transport "%s"', name);
    var query = clone(this.query);

    // append engine.io protocol identifier
    query.EIO = parser.protocol;

    // transport name
    query.transport = name;

    // session id if we already have one
    if (this.id) query.sid = this.id;

    var transport = new transports[name]({
        agent: this.agent,
        hostname: this.hostname,
        port: this.port,
        secure: this.secure,
        path: this.path,
        query: query,
        forceJSONP: this.forceJSONP,
        jsonp: this.jsonp,
        forceBase64: this.forceBase64,
        enablesXDR: this.enablesXDR,
        timestampRequests: this.timestampRequests,
        timestampParam: this.timestampParam,
        policyPort: this.policyPort,
        socket: this,
        pfx: this.pfx,
        key: this.key,
        passphrase: this.passphrase,
        cert: this.cert,
        ca: this.ca,
        ciphers: this.ciphers,
        rejectUnauthorized: this.rejectUnauthorized,
        perMessageDeflate: this.perMessageDeflate,
        extraHeaders: this.extraHeaders,
        forceNode: this.forceNode,
        localAddress: this.localAddress
    });

    return transport;
};

function clone(obj) {
    var o = {};
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            o[i] = obj[i];
        }
    }
    return o;
}

/**
 * Initializes transport to use and starts probe.
 *
 * @api private
 */
Socket.prototype.open = function () {
    var transport;
    if (this.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf('websocket') !== -1) {
        transport = 'websocket';
    } else if (0 === this.transports.length) {
        // Emit error on next tick so it can be listened to
        var self = this;
        setTimeout(function () {
            self.emit('error', 'No transports available');
        }, 0);
        return;
    } else {
        transport = this.transports[0];
    }
    this.readyState = 'opening';

    // Retry with the next transport if the transport is disabled (jsonp: false)
    try {
        transport = this.createTransport(transport);
    } catch (e) {
        this.transports.shift();
        this.open();
        return;
    }

    transport.open();
    this.setTransport(transport);
};

/**
 * Sets the current transport. Disables the existing one (if any).
 *
 * @api private
 */

Socket.prototype.setTransport = function (transport) {
    debug('setting transport %s', transport.name);
    var self = this;

    if (this.transport) {
        debug('clearing existing transport %s', this.transport.name);
        this.transport.removeAllListeners();
    }

    // set up transport
    this.transport = transport;

    // set up transport listeners
    transport
        .on('drain', function () {
            self.onDrain();
        })
        .on('packet', function (packet) {
            self.onPacket(packet);
        })
        .on('error', function (e) {
            self.onError(e);
        })
        .on('close', function () {
            self.onClose('transport close');
        });
};

/**
 * Probes a transport.
 *
 * @param {String} transport name
 * @api private
 */

Socket.prototype.probe = function (name) {
    debug('probing transport "%s"', name);
    var transport = this.createTransport(name, {probe: 1});
    var failed = false;
    var self = this;

    Socket.priorWebsocketSuccess = false;

    function onTransportOpen() {
        if (self.onlyBinaryUpgrades) {
            var upgradeLosesBinary = !this.supportsBinary && self.transport.supportsBinary;
            failed = failed || upgradeLosesBinary;
        }
        if (failed) return;

        debug('probe transport "%s" opened', name);
        transport.send([{type: 'ping', data: 'probe'}]);
        transport.once('packet', function (msg) {
            if (failed) return;
            if ('pong' === msg.type && 'probe' === msg.data) {
                debug('probe transport "%s" pong', name);
                self.upgrading = true;
                self.emit('upgrading', transport);
                if (!transport) return;
                Socket.priorWebsocketSuccess = 'websocket' === transport.name;

                debug('pausing current transport "%s"', self.transport.name);
                self.transport.pause(function () {
                    if (failed) return;
                    if ('closed' === self.readyState) return;
                    debug('changing transport and sending upgrade packet');

                    cleanup();

                    self.setTransport(transport);
                    transport.send([{type: 'upgrade'}]);
                    self.emit('upgrade', transport);
                    transport = null;
                    self.upgrading = false;
                    self.flush();
                });
            } else {
                debug('probe transport "%s" failed', name);
                var err = new Error('probe error');
                err.transport = transport.name;
                self.emit('upgradeError', err);
            }
        });
    }

    function freezeTransport() {
        if (failed) return;

        // Any callback called by transport should be ignored since now
        failed = true;

        cleanup();

        transport.close();
        transport = null;
    }

    // Handle any error that happens while probing
    function onerror(err) {
        var error = new Error('probe error: ' + err);
        error.transport = transport.name;

        freezeTransport();

        debug('probe transport "%s" failed because of error: %s', name, err);

        self.emit('upgradeError', error);
    }

    function onTransportClose() {
        onerror('transport closed');
    }

    // When the socket is closed while we're probing
    function onclose() {
        onerror('socket closed');
    }

    // When the socket is upgraded while we're probing
    function onupgrade(to) {
        if (transport && to.name !== transport.name) {
            debug('"%s" works - aborting "%s"', to.name, transport.name);
            freezeTransport();
        }
    }

    // Remove all listeners on the transport and on self
    function cleanup() {
        transport.removeListener('open', onTransportOpen);
        transport.removeListener('error', onerror);
        transport.removeListener('close', onTransportClose);
        self.removeListener('close', onclose);
        self.removeListener('upgrading', onupgrade);
    }

    transport.once('open', onTransportOpen);
    transport.once('error', onerror);
    transport.once('close', onTransportClose);

    this.once('close', onclose);
    this.once('upgrading', onupgrade);

    transport.open();
};

/**
 * Called when connection is deemed open.
 *
 * @api public
 */

Socket.prototype.onOpen = function () {
    debug('socket open');
    this.readyState = 'open';
    Socket.priorWebsocketSuccess = 'websocket' === this.transport.name;
    this.emit('open');
    this.flush();

    // we check for `readyState` in case an `open`
    // listener already closed the socket
    if ('open' === this.readyState && this.upgrade && this.transport.pause) {
        debug('starting upgrade probes');
        for (var i = 0, l = this.upgrades.length; i < l; i++) {
            this.probe(this.upgrades[i]);
        }
    }
};

/**
 * Handles a packet.
 *
 * @api private
 */

Socket.prototype.onPacket = function (packet) {
    if ('opening' === this.readyState || 'open' === this.readyState ||
        'closing' === this.readyState) {
        debug('socket receive: type "%s", data "%s"', packet.type, packet.data);

        this.emit('packet', packet);

        // Socket is live - any packet counts
        this.emit('heartbeat');

        switch (packet.type) {
            case 'open':
                this.onHandshake(parsejson(packet.data));
                break;

            case 'pong':
                this.setPing();
                this.emit('pong');
                break;

            case 'error':
                var err = new Error('server error');
                err.code = packet.data;
                this.onError(err);
                break;

            case 'message':
                this.emit('data', packet.data);
                this.emit('message', packet.data);
                break;
        }
    } else {
        debug('packet received with socket readyState "%s"', this.readyState);
    }
};

/**
 * Called upon handshake completion.
 *
 * @param {Object} handshake obj
 * @api private
 */

Socket.prototype.onHandshake = function (data) {
    this.emit('handshake', data);
    this.id = data.sid;
    this.transport.query.sid = data.sid;
    this.upgrades = this.filterUpgrades(data.upgrades);
    this.pingInterval = data.pingInterval;
    this.pingTimeout = data.pingTimeout;
    this.onOpen();
    // In case open handler closes socket
    if ('closed' === this.readyState) return;
    this.setPing();

    // Prolong liveness of socket on heartbeat
    this.removeListener('heartbeat', this.onHeartbeat);
    this.on('heartbeat', this.onHeartbeat);
};

/**
 * Resets ping timeout.
 *
 * @api private
 */

Socket.prototype.onHeartbeat = function (timeout) {
    clearTimeout(this.pingTimeoutTimer);
    var self = this;
    self.pingTimeoutTimer = setTimeout(function () {
        if ('closed' === self.readyState) return;
        self.onClose('ping timeout');
    }, timeout || (self.pingInterval + self.pingTimeout));
};

/**
 * Pings server every `this.pingInterval` and expects response
 * within `this.pingTimeout` or closes connection.
 *
 * @api private
 */

Socket.prototype.setPing = function () {
    var self = this;
    clearTimeout(self.pingIntervalTimer);
    self.pingIntervalTimer = setTimeout(function () {
        debug('writing ping packet - expecting pong within %sms', self.pingTimeout);
        self.ping();
        self.onHeartbeat(self.pingTimeout);
    }, self.pingInterval);
};

/**
 * Sends a ping packet.
 *
 * @api private
 */

Socket.prototype.ping = function () {
    var self = this;
    this.sendPacket('ping', function () {
        self.emit('ping');
    });
};

/**
 * Called on `drain` event
 *
 * @api private
 */

Socket.prototype.onDrain = function () {
    this.writeBuffer.splice(0, this.prevBufferLen);

    // setting prevBufferLen = 0 is very important
    // for example, when upgrading, upgrade packet is sent over,
    // and a nonzero prevBufferLen could cause problems on `drain`
    this.prevBufferLen = 0;

    if (0 === this.writeBuffer.length) {
        this.emit('drain');
    } else {
        this.flush();
    }
};

/**
 * Flush write buffers.
 *
 * @api private
 */

Socket.prototype.flush = function () {
    if ('closed' !== this.readyState && this.transport.writable && !this.upgrading && this.writeBuffer.length) {
        debug('flushing %d packets in socket', this.writeBuffer.length);
        this.transport.send(this.writeBuffer);
        // keep track of current length of writeBuffer
        // splice writeBuffer and callbackBuffer on `drain`
        this.prevBufferLen = this.writeBuffer.length;
        this.emit('flush');
    }else{
    }
};

/**
 * Sends a message.
 *
 * @param {String} message.
 * @param {Function} callback function.
 * @param {Object} options.
 * @return {Socket} for chaining.
 * @api public
 */

Socket.prototype.write =
    Socket.prototype.send = function (msg, options, fn) {
        this.sendPacket('message', msg, options, fn);
        return this;
    };

/**
 * Sends a packet.
 *
 * @param {String} packet type.
 * @param {String} data.
 * @param {Object} options.
 * @param {Function} callback function.
 * @api private
 */

Socket.prototype.sendPacket = function (type, data, options, fn) {
    if ('function' === typeof data) {
        fn = data;
        data = undefined;
    }

    if ('function' === typeof options) {
        fn = options;
        options = null;
    }

    if ('closing' === this.readyState || 'closed' === this.readyState) {
        return;
    }

    options = options || {};
    options.compress = false !== options.compress;

    var packet = {
        type: type,
        data: data,
        options: options
    };
    this.emit('packetCreate', packet);
    this.writeBuffer.push(packet);
    if (fn) this.once('flush', fn);
    this.flush();
};

/**
 * Closes the connection.
 *
 * @api private
 */

Socket.prototype.close = function () {
    if ('opening' === this.readyState || 'open' === this.readyState) {
        this.readyState = 'closing';

        var self = this;

        if (this.writeBuffer.length) {
            this.once('drain', function () {
                if (this.upgrading) {
                    waitForUpgrade();
                } else {
                    close();
                }
            });
        } else if (this.upgrading) {
            waitForUpgrade();
        } else {
            close();
        }
    }

    function close() {
        self.onClose('forced close');
        debug('socket closing - telling transport to close');
        self.transport.close();
    }

    function cleanupAndClose() {
        self.removeListener('upgrade', cleanupAndClose);
        self.removeListener('upgradeError', cleanupAndClose);
        close();
    }

    function waitForUpgrade() {
        // wait for upgrade to finish since we can't send packets while pausing a transport
        self.once('upgrade', cleanupAndClose);
        self.once('upgradeError', cleanupAndClose);
    }

    return this;
};

/**
 * Called upon transport error
 *
 * @api private
 */

Socket.prototype.onError = function (err) {
    debug('socket error %j', err);
    Socket.priorWebsocketSuccess = false;
    this.emit('error', err);
    this.onClose('transport error', err);
};

/**
 * Called upon transport close.
 *
 * @api private
 */

Socket.prototype.onClose = function (reason, desc) {
    if ('opening' === this.readyState || 'open' === this.readyState || 'closing' === this.readyState) {
        debug('socket close with reason: "%s"', reason);
        var self = this;

        // clear timers
        clearTimeout(this.pingIntervalTimer);
        clearTimeout(this.pingTimeoutTimer);

        // stop event from firing again for transport
        this.transport.removeAllListeners('close');

        // ensure transport won't stay open
        this.transport.close();

        // ignore further transport communication
        this.transport.removeAllListeners();

        // set ready state
        this.readyState = 'closed';

        // clear session id
        this.id = null;

        // emit close event
        this.emit('close', reason, desc);

        // clean buffers after, so users can still
        // grab the buffers on `close` event
        self.writeBuffer = [];
        self.prevBufferLen = 0;
    }
};

/**
 * Filters upgrades, returning only those matching client transports.
 *
 * @param {Array} server upgrades
 * @api private
 *
 */

Socket.prototype.filterUpgrades = function (upgrades) {
    var filteredUpgrades = [];
    for (var i = 0, j = upgrades.length; i < j; i++) {
        if (~index(this.transports, upgrades[i])) filteredUpgrades.push(upgrades[i]);
    }
    return filteredUpgrades;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./parsejson":3,"./transport":5,"./transports/index":6,"component-emitter":12,"debug":14,"engine.io-parser":16,"indexof":20,"parseqs":22,"parseuri":23}],5:[function(require,module,exports){
/**
 * Module dependencies.
 */

var parser = require('engine.io-parser');
var Emitter = require('component-emitter');

/**
 * Module exports.
 */

module.exports = Transport;

/**
 * Transport abstract constructor.
 *
 * @param {Object} options.
 * @api private
 */

function Transport (opts) {
  this.path = opts.path;
  this.hostname = opts.hostname;
  this.port = opts.port;
  this.secure = opts.secure;
  this.query = opts.query;
  this.timestampParam = opts.timestampParam;
  this.timestampRequests = opts.timestampRequests;
  this.readyState = '';
  this.agent = opts.agent || false;
  this.socket = opts.socket;
  this.enablesXDR = opts.enablesXDR;

  // SSL options for Node.js client
  this.pfx = opts.pfx;
  this.key = opts.key;
  this.passphrase = opts.passphrase;
  this.cert = opts.cert;
  this.ca = opts.ca;
  this.ciphers = opts.ciphers;
  this.rejectUnauthorized = opts.rejectUnauthorized;
  this.forceNode = opts.forceNode;

  // other options for Node.js client
  this.extraHeaders = opts.extraHeaders;
  this.localAddress = opts.localAddress;
}

/**
 * Mix in `Emitter`.
 */

Emitter(Transport.prototype);

/**
 * Emits an error.
 *
 * @param {String} str
 * @return {Transport} for chaining
 * @api public
 */

Transport.prototype.onError = function (msg, desc) {
  var err = new Error(msg);
  err.type = 'TransportError';
  err.description = desc;
  this.emit('error', err);
  return this;
};

/**
 * Opens the transport.
 *
 * @api public
 */

Transport.prototype.open = function () {
  if ('closed' === this.readyState || '' === this.readyState) {
    this.readyState = 'opening';
    this.doOpen();
  }

  return this;
};

/**
 * Closes the transport.
 *
 * @api private
 */

Transport.prototype.close = function () {
  if ('opening' === this.readyState || 'open' === this.readyState) {
    this.doClose();
    this.onClose();
  }

  return this;
};

/**
 * Sends multiple packets.
 *
 * @param {Array} packets
 * @api private
 */

Transport.prototype.send = function (packets) {
  if ('open' === this.readyState) {
    this.write(packets);
  } else {
    throw new Error('Transport not open');
  }
};

/**
 * Called upon open
 *
 * @api private
 */

Transport.prototype.onOpen = function () {
  this.readyState = 'open';
  this.writable = true;
  this.emit('open');
};

/**
 * Called with data.
 *
 * @param {String} data
 * @api private
 */

Transport.prototype.onData = function (data) {
  var packet = parser.decodePacket(data, this.socket.binaryType);
  this.onPacket(packet);
};

/**
 * Called with a decoded packet.
 */

Transport.prototype.onPacket = function (packet) {
  this.emit('packet', packet);
};

/**
 * Called upon close.
 *
 * @api private
 */

Transport.prototype.onClose = function () {
  this.readyState = 'closed';
  this.emit('close');
};

},{"component-emitter":12,"engine.io-parser":16}],6:[function(require,module,exports){
/**
 * Module dependencies
 */

var websocket = require('./wxwebsocket');

/**
 * Export transports.
 */

exports.websocket = websocket;
},{"./wxwebsocket":7}],7:[function(require,module,exports){
/**
 * Created by JP on 2017/1/4.
 */

var Transport = require('../transport');
var parser = require('engine.io-parser');
var parseqs = require('parseqs');
var inherit = require('component-inherit');
var yeast = require('yeast');
var debug = require('debug')('engine.io-client:websocket');
//var WebScoket = global.WebSocket || global.MozWebSocket;
function WebSocket(uri) {
    var self = this;
    self.onopen = function () {
    };

    self.onclose = function () {
    };

    self.onmessage = function (data) {
    };

    self.onerror = function (e) {
    };

    self.send = function (data) {
        wx.sendSocketMessage({data: data});
    };

    self.close = function () {
        wx.closeSocket();
    };

    wx.onSocketOpen(function (res) {
        self.onopen();
    });
    wx.onSocketError(function (e) {
        self.onerror(e);
    });
    wx.onSocketMessage(function (res) {
        self.onmessage(res);
    });
    wx.onSocketClose(function (res) {
        self.onclose();
    });
    wx.connectSocket({url: uri});

}

/**
 * Module exports.
 */

module.exports = WS;

/**
 * WebSocket transport constructor.
 *
 * @api {Object} connection options
 * @api public
 */

function WS(opts) {
    var forceBase64 = (opts && opts.forceBase64);
    if (forceBase64) {
        this.supportsBinary = false;
    }
    Transport.call(this, opts);
}

/**
 * Inherits from Transport.
 */

inherit(WS, Transport);

/**
 * Transport name.
 *
 * @api public
 */

WS.prototype.name = 'websocket';

/**
 * WebSockets support binary
 */

WS.prototype.supportsBinary = false;

/**
 * Opens socket.
 *
 * @api private
 */

WS.prototype.doOpen = function () {
    if (!this.check()) {
        return;
    }

    var uri = this.uri();
    var opts = {
        agent: this.agent
    };

    // SSL options for Node.js client
    opts.pfx = this.pfx;
    opts.key = this.key;
    opts.passphrase = this.passphrase;
    opts.cert = this.cert;
    opts.ca = this.ca;
    opts.ciphers = this.ciphers;
    opts.rejectUnauthorized = this.rejectUnauthorized;
    if (this.extraHeaders) {
        opts.headers = this.extraHeaders;
    }
    if (this.localAddress) {
        opts.localAddress = this.localAddress;
    }

    try {
        this.ws = new WebSocket(uri);
    } catch (err) {
        return this.emit('error', err);
    }

    if (this.ws.binaryType === undefined) {
        this.supportsBinary = false;
    }

    if (this.ws.supports && this.ws.supports.binary) {
        this.supportsBinary = true;
        this.ws.binaryType = 'nodebuffer';
    } else {
        this.ws.binaryType = 'arraybuffer';
    }

    this.addEventListeners();
};

/**
 * Adds event listeners to the socket
 *
 * @api private
 */

WS.prototype.addEventListeners = function () {
    var self = this;

    this.ws.onopen = function () {
        self.onOpen();
    };
    this.ws.onclose = function () {
        self.onClose();
    };
    this.ws.onmessage = function (ev) {
        self.onData(ev.data);
    };
    this.ws.onerror = function (e) {
        self.onError('websocket error', e);
    };
};

/**
 * Writes data to socket.
 *
 * @param {Array} array of packets.
 * @api private
 */

WS.prototype.write = function (packets) {
    var self = this;
    this.writable = false;

    // encodePacket efficient as it uses WS framing
    // no need for encodePayload
    var total = packets.length;
    for (var i = 0, l = total; i < l; i++) {
        (function (packet) {
            parser.encodePacket(packet, self.supportsBinary, function (data) {
                try {
                    self.ws.send(data);
                } catch (e) {
                    debug('websocket closed before onclose event');
                }
                --total || done();
            });
        })(packets[i]);
    }

    function done() {
        self.emit('flush');

        // fake drain
        // defer to next tick to allow Socket to clear writeBuffer
        setTimeout(function () {
            self.writable = true;
            self.emit('drain');
        }, 0);
    }
};

/**
 * Called upon close
 *
 * @api private
 */

WS.prototype.onClose = function () {
    Transport.prototype.onClose.call(this);
};

/**
 * Closes socket.
 *
 * @api private
 */

WS.prototype.doClose = function () {
    if (typeof this.ws !== 'undefined') {
        this.ws.close();
    }
};

/**
 * Generates uri for connection.
 *
 * @api private
 */

WS.prototype.uri = function () {
    var query = this.query || {};
    var schema = this.secure ? 'wss' : 'ws';
    var port = '';

    // avoid port if default for schema
    if (this.port && (('wss' === schema && Number(this.port) !== 443) ||
        ('ws' === schema && Number(this.port) !== 80))) {
        port = ':' + this.port;
    }

    // append timestamp to URI
    if (this.timestampRequests) {
        query[this.timestampParam] = yeast();
    }

    // communicate binary support capabilities
    if (!this.supportsBinary) {
        query.b64 = 1;
    }

    query = parseqs.encode(query);

    // prepend ? to query
    if (query.length) {
        query = '?' + query;
    }

    var ipv6 = this.hostname.indexOf(':') !== -1;
    return schema + '://' + (ipv6 ? '[' + this.hostname + ']' : this.hostname) + port + this.path + query;
};

/**
 * Feature detection for WebSocket.
 *
 * @return {Boolean} whether this transport is available.
 * @api public
 */

WS.prototype.check = function () {
    return !!WebSocket && !('__initialize' in WebSocket && this.name === WS.prototype.name);
};

},{"../transport":5,"component-inherit":13,"debug":14,"engine.io-parser":16,"parseqs":22,"yeast":26}],8:[function(require,module,exports){
module.exports = after

function after(count, callback, err_cb) {
    var bail = false
    err_cb = err_cb || noop
    proxy.count = count

    return (count === 0) ? callback() : proxy

    function proxy(err, result) {
        if (proxy.count <= 0) {
            throw new Error('after called too many times')
        }
        --proxy.count

        // after first error, rest are passed to err_cb
        if (err) {
            bail = true
            callback(err)
            // future error callbacks will go to error handler
            callback = err_cb
        } else if (proxy.count === 0 && !bail) {
            callback(null, result)
        }
    }
}

function noop() {}

},{}],9:[function(require,module,exports){
/**
 * An abstraction for slicing an arraybuffer even when
 * ArrayBuffer.prototype.slice is not supported
 *
 * @api public
 */

module.exports = function(arraybuffer, start, end) {
  var bytes = arraybuffer.byteLength;
  start = start || 0;
  end = end || bytes;

  if (arraybuffer.slice) { return arraybuffer.slice(start, end); }

  if (start < 0) { start += bytes; }
  if (end < 0) { end += bytes; }
  if (end > bytes) { end = bytes; }

  if (start >= bytes || start >= end || bytes === 0) {
    return new ArrayBuffer(0);
  }

  var abv = new Uint8Array(arraybuffer);
  var result = new Uint8Array(end - start);
  for (var i = start, ii = 0; i < end; i++, ii++) {
    result[ii] = abv[i];
  }
  return result.buffer;
};

},{}],10:[function(require,module,exports){
/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */
(function(){
  "use strict";

  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // Use a lookup table to find the index.
  var lookup = new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  exports.encode = function(arraybuffer) {
    var bytes = new Uint8Array(arraybuffer),
    i, len = bytes.length, base64 = "";

    for (i = 0; i < len; i+=3) {
      base64 += chars[bytes[i] >> 2];
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64 += chars[bytes[i + 2] & 63];
    }

    if ((len % 3) === 2) {
      base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (len % 3 === 1) {
      base64 = base64.substring(0, base64.length - 2) + "==";
    }

    return base64;
  };

  exports.decode =  function(base64) {
    var bufferLength = base64.length * 0.75,
    len = base64.length, i, p = 0,
    encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }

    var arraybuffer = new ArrayBuffer(bufferLength),
    bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i+=4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i+1)];
      encoded3 = lookup[base64.charCodeAt(i+2)];
      encoded4 = lookup[base64.charCodeAt(i+3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return arraybuffer;
  };
})();

},{}],11:[function(require,module,exports){
(function (global){
/**
 * Create a blob builder even when vendor prefixes exist
 */

var BlobBuilder = global.BlobBuilder
  || global.WebKitBlobBuilder
  || global.MSBlobBuilder
  || global.MozBlobBuilder;

/**
 * Check if Blob constructor is supported
 */

var blobSupported = (function() {
  try {
    var a = new Blob(['hi']);
    return a.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if Blob constructor supports ArrayBufferViews
 * Fails in Safari 6, so we need to map to ArrayBuffers there.
 */

var blobSupportsArrayBufferView = blobSupported && (function() {
  try {
    var b = new Blob([new Uint8Array([1,2])]);
    return b.size === 2;
  } catch(e) {
    return false;
  }
})();

/**
 * Check if BlobBuilder is supported
 */

var blobBuilderSupported = BlobBuilder
  && BlobBuilder.prototype.append
  && BlobBuilder.prototype.getBlob;

/**
 * Helper function that maps ArrayBufferViews to ArrayBuffers
 * Used by BlobBuilder constructor and old browsers that didn't
 * support it in the Blob constructor.
 */

function mapArrayBufferViews(ary) {
  for (var i = 0; i < ary.length; i++) {
    var chunk = ary[i];
    if (chunk.buffer instanceof ArrayBuffer) {
      var buf = chunk.buffer;

      // if this is a subarray, make a copy so we only
      // include the subarray region from the underlying buffer
      if (chunk.byteLength !== buf.byteLength) {
        var copy = new Uint8Array(chunk.byteLength);
        copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength));
        buf = copy.buffer;
      }

      ary[i] = buf;
    }
  }
}

function BlobBuilderConstructor(ary, options) {
  options = options || {};

  var bb = new BlobBuilder();
  mapArrayBufferViews(ary);

  for (var i = 0; i < ary.length; i++) {
    bb.append(ary[i]);
  }

  return (options.type) ? bb.getBlob(options.type) : bb.getBlob();
};

function BlobConstructor(ary, options) {
  mapArrayBufferViews(ary);
  return new Blob(ary, options || {});
};

module.exports = (function() {
  if (blobSupported) {
    return blobSupportsArrayBufferView ? global.Blob : BlobConstructor;
  } else if (blobBuilderSupported) {
    return BlobBuilderConstructor;
  } else {
    return undefined;
  }
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],12:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],13:[function(require,module,exports){

module.exports = function(a, b){
  var fn = function(){};
  fn.prototype = b.prototype;
  a.prototype = new fn;
  a.prototype.constructor = a;
};
},{}],14:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))

},{"./debug":15,"_process":24}],15:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":21}],16:[function(require,module,exports){
(function (global){
/**
 * Module dependencies.
 */

var keys = require('./keys');
var hasBinary = require('has-binary');
var sliceBuffer = require('arraybuffer.slice');
var after = require('after');
var utf8 = require('wtf-8');

var base64encoder;
if (global && global.ArrayBuffer) {
  base64encoder = require('base64-arraybuffer');
}

/**
 * Check if we are running an android browser. That requires us to use
 * ArrayBuffer with polling transports...
 *
 * http://ghinda.net/jpeg-blob-ajax-android/
 */

var isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/**
 * Check if we are running in PhantomJS.
 * Uploading a Blob with PhantomJS does not work correctly, as reported here:
 * https://github.com/ariya/phantomjs/issues/11395
 * @type boolean
 */
var isPhantomJS = typeof navigator !== 'undefined' && /PhantomJS/i.test(navigator.userAgent);

/**
 * When true, avoids using Blobs to encode payloads.
 * @type boolean
 */
var dontSendBlobs = isAndroid || isPhantomJS;

/**
 * Current protocol version.
 */

exports.protocol = 3;

/**
 * Packet types.
 */

var packets = exports.packets = {
    open:     0    // non-ws
  , close:    1    // non-ws
  , ping:     2
  , pong:     3
  , message:  4
  , upgrade:  5
  , noop:     6
};

var packetslist = keys(packets);

/**
 * Premade error packet.
 */

var err = { type: 'error', data: 'parser error' };

/**
 * Create a blob api even for blob builder when vendor prefixes exist
 */

var Blob = require('blob');

/**
 * Encodes a packet.
 *
 *     <packet type id> [ <data> ]
 *
 * Example:
 *
 *     5hello world
 *     3
 *     4
 *
 * Binary is encoded in an identical principle
 *
 * @api private
 */

exports.encodePacket = function (packet, supportsBinary, utf8encode, callback) {
  if ('function' == typeof supportsBinary) {
    callback = supportsBinary;
    supportsBinary = false;
  }

  if ('function' == typeof utf8encode) {
    callback = utf8encode;
    utf8encode = null;
  }

  var data = (packet.data === undefined)
    ? undefined
    : packet.data.buffer || packet.data;

  if (global.ArrayBuffer && data instanceof ArrayBuffer) {
    return encodeArrayBuffer(packet, supportsBinary, callback);
  } else if (Blob && data instanceof global.Blob) {
    return encodeBlob(packet, supportsBinary, callback);
  }

  // might be an object with { base64: true, data: dataAsBase64String }
  if (data && data.base64) {
    return encodeBase64Object(packet, callback);
  }

  // Sending data as a utf-8 string
  var encoded = packets[packet.type];

  // data fragment is optional
  if (undefined !== packet.data) {
    encoded += utf8encode ? utf8.encode(String(packet.data)) : String(packet.data);
  }

  return callback('' + encoded);

};

function encodeBase64Object(packet, callback) {
  // packet data is an object { base64: true, data: dataAsBase64String }
  var message = 'b' + exports.packets[packet.type] + packet.data.data;
  return callback(message);
}

/**
 * Encode packet helpers for binary types
 */

function encodeArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var data = packet.data;
  var contentArray = new Uint8Array(data);
  var resultBuffer = new Uint8Array(1 + data.byteLength);

  resultBuffer[0] = packets[packet.type];
  for (var i = 0; i < contentArray.length; i++) {
    resultBuffer[i+1] = contentArray[i];
  }

  return callback(resultBuffer.buffer);
}

function encodeBlobAsArrayBuffer(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  var fr = new FileReader();
  fr.onload = function() {
    packet.data = fr.result;
    exports.encodePacket(packet, supportsBinary, true, callback);
  };
  return fr.readAsArrayBuffer(packet.data);
}

function encodeBlob(packet, supportsBinary, callback) {
  if (!supportsBinary) {
    return exports.encodeBase64Packet(packet, callback);
  }

  if (dontSendBlobs) {
    return encodeBlobAsArrayBuffer(packet, supportsBinary, callback);
  }

  var length = new Uint8Array(1);
  length[0] = packets[packet.type];
  var blob = new Blob([length.buffer, packet.data]);

  return callback(blob);
}

/**
 * Encodes a packet with binary data in a base64 string
 *
 * @param {Object} packet, has `type` and `data`
 * @return {String} base64 encoded message
 */

exports.encodeBase64Packet = function(packet, callback) {
  var message = 'b' + exports.packets[packet.type];
  if (Blob && packet.data instanceof global.Blob) {
    var fr = new FileReader();
    fr.onload = function() {
      var b64 = fr.result.split(',')[1];
      callback(message + b64);
    };
    return fr.readAsDataURL(packet.data);
  }

  var b64data;
  try {
    b64data = String.fromCharCode.apply(null, new Uint8Array(packet.data));
  } catch (e) {
    // iPhone Safari doesn't let you apply with typed arrays
    var typed = new Uint8Array(packet.data);
    var basic = new Array(typed.length);
    for (var i = 0; i < typed.length; i++) {
      basic[i] = typed[i];
    }
    b64data = String.fromCharCode.apply(null, basic);
  }
  message += global.btoa(b64data);
  return callback(message);
};

/**
 * Decodes a packet. Changes format to Blob if requested.
 *
 * @return {Object} with `type` and `data` (if any)
 * @api private
 */

exports.decodePacket = function (data, binaryType, utf8decode) {
  if (data === undefined) {
    return err;
  }
  // String data
  if (typeof data == 'string') {
    if (data.charAt(0) == 'b') {
      return exports.decodeBase64Packet(data.substr(1), binaryType);
    }

    if (utf8decode) {
      data = tryDecode(data);
      if (data === false) {
        return err;
      }
    }
    var type = data.charAt(0);

    if (Number(type) != type || !packetslist[type]) {
      return err;
    }

    if (data.length > 1) {
      return { type: packetslist[type], data: data.substring(1) };
    } else {
      return { type: packetslist[type] };
    }
  }

  var asArray = new Uint8Array(data);
  var type = asArray[0];
  var rest = sliceBuffer(data, 1);
  if (Blob && binaryType === 'blob') {
    rest = new Blob([rest]);
  }
  return { type: packetslist[type], data: rest };
};

function tryDecode(data) {
  try {
    data = utf8.decode(data);
  } catch (e) {
    return false;
  }
  return data;
}

/**
 * Decodes a packet encoded in a base64 string
 *
 * @param {String} base64 encoded message
 * @return {Object} with `type` and `data` (if any)
 */

exports.decodeBase64Packet = function(msg, binaryType) {
  var type = packetslist[msg.charAt(0)];
  if (!base64encoder) {
    return { type: type, data: { base64: true, data: msg.substr(1) } };
  }

  var data = base64encoder.decode(msg.substr(1));

  if (binaryType === 'blob' && Blob) {
    data = new Blob([data]);
  }

  return { type: type, data: data };
};

/**
 * Encodes multiple messages (payload).
 *
 *     <length>:data
 *
 * Example:
 *
 *     11:hello world2:hi
 *
 * If any contents are binary, they will be encoded as base64 strings. Base64
 * encoded strings are marked with a b before the length specifier
 *
 * @param {Array} packets
 * @api private
 */

exports.encodePayload = function (packets, supportsBinary, callback) {
  if (typeof supportsBinary == 'function') {
    callback = supportsBinary;
    supportsBinary = null;
  }

  var isBinary = hasBinary(packets);

  if (supportsBinary && isBinary) {
    if (Blob && !dontSendBlobs) {
      return exports.encodePayloadAsBlob(packets, callback);
    }

    return exports.encodePayloadAsArrayBuffer(packets, callback);
  }

  if (!packets.length) {
    return callback('0:');
  }

  function setLengthHeader(message) {
    return message.length + ':' + message;
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, !isBinary ? false : supportsBinary, true, function(message) {
      doneCallback(null, setLengthHeader(message));
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(results.join(''));
  });
};

/**
 * Async array map using after
 */

function map(ary, each, done) {
  var result = new Array(ary.length);
  var next = after(ary.length, done);

  var eachWithIndex = function(i, el, cb) {
    each(el, function(error, msg) {
      result[i] = msg;
      cb(error, result);
    });
  };

  for (var i = 0; i < ary.length; i++) {
    eachWithIndex(i, ary[i], next);
  }
}

/*
 * Decodes data when a payload is maybe expected. Possible binary contents are
 * decoded from their base64 representation
 *
 * @param {String} data, callback method
 * @api public
 */

exports.decodePayload = function (data, binaryType, callback) {
  if (typeof data != 'string') {
    return exports.decodePayloadAsBinary(data, binaryType, callback);
  }

  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var packet;
  if (data == '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

  var length = ''
    , n, msg;

  for (var i = 0, l = data.length; i < l; i++) {
    var chr = data.charAt(i);

    if (':' != chr) {
      length += chr;
    } else {
      if ('' == length || (length != (n = Number(length)))) {
        // parser error - ignoring payload
        return callback(err, 0, 1);
      }

      msg = data.substr(i + 1, n);

      if (length != msg.length) {
        // parser error - ignoring payload
        return callback(err, 0, 1);
      }

      if (msg.length) {
        packet = exports.decodePacket(msg, binaryType, true);

        if (err.type == packet.type && err.data == packet.data) {
          // parser error in individual packet - ignoring payload
          return callback(err, 0, 1);
        }

        var ret = callback(packet, i + n, l);
        if (false === ret) return;
      }

      // advance cursor
      i += n;
      length = '';
    }
  }

  if (length != '') {
    // parser error - ignoring payload
    return callback(err, 0, 1);
  }

};

/**
 * Encodes multiple messages (payload) as binary.
 *
 * <1 = binary, 0 = string><number from 0-9><number from 0-9>[...]<number
 * 255><data>
 *
 * Example:
 * 1 3 255 1 2 3, if the binary contents are interpreted as 8 bit integers
 *
 * @param {Array} packets
 * @return {ArrayBuffer} encoded payload
 * @api private
 */

exports.encodePayloadAsArrayBuffer = function(packets, callback) {
  if (!packets.length) {
    return callback(new ArrayBuffer(0));
  }

  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(data) {
      return doneCallback(null, data);
    });
  }

  map(packets, encodeOne, function(err, encodedPackets) {
    var totalLength = encodedPackets.reduce(function(acc, p) {
      var len;
      if (typeof p === 'string'){
        len = p.length;
      } else {
        len = p.byteLength;
      }
      return acc + len.toString().length + len + 2; // string/binary identifier + separator = 2
    }, 0);

    var resultArray = new Uint8Array(totalLength);

    var bufferIndex = 0;
    encodedPackets.forEach(function(p) {
      var isString = typeof p === 'string';
      var ab = p;
      if (isString) {
        var view = new Uint8Array(p.length);
        for (var i = 0; i < p.length; i++) {
          view[i] = p.charCodeAt(i);
        }
        ab = view.buffer;
      }

      if (isString) { // not true binary
        resultArray[bufferIndex++] = 0;
      } else { // true binary
        resultArray[bufferIndex++] = 1;
      }

      var lenStr = ab.byteLength.toString();
      for (var i = 0; i < lenStr.length; i++) {
        resultArray[bufferIndex++] = parseInt(lenStr[i]);
      }
      resultArray[bufferIndex++] = 255;

      var view = new Uint8Array(ab);
      for (var i = 0; i < view.length; i++) {
        resultArray[bufferIndex++] = view[i];
      }
    });

    return callback(resultArray.buffer);
  });
};

/**
 * Encode as Blob
 */

exports.encodePayloadAsBlob = function(packets, callback) {
  function encodeOne(packet, doneCallback) {
    exports.encodePacket(packet, true, true, function(encoded) {
      var binaryIdentifier = new Uint8Array(1);
      binaryIdentifier[0] = 1;
      if (typeof encoded === 'string') {
        var view = new Uint8Array(encoded.length);
        for (var i = 0; i < encoded.length; i++) {
          view[i] = encoded.charCodeAt(i);
        }
        encoded = view.buffer;
        binaryIdentifier[0] = 0;
      }

      var len = (encoded instanceof ArrayBuffer)
        ? encoded.byteLength
        : encoded.size;

      var lenStr = len.toString();
      var lengthAry = new Uint8Array(lenStr.length + 1);
      for (var i = 0; i < lenStr.length; i++) {
        lengthAry[i] = parseInt(lenStr[i]);
      }
      lengthAry[lenStr.length] = 255;

      if (Blob) {
        var blob = new Blob([binaryIdentifier.buffer, lengthAry.buffer, encoded]);
        doneCallback(null, blob);
      }
    });
  }

  map(packets, encodeOne, function(err, results) {
    return callback(new Blob(results));
  });
};

/*
 * Decodes data when a payload is maybe expected. Strings are decoded by
 * interpreting each byte as a key code for entries marked to start with 0. See
 * description of encodePayloadAsBinary
 *
 * @param {ArrayBuffer} data, callback method
 * @api public
 */

exports.decodePayloadAsBinary = function (data, binaryType, callback) {
  if (typeof binaryType === 'function') {
    callback = binaryType;
    binaryType = null;
  }

  var bufferTail = data;
  var buffers = [];

  var numberTooLong = false;
  while (bufferTail.byteLength > 0) {
    var tailArray = new Uint8Array(bufferTail);
    var isString = tailArray[0] === 0;
    var msgLength = '';

    for (var i = 1; ; i++) {
      if (tailArray[i] == 255) break;

      if (msgLength.length > 310) {
        numberTooLong = true;
        break;
      }

      msgLength += tailArray[i];
    }

    if(numberTooLong) return callback(err, 0, 1);

    bufferTail = sliceBuffer(bufferTail, 2 + msgLength.length);
    msgLength = parseInt(msgLength);

    var msg = sliceBuffer(bufferTail, 0, msgLength);
    if (isString) {
      try {
        msg = String.fromCharCode.apply(null, new Uint8Array(msg));
      } catch (e) {
        // iPhone Safari doesn't let you apply to typed arrays
        var typed = new Uint8Array(msg);
        msg = '';
        for (var i = 0; i < typed.length; i++) {
          msg += String.fromCharCode(typed[i]);
        }
      }
    }

    buffers.push(msg);
    bufferTail = sliceBuffer(bufferTail, msgLength);
  }

  var total = buffers.length;
  buffers.forEach(function(buffer, i) {
    callback(exports.decodePacket(buffer, binaryType, true), i, total);
  });
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./keys":17,"after":8,"arraybuffer.slice":9,"base64-arraybuffer":10,"blob":11,"has-binary":18,"wtf-8":25}],17:[function(require,module,exports){

/**
 * Gets the keys for an object.
 *
 * @return {Array} keys
 * @api private
 */

module.exports = Object.keys || function keys (obj){
  var arr = [];
  var has = Object.prototype.hasOwnProperty;

  for (var i in obj) {
    if (has.call(obj, i)) {
      arr.push(i);
    }
  }
  return arr;
};

},{}],18:[function(require,module,exports){
(function (global){

/*
 * Module requirements.
 */

var isArray = require('isarray');

/**
 * Module exports.
 */

module.exports = hasBinary;

/**
 * Checks for binary data.
 *
 * Right now only Buffer and ArrayBuffer are supported..
 *
 * @param {Object} anything
 * @api public
 */

function hasBinary(data) {

  function _hasBinary(obj) {
    if (!obj) return false;

    if ( (global.Buffer && global.Buffer.isBuffer && global.Buffer.isBuffer(obj)) ||
         (global.ArrayBuffer && obj instanceof ArrayBuffer) ||
         (global.Blob && obj instanceof Blob) ||
         (global.File && obj instanceof File)
        ) {
      return true;
    }

    if (isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
          if (_hasBinary(obj[i])) {
              return true;
          }
      }
    } else if (obj && 'object' == typeof obj) {
      // see: https://github.com/Automattic/has-binary/pull/4
      if (obj.toJSON && 'function' == typeof obj.toJSON) {
        obj = obj.toJSON();
      }

      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && _hasBinary(obj[key])) {
          return true;
        }
      }
    }

    return false;
  }

  return _hasBinary(data);
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"isarray":19}],19:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],20:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],21:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],22:[function(require,module,exports){
/**
 * Compiles a querystring
 * Returns string representation of the object
 *
 * @param {Object}
 * @api private
 */

exports.encode = function (obj) {
  var str = '';

  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      if (str.length) str += '&';
      str += encodeURIComponent(i) + '=' + encodeURIComponent(obj[i]);
    }
  }

  return str;
};

/**
 * Parses a simple querystring into an object
 *
 * @param {String} qs
 * @api private
 */

exports.decode = function(qs){
  var qry = {};
  var pairs = qs.split('&');
  for (var i = 0, l = pairs.length; i < l; i++) {
    var pair = pairs[i].split('=');
    qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return qry;
};

},{}],23:[function(require,module,exports){
/**
 * Parses an URI
 *
 * @author Steven Levithan <stevenlevithan.com> (MIT license)
 * @api private
 */

var re = /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;

var parts = [
    'source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'host', 'port', 'relative', 'path', 'directory', 'file', 'query', 'anchor'
];

module.exports = function parseuri(str) {
    var src = str,
        b = str.indexOf('['),
        e = str.indexOf(']');

    if (b != -1 && e != -1) {
        str = str.substring(0, b) + str.substring(b, e).replace(/:/g, ';') + str.substring(e, str.length);
    }

    var m = re.exec(str || ''),
        uri = {},
        i = 14;

    while (i--) {
        uri[parts[i]] = m[i] || '';
    }

    if (b != -1 && e != -1) {
        uri.source = src;
        uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ':');
        uri.authority = uri.authority.replace('[', '').replace(']', '').replace(/;/g, ':');
        uri.ipv6uri = true;
    }

    return uri;
};

},{}],24:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],25:[function(require,module,exports){
(function (global){
/*! https://mths.be/wtf8 v1.0.0 by @mathias */
;(function(root) {

	// Detect free variables `exports`
	var freeExports = typeof exports == 'object' && exports;

	// Detect free variable `module`
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;

	// Detect free variable `global`, from Node.js or Browserified code,
	// and use it as `root`
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/*--------------------------------------------------------------------------*/

	var stringFromCharCode = String.fromCharCode;

	// Taken from https://mths.be/punycode
	function ucs2decode(string) {
		var output = [];
		var counter = 0;
		var length = string.length;
		var value;
		var extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	// Taken from https://mths.be/punycode
	function ucs2encode(array) {
		var length = array.length;
		var index = -1;
		var value;
		var output = '';
		while (++index < length) {
			value = array[index];
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
		}
		return output;
	}

	/*--------------------------------------------------------------------------*/

	function createByte(codePoint, shift) {
		return stringFromCharCode(((codePoint >> shift) & 0x3F) | 0x80);
	}

	function encodeCodePoint(codePoint) {
		if ((codePoint & 0xFFFFFF80) == 0) { // 1-byte sequence
			return stringFromCharCode(codePoint);
		}
		var symbol = '';
		if ((codePoint & 0xFFFFF800) == 0) { // 2-byte sequence
			symbol = stringFromCharCode(((codePoint >> 6) & 0x1F) | 0xC0);
		}
		else if ((codePoint & 0xFFFF0000) == 0) { // 3-byte sequence
			symbol = stringFromCharCode(((codePoint >> 12) & 0x0F) | 0xE0);
			symbol += createByte(codePoint, 6);
		}
		else if ((codePoint & 0xFFE00000) == 0) { // 4-byte sequence
			symbol = stringFromCharCode(((codePoint >> 18) & 0x07) | 0xF0);
			symbol += createByte(codePoint, 12);
			symbol += createByte(codePoint, 6);
		}
		symbol += stringFromCharCode((codePoint & 0x3F) | 0x80);
		return symbol;
	}

	function wtf8encode(string) {
		var codePoints = ucs2decode(string);
		var length = codePoints.length;
		var index = -1;
		var codePoint;
		var byteString = '';
		while (++index < length) {
			codePoint = codePoints[index];
			byteString += encodeCodePoint(codePoint);
		}
		return byteString;
	}

	/*--------------------------------------------------------------------------*/

	function readContinuationByte() {
		if (byteIndex >= byteCount) {
			throw Error('Invalid byte index');
		}

		var continuationByte = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		if ((continuationByte & 0xC0) == 0x80) {
			return continuationByte & 0x3F;
		}

		// If we end up here, it’s not a continuation byte.
		throw Error('Invalid continuation byte');
	}

	function decodeSymbol() {
		var byte1;
		var byte2;
		var byte3;
		var byte4;
		var codePoint;

		if (byteIndex > byteCount) {
			throw Error('Invalid byte index');
		}

		if (byteIndex == byteCount) {
			return false;
		}

		// Read the first byte.
		byte1 = byteArray[byteIndex] & 0xFF;
		byteIndex++;

		// 1-byte sequence (no continuation bytes)
		if ((byte1 & 0x80) == 0) {
			return byte1;
		}

		// 2-byte sequence
		if ((byte1 & 0xE0) == 0xC0) {
			var byte2 = readContinuationByte();
			codePoint = ((byte1 & 0x1F) << 6) | byte2;
			if (codePoint >= 0x80) {
				return codePoint;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 3-byte sequence (may include unpaired surrogates)
		if ((byte1 & 0xF0) == 0xE0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
			if (codePoint >= 0x0800) {
				return codePoint;
			} else {
				throw Error('Invalid continuation byte');
			}
		}

		// 4-byte sequence
		if ((byte1 & 0xF8) == 0xF0) {
			byte2 = readContinuationByte();
			byte3 = readContinuationByte();
			byte4 = readContinuationByte();
			codePoint = ((byte1 & 0x0F) << 0x12) | (byte2 << 0x0C) |
				(byte3 << 0x06) | byte4;
			if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
				return codePoint;
			}
		}

		throw Error('Invalid WTF-8 detected');
	}

	var byteArray;
	var byteCount;
	var byteIndex;
	function wtf8decode(byteString) {
		byteArray = ucs2decode(byteString);
		byteCount = byteArray.length;
		byteIndex = 0;
		var codePoints = [];
		var tmp;
		while ((tmp = decodeSymbol()) !== false) {
			codePoints.push(tmp);
		}
		return ucs2encode(codePoints);
	}

	/*--------------------------------------------------------------------------*/

	var wtf8 = {
		'version': '1.0.0',
		'encode': wtf8encode,
		'decode': wtf8decode
	};

	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define(function() {
			return wtf8;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = wtf8;
		} else { // in Narwhal or RingoJS v0.7.0-
			var object = {};
			var hasOwnProperty = object.hasOwnProperty;
			for (var key in wtf8) {
				hasOwnProperty.call(wtf8, key) && (freeExports[key] = wtf8[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.wtf8 = wtf8;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],26:[function(require,module,exports){
'use strict';

var alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'.split('')
  , length = 64
  , map = {}
  , seed = 0
  , i = 0
  , prev;

/**
 * Return a string representing the specified number.
 *
 * @param {Number} num The number to convert.
 * @returns {String} The string representation of the number.
 * @api public
 */
function encode(num) {
  var encoded = '';

  do {
    encoded = alphabet[num % length] + encoded;
    num = Math.floor(num / length);
  } while (num > 0);

  return encoded;
}

/**
 * Return the integer value specified by the given string.
 *
 * @param {String} str The string to convert.
 * @returns {Number} The integer value represented by the string.
 * @api public
 */
function decode(str) {
  var decoded = 0;

  for (i = 0; i < str.length; i++) {
    decoded = decoded * length + map[str.charAt(i)];
  }

  return decoded;
}

/**
 * Yeast: A tiny growing id generator.
 *
 * @returns {String} A unique id.
 * @api public
 */
function yeast() {
  var now = encode(+new Date());

  if (now !== prev) return seed = 0, prev = now;
  return now +'.'+ encode(seed++);
}

//
// Map each character to its index.
//
for (; i < length; i++) map[alphabet[i]] = i;

//
// Expose the `yeast`, `encode` and `decode` functions.
//
yeast.encode = encode;
yeast.decode = decode;
module.exports = yeast;

},{}]},{},[1])(1)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZW5naW5lLmlvLWNsaWVudC9pbmRleC5qcyIsImxpYi9lbmdpbmUuaW8tY2xpZW50L2xpYi9pbmRleC5qcyIsImxpYi9lbmdpbmUuaW8tY2xpZW50L2xpYi9wYXJzZWpzb24uanMiLCJsaWIvZW5naW5lLmlvLWNsaWVudC9saWIvc29ja2V0LmpzIiwibGliL2VuZ2luZS5pby1jbGllbnQvbGliL3RyYW5zcG9ydC5qcyIsImxpYi9lbmdpbmUuaW8tY2xpZW50L2xpYi90cmFuc3BvcnRzL2luZGV4LmpzIiwibGliL2VuZ2luZS5pby1jbGllbnQvbGliL3RyYW5zcG9ydHMvd3h3ZWJzb2NrZXQuanMiLCJub2RlX21vZHVsZXMvYWZ0ZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYXJyYXlidWZmZXIuc2xpY2UvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYmFzZTY0LWFycmF5YnVmZmVyL2xpYi9iYXNlNjQtYXJyYXlidWZmZXIuanMiLCJub2RlX21vZHVsZXMvYmxvYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jb21wb25lbnQtZW1pdHRlci9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9jb21wb25lbnQtaW5oZXJpdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9kZWJ1Zy9zcmMvZGVidWcuanMiLCJub2RlX21vZHVsZXMvZW5naW5lLmlvLXBhcnNlci9saWIvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9lbmdpbmUuaW8tcGFyc2VyL2xpYi9rZXlzLmpzIiwibm9kZV9tb2R1bGVzL2hhcy1iaW5hcnkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaGFzLWJpbmFyeS9ub2RlX21vZHVsZXMvaXNhcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbmRleG9mL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL21zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3BhcnNlcXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcGFyc2V1cmkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3d0Zi04L3d0Zi04LmpzIiwibm9kZV9tb2R1bGVzL3llYXN0L2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2x1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2ptQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzNEQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9pbmRleCcpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NvY2tldCcpO1xuXG4vKipcbiAqIEV4cG9ydHMgcGFyc2VyXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlciA9IHJlcXVpcmUoJ2VuZ2luZS5pby1wYXJzZXInKTtcbiIsIi8qKlxyXG4gKiBKU09OIHBhcnNlLlxyXG4gKlxyXG4gKiBAc2VlIEJhc2VkIG9uIGpRdWVyeSNwYXJzZUpTT04gKE1JVCkgYW5kIEpTT04yXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbnZhciBydmFsaWRjaGFycyA9IC9eW1xcXSw6e31cXHNdKiQvO1xyXG52YXIgcnZhbGlkZXNjYXBlID0gL1xcXFwoPzpbXCJcXFxcXFwvYmZucnRdfHVbMC05YS1mQS1GXXs0fSkvZztcclxudmFyIHJ2YWxpZHRva2VucyA9IC9cIlteXCJcXFxcXFxuXFxyXSpcInx0cnVlfGZhbHNlfG51bGx8LT9cXGQrKD86XFwuXFxkKik/KD86W2VFXVsrXFwtXT9cXGQrKT8vZztcclxudmFyIHJ2YWxpZGJyYWNlcyA9IC8oPzpefDp8LCkoPzpcXHMqXFxbKSsvZztcclxudmFyIHJ0cmltTGVmdCA9IC9eXFxzKy87XHJcbnZhciBydHJpbVJpZ2h0ID0gL1xccyskLztcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGFyc2Vqc29uKGRhdGEpIHtcclxuXHJcbiAgaWYgKCdzdHJpbmcnICE9IHR5cGVvZiBkYXRhIHx8ICFkYXRhKSB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGRhdGEgPSBkYXRhLnJlcGxhY2UocnRyaW1MZWZ0LCAnJykucmVwbGFjZShydHJpbVJpZ2h0LCAnJyk7XHJcblxyXG4gIC8vIEF0dGVtcHQgdG8gcGFyc2UgdXNpbmcgdGhlIG5hdGl2ZSBKU09OIHBhcnNlciBmaXJzdFxyXG4gIGlmICgoSlNPTiAmJiBKU09OLnBhcnNlKSB8fCAoZ2xvYmFsICYmIGdsb2JhbC5KU09OICYmIGdsb2JhbC5KU09OLnBhcnNlKSkge1xyXG4gICAgcmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XHJcbiAgfVxyXG5cclxuICBpZiAocnZhbGlkY2hhcnMudGVzdChkYXRhLnJlcGxhY2UocnZhbGlkZXNjYXBlLCAnQCcpXHJcbiAgICAgIC5yZXBsYWNlKHJ2YWxpZHRva2VucywgJ10nKVxyXG4gICAgICAucmVwbGFjZShydmFsaWRicmFjZXMsICcnKSkpIHtcclxuICAgIHJldHVybiAobmV3IEZ1bmN0aW9uKCdyZXR1cm4gJyArIGRhdGEpKSgpO1xyXG4gIH1cclxufTsiLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHRyYW5zcG9ydHMgPSByZXF1aXJlKCcuL3RyYW5zcG9ydHMvaW5kZXgnKTtcbnZhciBFbWl0dGVyID0gcmVxdWlyZSgnY29tcG9uZW50LWVtaXR0ZXInKTtcbnZhciBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ2VuZ2luZS5pby1jbGllbnQ6c29ja2V0Jyk7XG52YXIgaW5kZXggPSByZXF1aXJlKCdpbmRleG9mJyk7XG52YXIgcGFyc2VyID0gcmVxdWlyZSgnZW5naW5lLmlvLXBhcnNlcicpO1xudmFyIHBhcnNldXJpID0gcmVxdWlyZSgncGFyc2V1cmknKTtcbnZhciBwYXJzZWpzb24gPSByZXF1aXJlKCcuL3BhcnNlanNvbicpO1xudmFyIHBhcnNlcXMgPSByZXF1aXJlKCdwYXJzZXFzJyk7XG5cbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBTb2NrZXQ7XG5cbi8qKlxuICogU29ja2V0IGNvbnN0cnVjdG9yLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gdXJpIG9yIG9wdGlvbnNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFNvY2tldCh1cmksIG9wdHMpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU29ja2V0KSkgcmV0dXJuIG5ldyBTb2NrZXQodXJpLCBvcHRzKTtcblxuICAgIG9wdHMgPSBvcHRzIHx8IHt9O1xuXG4gICAgaWYgKHVyaSAmJiAnb2JqZWN0JyA9PT0gdHlwZW9mIHVyaSkge1xuICAgICAgICBvcHRzID0gdXJpO1xuICAgICAgICB1cmkgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICh1cmkpIHtcbiAgICAgICAgdXJpID0gcGFyc2V1cmkodXJpKTtcbiAgICAgICAgb3B0cy5ob3N0bmFtZSA9IHVyaS5ob3N0O1xuICAgICAgICBvcHRzLnNlY3VyZSA9IHVyaS5wcm90b2NvbCA9PT0gJ2h0dHBzJyB8fCB1cmkucHJvdG9jb2wgPT09ICd3c3MnO1xuICAgICAgICBvcHRzLnBvcnQgPSB1cmkucG9ydDtcbiAgICAgICAgaWYgKHVyaS5xdWVyeSkgb3B0cy5xdWVyeSA9IHVyaS5xdWVyeTtcbiAgICB9IGVsc2UgaWYgKG9wdHMuaG9zdCkge1xuICAgICAgICBvcHRzLmhvc3RuYW1lID0gcGFyc2V1cmkob3B0cy5ob3N0KS5ob3N0O1xuICAgIH1cblxuICAgIHRoaXMuc2VjdXJlID0gbnVsbCAhPSBvcHRzLnNlY3VyZSA/IG9wdHMuc2VjdXJlXG4gICAgICAgIDogKGdsb2JhbC5sb2NhdGlvbiAmJiAnaHR0cHM6JyA9PT0gbG9jYXRpb24ucHJvdG9jb2wpO1xuXG4gICAgaWYgKG9wdHMuaG9zdG5hbWUgJiYgIW9wdHMucG9ydCkge1xuICAgICAgICAvLyBpZiBubyBwb3J0IGlzIHNwZWNpZmllZCBtYW51YWxseSwgdXNlIHRoZSBwcm90b2NvbCBkZWZhdWx0XG4gICAgICAgIG9wdHMucG9ydCA9IHRoaXMuc2VjdXJlID8gJzQ0MycgOiAnODAnO1xuICAgIH1cblxuICAgIHRoaXMuYWdlbnQgPSBvcHRzLmFnZW50IHx8IGZhbHNlO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBvcHRzLmhvc3RuYW1lIHx8XG4gICAgICAgIChnbG9iYWwubG9jYXRpb24gPyBsb2NhdGlvbi5ob3N0bmFtZSA6ICdsb2NhbGhvc3QnKTtcbiAgICB0aGlzLnBvcnQgPSBvcHRzLnBvcnQgfHwgKGdsb2JhbC5sb2NhdGlvbiAmJiBsb2NhdGlvbi5wb3J0XG4gICAgICAgICAgICA/IGxvY2F0aW9uLnBvcnRcbiAgICAgICAgICAgIDogKHRoaXMuc2VjdXJlID8gNDQzIDogODApKTtcbiAgICB0aGlzLnF1ZXJ5ID0gb3B0cy5xdWVyeSB8fCB7fTtcbiAgICBpZiAoJ3N0cmluZycgPT09IHR5cGVvZiB0aGlzLnF1ZXJ5KSB0aGlzLnF1ZXJ5ID0gcGFyc2Vxcy5kZWNvZGUodGhpcy5xdWVyeSk7XG4gICAgdGhpcy51cGdyYWRlID0gZmFsc2UgIT09IG9wdHMudXBncmFkZTtcbiAgICB0aGlzLnBhdGggPSAob3B0cy5wYXRoIHx8ICcvZW5naW5lLmlvJykucmVwbGFjZSgvXFwvJC8sICcnKSArICcvJztcbiAgICB0aGlzLmZvcmNlSlNPTlAgPSAhIW9wdHMuZm9yY2VKU09OUDtcbiAgICB0aGlzLmpzb25wID0gZmFsc2UgIT09IG9wdHMuanNvbnA7XG4gICAgdGhpcy5mb3JjZUJhc2U2NCA9ICEhb3B0cy5mb3JjZUJhc2U2NDtcbiAgICB0aGlzLmVuYWJsZXNYRFIgPSAhIW9wdHMuZW5hYmxlc1hEUjtcbiAgICB0aGlzLnRpbWVzdGFtcFBhcmFtID0gb3B0cy50aW1lc3RhbXBQYXJhbSB8fCAndCc7XG4gICAgdGhpcy50aW1lc3RhbXBSZXF1ZXN0cyA9IG9wdHMudGltZXN0YW1wUmVxdWVzdHM7XG4gICAgdGhpcy50cmFuc3BvcnRzID0gb3B0cy50cmFuc3BvcnRzIHx8IFsnd2Vic29ja2V0J107XG4gICAgdGhpcy5yZWFkeVN0YXRlID0gJyc7XG4gICAgdGhpcy53cml0ZUJ1ZmZlciA9IFtdO1xuICAgIHRoaXMucHJldkJ1ZmZlckxlbiA9IDA7XG4gICAgdGhpcy5wb2xpY3lQb3J0ID0gb3B0cy5wb2xpY3lQb3J0IHx8IDg0MztcbiAgICB0aGlzLnJlbWVtYmVyVXBncmFkZSA9IG9wdHMucmVtZW1iZXJVcGdyYWRlIHx8IGZhbHNlO1xuICAgIHRoaXMuYmluYXJ5VHlwZSA9IG51bGw7XG4gICAgdGhpcy5vbmx5QmluYXJ5VXBncmFkZXMgPSBvcHRzLm9ubHlCaW5hcnlVcGdyYWRlcztcbiAgICB0aGlzLnBlck1lc3NhZ2VEZWZsYXRlID0gZmFsc2UgIT09IG9wdHMucGVyTWVzc2FnZURlZmxhdGUgPyAob3B0cy5wZXJNZXNzYWdlRGVmbGF0ZSB8fCB7fSkgOiBmYWxzZTtcblxuICAgIGlmICh0cnVlID09PSB0aGlzLnBlck1lc3NhZ2VEZWZsYXRlKSB0aGlzLnBlck1lc3NhZ2VEZWZsYXRlID0ge307XG4gICAgaWYgKHRoaXMucGVyTWVzc2FnZURlZmxhdGUgJiYgbnVsbCA9PSB0aGlzLnBlck1lc3NhZ2VEZWZsYXRlLnRocmVzaG9sZCkge1xuICAgICAgICB0aGlzLnBlck1lc3NhZ2VEZWZsYXRlLnRocmVzaG9sZCA9IDEwMjQ7XG4gICAgfVxuXG4gICAgLy8gU1NMIG9wdGlvbnMgZm9yIE5vZGUuanMgY2xpZW50XG4gICAgdGhpcy5wZnggPSBvcHRzLnBmeCB8fCBudWxsO1xuICAgIHRoaXMua2V5ID0gb3B0cy5rZXkgfHwgbnVsbDtcbiAgICB0aGlzLnBhc3NwaHJhc2UgPSBvcHRzLnBhc3NwaHJhc2UgfHwgbnVsbDtcbiAgICB0aGlzLmNlcnQgPSBvcHRzLmNlcnQgfHwgbnVsbDtcbiAgICB0aGlzLmNhID0gb3B0cy5jYSB8fCBudWxsO1xuICAgIHRoaXMuY2lwaGVycyA9IG9wdHMuY2lwaGVycyB8fCBudWxsO1xuICAgIHRoaXMucmVqZWN0VW5hdXRob3JpemVkID0gb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBvcHRzLnJlamVjdFVuYXV0aG9yaXplZDtcbiAgICB0aGlzLmZvcmNlTm9kZSA9ICEhb3B0cy5mb3JjZU5vZGU7XG5cbiAgICAvLyBvdGhlciBvcHRpb25zIGZvciBOb2RlLmpzIGNsaWVudFxuICAgIHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuICAgIGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCkge1xuICAgICAgICBpZiAob3B0cy5leHRyYUhlYWRlcnMgJiYgT2JqZWN0LmtleXMob3B0cy5leHRyYUhlYWRlcnMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZXh0cmFIZWFkZXJzID0gb3B0cy5leHRyYUhlYWRlcnM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0cy5sb2NhbEFkZHJlc3MpIHtcbiAgICAgICAgICAgIHRoaXMubG9jYWxBZGRyZXNzID0gb3B0cy5sb2NhbEFkZHJlc3M7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBzZXQgb24gaGFuZHNoYWtlXG4gICAgdGhpcy5pZCA9IG51bGw7XG4gICAgdGhpcy51cGdyYWRlcyA9IG51bGw7XG4gICAgdGhpcy5waW5nSW50ZXJ2YWwgPSBudWxsO1xuICAgIHRoaXMucGluZ1RpbWVvdXQgPSBudWxsO1xuXG4gICAgLy8gc2V0IG9uIGhlYXJ0YmVhdFxuICAgIHRoaXMucGluZ0ludGVydmFsVGltZXIgPSBudWxsO1xuICAgIHRoaXMucGluZ1RpbWVvdXRUaW1lciA9IG51bGw7XG5cbiAgICB0aGlzLm9wZW4oKTtcbn1cblxuU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9IGZhbHNlO1xuXG4vKipcbiAqIE1peCBpbiBgRW1pdHRlcmAuXG4gKi9cblxuRW1pdHRlcihTb2NrZXQucHJvdG90eXBlKTtcblxuLyoqXG4gKiBQcm90b2NvbCB2ZXJzaW9uLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU29ja2V0LnByb3RvY29sID0gcGFyc2VyLnByb3RvY29sOyAvLyB0aGlzIGlzIGFuIGludFxuXG4vKipcbiAqIEV4cG9zZSBkZXBzIGZvciBsZWdhY3kgY29tcGF0aWJpbGl0eVxuICogYW5kIHN0YW5kYWxvbmUgYnJvd3NlciBhY2Nlc3MuXG4gKi9cblxuU29ja2V0LlNvY2tldCA9IFNvY2tldDtcblNvY2tldC5UcmFuc3BvcnQgPSByZXF1aXJlKCcuL3RyYW5zcG9ydCcpO1xuU29ja2V0LnRyYW5zcG9ydHMgPSByZXF1aXJlKCcuL3RyYW5zcG9ydHMvaW5kZXgnKTtcblNvY2tldC5wYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG5cbi8qKlxuICogQ3JlYXRlcyB0cmFuc3BvcnQgb2YgdGhlIGdpdmVuIHR5cGUuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRyYW5zcG9ydCBuYW1lXG4gKiBAcmV0dXJuIHtUcmFuc3BvcnR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLmNyZWF0ZVRyYW5zcG9ydCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgZGVidWcoJ2NyZWF0aW5nIHRyYW5zcG9ydCBcIiVzXCInLCBuYW1lKTtcbiAgICB2YXIgcXVlcnkgPSBjbG9uZSh0aGlzLnF1ZXJ5KTtcblxuICAgIC8vIGFwcGVuZCBlbmdpbmUuaW8gcHJvdG9jb2wgaWRlbnRpZmllclxuICAgIHF1ZXJ5LkVJTyA9IHBhcnNlci5wcm90b2NvbDtcblxuICAgIC8vIHRyYW5zcG9ydCBuYW1lXG4gICAgcXVlcnkudHJhbnNwb3J0ID0gbmFtZTtcblxuICAgIC8vIHNlc3Npb24gaWQgaWYgd2UgYWxyZWFkeSBoYXZlIG9uZVxuICAgIGlmICh0aGlzLmlkKSBxdWVyeS5zaWQgPSB0aGlzLmlkO1xuXG4gICAgdmFyIHRyYW5zcG9ydCA9IG5ldyB0cmFuc3BvcnRzW25hbWVdKHtcbiAgICAgICAgYWdlbnQ6IHRoaXMuYWdlbnQsXG4gICAgICAgIGhvc3RuYW1lOiB0aGlzLmhvc3RuYW1lLFxuICAgICAgICBwb3J0OiB0aGlzLnBvcnQsXG4gICAgICAgIHNlY3VyZTogdGhpcy5zZWN1cmUsXG4gICAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgICAgcXVlcnk6IHF1ZXJ5LFxuICAgICAgICBmb3JjZUpTT05QOiB0aGlzLmZvcmNlSlNPTlAsXG4gICAgICAgIGpzb25wOiB0aGlzLmpzb25wLFxuICAgICAgICBmb3JjZUJhc2U2NDogdGhpcy5mb3JjZUJhc2U2NCxcbiAgICAgICAgZW5hYmxlc1hEUjogdGhpcy5lbmFibGVzWERSLFxuICAgICAgICB0aW1lc3RhbXBSZXF1ZXN0czogdGhpcy50aW1lc3RhbXBSZXF1ZXN0cyxcbiAgICAgICAgdGltZXN0YW1wUGFyYW06IHRoaXMudGltZXN0YW1wUGFyYW0sXG4gICAgICAgIHBvbGljeVBvcnQ6IHRoaXMucG9saWN5UG9ydCxcbiAgICAgICAgc29ja2V0OiB0aGlzLFxuICAgICAgICBwZng6IHRoaXMucGZ4LFxuICAgICAgICBrZXk6IHRoaXMua2V5LFxuICAgICAgICBwYXNzcGhyYXNlOiB0aGlzLnBhc3NwaHJhc2UsXG4gICAgICAgIGNlcnQ6IHRoaXMuY2VydCxcbiAgICAgICAgY2E6IHRoaXMuY2EsXG4gICAgICAgIGNpcGhlcnM6IHRoaXMuY2lwaGVycyxcbiAgICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCxcbiAgICAgICAgcGVyTWVzc2FnZURlZmxhdGU6IHRoaXMucGVyTWVzc2FnZURlZmxhdGUsXG4gICAgICAgIGV4dHJhSGVhZGVyczogdGhpcy5leHRyYUhlYWRlcnMsXG4gICAgICAgIGZvcmNlTm9kZTogdGhpcy5mb3JjZU5vZGUsXG4gICAgICAgIGxvY2FsQWRkcmVzczogdGhpcy5sb2NhbEFkZHJlc3NcbiAgICB9KTtcblxuICAgIHJldHVybiB0cmFuc3BvcnQ7XG59O1xuXG5mdW5jdGlvbiBjbG9uZShvYmopIHtcbiAgICB2YXIgbyA9IHt9O1xuICAgIGZvciAodmFyIGkgaW4gb2JqKSB7XG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgICAgIG9baV0gPSBvYmpbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG87XG59XG5cbi8qKlxuICogSW5pdGlhbGl6ZXMgdHJhbnNwb3J0IHRvIHVzZSBhbmQgc3RhcnRzIHByb2JlLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5Tb2NrZXQucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRyYW5zcG9ydDtcbiAgICBpZiAodGhpcy5yZW1lbWJlclVwZ3JhZGUgJiYgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyAmJiB0aGlzLnRyYW5zcG9ydHMuaW5kZXhPZignd2Vic29ja2V0JykgIT09IC0xKSB7XG4gICAgICAgIHRyYW5zcG9ydCA9ICd3ZWJzb2NrZXQnO1xuICAgIH0gZWxzZSBpZiAoMCA9PT0gdGhpcy50cmFuc3BvcnRzLmxlbmd0aCkge1xuICAgICAgICAvLyBFbWl0IGVycm9yIG9uIG5leHQgdGljayBzbyBpdCBjYW4gYmUgbGlzdGVuZWQgdG9cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCAnTm8gdHJhbnNwb3J0cyBhdmFpbGFibGUnKTtcbiAgICAgICAgfSwgMCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0cmFuc3BvcnQgPSB0aGlzLnRyYW5zcG9ydHNbMF07XG4gICAgfVxuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuaW5nJztcblxuICAgIC8vIFJldHJ5IHdpdGggdGhlIG5leHQgdHJhbnNwb3J0IGlmIHRoZSB0cmFuc3BvcnQgaXMgZGlzYWJsZWQgKGpzb25wOiBmYWxzZSlcbiAgICB0cnkge1xuICAgICAgICB0cmFuc3BvcnQgPSB0aGlzLmNyZWF0ZVRyYW5zcG9ydCh0cmFuc3BvcnQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhpcy50cmFuc3BvcnRzLnNoaWZ0KCk7XG4gICAgICAgIHRoaXMub3BlbigpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJhbnNwb3J0Lm9wZW4oKTtcbiAgICB0aGlzLnNldFRyYW5zcG9ydCh0cmFuc3BvcnQpO1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSBjdXJyZW50IHRyYW5zcG9ydC4gRGlzYWJsZXMgdGhlIGV4aXN0aW5nIG9uZSAoaWYgYW55KS5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLnNldFRyYW5zcG9ydCA9IGZ1bmN0aW9uICh0cmFuc3BvcnQpIHtcbiAgICBkZWJ1Zygnc2V0dGluZyB0cmFuc3BvcnQgJXMnLCB0cmFuc3BvcnQubmFtZSk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgaWYgKHRoaXMudHJhbnNwb3J0KSB7XG4gICAgICAgIGRlYnVnKCdjbGVhcmluZyBleGlzdGluZyB0cmFuc3BvcnQgJXMnLCB0aGlzLnRyYW5zcG9ydC5uYW1lKTtcbiAgICAgICAgdGhpcy50cmFuc3BvcnQucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG4gICAgfVxuXG4gICAgLy8gc2V0IHVwIHRyYW5zcG9ydFxuICAgIHRoaXMudHJhbnNwb3J0ID0gdHJhbnNwb3J0O1xuXG4gICAgLy8gc2V0IHVwIHRyYW5zcG9ydCBsaXN0ZW5lcnNcbiAgICB0cmFuc3BvcnRcbiAgICAgICAgLm9uKCdkcmFpbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYub25EcmFpbigpO1xuICAgICAgICB9KVxuICAgICAgICAub24oJ3BhY2tldCcsIGZ1bmN0aW9uIChwYWNrZXQpIHtcbiAgICAgICAgICAgIHNlbGYub25QYWNrZXQocGFja2V0KTtcbiAgICAgICAgfSlcbiAgICAgICAgLm9uKCdlcnJvcicsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICBzZWxmLm9uRXJyb3IoZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5vbignY2xvc2UnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLm9uQ2xvc2UoJ3RyYW5zcG9ydCBjbG9zZScpO1xuICAgICAgICB9KTtcbn07XG5cbi8qKlxuICogUHJvYmVzIGEgdHJhbnNwb3J0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0cmFuc3BvcnQgbmFtZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5wcm9iZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgZGVidWcoJ3Byb2JpbmcgdHJhbnNwb3J0IFwiJXNcIicsIG5hbWUpO1xuICAgIHZhciB0cmFuc3BvcnQgPSB0aGlzLmNyZWF0ZVRyYW5zcG9ydChuYW1lLCB7cHJvYmU6IDF9KTtcbiAgICB2YXIgZmFpbGVkID0gZmFsc2U7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gb25UcmFuc3BvcnRPcGVuKCkge1xuICAgICAgICBpZiAoc2VsZi5vbmx5QmluYXJ5VXBncmFkZXMpIHtcbiAgICAgICAgICAgIHZhciB1cGdyYWRlTG9zZXNCaW5hcnkgPSAhdGhpcy5zdXBwb3J0c0JpbmFyeSAmJiBzZWxmLnRyYW5zcG9ydC5zdXBwb3J0c0JpbmFyeTtcbiAgICAgICAgICAgIGZhaWxlZCA9IGZhaWxlZCB8fCB1cGdyYWRlTG9zZXNCaW5hcnk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZhaWxlZCkgcmV0dXJuO1xuXG4gICAgICAgIGRlYnVnKCdwcm9iZSB0cmFuc3BvcnQgXCIlc1wiIG9wZW5lZCcsIG5hbWUpO1xuICAgICAgICB0cmFuc3BvcnQuc2VuZChbe3R5cGU6ICdwaW5nJywgZGF0YTogJ3Byb2JlJ31dKTtcbiAgICAgICAgdHJhbnNwb3J0Lm9uY2UoJ3BhY2tldCcsIGZ1bmN0aW9uIChtc2cpIHtcbiAgICAgICAgICAgIGlmIChmYWlsZWQpIHJldHVybjtcbiAgICAgICAgICAgIGlmICgncG9uZycgPT09IG1zZy50eXBlICYmICdwcm9iZScgPT09IG1zZy5kYXRhKSB7XG4gICAgICAgICAgICAgICAgZGVidWcoJ3Byb2JlIHRyYW5zcG9ydCBcIiVzXCIgcG9uZycsIG5hbWUpO1xuICAgICAgICAgICAgICAgIHNlbGYudXBncmFkaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3VwZ3JhZGluZycsIHRyYW5zcG9ydCk7XG4gICAgICAgICAgICAgICAgaWYgKCF0cmFuc3BvcnQpIHJldHVybjtcbiAgICAgICAgICAgICAgICBTb2NrZXQucHJpb3JXZWJzb2NrZXRTdWNjZXNzID0gJ3dlYnNvY2tldCcgPT09IHRyYW5zcG9ydC5uYW1lO1xuXG4gICAgICAgICAgICAgICAgZGVidWcoJ3BhdXNpbmcgY3VycmVudCB0cmFuc3BvcnQgXCIlc1wiJywgc2VsZi50cmFuc3BvcnQubmFtZSk7XG4gICAgICAgICAgICAgICAgc2VsZi50cmFuc3BvcnQucGF1c2UoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmFpbGVkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGlmICgnY2xvc2VkJyA9PT0gc2VsZi5yZWFkeVN0YXRlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGRlYnVnKCdjaGFuZ2luZyB0cmFuc3BvcnQgYW5kIHNlbmRpbmcgdXBncmFkZSBwYWNrZXQnKTtcblxuICAgICAgICAgICAgICAgICAgICBjbGVhbnVwKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zZXRUcmFuc3BvcnQodHJhbnNwb3J0KTtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnNwb3J0LnNlbmQoW3t0eXBlOiAndXBncmFkZSd9XSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgndXBncmFkZScsIHRyYW5zcG9ydCk7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zcG9ydCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYudXBncmFkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZmx1c2goKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVidWcoJ3Byb2JlIHRyYW5zcG9ydCBcIiVzXCIgZmFpbGVkJywgbmFtZSk7XG4gICAgICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcigncHJvYmUgZXJyb3InKTtcbiAgICAgICAgICAgICAgICBlcnIudHJhbnNwb3J0ID0gdHJhbnNwb3J0Lm5hbWU7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCd1cGdyYWRlRXJyb3InLCBlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmcmVlemVUcmFuc3BvcnQoKSB7XG4gICAgICAgIGlmIChmYWlsZWQpIHJldHVybjtcblxuICAgICAgICAvLyBBbnkgY2FsbGJhY2sgY2FsbGVkIGJ5IHRyYW5zcG9ydCBzaG91bGQgYmUgaWdub3JlZCBzaW5jZSBub3dcbiAgICAgICAgZmFpbGVkID0gdHJ1ZTtcblxuICAgICAgICBjbGVhbnVwKCk7XG5cbiAgICAgICAgdHJhbnNwb3J0LmNsb3NlKCk7XG4gICAgICAgIHRyYW5zcG9ydCA9IG51bGw7XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIGFueSBlcnJvciB0aGF0IGhhcHBlbnMgd2hpbGUgcHJvYmluZ1xuICAgIGZ1bmN0aW9uIG9uZXJyb3IoZXJyKSB7XG4gICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcigncHJvYmUgZXJyb3I6ICcgKyBlcnIpO1xuICAgICAgICBlcnJvci50cmFuc3BvcnQgPSB0cmFuc3BvcnQubmFtZTtcblxuICAgICAgICBmcmVlemVUcmFuc3BvcnQoKTtcblxuICAgICAgICBkZWJ1ZygncHJvYmUgdHJhbnNwb3J0IFwiJXNcIiBmYWlsZWQgYmVjYXVzZSBvZiBlcnJvcjogJXMnLCBuYW1lLCBlcnIpO1xuXG4gICAgICAgIHNlbGYuZW1pdCgndXBncmFkZUVycm9yJywgZXJyb3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uVHJhbnNwb3J0Q2xvc2UoKSB7XG4gICAgICAgIG9uZXJyb3IoJ3RyYW5zcG9ydCBjbG9zZWQnKTtcbiAgICB9XG5cbiAgICAvLyBXaGVuIHRoZSBzb2NrZXQgaXMgY2xvc2VkIHdoaWxlIHdlJ3JlIHByb2JpbmdcbiAgICBmdW5jdGlvbiBvbmNsb3NlKCkge1xuICAgICAgICBvbmVycm9yKCdzb2NrZXQgY2xvc2VkJyk7XG4gICAgfVxuXG4gICAgLy8gV2hlbiB0aGUgc29ja2V0IGlzIHVwZ3JhZGVkIHdoaWxlIHdlJ3JlIHByb2JpbmdcbiAgICBmdW5jdGlvbiBvbnVwZ3JhZGUodG8pIHtcbiAgICAgICAgaWYgKHRyYW5zcG9ydCAmJiB0by5uYW1lICE9PSB0cmFuc3BvcnQubmFtZSkge1xuICAgICAgICAgICAgZGVidWcoJ1wiJXNcIiB3b3JrcyAtIGFib3J0aW5nIFwiJXNcIicsIHRvLm5hbWUsIHRyYW5zcG9ydC5uYW1lKTtcbiAgICAgICAgICAgIGZyZWV6ZVRyYW5zcG9ydCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGFsbCBsaXN0ZW5lcnMgb24gdGhlIHRyYW5zcG9ydCBhbmQgb24gc2VsZlxuICAgIGZ1bmN0aW9uIGNsZWFudXAoKSB7XG4gICAgICAgIHRyYW5zcG9ydC5yZW1vdmVMaXN0ZW5lcignb3BlbicsIG9uVHJhbnNwb3J0T3Blbik7XG4gICAgICAgIHRyYW5zcG9ydC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbmVycm9yKTtcbiAgICAgICAgdHJhbnNwb3J0LnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uVHJhbnNwb3J0Q2xvc2UpO1xuICAgICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uY2xvc2UpO1xuICAgICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCd1cGdyYWRpbmcnLCBvbnVwZ3JhZGUpO1xuICAgIH1cblxuICAgIHRyYW5zcG9ydC5vbmNlKCdvcGVuJywgb25UcmFuc3BvcnRPcGVuKTtcbiAgICB0cmFuc3BvcnQub25jZSgnZXJyb3InLCBvbmVycm9yKTtcbiAgICB0cmFuc3BvcnQub25jZSgnY2xvc2UnLCBvblRyYW5zcG9ydENsb3NlKTtcblxuICAgIHRoaXMub25jZSgnY2xvc2UnLCBvbmNsb3NlKTtcbiAgICB0aGlzLm9uY2UoJ3VwZ3JhZGluZycsIG9udXBncmFkZSk7XG5cbiAgICB0cmFuc3BvcnQub3BlbigpO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgd2hlbiBjb25uZWN0aW9uIGlzIGRlZW1lZCBvcGVuLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbk9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgZGVidWcoJ3NvY2tldCBvcGVuJyk7XG4gICAgdGhpcy5yZWFkeVN0YXRlID0gJ29wZW4nO1xuICAgIFNvY2tldC5wcmlvcldlYnNvY2tldFN1Y2Nlc3MgPSAnd2Vic29ja2V0JyA9PT0gdGhpcy50cmFuc3BvcnQubmFtZTtcbiAgICB0aGlzLmVtaXQoJ29wZW4nKTtcbiAgICB0aGlzLmZsdXNoKCk7XG5cbiAgICAvLyB3ZSBjaGVjayBmb3IgYHJlYWR5U3RhdGVgIGluIGNhc2UgYW4gYG9wZW5gXG4gICAgLy8gbGlzdGVuZXIgYWxyZWFkeSBjbG9zZWQgdGhlIHNvY2tldFxuICAgIGlmICgnb3BlbicgPT09IHRoaXMucmVhZHlTdGF0ZSAmJiB0aGlzLnVwZ3JhZGUgJiYgdGhpcy50cmFuc3BvcnQucGF1c2UpIHtcbiAgICAgICAgZGVidWcoJ3N0YXJ0aW5nIHVwZ3JhZGUgcHJvYmVzJyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy51cGdyYWRlcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMucHJvYmUodGhpcy51cGdyYWRlc1tpXSk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgYSBwYWNrZXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vblBhY2tldCA9IGZ1bmN0aW9uIChwYWNrZXQpIHtcbiAgICBpZiAoJ29wZW5pbmcnID09PSB0aGlzLnJlYWR5U3RhdGUgfHwgJ29wZW4nID09PSB0aGlzLnJlYWR5U3RhdGUgfHxcbiAgICAgICAgJ2Nsb3NpbmcnID09PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICAgICAgZGVidWcoJ3NvY2tldCByZWNlaXZlOiB0eXBlIFwiJXNcIiwgZGF0YSBcIiVzXCInLCBwYWNrZXQudHlwZSwgcGFja2V0LmRhdGEpO1xuXG4gICAgICAgIHRoaXMuZW1pdCgncGFja2V0JywgcGFja2V0KTtcblxuICAgICAgICAvLyBTb2NrZXQgaXMgbGl2ZSAtIGFueSBwYWNrZXQgY291bnRzXG4gICAgICAgIHRoaXMuZW1pdCgnaGVhcnRiZWF0Jyk7XG5cbiAgICAgICAgc3dpdGNoIChwYWNrZXQudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnb3Blbic6XG4gICAgICAgICAgICAgICAgdGhpcy5vbkhhbmRzaGFrZShwYXJzZWpzb24ocGFja2V0LmRhdGEpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAncG9uZyc6XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQaW5nKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdwb25nJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ2Vycm9yJzpcbiAgICAgICAgICAgICAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdzZXJ2ZXIgZXJyb3InKTtcbiAgICAgICAgICAgICAgICBlcnIuY29kZSA9IHBhY2tldC5kYXRhO1xuICAgICAgICAgICAgICAgIHRoaXMub25FcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdtZXNzYWdlJzpcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ2RhdGEnLCBwYWNrZXQuZGF0YSk7XG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdtZXNzYWdlJywgcGFja2V0LmRhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZGVidWcoJ3BhY2tldCByZWNlaXZlZCB3aXRoIHNvY2tldCByZWFkeVN0YXRlIFwiJXNcIicsIHRoaXMucmVhZHlTdGF0ZSk7XG4gICAgfVxufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiBoYW5kc2hha2UgY29tcGxldGlvbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gaGFuZHNoYWtlIG9ialxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkhhbmRzaGFrZSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgdGhpcy5lbWl0KCdoYW5kc2hha2UnLCBkYXRhKTtcbiAgICB0aGlzLmlkID0gZGF0YS5zaWQ7XG4gICAgdGhpcy50cmFuc3BvcnQucXVlcnkuc2lkID0gZGF0YS5zaWQ7XG4gICAgdGhpcy51cGdyYWRlcyA9IHRoaXMuZmlsdGVyVXBncmFkZXMoZGF0YS51cGdyYWRlcyk7XG4gICAgdGhpcy5waW5nSW50ZXJ2YWwgPSBkYXRhLnBpbmdJbnRlcnZhbDtcbiAgICB0aGlzLnBpbmdUaW1lb3V0ID0gZGF0YS5waW5nVGltZW91dDtcbiAgICB0aGlzLm9uT3BlbigpO1xuICAgIC8vIEluIGNhc2Ugb3BlbiBoYW5kbGVyIGNsb3NlcyBzb2NrZXRcbiAgICBpZiAoJ2Nsb3NlZCcgPT09IHRoaXMucmVhZHlTdGF0ZSkgcmV0dXJuO1xuICAgIHRoaXMuc2V0UGluZygpO1xuXG4gICAgLy8gUHJvbG9uZyBsaXZlbmVzcyBvZiBzb2NrZXQgb24gaGVhcnRiZWF0XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcignaGVhcnRiZWF0JywgdGhpcy5vbkhlYXJ0YmVhdCk7XG4gICAgdGhpcy5vbignaGVhcnRiZWF0JywgdGhpcy5vbkhlYXJ0YmVhdCk7XG59O1xuXG4vKipcbiAqIFJlc2V0cyBwaW5nIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5vbkhlYXJ0YmVhdCA9IGZ1bmN0aW9uICh0aW1lb3V0KSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMucGluZ1RpbWVvdXRUaW1lcik7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYucGluZ1RpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoJ2Nsb3NlZCcgPT09IHNlbGYucmVhZHlTdGF0ZSkgcmV0dXJuO1xuICAgICAgICBzZWxmLm9uQ2xvc2UoJ3BpbmcgdGltZW91dCcpO1xuICAgIH0sIHRpbWVvdXQgfHwgKHNlbGYucGluZ0ludGVydmFsICsgc2VsZi5waW5nVGltZW91dCkpO1xufTtcblxuLyoqXG4gKiBQaW5ncyBzZXJ2ZXIgZXZlcnkgYHRoaXMucGluZ0ludGVydmFsYCBhbmQgZXhwZWN0cyByZXNwb25zZVxuICogd2l0aGluIGB0aGlzLnBpbmdUaW1lb3V0YCBvciBjbG9zZXMgY29ubmVjdGlvbi5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLnNldFBpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGNsZWFyVGltZW91dChzZWxmLnBpbmdJbnRlcnZhbFRpbWVyKTtcbiAgICBzZWxmLnBpbmdJbnRlcnZhbFRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRlYnVnKCd3cml0aW5nIHBpbmcgcGFja2V0IC0gZXhwZWN0aW5nIHBvbmcgd2l0aGluICVzbXMnLCBzZWxmLnBpbmdUaW1lb3V0KTtcbiAgICAgICAgc2VsZi5waW5nKCk7XG4gICAgICAgIHNlbGYub25IZWFydGJlYXQoc2VsZi5waW5nVGltZW91dCk7XG4gICAgfSwgc2VsZi5waW5nSW50ZXJ2YWwpO1xufTtcblxuLyoqXG4gKiBTZW5kcyBhIHBpbmcgcGFja2V0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUucGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5zZW5kUGFja2V0KCdwaW5nJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBzZWxmLmVtaXQoJ3BpbmcnKTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIG9uIGBkcmFpbmAgZXZlbnRcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uRHJhaW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy53cml0ZUJ1ZmZlci5zcGxpY2UoMCwgdGhpcy5wcmV2QnVmZmVyTGVuKTtcblxuICAgIC8vIHNldHRpbmcgcHJldkJ1ZmZlckxlbiA9IDAgaXMgdmVyeSBpbXBvcnRhbnRcbiAgICAvLyBmb3IgZXhhbXBsZSwgd2hlbiB1cGdyYWRpbmcsIHVwZ3JhZGUgcGFja2V0IGlzIHNlbnQgb3ZlcixcbiAgICAvLyBhbmQgYSBub256ZXJvIHByZXZCdWZmZXJMZW4gY291bGQgY2F1c2UgcHJvYmxlbXMgb24gYGRyYWluYFxuICAgIHRoaXMucHJldkJ1ZmZlckxlbiA9IDA7XG5cbiAgICBpZiAoMCA9PT0gdGhpcy53cml0ZUJ1ZmZlci5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdkcmFpbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZmx1c2goKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEZsdXNoIHdyaXRlIGJ1ZmZlcnMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5mbHVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoJ2Nsb3NlZCcgIT09IHRoaXMucmVhZHlTdGF0ZSAmJiB0aGlzLnRyYW5zcG9ydC53cml0YWJsZSAmJiAhdGhpcy51cGdyYWRpbmcgJiYgdGhpcy53cml0ZUJ1ZmZlci5sZW5ndGgpIHtcbiAgICAgICAgZGVidWcoJ2ZsdXNoaW5nICVkIHBhY2tldHMgaW4gc29ja2V0JywgdGhpcy53cml0ZUJ1ZmZlci5sZW5ndGgpO1xuICAgICAgICB0aGlzLnRyYW5zcG9ydC5zZW5kKHRoaXMud3JpdGVCdWZmZXIpO1xuICAgICAgICAvLyBrZWVwIHRyYWNrIG9mIGN1cnJlbnQgbGVuZ3RoIG9mIHdyaXRlQnVmZmVyXG4gICAgICAgIC8vIHNwbGljZSB3cml0ZUJ1ZmZlciBhbmQgY2FsbGJhY2tCdWZmZXIgb24gYGRyYWluYFxuICAgICAgICB0aGlzLnByZXZCdWZmZXJMZW4gPSB0aGlzLndyaXRlQnVmZmVyLmxlbmd0aDtcbiAgICAgICAgdGhpcy5lbWl0KCdmbHVzaCcpO1xuICAgIH1lbHNle1xuICAgIH1cbn07XG5cbi8qKlxuICogU2VuZHMgYSBtZXNzYWdlLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgZnVuY3Rpb24uXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucy5cbiAqIEByZXR1cm4ge1NvY2tldH0gZm9yIGNoYWluaW5nLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLndyaXRlID1cbiAgICBTb2NrZXQucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAobXNnLCBvcHRpb25zLCBmbikge1xuICAgICAgICB0aGlzLnNlbmRQYWNrZXQoJ21lc3NhZ2UnLCBtc2csIG9wdGlvbnMsIGZuKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuLyoqXG4gKiBTZW5kcyBhIHBhY2tldC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFja2V0IHR5cGUuXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgZnVuY3Rpb24uXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLnNlbmRQYWNrZXQgPSBmdW5jdGlvbiAodHlwZSwgZGF0YSwgb3B0aW9ucywgZm4pIHtcbiAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGRhdGEpIHtcbiAgICAgICAgZm4gPSBkYXRhO1xuICAgICAgICBkYXRhID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2Ygb3B0aW9ucykge1xuICAgICAgICBmbiA9IG9wdGlvbnM7XG4gICAgICAgIG9wdGlvbnMgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICgnY2xvc2luZycgPT09IHRoaXMucmVhZHlTdGF0ZSB8fCAnY2xvc2VkJyA9PT0gdGhpcy5yZWFkeVN0YXRlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICBvcHRpb25zLmNvbXByZXNzID0gZmFsc2UgIT09IG9wdGlvbnMuY29tcHJlc3M7XG5cbiAgICB2YXIgcGFja2V0ID0ge1xuICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICBvcHRpb25zOiBvcHRpb25zXG4gICAgfTtcbiAgICB0aGlzLmVtaXQoJ3BhY2tldENyZWF0ZScsIHBhY2tldCk7XG4gICAgdGhpcy53cml0ZUJ1ZmZlci5wdXNoKHBhY2tldCk7XG4gICAgaWYgKGZuKSB0aGlzLm9uY2UoJ2ZsdXNoJywgZm4pO1xuICAgIHRoaXMuZmx1c2goKTtcbn07XG5cbi8qKlxuICogQ2xvc2VzIHRoZSBjb25uZWN0aW9uLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKCdvcGVuaW5nJyA9PT0gdGhpcy5yZWFkeVN0YXRlIHx8ICdvcGVuJyA9PT0gdGhpcy5yZWFkeVN0YXRlKSB7XG4gICAgICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdjbG9zaW5nJztcblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgaWYgKHRoaXMud3JpdGVCdWZmZXIubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLm9uY2UoJ2RyYWluJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnVwZ3JhZGluZykge1xuICAgICAgICAgICAgICAgICAgICB3YWl0Rm9yVXBncmFkZSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNsb3NlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy51cGdyYWRpbmcpIHtcbiAgICAgICAgICAgIHdhaXRGb3JVcGdyYWRlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjbG9zZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xvc2UoKSB7XG4gICAgICAgIHNlbGYub25DbG9zZSgnZm9yY2VkIGNsb3NlJyk7XG4gICAgICAgIGRlYnVnKCdzb2NrZXQgY2xvc2luZyAtIHRlbGxpbmcgdHJhbnNwb3J0IHRvIGNsb3NlJyk7XG4gICAgICAgIHNlbGYudHJhbnNwb3J0LmNsb3NlKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYW51cEFuZENsb3NlKCkge1xuICAgICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCd1cGdyYWRlJywgY2xlYW51cEFuZENsb3NlKTtcbiAgICAgICAgc2VsZi5yZW1vdmVMaXN0ZW5lcigndXBncmFkZUVycm9yJywgY2xlYW51cEFuZENsb3NlKTtcbiAgICAgICAgY2xvc2UoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWl0Rm9yVXBncmFkZSgpIHtcbiAgICAgICAgLy8gd2FpdCBmb3IgdXBncmFkZSB0byBmaW5pc2ggc2luY2Ugd2UgY2FuJ3Qgc2VuZCBwYWNrZXRzIHdoaWxlIHBhdXNpbmcgYSB0cmFuc3BvcnRcbiAgICAgICAgc2VsZi5vbmNlKCd1cGdyYWRlJywgY2xlYW51cEFuZENsb3NlKTtcbiAgICAgICAgc2VsZi5vbmNlKCd1cGdyYWRlRXJyb3InLCBjbGVhbnVwQW5kQ2xvc2UpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDYWxsZWQgdXBvbiB0cmFuc3BvcnQgZXJyb3JcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Tb2NrZXQucHJvdG90eXBlLm9uRXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgZGVidWcoJ3NvY2tldCBlcnJvciAlaicsIGVycik7XG4gICAgU29ja2V0LnByaW9yV2Vic29ja2V0U3VjY2VzcyA9IGZhbHNlO1xuICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuICAgIHRoaXMub25DbG9zZSgndHJhbnNwb3J0IGVycm9yJywgZXJyKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gdHJhbnNwb3J0IGNsb3NlLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblNvY2tldC5wcm90b3R5cGUub25DbG9zZSA9IGZ1bmN0aW9uIChyZWFzb24sIGRlc2MpIHtcbiAgICBpZiAoJ29wZW5pbmcnID09PSB0aGlzLnJlYWR5U3RhdGUgfHwgJ29wZW4nID09PSB0aGlzLnJlYWR5U3RhdGUgfHwgJ2Nsb3NpbmcnID09PSB0aGlzLnJlYWR5U3RhdGUpIHtcbiAgICAgICAgZGVidWcoJ3NvY2tldCBjbG9zZSB3aXRoIHJlYXNvbjogXCIlc1wiJywgcmVhc29uKTtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIC8vIGNsZWFyIHRpbWVyc1xuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5waW5nSW50ZXJ2YWxUaW1lcik7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnBpbmdUaW1lb3V0VGltZXIpO1xuXG4gICAgICAgIC8vIHN0b3AgZXZlbnQgZnJvbSBmaXJpbmcgYWdhaW4gZm9yIHRyYW5zcG9ydFxuICAgICAgICB0aGlzLnRyYW5zcG9ydC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2Nsb3NlJyk7XG5cbiAgICAgICAgLy8gZW5zdXJlIHRyYW5zcG9ydCB3b24ndCBzdGF5IG9wZW5cbiAgICAgICAgdGhpcy50cmFuc3BvcnQuY2xvc2UoKTtcblxuICAgICAgICAvLyBpZ25vcmUgZnVydGhlciB0cmFuc3BvcnQgY29tbXVuaWNhdGlvblxuICAgICAgICB0aGlzLnRyYW5zcG9ydC5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcblxuICAgICAgICAvLyBzZXQgcmVhZHkgc3RhdGVcbiAgICAgICAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nsb3NlZCc7XG5cbiAgICAgICAgLy8gY2xlYXIgc2Vzc2lvbiBpZFxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcblxuICAgICAgICAvLyBlbWl0IGNsb3NlIGV2ZW50XG4gICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnLCByZWFzb24sIGRlc2MpO1xuXG4gICAgICAgIC8vIGNsZWFuIGJ1ZmZlcnMgYWZ0ZXIsIHNvIHVzZXJzIGNhbiBzdGlsbFxuICAgICAgICAvLyBncmFiIHRoZSBidWZmZXJzIG9uIGBjbG9zZWAgZXZlbnRcbiAgICAgICAgc2VsZi53cml0ZUJ1ZmZlciA9IFtdO1xuICAgICAgICBzZWxmLnByZXZCdWZmZXJMZW4gPSAwO1xuICAgIH1cbn07XG5cbi8qKlxuICogRmlsdGVycyB1cGdyYWRlcywgcmV0dXJuaW5nIG9ubHkgdGhvc2UgbWF0Y2hpbmcgY2xpZW50IHRyYW5zcG9ydHMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gc2VydmVyIHVwZ3JhZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqXG4gKi9cblxuU29ja2V0LnByb3RvdHlwZS5maWx0ZXJVcGdyYWRlcyA9IGZ1bmN0aW9uICh1cGdyYWRlcykge1xuICAgIHZhciBmaWx0ZXJlZFVwZ3JhZGVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDAsIGogPSB1cGdyYWRlcy5sZW5ndGg7IGkgPCBqOyBpKyspIHtcbiAgICAgICAgaWYgKH5pbmRleCh0aGlzLnRyYW5zcG9ydHMsIHVwZ3JhZGVzW2ldKSkgZmlsdGVyZWRVcGdyYWRlcy5wdXNoKHVwZ3JhZGVzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGZpbHRlcmVkVXBncmFkZXM7XG59O1xuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBwYXJzZXIgPSByZXF1aXJlKCdlbmdpbmUuaW8tcGFyc2VyJyk7XG52YXIgRW1pdHRlciA9IHJlcXVpcmUoJ2NvbXBvbmVudC1lbWl0dGVyJyk7XG5cbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBUcmFuc3BvcnQ7XG5cbi8qKlxuICogVHJhbnNwb3J0IGFic3RyYWN0IGNvbnN0cnVjdG9yLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zLlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gVHJhbnNwb3J0IChvcHRzKSB7XG4gIHRoaXMucGF0aCA9IG9wdHMucGF0aDtcbiAgdGhpcy5ob3N0bmFtZSA9IG9wdHMuaG9zdG5hbWU7XG4gIHRoaXMucG9ydCA9IG9wdHMucG9ydDtcbiAgdGhpcy5zZWN1cmUgPSBvcHRzLnNlY3VyZTtcbiAgdGhpcy5xdWVyeSA9IG9wdHMucXVlcnk7XG4gIHRoaXMudGltZXN0YW1wUGFyYW0gPSBvcHRzLnRpbWVzdGFtcFBhcmFtO1xuICB0aGlzLnRpbWVzdGFtcFJlcXVlc3RzID0gb3B0cy50aW1lc3RhbXBSZXF1ZXN0cztcbiAgdGhpcy5yZWFkeVN0YXRlID0gJyc7XG4gIHRoaXMuYWdlbnQgPSBvcHRzLmFnZW50IHx8IGZhbHNlO1xuICB0aGlzLnNvY2tldCA9IG9wdHMuc29ja2V0O1xuICB0aGlzLmVuYWJsZXNYRFIgPSBvcHRzLmVuYWJsZXNYRFI7XG5cbiAgLy8gU1NMIG9wdGlvbnMgZm9yIE5vZGUuanMgY2xpZW50XG4gIHRoaXMucGZ4ID0gb3B0cy5wZng7XG4gIHRoaXMua2V5ID0gb3B0cy5rZXk7XG4gIHRoaXMucGFzc3BocmFzZSA9IG9wdHMucGFzc3BocmFzZTtcbiAgdGhpcy5jZXJ0ID0gb3B0cy5jZXJ0O1xuICB0aGlzLmNhID0gb3B0cy5jYTtcbiAgdGhpcy5jaXBoZXJzID0gb3B0cy5jaXBoZXJzO1xuICB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCA9IG9wdHMucmVqZWN0VW5hdXRob3JpemVkO1xuICB0aGlzLmZvcmNlTm9kZSA9IG9wdHMuZm9yY2VOb2RlO1xuXG4gIC8vIG90aGVyIG9wdGlvbnMgZm9yIE5vZGUuanMgY2xpZW50XG4gIHRoaXMuZXh0cmFIZWFkZXJzID0gb3B0cy5leHRyYUhlYWRlcnM7XG4gIHRoaXMubG9jYWxBZGRyZXNzID0gb3B0cy5sb2NhbEFkZHJlc3M7XG59XG5cbi8qKlxuICogTWl4IGluIGBFbWl0dGVyYC5cbiAqL1xuXG5FbWl0dGVyKFRyYW5zcG9ydC5wcm90b3R5cGUpO1xuXG4vKipcbiAqIEVtaXRzIGFuIGVycm9yLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1RyYW5zcG9ydH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUub25FcnJvciA9IGZ1bmN0aW9uIChtc2csIGRlc2MpIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcihtc2cpO1xuICBlcnIudHlwZSA9ICdUcmFuc3BvcnRFcnJvcic7XG4gIGVyci5kZXNjcmlwdGlvbiA9IGRlc2M7XG4gIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogT3BlbnMgdGhlIHRyYW5zcG9ydC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCdjbG9zZWQnID09PSB0aGlzLnJlYWR5U3RhdGUgfHwgJycgPT09IHRoaXMucmVhZHlTdGF0ZSkge1xuICAgIHRoaXMucmVhZHlTdGF0ZSA9ICdvcGVuaW5nJztcbiAgICB0aGlzLmRvT3BlbigpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIENsb3NlcyB0aGUgdHJhbnNwb3J0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICgnb3BlbmluZycgPT09IHRoaXMucmVhZHlTdGF0ZSB8fCAnb3BlbicgPT09IHRoaXMucmVhZHlTdGF0ZSkge1xuICAgIHRoaXMuZG9DbG9zZSgpO1xuICAgIHRoaXMub25DbG9zZSgpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNlbmRzIG11bHRpcGxlIHBhY2tldHMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gcGFja2V0c1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuVHJhbnNwb3J0LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKHBhY2tldHMpIHtcbiAgaWYgKCdvcGVuJyA9PT0gdGhpcy5yZWFkeVN0YXRlKSB7XG4gICAgdGhpcy53cml0ZShwYWNrZXRzKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RyYW5zcG9ydCBub3Qgb3BlbicpO1xuICB9XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIG9wZW5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5UcmFuc3BvcnQucHJvdG90eXBlLm9uT3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5yZWFkeVN0YXRlID0gJ29wZW4nO1xuICB0aGlzLndyaXRhYmxlID0gdHJ1ZTtcbiAgdGhpcy5lbWl0KCdvcGVuJyk7XG59O1xuXG4vKipcbiAqIENhbGxlZCB3aXRoIGRhdGEuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGRhdGFcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgdmFyIHBhY2tldCA9IHBhcnNlci5kZWNvZGVQYWNrZXQoZGF0YSwgdGhpcy5zb2NrZXQuYmluYXJ5VHlwZSk7XG4gIHRoaXMub25QYWNrZXQocGFja2V0KTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHdpdGggYSBkZWNvZGVkIHBhY2tldC5cbiAqL1xuXG5UcmFuc3BvcnQucHJvdG90eXBlLm9uUGFja2V0ID0gZnVuY3Rpb24gKHBhY2tldCkge1xuICB0aGlzLmVtaXQoJ3BhY2tldCcsIHBhY2tldCk7XG59O1xuXG4vKipcbiAqIENhbGxlZCB1cG9uIGNsb3NlLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblRyYW5zcG9ydC5wcm90b3R5cGUub25DbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5yZWFkeVN0YXRlID0gJ2Nsb3NlZCc7XG4gIHRoaXMuZW1pdCgnY2xvc2UnKTtcbn07XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgd2Vic29ja2V0ID0gcmVxdWlyZSgnLi93eHdlYnNvY2tldCcpO1xuXG4vKipcbiAqIEV4cG9ydCB0cmFuc3BvcnRzLlxuICovXG5cbmV4cG9ydHMud2Vic29ja2V0ID0gd2Vic29ja2V0OyIsIi8qKlxuICogQ3JlYXRlZCBieSBKUCBvbiAyMDE3LzEvNC5cbiAqL1xuXG52YXIgVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi4vdHJhbnNwb3J0Jyk7XG52YXIgcGFyc2VyID0gcmVxdWlyZSgnZW5naW5lLmlvLXBhcnNlcicpO1xudmFyIHBhcnNlcXMgPSByZXF1aXJlKCdwYXJzZXFzJyk7XG52YXIgaW5oZXJpdCA9IHJlcXVpcmUoJ2NvbXBvbmVudC1pbmhlcml0Jyk7XG52YXIgeWVhc3QgPSByZXF1aXJlKCd5ZWFzdCcpO1xudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnZW5naW5lLmlvLWNsaWVudDp3ZWJzb2NrZXQnKTtcbi8vdmFyIFdlYlNjb2tldCA9IGdsb2JhbC5XZWJTb2NrZXQgfHwgZ2xvYmFsLk1veldlYlNvY2tldDtcbmZ1bmN0aW9uIFdlYlNvY2tldCh1cmkpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5vbm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgfTtcblxuICAgIHNlbGYub25jbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB9O1xuXG4gICAgc2VsZi5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIH07XG5cbiAgICBzZWxmLm9uZXJyb3IgPSBmdW5jdGlvbiAoZSkge1xuICAgIH07XG5cbiAgICBzZWxmLnNlbmQgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB3eC5zZW5kU29ja2V0TWVzc2FnZSh7ZGF0YTogZGF0YX0pO1xuICAgIH07XG5cbiAgICBzZWxmLmNsb3NlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3eC5jbG9zZVNvY2tldCgpO1xuICAgIH07XG5cbiAgICB3eC5vblNvY2tldE9wZW4oZnVuY3Rpb24gKHJlcykge1xuICAgICAgICBzZWxmLm9ub3BlbigpO1xuICAgIH0pO1xuICAgIHd4Lm9uU29ja2V0RXJyb3IoZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgc2VsZi5vbmVycm9yKGUpO1xuICAgIH0pO1xuICAgIHd4Lm9uU29ja2V0TWVzc2FnZShmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgIHNlbGYub25tZXNzYWdlKHJlcyk7XG4gICAgfSk7XG4gICAgd3gub25Tb2NrZXRDbG9zZShmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgIHNlbGYub25jbG9zZSgpO1xuICAgIH0pO1xuICAgIHd4LmNvbm5lY3RTb2NrZXQoe3VybDogdXJpfSk7XG5cbn1cblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFdTO1xuXG4vKipcbiAqIFdlYlNvY2tldCB0cmFuc3BvcnQgY29uc3RydWN0b3IuXG4gKlxuICogQGFwaSB7T2JqZWN0fSBjb25uZWN0aW9uIG9wdGlvbnNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gV1Mob3B0cykge1xuICAgIHZhciBmb3JjZUJhc2U2NCA9IChvcHRzICYmIG9wdHMuZm9yY2VCYXNlNjQpO1xuICAgIGlmIChmb3JjZUJhc2U2NCkge1xuICAgICAgICB0aGlzLnN1cHBvcnRzQmluYXJ5ID0gZmFsc2U7XG4gICAgfVxuICAgIFRyYW5zcG9ydC5jYWxsKHRoaXMsIG9wdHMpO1xufVxuXG4vKipcbiAqIEluaGVyaXRzIGZyb20gVHJhbnNwb3J0LlxuICovXG5cbmluaGVyaXQoV1MsIFRyYW5zcG9ydCk7XG5cbi8qKlxuICogVHJhbnNwb3J0IG5hbWUuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5XUy5wcm90b3R5cGUubmFtZSA9ICd3ZWJzb2NrZXQnO1xuXG4vKipcbiAqIFdlYlNvY2tldHMgc3VwcG9ydCBiaW5hcnlcbiAqL1xuXG5XUy5wcm90b3R5cGUuc3VwcG9ydHNCaW5hcnkgPSBmYWxzZTtcblxuLyoqXG4gKiBPcGVucyBzb2NrZXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuV1MucHJvdG90eXBlLmRvT3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMuY2hlY2soKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHVyaSA9IHRoaXMudXJpKCk7XG4gICAgdmFyIG9wdHMgPSB7XG4gICAgICAgIGFnZW50OiB0aGlzLmFnZW50XG4gICAgfTtcblxuICAgIC8vIFNTTCBvcHRpb25zIGZvciBOb2RlLmpzIGNsaWVudFxuICAgIG9wdHMucGZ4ID0gdGhpcy5wZng7XG4gICAgb3B0cy5rZXkgPSB0aGlzLmtleTtcbiAgICBvcHRzLnBhc3NwaHJhc2UgPSB0aGlzLnBhc3NwaHJhc2U7XG4gICAgb3B0cy5jZXJ0ID0gdGhpcy5jZXJ0O1xuICAgIG9wdHMuY2EgPSB0aGlzLmNhO1xuICAgIG9wdHMuY2lwaGVycyA9IHRoaXMuY2lwaGVycztcbiAgICBvcHRzLnJlamVjdFVuYXV0aG9yaXplZCA9IHRoaXMucmVqZWN0VW5hdXRob3JpemVkO1xuICAgIGlmICh0aGlzLmV4dHJhSGVhZGVycykge1xuICAgICAgICBvcHRzLmhlYWRlcnMgPSB0aGlzLmV4dHJhSGVhZGVycztcbiAgICB9XG4gICAgaWYgKHRoaXMubG9jYWxBZGRyZXNzKSB7XG4gICAgICAgIG9wdHMubG9jYWxBZGRyZXNzID0gdGhpcy5sb2NhbEFkZHJlc3M7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgICAgdGhpcy53cyA9IG5ldyBXZWJTb2NrZXQodXJpKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLndzLmJpbmFyeVR5cGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aGlzLnN1cHBvcnRzQmluYXJ5ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMud3Muc3VwcG9ydHMgJiYgdGhpcy53cy5zdXBwb3J0cy5iaW5hcnkpIHtcbiAgICAgICAgdGhpcy5zdXBwb3J0c0JpbmFyeSA9IHRydWU7XG4gICAgICAgIHRoaXMud3MuYmluYXJ5VHlwZSA9ICdub2RlYnVmZmVyJztcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLndzLmJpbmFyeVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgIH1cblxuICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcnMoKTtcbn07XG5cbi8qKlxuICogQWRkcyBldmVudCBsaXN0ZW5lcnMgdG8gdGhlIHNvY2tldFxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbldTLnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVycyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLndzLm9ub3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5vbk9wZW4oKTtcbiAgICB9O1xuICAgIHRoaXMud3Mub25jbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5vbkNsb3NlKCk7XG4gICAgfTtcbiAgICB0aGlzLndzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChldikge1xuICAgICAgICBzZWxmLm9uRGF0YShldi5kYXRhKTtcbiAgICB9O1xuICAgIHRoaXMud3Mub25lcnJvciA9IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIHNlbGYub25FcnJvcignd2Vic29ja2V0IGVycm9yJywgZSk7XG4gICAgfTtcbn07XG5cbi8qKlxuICogV3JpdGVzIGRhdGEgdG8gc29ja2V0LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IG9mIHBhY2tldHMuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5XUy5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAocGFja2V0cykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLndyaXRhYmxlID0gZmFsc2U7XG5cbiAgICAvLyBlbmNvZGVQYWNrZXQgZWZmaWNpZW50IGFzIGl0IHVzZXMgV1MgZnJhbWluZ1xuICAgIC8vIG5vIG5lZWQgZm9yIGVuY29kZVBheWxvYWRcbiAgICB2YXIgdG90YWwgPSBwYWNrZXRzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IHRvdGFsOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIChmdW5jdGlvbiAocGFja2V0KSB7XG4gICAgICAgICAgICBwYXJzZXIuZW5jb2RlUGFja2V0KHBhY2tldCwgc2VsZi5zdXBwb3J0c0JpbmFyeSwgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLndzLnNlbmQoZGF0YSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBkZWJ1Zygnd2Vic29ja2V0IGNsb3NlZCBiZWZvcmUgb25jbG9zZSBldmVudCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAtLXRvdGFsIHx8IGRvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KShwYWNrZXRzW2ldKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkb25lKCkge1xuICAgICAgICBzZWxmLmVtaXQoJ2ZsdXNoJyk7XG5cbiAgICAgICAgLy8gZmFrZSBkcmFpblxuICAgICAgICAvLyBkZWZlciB0byBuZXh0IHRpY2sgdG8gYWxsb3cgU29ja2V0IHRvIGNsZWFyIHdyaXRlQnVmZmVyXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi53cml0YWJsZSA9IHRydWU7XG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2RyYWluJyk7XG4gICAgICAgIH0sIDApO1xuICAgIH1cbn07XG5cbi8qKlxuICogQ2FsbGVkIHVwb24gY2xvc2VcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5XUy5wcm90b3R5cGUub25DbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBUcmFuc3BvcnQucHJvdG90eXBlLm9uQ2xvc2UuY2FsbCh0aGlzKTtcbn07XG5cbi8qKlxuICogQ2xvc2VzIHNvY2tldC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5XUy5wcm90b3R5cGUuZG9DbG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMud3MgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHRoaXMud3MuY2xvc2UoKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyB1cmkgZm9yIGNvbm5lY3Rpb24uXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuV1MucHJvdG90eXBlLnVyaSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcXVlcnkgPSB0aGlzLnF1ZXJ5IHx8IHt9O1xuICAgIHZhciBzY2hlbWEgPSB0aGlzLnNlY3VyZSA/ICd3c3MnIDogJ3dzJztcbiAgICB2YXIgcG9ydCA9ICcnO1xuXG4gICAgLy8gYXZvaWQgcG9ydCBpZiBkZWZhdWx0IGZvciBzY2hlbWFcbiAgICBpZiAodGhpcy5wb3J0ICYmICgoJ3dzcycgPT09IHNjaGVtYSAmJiBOdW1iZXIodGhpcy5wb3J0KSAhPT0gNDQzKSB8fFxuICAgICAgICAoJ3dzJyA9PT0gc2NoZW1hICYmIE51bWJlcih0aGlzLnBvcnQpICE9PSA4MCkpKSB7XG4gICAgICAgIHBvcnQgPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuXG4gICAgLy8gYXBwZW5kIHRpbWVzdGFtcCB0byBVUklcbiAgICBpZiAodGhpcy50aW1lc3RhbXBSZXF1ZXN0cykge1xuICAgICAgICBxdWVyeVt0aGlzLnRpbWVzdGFtcFBhcmFtXSA9IHllYXN0KCk7XG4gICAgfVxuXG4gICAgLy8gY29tbXVuaWNhdGUgYmluYXJ5IHN1cHBvcnQgY2FwYWJpbGl0aWVzXG4gICAgaWYgKCF0aGlzLnN1cHBvcnRzQmluYXJ5KSB7XG4gICAgICAgIHF1ZXJ5LmI2NCA9IDE7XG4gICAgfVxuXG4gICAgcXVlcnkgPSBwYXJzZXFzLmVuY29kZShxdWVyeSk7XG5cbiAgICAvLyBwcmVwZW5kID8gdG8gcXVlcnlcbiAgICBpZiAocXVlcnkubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXJ5ID0gJz8nICsgcXVlcnk7XG4gICAgfVxuXG4gICAgdmFyIGlwdjYgPSB0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSAhPT0gLTE7XG4gICAgcmV0dXJuIHNjaGVtYSArICc6Ly8nICsgKGlwdjYgPyAnWycgKyB0aGlzLmhvc3RuYW1lICsgJ10nIDogdGhpcy5ob3N0bmFtZSkgKyBwb3J0ICsgdGhpcy5wYXRoICsgcXVlcnk7XG59O1xuXG4vKipcbiAqIEZlYXR1cmUgZGV0ZWN0aW9uIGZvciBXZWJTb2NrZXQuXG4gKlxuICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGlzIHRyYW5zcG9ydCBpcyBhdmFpbGFibGUuXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbldTLnByb3RvdHlwZS5jaGVjayA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gISFXZWJTb2NrZXQgJiYgISgnX19pbml0aWFsaXplJyBpbiBXZWJTb2NrZXQgJiYgdGhpcy5uYW1lID09PSBXUy5wcm90b3R5cGUubmFtZSk7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBhZnRlclxuXG5mdW5jdGlvbiBhZnRlcihjb3VudCwgY2FsbGJhY2ssIGVycl9jYikge1xuICAgIHZhciBiYWlsID0gZmFsc2VcbiAgICBlcnJfY2IgPSBlcnJfY2IgfHwgbm9vcFxuICAgIHByb3h5LmNvdW50ID0gY291bnRcblxuICAgIHJldHVybiAoY291bnQgPT09IDApID8gY2FsbGJhY2soKSA6IHByb3h5XG5cbiAgICBmdW5jdGlvbiBwcm94eShlcnIsIHJlc3VsdCkge1xuICAgICAgICBpZiAocHJveHkuY291bnQgPD0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdhZnRlciBjYWxsZWQgdG9vIG1hbnkgdGltZXMnKVxuICAgICAgICB9XG4gICAgICAgIC0tcHJveHkuY291bnRcblxuICAgICAgICAvLyBhZnRlciBmaXJzdCBlcnJvciwgcmVzdCBhcmUgcGFzc2VkIHRvIGVycl9jYlxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBiYWlsID0gdHJ1ZVxuICAgICAgICAgICAgY2FsbGJhY2soZXJyKVxuICAgICAgICAgICAgLy8gZnV0dXJlIGVycm9yIGNhbGxiYWNrcyB3aWxsIGdvIHRvIGVycm9yIGhhbmRsZXJcbiAgICAgICAgICAgIGNhbGxiYWNrID0gZXJyX2NiXG4gICAgICAgIH0gZWxzZSBpZiAocHJveHkuY291bnQgPT09IDAgJiYgIWJhaWwpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlc3VsdClcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG4iLCIvKipcbiAqIEFuIGFic3RyYWN0aW9uIGZvciBzbGljaW5nIGFuIGFycmF5YnVmZmVyIGV2ZW4gd2hlblxuICogQXJyYXlCdWZmZXIucHJvdG90eXBlLnNsaWNlIGlzIG5vdCBzdXBwb3J0ZWRcbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYXJyYXlidWZmZXIsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYXJyYXlidWZmZXIuYnl0ZUxlbmd0aDtcbiAgc3RhcnQgPSBzdGFydCB8fCAwO1xuICBlbmQgPSBlbmQgfHwgYnl0ZXM7XG5cbiAgaWYgKGFycmF5YnVmZmVyLnNsaWNlKSB7IHJldHVybiBhcnJheWJ1ZmZlci5zbGljZShzdGFydCwgZW5kKTsgfVxuXG4gIGlmIChzdGFydCA8IDApIHsgc3RhcnQgKz0gYnl0ZXM7IH1cbiAgaWYgKGVuZCA8IDApIHsgZW5kICs9IGJ5dGVzOyB9XG4gIGlmIChlbmQgPiBieXRlcykgeyBlbmQgPSBieXRlczsgfVxuXG4gIGlmIChzdGFydCA+PSBieXRlcyB8fCBzdGFydCA+PSBlbmQgfHwgYnl0ZXMgPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEFycmF5QnVmZmVyKDApO1xuICB9XG5cbiAgdmFyIGFidiA9IG5ldyBVaW50OEFycmF5KGFycmF5YnVmZmVyKTtcbiAgdmFyIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGVuZCAtIHN0YXJ0KTtcbiAgZm9yICh2YXIgaSA9IHN0YXJ0LCBpaSA9IDA7IGkgPCBlbmQ7IGkrKywgaWkrKykge1xuICAgIHJlc3VsdFtpaV0gPSBhYnZbaV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdC5idWZmZXI7XG59O1xuIiwiLypcbiAqIGJhc2U2NC1hcnJheWJ1ZmZlclxuICogaHR0cHM6Ly9naXRodWIuY29tL25pa2xhc3ZoL2Jhc2U2NC1hcnJheWJ1ZmZlclxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMiBOaWtsYXMgdm9uIEhlcnR6ZW5cbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuKGZ1bmN0aW9uKCl7XG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIHZhciBjaGFycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrL1wiO1xuXG4gIC8vIFVzZSBhIGxvb2t1cCB0YWJsZSB0byBmaW5kIHRoZSBpbmRleC5cbiAgdmFyIGxvb2t1cCA9IG5ldyBVaW50OEFycmF5KDI1Nik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhcnMubGVuZ3RoOyBpKyspIHtcbiAgICBsb29rdXBbY2hhcnMuY2hhckNvZGVBdChpKV0gPSBpO1xuICB9XG5cbiAgZXhwb3J0cy5lbmNvZGUgPSBmdW5jdGlvbihhcnJheWJ1ZmZlcikge1xuICAgIHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KGFycmF5YnVmZmVyKSxcbiAgICBpLCBsZW4gPSBieXRlcy5sZW5ndGgsIGJhc2U2NCA9IFwiXCI7XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKz0zKSB7XG4gICAgICBiYXNlNjQgKz0gY2hhcnNbYnl0ZXNbaV0gPj4gMl07XG4gICAgICBiYXNlNjQgKz0gY2hhcnNbKChieXRlc1tpXSAmIDMpIDw8IDQpIHwgKGJ5dGVzW2kgKyAxXSA+PiA0KV07XG4gICAgICBiYXNlNjQgKz0gY2hhcnNbKChieXRlc1tpICsgMV0gJiAxNSkgPDwgMikgfCAoYnl0ZXNbaSArIDJdID4+IDYpXTtcbiAgICAgIGJhc2U2NCArPSBjaGFyc1tieXRlc1tpICsgMl0gJiA2M107XG4gICAgfVxuXG4gICAgaWYgKChsZW4gJSAzKSA9PT0gMikge1xuICAgICAgYmFzZTY0ID0gYmFzZTY0LnN1YnN0cmluZygwLCBiYXNlNjQubGVuZ3RoIC0gMSkgKyBcIj1cIjtcbiAgICB9IGVsc2UgaWYgKGxlbiAlIDMgPT09IDEpIHtcbiAgICAgIGJhc2U2NCA9IGJhc2U2NC5zdWJzdHJpbmcoMCwgYmFzZTY0Lmxlbmd0aCAtIDIpICsgXCI9PVwiO1xuICAgIH1cblxuICAgIHJldHVybiBiYXNlNjQ7XG4gIH07XG5cbiAgZXhwb3J0cy5kZWNvZGUgPSAgZnVuY3Rpb24oYmFzZTY0KSB7XG4gICAgdmFyIGJ1ZmZlckxlbmd0aCA9IGJhc2U2NC5sZW5ndGggKiAwLjc1LFxuICAgIGxlbiA9IGJhc2U2NC5sZW5ndGgsIGksIHAgPSAwLFxuICAgIGVuY29kZWQxLCBlbmNvZGVkMiwgZW5jb2RlZDMsIGVuY29kZWQ0O1xuXG4gICAgaWYgKGJhc2U2NFtiYXNlNjQubGVuZ3RoIC0gMV0gPT09IFwiPVwiKSB7XG4gICAgICBidWZmZXJMZW5ndGgtLTtcbiAgICAgIGlmIChiYXNlNjRbYmFzZTY0Lmxlbmd0aCAtIDJdID09PSBcIj1cIikge1xuICAgICAgICBidWZmZXJMZW5ndGgtLTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgYXJyYXlidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoYnVmZmVyTGVuZ3RoKSxcbiAgICBieXRlcyA9IG5ldyBVaW50OEFycmF5KGFycmF5YnVmZmVyKTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrPTQpIHtcbiAgICAgIGVuY29kZWQxID0gbG9va3VwW2Jhc2U2NC5jaGFyQ29kZUF0KGkpXTtcbiAgICAgIGVuY29kZWQyID0gbG9va3VwW2Jhc2U2NC5jaGFyQ29kZUF0KGkrMSldO1xuICAgICAgZW5jb2RlZDMgPSBsb29rdXBbYmFzZTY0LmNoYXJDb2RlQXQoaSsyKV07XG4gICAgICBlbmNvZGVkNCA9IGxvb2t1cFtiYXNlNjQuY2hhckNvZGVBdChpKzMpXTtcblxuICAgICAgYnl0ZXNbcCsrXSA9IChlbmNvZGVkMSA8PCAyKSB8IChlbmNvZGVkMiA+PiA0KTtcbiAgICAgIGJ5dGVzW3ArK10gPSAoKGVuY29kZWQyICYgMTUpIDw8IDQpIHwgKGVuY29kZWQzID4+IDIpO1xuICAgICAgYnl0ZXNbcCsrXSA9ICgoZW5jb2RlZDMgJiAzKSA8PCA2KSB8IChlbmNvZGVkNCAmIDYzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXJyYXlidWZmZXI7XG4gIH07XG59KSgpO1xuIiwiLyoqXG4gKiBDcmVhdGUgYSBibG9iIGJ1aWxkZXIgZXZlbiB3aGVuIHZlbmRvciBwcmVmaXhlcyBleGlzdFxuICovXG5cbnZhciBCbG9iQnVpbGRlciA9IGdsb2JhbC5CbG9iQnVpbGRlclxuICB8fCBnbG9iYWwuV2ViS2l0QmxvYkJ1aWxkZXJcbiAgfHwgZ2xvYmFsLk1TQmxvYkJ1aWxkZXJcbiAgfHwgZ2xvYmFsLk1vekJsb2JCdWlsZGVyO1xuXG4vKipcbiAqIENoZWNrIGlmIEJsb2IgY29uc3RydWN0b3IgaXMgc3VwcG9ydGVkXG4gKi9cblxudmFyIGJsb2JTdXBwb3J0ZWQgPSAoZnVuY3Rpb24oKSB7XG4gIHRyeSB7XG4gICAgdmFyIGEgPSBuZXcgQmxvYihbJ2hpJ10pO1xuICAgIHJldHVybiBhLnNpemUgPT09IDI7XG4gIH0gY2F0Y2goZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufSkoKTtcblxuLyoqXG4gKiBDaGVjayBpZiBCbG9iIGNvbnN0cnVjdG9yIHN1cHBvcnRzIEFycmF5QnVmZmVyVmlld3NcbiAqIEZhaWxzIGluIFNhZmFyaSA2LCBzbyB3ZSBuZWVkIHRvIG1hcCB0byBBcnJheUJ1ZmZlcnMgdGhlcmUuXG4gKi9cblxudmFyIGJsb2JTdXBwb3J0c0FycmF5QnVmZmVyVmlldyA9IGJsb2JTdXBwb3J0ZWQgJiYgKGZ1bmN0aW9uKCkge1xuICB0cnkge1xuICAgIHZhciBiID0gbmV3IEJsb2IoW25ldyBVaW50OEFycmF5KFsxLDJdKV0pO1xuICAgIHJldHVybiBiLnNpemUgPT09IDI7XG4gIH0gY2F0Y2goZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufSkoKTtcblxuLyoqXG4gKiBDaGVjayBpZiBCbG9iQnVpbGRlciBpcyBzdXBwb3J0ZWRcbiAqL1xuXG52YXIgYmxvYkJ1aWxkZXJTdXBwb3J0ZWQgPSBCbG9iQnVpbGRlclxuICAmJiBCbG9iQnVpbGRlci5wcm90b3R5cGUuYXBwZW5kXG4gICYmIEJsb2JCdWlsZGVyLnByb3RvdHlwZS5nZXRCbG9iO1xuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbiB0aGF0IG1hcHMgQXJyYXlCdWZmZXJWaWV3cyB0byBBcnJheUJ1ZmZlcnNcbiAqIFVzZWQgYnkgQmxvYkJ1aWxkZXIgY29uc3RydWN0b3IgYW5kIG9sZCBicm93c2VycyB0aGF0IGRpZG4ndFxuICogc3VwcG9ydCBpdCBpbiB0aGUgQmxvYiBjb25zdHJ1Y3Rvci5cbiAqL1xuXG5mdW5jdGlvbiBtYXBBcnJheUJ1ZmZlclZpZXdzKGFyeSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyeS5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjaHVuayA9IGFyeVtpXTtcbiAgICBpZiAoY2h1bmsuYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICAgIHZhciBidWYgPSBjaHVuay5idWZmZXI7XG5cbiAgICAgIC8vIGlmIHRoaXMgaXMgYSBzdWJhcnJheSwgbWFrZSBhIGNvcHkgc28gd2Ugb25seVxuICAgICAgLy8gaW5jbHVkZSB0aGUgc3ViYXJyYXkgcmVnaW9uIGZyb20gdGhlIHVuZGVybHlpbmcgYnVmZmVyXG4gICAgICBpZiAoY2h1bmsuYnl0ZUxlbmd0aCAhPT0gYnVmLmJ5dGVMZW5ndGgpIHtcbiAgICAgICAgdmFyIGNvcHkgPSBuZXcgVWludDhBcnJheShjaHVuay5ieXRlTGVuZ3RoKTtcbiAgICAgICAgY29weS5zZXQobmV3IFVpbnQ4QXJyYXkoYnVmLCBjaHVuay5ieXRlT2Zmc2V0LCBjaHVuay5ieXRlTGVuZ3RoKSk7XG4gICAgICAgIGJ1ZiA9IGNvcHkuYnVmZmVyO1xuICAgICAgfVxuXG4gICAgICBhcnlbaV0gPSBidWY7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIEJsb2JCdWlsZGVyQ29uc3RydWN0b3IoYXJ5LCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHZhciBiYiA9IG5ldyBCbG9iQnVpbGRlcigpO1xuICBtYXBBcnJheUJ1ZmZlclZpZXdzKGFyeSk7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnkubGVuZ3RoOyBpKyspIHtcbiAgICBiYi5hcHBlbmQoYXJ5W2ldKTtcbiAgfVxuXG4gIHJldHVybiAob3B0aW9ucy50eXBlKSA/IGJiLmdldEJsb2Iob3B0aW9ucy50eXBlKSA6IGJiLmdldEJsb2IoKTtcbn07XG5cbmZ1bmN0aW9uIEJsb2JDb25zdHJ1Y3RvcihhcnksIG9wdGlvbnMpIHtcbiAgbWFwQXJyYXlCdWZmZXJWaWV3cyhhcnkpO1xuICByZXR1cm4gbmV3IEJsb2IoYXJ5LCBvcHRpb25zIHx8IHt9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICBpZiAoYmxvYlN1cHBvcnRlZCkge1xuICAgIHJldHVybiBibG9iU3VwcG9ydHNBcnJheUJ1ZmZlclZpZXcgPyBnbG9iYWwuQmxvYiA6IEJsb2JDb25zdHJ1Y3RvcjtcbiAgfSBlbHNlIGlmIChibG9iQnVpbGRlclN1cHBvcnRlZCkge1xuICAgIHJldHVybiBCbG9iQnVpbGRlckNvbnN0cnVjdG9yO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn0pKCk7XG4iLCJcbi8qKlxuICogRXhwb3NlIGBFbWl0dGVyYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVtaXR0ZXI7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRW1pdHRlcmAuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFbWl0dGVyKG9iaikge1xuICBpZiAob2JqKSByZXR1cm4gbWl4aW4ob2JqKTtcbn07XG5cbi8qKlxuICogTWl4aW4gdGhlIGVtaXR0ZXIgcHJvcGVydGllcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBtaXhpbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIEVtaXR0ZXIucHJvdG90eXBlKSB7XG4gICAgb2JqW2tleV0gPSBFbWl0dGVyLnByb3RvdHlwZVtrZXldO1xuICB9XG4gIHJldHVybiBvYmo7XG59XG5cbi8qKlxuICogTGlzdGVuIG9uIHRoZSBnaXZlbiBgZXZlbnRgIHdpdGggYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtFbWl0dGVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5vbiA9XG5FbWl0dGVyLnByb3RvdHlwZS5hZGRFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICAodGhpcy5fY2FsbGJhY2tzW2V2ZW50XSA9IHRoaXMuX2NhbGxiYWNrc1tldmVudF0gfHwgW10pXG4gICAgLnB1c2goZm4pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkcyBhbiBgZXZlbnRgIGxpc3RlbmVyIHRoYXQgd2lsbCBiZSBpbnZva2VkIGEgc2luZ2xlXG4gKiB0aW1lIHRoZW4gYXV0b21hdGljYWxseSByZW1vdmVkLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0VtaXR0ZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgZm4pe1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHRoaXMuX2NhbGxiYWNrcyA9IHRoaXMuX2NhbGxiYWNrcyB8fCB7fTtcblxuICBmdW5jdGlvbiBvbigpIHtcbiAgICBzZWxmLm9mZihldmVudCwgb24pO1xuICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICBvbi5mbiA9IGZuO1xuICB0aGlzLm9uKGV2ZW50LCBvbik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgdGhlIGdpdmVuIGNhbGxiYWNrIGZvciBgZXZlbnRgIG9yIGFsbFxuICogcmVnaXN0ZXJlZCBjYWxsYmFja3MuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUub2ZmID1cbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID1cbkVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9XG5FbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVFdmVudExpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQsIGZuKXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuXG4gIC8vIGFsbFxuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgdGhpcy5fY2FsbGJhY2tzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBzcGVjaWZpYyBldmVudFxuICB2YXIgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzW2V2ZW50XTtcbiAgaWYgKCFjYWxsYmFja3MpIHJldHVybiB0aGlzO1xuXG4gIC8vIHJlbW92ZSBhbGwgaGFuZGxlcnNcbiAgaWYgKDEgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIGRlbGV0ZSB0aGlzLl9jYWxsYmFja3NbZXZlbnRdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gcmVtb3ZlIHNwZWNpZmljIGhhbmRsZXJcbiAgdmFyIGNiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKykge1xuICAgIGNiID0gY2FsbGJhY2tzW2ldO1xuICAgIGlmIChjYiA9PT0gZm4gfHwgY2IuZm4gPT09IGZuKSB7XG4gICAgICBjYWxsYmFja3Muc3BsaWNlKGksIDEpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbWl0IGBldmVudGAgd2l0aCB0aGUgZ2l2ZW4gYXJncy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7TWl4ZWR9IC4uLlxuICogQHJldHVybiB7RW1pdHRlcn1cbiAqL1xuXG5FbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24oZXZlbnQpe1xuICB0aGlzLl9jYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MgfHwge307XG4gIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpXG4gICAgLCBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3NbZXZlbnRdO1xuXG4gIGlmIChjYWxsYmFja3MpIHtcbiAgICBjYWxsYmFja3MgPSBjYWxsYmFja3Muc2xpY2UoMCk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNhbGxiYWNrcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgICAgY2FsbGJhY2tzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYXJyYXkgb2YgY2FsbGJhY2tzIGZvciBgZXZlbnRgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHJldHVybiB7QXJyYXl9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgdGhpcy5fY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzIHx8IHt9O1xuICByZXR1cm4gdGhpcy5fY2FsbGJhY2tzW2V2ZW50XSB8fCBbXTtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhpcyBlbWl0dGVyIGhhcyBgZXZlbnRgIGhhbmRsZXJzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRW1pdHRlci5wcm90b3R5cGUuaGFzTGlzdGVuZXJzID0gZnVuY3Rpb24oZXZlbnQpe1xuICByZXR1cm4gISEgdGhpcy5saXN0ZW5lcnMoZXZlbnQpLmxlbmd0aDtcbn07XG4iLCJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYSwgYil7XG4gIHZhciBmbiA9IGZ1bmN0aW9uKCl7fTtcbiAgZm4ucHJvdG90eXBlID0gYi5wcm90b3R5cGU7XG4gIGEucHJvdG90eXBlID0gbmV3IGZuO1xuICBhLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGE7XG59OyIsIi8qKlxuICogVGhpcyBpcyB0aGUgd2ViIGJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2RlYnVnJyk7XG5leHBvcnRzLmxvZyA9IGxvZztcbmV4cG9ydHMuZm9ybWF0QXJncyA9IGZvcm1hdEFyZ3M7XG5leHBvcnRzLnNhdmUgPSBzYXZlO1xuZXhwb3J0cy5sb2FkID0gbG9hZDtcbmV4cG9ydHMudXNlQ29sb3JzID0gdXNlQ29sb3JzO1xuZXhwb3J0cy5zdG9yYWdlID0gJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIGNocm9tZVxuICAgICAgICAgICAgICAgJiYgJ3VuZGVmaW5lZCcgIT0gdHlwZW9mIGNocm9tZS5zdG9yYWdlXG4gICAgICAgICAgICAgICAgICA/IGNocm9tZS5zdG9yYWdlLmxvY2FsXG4gICAgICAgICAgICAgICAgICA6IGxvY2Fsc3RvcmFnZSgpO1xuXG4vKipcbiAqIENvbG9ycy5cbiAqL1xuXG5leHBvcnRzLmNvbG9ycyA9IFtcbiAgJ2xpZ2h0c2VhZ3JlZW4nLFxuICAnZm9yZXN0Z3JlZW4nLFxuICAnZ29sZGVucm9kJyxcbiAgJ2RvZGdlcmJsdWUnLFxuICAnZGFya29yY2hpZCcsXG4gICdjcmltc29uJ1xuXTtcblxuLyoqXG4gKiBDdXJyZW50bHkgb25seSBXZWJLaXQtYmFzZWQgV2ViIEluc3BlY3RvcnMsIEZpcmVmb3ggPj0gdjMxLFxuICogYW5kIHRoZSBGaXJlYnVnIGV4dGVuc2lvbiAoYW55IEZpcmVmb3ggdmVyc2lvbikgYXJlIGtub3duXG4gKiB0byBzdXBwb3J0IFwiJWNcIiBDU1MgY3VzdG9taXphdGlvbnMuXG4gKlxuICogVE9ETzogYWRkIGEgYGxvY2FsU3RvcmFnZWAgdmFyaWFibGUgdG8gZXhwbGljaXRseSBlbmFibGUvZGlzYWJsZSBjb2xvcnNcbiAqL1xuXG5mdW5jdGlvbiB1c2VDb2xvcnMoKSB7XG4gIC8vIE5COiBJbiBhbiBFbGVjdHJvbiBwcmVsb2FkIHNjcmlwdCwgZG9jdW1lbnQgd2lsbCBiZSBkZWZpbmVkIGJ1dCBub3QgZnVsbHlcbiAgLy8gaW5pdGlhbGl6ZWQuIFNpbmNlIHdlIGtub3cgd2UncmUgaW4gQ2hyb21lLCB3ZSdsbCBqdXN0IGRldGVjdCB0aGlzIGNhc2VcbiAgLy8gZXhwbGljaXRseVxuICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93LnByb2Nlc3MgJiYgd2luZG93LnByb2Nlc3MudHlwZSA9PT0gJ3JlbmRlcmVyJykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgLy8gZG9jdW1lbnQgaXMgdW5kZWZpbmVkIGluIHJlYWN0LW5hdGl2ZTogaHR0cHM6Ly9naXRodWIuY29tL2ZhY2Vib29rL3JlYWN0LW5hdGl2ZS9wdWxsLzE2MzJcbiAgcmV0dXJuICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCAmJiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUgJiYgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLldlYmtpdEFwcGVhcmFuY2UpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cuY29uc29sZSAmJiAod2luZG93LmNvbnNvbGUuZmlyZWJ1ZyB8fCAod2luZG93LmNvbnNvbGUuZXhjZXB0aW9uICYmIHdpbmRvdy5jb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmIG5hdmlnYXRvci51c2VyQWdlbnQgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLm1hdGNoKC9maXJlZm94XFwvKFxcZCspLykgJiYgcGFyc2VJbnQoUmVnRXhwLiQxLCAxMCkgPj0gMzEpIHx8XG4gICAgLy8gZG91YmxlIGNoZWNrIHdlYmtpdCBpbiB1c2VyQWdlbnQganVzdCBpbiBjYXNlIHdlIGFyZSBpbiBhIHdvcmtlclxuICAgICh0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiBuYXZpZ2F0b3IudXNlckFnZW50ICYmIG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvYXBwbGV3ZWJraXRcXC8oXFxkKykvKSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuICdbVW5leHBlY3RlZEpTT05QYXJzZUVycm9yXTogJyArIGVyci5tZXNzYWdlO1xuICB9XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncyhhcmdzKSB7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybjtcblxuICB2YXIgYyA9ICdjb2xvcjogJyArIHRoaXMuY29sb3I7XG4gIGFyZ3Muc3BsaWNlKDEsIDAsIGMsICdjb2xvcjogaW5oZXJpdCcpXG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EtekEtWiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG59XG5cbi8qKlxuICogSW52b2tlcyBgY29uc29sZS5sb2coKWAgd2hlbiBhdmFpbGFibGUuXG4gKiBOby1vcCB3aGVuIGBjb25zb2xlLmxvZ2AgaXMgbm90IGEgXCJmdW5jdGlvblwiLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gbG9nKCkge1xuICAvLyB0aGlzIGhhY2tlcnkgaXMgcmVxdWlyZWQgZm9yIElFOC85LCB3aGVyZVxuICAvLyB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT09IHR5cGVvZiBjb25zb2xlXG4gICAgJiYgY29uc29sZS5sb2dcbiAgICAmJiBGdW5jdGlvbi5wcm90b3R5cGUuYXBwbHkuY2FsbChjb25zb2xlLmxvZywgY29uc29sZSwgYXJndW1lbnRzKTtcbn1cblxuLyoqXG4gKiBTYXZlIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2F2ZShuYW1lc3BhY2VzKSB7XG4gIHRyeSB7XG4gICAgaWYgKG51bGwgPT0gbmFtZXNwYWNlcykge1xuICAgICAgZXhwb3J0cy5zdG9yYWdlLnJlbW92ZUl0ZW0oJ2RlYnVnJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMuc3RvcmFnZS5kZWJ1ZyA9IG5hbWVzcGFjZXM7XG4gICAgfVxuICB9IGNhdGNoKGUpIHt9XG59XG5cbi8qKlxuICogTG9hZCBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSByZXR1cm5zIHRoZSBwcmV2aW91c2x5IHBlcnNpc3RlZCBkZWJ1ZyBtb2Rlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9hZCgpIHtcbiAgdmFyIHI7XG4gIHRyeSB7XG4gICAgciA9IGV4cG9ydHMuc3RvcmFnZS5kZWJ1ZztcbiAgfSBjYXRjaChlKSB7fVxuXG4gIC8vIElmIGRlYnVnIGlzbid0IHNldCBpbiBMUywgYW5kIHdlJ3JlIGluIEVsZWN0cm9uLCB0cnkgdG8gbG9hZCAkREVCVUdcbiAgaWYgKCFyICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiAnZW52JyBpbiBwcm9jZXNzKSB7XG4gICAgciA9IHByb2Nlc3MuZW52LkRFQlVHO1xuICB9XG5cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuXG4vKipcbiAqIExvY2Fsc3RvcmFnZSBhdHRlbXB0cyB0byByZXR1cm4gdGhlIGxvY2Fsc3RvcmFnZS5cbiAqXG4gKiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIHNhZmFyaSB0aHJvd3NcbiAqIHdoZW4gYSB1c2VyIGRpc2FibGVzIGNvb2tpZXMvbG9jYWxzdG9yYWdlXG4gKiBhbmQgeW91IGF0dGVtcHQgdG8gYWNjZXNzIGl0LlxuICpcbiAqIEByZXR1cm4ge0xvY2FsU3RvcmFnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvY2Fsc3RvcmFnZSgpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbiAgfSBjYXRjaCAoZSkge31cbn1cbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVEZWJ1Zy5kZWJ1ZyA9IGNyZWF0ZURlYnVnWydkZWZhdWx0J10gPSBjcmVhdGVEZWJ1ZztcbmV4cG9ydHMuY29lcmNlID0gY29lcmNlO1xuZXhwb3J0cy5kaXNhYmxlID0gZGlzYWJsZTtcbmV4cG9ydHMuZW5hYmxlID0gZW5hYmxlO1xuZXhwb3J0cy5lbmFibGVkID0gZW5hYmxlZDtcbmV4cG9ydHMuaHVtYW5pemUgPSByZXF1aXJlKCdtcycpO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXIgb3IgdXBwZXItY2FzZSBsZXR0ZXIsIGkuZS4gXCJuXCIgYW5kIFwiTlwiLlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycyA9IHt9O1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZVxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2VsZWN0Q29sb3IobmFtZXNwYWNlKSB7XG4gIHZhciBoYXNoID0gMCwgaTtcblxuICBmb3IgKGkgaW4gbmFtZXNwYWNlKSB7XG4gICAgaGFzaCAgPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIG5hbWVzcGFjZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDsgLy8gQ29udmVydCB0byAzMmJpdCBpbnRlZ2VyXG4gIH1cblxuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbTWF0aC5hYnMoaGFzaCkgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBjcmVhdGVEZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICBmdW5jdGlvbiBkZWJ1ZygpIHtcbiAgICAvLyBkaXNhYmxlZD9cbiAgICBpZiAoIWRlYnVnLmVuYWJsZWQpIHJldHVybjtcblxuICAgIHZhciBzZWxmID0gZGVidWc7XG5cbiAgICAvLyBzZXQgYGRpZmZgIHRpbWVzdGFtcFxuICAgIHZhciBjdXJyID0gK25ldyBEYXRlKCk7XG4gICAgdmFyIG1zID0gY3VyciAtIChwcmV2VGltZSB8fCBjdXJyKTtcbiAgICBzZWxmLmRpZmYgPSBtcztcbiAgICBzZWxmLnByZXYgPSBwcmV2VGltZTtcbiAgICBzZWxmLmN1cnIgPSBjdXJyO1xuICAgIHByZXZUaW1lID0gY3VycjtcblxuICAgIC8vIHR1cm4gdGhlIGBhcmd1bWVudHNgIGludG8gYSBwcm9wZXIgQXJyYXlcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIGFyZ3NbaV0gPSBhcmd1bWVudHNbaV07XG4gICAgfVxuXG4gICAgYXJnc1swXSA9IGV4cG9ydHMuY29lcmNlKGFyZ3NbMF0pO1xuXG4gICAgaWYgKCdzdHJpbmcnICE9PSB0eXBlb2YgYXJnc1swXSkge1xuICAgICAgLy8gYW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJU9cbiAgICAgIGFyZ3MudW5zaGlmdCgnJU8nKTtcbiAgICB9XG5cbiAgICAvLyBhcHBseSBhbnkgYGZvcm1hdHRlcnNgIHRyYW5zZm9ybWF0aW9uc1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgYXJnc1swXSA9IGFyZ3NbMF0ucmVwbGFjZSgvJShbYS16QS1aJV0pL2csIGZ1bmN0aW9uKG1hdGNoLCBmb3JtYXQpIHtcbiAgICAgIC8vIGlmIHdlIGVuY291bnRlciBhbiBlc2NhcGVkICUgdGhlbiBkb24ndCBpbmNyZWFzZSB0aGUgYXJyYXkgaW5kZXhcbiAgICAgIGlmIChtYXRjaCA9PT0gJyUlJykgcmV0dXJuIG1hdGNoO1xuICAgICAgaW5kZXgrKztcbiAgICAgIHZhciBmb3JtYXR0ZXIgPSBleHBvcnRzLmZvcm1hdHRlcnNbZm9ybWF0XTtcbiAgICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZm9ybWF0dGVyKSB7XG4gICAgICAgIHZhciB2YWwgPSBhcmdzW2luZGV4XTtcbiAgICAgICAgbWF0Y2ggPSBmb3JtYXR0ZXIuY2FsbChzZWxmLCB2YWwpO1xuXG4gICAgICAgIC8vIG5vdyB3ZSBuZWVkIHRvIHJlbW92ZSBgYXJnc1tpbmRleF1gIHNpbmNlIGl0J3MgaW5saW5lZCBpbiB0aGUgYGZvcm1hdGBcbiAgICAgICAgYXJncy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICBpbmRleC0tO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuXG4gICAgLy8gYXBwbHkgZW52LXNwZWNpZmljIGZvcm1hdHRpbmcgKGNvbG9ycywgZXRjLilcbiAgICBleHBvcnRzLmZvcm1hdEFyZ3MuY2FsbChzZWxmLCBhcmdzKTtcblxuICAgIHZhciBsb2dGbiA9IGRlYnVnLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG5cbiAgZGVidWcubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuICBkZWJ1Zy5lbmFibGVkID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSk7XG4gIGRlYnVnLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gIGRlYnVnLmNvbG9yID0gc2VsZWN0Q29sb3IobmFtZXNwYWNlKTtcblxuICAvLyBlbnYtc3BlY2lmaWMgaW5pdGlhbGl6YXRpb24gbG9naWMgZm9yIGRlYnVnIGluc3RhbmNlc1xuICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGV4cG9ydHMuaW5pdCkge1xuICAgIGV4cG9ydHMuaW5pdChkZWJ1Zyk7XG4gIH1cblxuICByZXR1cm4gZGVidWc7XG59XG5cbi8qKlxuICogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuICogc2VwYXJhdGVkIGJ5IGEgY29sb24gYW5kIHdpbGRjYXJkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuICBleHBvcnRzLnNhdmUobmFtZXNwYWNlcyk7XG5cbiAgZXhwb3J0cy5uYW1lcyA9IFtdO1xuICBleHBvcnRzLnNraXBzID0gW107XG5cbiAgdmFyIHNwbGl0ID0gKHR5cGVvZiBuYW1lc3BhY2VzID09PSAnc3RyaW5nJyA/IG5hbWVzcGFjZXMgOiAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIGtleXMgPSByZXF1aXJlKCcuL2tleXMnKTtcbnZhciBoYXNCaW5hcnkgPSByZXF1aXJlKCdoYXMtYmluYXJ5Jyk7XG52YXIgc2xpY2VCdWZmZXIgPSByZXF1aXJlKCdhcnJheWJ1ZmZlci5zbGljZScpO1xudmFyIGFmdGVyID0gcmVxdWlyZSgnYWZ0ZXInKTtcbnZhciB1dGY4ID0gcmVxdWlyZSgnd3RmLTgnKTtcblxudmFyIGJhc2U2NGVuY29kZXI7XG5pZiAoZ2xvYmFsICYmIGdsb2JhbC5BcnJheUJ1ZmZlcikge1xuICBiYXNlNjRlbmNvZGVyID0gcmVxdWlyZSgnYmFzZTY0LWFycmF5YnVmZmVyJyk7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgd2UgYXJlIHJ1bm5pbmcgYW4gYW5kcm9pZCBicm93c2VyLiBUaGF0IHJlcXVpcmVzIHVzIHRvIHVzZVxuICogQXJyYXlCdWZmZXIgd2l0aCBwb2xsaW5nIHRyYW5zcG9ydHMuLi5cbiAqXG4gKiBodHRwOi8vZ2hpbmRhLm5ldC9qcGVnLWJsb2ItYWpheC1hbmRyb2lkL1xuICovXG5cbnZhciBpc0FuZHJvaWQgPSB0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJyAmJiAvQW5kcm9pZC9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cbi8qKlxuICogQ2hlY2sgaWYgd2UgYXJlIHJ1bm5pbmcgaW4gUGhhbnRvbUpTLlxuICogVXBsb2FkaW5nIGEgQmxvYiB3aXRoIFBoYW50b21KUyBkb2VzIG5vdCB3b3JrIGNvcnJlY3RseSwgYXMgcmVwb3J0ZWQgaGVyZTpcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9hcml5YS9waGFudG9tanMvaXNzdWVzLzExMzk1XG4gKiBAdHlwZSBib29sZWFuXG4gKi9cbnZhciBpc1BoYW50b21KUyA9IHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnICYmIC9QaGFudG9tSlMvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpO1xuXG4vKipcbiAqIFdoZW4gdHJ1ZSwgYXZvaWRzIHVzaW5nIEJsb2JzIHRvIGVuY29kZSBwYXlsb2Fkcy5cbiAqIEB0eXBlIGJvb2xlYW5cbiAqL1xudmFyIGRvbnRTZW5kQmxvYnMgPSBpc0FuZHJvaWQgfHwgaXNQaGFudG9tSlM7XG5cbi8qKlxuICogQ3VycmVudCBwcm90b2NvbCB2ZXJzaW9uLlxuICovXG5cbmV4cG9ydHMucHJvdG9jb2wgPSAzO1xuXG4vKipcbiAqIFBhY2tldCB0eXBlcy5cbiAqL1xuXG52YXIgcGFja2V0cyA9IGV4cG9ydHMucGFja2V0cyA9IHtcbiAgICBvcGVuOiAgICAgMCAgICAvLyBub24td3NcbiAgLCBjbG9zZTogICAgMSAgICAvLyBub24td3NcbiAgLCBwaW5nOiAgICAgMlxuICAsIHBvbmc6ICAgICAzXG4gICwgbWVzc2FnZTogIDRcbiAgLCB1cGdyYWRlOiAgNVxuICAsIG5vb3A6ICAgICA2XG59O1xuXG52YXIgcGFja2V0c2xpc3QgPSBrZXlzKHBhY2tldHMpO1xuXG4vKipcbiAqIFByZW1hZGUgZXJyb3IgcGFja2V0LlxuICovXG5cbnZhciBlcnIgPSB7IHR5cGU6ICdlcnJvcicsIGRhdGE6ICdwYXJzZXIgZXJyb3InIH07XG5cbi8qKlxuICogQ3JlYXRlIGEgYmxvYiBhcGkgZXZlbiBmb3IgYmxvYiBidWlsZGVyIHdoZW4gdmVuZG9yIHByZWZpeGVzIGV4aXN0XG4gKi9cblxudmFyIEJsb2IgPSByZXF1aXJlKCdibG9iJyk7XG5cbi8qKlxuICogRW5jb2RlcyBhIHBhY2tldC5cbiAqXG4gKiAgICAgPHBhY2tldCB0eXBlIGlkPiBbIDxkYXRhPiBdXG4gKlxuICogRXhhbXBsZTpcbiAqXG4gKiAgICAgNWhlbGxvIHdvcmxkXG4gKiAgICAgM1xuICogICAgIDRcbiAqXG4gKiBCaW5hcnkgaXMgZW5jb2RlZCBpbiBhbiBpZGVudGljYWwgcHJpbmNpcGxlXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lbmNvZGVQYWNrZXQgPSBmdW5jdGlvbiAocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgdXRmOGVuY29kZSwgY2FsbGJhY2spIHtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIHN1cHBvcnRzQmluYXJ5KSB7XG4gICAgY2FsbGJhY2sgPSBzdXBwb3J0c0JpbmFyeTtcbiAgICBzdXBwb3J0c0JpbmFyeSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIHV0ZjhlbmNvZGUpIHtcbiAgICBjYWxsYmFjayA9IHV0ZjhlbmNvZGU7XG4gICAgdXRmOGVuY29kZSA9IG51bGw7XG4gIH1cblxuICB2YXIgZGF0YSA9IChwYWNrZXQuZGF0YSA9PT0gdW5kZWZpbmVkKVxuICAgID8gdW5kZWZpbmVkXG4gICAgOiBwYWNrZXQuZGF0YS5idWZmZXIgfHwgcGFja2V0LmRhdGE7XG5cbiAgaWYgKGdsb2JhbC5BcnJheUJ1ZmZlciAmJiBkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4gZW5jb2RlQXJyYXlCdWZmZXIocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgY2FsbGJhY2spO1xuICB9IGVsc2UgaWYgKEJsb2IgJiYgZGF0YSBpbnN0YW5jZW9mIGdsb2JhbC5CbG9iKSB7XG4gICAgcmV0dXJuIGVuY29kZUJsb2IocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgY2FsbGJhY2spO1xuICB9XG5cbiAgLy8gbWlnaHQgYmUgYW4gb2JqZWN0IHdpdGggeyBiYXNlNjQ6IHRydWUsIGRhdGE6IGRhdGFBc0Jhc2U2NFN0cmluZyB9XG4gIGlmIChkYXRhICYmIGRhdGEuYmFzZTY0KSB7XG4gICAgcmV0dXJuIGVuY29kZUJhc2U2NE9iamVjdChwYWNrZXQsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIC8vIFNlbmRpbmcgZGF0YSBhcyBhIHV0Zi04IHN0cmluZ1xuICB2YXIgZW5jb2RlZCA9IHBhY2tldHNbcGFja2V0LnR5cGVdO1xuXG4gIC8vIGRhdGEgZnJhZ21lbnQgaXMgb3B0aW9uYWxcbiAgaWYgKHVuZGVmaW5lZCAhPT0gcGFja2V0LmRhdGEpIHtcbiAgICBlbmNvZGVkICs9IHV0ZjhlbmNvZGUgPyB1dGY4LmVuY29kZShTdHJpbmcocGFja2V0LmRhdGEpKSA6IFN0cmluZyhwYWNrZXQuZGF0YSk7XG4gIH1cblxuICByZXR1cm4gY2FsbGJhY2soJycgKyBlbmNvZGVkKTtcblxufTtcblxuZnVuY3Rpb24gZW5jb2RlQmFzZTY0T2JqZWN0KHBhY2tldCwgY2FsbGJhY2spIHtcbiAgLy8gcGFja2V0IGRhdGEgaXMgYW4gb2JqZWN0IHsgYmFzZTY0OiB0cnVlLCBkYXRhOiBkYXRhQXNCYXNlNjRTdHJpbmcgfVxuICB2YXIgbWVzc2FnZSA9ICdiJyArIGV4cG9ydHMucGFja2V0c1twYWNrZXQudHlwZV0gKyBwYWNrZXQuZGF0YS5kYXRhO1xuICByZXR1cm4gY2FsbGJhY2sobWVzc2FnZSk7XG59XG5cbi8qKlxuICogRW5jb2RlIHBhY2tldCBoZWxwZXJzIGZvciBiaW5hcnkgdHlwZXNcbiAqL1xuXG5mdW5jdGlvbiBlbmNvZGVBcnJheUJ1ZmZlcihwYWNrZXQsIHN1cHBvcnRzQmluYXJ5LCBjYWxsYmFjaykge1xuICBpZiAoIXN1cHBvcnRzQmluYXJ5KSB7XG4gICAgcmV0dXJuIGV4cG9ydHMuZW5jb2RlQmFzZTY0UGFja2V0KHBhY2tldCwgY2FsbGJhY2spO1xuICB9XG5cbiAgdmFyIGRhdGEgPSBwYWNrZXQuZGF0YTtcbiAgdmFyIGNvbnRlbnRBcnJheSA9IG5ldyBVaW50OEFycmF5KGRhdGEpO1xuICB2YXIgcmVzdWx0QnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoMSArIGRhdGEuYnl0ZUxlbmd0aCk7XG5cbiAgcmVzdWx0QnVmZmVyWzBdID0gcGFja2V0c1twYWNrZXQudHlwZV07XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY29udGVudEFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzdWx0QnVmZmVyW2krMV0gPSBjb250ZW50QXJyYXlbaV07XG4gIH1cblxuICByZXR1cm4gY2FsbGJhY2socmVzdWx0QnVmZmVyLmJ1ZmZlcik7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJsb2JBc0FycmF5QnVmZmVyKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKSB7XG4gIGlmICghc3VwcG9ydHNCaW5hcnkpIHtcbiAgICByZXR1cm4gZXhwb3J0cy5lbmNvZGVCYXNlNjRQYWNrZXQocGFja2V0LCBjYWxsYmFjayk7XG4gIH1cblxuICB2YXIgZnIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICBmci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICBwYWNrZXQuZGF0YSA9IGZyLnJlc3VsdDtcbiAgICBleHBvcnRzLmVuY29kZVBhY2tldChwYWNrZXQsIHN1cHBvcnRzQmluYXJ5LCB0cnVlLCBjYWxsYmFjayk7XG4gIH07XG4gIHJldHVybiBmci5yZWFkQXNBcnJheUJ1ZmZlcihwYWNrZXQuZGF0YSk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJsb2IocGFja2V0LCBzdXBwb3J0c0JpbmFyeSwgY2FsbGJhY2spIHtcbiAgaWYgKCFzdXBwb3J0c0JpbmFyeSkge1xuICAgIHJldHVybiBleHBvcnRzLmVuY29kZUJhc2U2NFBhY2tldChwYWNrZXQsIGNhbGxiYWNrKTtcbiAgfVxuXG4gIGlmIChkb250U2VuZEJsb2JzKSB7XG4gICAgcmV0dXJuIGVuY29kZUJsb2JBc0FycmF5QnVmZmVyKHBhY2tldCwgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKTtcbiAgfVxuXG4gIHZhciBsZW5ndGggPSBuZXcgVWludDhBcnJheSgxKTtcbiAgbGVuZ3RoWzBdID0gcGFja2V0c1twYWNrZXQudHlwZV07XG4gIHZhciBibG9iID0gbmV3IEJsb2IoW2xlbmd0aC5idWZmZXIsIHBhY2tldC5kYXRhXSk7XG5cbiAgcmV0dXJuIGNhbGxiYWNrKGJsb2IpO1xufVxuXG4vKipcbiAqIEVuY29kZXMgYSBwYWNrZXQgd2l0aCBiaW5hcnkgZGF0YSBpbiBhIGJhc2U2NCBzdHJpbmdcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcGFja2V0LCBoYXMgYHR5cGVgIGFuZCBgZGF0YWBcbiAqIEByZXR1cm4ge1N0cmluZ30gYmFzZTY0IGVuY29kZWQgbWVzc2FnZVxuICovXG5cbmV4cG9ydHMuZW5jb2RlQmFzZTY0UGFja2V0ID0gZnVuY3Rpb24ocGFja2V0LCBjYWxsYmFjaykge1xuICB2YXIgbWVzc2FnZSA9ICdiJyArIGV4cG9ydHMucGFja2V0c1twYWNrZXQudHlwZV07XG4gIGlmIChCbG9iICYmIHBhY2tldC5kYXRhIGluc3RhbmNlb2YgZ2xvYmFsLkJsb2IpIHtcbiAgICB2YXIgZnIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgIGZyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGI2NCA9IGZyLnJlc3VsdC5zcGxpdCgnLCcpWzFdO1xuICAgICAgY2FsbGJhY2sobWVzc2FnZSArIGI2NCk7XG4gICAgfTtcbiAgICByZXR1cm4gZnIucmVhZEFzRGF0YVVSTChwYWNrZXQuZGF0YSk7XG4gIH1cblxuICB2YXIgYjY0ZGF0YTtcbiAgdHJ5IHtcbiAgICBiNjRkYXRhID0gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheShwYWNrZXQuZGF0YSkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgLy8gaVBob25lIFNhZmFyaSBkb2Vzbid0IGxldCB5b3UgYXBwbHkgd2l0aCB0eXBlZCBhcnJheXNcbiAgICB2YXIgdHlwZWQgPSBuZXcgVWludDhBcnJheShwYWNrZXQuZGF0YSk7XG4gICAgdmFyIGJhc2ljID0gbmV3IEFycmF5KHR5cGVkLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0eXBlZC5sZW5ndGg7IGkrKykge1xuICAgICAgYmFzaWNbaV0gPSB0eXBlZFtpXTtcbiAgICB9XG4gICAgYjY0ZGF0YSA9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgYmFzaWMpO1xuICB9XG4gIG1lc3NhZ2UgKz0gZ2xvYmFsLmJ0b2EoYjY0ZGF0YSk7XG4gIHJldHVybiBjYWxsYmFjayhtZXNzYWdlKTtcbn07XG5cbi8qKlxuICogRGVjb2RlcyBhIHBhY2tldC4gQ2hhbmdlcyBmb3JtYXQgdG8gQmxvYiBpZiByZXF1ZXN0ZWQuXG4gKlxuICogQHJldHVybiB7T2JqZWN0fSB3aXRoIGB0eXBlYCBhbmQgYGRhdGFgIChpZiBhbnkpXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmRlY29kZVBhY2tldCA9IGZ1bmN0aW9uIChkYXRhLCBiaW5hcnlUeXBlLCB1dGY4ZGVjb2RlKSB7XG4gIGlmIChkYXRhID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZXJyO1xuICB9XG4gIC8vIFN0cmluZyBkYXRhXG4gIGlmICh0eXBlb2YgZGF0YSA9PSAnc3RyaW5nJykge1xuICAgIGlmIChkYXRhLmNoYXJBdCgwKSA9PSAnYicpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlY29kZUJhc2U2NFBhY2tldChkYXRhLnN1YnN0cigxKSwgYmluYXJ5VHlwZSk7XG4gICAgfVxuXG4gICAgaWYgKHV0ZjhkZWNvZGUpIHtcbiAgICAgIGRhdGEgPSB0cnlEZWNvZGUoZGF0YSk7XG4gICAgICBpZiAoZGF0YSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGVycjtcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIHR5cGUgPSBkYXRhLmNoYXJBdCgwKTtcblxuICAgIGlmIChOdW1iZXIodHlwZSkgIT0gdHlwZSB8fCAhcGFja2V0c2xpc3RbdHlwZV0pIHtcbiAgICAgIHJldHVybiBlcnI7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEubGVuZ3RoID4gMSkge1xuICAgICAgcmV0dXJuIHsgdHlwZTogcGFja2V0c2xpc3RbdHlwZV0sIGRhdGE6IGRhdGEuc3Vic3RyaW5nKDEpIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7IHR5cGU6IHBhY2tldHNsaXN0W3R5cGVdIH07XG4gICAgfVxuICB9XG5cbiAgdmFyIGFzQXJyYXkgPSBuZXcgVWludDhBcnJheShkYXRhKTtcbiAgdmFyIHR5cGUgPSBhc0FycmF5WzBdO1xuICB2YXIgcmVzdCA9IHNsaWNlQnVmZmVyKGRhdGEsIDEpO1xuICBpZiAoQmxvYiAmJiBiaW5hcnlUeXBlID09PSAnYmxvYicpIHtcbiAgICByZXN0ID0gbmV3IEJsb2IoW3Jlc3RdKTtcbiAgfVxuICByZXR1cm4geyB0eXBlOiBwYWNrZXRzbGlzdFt0eXBlXSwgZGF0YTogcmVzdCB9O1xufTtcblxuZnVuY3Rpb24gdHJ5RGVjb2RlKGRhdGEpIHtcbiAgdHJ5IHtcbiAgICBkYXRhID0gdXRmOC5kZWNvZGUoZGF0YSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIGRhdGE7XG59XG5cbi8qKlxuICogRGVjb2RlcyBhIHBhY2tldCBlbmNvZGVkIGluIGEgYmFzZTY0IHN0cmluZ1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBiYXNlNjQgZW5jb2RlZCBtZXNzYWdlXG4gKiBAcmV0dXJuIHtPYmplY3R9IHdpdGggYHR5cGVgIGFuZCBgZGF0YWAgKGlmIGFueSlcbiAqL1xuXG5leHBvcnRzLmRlY29kZUJhc2U2NFBhY2tldCA9IGZ1bmN0aW9uKG1zZywgYmluYXJ5VHlwZSkge1xuICB2YXIgdHlwZSA9IHBhY2tldHNsaXN0W21zZy5jaGFyQXQoMCldO1xuICBpZiAoIWJhc2U2NGVuY29kZXIpIHtcbiAgICByZXR1cm4geyB0eXBlOiB0eXBlLCBkYXRhOiB7IGJhc2U2NDogdHJ1ZSwgZGF0YTogbXNnLnN1YnN0cigxKSB9IH07XG4gIH1cblxuICB2YXIgZGF0YSA9IGJhc2U2NGVuY29kZXIuZGVjb2RlKG1zZy5zdWJzdHIoMSkpO1xuXG4gIGlmIChiaW5hcnlUeXBlID09PSAnYmxvYicgJiYgQmxvYikge1xuICAgIGRhdGEgPSBuZXcgQmxvYihbZGF0YV0pO1xuICB9XG5cbiAgcmV0dXJuIHsgdHlwZTogdHlwZSwgZGF0YTogZGF0YSB9O1xufTtcblxuLyoqXG4gKiBFbmNvZGVzIG11bHRpcGxlIG1lc3NhZ2VzIChwYXlsb2FkKS5cbiAqXG4gKiAgICAgPGxlbmd0aD46ZGF0YVxuICpcbiAqIEV4YW1wbGU6XG4gKlxuICogICAgIDExOmhlbGxvIHdvcmxkMjpoaVxuICpcbiAqIElmIGFueSBjb250ZW50cyBhcmUgYmluYXJ5LCB0aGV5IHdpbGwgYmUgZW5jb2RlZCBhcyBiYXNlNjQgc3RyaW5ncy4gQmFzZTY0XG4gKiBlbmNvZGVkIHN0cmluZ3MgYXJlIG1hcmtlZCB3aXRoIGEgYiBiZWZvcmUgdGhlIGxlbmd0aCBzcGVjaWZpZXJcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBwYWNrZXRzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmVuY29kZVBheWxvYWQgPSBmdW5jdGlvbiAocGFja2V0cywgc3VwcG9ydHNCaW5hcnksIGNhbGxiYWNrKSB7XG4gIGlmICh0eXBlb2Ygc3VwcG9ydHNCaW5hcnkgPT0gJ2Z1bmN0aW9uJykge1xuICAgIGNhbGxiYWNrID0gc3VwcG9ydHNCaW5hcnk7XG4gICAgc3VwcG9ydHNCaW5hcnkgPSBudWxsO1xuICB9XG5cbiAgdmFyIGlzQmluYXJ5ID0gaGFzQmluYXJ5KHBhY2tldHMpO1xuXG4gIGlmIChzdXBwb3J0c0JpbmFyeSAmJiBpc0JpbmFyeSkge1xuICAgIGlmIChCbG9iICYmICFkb250U2VuZEJsb2JzKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5lbmNvZGVQYXlsb2FkQXNCbG9iKHBhY2tldHMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZXhwb3J0cy5lbmNvZGVQYXlsb2FkQXNBcnJheUJ1ZmZlcihwYWNrZXRzLCBjYWxsYmFjayk7XG4gIH1cblxuICBpZiAoIXBhY2tldHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGNhbGxiYWNrKCcwOicpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0TGVuZ3RoSGVhZGVyKG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbWVzc2FnZS5sZW5ndGggKyAnOicgKyBtZXNzYWdlO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5jb2RlT25lKHBhY2tldCwgZG9uZUNhbGxiYWNrKSB7XG4gICAgZXhwb3J0cy5lbmNvZGVQYWNrZXQocGFja2V0LCAhaXNCaW5hcnkgPyBmYWxzZSA6IHN1cHBvcnRzQmluYXJ5LCB0cnVlLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgICBkb25lQ2FsbGJhY2sobnVsbCwgc2V0TGVuZ3RoSGVhZGVyKG1lc3NhZ2UpKTtcbiAgICB9KTtcbiAgfVxuXG4gIG1hcChwYWNrZXRzLCBlbmNvZGVPbmUsIGZ1bmN0aW9uKGVyciwgcmVzdWx0cykge1xuICAgIHJldHVybiBjYWxsYmFjayhyZXN1bHRzLmpvaW4oJycpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEFzeW5jIGFycmF5IG1hcCB1c2luZyBhZnRlclxuICovXG5cbmZ1bmN0aW9uIG1hcChhcnksIGVhY2gsIGRvbmUpIHtcbiAgdmFyIHJlc3VsdCA9IG5ldyBBcnJheShhcnkubGVuZ3RoKTtcbiAgdmFyIG5leHQgPSBhZnRlcihhcnkubGVuZ3RoLCBkb25lKTtcblxuICB2YXIgZWFjaFdpdGhJbmRleCA9IGZ1bmN0aW9uKGksIGVsLCBjYikge1xuICAgIGVhY2goZWwsIGZ1bmN0aW9uKGVycm9yLCBtc2cpIHtcbiAgICAgIHJlc3VsdFtpXSA9IG1zZztcbiAgICAgIGNiKGVycm9yLCByZXN1bHQpO1xuICAgIH0pO1xuICB9O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJ5Lmxlbmd0aDsgaSsrKSB7XG4gICAgZWFjaFdpdGhJbmRleChpLCBhcnlbaV0sIG5leHQpO1xuICB9XG59XG5cbi8qXG4gKiBEZWNvZGVzIGRhdGEgd2hlbiBhIHBheWxvYWQgaXMgbWF5YmUgZXhwZWN0ZWQuIFBvc3NpYmxlIGJpbmFyeSBjb250ZW50cyBhcmVcbiAqIGRlY29kZWQgZnJvbSB0aGVpciBiYXNlNjQgcmVwcmVzZW50YXRpb25cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZGF0YSwgY2FsbGJhY2sgbWV0aG9kXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuZGVjb2RlUGF5bG9hZCA9IGZ1bmN0aW9uIChkYXRhLCBiaW5hcnlUeXBlLCBjYWxsYmFjaykge1xuICBpZiAodHlwZW9mIGRhdGEgIT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZXhwb3J0cy5kZWNvZGVQYXlsb2FkQXNCaW5hcnkoZGF0YSwgYmluYXJ5VHlwZSwgY2FsbGJhY2spO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBiaW5hcnlUeXBlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgY2FsbGJhY2sgPSBiaW5hcnlUeXBlO1xuICAgIGJpbmFyeVR5cGUgPSBudWxsO1xuICB9XG5cbiAgdmFyIHBhY2tldDtcbiAgaWYgKGRhdGEgPT0gJycpIHtcbiAgICAvLyBwYXJzZXIgZXJyb3IgLSBpZ25vcmluZyBwYXlsb2FkXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyciwgMCwgMSk7XG4gIH1cblxuICB2YXIgbGVuZ3RoID0gJydcbiAgICAsIG4sIG1zZztcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGRhdGEubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgdmFyIGNociA9IGRhdGEuY2hhckF0KGkpO1xuXG4gICAgaWYgKCc6JyAhPSBjaHIpIHtcbiAgICAgIGxlbmd0aCArPSBjaHI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICgnJyA9PSBsZW5ndGggfHwgKGxlbmd0aCAhPSAobiA9IE51bWJlcihsZW5ndGgpKSkpIHtcbiAgICAgICAgLy8gcGFyc2VyIGVycm9yIC0gaWdub3JpbmcgcGF5bG9hZFxuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyLCAwLCAxKTtcbiAgICAgIH1cblxuICAgICAgbXNnID0gZGF0YS5zdWJzdHIoaSArIDEsIG4pO1xuXG4gICAgICBpZiAobGVuZ3RoICE9IG1zZy5sZW5ndGgpIHtcbiAgICAgICAgLy8gcGFyc2VyIGVycm9yIC0gaWdub3JpbmcgcGF5bG9hZFxuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyLCAwLCAxKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG1zZy5sZW5ndGgpIHtcbiAgICAgICAgcGFja2V0ID0gZXhwb3J0cy5kZWNvZGVQYWNrZXQobXNnLCBiaW5hcnlUeXBlLCB0cnVlKTtcblxuICAgICAgICBpZiAoZXJyLnR5cGUgPT0gcGFja2V0LnR5cGUgJiYgZXJyLmRhdGEgPT0gcGFja2V0LmRhdGEpIHtcbiAgICAgICAgICAvLyBwYXJzZXIgZXJyb3IgaW4gaW5kaXZpZHVhbCBwYWNrZXQgLSBpZ25vcmluZyBwYXlsb2FkXG4gICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyciwgMCwgMSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmV0ID0gY2FsbGJhY2socGFja2V0LCBpICsgbiwgbCk7XG4gICAgICAgIGlmIChmYWxzZSA9PT0gcmV0KSByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIGFkdmFuY2UgY3Vyc29yXG4gICAgICBpICs9IG47XG4gICAgICBsZW5ndGggPSAnJztcbiAgICB9XG4gIH1cblxuICBpZiAobGVuZ3RoICE9ICcnKSB7XG4gICAgLy8gcGFyc2VyIGVycm9yIC0gaWdub3JpbmcgcGF5bG9hZFxuICAgIHJldHVybiBjYWxsYmFjayhlcnIsIDAsIDEpO1xuICB9XG5cbn07XG5cbi8qKlxuICogRW5jb2RlcyBtdWx0aXBsZSBtZXNzYWdlcyAocGF5bG9hZCkgYXMgYmluYXJ5LlxuICpcbiAqIDwxID0gYmluYXJ5LCAwID0gc3RyaW5nPjxudW1iZXIgZnJvbSAwLTk+PG51bWJlciBmcm9tIDAtOT5bLi4uXTxudW1iZXJcbiAqIDI1NT48ZGF0YT5cbiAqXG4gKiBFeGFtcGxlOlxuICogMSAzIDI1NSAxIDIgMywgaWYgdGhlIGJpbmFyeSBjb250ZW50cyBhcmUgaW50ZXJwcmV0ZWQgYXMgOCBiaXQgaW50ZWdlcnNcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBwYWNrZXRzXG4gKiBAcmV0dXJuIHtBcnJheUJ1ZmZlcn0gZW5jb2RlZCBwYXlsb2FkXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmVuY29kZVBheWxvYWRBc0FycmF5QnVmZmVyID0gZnVuY3Rpb24ocGFja2V0cywgY2FsbGJhY2spIHtcbiAgaWYgKCFwYWNrZXRzLmxlbmd0aCkge1xuICAgIHJldHVybiBjYWxsYmFjayhuZXcgQXJyYXlCdWZmZXIoMCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5jb2RlT25lKHBhY2tldCwgZG9uZUNhbGxiYWNrKSB7XG4gICAgZXhwb3J0cy5lbmNvZGVQYWNrZXQocGFja2V0LCB0cnVlLCB0cnVlLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gZG9uZUNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgIH0pO1xuICB9XG5cbiAgbWFwKHBhY2tldHMsIGVuY29kZU9uZSwgZnVuY3Rpb24oZXJyLCBlbmNvZGVkUGFja2V0cykge1xuICAgIHZhciB0b3RhbExlbmd0aCA9IGVuY29kZWRQYWNrZXRzLnJlZHVjZShmdW5jdGlvbihhY2MsIHApIHtcbiAgICAgIHZhciBsZW47XG4gICAgICBpZiAodHlwZW9mIHAgPT09ICdzdHJpbmcnKXtcbiAgICAgICAgbGVuID0gcC5sZW5ndGg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsZW4gPSBwLmJ5dGVMZW5ndGg7XG4gICAgICB9XG4gICAgICByZXR1cm4gYWNjICsgbGVuLnRvU3RyaW5nKCkubGVuZ3RoICsgbGVuICsgMjsgLy8gc3RyaW5nL2JpbmFyeSBpZGVudGlmaWVyICsgc2VwYXJhdG9yID0gMlxuICAgIH0sIDApO1xuXG4gICAgdmFyIHJlc3VsdEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkodG90YWxMZW5ndGgpO1xuXG4gICAgdmFyIGJ1ZmZlckluZGV4ID0gMDtcbiAgICBlbmNvZGVkUGFja2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHApIHtcbiAgICAgIHZhciBpc1N0cmluZyA9IHR5cGVvZiBwID09PSAnc3RyaW5nJztcbiAgICAgIHZhciBhYiA9IHA7XG4gICAgICBpZiAoaXNTdHJpbmcpIHtcbiAgICAgICAgdmFyIHZpZXcgPSBuZXcgVWludDhBcnJheShwLmxlbmd0aCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHZpZXdbaV0gPSBwLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIH1cbiAgICAgICAgYWIgPSB2aWV3LmJ1ZmZlcjtcbiAgICAgIH1cblxuICAgICAgaWYgKGlzU3RyaW5nKSB7IC8vIG5vdCB0cnVlIGJpbmFyeVxuICAgICAgICByZXN1bHRBcnJheVtidWZmZXJJbmRleCsrXSA9IDA7XG4gICAgICB9IGVsc2UgeyAvLyB0cnVlIGJpbmFyeVxuICAgICAgICByZXN1bHRBcnJheVtidWZmZXJJbmRleCsrXSA9IDE7XG4gICAgICB9XG5cbiAgICAgIHZhciBsZW5TdHIgPSBhYi5ieXRlTGVuZ3RoLnRvU3RyaW5nKCk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlblN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICByZXN1bHRBcnJheVtidWZmZXJJbmRleCsrXSA9IHBhcnNlSW50KGxlblN0cltpXSk7XG4gICAgICB9XG4gICAgICByZXN1bHRBcnJheVtidWZmZXJJbmRleCsrXSA9IDI1NTtcblxuICAgICAgdmFyIHZpZXcgPSBuZXcgVWludDhBcnJheShhYik7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgcmVzdWx0QXJyYXlbYnVmZmVySW5kZXgrK10gPSB2aWV3W2ldO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNhbGxiYWNrKHJlc3VsdEFycmF5LmJ1ZmZlcik7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBFbmNvZGUgYXMgQmxvYlxuICovXG5cbmV4cG9ydHMuZW5jb2RlUGF5bG9hZEFzQmxvYiA9IGZ1bmN0aW9uKHBhY2tldHMsIGNhbGxiYWNrKSB7XG4gIGZ1bmN0aW9uIGVuY29kZU9uZShwYWNrZXQsIGRvbmVDYWxsYmFjaykge1xuICAgIGV4cG9ydHMuZW5jb2RlUGFja2V0KHBhY2tldCwgdHJ1ZSwgdHJ1ZSwgZnVuY3Rpb24oZW5jb2RlZCkge1xuICAgICAgdmFyIGJpbmFyeUlkZW50aWZpZXIgPSBuZXcgVWludDhBcnJheSgxKTtcbiAgICAgIGJpbmFyeUlkZW50aWZpZXJbMF0gPSAxO1xuICAgICAgaWYgKHR5cGVvZiBlbmNvZGVkID09PSAnc3RyaW5nJykge1xuICAgICAgICB2YXIgdmlldyA9IG5ldyBVaW50OEFycmF5KGVuY29kZWQubGVuZ3RoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbmNvZGVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdmlld1tpXSA9IGVuY29kZWQuY2hhckNvZGVBdChpKTtcbiAgICAgICAgfVxuICAgICAgICBlbmNvZGVkID0gdmlldy5idWZmZXI7XG4gICAgICAgIGJpbmFyeUlkZW50aWZpZXJbMF0gPSAwO1xuICAgICAgfVxuXG4gICAgICB2YXIgbGVuID0gKGVuY29kZWQgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcilcbiAgICAgICAgPyBlbmNvZGVkLmJ5dGVMZW5ndGhcbiAgICAgICAgOiBlbmNvZGVkLnNpemU7XG5cbiAgICAgIHZhciBsZW5TdHIgPSBsZW4udG9TdHJpbmcoKTtcbiAgICAgIHZhciBsZW5ndGhBcnkgPSBuZXcgVWludDhBcnJheShsZW5TdHIubGVuZ3RoICsgMSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlblN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICBsZW5ndGhBcnlbaV0gPSBwYXJzZUludChsZW5TdHJbaV0pO1xuICAgICAgfVxuICAgICAgbGVuZ3RoQXJ5W2xlblN0ci5sZW5ndGhdID0gMjU1O1xuXG4gICAgICBpZiAoQmxvYikge1xuICAgICAgICB2YXIgYmxvYiA9IG5ldyBCbG9iKFtiaW5hcnlJZGVudGlmaWVyLmJ1ZmZlciwgbGVuZ3RoQXJ5LmJ1ZmZlciwgZW5jb2RlZF0pO1xuICAgICAgICBkb25lQ2FsbGJhY2sobnVsbCwgYmxvYik7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBtYXAocGFja2V0cywgZW5jb2RlT25lLCBmdW5jdGlvbihlcnIsIHJlc3VsdHMpIHtcbiAgICByZXR1cm4gY2FsbGJhY2sobmV3IEJsb2IocmVzdWx0cykpO1xuICB9KTtcbn07XG5cbi8qXG4gKiBEZWNvZGVzIGRhdGEgd2hlbiBhIHBheWxvYWQgaXMgbWF5YmUgZXhwZWN0ZWQuIFN0cmluZ3MgYXJlIGRlY29kZWQgYnlcbiAqIGludGVycHJldGluZyBlYWNoIGJ5dGUgYXMgYSBrZXkgY29kZSBmb3IgZW50cmllcyBtYXJrZWQgdG8gc3RhcnQgd2l0aCAwLiBTZWVcbiAqIGRlc2NyaXB0aW9uIG9mIGVuY29kZVBheWxvYWRBc0JpbmFyeVxuICpcbiAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGRhdGEsIGNhbGxiYWNrIG1ldGhvZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmRlY29kZVBheWxvYWRBc0JpbmFyeSA9IGZ1bmN0aW9uIChkYXRhLCBiaW5hcnlUeXBlLCBjYWxsYmFjaykge1xuICBpZiAodHlwZW9mIGJpbmFyeVR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IGJpbmFyeVR5cGU7XG4gICAgYmluYXJ5VHlwZSA9IG51bGw7XG4gIH1cblxuICB2YXIgYnVmZmVyVGFpbCA9IGRhdGE7XG4gIHZhciBidWZmZXJzID0gW107XG5cbiAgdmFyIG51bWJlclRvb0xvbmcgPSBmYWxzZTtcbiAgd2hpbGUgKGJ1ZmZlclRhaWwuYnl0ZUxlbmd0aCA+IDApIHtcbiAgICB2YXIgdGFpbEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyVGFpbCk7XG4gICAgdmFyIGlzU3RyaW5nID0gdGFpbEFycmF5WzBdID09PSAwO1xuICAgIHZhciBtc2dMZW5ndGggPSAnJztcblxuICAgIGZvciAodmFyIGkgPSAxOyA7IGkrKykge1xuICAgICAgaWYgKHRhaWxBcnJheVtpXSA9PSAyNTUpIGJyZWFrO1xuXG4gICAgICBpZiAobXNnTGVuZ3RoLmxlbmd0aCA+IDMxMCkge1xuICAgICAgICBudW1iZXJUb29Mb25nID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIG1zZ0xlbmd0aCArPSB0YWlsQXJyYXlbaV07XG4gICAgfVxuXG4gICAgaWYobnVtYmVyVG9vTG9uZykgcmV0dXJuIGNhbGxiYWNrKGVyciwgMCwgMSk7XG5cbiAgICBidWZmZXJUYWlsID0gc2xpY2VCdWZmZXIoYnVmZmVyVGFpbCwgMiArIG1zZ0xlbmd0aC5sZW5ndGgpO1xuICAgIG1zZ0xlbmd0aCA9IHBhcnNlSW50KG1zZ0xlbmd0aCk7XG5cbiAgICB2YXIgbXNnID0gc2xpY2VCdWZmZXIoYnVmZmVyVGFpbCwgMCwgbXNnTGVuZ3RoKTtcbiAgICBpZiAoaXNTdHJpbmcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1zZyA9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgbmV3IFVpbnQ4QXJyYXkobXNnKSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8vIGlQaG9uZSBTYWZhcmkgZG9lc24ndCBsZXQgeW91IGFwcGx5IHRvIHR5cGVkIGFycmF5c1xuICAgICAgICB2YXIgdHlwZWQgPSBuZXcgVWludDhBcnJheShtc2cpO1xuICAgICAgICBtc2cgPSAnJztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0eXBlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIG1zZyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHR5cGVkW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGJ1ZmZlcnMucHVzaChtc2cpO1xuICAgIGJ1ZmZlclRhaWwgPSBzbGljZUJ1ZmZlcihidWZmZXJUYWlsLCBtc2dMZW5ndGgpO1xuICB9XG5cbiAgdmFyIHRvdGFsID0gYnVmZmVycy5sZW5ndGg7XG4gIGJ1ZmZlcnMuZm9yRWFjaChmdW5jdGlvbihidWZmZXIsIGkpIHtcbiAgICBjYWxsYmFjayhleHBvcnRzLmRlY29kZVBhY2tldChidWZmZXIsIGJpbmFyeVR5cGUsIHRydWUpLCBpLCB0b3RhbCk7XG4gIH0pO1xufTtcbiIsIlxuLyoqXG4gKiBHZXRzIHRoZSBrZXlzIGZvciBhbiBvYmplY3QuXG4gKlxuICogQHJldHVybiB7QXJyYXl9IGtleXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24ga2V5cyAob2JqKXtcbiAgdmFyIGFyciA9IFtdO1xuICB2YXIgaGFzID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuICBmb3IgKHZhciBpIGluIG9iaikge1xuICAgIGlmIChoYXMuY2FsbChvYmosIGkpKSB7XG4gICAgICBhcnIucHVzaChpKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFycjtcbn07XG4iLCJcbi8qXG4gKiBNb2R1bGUgcmVxdWlyZW1lbnRzLlxuICovXG5cbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXNhcnJheScpO1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gaGFzQmluYXJ5O1xuXG4vKipcbiAqIENoZWNrcyBmb3IgYmluYXJ5IGRhdGEuXG4gKlxuICogUmlnaHQgbm93IG9ubHkgQnVmZmVyIGFuZCBBcnJheUJ1ZmZlciBhcmUgc3VwcG9ydGVkLi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYW55dGhpbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gaGFzQmluYXJ5KGRhdGEpIHtcblxuICBmdW5jdGlvbiBfaGFzQmluYXJ5KG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gZmFsc2U7XG5cbiAgICBpZiAoIChnbG9iYWwuQnVmZmVyICYmIGdsb2JhbC5CdWZmZXIuaXNCdWZmZXIgJiYgZ2xvYmFsLkJ1ZmZlci5pc0J1ZmZlcihvYmopKSB8fFxuICAgICAgICAgKGdsb2JhbC5BcnJheUJ1ZmZlciAmJiBvYmogaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikgfHxcbiAgICAgICAgIChnbG9iYWwuQmxvYiAmJiBvYmogaW5zdGFuY2VvZiBCbG9iKSB8fFxuICAgICAgICAgKGdsb2JhbC5GaWxlICYmIG9iaiBpbnN0YW5jZW9mIEZpbGUpXG4gICAgICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAoX2hhc0JpbmFyeShvYmpbaV0pKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG9iaiAmJiAnb2JqZWN0JyA9PSB0eXBlb2Ygb2JqKSB7XG4gICAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9BdXRvbWF0dGljL2hhcy1iaW5hcnkvcHVsbC80XG4gICAgICBpZiAob2JqLnRvSlNPTiAmJiAnZnVuY3Rpb24nID09IHR5cGVvZiBvYmoudG9KU09OKSB7XG4gICAgICAgIG9iaiA9IG9iai50b0pTT04oKTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSAmJiBfaGFzQmluYXJ5KG9ialtrZXldKSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIF9oYXNCaW5hcnkoZGF0YSk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKGFycikge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFycikgPT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCJcbnZhciBpbmRleE9mID0gW10uaW5kZXhPZjtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihhcnIsIG9iail7XG4gIGlmIChpbmRleE9mKSByZXR1cm4gYXJyLmluZGV4T2Yob2JqKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoYXJyW2ldID09PSBvYmopIHJldHVybiBpO1xuICB9XG4gIHJldHVybiAtMTtcbn07IiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEB0aHJvd3Mge0Vycm9yfSB0aHJvdyBhbiBlcnJvciBpZiB2YWwgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZyBvciBhIG51bWJlclxuICogQHJldHVybiB7U3RyaW5nfE51bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbDtcbiAgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5sb25nID8gZm10TG9uZyh2YWwpIDogZm10U2hvcnQodmFsKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3ZhbCBpcyBub3QgYSBub24tZW1wdHkgc3RyaW5nIG9yIGEgdmFsaWQgbnVtYmVyLiB2YWw9JyArXG4gICAgICBKU09OLnN0cmluZ2lmeSh2YWwpXG4gICk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgc3RyID0gU3RyaW5nKHN0cik7XG4gIGlmIChzdHIubGVuZ3RoID4gMTAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoXG4gICAgc3RyXG4gICk7XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3lycyc6XG4gICAgY2FzZSAneXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2hycyc6XG4gICAgY2FzZSAnaHInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbWlucyc6XG4gICAgY2FzZSAnbWluJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3NlY3MnOlxuICAgIGNhc2UgJ3NlYyc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbWlsbGlzZWNvbmRzJzpcbiAgICBjYXNlICdtaWxsaXNlY29uZCc6XG4gICAgY2FzZSAnbXNlY3MnOlxuICAgIGNhc2UgJ21zZWMnOlxuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZm10U2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICB9XG4gIGlmIChtcyA+PSBoKSB7XG4gICAgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgfVxuICBpZiAobXMgPj0gbSkge1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIH1cbiAgaWYgKG1zID49IHMpIHtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICB9XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmbXRMb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKSB8fFxuICAgIHBsdXJhbChtcywgaCwgJ2hvdXInKSB8fFxuICAgIHBsdXJhbChtcywgbSwgJ21pbnV0ZScpIHx8XG4gICAgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJykgfHxcbiAgICBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChtcyA8IG4gKiAxLjUpIHtcbiAgICByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgfVxuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwiLyoqXHJcbiAqIENvbXBpbGVzIGEgcXVlcnlzdHJpbmdcclxuICogUmV0dXJucyBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdFxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH1cclxuICogQGFwaSBwcml2YXRlXHJcbiAqL1xyXG5cclxuZXhwb3J0cy5lbmNvZGUgPSBmdW5jdGlvbiAob2JqKSB7XHJcbiAgdmFyIHN0ciA9ICcnO1xyXG5cclxuICBmb3IgKHZhciBpIGluIG9iaikge1xyXG4gICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShpKSkge1xyXG4gICAgICBpZiAoc3RyLmxlbmd0aCkgc3RyICs9ICcmJztcclxuICAgICAgc3RyICs9IGVuY29kZVVSSUNvbXBvbmVudChpKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbaV0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHN0cjtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBQYXJzZXMgYSBzaW1wbGUgcXVlcnlzdHJpbmcgaW50byBhbiBvYmplY3RcclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHFzXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZGVjb2RlID0gZnVuY3Rpb24ocXMpe1xyXG4gIHZhciBxcnkgPSB7fTtcclxuICB2YXIgcGFpcnMgPSBxcy5zcGxpdCgnJicpO1xyXG4gIGZvciAodmFyIGkgPSAwLCBsID0gcGFpcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XHJcbiAgICB2YXIgcGFpciA9IHBhaXJzW2ldLnNwbGl0KCc9Jyk7XHJcbiAgICBxcnlbZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMF0pXSA9IGRlY29kZVVSSUNvbXBvbmVudChwYWlyWzFdKTtcclxuICB9XHJcbiAgcmV0dXJuIHFyeTtcclxufTtcclxuIiwiLyoqXHJcbiAqIFBhcnNlcyBhbiBVUklcclxuICpcclxuICogQGF1dGhvciBTdGV2ZW4gTGV2aXRoYW4gPHN0ZXZlbmxldml0aGFuLmNvbT4gKE1JVCBsaWNlbnNlKVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG52YXIgcmUgPSAvXig/Oig/IVteOkBdKzpbXjpAXFwvXSpAKShodHRwfGh0dHBzfHdzfHdzcyk6XFwvXFwvKT8oKD86KChbXjpAXSopKD86OihbXjpAXSopKT8pP0ApPygoPzpbYS1mMC05XXswLDR9Oil7Miw3fVthLWYwLTldezAsNH18W146XFwvPyNdKikoPzo6KFxcZCopKT8pKCgoXFwvKD86W14/I10oPyFbXj8jXFwvXSpcXC5bXj8jXFwvLl0rKD86Wz8jXXwkKSkpKlxcLz8pPyhbXj8jXFwvXSopKSg/OlxcPyhbXiNdKikpPyg/OiMoLiopKT8pLztcclxuXHJcbnZhciBwYXJ0cyA9IFtcclxuICAgICdzb3VyY2UnLCAncHJvdG9jb2wnLCAnYXV0aG9yaXR5JywgJ3VzZXJJbmZvJywgJ3VzZXInLCAncGFzc3dvcmQnLCAnaG9zdCcsICdwb3J0JywgJ3JlbGF0aXZlJywgJ3BhdGgnLCAnZGlyZWN0b3J5JywgJ2ZpbGUnLCAncXVlcnknLCAnYW5jaG9yJ1xyXG5dO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBwYXJzZXVyaShzdHIpIHtcclxuICAgIHZhciBzcmMgPSBzdHIsXHJcbiAgICAgICAgYiA9IHN0ci5pbmRleE9mKCdbJyksXHJcbiAgICAgICAgZSA9IHN0ci5pbmRleE9mKCddJyk7XHJcblxyXG4gICAgaWYgKGIgIT0gLTEgJiYgZSAhPSAtMSkge1xyXG4gICAgICAgIHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgYikgKyBzdHIuc3Vic3RyaW5nKGIsIGUpLnJlcGxhY2UoLzovZywgJzsnKSArIHN0ci5zdWJzdHJpbmcoZSwgc3RyLmxlbmd0aCk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIG0gPSByZS5leGVjKHN0ciB8fCAnJyksXHJcbiAgICAgICAgdXJpID0ge30sXHJcbiAgICAgICAgaSA9IDE0O1xyXG5cclxuICAgIHdoaWxlIChpLS0pIHtcclxuICAgICAgICB1cmlbcGFydHNbaV1dID0gbVtpXSB8fCAnJztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYiAhPSAtMSAmJiBlICE9IC0xKSB7XHJcbiAgICAgICAgdXJpLnNvdXJjZSA9IHNyYztcclxuICAgICAgICB1cmkuaG9zdCA9IHVyaS5ob3N0LnN1YnN0cmluZygxLCB1cmkuaG9zdC5sZW5ndGggLSAxKS5yZXBsYWNlKC87L2csICc6Jyk7XHJcbiAgICAgICAgdXJpLmF1dGhvcml0eSA9IHVyaS5hdXRob3JpdHkucmVwbGFjZSgnWycsICcnKS5yZXBsYWNlKCddJywgJycpLnJlcGxhY2UoLzsvZywgJzonKTtcclxuICAgICAgICB1cmkuaXB2NnVyaSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHVyaTtcclxufTtcclxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5wcmVwZW5kT25jZUxpc3RlbmVyID0gbm9vcDtcblxucHJvY2Vzcy5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkgeyByZXR1cm4gW10gfVxuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIi8qISBodHRwczovL210aHMuYmUvd3RmOCB2MS4wLjAgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8vIERldGVjdCBmcmVlIHZhcmlhYmxlcyBgZXhwb3J0c2Bcblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cztcblxuXHQvLyBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgbW9kdWxlYFxuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXG5cdC8vIERldGVjdCBmcmVlIHZhcmlhYmxlIGBnbG9iYWxgLCBmcm9tIE5vZGUuanMgb3IgQnJvd3NlcmlmaWVkIGNvZGUsXG5cdC8vIGFuZCB1c2UgaXQgYXMgYHJvb3RgXG5cdHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWw7XG5cdGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCB8fCBmcmVlR2xvYmFsLndpbmRvdyA9PT0gZnJlZUdsb2JhbCkge1xuXHRcdHJvb3QgPSBmcmVlR2xvYmFsO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0dmFyIHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGU7XG5cblx0Ly8gVGFrZW4gZnJvbSBodHRwczovL210aHMuYmUvcHVueWNvZGVcblx0ZnVuY3Rpb24gdWNzMmRlY29kZShzdHJpbmcpIHtcblx0XHR2YXIgb3V0cHV0ID0gW107XG5cdFx0dmFyIGNvdW50ZXIgPSAwO1xuXHRcdHZhciBsZW5ndGggPSBzdHJpbmcubGVuZ3RoO1xuXHRcdHZhciB2YWx1ZTtcblx0XHR2YXIgZXh0cmE7XG5cdFx0d2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdGlmICh2YWx1ZSA+PSAweEQ4MDAgJiYgdmFsdWUgPD0gMHhEQkZGICYmIGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdGV4dHJhID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdFx0aWYgKChleHRyYSAmIDB4RkMwMCkgPT0gMHhEQzAwKSB7IC8vIGxvdyBzdXJyb2dhdGVcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgoKHZhbHVlICYgMHgzRkYpIDw8IDEwKSArIChleHRyYSAmIDB4M0ZGKSArIDB4MTAwMDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVubWF0Y2hlZCBzdXJyb2dhdGU7IG9ubHkgYXBwZW5kIHRoaXMgY29kZSB1bml0LCBpbiBjYXNlIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0Ly8gVGFrZW4gZnJvbSBodHRwczovL210aHMuYmUvcHVueWNvZGVcblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cdFx0dmFyIGluZGV4ID0gLTE7XG5cdFx0dmFyIHZhbHVlO1xuXHRcdHZhciBvdXRwdXQgPSAnJztcblx0XHR3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBhcnJheVtpbmRleF07XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0ZnVuY3Rpb24gY3JlYXRlQnl0ZShjb2RlUG9pbnQsIHNoaWZ0KSB7XG5cdFx0cmV0dXJuIHN0cmluZ0Zyb21DaGFyQ29kZSgoKGNvZGVQb2ludCA+PiBzaGlmdCkgJiAweDNGKSB8IDB4ODApO1xuXHR9XG5cblx0ZnVuY3Rpb24gZW5jb2RlQ29kZVBvaW50KGNvZGVQb2ludCkge1xuXHRcdGlmICgoY29kZVBvaW50ICYgMHhGRkZGRkY4MCkgPT0gMCkgeyAvLyAxLWJ5dGUgc2VxdWVuY2Vcblx0XHRcdHJldHVybiBzdHJpbmdGcm9tQ2hhckNvZGUoY29kZVBvaW50KTtcblx0XHR9XG5cdFx0dmFyIHN5bWJvbCA9ICcnO1xuXHRcdGlmICgoY29kZVBvaW50ICYgMHhGRkZGRjgwMCkgPT0gMCkgeyAvLyAyLWJ5dGUgc2VxdWVuY2Vcblx0XHRcdHN5bWJvbCA9IHN0cmluZ0Zyb21DaGFyQ29kZSgoKGNvZGVQb2ludCA+PiA2KSAmIDB4MUYpIHwgMHhDMCk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKChjb2RlUG9pbnQgJiAweEZGRkYwMDAwKSA9PSAwKSB7IC8vIDMtYnl0ZSBzZXF1ZW5jZVxuXHRcdFx0c3ltYm9sID0gc3RyaW5nRnJvbUNoYXJDb2RlKCgoY29kZVBvaW50ID4+IDEyKSAmIDB4MEYpIHwgMHhFMCk7XG5cdFx0XHRzeW1ib2wgKz0gY3JlYXRlQnl0ZShjb2RlUG9pbnQsIDYpO1xuXHRcdH1cblx0XHRlbHNlIGlmICgoY29kZVBvaW50ICYgMHhGRkUwMDAwMCkgPT0gMCkgeyAvLyA0LWJ5dGUgc2VxdWVuY2Vcblx0XHRcdHN5bWJvbCA9IHN0cmluZ0Zyb21DaGFyQ29kZSgoKGNvZGVQb2ludCA+PiAxOCkgJiAweDA3KSB8IDB4RjApO1xuXHRcdFx0c3ltYm9sICs9IGNyZWF0ZUJ5dGUoY29kZVBvaW50LCAxMik7XG5cdFx0XHRzeW1ib2wgKz0gY3JlYXRlQnl0ZShjb2RlUG9pbnQsIDYpO1xuXHRcdH1cblx0XHRzeW1ib2wgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKChjb2RlUG9pbnQgJiAweDNGKSB8IDB4ODApO1xuXHRcdHJldHVybiBzeW1ib2w7XG5cdH1cblxuXHRmdW5jdGlvbiB3dGY4ZW5jb2RlKHN0cmluZykge1xuXHRcdHZhciBjb2RlUG9pbnRzID0gdWNzMmRlY29kZShzdHJpbmcpO1xuXHRcdHZhciBsZW5ndGggPSBjb2RlUG9pbnRzLmxlbmd0aDtcblx0XHR2YXIgaW5kZXggPSAtMTtcblx0XHR2YXIgY29kZVBvaW50O1xuXHRcdHZhciBieXRlU3RyaW5nID0gJyc7XG5cdFx0d2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcblx0XHRcdGNvZGVQb2ludCA9IGNvZGVQb2ludHNbaW5kZXhdO1xuXHRcdFx0Ynl0ZVN0cmluZyArPSBlbmNvZGVDb2RlUG9pbnQoY29kZVBvaW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIGJ5dGVTdHJpbmc7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHRmdW5jdGlvbiByZWFkQ29udGludWF0aW9uQnl0ZSgpIHtcblx0XHRpZiAoYnl0ZUluZGV4ID49IGJ5dGVDb3VudCkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ0ludmFsaWQgYnl0ZSBpbmRleCcpO1xuXHRcdH1cblxuXHRcdHZhciBjb250aW51YXRpb25CeXRlID0gYnl0ZUFycmF5W2J5dGVJbmRleF0gJiAweEZGO1xuXHRcdGJ5dGVJbmRleCsrO1xuXG5cdFx0aWYgKChjb250aW51YXRpb25CeXRlICYgMHhDMCkgPT0gMHg4MCkge1xuXHRcdFx0cmV0dXJuIGNvbnRpbnVhdGlvbkJ5dGUgJiAweDNGO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGVuZCB1cCBoZXJlLCBpdOKAmXMgbm90IGEgY29udGludWF0aW9uIGJ5dGUuXG5cdFx0dGhyb3cgRXJyb3IoJ0ludmFsaWQgY29udGludWF0aW9uIGJ5dGUnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGRlY29kZVN5bWJvbCgpIHtcblx0XHR2YXIgYnl0ZTE7XG5cdFx0dmFyIGJ5dGUyO1xuXHRcdHZhciBieXRlMztcblx0XHR2YXIgYnl0ZTQ7XG5cdFx0dmFyIGNvZGVQb2ludDtcblxuXHRcdGlmIChieXRlSW5kZXggPiBieXRlQ291bnQpIHtcblx0XHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGJ5dGUgaW5kZXgnKTtcblx0XHR9XG5cblx0XHRpZiAoYnl0ZUluZGV4ID09IGJ5dGVDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFJlYWQgdGhlIGZpcnN0IGJ5dGUuXG5cdFx0Ynl0ZTEgPSBieXRlQXJyYXlbYnl0ZUluZGV4XSAmIDB4RkY7XG5cdFx0Ynl0ZUluZGV4Kys7XG5cblx0XHQvLyAxLWJ5dGUgc2VxdWVuY2UgKG5vIGNvbnRpbnVhdGlvbiBieXRlcylcblx0XHRpZiAoKGJ5dGUxICYgMHg4MCkgPT0gMCkge1xuXHRcdFx0cmV0dXJuIGJ5dGUxO1xuXHRcdH1cblxuXHRcdC8vIDItYnl0ZSBzZXF1ZW5jZVxuXHRcdGlmICgoYnl0ZTEgJiAweEUwKSA9PSAweEMwKSB7XG5cdFx0XHR2YXIgYnl0ZTIgPSByZWFkQ29udGludWF0aW9uQnl0ZSgpO1xuXHRcdFx0Y29kZVBvaW50ID0gKChieXRlMSAmIDB4MUYpIDw8IDYpIHwgYnl0ZTI7XG5cdFx0XHRpZiAoY29kZVBvaW50ID49IDB4ODApIHtcblx0XHRcdFx0cmV0dXJuIGNvZGVQb2ludDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGNvbnRpbnVhdGlvbiBieXRlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMy1ieXRlIHNlcXVlbmNlIChtYXkgaW5jbHVkZSB1bnBhaXJlZCBzdXJyb2dhdGVzKVxuXHRcdGlmICgoYnl0ZTEgJiAweEYwKSA9PSAweEUwKSB7XG5cdFx0XHRieXRlMiA9IHJlYWRDb250aW51YXRpb25CeXRlKCk7XG5cdFx0XHRieXRlMyA9IHJlYWRDb250aW51YXRpb25CeXRlKCk7XG5cdFx0XHRjb2RlUG9pbnQgPSAoKGJ5dGUxICYgMHgwRikgPDwgMTIpIHwgKGJ5dGUyIDw8IDYpIHwgYnl0ZTM7XG5cdFx0XHRpZiAoY29kZVBvaW50ID49IDB4MDgwMCkge1xuXHRcdFx0XHRyZXR1cm4gY29kZVBvaW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ0ludmFsaWQgY29udGludWF0aW9uIGJ5dGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyA0LWJ5dGUgc2VxdWVuY2Vcblx0XHRpZiAoKGJ5dGUxICYgMHhGOCkgPT0gMHhGMCkge1xuXHRcdFx0Ynl0ZTIgPSByZWFkQ29udGludWF0aW9uQnl0ZSgpO1xuXHRcdFx0Ynl0ZTMgPSByZWFkQ29udGludWF0aW9uQnl0ZSgpO1xuXHRcdFx0Ynl0ZTQgPSByZWFkQ29udGludWF0aW9uQnl0ZSgpO1xuXHRcdFx0Y29kZVBvaW50ID0gKChieXRlMSAmIDB4MEYpIDw8IDB4MTIpIHwgKGJ5dGUyIDw8IDB4MEMpIHxcblx0XHRcdFx0KGJ5dGUzIDw8IDB4MDYpIHwgYnl0ZTQ7XG5cdFx0XHRpZiAoY29kZVBvaW50ID49IDB4MDEwMDAwICYmIGNvZGVQb2ludCA8PSAweDEwRkZGRikge1xuXHRcdFx0XHRyZXR1cm4gY29kZVBvaW50O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IEVycm9yKCdJbnZhbGlkIFdURi04IGRldGVjdGVkJyk7XG5cdH1cblxuXHR2YXIgYnl0ZUFycmF5O1xuXHR2YXIgYnl0ZUNvdW50O1xuXHR2YXIgYnl0ZUluZGV4O1xuXHRmdW5jdGlvbiB3dGY4ZGVjb2RlKGJ5dGVTdHJpbmcpIHtcblx0XHRieXRlQXJyYXkgPSB1Y3MyZGVjb2RlKGJ5dGVTdHJpbmcpO1xuXHRcdGJ5dGVDb3VudCA9IGJ5dGVBcnJheS5sZW5ndGg7XG5cdFx0Ynl0ZUluZGV4ID0gMDtcblx0XHR2YXIgY29kZVBvaW50cyA9IFtdO1xuXHRcdHZhciB0bXA7XG5cdFx0d2hpbGUgKCh0bXAgPSBkZWNvZGVTeW1ib2woKSkgIT09IGZhbHNlKSB7XG5cdFx0XHRjb2RlUG9pbnRzLnB1c2godG1wKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVjczJlbmNvZGUoY29kZVBvaW50cyk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHR2YXIgd3RmOCA9IHtcblx0XHQndmVyc2lvbic6ICcxLjAuMCcsXG5cdFx0J2VuY29kZSc6IHd0ZjhlbmNvZGUsXG5cdFx0J2RlY29kZSc6IHd0ZjhkZWNvZGVcblx0fTtcblxuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB3dGY4O1xuXHRcdH0pO1xuXHR9XHRlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiAhZnJlZUV4cG9ydHMubm9kZVR5cGUpIHtcblx0XHRpZiAoZnJlZU1vZHVsZSkgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gd3RmODtcblx0XHR9IGVsc2UgeyAvLyBpbiBOYXJ3aGFsIG9yIFJpbmdvSlMgdjAuNy4wLVxuXHRcdFx0dmFyIG9iamVjdCA9IHt9O1xuXHRcdFx0dmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0Lmhhc093blByb3BlcnR5O1xuXHRcdFx0Zm9yICh2YXIga2V5IGluIHd0ZjgpIHtcblx0XHRcdFx0aGFzT3duUHJvcGVydHkuY2FsbCh3dGY4LCBrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gd3RmOFtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290Lnd0ZjggPSB3dGY4O1xuXHR9XG5cbn0odGhpcykpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYWxwaGFiZXQgPSAnMDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXotXycuc3BsaXQoJycpXG4gICwgbGVuZ3RoID0gNjRcbiAgLCBtYXAgPSB7fVxuICAsIHNlZWQgPSAwXG4gICwgaSA9IDBcbiAgLCBwcmV2O1xuXG4vKipcbiAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHNwZWNpZmllZCBudW1iZXIuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG51bSBUaGUgbnVtYmVyIHRvIGNvbnZlcnQuXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBudW1iZXIuXG4gKiBAYXBpIHB1YmxpY1xuICovXG5mdW5jdGlvbiBlbmNvZGUobnVtKSB7XG4gIHZhciBlbmNvZGVkID0gJyc7XG5cbiAgZG8ge1xuICAgIGVuY29kZWQgPSBhbHBoYWJldFtudW0gJSBsZW5ndGhdICsgZW5jb2RlZDtcbiAgICBudW0gPSBNYXRoLmZsb29yKG51bSAvIGxlbmd0aCk7XG4gIH0gd2hpbGUgKG51bSA+IDApO1xuXG4gIHJldHVybiBlbmNvZGVkO1xufVxuXG4vKipcbiAqIFJldHVybiB0aGUgaW50ZWdlciB2YWx1ZSBzcGVjaWZpZWQgYnkgdGhlIGdpdmVuIHN0cmluZy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY29udmVydC5cbiAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBpbnRlZ2VyIHZhbHVlIHJlcHJlc2VudGVkIGJ5IHRoZSBzdHJpbmcuXG4gKiBAYXBpIHB1YmxpY1xuICovXG5mdW5jdGlvbiBkZWNvZGUoc3RyKSB7XG4gIHZhciBkZWNvZGVkID0gMDtcblxuICBmb3IgKGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgZGVjb2RlZCA9IGRlY29kZWQgKiBsZW5ndGggKyBtYXBbc3RyLmNoYXJBdChpKV07XG4gIH1cblxuICByZXR1cm4gZGVjb2RlZDtcbn1cblxuLyoqXG4gKiBZZWFzdDogQSB0aW55IGdyb3dpbmcgaWQgZ2VuZXJhdG9yLlxuICpcbiAqIEByZXR1cm5zIHtTdHJpbmd9IEEgdW5pcXVlIGlkLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuZnVuY3Rpb24geWVhc3QoKSB7XG4gIHZhciBub3cgPSBlbmNvZGUoK25ldyBEYXRlKCkpO1xuXG4gIGlmIChub3cgIT09IHByZXYpIHJldHVybiBzZWVkID0gMCwgcHJldiA9IG5vdztcbiAgcmV0dXJuIG5vdyArJy4nKyBlbmNvZGUoc2VlZCsrKTtcbn1cblxuLy9cbi8vIE1hcCBlYWNoIGNoYXJhY3RlciB0byBpdHMgaW5kZXguXG4vL1xuZm9yICg7IGkgPCBsZW5ndGg7IGkrKykgbWFwW2FscGhhYmV0W2ldXSA9IGk7XG5cbi8vXG4vLyBFeHBvc2UgdGhlIGB5ZWFzdGAsIGBlbmNvZGVgIGFuZCBgZGVjb2RlYCBmdW5jdGlvbnMuXG4vL1xueWVhc3QuZW5jb2RlID0gZW5jb2RlO1xueWVhc3QuZGVjb2RlID0gZGVjb2RlO1xubW9kdWxlLmV4cG9ydHMgPSB5ZWFzdDtcbiJdfQ==
