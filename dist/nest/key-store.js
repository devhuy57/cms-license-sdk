"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileKeyStore = exports.KEY_STORE = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.KEY_STORE = Symbol('LICENSE_CLIENT_KEY_STORE');
class FileKeyStore {
    constructor(keyStorePath) {
        this.path = (0, node_path_1.isAbsolute)(keyStorePath)
            ? keyStorePath
            : (0, node_path_1.resolve)(process.cwd(), keyStorePath);
    }
    async read() {
        try {
            const raw = (await node_fs_1.promises.readFile(this.path, 'utf8')).trim();
            return raw.length > 0 ? raw : null;
        }
        catch {
            return null;
        }
    }
    async write(key) {
        await node_fs_1.promises.mkdir((0, node_path_1.dirname)(this.path), { recursive: true });
        await node_fs_1.promises.writeFile(this.path, key, { mode: 0o600 });
    }
}
exports.FileKeyStore = FileKeyStore;
