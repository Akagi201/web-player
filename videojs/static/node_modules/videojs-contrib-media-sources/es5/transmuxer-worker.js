/**
 * @file transmuxer-worker.js
 */

/**
 * videojs-contrib-media-sources
 *
 * Copyright (c) 2015 Brightcove
 * All rights reserved.
 *
 * Handles communication between the browser-world and the mux.js
 * transmuxer running inside of a WebWorker by exposing a simple
 * message-based interface to a Transmuxer object.
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _muxJs = require('mux.js');

var _muxJs2 = _interopRequireDefault(_muxJs);

/**
 * Re-emits tranmsuxer events by converting them into messages to the
 * world outside the worker.
 *
 * @param {Object} transmuxer the transmuxer to wire events on
 * @private
 */
var wireTransmuxerEvents = function wireTransmuxerEvents(transmuxer) {
  transmuxer.on('data', function (segment) {
    // transfer ownership of the underlying ArrayBuffer
    // instead of doing a copy to save memory
    // ArrayBuffers are transferable but generic TypedArrays are not
    // @link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#Passing_data_by_transferring_ownership_(transferable_objects)
    var typedArray = segment.data;

    segment.data = typedArray.buffer;
    postMessage({
      action: 'data',
      segment: segment,
      byteOffset: typedArray.byteOffset,
      byteLength: typedArray.byteLength
    }, [segment.data]);
  });

  if (transmuxer.captionStream) {
    transmuxer.captionStream.on('data', function (caption) {
      postMessage({
        action: 'caption',
        data: caption
      });
    });
  }

  transmuxer.on('done', function (data) {
    postMessage({ action: 'done' });
  });
};

/**
 * All incoming messages route through this hash. If no function exists
 * to handle an incoming message, then we ignore the message.
 *
 * @class MessageHandlers
 * @param {Object} options the options to initialize with
 */

var MessageHandlers = (function () {
  function MessageHandlers(options) {
    _classCallCheck(this, MessageHandlers);

    this.options = options || {};
    this.init();
  }

  /**
   * Our web wroker interface so that things can talk to mux.js
   * that will be running in a web worker. the scope is passed to this by
   * webworkify.
   *
   * @param {Object} self the scope for the web worker
   */

  /**
   * initialize our web worker and wire all the events.
   */

  _createClass(MessageHandlers, [{
    key: 'init',
    value: function init() {
      if (this.transmuxer) {
        this.transmuxer.dispose();
      }
      this.transmuxer = new _muxJs2['default'].mp4.Transmuxer(this.options);
      wireTransmuxerEvents(this.transmuxer);
    }

    /**
     * Adds data (a ts segment) to the start of the transmuxer pipeline for
     * processing.
     *
     * @param {ArrayBuffer} data data to push into the muxer
     */
  }, {
    key: 'push',
    value: function push(data) {
      // Cast array buffer to correct type for transmuxer
      var segment = new Uint8Array(data.data, data.byteOffset, data.byteLength);

      this.transmuxer.push(segment);
    }

    /**
     * Recreate the transmuxer so that the next segment added via `push`
     * start with a fresh transmuxer.
     */
  }, {
    key: 'reset',
    value: function reset() {
      this.init();
    }

    /**
     * Set the value that will be used as the `baseMediaDecodeTime` time for the
     * next segment pushed in. Subsequent segments will have their `baseMediaDecodeTime`
     * set relative to the first based on the PTS values.
     *
     * @param {Object} data used to set the timestamp offset in the muxer
     */
  }, {
    key: 'setTimestampOffset',
    value: function setTimestampOffset(data) {
      var timestampOffset = data.timestampOffset || 0;

      this.transmuxer.setBaseMediaDecodeTime(Math.round(timestampOffset * 90000));
    }

    /**
     * Forces the pipeline to finish processing the last segment and emit it's
     * results.
     *
     * @param {Object} data event data, not really used
     */
  }, {
    key: 'flush',
    value: function flush(data) {
      this.transmuxer.flush();
    }
  }]);

  return MessageHandlers;
})();

var Worker = function Worker(self) {
  self.onmessage = function (event) {
    if (event.data.action === 'init' && event.data.options) {
      this.messageHandlers = new MessageHandlers(event.data.options);
      return;
    }

    if (!this.messageHandlers) {
      this.messageHandlers = new MessageHandlers();
    }

    if (event.data && event.data.action && event.data.action !== 'init') {
      if (this.messageHandlers[event.data.action]) {
        this.messageHandlers[event.data.action](event.data);
      }
    }
  };
};

exports['default'] = function (self) {
  return new Worker(self);
};

module.exports = exports['default'];