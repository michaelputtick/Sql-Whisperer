/**
 * SQLWhisperer Mapping System Types
 * Defines the structure for storing query results and field mappings
 */

// ============ Source System Types ============

export type SourceSystemType = 'GP' | 'NAV' | 'AX' | 'OTHER';

export interface SourceSystemConfig {
  type: SourceSystemType;
  displayName: string;
  skillFile: string;
  description: string;
}

export const SOURCE_SYSTEMS: Record<SourceSystemType, SourceSystemConfig> = {
  GP: {
    type: 'GP',
    displayName: 'Great Plains (Dynamics GP)',
    skillFile: '.claude/skills/gp-query-writer.md',
    description: 'Microsoft Dynamics GP / Great Plains'
  },
  NAV: {
    type: 'NAV',
    displayName: 'Dynamics NAV',
    skillFile: '.claude/skills/nav-query-writer.md',
    description: 'Microsoft Dynamics NAV / Business Central On-Prem'
  },
  AX: {
    type: 'AX',
    displayName: 'Dynamics AX',
    skillFile: '.claude/skills/ax-query-writer.md',
    description: 'Microsoft Dynamics AX'
  },
  OTHER: {
    type: 'OTHER',
    displayName: 'Other System',
    skillFile: '',
    description: 'Custom or unsupported ERP system'
  }
};

export function getSourceSystemConfig(type: SourceSystemType): SourceSystemConfig {
  return SOURCE_SYSTEMS[type] || SOURCE_SYSTEMS.OTHER;
}

// ============ Field Types ============

export interface FieldInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown';
  nullable: boolean;
  maxLength?: number;
  sampleValues?: any[];
}

// ============ Query Types ============

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  sql: string;
  sourceTable?: string;
  executedAt: string;
  rowCount: number;
  fields: FieldInfo[];
  results: Record<string, any>[];
}

// ============ Transform Types ============

export type TransformType =
  | 'truncate'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'replace'
  | 'format'
  | 'lookup'
  | 'default'
  | 'concat'
  | 'split'
  | 'custom';

export interface Transform {
  type: TransformType;
  params?: Record<string, any>;
  // For truncate: { length: number }
  // For replace: { find: string, replace: string }
  // For format: { pattern: string }
  // For lookup: { table: string, keyField: string, valueField: string }
  // For default: { value: any }
  // For concat: { fields: string[], separator: string }
  // For split: { delimiter: string, index: number }
  // For custom: { expression: string }
}

// ============ Field Mapping Types ============

export interface FieldMapping {
  id: string;
  sourceField: string;
  targetField: string;
  transform?: Transform;
  description?: string;
  required: boolean;
}

// ============ Rule Types ============

export type RuleType =
  | 'filter'
  | 'validate'
  | 'lookup'
  | 'aggregate'
  | 'skip'
  | 'custom';

export interface MappingRule {
  id: string;
  type: RuleType;
  name: string;
  description?: string;
  enabled: boolean;
  // For filter: condition to include/exclude rows
  condition?: string;
  // For validate: validation expression
  validation?: string;
  errorMessage?: string;
  // For lookup: external lookup configuration
  lookupConfig?: {
    sourceField: string;
    lookupQueryId: string;
    lookupKeyField: string;
    lookupValueField: string;
    targetField: string;
  };
  // For custom: arbitrary configuration
  config?: Record<string, any>;
}

// ============ Target Entity Types ============

export interface TargetField {
  name: string;
  type: string;
  required: boolean;
  maxLength?: number;
  description?: string;
}

export interface TargetEntity {
  name: string;
  displayName: string;
  apiEndpoint?: string;
  fields: TargetField[];
}

// ============ Mapping Types ============

export interface Mapping {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  sourceQueryId: string;
  targetEntity: string;
  fieldMappings: FieldMapping[];
  rules: MappingRule[];
  status: 'draft' | 'ready' | 'tested' | 'deployed';
}

// ============ Project Types ============

export interface MigrationProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  sourceSystem: SourceSystemType;
  sourceSystemConfig?: SourceSystemConfig;  // Denormalized for easy access
  targetSystem: 'Business Central';
  queries: SavedQuery[];
  mappings: Mapping[];
  targetEntities: TargetEntity[];
  settings: ProjectSettings;
}

export interface ProjectSettings {
  defaultBatchSize: number;
  continueOnError: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  outputFormat: 'json' | 'csv' | 'api';
}

// ============ Default Values ============

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultBatchSize: 100,
  continueOnError: true,
  logLevel: 'info',
  outputFormat: 'json'
};

export function createNewProject(name: string, sourceSystem: SourceSystemType = 'GP'): MigrationProject {
  const now = new Date().toISOString();
  const config = getSourceSystemConfig(sourceSystem);
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    sourceSystem,
    sourceSystemConfig: config,
    targetSystem: 'Business Central',
    queries: [],
    mappings: [],
    targetEntities: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS }
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============ BOM Types ============

/**
 * GP BOM Record - source data from BM00101/BM00111
 */
export interface GPBOMRecord {
  ParentItem: string;
  ParentShortItem?: string;
  ParentDesc?: string;
  ComponentItem: string;
  ComponentShortItem?: string;
  ComponentDesc?: string;
  QtyPer: number;
  CompUOM: string;
  LineNo?: number;
  BM_Stock_Method?: number;  // 1=Stock, 2=Phantom
  Scrap_Percentage?: number;
}

/**
 * BC Assembly BOM Line - target format for VOLT Batch API
 */
export interface BCAssemblyBOMLine {
  lineNo: number;
  type: 'Item' | 'Resource';
  no: string;
  description?: string;
  unitOfMeasureCode: string;
  quantityPer: number;
  position?: string;
}

/**
 * BC Assembly BOM Header with lines - for batch import
 */
export interface BCAssemblyBOM {
  parentItemNo: string;
  bomLines: BCAssemblyBOMLine[];
}

/**
 * BOM Analysis Result - statistics and insights
 */
export interface BOMAnalysisResult {
  totalRecords: number;
  uniqueParentItems: number;
  uniqueComponents: number;
  avgComponentsPerParent: number;
  maxComponentsPerParent: number;
  minComponentsPerParent: number;
  stockMethodDistribution: {
    stock: number;    // BM_Stock_Method = 1
    phantom: number;  // BM_Stock_Method = 2
    unknown: number;
  };
  uomDistribution: Record<string, number>;
  warnings: string[];
}

/**
 * BOM Validation Result
 */
export interface BOMValidationResult {
  valid: boolean;
  errors: BOMValidationError[];
  warnings: string[];
  recordCount: number;
  validCount: number;
  errorCount: number;
}

export interface BOMValidationError {
  recordIndex: number;
  parentItem: string;
  componentItem: string;
  field: string;
  message: string;
}
