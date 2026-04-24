type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export type AppInstallState = {
  available: boolean;
  installed: boolean;
  supported: boolean;
};

type InstallListener = (state: AppInstallState) => void;

class AppInstallController {
  private initialized = false;

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  private installed = false;

  private readonly listeners = new Set<InstallListener>();

  private mediaQuery: MediaQueryList | null = null;

  initialize() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;
    this.installed = this.detectInstalled();
    this.mediaQuery = window.matchMedia("(display-mode: standalone)");

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.emit();
    });

    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.installed = true;
      this.emit();
    });

    const handleDisplayModeChange = () => {
      this.installed = this.detectInstalled();
      if (this.installed) this.deferredPrompt = null;
      this.emit();
    };

    if (typeof this.mediaQuery.addEventListener === "function") {
      this.mediaQuery.addEventListener("change", handleDisplayModeChange);
    } else if (typeof this.mediaQuery.addListener === "function") {
      this.mediaQuery.addListener(handleDisplayModeChange);
    }

    void this.registerServiceWorker();
    this.emit();
  }

  subscribe(listener: InstallListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): AppInstallState {
    return {
      available: !!this.deferredPrompt && !this.installed,
      installed: this.installed,
      supported: typeof window !== "undefined" && "serviceWorker" in navigator
    };
  }

  async promptInstall() {
    if (!this.deferredPrompt) return false;
    const prompt = this.deferredPrompt;
    this.deferredPrompt = null;
    this.emit();
    await prompt.prompt();
    const choice = await prompt.userChoice;
    this.installed = choice.outcome === "accepted" ? true : this.detectInstalled();
    if (!this.installed && choice.outcome !== "accepted") {
      this.deferredPrompt = prompt;
    }
    this.emit();
    return choice.outcome === "accepted";
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private detectInstalled() {
    const standaloneMedia = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
    const navigatorStandalone =
      typeof navigator !== "undefined" && "standalone" in navigator && !!(navigator as Navigator & { standalone?: boolean }).standalone;
    return standaloneMedia || navigatorStandalone;
  }

  private async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]";
    if (!window.isSecureContext && !isLocalhost) return;
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (error) {
      console.warn("PWA service worker registration failed.", error);
    }
  }
}

const controller = new AppInstallController();

export function initializeInstallableApp() {
  controller.initialize();
  return controller;
}

export function subscribeInstallState(listener: InstallListener) {
  return controller.subscribe(listener);
}

export function getInstallState() {
  return controller.getState();
}

export function promptAppInstall() {
  return controller.promptInstall();
}
