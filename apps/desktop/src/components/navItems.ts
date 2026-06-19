// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The primary navigation destinations, shared by the sidebar, the mobile tab
 * bar, and the command palette. Kept in its own module so importing the list
 * does not pull in a component (keeps fast-refresh happy).
 */

import {
  Bell,
  Briefcase,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Star,
  Target,
  TestTubeDiagonal,
  TrendingUp,
  Workflow,
} from 'lucide-react';

export const navItems = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/how-it-works', key: 'howItWorks', icon: Workflow },
  { to: '/signals', key: 'signals', icon: TrendingUp },
  { to: '/watchlist', key: 'watchlist', icon: Star },
  { to: '/portfolio', key: 'portfolio', icon: Briefcase },
  { to: '/backtest', key: 'backtest', icon: TestTubeDiagonal },
  { to: '/alerts', key: 'alerts', icon: Bell },
  { to: '/learn', key: 'learn', icon: GraduationCap },
  { to: '/missions', key: 'missions', icon: Target },
  { to: '/journal', key: 'journal', icon: NotebookPen },
  { to: '/review', key: 'review', icon: ClipboardCheck },
  { to: '/settings', key: 'settings', icon: Settings },
];
