import { getBrowserContext } from '../browser.js';

export async function openBrowser(url?: string): Promise<string> {
    console.log("Opening headed browser for manual interaction...");

    // Pass 'true' to get a headed context
    const context = await getBrowserContext(true);

    // Try to find an existing empty page or create a new one
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    if (!page) {
         return "Error: Could not obtain a page in the headed browser.";
    }

    if (url && url.trim() !== '') {
        console.log(`Navigating to ${url}`);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
        } catch (e) {
            console.error(`Failed to navigate to ${url}:`, e);
            // We don't abort, we still want the user to have the browser open
        }
    }

    console.log("Waiting for the user to close the browser context...");

    // Pause execution until the user manually closes the persistent context (the whole browser)
    return new Promise((resolve) => {
        context.on('close', () => {
            console.log("User closed the headed browser.");
            resolve("Browser session closed. Profile updated successfully.");
        });
    });
}
