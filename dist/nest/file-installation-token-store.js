"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileInstallationTokenStore = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Stores the installation id + token as JSON on local disk (0600), so a
 * restart doesn't re-register a brand-new installation. `storePath` resolves
 * against CWD when relative; keep it out of any statically-served dir.
 * Missing/unreadable/malformed → null (triggers a fresh registration).
 */
class FileInstallationTokenStore {
    constructor(storePath) {
        this.path = (0, node_path_1.isAbsolute)(storePath)
            ? storePath
            : (0, node_path_1.resolve)(process.cwd(), storePath);
    }
    async read() {
        try {
            const raw = await node_fs_1.promises.readFile(this.path, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed.installationId || !parsed.installationToken)
                return null;
            return {
                installationId: parsed.installationId,
                installationToken: parsed.installationToken,
            };
        }
        catch {
            return null;
        }
    }
    async write(credentials) {
        await node_fs_1.promises.mkdir((0, node_path_1.dirname)(this.path), { recursive: true });
        await node_fs_1.promises.writeFile(this.path, JSON.stringify(credentials), {
            mode: 0o600,
        });
    }
    async clear() {
        try {
            await node_fs_1.promises.unlink(this.path);
        }
        catch {
            // Missing file is already cleared.
        }
    }
}
exports.FileInstallationTokenStore = FileInstallationTokenStore;
