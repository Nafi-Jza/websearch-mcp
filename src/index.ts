import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { runSearch } from "./tools/search.js";
import { scrapePage } from "./tools/scrape.js";
import { scrapePageHeaded } from "./tools/scrape_headed.js";
import { openBrowser } from "./tools/open.js";
import { getYouTubeTranscript } from "./tools/youtube.js";
import { closeBrowserContext } from "./browser.js";
import { logActivity } from "./utils/logger.js";

const server = new Server({
    name: "websearch-mcp",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            { name: "search", description: "Search the web using DuckDuckGo.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "scrape", description: "Load a webpage headlessly and extract its main content as Markdown. MANDATORY FALLBACK: If this tool returns an error or bot challenge ('[BOT_CHALLENGE_DETECTED]'), you MUST immediately call 'scrape_headed' with the exact same URL so the user can pass the test.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
            { name: "scrape_headed", description: "Load a webpage in a visible headed browser to allow the user to pass bot verification (Cloudflare, Turnstile, CAPTCHA). Use this whenever 'scrape' fails with bot detection. Automatically extracts full Markdown once the challenge is passed.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
            { name: "open_browser", description: "Open a headed browser window to manually solve CAPTCHAs or log into sites.", inputSchema: { type: "object", properties: { url: { type: "string" } } } },
            { name: "youtube_transcript", description: "Extract transcript from YouTube video.", inputSchema: { type: "object", properties: { target: { type: "string" }, lang: { type: "string" } }, required: ["target"] } }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "search": {
                if (!args || typeof args.query !== 'string') throw new Error("Missing query");
                logActivity('search', `query: "${args.query}"`);
                const result = await runSearch(args.query);
                try {
                    const parsed = JSON.parse(result);
                    if (Array.isArray(parsed)) logActivity('search-result', `Found ${parsed.length} results`);
                    else logActivity('search-result', result.slice(0, 500));
                } catch { logActivity('search-result', result.slice(0, 500)); }
                return { content: [{ type: "text", text: result }] };
            }
            case "scrape": {
                if (!args || typeof args.url !== 'string') throw new Error("Missing url");
                logActivity('scraping', `site: "${args.url}"`);
                const result = await scrapePage(args.url);
                logActivity('scrape-output', `Length ${result.length}`);
                return { content: [{ type: "text", text: result }] };
            }
            case "scrape_headed": {
                if (!args || typeof args.url !== 'string') throw new Error("Missing url");
                logActivity('scraping-headed', `site: "${args.url}"`);
                const result = await scrapePageHeaded(args.url);
                logActivity('scrape_headed-output', `Length ${result.length}`);
                return { content: [{ type: "text", text: result }] };
            }
            case "open_browser": {
                const url = args?.url as string | undefined;
                logActivity('opening-browser', `URL: "${url || 'none'}"`);
                const result = await openBrowser(url);
                logActivity('browser-closed', result);
                return { content: [{ type: "text", text: result }] };
            }
            case "youtube_transcript": {
                if (!args || typeof args.target !== 'string') throw new Error("Missing target");
                logActivity('youtube-transcript', `target: "${args.target}"`);
                const result = await getYouTubeTranscript(args.target, args.lang as string | undefined);
                logActivity('youtube-output', `Length ${result.length}`);
                return { content: [{ type: "text", text: result }] };
            }
            default: throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        logActivity('error', `Tool ${name}: ${(error as Error).message}`);
        return { content: [{ type: "text", text: `Error: ${(error as Error).message}` }], isError: true };
    }
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logActivity('server', "WebSearch MCP Server initialized and ready.");
}

process.on('SIGINT', async () => {
    logActivity('server', "Shutting down...");
    await closeBrowserContext();
    server.close(); process.exit(0);
});

run().catch(error => { console.error(error); process.exit(1); });
