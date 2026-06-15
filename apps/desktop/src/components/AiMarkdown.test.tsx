// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { AiMarkdown } from './AiMarkdown';

afterEach(cleanup);

describe('AiMarkdown', () => {
  it('renders Markdown structure (bold and lists) that models emit', () => {
    const { container } = render(
      <AiMarkdown>{'A **bold** point.\n\n- one\n- two\n- three'}</AiMarkdown>,
    );
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('never renders embedded raw HTML — model output cannot inject markup or scripts', () => {
    const malicious =
      'Totally **safe** text <script>alert(1)</script> ' +
      '<img src="x" onerror="alert(2)"> <a href="javascript:alert(3)">click</a>';
    const { container } = render(<AiMarkdown>{malicious}</AiMarkdown>);

    // The core guarantee: no executable/raw HTML elements reach the DOM.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();

    // Markdown still renders, so the guard isn't just stripping everything.
    expect(container.querySelector('strong')).toHaveTextContent('safe');

    // No anchor carries a javascript: URL.
    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  it('opens genuine links safely (noopener) in a new tab', () => {
    const { container } = render(<AiMarkdown>{'See [the docs](https://example.com).'}</AiMarkdown>);
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute('href', 'https://example.com');
    expect(anchor?.getAttribute('rel') ?? '').toContain('noopener');
  });
});
