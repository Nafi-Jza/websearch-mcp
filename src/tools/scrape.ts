import { getBrowserContext, closeBrowserContext } from '../browser.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { logActivity, saveOutput } from '../utils/logger.js';

export async function scrapePage(url: string): Promise<string> {
    // Run headlessly so it doesn't pop open a window, matching original behavior
    const context = await getBrowserContext(false);
    const page = await context.newPage();

    try {
        logActivity('scrape', `Scraping URL: ${url}`);

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);

        const title = await page.title().catch(() => '');
        const html = await page.content();
        const lowerTitle = title.toLowerCase();
        const lowerHtml = html.toLowerCase();

        const isChallenge = lowerTitle.includes('just a moment...') ||
                            lowerTitle.includes('attention required') ||
                            lowerTitle.includes('security verification') ||
                            lowerTitle.includes('bot verification') ||
                            lowerHtml.includes('cf-browser-verification') ||
                            lowerHtml.includes('cf-turnstile') ||
                            lowerHtml.includes('challenge-running') ||
                            lowerHtml.includes('challenges.cloudflare.com') ||
                            lowerHtml.includes('performing security verification') ||
                            lowerHtml.includes('verify you are human');

        if (isChallenge) {
            logActivity('scrape-warning', `Bot challenge detected on ${url}`);
            throw new Error(`[BOT_CHALLENGE_DETECTED] Webpage "${url}" is protected by a bot challenge/verification test.\nREMEDIATION: You MUST immediately call tool 'scrape_headed' with {"url": "${url}"} so the user can pass verification and scrape the full page content.`);
        }

        let finalMarkdown = '';

        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content) {
            logActivity('scrape-warning', "Readability failed, fallback to innerText");
            const innerText = await page.evaluate(() => document.body?.innerText || '');
            finalMarkdown = `# ${title || 'Scraped Content'} (Fallback)\n\n**Source:** ${url}\n\n${innerText}`;
        } else {
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
            });
            const markdownContent = turndownService.turndown(article.content);
            const pageTitle = article.title || title || 'Scraped Content';
            finalMarkdown = `# ${pageTitle}\n\n**Source:** ${url}\n\n${markdownContent}`;
        }

        logActivity('scrape-success', `Extracted length: ${finalMarkdown.length}`);
        saveOutput('scrape', finalMarkdown);
        return finalMarkdown;
    } catch (error) {
        logActivity('scrape-error', `Failed: ${(error as Error).message}`);
        throw error;
    } finally {
        await page.close().catch(() => {});
        await closeBrowserContext().catch(() => {});
        logActivity('scrape', 'Browser closed after scrape.');
    }
}
