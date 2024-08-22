/* globals
foundry,
game,
Hooks
*/
"use strict";

export const MODULE_ID = "elevationruler";
export const EPSILON = 1e-08;

export const TEMPLATES = {
  DRAWING_CONFIG: `modules/${MODULE_ID}/templates/drawing-config.html`,
  COMBAT_TRACKER: `modules/${MODULE_ID}/templates/combat-tracker.html`
};

export const FLAGS = {
  MOVEMENT_SELECTION: "selectedMovementType",
  MOVEMENT_PENALTY: "movementPenalty",
  SCENE: {
    BACKGROUND_ELEVATION: "backgroundElevation"
  },
  MOVEMENT_HISTORY: "movementHistory"
};

export const MODULES_ACTIVE = { API: {} };

// Hook init b/c game.modules is not initialized at start.
Hooks.once("init", function() {
  MODULES_ACTIVE.LEVELS = game.modules.get("levels")?.active;
  MODULES_ACTIVE.TERRAIN_MAPPER = game.modules.get("terrainmapper")?.active;
});

// API not necessarily available until ready hook. (Likely added at init.)
Hooks.once("ready", function() {
  if ( MODULES_ACTIVE.TERRAIN_MAPPER ) MODULES_ACTIVE.API.TERRAIN_MAPPER = game.modules.get("terrainmapper").api;
});

export const MOVEMENT_TYPES = {
  AUTO: -1,
  BURROW: 0,
  WALK: 1,
  FLY: 2,

  /**
   * Get the movement type for a given ground versus current elevation.
   * @param {number} currElev     Elevation in grid units
   * @param {number} groundElev   Ground elevation in grid units
   * @returns {MOVEMENT_TYPE}
   */
  forCurrentElevation: function movementTypeForCurrentElevation(currElev, groundElev = 0) { return Math.sign(currElev - groundElev) + 1; }
};


export const MOVEMENT_BUTTONS = {
  [MOVEMENT_TYPES.AUTO]: "road-lock",
  [MOVEMENT_TYPES.BURROW]: "person-digging",
  [MOVEMENT_TYPES.WALK]: "person-walking-with-cane",
  [MOVEMENT_TYPES.FLY]: "dove"
};

/**
 * Properties related to token speed measurement
 * See system_attributes.js for Speed definitions for different systems.
 */
export const SPEED = {
  /**
   * Object of strings indicating where on the actor to locate the given attribute.
   * @type {object<key, string>}
   */
  ATTRIBUTES: { WALK: "", BURROW: "", FLY: ""},

  /**
   * Array of speed categories used for speed highlighting.
   * Array is in order, from highest priority to lowest. Only once the distance is surpassed
   * in the first category is the next category considered.
   * @type {SpeedCategory[]}
   */
  CATEGORIES: [],

  // Use Font Awesome font unicode instead of basic unicode for displaying terrain symbol.

  /**
   * If true, use Font Awesome font unicode instead of basic unicode for displaying terrain symbol.
   * @type {boolean}
   */
  useFontAwesome: true, // Set to true to use Font Awesome unicode

  /**
   * Terrain icon.
   * If using Font Awesome, e.g, https://fontawesome.com/icons/bolt?f=classic&s=solid would be "\uf0e7".
   * If not using Font Awesome, paste in unicode, e.g. "🥾" or "\u0xF0"
   * @type {string}
   */
  terrainSymbol: "\ue52f" // <i class="fa-solid fa-mountain-sun"></i>
};

/**
 * Given a token, get the maximum distance the token can travel for a given type.
 * Distance measured from 0, so types overlap. E.g.
 *   WALK (x1): Token speed 25, distance = 25.
 *   DASH (x2): Token speed 25, distance = 50.
 *
 * @param {Token} token                   Token whose speed should be used
 * @param {SpeedCategory} speedCategory   Category for which the maximum distance is desired
 * @param {number} [tokenSpeed]           Optional token speed to avoid repeated lookups
 * @returns {number}
 */
SPEED.maximumCategoryDistance = function(token, speedCategory, tokenSpeed) {
  tokenSpeed ??= SPEED.tokenSpeed(token);
  return speedCategory.multiplier * tokenSpeed;
};

/**
 * Get the key for a given object value. Presumes unique values, otherwise returns first.
 */
function keyForValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

/**
 * Given a token, retrieve its base speed.
 * @param {Token} token                   Token whose speed is required
 * @returns {number|null} Distance, in grid units. Null if no speed provided for that category.
 *   (Null will disable speed highlighting.)
 */
SPEED.tokenSpeed = function(token) {
  const moveType = token.movementType;
  const speed = foundry.utils.getProperty(token, SPEED.ATTRIBUTES[keyForValue(MOVEMENT_TYPES, moveType)]);
  if ( speed === null ) return null;
  return Number(speed);
};
