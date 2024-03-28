/* globals
canvas,
CONFIG,
CONST
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

// Class to measure distance between two points, accounting for token movement through terrain.

import { MeasurePhysicalDistanceGridless, MeasurePhysicalDistanceGridded } from "./MeasurePhysicalDistance.js";
import { MovePenaltyGridless, MovePenaltyGridded } from "./MovePenalty.js";
import { unitElevationFromCoordinates } from "./grid_coordinates.js";

export class MeasureMoveDistance {
  /**
   * Measure distance between two points, accounting for movement penalties and grid rules.
   * @param {GridCoordinates3d} a                     Starting point for the segment
   * @param {GridCoordinates3d} b                     Ending point for the segment
   * @param {Token} token                             Token doing the move, for calculating move penalty
   * @param {object} [opts]                           Options passed to the subclass measure method
   * @param {boolean} [opts.gridless=false]           If true, use the euclidean distance, ignoring grid.
   * @returns {number} Distance in grid units.
   *  A segment wholly within a square may be 0 distance.
   *  Instead of mathematical shortcuts from center, actual grid squares are counted.
   *  Euclidean on a grid also uses grid squares, but measures using actual diagonal from center to center.
   */
  static measure(a, b, token, { gridless = false, ...opts } = {}) {
    return this.#applyChildClass("measureMoveDistance", gridless, a, b, token, opts);
  }

  /**
   * Helper method to choose between gridless and gridded subclasses.
   * @param {string} method       Method to use
   * @param {boolean} gridless    Should this be a gridless measurement?
   * @param {...} args            Additional arguments passed to method
   * @returns {*} Result of the applied method.
   */
  static #applyChildClass(method, gridless = false, ...args) {
    gridless ||= canvas.grid.type === CONST.GRID_TYPES.GRIDLESS;
    const cl = gridless ? MeasureMoveDistanceGridless : MeasureMoveDistanceGridded;
    return cl[method](...args);
  }
}

export class MeasureMoveDistanceGridless extends MeasureMoveDistance {
  /**
   * Measure distance between two points, accounting for movement penalties.
   * @param {GridCoordinates3d} a                     Starting point for the segment
   * @param {GridCoordinates3d} b                     Ending point for the segment
   * @param {Token} token                             Token doing the move, for calculating move penalty
   * @param {object} [opts]                           Options that affect the measurement
   * @param {boolean} [opts.useAllElevation]          When false, stop once 2d destination is reached
   *                                                  regardless of elevation
   * @param {number} [opts.stopTarget]                Stop the move once this amount of distance is covered
   * @param {function} [opts.penaltyFn]               MovePenalty.movePenaltyFn() or a subclass version
   * @returns {number} Distance in grid units.
   *  A segment wholly within a square may be 0 distance.
   *  Instead of mathematical shortcuts from center, actual grid squares are counted.
   *  Euclidean on a grid also uses grid squares, but measures using actual diagonal from center to center.
   */
  static measure(a, b, token, { useAllElevation = true, stopTarget, penaltyFn } = {}) {
    penaltyFn ??= MovePenaltyGridless.movePenaltyFn();

    // Recursively calls measure without a stop target to find a breakpoint.
    if ( stopTarget ) {
      const fullZ = b.z;
      b = this.#findGridlessBreakpoint(a, b, token, stopTarget, { penaltyFn });
      if ( useAllElevation ) b.z = fullZ;
    }

    // Determine penalty proportion of the a|b segment.
    const penalty = penaltyFn(a, b, token);
    const d = CONFIG.GeometryLib.utils.pixelsToGridUnits(MeasurePhysicalDistanceGridless(a, b));
    return {
      distance: d,
      moveDistance: d * penalty,
      endGridCoords: b
    };
  }

  /**
   * Search for the best point at which to split a segment on a gridless Canvas so that
   * the first half of the segment is splitMoveDistance.
   * @param {PIXI.Point|Point3d} a              Starting point for the segment
   * @param {PIXI.Point|Point3d} b              Ending point for the segment
   * @param {Token} token                       Token to use when measuring move distance
   * @param {number} splitMoveDistance          Distance, in grid units, of the desired first subsegment move distance
   * @returns {Point3d}
   */
  #findGridlessBreakpoint(a, b, token, splitMoveDistance, opts = {}) {
    // Binary search to find a reasonably close t value for the split move distance.
    // Because the move distance can vary depending on terrain.
    const MAX_ITER = 20;
    const { moveDistance: fullMoveDistance } = this.measure(a, b, token, opts);

    let t = splitMoveDistance / fullMoveDistance;
    if ( t <= 0 ) return a;
    if ( t >= 1 ) return b;

    let maxHigh = 1;
    let maxLow = 0;
    let testSplitPoint;
    for ( let i = 0; i < MAX_ITER; i += 1 ) {
      testSplitPoint = a.projectToward(b, t);
      const { moveDistance } = this.measure(a, testSplitPoint, token, opts);

      // Adjust t by half the distance to the max/min t value.
      // Need not be all that exact but must be over the target distance.
      if ( moveDistance.almostEqual(splitMoveDistance, .01) ) break;
      if ( moveDistance > splitMoveDistance ) {
        maxHigh = t;
        t -= ((t - maxLow) * 0.5);
      } else {
        maxLow = t;
        t += ((maxHigh - t) * 0.5);
      }
    }
    return testSplitPoint;
  }

}

export class MeasureMoveDistanceGridded extends MeasureMoveDistance {
  /**
   * Measure distance between two points on a grid, accounting for movement penalties and grid rules.
   * @param {GridCoordinates3d} a                     Starting point for the segment
   * @param {GridCoordinates3d} b                     Ending point for the segment
   * @param {Token} token                             Token doing the move, for calculating move penalty
   * @param {object} [opts]                           Options that affect the measurement
   * @param {boolean} [opts.useAllElevation]          When false, stop once 2d destination is reached
   *                                                  regardless of elevation
   * @param {number} [opts.stopTarget]                Stop the move once this amount of distance is covered
   * @param {function} [opts.penaltyFn]               MovePenalty.movePenaltyFn() or a subclass version
   * @returns {number} Distance in grid units.
   *  A segment wholly within a square may be 0 distance.
   *  Instead of mathematical shortcuts from center, actual grid squares are counted.
   *  Euclidean on a grid also uses grid squares, but measures using actual diagonal from center to center.
   */
  static measure(a, b, token, { useAllElevation = true, stopTarget, penaltyFn } = {}) {
    const iter = MeasurePhysicalDistanceGridded.gridUnder3dLine(a, b).values();
    let prevGridCoords = iter.next().value;

    // Should never happen, as passing the same point as a,b returns a single square.
    if ( !prevGridCoords ) {
      console.warn("griddedMoveDistance|iterateGridMoves return undefined first value.");
      return 0;
    }

    // Step over each grid shape in turn. Change the distance by penalty amount.
    penaltyFn ??= MovePenaltyGridded.movePenaltyFn();
    let dTotal = 0;
    let dMoveTotal = 0;

    let currGridCoords;
    for ( currGridCoords of iter ) {
      const d = MeasurePhysicalDistanceGridded.measure(prevGridCoords, currGridCoords);
      const penalty = penaltyFn(currGridCoords, prevGridCoords, token);
      const dMove = d * penalty;

      // Early stop if the stop target is met.
      if ( stopTarget && (dMoveTotal + dMove) > stopTarget ) break;

      // Cycle to next.
      dTotal += d;
      dMoveTotal += dMove;
      prevGridCoords = currGridCoords;
    }

    if ( useAllElevation && currGridCoords ) {
      const endGridCoords = { ...currGridCoords };
      endGridCoords.k = unitElevationFromCoordinates(b);
      const res = this.measure(currGridCoords, endGridCoords, { penaltyFn, useAllElevation: false });
      dTotal += res.distance;
      dMoveTotal += res.moveDistance;
      currGridCoords = endGridCoords;
    }

    return {
      distance: dTotal,
      moveDistance: dMoveTotal,
      endGridCoords: currGridCoords
    };
  }
}