/**
 * @file flash-source-buffer.js
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var _muxJs = require('mux.js');

var _muxJs2 = _interopRequireDefault(_muxJs);

var _removeCuesFromTrack = require('./remove-cues-from-track');

var _removeCuesFromTrack2 = _interopRequireDefault(_removeCuesFromTrack);

var _createTextTracksIfNecessary = require('./create-text-tracks-if-necessary');

var _createTextTracksIfNecessary2 = _interopRequireDefault(_createTextTracksIfNecessary);

var _addTextTrackData = require('./add-text-track-data');

var _addTextTrackData2 = _interopRequireDefault(_addTextTrackData);

var _flashConstants = require('./flash-constants');

var _flashConstants2 = _interopRequireDefault(_flashConstants);

/**
 * A wrapper around the setTimeout function that uses
 * the flash constant time between ticks value.
 *
 * @param {Function} func the function callback to run
 * @private
 */
var scheduleTick = function scheduleTick(func) {
  // Chrome doesn't invoke requestAnimationFrame callbacks
  // in background tabs, so use setTimeout.
  window.setTimeout(func, _flashConstants2['default'].TIME_BETWEEN_TICKS);
};

/**
 * Round a number to a specified number of places much like
 * toFixed but return a number instead of a string representation.
 *
 * @param {Number} num A number
 * @param {Number} places The number of decimal places which to
 * round
 * @private
 */
var toDecimalPlaces = function toDecimalPlaces(num, places) {
  if (typeof places !== 'number' || places < 0) {
    places = 0;
  }

  var scale = Math.pow(10, places);

  return Math.round(num * scale) / scale;
};

/**
 * A SourceBuffer implementation for Flash rather than HTML.
 *
 * @link https://developer.mozilla.org/en-US/docs/Web/API/MediaSource
 * @param {Object} mediaSource the flash media source
 * @class FlashSourceBuffer
 * @extends videojs.EventTarget
 */

var FlashSourceBuffer = (function (_videojs$EventTarget) {
  _inherits(FlashSourceBuffer, _videojs$EventTarget);

  function FlashSourceBuffer(mediaSource) {
    var _this = this;

    _classCallCheck(this, FlashSourceBuffer);

    _get(Object.getPrototypeOf(FlashSourceBuffer.prototype), 'constructor', this).call(this);
    var encodedHeader = undefined;

    // Start off using the globally defined value but refine
    // as we append data into flash
    this.chunkSize_ = _flashConstants2['default'].BYTES_PER_CHUNK;

    // byte arrays queued to be appended
    this.buffer_ = [];

    // the total number of queued bytes
    this.bufferSize_ = 0;

    // to be able to determine the correct position to seek to, we
    // need to retain information about the mapping between the
    // media timeline and PTS values
    this.basePtsOffset_ = NaN;

    this.mediaSource = mediaSource;

    // indicates whether the asynchronous continuation of an operation
    // is still being processed
    // see https://w3c.github.io/media-source/#widl-SourceBuffer-updating
    this.updating = false;
    this.timestampOffset_ = 0;

    // TS to FLV transmuxer
    this.segmentParser_ = new _muxJs2['default'].flv.Transmuxer();
    this.segmentParser_.on('data', this.receiveBuffer_.bind(this));
    encodedHeader = window.btoa(String.fromCharCode.apply(null, Array.prototype.slice.call(this.segmentParser_.getFlvHeader())));
    this.mediaSource.swfObj.vjs_appendBuffer(encodedHeader);

    Object.defineProperty(this, 'timestampOffset', {
      get: function get() {
        return this.timestampOffset_;
      },
      set: function set(val) {
        if (typeof val === 'number' && val >= 0) {
          this.timestampOffset_ = val;
          this.segmentParser_ = new _muxJs2['default'].flv.Transmuxer();
          this.segmentParser_.on('data', this.receiveBuffer_.bind(this));
          // We have to tell flash to expect a discontinuity
          this.mediaSource.swfObj.vjs_discontinuity();
          // the media <-> PTS mapping must be re-established after
          // the discontinuity
          this.basePtsOffset_ = NaN;
        }
      }
    });

    Object.defineProperty(this, 'buffered', {
      get: function get() {
        if (!this.mediaSource || !this.mediaSource.swfObj || !('vjs_getProperty' in this.mediaSource.swfObj)) {
          return _videoJs2['default'].createTimeRange();
        }

        var buffered = this.mediaSource.swfObj.vjs_getProperty('buffered');

        if (buffered && buffered.length) {
          buffered[0][0] = toDecimalPlaces(buffered[0][0], 3);
          buffered[0][1] = toDecimalPlaces(buffered[0][1], 3);
        }
        return _videoJs2['default'].createTimeRanges(buffered);
      }
    });

    // On a seek we remove all text track data since flash has no concept
    // of a buffered-range and everything else is reset on seek
    this.mediaSource.player_.on('seeked', function () {
      (0, _removeCuesFromTrack2['default'])(0, Infinity, _this.metadataTrack_);
      (0, _removeCuesFromTrack2['default'])(0, Infinity, _this.inbandTextTrack_);
    });
  }

  /**
   * Append bytes to the sourcebuffers buffer, in this case we
   * have to append it to swf object.
   *
   * @link https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer/appendBuffer
   * @param {Array} bytes
   */

  _createClass(FlashSourceBuffer, [{
    key: 'appendBuffer',
    value: function appendBuffer(bytes) {
      var _this2 = this;

      var error = undefined;
      var chunk = 512 * 1024;
      var i = 0;

      if (this.updating) {
        error = new Error('SourceBuffer.append() cannot be called ' + 'while an update is in progress');
        error.name = 'InvalidStateError';
        error.code = 11;
        throw error;
      }

      this.updating = true;
      this.mediaSource.readyState = 'open';
      this.trigger({ type: 'update' });

      // this is here to use recursion
      var chunkInData = function chunkInData() {
        _this2.segmentParser_.push(bytes.subarray(i, i + chunk));
        i += chunk;
        if (i < bytes.byteLength) {
          scheduleTick(chunkInData);
        } else {
          scheduleTick(_this2.segmentParser_.flush.bind(_this2.segmentParser_));
        }
      };

      chunkInData();
    }

    /**
     * Reset the parser and remove any data queued to be sent to the SWF.
     *
     * @link https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer/abort
     */
  }, {
    key: 'abort',
    value: function abort() {
      this.buffer_ = [];
      this.bufferSize_ = 0;
      this.mediaSource.swfObj.vjs_abort();

      // report any outstanding updates have ended
      if (this.updating) {
        this.updating = false;
        this.trigger({ type: 'updateend' });
      }
    }

    /**
     * Flash cannot remove ranges already buffered in the NetStream
     * but seeking clears the buffer entirely. For most purposes,
     * having this operation act as a no-op is acceptable.
     *
     * @link https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer/remove
     * @param {Double} start start of the section to remove
     * @param {Double} end end of the section to remove
     */
  }, {
    key: 'remove',
    value: function remove(start, end) {
      (0, _removeCuesFromTrack2['default'])(start, end, this.metadataTrack_);
      (0, _removeCuesFromTrack2['default'])(start, end, this.inbandTextTrack_);
      this.trigger({ type: 'update' });
      this.trigger({ type: 'updateend' });
    }

    /**
     * Receive a buffer from the flv.
     *
     * @param {Object} segment
     * @private
     */
  }, {
    key: 'receiveBuffer_',
    value: function receiveBuffer_(segment) {
      var _this3 = this;

      // create an in-band caption track if one is present in the segment
      (0, _createTextTracksIfNecessary2['default'])(this, this.mediaSource, segment);
      (0, _addTextTrackData2['default'])(this, segment.captions, segment.metadata);

      // Do this asynchronously since convertTagsToData_ can be time consuming
      scheduleTick(function () {
        var flvBytes = _this3.convertTagsToData_(segment);

        if (_this3.buffer_.length === 0) {
          scheduleTick(_this3.processBuffer_.bind(_this3));
        }

        if (flvBytes) {
          _this3.buffer_.push(flvBytes);
          _this3.bufferSize_ += flvBytes.byteLength;
        }
      });
    }

    /**
     * Append a portion of the current buffer to the SWF.
     *
     * @private
     */
  }, {
    key: 'processBuffer_',
    value: function processBuffer_() {
      var chunk = undefined;
      var i = undefined;
      var length = undefined;
      var binary = undefined;
      var b64str = undefined;
      var startByte = 0;
      var appendIterations = 0;
      var startTime = +new Date();
      var appendTime = undefined;

      if (!this.buffer_.length) {
        if (this.updating !== false) {
          this.updating = false;
          this.trigger({ type: 'updateend' });
        }
        // do nothing if the buffer is empty
        return;
      }

      do {
        appendIterations++;
        // concatenate appends up to the max append size
        chunk = this.buffer_[0].subarray(startByte, startByte + this.chunkSize_);

        // requeue any bytes that won't make it this round
        if (chunk.byteLength < this.chunkSize_ || this.buffer_[0].byteLength === startByte + this.chunkSize_) {
          startByte = 0;
          this.buffer_.shift();
        } else {
          startByte += this.chunkSize_;
        }

        this.bufferSize_ -= chunk.byteLength;

        // base64 encode the bytes
        binary = '';
        length = chunk.byteLength;
        for (i = 0; i < length; i++) {
          binary += String.fromCharCode(chunk[i]);
        }
        b64str = window.btoa(binary);

        // bypass normal ExternalInterface calls and pass xml directly
        // IE can be slow by default
        this.mediaSource.swfObj.CallFunction('<invoke name="vjs_appendBuffer"' + 'returntype="javascript"><arguments><string>' + b64str + '</string></arguments></invoke>');
        appendTime = new Date() - startTime;
      } while (this.buffer_.length && appendTime < _flashConstants2['default'].TIME_PER_TICK);

      if (this.buffer_.length && startByte) {
        this.buffer_[0] = this.buffer_[0].subarray(startByte);
      }

      if (appendTime >= _flashConstants2['default'].TIME_PER_TICK) {
        // We want to target 4 iterations per time-slot so that gives us
        // room to adjust to changes in Flash load and other externalities
        // such as garbage collection while still maximizing throughput
        this.chunkSize_ = Math.floor(this.chunkSize_ * (appendIterations / 4));
      }

      // We also make sure that the chunk-size doesn't drop below 1KB or
      // go above 1MB as a sanity check
      this.chunkSize_ = Math.max(_flashConstants2['default'].MIN_CHUNK, Math.min(this.chunkSize_, _flashConstants2['default'].MAX_CHUNK));

      // schedule another append if necessary
      if (this.bufferSize_ !== 0) {
        scheduleTick(this.processBuffer_.bind(this));
      } else {
        this.updating = false;
        this.trigger({ type: 'updateend' });
      }
    }

    /**
     * Turns an array of flv tags into a Uint8Array representing the
     * flv data. Also removes any tags that are before the current
     * time so that playback begins at or slightly after the right
     * place on a seek
     *
     * @private
     * @param {Object} segmentData object of segment data
     */
  }, {
    key: 'convertTagsToData_',
    value: function convertTagsToData_(segmentData) {
      var segmentByteLength = 0;
      var tech = this.mediaSource.tech_;
      var targetPts = 0;
      var i = undefined;
      var j = undefined;
      var segment = undefined;
      var filteredTags = [];
      var tags = this.getOrderedTags_(segmentData);

      // Establish the media timeline to PTS translation if we don't
      // have one already
      if (isNaN(this.basePtsOffset_) && tags.length) {
        this.basePtsOffset_ = tags[0].pts;
      }

      // Trim any tags that are before the end of the end of
      // the current buffer
      if (tech.buffered().length) {
        targetPts = tech.buffered().end(0) - this.timestampOffset;
      }
      // Trim to currentTime if it's ahead of buffered or buffered doesn't exist
      targetPts = Math.max(targetPts, tech.currentTime() - this.timestampOffset);

      // PTS values are represented in milliseconds
      targetPts *= 1e3;
      targetPts += this.basePtsOffset_;

      // skip tags with a presentation time less than the seek target
      for (i = 0; i < tags.length; i++) {
        if (tags[i].pts >= targetPts) {
          filteredTags.push(tags[i]);
        }
      }

      if (filteredTags.length === 0) {
        return;
      }

      // concatenate the bytes into a single segment
      for (i = 0; i < filteredTags.length; i++) {
        segmentByteLength += filteredTags[i].bytes.byteLength;
      }
      segment = new Uint8Array(segmentByteLength);
      for (i = 0, j = 0; i < filteredTags.length; i++) {
        segment.set(filteredTags[i].bytes, j);
        j += filteredTags[i].bytes.byteLength;
      }

      return segment;
    }

    /**
     * Assemble the FLV tags in decoder order.
     *
     * @private
     * @param {Object} segmentData object of segment data
     */
  }, {
    key: 'getOrderedTags_',
    value: function getOrderedTags_(segmentData) {
      var videoTags = segmentData.tags.videoTags;
      var audioTags = segmentData.tags.audioTags;
      var tag = undefined;
      var tags = [];

      while (videoTags.length || audioTags.length) {
        if (!videoTags.length) {
          // only audio tags remain
          tag = audioTags.shift();
        } else if (!audioTags.length) {
          // only video tags remain
          tag = videoTags.shift();
        } else if (audioTags[0].dts < videoTags[0].dts) {
          // audio should be decoded next
          tag = audioTags.shift();
        } else {
          // video should be decoded next
          tag = videoTags.shift();
        }

        tags.push(tag.finalize());
      }

      return tags;
    }
  }]);

  return FlashSourceBuffer;
})(_videoJs2['default'].EventTarget);

exports['default'] = FlashSourceBuffer;
module.exports = exports['default'];