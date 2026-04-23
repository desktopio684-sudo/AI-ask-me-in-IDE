
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createQuizGateServer } from "./server.js";
import { parseArgs } from "util";
import * as http from "http";

async function main() {
    const server = createQuizGateServer();

    const { values } = parseArgs({
        options: {
            transport: { type: 'string', default: 'stdio' },
            port: { type: 'string', default: '3100' }
        }
    });

    if (values.transport === 'http') {
        // Dynamic import so stdio users (the default) don't pay the cost
        // of loading the HTTP transport module, which may not exist in
        // older @modelcontextprotocol/sdk versions.
        const { StreamableHTTPServerTransport } = await import(
            "@modelcontextprotocol/sdk/server/streamableHttp.js"
        );
        const transport = new StreamableHTTPServerTransport();
        await server.connect(transport);

        const port = parseInt(values.port as string, 10);
        const httpServer = http.createServer((req, res) => {
            transport.handleRequest(req, res).catch(console.error);
        });

        httpServer.listen(port, () => {
            console.error(`[QuizGate MCP] Streamable HTTP transport listening on port ${port}`);
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    }
}

main().catch((error) => {
    console.error("Fatal error running QuizGate MCP server:", error);
    process.exit(1);
});
