import { chromium, BrowserContext } from 'playwright';
import path from 'path';

// Define standard paths and constants
export const PROFILE_DIR = path.join(process.cwd(), 'browser-profile');
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let browserContext: BrowserContext | null = null;
let isHeaded = false;

// Attempt to find Brave Browser based on common Windows paths
export function getBravePath(): string | undefined {
    const paths = [
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
    ];

    for (const p of paths) {
        try {
            if (require('fs').existsSync(p)) return p;
        } catch (e) {
            // ignore
        }
    }
    return undefined; // Let playwright use its bundled chromium
}

export async function getBrowserContext(headed: boolean = false): Promise<BrowserContext> {
    // If we need headed but are running headless (or vice versa), close the current context
    if (browserContext && isHeaded !== headed) {
        console.log(`Switching browser context: Headed=${headed}`);
        await browserContext.close();
        browserContext = null;
    }

    if (!browserContext) {
        const executablePath = getBravePath();

        console.log(`Launching persistent context... (Headed: ${headed})`);
        console.log(`Profile directory: ${PROFILE_DIR}`);

        const launchOptions: any = {
            headless: !headed,
            viewport: { width: 1280, height: 720 },
            userAgent: USER_AGENT,
            // Add some standard args to avoid detection
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
            ]
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
            console.log(`Using Brave at: ${executablePath}`);
        } else {
            console.log("Using default bundled Chromium");
        }

        try {
            browserContext = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions);
            isHeaded = headed;
            console.log("Browser context launched successfully.");
        } catch (error) {
            console.error("Failed to launch persistent context. Make sure no other instances are using this profile.");
            console.error(error);
            throw new Error(`Failed to launch browser: ${(error as Error).message}`);
        }
    }

    return browserContext;
}

export async function closeBrowserContext(): Promise<void> {
    if (browserContext) {
        await browserContext.close();
        browserContext = null;
        console.log("Browser context closed.");
    }
}
