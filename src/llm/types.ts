import type { ValidationResult } from "../types/index.js";

export interface AnalyzeRequest {
  type: "analyze" | "insert_code" | "suggest";
  projectType: string;
  files: Array<{ path: string; content: string }>;
  context: {
    validationResults?: ValidationResult[];
    detectedFeatures?: string[];
    projectConfig?: Record<string, unknown>;
    sdkVersion?: string;
    platforms?: string[];
  };
  prompt?: string;
}

export interface AnalysisIssue {
  severity: "error" | "warn" | "info";
  message: string;
  file?: string;
  line?: number;
  fix?: string;
}

export interface InsertionPoint {
  file: string;
  line: number;
  code: string;
  description?: string;
}

export interface FeatureSuggestion {
  feature: string;
  reason: string;
  example: string;
}

export interface AnalysisResult {
  content: string;
  structured?: {
    issues?: AnalysisIssue[];
    insertionPoint?: InsertionPoint;
    suggestions?: FeatureSuggestion[];
  };
}
