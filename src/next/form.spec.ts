import { renderActivationForm } from './form';

describe('license-sdk/next renderActivationForm', () => {
  it('posts to <activationPath>/activate and is self-contained HTML', () => {
    const html = renderActivationForm({ activationPath: '/__license' });
    expect(html).toContain('action="/__license/activate"');
    expect(html).toContain('name="licenseKey"');
    expect(html).toContain('<!doctype html>');
    expect(html).not.toMatch(/src=|href=/); // no external assets
  });

  it('escapes injected error/value to prevent HTML injection', () => {
    const html = renderActivationForm({
      activationPath: '/__license',
      error: '<script>alert(1)</script>',
      value: '"><img>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img&gt;');
  });
});
