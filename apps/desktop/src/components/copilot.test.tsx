// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const askCopilot = vi.fn();
vi.mock('../lib/backend', () => ({
  backendClient: { askCopilot: (...args: unknown[]) => askCopilot(...args) },
}));

import { Copilot } from './copilot';

// jsdom does not implement Element.scrollTo; the Copilot auto-scrolls to the
// newest message on every update.
Element.prototype.scrollTo = vi.fn();

const STARTER = 'What are the strongest signals right now?';

function openAndAsk() {
  render(<Copilot backendStatus="online" />);
  fireEvent.click(screen.getByTitle(/QuantGlass Copilot/i)); // open the drawer
  fireEvent.click(screen.getByText(STARTER)); // a starter question fires ask()
}

afterEach(() => {
  cleanup();
  askCopilot.mockReset();
});

describe('Copilot provenance', () => {
  it('labels a model answer with its source so it is never unattributed', async () => {
    askCopilot.mockResolvedValue({
      answer: 'You have **3** open positions.',
      source: 'ollama:qwen3',
      toolsUsed: ['get_paper_account'],
    });

    const { container } = render(<Copilot backendStatus="online" />);
    fireEvent.click(screen.getByTitle(/QuantGlass Copilot/i));
    fireEvent.click(screen.getByText(STARTER));

    // The source chip is present — every model answer carries its provenance.
    await waitFor(() => expect(screen.getByText('ollama:qwen3')).toBeInTheDocument());
    // The tool it used is shown too, and the answer is rendered.
    expect(screen.getByText('get_paper_account')).toBeInTheDocument();
    expect(container.textContent).toContain('open positions');
  });

  it('still attributes a failed request (source=error) — no silent, sourceless answer', async () => {
    askCopilot.mockRejectedValue(new Error('model timed out'));

    openAndAsk();

    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  });

  it('attributes a backend-reported error result as well', async () => {
    askCopilot.mockResolvedValue({
      error: 'Tool execution failed',
      source: 'error',
      toolsUsed: [],
    });

    openAndAsk();

    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument());
  });
});
