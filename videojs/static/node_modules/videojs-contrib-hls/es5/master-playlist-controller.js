/**
 * @file master-playlist-controller.js
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x2, _x3, _x4) { var _again = true; _function: while (_again) { var object = _x2, property = _x3, receiver = _x4; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x2 = parent; _x3 = property; _x4 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _playlistLoader = require('./playlist-loader');

var _playlistLoader2 = _interopRequireDefault(_playlistLoader);

var _segmentLoader = require('./segment-loader');

var _segmentLoader2 = _interopRequireDefault(_segmentLoader);

var _ranges = require('./ranges');

var _ranges2 = _interopRequireDefault(_ranges);

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var _hlsAudioTrack = require('./hls-audio-track');

var _hlsAudioTrack2 = _interopRequireDefault(_hlsAudioTrack);

// 5 minute blacklist
var BLACKLIST_DURATION = 5 * 60 * 1000;
var Hls = undefined;

var parseCodecs = function parseCodecs(codecs) {
  var result = {
    codecCount: 0,
    videoCodec: null,
    audioProfile: null
  };

  result.codecCount = codecs.split(',').length;
  result.codecCount = result.codecCount || 2;

  // parse the video codec but ignore the version
  result.videoCodec = /(^|\s|,)+(avc1)[^ ,]*/i.exec(codecs);
  result.videoCodec = result.videoCodec && result.videoCodec[2];

  // parse the last field of the audio codec
  result.audioProfile = /(^|\s|,)+mp4a.\d+\.(\d+)/i.exec(codecs);
  result.audioProfile = result.audioProfile && result.audioProfile[2];

  return result;
};

/**
 * the master playlist controller controller all interactons
 * between playlists and segmentloaders. At this time this mainly
 * involves a master playlist and a series of audio playlists
 * if they are available
 *
 * @class MasterPlaylistController
 * @extends videojs.EventTarget
 */

var MasterPlaylistController = (function (_videojs$EventTarget) {
  _inherits(MasterPlaylistController, _videojs$EventTarget);

  function MasterPlaylistController(_ref) {
    var _this = this;

    var url = _ref.url;
    var withCredentials = _ref.withCredentials;
    var mode = _ref.mode;
    var tech = _ref.tech;
    var bandwidth = _ref.bandwidth;
    var externHls = _ref.externHls;

    _classCallCheck(this, MasterPlaylistController);

    _get(Object.getPrototypeOf(MasterPlaylistController.prototype), 'constructor', this).call(this);

    Hls = externHls;

    this.withCredentials = withCredentials;
    this.tech_ = tech;
    this.hls_ = tech.hls;
    this.mode_ = mode;
    this.audioTracks_ = [];

    this.mediaSource = new _videoJs2['default'].MediaSource({ mode: mode });
    this.mediaSource.on('audioinfo', function (e) {
      return _this.trigger(e);
    });
    // load the media source into the player
    this.mediaSource.addEventListener('sourceopen', this.handleSourceOpen_.bind(this));

    var segmentLoaderOptions = {
      hls: this.hls_,
      mediaSource: this.mediaSource,
      currentTime: this.tech_.currentTime.bind(this.tech_),
      withCredentials: this.withCredentials,
      seekable: function seekable() {
        return _this.seekable();
      },
      seeking: function seeking() {
        return _this.tech_.seeking();
      },
      setCurrentTime: function setCurrentTime(a) {
        return _this.setCurrentTime(a);
      },
      hasPlayed: function hasPlayed() {
        return _this.tech_.played().length !== 0;
      },
      bandwidth: bandwidth
    };

    // combined audio/video or just video when alternate audio track is selected
    this.mainSegmentLoader_ = new _segmentLoader2['default'](segmentLoaderOptions);
    // alternate audio track
    this.audioSegmentLoader_ = new _segmentLoader2['default'](segmentLoaderOptions);

    if (!url) {
      throw new Error('A non-empty playlist URL is required');
    }

    this.masterPlaylistLoader_ = new _playlistLoader2['default'](url, this.hls_, this.withCredentials);

    this.masterPlaylistLoader_.on('loadedmetadata', function () {
      var media = _this.masterPlaylistLoader_.media();

      // if this isn't a live video and preload permits, start
      // downloading segments
      if (media.endList && _this.tech_.preload() !== 'none') {
        _this.mainSegmentLoader_.playlist(media);
        _this.mainSegmentLoader_.expired(_this.masterPlaylistLoader_.expired_);
        _this.mainSegmentLoader_.load();
      }

      _this.setupSourceBuffer_();
      _this.setupFirstPlay();
      _this.useAudio();
    });

    this.masterPlaylistLoader_.on('loadedplaylist', function () {
      var updatedPlaylist = _this.masterPlaylistLoader_.media();
      var seekable = undefined;

      if (!updatedPlaylist) {
        // select the initial variant
        _this.initialMedia_ = _this.selectPlaylist();
        _this.masterPlaylistLoader_.media(_this.initialMedia_);
        _this.fillAudioTracks_();

        _this.trigger('selectedinitialmedia');
        return;
      }

      _this.mainSegmentLoader_.playlist(updatedPlaylist);
      _this.mainSegmentLoader_.expired(_this.masterPlaylistLoader_.expired_);
      _this.updateDuration();

      // update seekable
      seekable = _this.seekable();
      if (!updatedPlaylist.endList && seekable.length !== 0) {
        _this.mediaSource.addSeekableRange_(seekable.start(0), seekable.end(0));
      }
    });

    this.masterPlaylistLoader_.on('error', function () {
      _this.blacklistCurrentPlaylist(_this.masterPlaylistLoader_.error);
    });

    this.masterPlaylistLoader_.on('mediachanging', function () {
      _this.mainSegmentLoader_.pause();
    });

    this.masterPlaylistLoader_.on('mediachange', function () {
      _this.mainSegmentLoader_.abort();
      _this.mainSegmentLoader_.load();
      _this.tech_.trigger({
        type: 'mediachange',
        bubbles: true
      });
    });

    this.mainSegmentLoader_.on('progress', function () {
      // figure out what stream the next segment should be downloaded from
      // with the updated bandwidth information
      _this.masterPlaylistLoader_.media(_this.selectPlaylist());

      _this.trigger('progress');
    });

    this.mainSegmentLoader_.on('error', function () {
      _this.blacklistCurrentPlaylist(_this.mainSegmentLoader_.error());
    });

    this.audioSegmentLoader_.on('error', function () {
      _videoJs2['default'].log.warn('Problem encountered with the current alternate audio track' + '. Switching back to default.');
      _this.audioSegmentLoader_.abort();
      _this.audioPlaylistLoader_ = null;
      _this.useAudio();
    });

    this.masterPlaylistLoader_.load();
  }

  /**
   * fill our internal list of HlsAudioTracks with data from
   * the master playlist or use a default
   *
   * @private
   */

  _createClass(MasterPlaylistController, [{
    key: 'fillAudioTracks_',
    value: function fillAudioTracks_() {
      var master = this.master();
      var mediaGroups = master.mediaGroups || {};

      // force a default if we have none or we are not
      // in html5 mode (the only mode to support more than one
      // audio track)
      if (!mediaGroups || !mediaGroups.AUDIO || Object.keys(mediaGroups.AUDIO).length === 0 || this.mode_ !== 'html5') {
        // "main" audio group, track name "default"
        mediaGroups = _videoJs2['default'].mergeOptions(mediaGroups, { AUDIO: {
            main: { 'default': { 'default': true } } }
        });
      }

      var tracks = {};

      for (var mediaGroup in mediaGroups.AUDIO) {
        for (var label in mediaGroups.AUDIO[mediaGroup]) {
          var properties = mediaGroups.AUDIO[mediaGroup][label];

          // if the track already exists add a new "location"
          // since tracks in different mediaGroups are actually the same
          // track with different locations to download them from
          if (tracks[label]) {
            tracks[label].addLoader(mediaGroup, properties.resolvedUri);
            continue;
          }

          var track = new _hlsAudioTrack2['default'](_videoJs2['default'].mergeOptions(properties, {
            hls: this.hls_,
            withCredentials: this.withCredential,
            mediaGroup: mediaGroup,
            label: label
          }));

          tracks[label] = track;
          this.audioTracks_.push(track);
        }
      }
    }

    /**
     * Call load on our SegmentLoaders
     */
  }, {
    key: 'load',
    value: function load() {
      this.mainSegmentLoader_.load();
      if (this.audioPlaylistLoader_) {
        this.audioSegmentLoader_.load();
      }
    }

    /**
     * Get the current active Media Group for Audio
     * given the selected playlist and its attributes
     */
  }, {
    key: 'activeAudioGroup',
    value: function activeAudioGroup() {
      var media = this.masterPlaylistLoader_.media();
      var mediaGroup = 'main';

      if (media && media.attributes && media.attributes.AUDIO) {
        mediaGroup = media.attributes.AUDIO;
      }

      return mediaGroup;
    }

    /**
     * Use any audio track that we have, and start to load it
     */
  }, {
    key: 'useAudio',
    value: function useAudio() {
      var _this2 = this;

      var track = undefined;

      this.audioTracks_.forEach(function (t) {
        if (!track && t.enabled) {
          track = t;
        }
      });

      // called too early or no track is enabled
      if (!track) {
        return;
      }

      // Pause any alternative audio
      if (this.audioPlaylistLoader_) {
        this.audioPlaylistLoader_.pause();
        this.audioPlaylistLoader_ = null;
        this.audioSegmentLoader_.pause();
      }

      // If the audio track for the active audio group has
      // a playlist loader than it is an alterative audio track
      // otherwise it is a part of the mainSegmenLoader
      var loader = track.getLoader(this.activeAudioGroup());

      if (!loader) {
        this.mainSegmentLoader_.clearBuffer();
        return;
      }

      // TODO: it may be better to create the playlist loader here
      // when we can change an audioPlaylistLoaders src
      this.audioPlaylistLoader_ = loader;

      if (this.audioPlaylistLoader_.started) {
        this.audioPlaylistLoader_.load();
        this.audioSegmentLoader_.load();
        this.audioSegmentLoader_.clearBuffer();
        return;
      }

      this.audioPlaylistLoader_.on('loadedmetadata', function () {
        /* eslint-disable no-shadow */
        var media = _this2.audioPlaylistLoader_.media();
        /* eslint-enable no-shadow */

        _this2.audioSegmentLoader_.playlist(media);
        _this2.addMimeType_(_this2.audioSegmentLoader_, 'mp4a.40.2', media);

        // if the video is already playing, or if this isn't a live video and preload
        // permits, start downloading segments
        if (!_this2.tech_.paused() || media.endList && _this2.tech_.preload() !== 'none') {
          _this2.audioSegmentLoader_.load();
        }

        if (!media.endList) {
          // trigger the playlist loader to start "expired time"-tracking
          _this2.audioPlaylistLoader_.trigger('firstplay');
        }
      });

      this.audioPlaylistLoader_.on('loadedplaylist', function () {
        var updatedPlaylist = undefined;

        if (_this2.audioPlaylistLoader_) {
          updatedPlaylist = _this2.audioPlaylistLoader_.media();
        }

        if (!updatedPlaylist) {
          // only one playlist to select
          _this2.audioPlaylistLoader_.media(_this2.audioPlaylistLoader_.playlists.master.playlists[0]);
          return;
        }

        _this2.audioSegmentLoader_.playlist(updatedPlaylist);
      });

      this.audioPlaylistLoader_.on('error', function () {
        _videoJs2['default'].log.warn('Problem encountered loading the alternate audio track' + '. Switching back to default.');
        _this2.audioSegmentLoader_.abort();
        _this2.audioPlaylistLoader_ = null;
        _this2.useAudio();
      });

      this.audioSegmentLoader_.clearBuffer();
      this.audioPlaylistLoader_.start();
    }

    /**
     * Re-tune playback quality level for the current player
     * conditions. This method may perform destructive actions, like
     * removing already buffered content, to readjust the currently
     * active playlist quickly.
     *
     * @private
     */
  }, {
    key: 'fastQualityChange_',
    value: function fastQualityChange_() {
      var media = this.selectPlaylist();

      if (media !== this.masterPlaylistLoader_.media()) {
        this.masterPlaylistLoader_.media(media);
        this.mainSegmentLoader_.sourceUpdater_.remove(this.currentTimeFunc() + 5, Infinity);
      }
    }

    /**
     * Begin playback.
     */
  }, {
    key: 'play',
    value: function play() {
      if (this.setupFirstPlay()) {
        return;
      }

      if (this.tech_.ended()) {
        this.tech_.setCurrentTime(0);
      }

      this.load();

      // if the viewer has paused and we fell out of the live window,
      // seek forward to the earliest available position
      if (this.tech_.duration() === Infinity) {
        if (this.tech_.currentTime() < this.tech_.seekable().start(0)) {
          return this.tech_.setCurrentTime(this.tech_.seekable().start(0));
        }
      }
    }

    /**
     * Seek to the latest media position if this is a live video and the
     * player and video are loaded and initialized.
     */
  }, {
    key: 'setupFirstPlay',
    value: function setupFirstPlay() {
      var seekable = undefined;
      var media = this.masterPlaylistLoader_.media();

      // check that everything is ready to begin buffering
      // 1) the active media playlist is available
      if (media &&
      // 2) the video is a live stream
      !media.endList &&

      // 3) the player is not paused
      !this.tech_.paused() &&

      // 4) the player has not started playing
      !this.hasPlayed_) {

        this.load();

        // trigger the playlist loader to start "expired time"-tracking
        this.masterPlaylistLoader_.trigger('firstplay');
        this.hasPlayed_ = true;

        // seek to the latest media position for live videos
        seekable = this.seekable();
        if (seekable.length) {
          this.tech_.setCurrentTime(seekable.end(0));
        }

        return true;
      }
      return false;
    }

    /**
     * handle the sourceopen event on the MediaSource
     *
     * @private
     */
  }, {
    key: 'handleSourceOpen_',
    value: function handleSourceOpen_() {
      // Only attempt to create the source buffer if none already exist.
      // handleSourceOpen is also called when we are "re-opening" a source buffer
      // after `endOfStream` has been called (in response to a seek for instance)
      this.setupSourceBuffer_();

      // if autoplay is enabled, begin playback. This is duplicative of
      // code in video.js but is required because play() must be invoked
      // *after* the media source has opened.
      if (this.tech_.autoplay()) {
        this.tech_.play();
      }

      this.trigger('sourceopen');
    }

    /**
     * Blacklists a playlist when an error occurs for a set amount of time
     * making it unavailable for selection by the rendition selection algorithm
     * and then forces a new playlist (rendition) selection.
     *
     * @param {Object=} error an optional error that may include the playlist
     * to blacklist
     */
  }, {
    key: 'blacklistCurrentPlaylist',
    value: function blacklistCurrentPlaylist() {
      var error = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var currentPlaylist = undefined;
      var nextPlaylist = undefined;

      // If the `error` was generated by the playlist loader, it will contain
      // the playlist we were trying to load (but failed) and that should be
      // blacklisted instead of the currently selected playlist which is likely
      // out-of-date in this scenario
      currentPlaylist = error.playlist || this.masterPlaylistLoader_.media();

      // If there is no current playlist, then an error occurred while we were
      // trying to load the master OR while we were disposing of the tech
      if (!currentPlaylist) {
        this.error = error;
        return this.mediaSource.endOfStream('network');
      }

      // Blacklist this playlist
      currentPlaylist.excludeUntil = Date.now() + BLACKLIST_DURATION;

      // Select a new playlist
      nextPlaylist = this.selectPlaylist();

      if (nextPlaylist) {
        _videoJs2['default'].log.warn('Problem encountered with the current ' + 'HLS playlist. Switching to another playlist.');

        return this.masterPlaylistLoader_.media(nextPlaylist);
      }
      _videoJs2['default'].log.warn('Problem encountered with the current ' + 'HLS playlist. No suitable alternatives found.');
      // We have no more playlists we can select so we must fail
      this.error = error;
      return this.mediaSource.endOfStream('network');
    }

    /**
     * Pause all segment loaders
     */
  }, {
    key: 'pauseLoading',
    value: function pauseLoading() {
      this.mainSegmentLoader_.pause();
      if (this.audioPlaylistLoader_) {
        this.audioSegmentLoader_.pause();
      }
    }

    /**
     * set the current time on all segment loaders
     *
     * @param {TimeRange} currentTime the current time to set
     * @return {TimeRange} the current time
     */
  }, {
    key: 'setCurrentTime',
    value: function setCurrentTime(currentTime) {
      var buffered = _ranges2['default'].findRange(this.tech_.buffered(), currentTime);

      if (!(this.masterPlaylistLoader_ && this.masterPlaylistLoader_.media())) {
        // return immediately if the metadata is not ready yet
        return 0;
      }

      // it's clearly an edge-case but don't thrown an error if asked to
      // seek within an empty playlist
      if (!this.masterPlaylistLoader_.media().segments) {
        return 0;
      }

      // if the seek location is already buffered, continue buffering as
      // usual
      if (buffered && buffered.length) {
        return currentTime;
      }

      // cancel outstanding requests so we begin buffering at the new
      // location
      this.mainSegmentLoader_.abort();
      if (this.audioPlaylistLoader_) {
        this.audioSegmentLoader_.abort();
      }

      if (!this.tech_.paused()) {
        this.mainSegmentLoader_.load();
        if (this.audioPlaylistLoader_) {
          this.audioSegmentLoader_.load();
        }
      }
    }

    /**
     * get the current duration
     *
     * @return {TimeRange} the duration
     */
  }, {
    key: 'duration',
    value: function duration() {
      if (!this.masterPlaylistLoader_) {
        return 0;
      }

      if (this.mediaSource) {
        return this.mediaSource.duration;
      }

      return Hls.Playlist.duration(this.masterPlaylistLoader_.media());
    }

    /**
     * check the seekable range
     *
     * @return {TimeRange} the seekable range
     */
  }, {
    key: 'seekable',
    value: function seekable() {
      var media = undefined;
      var mainSeekable = undefined;
      var audioSeekable = undefined;

      if (!this.masterPlaylistLoader_) {
        return _videoJs2['default'].createTimeRanges();
      }
      media = this.masterPlaylistLoader_.media();
      if (!media) {
        return _videoJs2['default'].createTimeRanges();
      }

      mainSeekable = Hls.Playlist.seekable(media, this.masterPlaylistLoader_.expired_);
      if (mainSeekable.length === 0) {
        return mainSeekable;
      }

      if (this.audioPlaylistLoader_) {
        audioSeekable = Hls.Playlist.seekable(this.audioPlaylistLoader_.media(), this.audioPlaylistLoader_.expired_);
        if (audioSeekable.length === 0) {
          return audioSeekable;
        }
      }

      if (!audioSeekable) {
        // seekable has been calculated based on buffering video data so it
        // can be returned directly
        return mainSeekable;
      }

      return _videoJs2['default'].createTimeRanges([[audioSeekable.start(0) > mainSeekable.start(0) ? audioSeekable.start(0) : mainSeekable.start(0), audioSeekable.end(0) < mainSeekable.end(0) ? audioSeekable.end(0) : mainSeekable.end(0)]]);
    }

    /**
     * Update the player duration
     */
  }, {
    key: 'updateDuration',
    value: function updateDuration() {
      var _this3 = this;

      var oldDuration = this.mediaSource.duration;
      var newDuration = Hls.Playlist.duration(this.masterPlaylistLoader_.media());
      var buffered = this.tech_.buffered();
      var setDuration = function setDuration() {
        _this3.mediaSource.duration = newDuration;
        _this3.tech_.trigger('durationchange');

        _this3.mediaSource.removeEventListener('sourceopen', setDuration);
      };

      if (buffered.length > 0) {
        newDuration = Math.max(newDuration, buffered.end(buffered.length - 1));
      }

      // if the duration has changed, invalidate the cached value
      if (oldDuration !== newDuration) {
        // update the duration
        if (this.mediaSource.readyState !== 'open') {
          this.mediaSource.addEventListener('sourceopen', setDuration);
        } else {
          setDuration();
        }
      }
    }

    /**
     * dispose of the MasterPlaylistController and everything
     * that it controls
     */
  }, {
    key: 'dispose',
    value: function dispose() {
      this.masterPlaylistLoader_.dispose();
      this.audioTracks_.forEach(function (track) {
        track.dispose();
      });
      this.audioTracks_.length = 0;
      this.mainSegmentLoader_.dispose();
      this.audioSegmentLoader_.dispose();
    }

    /**
     * return the master playlist object if we have one
     *
     * @return {Object} the master playlist object that we parsed
     */
  }, {
    key: 'master',
    value: function master() {
      return this.masterPlaylistLoader_.master;
    }

    /**
     * return the currently selected playlist
     *
     * @return {Object} the currently selected playlist object that we parsed
     */
  }, {
    key: 'media',
    value: function media() {
      // playlist loader will not return media if it has not been fully loaded
      return this.masterPlaylistLoader_.media() || this.initialMedia_;
    }

    /**
     * setup our internal source buffers on our segment Loaders
     *
     * @private
     */
  }, {
    key: 'setupSourceBuffer_',
    value: function setupSourceBuffer_() {
      var media = this.masterPlaylistLoader_.media();

      // wait until a media playlist is available and the Media Source is
      // attached
      if (!media || this.mediaSource.readyState !== 'open') {
        return;
      }

      this.addMimeType_(this.mainSegmentLoader_, 'avc1.4d400d, mp4a.40.2', media);

      // exclude any incompatible variant streams from future playlist
      // selection
      this.excludeIncompatibleVariants_(media);
    }

    /**
     * add a time type to a segmentLoader
     *
     * @param {SegmentLoader} segmentLoader the segmentloader to work on
     * @param {String} codecs to use by default
     * @param {Object} the parsed media object
     * @private
     */
  }, {
    key: 'addMimeType_',
    value: function addMimeType_(segmentLoader, defaultCodecs, media) {
      var mimeType = 'video/mp2t';

      // if the codecs were explicitly specified, pass them along to the
      // source buffer
      if (media.attributes && media.attributes.CODECS) {
        mimeType += '; codecs="' + media.attributes.CODECS + '"';
      } else {
        mimeType += '; codecs="' + defaultCodecs + '"';
      }
      segmentLoader.mimeType(mimeType);
    }

    /**
     * Blacklist playlists that are known to be codec or
     * stream-incompatible with the SourceBuffer configuration. For
     * instance, Media Source Extensions would cause the video element to
     * stall waiting for video data if you switched from a variant with
     * video and audio to an audio-only one.
     *
     * @param {Object} media a media playlist compatible with the current
     * set of SourceBuffers. Variants in the current master playlist that
     * do not appear to have compatible codec or stream configurations
     * will be excluded from the default playlist selection algorithm
     * indefinitely.
     * @private
     */
  }, {
    key: 'excludeIncompatibleVariants_',
    value: function excludeIncompatibleVariants_(media) {
      var master = this.masterPlaylistLoader_.master;
      var codecCount = 2;
      var videoCodec = null;
      var audioProfile = null;
      var codecs = undefined;

      if (media.attributes && media.attributes.CODECS) {
        codecs = parseCodecs(media.attributes.CODECS);
        videoCodec = codecs.videoCodec;
        audioProfile = codecs.audioProfile;
        codecCount = codecs.codecCount;
      }
      master.playlists.forEach(function (variant) {
        var variantCodecs = {
          codecCount: 2,
          videoCodec: null,
          audioProfile: null
        };

        if (variant.attributes && variant.attributes.CODECS) {
          variantCodecs = parseCodecs(variant.attributes.CODECS);
        }

        // if the streams differ in the presence or absence of audio or
        // video, they are incompatible
        if (variantCodecs.codecCount !== codecCount) {
          variant.excludeUntil = Infinity;
        }

        // if h.264 is specified on the current playlist, some flavor of
        // it must be specified on all compatible variants
        if (variantCodecs.videoCodec !== videoCodec) {
          variant.excludeUntil = Infinity;
        }
        // HE-AAC ("mp4a.40.5") is incompatible with all other versions of
        // AAC audio in Chrome 46. Don't mix the two.
        if (variantCodecs.audioProfile === '5' && audioProfile !== '5' || audioProfile === '5' && variantCodecs.audioProfile !== '5') {
          variant.excludeUntil = Infinity;
        }
      });
    }
  }]);

  return MasterPlaylistController;
})(_videoJs2['default'].EventTarget);

exports['default'] = MasterPlaylistController;
module.exports = exports['default'];