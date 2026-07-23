"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTokenCache = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Stores the last valid token on local disk (0600). `cachePath` resolves against
 * CWD when relative; keep it out of any statically-served dir. Missing/unreadable
 * → null.
 */
class FileTokenCache {
    constructor(cachePath) {
        this.path = (0, node_path_1.isAbsolute)(cachePath)
            ? cachePath
            : (0, node_path_1.resolve)(process.cwd(), cachePath);
    }
    async read() {
        try {
            const raw = await node_fs_1.promises.readFile(this.path, 'utf8');
            const trimmed = raw.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        catch {
            return null;
        }
    }
    async write(token) {
        await node_fs_1.promises.mkdir((0, node_path_1.dirname)(this.path), { recursive: true });
        await node_fs_1.promises.writeFile(this.path, token, { mode: 0o600 });
    }
}
exports.FileTokenCache = FileTokenCache;
