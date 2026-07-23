export interface ActivationFormOptions {
    activationPath: string;
    title?: string;
    supportContact?: string;
    /** Message shown above the form (e.g. why the license is invalid). */
    message?: string;
    /** Error from a failed activation attempt. */
    error?: string;
    /** Prefill the input (e.g. the rejected key). */
    value?: string;
}
/**
 * Self-contained activation page (inline CSS, no external assets) served by the
 * middleware when the license is invalid. Posts the key back to
 * `${activationPath}/activate` as a normal form — no client JS required, so it
 * works even under the strictest runtime.
 */
export declare function renderActivationForm(opts: ActivationFormOptions): string;
