// Execute a reproducible authoring script through the running Blender MCP add-on.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const file = path.resolve(process.argv[2]);
const stage = process.argv[3] ?? 'full';
const source = await fs.readFile(file, 'utf8');
const code = `__file__ = ${JSON.stringify(file)}\nPWC_STAGE = ${JSON.stringify(stage)}\ntry:\n    exec(compile(${JSON.stringify(source)}, __file__, 'exec'))\nexcept Exception:\n    import traceback\n    print(traceback.format_exc())\n    print('PWC_SCRIPT_FAILED')`;
const socket = net.createConnection({ host: '127.0.0.1', port: 9876 });
socket.setTimeout(600000);
let buffer = '';
socket.on('connect', () => socket.write(JSON.stringify({ type: 'execute_code', params: { code } })));
socket.on('data', (chunk) => {
    buffer += chunk.toString();
    let response;
    try {
        response = JSON.parse(buffer);
    } catch {
        return;
    }
    console.log(JSON.stringify(response, null, 2));
    socket.end();
    if (response.status !== 'success' || response.result?.result?.includes('PWC_SCRIPT_FAILED')) process.exitCode = 1;
});
socket.on('timeout', () => socket.destroy(new Error('Blender MCP timed out.')));
socket.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
});
