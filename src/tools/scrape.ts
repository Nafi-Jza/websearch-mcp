import { getBrowserContext } from '../browser.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export async function scrapePage(url: string): Promise<string> {
    const context = await getBrowserContext(false);
    const page = await context.newPage();

    try {
        console.log(`Scraping URL: ${url}`);

        // Anti-bot evasions for this page context
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait a tiny bit for JS-rendered content if needed, but not too long
        await page.waitForTimeout(3000);

        // Get the full raw HTML from Playwright
        const html = await page.content();

        // If content is very short or looks like an anti-bot challenge
        if (html.includes('cf-browser-verification') || html.includes('cf-turnstile') || html.length < 500) {
            console.log("Possible Cloudflare or short content. Grabbing innerText as fallback.");
            const innerText = await page.evaluate(() => document.body.innerText);
            return `# Scraped Text (Fallback)\n\n${innerText}`;
        }

        // Parse HTML using JSDOM in Node (much safer than injecting scripts into the page)
        const dom = new JSDOM(html, { url });

        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content) {
            console.log("Readability failed. Falling back to innerText.");
            const innerText = await page.evaluate(() => document.body.innerText);
            return `# Scraped Text (Fallback)\n\n${innerText}`;
        }

        // Convert the Readability HTML to Markdown using Turndown
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
        const markdownContent = turndownService.turndown(article.content);

        const title = article.title || 'Scraped Content';
        const finalMarkdown = `# ${title}\n\n**Source:** ${url}\n\n${markdownContent}`;

        return finalMarkdown;
    } catch (error) {
        console.error("Scraping failed:", error);
        return `Error scraping ${url}: ${(error as Error).message}`;
    } finally {
        await page.close();
    }
}
