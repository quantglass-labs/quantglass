// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                background: '#08111f',
                surface: '#0f1a2e',
                panel: 'rgba(18, 30, 52, 0.74)',
                border: 'rgba(255, 255, 255, 0.1)',
                ink: '#e0ebff',
                muted: '#91a6c9',
                buy: '#18c37f',
                sell: '#f05b78',
                hold: '#f0b84b',
                watch: '#4f8bff',
                accent: '#8db7ff',
                accentStrong: '#3a74f0',
                panelStrong: '#152540',
            },
            fontFamily: {
                sans: ['IBM Plex Sans', 'Aptos', 'Segoe UI', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
            },
            boxShadow: {
                glow: '0 20px 60px rgba(8, 17, 31, 0.35)',
            },
            backdropBlur: {
                xs: '2px',
            },
            backgroundImage: {
                'grid-fade': 'radial-gradient(circle at top, rgba(141, 183, 255, 0.18), transparent 36%), linear-gradient(135deg, rgba(79, 139, 255, 0.12), transparent 48%), linear-gradient(180deg, #08111f 0%, #091624 34%, #07111d 100%)',
            },
        },
    },
    plugins: [],
};
