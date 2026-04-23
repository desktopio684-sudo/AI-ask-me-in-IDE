import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/** Path of the temp file that stores the active QuizGate port. */
export const PORT_FILE = path.join(os.homedir(), '.quizgate-port');

/**
 * Checks if a given port is available on localhost.
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
}

/**
 * Finds an available port starting from the given port.
 * Scans upward up to 10 ports before giving up.
 */
export async function findAvailablePort(startPort: number): Promise<number> {
    for (let currentPort = startPort; currentPort < startPort + 10; currentPort++) {
        if (await isPortAvailable(currentPort)) {
            return currentPort;
        }
    }
    throw new Error(`No open port found in range ${startPort}-${startPort + 9}`);
}

/**
 * Writes the active port to ~/.quizgate-port so the MCP bridge can discover it.
 */
export function writePortFile(port: number): void {
    try {
        fs.writeFileSync(PORT_FILE, String(port), 'utf8');
    } catch (e) {
        // Best-effort, don't crash if we can't write the file
    }
}

/**
 * Removes the port file on extension deactivation.
 */
export function deletePortFile(): void {
    try {
        if (fs.existsSync(PORT_FILE)) {
            fs.unlinkSync(PORT_FILE);
        }
    } catch (e) {
        // Best-effort cleanup
    }
}
