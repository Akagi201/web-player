/**
 * @file videojs-contrib-hls.js
 *
 * The main file for the HLS project.
 * License: https://github.com/videojs/videojs-contrib-hls/blob/master/LICENSE
 */
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _globalDocument = require('global/document');

var _globalDocument2 = _interopRequireDefault(_globalDocument);

var _playlistLoader = require('./playlist-loader');

var _playlistLoader2 = _interopRequireDefault(_playlistLoader);

var _playlist = require('./playlist');

var _playlist2 = _interopRequireDefault(_playlist);

var _xhr = require('./xhr');

var _xhr2 = _interopRequireDefault(_xhr);

var _decrypter = require('./decrypter');

var _binUtils = require('./bin-utils');

var _binUtils2 = _interopRequireDefault(_binUtils);

var _videojsContribMediaSources = require('videojs-contrib-media-sources');

var _m3u8 = require('./m3u8');

var _m3u82 = _interopRequireDefault(_m3u8);

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var _masterPlaylistController = require('./master-playlist-controller');

var _masterPlaylistController2 = _interopRequireDefault(_masterPlaylistController);

/**
 * determine if an object a is differnt from
 * and object b. both only having one dimensional
 * properties
 *
 * @param {Object} a object one
 * @param {Object} b object two
 * @return {Boolean} if the object has changed or not
 */
var objectChanged = function objectChanged(a, b) {
  if (typeof a !== typeof b) {
    return true;
  }
  // if we have a different number of elements
  // something has changed
  if (Object.keys(a).length !== Object.keys(b).length) {
    return true;
  }

  for (var prop in a) {
    if (!b[prop] || a[prop] !== b[prop]) {
      return true;
    }
  }
  return false;
};

var Hls = {
  PlaylistLoader: _playlistLoader2['default'],
  Playlist: _playlist2['default'],
  Decrypter: _decrypter.Decrypter,
  AsyncStream: _decrypter.AsyncStream,
  decrypt: _decrypter.decrypt,
  utils: _binUtils2['default'],
  xhr: (0, _xhr2['default'])()
};

// the desired length of video to maintain in the buffer, in seconds
Hls.GOAL_BUFFER_LENGTH = 30;

// A fudge factor to apply to advertised playlist bitrates to account for
// temporary flucations in client bandwidth
var BANDWIDTH_VARIANCE = 1.2;

/**
 * Returns the CSS value for the specified property on an element
 * using `getComputedStyle`. Firefox has a long-standing issue where
 * getComputedStyle() may return null when running in an iframe with
 * `display: none`.
 *
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=548397
 * @param {HTMLElement} el the htmlelement to work on
 * @param {string} the proprety to get the style for
 */
var safeGetComputedStyle = function safeGetComputedStyle(el, property) {
  var result = undefined;

  if (!el) {
    return '';
  }

  result = getComputedStyle(el);
  if (!result) {
    return '';
  }

  return result[property];
};

/**
 * Chooses the appropriate media playlist based on the current
 * bandwidth estimate and the player size.
 *
 * @return {Playlist} the highest bitrate playlist less than the currently detected
 * bandwidth, accounting for some amount of bandwidth variance
 */
Hls.STANDARD_PLAYLIST_SELECTOR = function () {
  var effectiveBitrate = undefined;
  var sortedPlaylists = this.playlists.master.playlists.slice();
  var bandwidthPlaylists = [];
  var now = +new Date();
  var i = undefined;
  var variant = undefined;
  var bandwidthBestVariant = undefined;
  var resolutionPlusOne = undefined;
  var resolutionPlusOneAttribute = undefined;
  var resolutionBestVariant = undefined;
  var width = undefined;
  var height = undefined;

  sortedPlaylists.sort(Hls.comparePlaylistBandwidth);

  // filter out any playlists that have been excluded due to
  // incompatible configurations or playback errors
  sortedPlaylists = sortedPlaylists.filter(function (localVariant) {
    if (typeof localVariant.excludeUntil !== 'undefined') {
      return now >= localVariant.excludeUntil;
    }
    return true;
  });

  // filter out any variant that has greater effective bitrate
  // than the current estimated bandwidth
  i = sortedPlaylists.length;
  while (i--) {
    variant = sortedPlaylists[i];

    // ignore playlists without bandwidth information
    if (!variant.attributes || !variant.attributes.BANDWIDTH) {
      continue;
    }

    effectiveBitrate = variant.attributes.BANDWIDTH * BANDWIDTH_VARIANCE;

    if (effectiveBitrate < this.bandwidth) {
      bandwidthPlaylists.push(variant);

      // since the playlists are sorted in ascending order by
      // bandwidth, the first viable variant is the best
      if (!bandwidthBestVariant) {
        bandwidthBestVariant = variant;
      }
    }
  }

  i = bandwidthPlaylists.length;

  // sort variants by resolution
  bandwidthPlaylists.sort(Hls.comparePlaylistResolution);

  // forget our old variant from above,
  // or we might choose that in high-bandwidth scenarios
  // (this could be the lowest bitrate rendition as  we go through all of them above)
  variant = null;

  width = parseInt(safeGetComputedStyle(this.tech_.el(), 'width'), 10);
  height = parseInt(safeGetComputedStyle(this.tech_.el(), 'height'), 10);

  // iterate through the bandwidth-filtered playlists and find
  // best rendition by player dimension
  while (i--) {
    variant = bandwidthPlaylists[i];

    // ignore playlists without resolution information
    if (!variant.attributes || !variant.attributes.RESOLUTION || !variant.attributes.RESOLUTION.width || !variant.attributes.RESOLUTION.height) {
      continue;
    }

    // since the playlists are sorted, the first variant that has
    // dimensions less than or equal to the player size is the best
    var variantResolution = variant.attributes.RESOLUTION;

    if (variantResolution.width === width && variantResolution.height === height) {
      // if we have the exact resolution as the player use it
      resolutionPlusOne = null;
      resolutionBestVariant = variant;
      break;
    } else if (variantResolution.width < width && variantResolution.height < height) {
      // if both dimensions are less than the player use the
      // previous (next-largest) variant
      break;
    } else if (!resolutionPlusOne || variantResolution.width < resolutionPlusOneAttribute.width && variantResolution.height < resolutionPlusOneAttribute.height) {
      // If we still haven't found a good match keep a
      // reference to the previous variant for the next loop
      // iteration

      // By only saving variants if they are smaller than the
      // previously saved variant, we ensure that we also pick
      // the highest bandwidth variant that is just-larger-than
      // the video player
      resolutionPlusOne = variant;
      resolutionPlusOneAttribute = resolutionPlusOne.attributes.RESOLUTION;
    }
  }

  // fallback chain of variants
  return resolutionPlusOne || resolutionBestVariant || bandwidthBestVariant || sortedPlaylists[0];
};

// HLS is a source handler, not a tech. Make sure attempts to use it
// as one do not cause exceptions.
Hls.canPlaySource = function () {
  return _videoJs2['default'].log.warn('HLS is no longer a tech. Please remove it from ' + 'your player\'s techOrder.');
};

/**
 * Whether the browser has built-in HLS support.
 */
Hls.supportsNativeHls = (function () {
  var video = _globalDocument2['default'].createElement('video');

  // native HLS is definitely not supported if HTML5 video isn't
  if (!_videoJs2['default'].getComponent('Html5').isSupported()) {
    return false;
  }

  // HLS manifests can go by many mime-types
  var canPlay = [
  // Apple santioned
  'application/vnd.apple.mpegurl',
  // Apple sanctioned for backwards compatibility
  'audio/mpegurl',
  // Very common
  'audio/x-mpegurl',
  // Very common
  'application/x-mpegurl',
  // Included for completeness
  'video/x-mpegurl', 'video/mpegurl', 'application/mpegurl'];

  return canPlay.some(function (canItPlay) {
    return (/maybe|probably/i.test(video.canPlayType(canItPlay))
    );
  });
})();

/**
 * HLS is a source handler, not a tech. Make sure attempts to use it
 * as one do not cause exceptions.
 */
Hls.isSupported = function () {
  return _videoJs2['default'].log.warn('HLS is no longer a tech. Please remove it from ' + 'your player\'s techOrder.');
};

var Component = _videoJs2['default'].getComponent('Component');

/**
 * The Hls Handler object, where we orchestrate all of the parts
 * of HLS to interact with video.js
 *
 * @class HlsHandler
 * @extends videojs.Component
 * @param {Object} source the soruce object
 * @param {Tech} tech the parent tech object
 * @param {Object} options optional and required options
 */

var HlsHandler = (function (_Component) {
  _inherits(HlsHandler, _Component);

  function HlsHandler(source, tech, options) {
    var _this = this;

    _classCallCheck(this, HlsHandler);

    _get(Object.getPrototypeOf(HlsHandler.prototype), 'constructor', this).call(this, tech);

    // tech.player() is deprecated but setup a reference to HLS for
    // backwards-compatibility
    if (tech.options_ && tech.options_.playerId) {
      var _player = (0, _videoJs2['default'])(tech.options_.playerId);

      if (!_player.hasOwnProperty('hls')) {
        Object.defineProperty(_player, 'hls', {
          get: function get() {
            _videoJs2['default'].log.warn('player.hls is deprecated. Use player.tech.hls instead.');
            return _this;
          }
        });
      }
    }

    this.options_ = _videoJs2['default'].mergeOptions(_videoJs2['default'].options.hls || {}, options.hls);
    this.tech_ = tech;
    this.source_ = source;

    // start playlist selection at a reasonable bandwidth for
    // broadband internet
    // 0.5 Mbps
    this.bandwidth = this.options_.bandwidth || 4194304;
    this.bytesReceived = 0;

    // listen for fullscreenchange events for this player so that we
    // can adjust our quality selection quickly
    this.on(_globalDocument2['default'], ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'], function (event) {
      var fullscreenElement = _globalDocument2['default'].fullscreenElement || _globalDocument2['default'].webkitFullscreenElement || _globalDocument2['default'].mozFullScreenElement || _globalDocument2['default'].msFullscreenElement;

      if (fullscreenElement && fullscreenElement.contains(_this.tech_.el())) {
        _this.masterPlaylistController_.fastQualityChange_();
      }
    });

    this.on(this.tech_, 'seeking', function () {
      this.setCurrentTime(this.tech_.currentTime());
    });
    this.on(this.tech_, 'error', function () {
      if (this.masterPlaylistController_) {
        this.masterPlaylistController_.pauseLoading();
      }
    });

    this.audioTrackChange_ = function () {
      _this.masterPlaylistController_.useAudio();
    };

    this.on(this.tech_, 'play', this.play);
  }

  /**
   * The Source Handler object, which informs video.js what additional
   * MIME types are supported and sets up playback. It is registered
   * automatically to the appropriate tech based on the capabilities of
   * the browser it is running in. It is not necessary to use or modify
   * this object in normal usage.
   */

  /**
   * called when player.src gets called, handle a new source
   *
   * @param {Object} src the source object to handle
   */

  _createClass(HlsHandler, [{
    key: 'src',
    value: function src(_src) {
      var _this2 = this;

      // do nothing if the src is falsey
      if (!_src) {
        return;
      }

      ['withCredentials', 'bandwidth'].forEach(function (option) {
        if (typeof _this2.source_[option] !== 'undefined') {
          _this2.options_[option] = _this2.source_[option];
        }
      });
      this.options_.url = this.source_.src;
      this.options_.tech = this.tech_;
      this.options_.externHls = Hls;
      this.options_.bandwidth = this.bandwidth;
      this.masterPlaylistController_ = new _masterPlaylistController2['default'](this.options_);
      // `this` in selectPlaylist should be the HlsHandler for backwards
      // compatibility with < v2
      this.masterPlaylistController_.selectPlaylist = Hls.STANDARD_PLAYLIST_SELECTOR.bind(this);

      // re-expose some internal objects for backwards compatibility with < v2
      this.playlists = this.masterPlaylistController_.masterPlaylistLoader_;
      this.mediaSource = this.masterPlaylistController_.mediaSource;

      // Proxy assignment of some properties to the master playlist
      // controller. Using a custom property for backwards compatibility
      // with < v2
      Object.defineProperties(this, {
        selectPlaylist: {
          get: function get() {
            return this.masterPlaylistController_.selectPlaylist;
          },
          set: function set(selectPlaylist) {
            this.masterPlaylistController_.selectPlaylist = selectPlaylist.bind(this);
          }
        },
        bandwidth: {
          get: function get() {
            return this.masterPlaylistController_.mainSegmentLoader_.bandwidth;
          },
          set: function set(bandwidth) {
            this.masterPlaylistController_.mainSegmentLoader_.bandwidth = bandwidth;
          }
        }
      });

      this.tech_.one('canplay', this.masterPlaylistController_.setupFirstPlay.bind(this.masterPlaylistController_));

      this.masterPlaylistController_.on('sourceopen', function () {
        _this2.tech_.audioTracks().addEventListener('change', _this2.audioTrackChange_);
      });

      this.masterPlaylistController_.on('audioinfo', function (e) {
        if (!_videoJs2['default'].browser.IS_FIREFOX || !_this2.audioInfo_ || !objectChanged(_this2.audioInfo_, e.info)) {
          _this2.audioInfo_ = e.info;
          return;
        }

        var error = 'had different audio properties (channels, sample rate, etc.) ' + 'or changed in some other way.  This behavior is currently ' + 'unsupported in Firefox due to an issue: \n\n' + 'https://bugzilla.mozilla.org/show_bug.cgi?id=1247138\n\n';

        var enabledTrack = undefined;
        var defaultTrack = undefined;

        _this2.masterPlaylistController_.audioTracks_.forEach(function (t) {
          if (!defaultTrack && t['default']) {
            defaultTrack = t;
          }

          if (!enabledTrack && t.enabled) {
            enabledTrack = t;
          }
        });

        // they did not switch audiotracks
        // blacklist the current playlist
        if (!enabledTrack.getLoader(_this2.activeAudioGroup_())) {
          error = 'The rendition that we tried to switch to ' + error + 'Unfortunately that means we will have to blacklist ' + 'the current playlist and switch to another. Sorry!';
          _this2.masterPlaylistController_.blacklistCurrentPlaylist();
        } else {
          error = 'The audio track \'' + enabledTrack.label + '\' that we tried to ' + ('switch to ' + error + ' Unfortunately this means we will have to ') + ('return you to the main track \'' + defaultTrack.label + '\'. Sorry!');
          defaultTrack.enabled = true;
          _this2.tech_.audioTracks().removeTrack(enabledTrack);
        }

        _videoJs2['default'].log.warn(error);
        _this2.masterPlaylistController_.useAudio();
      });
      this.masterPlaylistController_.on('selectedinitialmedia', function () {
        // clear current audioTracks
        _this2.tech_.clearTracks('audio');
        _this2.masterPlaylistController_.audioTracks_.forEach(function (track) {
          _this2.tech_.audioTracks().addTrack(track);
        });
      });

      // the bandwidth of the primary segment loader is our best
      // estimate of overall bandwidth
      this.on(this.masterPlaylistController_, 'progress', function () {
        this.bandwidth = this.masterPlaylistController_.mainSegmentLoader_.bandwidth;
        this.tech_.trigger('progress');
      });

      // do nothing if the tech has been disposed already
      // this can occur if someone sets the src in player.ready(), for instance
      if (!this.tech_.el()) {
        return;
      }

      this.tech_.src(_videoJs2['default'].URL.createObjectURL(this.masterPlaylistController_.mediaSource));
    }

    /**
     * a helper for grabbing the active audio group from MasterPlaylistController
     *
     * @private
     */
  }, {
    key: 'activeAudioGroup_',
    value: function activeAudioGroup_() {
      return this.masterPlaylistController_.activeAudioGroup();
    }

    /**
     * Begin playing the video.
     */
  }, {
    key: 'play',
    value: function play() {
      this.masterPlaylistController_.play();
    }

    /**
     * a wrapper around the function in MasterPlaylistController
     */
  }, {
    key: 'setCurrentTime',
    value: function setCurrentTime(currentTime) {
      this.masterPlaylistController_.setCurrentTime(currentTime);
    }

    /**
     * a wrapper around the function in MasterPlaylistController
     */
  }, {
    key: 'duration',
    value: function duration() {
      return this.masterPlaylistController_.duration();
    }

    /**
     * a wrapper around the function in MasterPlaylistController
     */
  }, {
    key: 'seekable',
    value: function seekable() {
      return this.masterPlaylistController_.seekable();
    }

    /**
    * Abort all outstanding work and cleanup.
    */
  }, {
    key: 'dispose',
    value: function dispose() {
      if (this.masterPlaylistController_) {
        this.masterPlaylistController_.dispose();
      }
      this.tech_.audioTracks().removeEventListener('change', this.audioTrackChange_);

      _get(Object.getPrototypeOf(HlsHandler.prototype), 'dispose', this).call(this);
    }
  }]);

  return HlsHandler;
})(Component);

var HlsSourceHandler = function HlsSourceHandler(mode) {
  return {
    canHandleSource: function canHandleSource(srcObj) {
      // this forces video.js to skip this tech/mode if its not the one we have been
      // overriden to use, by returing that we cannot handle the source.
      if (_videoJs2['default'].options.hls && _videoJs2['default'].options.hls.mode && _videoJs2['default'].options.hls.mode !== mode) {
        return false;
      }
      return HlsSourceHandler.canPlayType(srcObj.type);
    },
    handleSource: function handleSource(source, tech, options) {
      if (mode === 'flash') {
        // We need to trigger this asynchronously to give others the chance
        // to bind to the event when a source is set at player creation
        tech.setTimeout(function () {
          tech.trigger('loadstart');
        }, 1);
      }

      var settings = _videoJs2['default'].mergeOptions(options, { hls: { mode: mode } });

      tech.hls = new HlsHandler(source, tech, settings);

      tech.hls.xhr = (0, _xhr2['default'])();
      // Use a global `before` function if specified on videojs.Hls.xhr
      // but still allow for a per-player override
      if (_videoJs2['default'].Hls.xhr.beforeRequest) {
        tech.hls.xhr.beforeRequest = _videoJs2['default'].Hls.xhr.beforeRequest;
      }

      tech.hls.src(source.src);
      return tech.hls;
    },
    canPlayType: function canPlayType(type) {
      if (HlsSourceHandler.canPlayType(type)) {
        return 'maybe';
      }
      return '';
    }
  };
};

/**
 * A comparator function to sort two playlist object by bandwidth.
 *
 * @param {Object} left a media playlist object
 * @param {Object} right a media playlist object
 * @return {Number} Greater than zero if the bandwidth attribute of
 * left is greater than the corresponding attribute of right. Less
 * than zero if the bandwidth of right is greater than left and
 * exactly zero if the two are equal.
 */
Hls.comparePlaylistBandwidth = function (left, right) {
  var leftBandwidth = undefined;
  var rightBandwidth = undefined;

  if (left.attributes && left.attributes.BANDWIDTH) {
    leftBandwidth = left.attributes.BANDWIDTH;
  }
  leftBandwidth = leftBandwidth || window.Number.MAX_VALUE;
  if (right.attributes && right.attributes.BANDWIDTH) {
    rightBandwidth = right.attributes.BANDWIDTH;
  }
  rightBandwidth = rightBandwidth || window.Number.MAX_VALUE;

  return leftBandwidth - rightBandwidth;
};

/**
 * A comparator function to sort two playlist object by resolution (width).
 * @param {Object} left a media playlist object
 * @param {Object} right a media playlist object
 * @return {Number} Greater than zero if the resolution.width attribute of
 * left is greater than the corresponding attribute of right. Less
 * than zero if the resolution.width of right is greater than left and
 * exactly zero if the two are equal.
 */
Hls.comparePlaylistResolution = function (left, right) {
  var leftWidth = undefined;
  var rightWidth = undefined;

  if (left.attributes && left.attributes.RESOLUTION && left.attributes.RESOLUTION.width) {
    leftWidth = left.attributes.RESOLUTION.width;
  }

  leftWidth = leftWidth || window.Number.MAX_VALUE;

  if (right.attributes && right.attributes.RESOLUTION && right.attributes.RESOLUTION.width) {
    rightWidth = right.attributes.RESOLUTION.width;
  }

  rightWidth = rightWidth || window.Number.MAX_VALUE;

  // NOTE - Fallback to bandwidth sort as appropriate in cases where multiple renditions
  // have the same media dimensions/ resolution
  if (leftWidth === rightWidth && left.attributes.BANDWIDTH && right.attributes.BANDWIDTH) {
    return left.attributes.BANDWIDTH - right.attributes.BANDWIDTH;
  }
  return leftWidth - rightWidth;
};

HlsSourceHandler.canPlayType = function (type) {
  var mpegurlRE = /^(audio|video|application)\/(x-|vnd\.apple\.)?mpegurl/i;

  // favor native HLS support if it's available
  if (Hls.supportsNativeHls) {
    return false;
  }
  return mpegurlRE.test(type);
};

if (typeof _videoJs2['default'].MediaSource === 'undefined' || typeof _videoJs2['default'].URL === 'undefined') {
  _videoJs2['default'].MediaSource = _videojsContribMediaSources.MediaSource;
  _videoJs2['default'].URL = _videojsContribMediaSources.URL;
}

// register source handlers with the appropriate techs
if (_videojsContribMediaSources.MediaSource.supportsNativeMediaSources()) {
  _videoJs2['default'].getComponent('Html5').registerSourceHandler(HlsSourceHandler('html5'));
}
if (window.Uint8Array) {
  _videoJs2['default'].getComponent('Flash').registerSourceHandler(HlsSourceHandler('flash'));
}

_videoJs2['default'].HlsHandler = HlsHandler;
_videoJs2['default'].HlsSourceHandler = HlsSourceHandler;
_videoJs2['default'].Hls = Hls;
_videoJs2['default'].m3u8 = _m3u82['default'];
_videoJs2['default'].registerComponent('Hls', Hls);
_videoJs2['default'].options.hls = _videoJs2['default'].options.hls || {};

module.exports = {
  Hls: Hls,
  HlsHandler: HlsHandler,
  HlsSourceHandler: HlsSourceHandler
};