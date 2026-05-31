# Phase 09 - AI Narration

## Goal

Add constrained AI narration on top of deterministic engine outputs.

## Checklist

- [ ] Add Ollama service integration.
- [ ] Define narration prompts for signals and risk explanation.
- [ ] Enforce fact-only prompt inputs from engine outputs.
- [ ] Add fallback behavior when AI is unavailable.
- [ ] Add optional cloud provider adapters behind opt-in.

## Acceptance Gates

- AI responses never require hidden business logic from the desktop.
- Narration degrades safely when local or cloud AI is unavailable.
