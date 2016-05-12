/**
 * @file codec-utils.js
 */

/**
 * Check if a codec string refers to an audio codec.
 *
 * @param {String} codec codec string to check
 * @return {Boolean} if this is an audio codec
 * @private
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var isAudioCodec = function isAudioCodec(codec) {
  return (/mp4a\.\d+.\d+/i.test(codec)
  );
};

/**
 * Check if a codec string refers to a video codec.
 *
 * @param {String} codec codec string to check
 * @return {Boolean} if this is a video codec
 * @private
 */
var isVideoCodec = function isVideoCodec(codec) {
  return (/avc1\.[\da-f]+/i.test(codec)
  );
};

/**
 * Parse a content type header into a type and parameters
 * object
 *
 * @param {String} type the content type header
 * @return {Object} the parsed content-type
 * @private
 */
var parseContentType = function parseContentType(type) {
  var object = { type: '', parameters: {} };
  var parameters = type.trim().split(';');

  // first parameter should always be content-type
  object.type = parameters.shift().trim();
  parameters.forEach(function (parameter) {
    var pair = parameter.trim().split('=');

    if (pair.length > 1) {
      var _name = pair[0].replace(/"/g, '').trim();
      var value = pair[1].replace(/"/g, '').trim();

      object.parameters[_name] = value;
    }
  });

  return object;
};

exports['default'] = {
  isAudioCodec: isAudioCodec,
  parseContentType: parseContentType,
  isVideoCodec: isVideoCodec
};
module.exports = exports['default'];