/**
 * JSON report schema — matches README and is consumable by frontend.
 * Phase 2: add Zod/ajv validation for report ingestion.
 */
export interface Location {
  file: string;
  function: string;
  line_start: number;
  line_end: number;
}

export interface Vulnerability {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  locations: Location[];
  explanation: string;
  evidence?: {
    patterns?: string[];
    call_graph?: string[];
  };
  references?: string[];
}

export interface ExploitStep {
  action: string;
  pre_state: Record<string, string>;
  post_state: Record<string, string>;
  notes: string;
}

export interface ExploitPath {
  name: string;
  steps: ExploitStep[];
  success_criteria: string;
}

export interface FixSuggestion {
  id: string;
  title: string;
  strategy: string;
  explanation: string;
  diff_preview?: string;
  tradeoffs?: string;
}

export interface ReportMeta {
  generated_at: string;
  generator: string;
  inference_backend: '0g' | 'local';
  version: string;
}

export interface ProphetReport {
  contract_name: string;
  source_hash: string;
  risk_score: number;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  vulnerabilities: Vulnerability[];
  exploit_paths: ExploitPath[];
  fix_suggestions: FixSuggestion[];
  meta: ReportMeta;
}
