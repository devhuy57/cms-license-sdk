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

const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ((
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        } as Record<string, string>
      )[c] as string),
  );

/**
 * Self-contained activation page (inline CSS, no external assets) served by the
 * middleware when the license is invalid. Posts the key back to
 * `${activationPath}/activate` as a normal form — no client JS required, so it
 * works even under the strictest runtime.
 */
export function renderActivationForm(opts: ActivationFormOptions): string {
  const title = esc(opts.title ?? 'License required');
  const support = opts.supportContact
    ? `<p class="support">Need help? Contact ${esc(opts.supportContact)}.</p>`
    : '';
  const message = esc(
    opts.message ?? 'This installation needs a valid license to continue.',
  );
  const error = opts.error
    ? `<div class="error" role="alert">${esc(opts.error)}</div>`
    : '';
  const value = opts.value ? esc(opts.value) : '';
  const action = esc(`${opts.activationPath}/activate`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0b0c10; color: #e8e8ea;
    background: light-dark(#f4f5f7, #0b0c10); color: light-dark(#111, #e8e8ea);
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 420px; padding: 32px;
    border-radius: 16px; background: light-dark(#fff, #15171c);
    box-shadow: 0 10px 40px rgba(0,0,0,.25);
    border: 1px solid light-dark(#e6e8eb, #23262d);
  }
  .badge {
    width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
    background: light-dark(#fdecec, #3a1d1d); color: #e5484d; font-size: 22px; margin-bottom: 16px;
  }
  h1 { font-size: 19px; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: light-dark(#555, #a0a3ab); font-size: 14px; line-height: 1.5; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  input {
    width: 100%; padding: 11px 13px; font-size: 14px; border-radius: 10px;
    border: 1px solid light-dark(#d5d7dc, #2b2f37);
    background: light-dark(#fff, #0e1014); color: inherit; font-family: ui-monospace, monospace;
  }
  input:focus { outline: 2px solid #3b82f6; border-color: transparent; }
  button {
    width: 100%; margin-top: 16px; padding: 12px; font-size: 14px; font-weight: 600;
    border: 0; border-radius: 10px; background: #3b82f6; color: #fff; cursor: pointer;
  }
  button:hover { background: #2f6fe0; }
  .error {
    background: light-dark(#fdecec, #3a1d1d); color: #e5484d; padding: 10px 12px;
    border-radius: 10px; font-size: 13px; margin-bottom: 16px;
  }
  .support { margin: 18px 0 0; font-size: 12px; }
</style>
</head>
<body>
  <main class="card">
    <div class="badge">&#9888;</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${error}
    <form method="POST" action="${action}">
      <label for="licenseKey">License key</label>
      <input id="licenseKey" name="licenseKey" value="${value}"
             placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" autofocus required />
      <button type="submit">Activate</button>
    </form>
    ${support}
  </main>
</body>
</html>`;
}
