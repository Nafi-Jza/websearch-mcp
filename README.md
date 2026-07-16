# WebSearch MCP Server

A Model Context Protocol (MCP) server that provides robust web search, scraping, and YouTube transcript extraction tools using Playwright. It bypasses basic bot detection by maintaining a persistent browser profile.

## Tools Provided

1. **`search`**: Searches the web using DuckDuckGo HTML and returns parsed results (Title, URL, Snippet).
2. **`scrape`**: Navigates to a webpage, extracts the main article content (via Readability), and returns it as Markdown (via Turndown). 
3. **`youtube_transcript`**: Extracts the transcript of a YouTube video (given a URL or ID). Tries the internal API first, and falls back to browser automation if blocked.
4. **`open_browser`**: Opens a visible (headed) browser window. Useful for manually solving CAPTCHAs or logging into accounts (like Springer Nature, Google, etc.). The server pauses execution until you manually close the browser window, saving the state to the persistent profile for subsequent headless scraping.

## Prerequisites
- Node.js (v18+)
- Playwright browsers installed

## Installation

```bash
# Clone the repository
git clone https://github.com/Nafi-Jza/websearch-mcp.git
cd websearch-mcp

# Install dependencies
npm install

# Download Playwright browsers (required for the first run)
npx playwright install chromium

# Build the TypeScript project
npm run build
```

## Adding to Claude (How to start it)

MCP servers are not run as standalone background processes. Instead, Claude (whether it's Claude Code in your terminal or the Claude Desktop App) acts as the client and **starts the server automatically** when you configure it.

To connect the server to Claude Code, run this command in your terminal:

```bash
claude mcp add websearch-mcp node /absolute/path/to/websearch-mcp/dist/index.js
```

*(On Windows, use full paths with forward slashes or escaped backslashes, e.g., `node C:/Users/yourname/.../dist/index.js`)*

Once you run this command, Claude Code will automatically launch the server in the background and keep it running for as long as you are using Claude. You don't need to run `npm start` manually!

### Alternative: Manual Configuration

If you prefer, you can manually edit your Claude configuration file (e.g., `claude_desktop_config.json` or `.claude/settings.json`):

```json
{
  "mcpServers": {
    "websearch-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/websearch-mcp/dist/index.js"
      ]
    }
  }
}
```

## Browser Profile
The server uses a persistent browser profile stored in `./browser-profile/`. This allows it to retain cookies and login sessions across restarts.
