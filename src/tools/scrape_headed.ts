import { getBrowserContext, closeBrowserContext } from '../browser.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { logActivity, saveOutput } from '../utils/logger.js';

export async function scrapePageHeaded(url: string, maxWaitSeconds: number = 300): Promise<string> {
    logActivity('scrape_headed', `Opening headed browser for: ${url} (Timeout: ${maxWaitSeconds}s)`);
    const context = await getBrowserContext(true);
    const page = await context.newPage();

    let userFinished = false;
    let browserClosed = false;
    let lastHtml = '';
    let lastTitle = '';

    const onClose = () => {
        browserClosed = true;
        logActivity('scrape_headed', 'Browser context closed.');
    };
    context.once('close', onClose);

    try {
        await page.exposeFunction('__mcp_trigger_finish', () => {
            logActivity('scrape_headed', 'User clicked [Finish & Scrape] button.');
            userFinished = true;
        }).catch(() => {});

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            function injectButton() {
                if (document.getElementById('__mcp_finish_scrape_btn__')) return;
                const btn = document.createElement('button');
                btn.id = '__mcp_finish_scrape_btn__';
                btn.innerHTML = '&#9989; Finish &amp; Scrape';
                btn.style.cssText = [
                    'position: fixed',
                    'top: 15px',
                    'right: 15px',
                    'z-index: 2147483647',
                    'background: #2563eb',
                    'color: #ffffff',
                    'border: 2px solid #ffffff',
                    'border-radius: 8px',
                    'padding: 12px 24px',
                    'font-size: 16px',
                    'font-weight: bold',
                    'font-family: system-ui, -apple-system, sans-serif',
                    'box-shadow: 0 4px 20px rgba(0,0,0,0.6)',
                    'cursor: pointer',
                    'transition: all 0.2s ease',
                    'user-select: none'
                ].join(' !important;') + ' !important;';

                btn.onmouseover = () => {
                    btn.style.background = '#1d4ed8';
                    btn.style.transform = 'scale(1.05)';
                };
                btn.onmouseout = () => {
                    btn.style.background = '#2563eb';
                    btn.style.transform = 'scale(1.0)';
                };
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    btn.innerHTML = '&#9203; Scraping...';
                    btn.style.background = '#16a34a';
                    btn.style.pointerEvents = 'none';
                    if (typeof (window as any).__mcp_trigger_finish === 'function') {
                        (window as any).__mcp_trigger_finish();
                    }
                };

                const target = document.body || document.documentElement;
                if (target) {
                    target.appendChild(btn);
                }
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', injectButton);
            } else {
                injectButton();
            }
            setInterval(injectButton, 1000);
        });

        logActivity('scrape_headed', `Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(err => {
            logActivity('scrape_headed-warning', `Navigation warning: ${err.message}`);
        });

        const startTime = Date.now();
        const maxWaitMs = maxWaitSeconds * 1000;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        logActivity('scrape_headed', `Waiting for user... Click [Finish & Scrape] or close browser when done.`);

        while (Date.now() - startTime < maxWaitMs && !browserClosed && !userFinished) {
            try {
                const activePage = context.pages().slice(-1)[0] || page;
                const title = await activePage.title().catch(() => '');
                const html = await activePage.content().catch(() => '');

                const lowerTitle = title.toLowerCase();
                const isChallenge = lowerTitle.includes('just a moment') ||
                                    lowerTitle.includes('attention required') ||
                                    lowerTitle.includes('security verification') ||
                                    html.includes('challenge-running') ||
                                    html.includes('cf-browser-verification');

                if (!isChallenge && html.length > 500) {
                    lastHtml = html;
                    lastTitle = title;
                }
            } catch {
                // Ignore transient errors during reloads/redirects
            }
            await sleep(500);
        }

        let htmlToParse = '';
        if (!browserClosed) {
            try {
                const activePage = context.pages().slice(-1)[0] || page;
                htmlToParse = await activePage.content();
            } catch {}
        }
        if (!htmlToParse || htmlToParse.length < 200) {
            htmlToParse = lastHtml;
        }

        if (!htmlToParse) {
            return `[scrape_headed] Browser closed before content could be extracted.`;
        }

        const dom = new JSDOM(htmlToParse, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        let finalMarkdown = '';
        if (!article || !article.content) {
            logActivity('scrape_headed-warning', 'Readability failed, fallback to raw text');
            const innerText = dom.window.document.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
            const pageTitle = lastTitle || 'Scraped Content';
            finalMarkdown = `# ${pageTitle} (Fallback)\n\n**Source:** ${url}\n\n${innerText}`;
        } else {
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
            });
            const markdownContent = turndownService.turndown(article.content);
            const title = article.title || lastTitle || 'Scraped Content';
            finalMarkdown = `# ${title}\n\n**Source:** ${url}\n\n${markdownContent}`;
        }

        logActivity('scrape_headed-success', `Extracted length: ${finalMarkdown.length}`);
        saveOutput('scrape_headed', finalMarkdown);
        return finalMarkdown;
    } catch (error) {
        logActivity('scrape_headed-error', `Failed: ${(error as Error).message}`);
        return `Error in scrape_headed for ${url}: ${(error as Error).message}`;
    } finally {
        context.removeListener('close', onClose);
        await page.close().catch(() => {});
        await closeBrowserContext().catch(() => {});
        logActivity('scrape_headed', 'Browser closed after scrape_headed.');
    }
}
