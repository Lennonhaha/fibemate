/**
 * @fibemate/algorithm-registry — TypeScript Type Definitions
 */

export interface SecurityLevel {
  classical: number | null;
  quantum: number | null;
  nistLevel: number | null;
}

export interface Standards {
  primary: string;
  nist?: string;
  gb?: string;
  gm?: string;
  iso?: string;
  iana?: string;
  ietf?: string;
  signal?: string;
  note?: string;
}

export interface CBOMClassification {
  classification: 'post-quantum' | 'classic' | 'protocol' | 'primitive' | 'verification';
  risk: 'safe' | 'warning' | 'vulnerable';
  pqcReady: boolean;
  migrationPriority: 'high' | 'medium' | 'low';
  migrationNote?: string;
}

export interface Implementation {
  languages: string[];
  native: boolean;
  wasm: boolean;
  fpga: boolean;
}

export interface Evidence {
  kat: string | null;
  tvla: string | null;
  tsr: string | null;
}

export interface Algorithm {
  id: string;
  name: string;
  family: string;
  category: string;
  version: string;
  securityLevel: SecurityLevel;
  standards: Standards;
  cbom: CBOMClassification;
  status: 'active' | 'development' | 'deprecated';
  location: string;
  implementation: Implementation;
  evidence: Evidence;
}

export interface Statistics {
  total: number;
  byCategory: {
    pqc: number;
    classic: number;
    protocol: number;
    primitive: number;
    verification: number;
  };
  byRisk: {
    safe: number;
    warning: number;
    vulnerable: number;
  };
  byMigrationPriority: {
    high: number;
    medium: number;
    low: number;
  };
  pqcReady: number;
  nativeImplementations: number;
  fpgaImplementations: number;
}

export const ALGORITHMS: Record<string, Algorithm>;

export function getAlgorithmIds(): string[];
export function getAllAlgorithms(): Record<string, Algorithm>;
export function getAlgorithm(id: string): Algorithm | null;
export function getByCategory(category: string): Algorithm[];
export function getByRisk(risk: string): Algorithm[];
export function getByMigrationPriority(priority: string): Algorithm[];
export function getPQCReady(): Algorithm[];
export function getNativeImplementations(): Algorithm[];
export function getFPGAImplementations(): Algorithm[];
export function generateCBOM(): any[];
export function getStatistics(): Statistics;
