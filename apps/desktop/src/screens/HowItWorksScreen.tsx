// SPDX-FileCopyrightText: 2026 QuantGlass contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { FeedbackLoopBoard } from '../components/flow/FeedbackLoopBoard';
import { Panel, SectionHeading } from '../components/ui';

export function HowItWorksScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <SectionHeading title={t('howItWorks.title')} description={t('howItWorks.subtitle')} />
      <Panel>
        <p className="mb-3 text-xs text-muted">{t('howItWorks.hint')}</p>
        <FeedbackLoopBoard onNavigate={(route) => navigate(route)} />
      </Panel>
    </div>
  );
}
