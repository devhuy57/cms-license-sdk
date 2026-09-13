"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HEARTBEAT_INTERVAL_MS = exports.DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = exports.DEFAULT_INSTALLATION_STORE_PATH = exports.UPDATE_CLIENT_OPTIONS = void 0;
exports.UPDATE_CLIENT_OPTIONS = Symbol('UPDATE_CLIENT_OPTIONS');
exports.DEFAULT_INSTALLATION_STORE_PATH = '.license/installation.json';
exports.DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = 120_000;
/**
 * 15 minutes. Well below the license client's hourly recheck: this is what
 * makes the vendor's "who runs what" view current, and it decides how soon a
 * customer is offered a new release.
 */
exports.DEFAULT_HEARTBEAT_INTERVAL_MS = 900_000;
