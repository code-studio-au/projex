export function formatDuration(durationMs: number): string;

export function escapeWorkflowCommand(value: string): string;

export function appendCiCommandSummary(options: {
  durationMs: number;
  label: string;
  status: 'passed' | 'failed';
  summaryPath?: string;
}): Promise<string>;
