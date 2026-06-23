import type { SmokeSectionId } from '../../types/index.ts';
import {
  getSmokeClient,
  withRecorder,
  type RunSmokeSectionOptions,
} from './shared.ts';
import {
  runAppPagesSection,
  runBasicsSection,
  runEmailChangeSection,
} from './sections/basicFlows.ts';
import {
  runExportFlowSection,
  runInviteFlowSection,
  runPrivacyChecksSection,
} from './sections/accessFlows.ts';
import {
  runCompanyDefaultsSection,
  runTemporaryDataSection,
} from './sections/dataFlows.ts';

export async function runSmokeSection(
  sectionId: SmokeSectionId,
  requestOrigin: string,
  options?: RunSmokeSectionOptions
) {
  const { baseUrl, client } = getSmokeClient(requestOrigin, options);

  return withRecorder(
    sectionId,
    async (recorder) => {
      switch (sectionId) {
        case 'basics':
          await runBasicsSection(recorder, client, baseUrl);
          return;
        case 'appPages':
          await runAppPagesSection(recorder, client, baseUrl);
          return;
        case 'emailChange':
          await runEmailChangeSection(recorder, client, baseUrl);
          return;
        case 'temporaryData':
          await runTemporaryDataSection(recorder, client, baseUrl);
          return;
        case 'companyDefaults':
          await runCompanyDefaultsSection(recorder, client, baseUrl);
          return;
        case 'inviteFlow':
          await runInviteFlowSection(recorder, client, baseUrl);
          return;
        case 'exportFlow':
          await runExportFlowSection(recorder, client, baseUrl);
          return;
        case 'privacyChecks':
          await runPrivacyChecksSection(recorder, client);
          return;
        default:
          throw new Error(`Unknown smoke section: ${String(sectionId)}`);
      }
    },
    options
  );
}
