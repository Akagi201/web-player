/**
 * ranges
 *
 * Utilities for working with TimeRanges.
 *
 */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

// Fudge factor to account for TimeRanges rounding
var TIME_FUDGE_FACTOR = 1 / 30;

var filterRanges = function filterRanges(timeRanges, predicate) {
  var results = [];
  var i = undefined;

  if (timeRanges && timeRanges.length) {
    // Search for ranges that match the predicate
    for (i = 0; i < timeRanges.length; i++) {
      if (predicate(timeRanges.start(i), timeRanges.end(i))) {
        results.push([timeRanges.start(i), timeRanges.end(i)]);
      }
    }
  }

  return _videoJs2['default'].createTimeRanges(results);
};

/**
 * Attempts to find the buffered TimeRange that contains the specified
 * time.
 * @param {TimeRanges} buffered - the TimeRanges object to query
 * @param {number} time  - the time to filter on.
 * @returns {TimeRanges} a new TimeRanges object
 */
var findRange = function findRange(buffered, time) {
  return filterRanges(buffered, function (start, end) {
    return start - TIME_FUDGE_FACTOR <= time && end + TIME_FUDGE_FACTOR >= time;
  });
};

/**
 * Returns the TimeRanges that begin at or later than the specified
 * time.
 * @param {TimeRanges} timeRanges - the TimeRanges object to query
 * @param {number} time - the time to filter on.
 * @returns {TimeRanges} a new TimeRanges object.
 */
var findNextRange = function findNextRange(timeRanges, time) {
  return filterRanges(timeRanges, function (start) {
    return start - TIME_FUDGE_FACTOR >= time;
  });
};

/**
 * Search for a likely end time for the segment that was just appened
 * based on the state of the `buffered` property before and after the
 * append. If we fin only one such uncommon end-point return it.
 * @param {TimeRanges} original - the buffered time ranges before the update
 * @param {TimeRanges} update - the buffered time ranges after the update
 * @returns {Number|null} the end time added between `original` and `update`,
 * or null if one cannot be unambiguously determined.
 */
var findSoleUncommonTimeRangesEnd = function findSoleUncommonTimeRangesEnd(original, update) {
  var i = undefined;
  var start = undefined;
  var end = undefined;
  var result = [];
  var edges = [];

  // In order to qualify as a possible candidate, the end point must:
  //  1) Not have already existed in the `original` ranges
  //  2) Not result from the shrinking of a range that already existed
  //     in the `original` ranges
  //  3) Not be contained inside of a range that existed in `original`
  var overlapsCurrentEnd = function overlapsCurrentEnd(span) {
    return span[0] <= end && span[1] >= end;
  };

  if (original) {
    // Save all the edges in the `original` TimeRanges object
    for (i = 0; i < original.length; i++) {
      start = original.start(i);
      end = original.end(i);

      edges.push([start, end]);
    }
  }

  if (update) {
    // Save any end-points in `update` that are not in the `original`
    // TimeRanges object
    for (i = 0; i < update.length; i++) {
      start = update.start(i);
      end = update.end(i);

      if (edges.some(overlapsCurrentEnd)) {
        continue;
      }

      // at this point it must be a unique non-shrinking end edge
      result.push(end);
    }
  }

  // we err on the side of caution and return null if didn't find
  // exactly *one* differing end edge in the search above
  if (result.length !== 1) {
    return null;
  }

  return result[0];
};

/**
 * Calculate the intersection of two TimeRanges
 * @param {TimeRanges} bufferA
 * @param {TimeRanges} bufferB
 * @returns {TimeRanges} The interesection of `bufferA` with `bufferB`
 */
var bufferIntersection = function bufferIntersection(bufferA, bufferB) {
  var start = null;
  var end = null;
  var arity = 0;
  var extents = [];
  var ranges = [];

  if (!bufferA || !bufferA.length || !bufferB || !bufferB.length) {
    return _videoJs2['default'].createTimeRange();
  }

  // Handle the case where we have both buffers and create an
  // intersection of the two
  var count = bufferA.length;

  // A) Gather up all start and end times
  while (count--) {
    extents.push({ time: bufferA.start(count), type: 'start' });
    extents.push({ time: bufferA.end(count), type: 'end' });
  }
  count = bufferB.length;
  while (count--) {
    extents.push({ time: bufferB.start(count), type: 'start' });
    extents.push({ time: bufferB.end(count), type: 'end' });
  }
  // B) Sort them by time
  extents.sort(function (a, b) {
    return a.time - b.time;
  });

  // C) Go along one by one incrementing arity for start and decrementing
  //    arity for ends
  for (count = 0; count < extents.length; count++) {
    if (extents[count].type === 'start') {
      arity++;

      // D) If arity is ever incremented to 2 we are entering an
      //    overlapping range
      if (arity === 2) {
        start = extents[count].time;
      }
    } else if (extents[count].type === 'end') {
      arity--;

      // E) If arity is ever decremented to 1 we leaving an
      //    overlapping range
      if (arity === 1) {
        end = extents[count].time;
      }
    }

    // F) Record overlapping ranges
    if (start !== null && end !== null) {
      ranges.push([start, end]);
      start = null;
      end = null;
    }
  }

  return _videoJs2['default'].createTimeRanges(ranges);
};

/**
 * Calculates the percentage of `segmentRange` that overlaps the
 * `buffered` time ranges.
 * @param {TimeRanges} segmentRange - the time range that the segment covers
 * @param {TimeRanges} buffered - the currently buffered time ranges
 * @returns {Number} percent of the segment currently buffered
 */
var calculateBufferedPercent = function calculateBufferedPercent(segmentRange, buffered) {
  var segmentDuration = segmentRange.end(0) - segmentRange.start(0);
  var intersection = bufferIntersection(segmentRange, buffered);
  var overlapDuration = 0;
  var count = intersection.length;

  while (count--) {
    overlapDuration += intersection.end(count) - intersection.start(count);
  }

  return overlapDuration / segmentDuration * 100;
};

exports['default'] = {
  findRange: findRange,
  findNextRange: findNextRange,
  findSoleUncommonTimeRangesEnd: findSoleUncommonTimeRangesEnd,
  calculateBufferedPercent: calculateBufferedPercent,
  TIME_FUDGE_FACTOR: TIME_FUDGE_FACTOR
};
module.exports = exports['default'];