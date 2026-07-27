/**
 * Venue registry — the single source of truth for all supported venue types.
 *
 * chat.ts and telegram.ts import getVenue() instead of branching on venue slug.
 * Adding a new venue type means:
 *   1. New tools file   (e.g. golf-tools.mjs)
 *   2. New content file (e.g. golf-content.mjs)
 *   3. New agent file   (e.g. golf-agent.mjs)
 *   4. One entry here
 *   5. A new env var for the GitHub repo (e.g. GOLF_REPO)
 *   6. For Telegram: add chat ID mapping in telegram-bot.mjs
 *
 * Nothing else in chat.ts or telegram.ts needs to change.
 */

import { runOpsChat } from './agent.mjs'
import { runFestivalOpsChat } from './festival-agent.mjs'
import { runGolfOpsChat } from './golf-agent.mjs'

import { runDeterministicOpsChat } from './fallback.mjs'
import { runFestivalDeterministicChat } from './festival-fallback.mjs'

import {
  EDITABLE_FILES as ROSATOS_FILES,
  bundleFromFiles as rosatosBundleFromFiles,
  filesFromBundle as rosatosFilesFromBundle,
} from './content.mjs'
import {
  EDITABLE_FILES as FESTIVAL_FILES,
  bundleFromFiles as festivalBundleFromFiles,
  filesFromBundle as festivalFilesFromBundle,
} from './festival-content.mjs'
import {
  EDITABLE_FILES as GOLF_FILES,
  bundleFromFiles as golfBundleFromFiles,
  filesFromBundle as golfFilesFromBundle,
} from './golf-content.mjs'

import {
  contentConfig,
  festivalContentConfig,
  golfContentConfig,
} from './github.mjs'

/**
 * @typedef {object} VenueConfig
 * @property {Function}      runOpsChat            AI tool-loop runner
 * @property {Function|null} runDeterministicChat  Fallback phrase router (null = no fallback)
 * @property {readonly string[]} editableFiles     JSON paths to read/write in the venue repo
 * @property {Function}      bundleFromFiles       files → bundle
 * @property {Function}      filesFromBundle       bundle → files (with onlyChanged filter)
 * @property {Function}      contentConfig         () → { token, repo, branch }
 * @property {string}        displayName           Human-readable venue name
 * @property {boolean}       supportsAttachments   Whether PDF attachment upload is allowed
 */

/** @type {Record<string, VenueConfig>} */
const REGISTRY = {
  rosatos: {
    runOpsChat,
    runDeterministicChat: runDeterministicOpsChat,
    editableFiles: ROSATOS_FILES,
    bundleFromFiles: rosatosBundleFromFiles,
    filesFromBundle: rosatosFilesFromBundle,
    contentConfig,
    displayName: "Rosato's",
    supportsAttachments: true,
  },

  festival: {
    runOpsChat: runFestivalOpsChat,
    runDeterministicChat: runFestivalDeterministicChat,
    editableFiles: FESTIVAL_FILES,
    bundleFromFiles: festivalBundleFromFiles,
    filesFromBundle: festivalFilesFromBundle,
    contentConfig: festivalContentConfig,
    displayName: 'Moville Festival',
    supportsAttachments: false,
  },

  golf: {
    runOpsChat: runGolfOpsChat,
    runDeterministicChat: null, // no deterministic fallback for golf in Phase 1
    editableFiles: GOLF_FILES,
    bundleFromFiles: golfBundleFromFiles,
    filesFromBundle: golfFilesFromBundle,
    contentConfig: golfContentConfig,
    displayName: 'Golf Club',
    supportsAttachments: false,
  },
}

/** Return the config for a venue slug, or throw 400 if unknown. */
export function getVenue(slug) {
  const venue = REGISTRY[slug]
  if (!venue) {
    throw Object.assign(new Error(`Unknown venue: "${slug}"`), { status: 400 })
  }
  return venue
}

export function isValidVenue(slug) {
  return typeof slug === 'string' && slug in REGISTRY
}

export const VALID_VENUES = Object.keys(REGISTRY)
