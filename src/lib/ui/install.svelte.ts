interface InstallEvent extends Event {
	prompt(): Promise<void>;
}

/** iOS has no install event and delivers a push to an installed app only (tech.md 17.4). */
export function isIos(): boolean {
	return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone(): boolean {
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** Whether the app can be installed here and how (tech.md 17.4). Browser-only state. */
class InstallState {
	canPrompt = $state(false);
	standalone = $state(false);
	ios = $state(false);
	private deferred: InstallEvent | null = null;

	/** Call from an effect: reads the device and listens for the install offer of the browser. */
	watch(): () => void {
		this.standalone = isStandalone();
		this.ios = isIos();
		const offer = (event: Event): void => {
			// The browser would show its own bar; the app shows its button instead.
			event.preventDefault();
			this.deferred = event as InstallEvent;
			this.canPrompt = true;
		};
		const done = (): void => {
			this.canPrompt = false;
			this.standalone = true;
		};
		addEventListener('beforeinstallprompt', offer);
		addEventListener('appinstalled', done);
		return () => {
			removeEventListener('beforeinstallprompt', offer);
			removeEventListener('appinstalled', done);
		};
	}

	async prompt(): Promise<void> {
		await this.deferred?.prompt();
		this.deferred = null;
		this.canPrompt = false;
	}
}

export const installState = new InstallState();
