// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

declare const _default: {
    content: string[];
    theme: {
        extend: {
            colors: {
                background: string;
                surface: string;
                panel: string;
                border: string;
                ink: string;
                muted: string;
                buy: string;
                sell: string;
                hold: string;
                watch: string;
                accent: string;
                accentStrong: string;
                panelStrong: string;
            };
            fontFamily: {
                sans: [string, string, string, string, string];
                mono: [string, string, string, string];
            };
            boxShadow: {
                glow: string;
            };
            backdropBlur: {
                xs: string;
            };
            backgroundImage: {
                'grid-fade': string;
            };
        };
    };
    plugins: any[];
};
export default _default;
