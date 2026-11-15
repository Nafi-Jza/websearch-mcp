import { chromium, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logActivity } from "./utils/logger.js";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hostChromiumProfile = path.join(os.homedir(), ".config", "chromium");
export const PROFILE_DIR = fs.existsSync(hostChromiumProfile)
    ? hostChromiumProfile
    : path.resolve(__dirname, "..", "browser-profile");
// Using a generic Linux user agent to match the actual OS browser being used
export const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let browserContext: BrowserContext | null = null;
let browserLaunchPromise: Promise<BrowserContext> | null = null;

export async function getBrowserContext(headed: boolean = true): Promise<BrowserContext> {
    if (!process.env.DISPLAY) process.env.DISPLAY = ":1";
    if (!process.env.WAYLAND_DISPLAY) process.env.WAYLAND_DISPLAY = "wayland-1";

    if (browserContext) {
        try {
            browserContext.pages();
            return browserContext;
        } catch (e) {
            logActivity("browser-warning", "Existing context dead, resetting...");
            browserContext = null;
        }
    }
    if (browserLaunchPromise) {
        logActivity("browser", "Launch already in progress, waiting...");
        return browserLaunchPromise;
    }
    browserLaunchPromise = (async () => {
        logActivity("browser", `Launching persistent context... (Headed: ${headed}) Using Playwright Chromium | Profile: ${PROFILE_DIR}`);
        const launchOptions: any = {
            executablePath: "/usr/bin/chromium",
            headless: !headed,
            viewport: { width: 1280, height: 720 },
            ignoreDefaultArgs: [
                "--enable-automation",
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages"
            ],
            env: {
                ...process.env,
                DISPLAY: process.env.DISPLAY || ":1",
                WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-1"
            },
            args: [
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--window-position=0,0",
                "--ignore-certificate-errors",
                "--ignore-certificate-errors-spki-list",
                "--enable-extensions",
            ]
        };
        try {
            const ctx = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions);
            browserContext = ctx;
            logActivity("browser", "Browser context launched successfully.");
            ctx.on("close", () => {
                logActivity("browser", "Browser context closed by user/OS.");
                browserContext = null;
                browserLaunchPromise = null;
            });
            return ctx;
        } catch (error) {
            logActivity("browser-error", `Failed to launch: ${(error as Error).message}`);
            browserLaunchPromise = null;
            throw new Error(`Failed to launch browser: ${(error as Error).message}`);
        } finally {
            browserLaunchPromise = null;
        }
    })();
    return browserLaunchPromise;
}

export async function closeBrowserContext(): Promise<void> {
    if (browserContext) {
        try {
            for (const p of browserContext.pages()) {
                await p.close().catch(() => {});
            }
        } catch {}
        await browserContext.close().catch(() => {});
        browserContext = null;
        browserLaunchPromise = null;
        logActivity("browser", "Browser context closed gracefully.");
    }
}
