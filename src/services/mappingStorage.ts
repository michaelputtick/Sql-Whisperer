/**
 * SQLWhisperer Mapping Storage Service
 * Handles persistence of migration projects, queries, and mappings to JSON files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  MigrationProject,
  SavedQuery,
  Mapping,
  FieldInfo,
  FieldMapping,
  MappingRule,
  TargetEntity,
  SourceSystemType,
  createNewProject,
  generateId
} from '../types/mapping';

const STORAGE_DIR = path.join(os.homedir(), '.sqlwhisperer', 'projects');
const PROJECTS_INDEX_FILE = path.join(STORAGE_DIR, 'index.json');

// ============ Storage Initialization ============

export function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// ============ Project Management ============

export function listProjects(): { id: string; name: string; updatedAt: string; sourceSystem?: SourceSystemType }[] {
  ensureStorageDir();

  if (!fs.existsSync(PROJECTS_INDEX_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(PROJECTS_INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveProjectIndex(projects: { id: string; name: string; updatedAt: string; sourceSystem?: SourceSystemType }[]): void {
  ensureStorageDir();
  fs.writeFileSync(PROJECTS_INDEX_FILE, JSON.stringify(projects, null, 2));
}

export function getProjectPath(projectId: string): string {
  return path.join(STORAGE_DIR, `${projectId}.json`);
}

export function loadProject(projectId: string): MigrationProject | null {
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(projectPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveProject(project: MigrationProject): void {
  ensureStorageDir();

  // Update timestamp
  project.updatedAt = new Date().toISOString();

  // Save project file
  const projectPath = getProjectPath(project.id);
  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));

  // Update index
  const projects = listProjects();
  const existingIndex = projects.findIndex(p => p.id === project.id);

  const indexEntry = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    sourceSystem: project.sourceSystem
  };

  if (existingIndex >= 0) {
    projects[existingIndex] = indexEntry;
  } else {
    projects.push(indexEntry);
  }

  saveProjectIndex(projects);
}

export function deleteProject(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);

  if (fs.existsSync(projectPath)) {
    fs.unlinkSync(projectPath);
  }

  const projects = listProjects().filter(p => p.id !== projectId);
  saveProjectIndex(projects);

  return true;
}

export function createProject(name: string, sourceSystem: SourceSystemType = 'GP'): MigrationProject {
  const project = createNewProject(name, sourceSystem);
  saveProject(project);
  return project;
}

// ============ Query Management ============

export function addQueryToProject(
  projectId: string,
  query: Omit<SavedQuery, 'id'>
): SavedQuery | null {
  const project = loadProject(projectId);
  if (!project) return null;

  const newQuery: SavedQuery = {
    ...query,
    id: generateId()
  };

  project.queries.push(newQuery);
  saveProject(project);

  return newQuery;
}

export function updateQuery(projectId: string, query: SavedQuery): boolean {
  const project = loadProject(projectId);
  if (!project) return false;

  const index = project.queries.findIndex(q => q.id === query.id);
  if (index < 0) return false;

  project.queries[index] = query;
  saveProject(project);

  return true;
}

export function deleteQuery(projectId: string, queryId: string): boolean {
  const project = loadProject(projectId);
  if (!project) return false;

  project.queries = project.queries.filter(q => q.id !== queryId);
  saveProject(project);

  return true;
}

// ============ Mapping Management ============

export function addMappingToProject(
  projectId: string,
  mapping: Omit<Mapping, 'id' | 'createdAt' | 'updatedAt'>
): Mapping | null {
  const project = loadProject(projectId);
  if (!project) return null;

  const now = new Date().toISOString();
  const newMapping: Mapping = {
    ...mapping,
    id: generateId(),
    createdAt: now,
    updatedAt: now
  };

  project.mappings.push(newMapping);
  saveProject(project);

  return newMapping;
}

export function updateMapping(projectId: string, mapping: Mapping): boolean {
  const project = loadProject(projectId);
  if (!project) return false;

  const index = project.mappings.findIndex(m => m.id === mapping.id);
  if (index < 0) return false;

  mapping.updatedAt = new Date().toISOString();
  project.mappings[index] = mapping;
  saveProject(project);

  return true;
}

export function deleteMapping(projectId: string, mappingId: string): boolean {
  const project = loadProject(projectId);
  if (!project) return false;

  project.mappings = project.mappings.filter(m => m.id !== mappingId);
  saveProject(project);

  return true;
}

// ============ Field Analysis ============

export function inferFieldType(values: any[]): FieldInfo['type'] {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

  if (nonNullValues.length === 0) return 'unknown';

  // Check if all values are numbers
  if (nonNullValues.every(v => !isNaN(Number(v)) && typeof v !== 'boolean')) {
    return 'number';
  }

  // Check if all values are booleans
  if (nonNullValues.every(v =>
    typeof v === 'boolean' ||
    v === 'true' || v === 'false' ||
    v === '1' || v === '0' ||
    v === 1 || v === 0
  )) {
    return 'boolean';
  }

  // Check for dates (ISO format or common date patterns)
  const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
  if (nonNullValues.every(v => typeof v === 'string' && datePattern.test(v))) {
    const hasTime = nonNullValues.some(v => v.includes('T'));
    return hasTime ? 'datetime' : 'date';
  }

  return 'string';
}

export function analyzeQueryResults(results: Record<string, any>[]): FieldInfo[] {
  if (results.length === 0) return [];

  const fields: Map<string, FieldInfo> = new Map();

  // Get all unique field names
  const fieldNames = new Set<string>();
  results.forEach(row => {
    Object.keys(row).forEach(key => fieldNames.add(key));
  });

  // Analyze each field
  fieldNames.forEach(name => {
    const values = results.map(row => row[name]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined);
    const stringValues = nonNullValues.filter(v => typeof v === 'string');
    const maxLength = stringValues.length > 0
      ? Math.max(...stringValues.map(v => v.length))
      : undefined;

    fields.set(name, {
      name,
      type: inferFieldType(values),
      nullable: values.some(v => v === null || v === undefined || v === ''),
      maxLength,
      sampleValues: nonNullValues.slice(0, 5)
    });
  });

  return Array.from(fields.values());
}

// ============ Target Entities (Business Central) ============

export const BC_TARGET_ENTITIES: TargetEntity[] = [
  {
    name: 'Customer',
    displayName: 'Customers',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/customerImportBatches',
    fields: [
      { name: 'number', type: 'string', required: true, maxLength: 20 },
      { name: 'displayName', type: 'string', required: true, maxLength: 100 },
      { name: 'addressLine1', type: 'string', required: false, maxLength: 100 },
      { name: 'addressLine2', type: 'string', required: false, maxLength: 50 },
      { name: 'city', type: 'string', required: false, maxLength: 30 },
      { name: 'state', type: 'string', required: false, maxLength: 30 },
      { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
      { name: 'country', type: 'string', required: false, maxLength: 10 },
      { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'paymentTermsCode', type: 'string', required: false, maxLength: 10 },
      { name: 'paymentMethodCode', type: 'string', required: false, maxLength: 10 },
      { name: 'shipmentMethodCode', type: 'string', required: false, maxLength: 10 },
      { name: 'salespersonCode', type: 'string', required: false, maxLength: 20 },
      { name: 'creditLimit', type: 'number', required: false },
      { name: 'taxRegistrationNumber', type: 'string', required: false, maxLength: 30 }
    ]
  },
  {
    name: 'ShipToAddress',
    displayName: 'Ship-To Addresses',
    apiEndpoint: 'Nested in customerImportBatches',
    fields: [
      { name: 'code', type: 'string', required: true, maxLength: 10 },
      { name: 'name', type: 'string', required: true, maxLength: 100 },
      { name: 'address', type: 'string', required: false, maxLength: 100 },
      { name: 'address2', type: 'string', required: false, maxLength: 50 },
      { name: 'city', type: 'string', required: false, maxLength: 30 },
      { name: 'state', type: 'string', required: false, maxLength: 30 },
      { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
      { name: 'countryRegionCode', type: 'string', required: false, maxLength: 10 },
      { name: 'contact', type: 'string', required: false, maxLength: 100 },
      { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 }
    ]
  },
  {
    name: 'Vendor',
    displayName: 'Vendors',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/vendorImportBatches',
    fields: [
      { name: 'number', type: 'string', required: true, maxLength: 20 },
      { name: 'displayName', type: 'string', required: true, maxLength: 100 },
      { name: 'addressLine1', type: 'string', required: false, maxLength: 100 },
      { name: 'addressLine2', type: 'string', required: false, maxLength: 50 },
      { name: 'city', type: 'string', required: false, maxLength: 30 },
      { name: 'state', type: 'string', required: false, maxLength: 30 },
      { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
      { name: 'country', type: 'string', required: false, maxLength: 10 },
      { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'paymentTermsCode', type: 'string', required: false, maxLength: 10 },
      { name: 'paymentMethodCode', type: 'string', required: false, maxLength: 10 },
      { name: 'taxRegistrationNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'contact', type: 'string', required: false, maxLength: 100 }
    ]
  },
  {
    name: 'RemitToAddress',
    displayName: 'Remit-To Addresses',
    apiEndpoint: 'Nested in vendorImportBatches',
    fields: [
      { name: 'code', type: 'string', required: true, maxLength: 10 },
      { name: 'name', type: 'string', required: true, maxLength: 100 },
      { name: 'address', type: 'string', required: false, maxLength: 100 },
      { name: 'address2', type: 'string', required: false, maxLength: 50 },
      { name: 'city', type: 'string', required: false, maxLength: 30 },
      { name: 'state', type: 'string', required: false, maxLength: 30 },
      { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
      { name: 'countryRegionCode', type: 'string', required: false, maxLength: 10 },
      { name: 'contact', type: 'string', required: false, maxLength: 100 },
      { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 }
    ]
  },
  {
    name: 'Item',
    displayName: 'Items',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/itemImportBatches',
    fields: [
      { name: 'number', type: 'string', required: true, maxLength: 20, description: 'Short Item Number' },
      { name: 'displayName', type: 'string', required: true, maxLength: 100 },
      { name: 'description2', type: 'string', required: false, maxLength: 50, description: 'Long Item Number' },
      { name: 'itemType', type: 'string', required: true, description: 'Inventory or Service' },
      { name: 'baseUnitOfMeasure', type: 'string', required: true, maxLength: 10 },
      { name: 'salesUnitOfMeasure', type: 'string', required: false, maxLength: 10 },
      { name: 'purchUnitOfMeasure', type: 'string', required: false, maxLength: 10 },
      { name: 'unitCost', type: 'number', required: false },
      { name: 'inventoryPostingGroup', type: 'string', required: false, maxLength: 20 },
      { name: 'genProdPostingGroup', type: 'string', required: false, maxLength: 20 },
      { name: 'costingMethod', type: 'string', required: false, description: 'FIFO, LIFO, Average' },
      { name: 'vendorItemNo', type: 'string', required: false, maxLength: 50 },
      { name: 'blocked', type: 'boolean', required: false }
    ]
  },
  {
    name: 'ItemUnitOfMeasure',
    displayName: 'Item Units of Measure',
    apiEndpoint: 'Nested in itemImportBatches',
    fields: [
      { name: 'code', type: 'string', required: true, maxLength: 10 },
      { name: 'qtyPerUnitOfMeasure', type: 'number', required: true }
    ]
  },
  {
    name: 'PriceListLine',
    displayName: 'Price List Lines',
    apiEndpoint: 'Nested in itemImportBatches',
    fields: [
      { name: 'priceListCode', type: 'string', required: true, maxLength: 20 },
      { name: 'itemNo', type: 'string', required: true, maxLength: 20 },
      { name: 'unitOfMeasureCode', type: 'string', required: true, maxLength: 10 },
      { name: 'minimumQuantity', type: 'number', required: true },
      { name: 'unitPrice', type: 'number', required: true }
    ]
  },
  {
    name: 'Contact',
    displayName: 'Contacts',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/contactImportBatches',
    fields: [
      { name: 'firstName', type: 'string', required: false, maxLength: 30 },
      { name: 'middleName', type: 'string', required: false, maxLength: 30 },
      { name: 'surname', type: 'string', required: false, maxLength: 30 },
      { name: 'jobTitle', type: 'string', required: false, maxLength: 30 },
      { name: 'customerNo', type: 'string', required: false, maxLength: 20 },
      { name: 'vendorNo', type: 'string', required: false, maxLength: 20 },
      { name: 'addressLine1', type: 'string', required: false, maxLength: 100 },
      { name: 'addressLine2', type: 'string', required: false, maxLength: 50 },
      { name: 'city', type: 'string', required: false, maxLength: 30 },
      { name: 'state', type: 'string', required: false, maxLength: 30 },
      { name: 'postalCode', type: 'string', required: false, maxLength: 20 },
      { name: 'country', type: 'string', required: false, maxLength: 10 },
      { name: 'phoneNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'mobilePhoneNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'email', type: 'string', required: false, maxLength: 80 },
      { name: 'faxNumber', type: 'string', required: false, maxLength: 30 },
      { name: 'salespersonCode', type: 'string', required: false, maxLength: 20 }
    ]
  },
  {
    name: 'ItemAttribute',
    displayName: 'Item Attributes',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/itemAttributeImportBatches',
    fields: [
      { name: 'id', type: 'number', required: true },
      { name: 'name', type: 'string', required: true, maxLength: 250 },
      { name: 'type', type: 'string', required: true, description: 'OPTION, TEXT, INTEGER, DECIMAL, DATE, BOOLEAN' }
    ]
  },
  {
    name: 'ItemAttributeValue',
    displayName: 'Item Attribute Values',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/itemAttributeValueImportBatches',
    fields: [
      { name: 'attributeId', type: 'number', required: true },
      { name: 'id', type: 'number', required: true },
      { name: 'value', type: 'string', required: true, maxLength: 250 }
    ]
  },
  {
    name: 'ItemAttributeValueMapping',
    displayName: 'Item Attribute Value Mappings',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/itemAttributeMappingImportBatches',
    fields: [
      { name: 'itemNo', type: 'string', required: true, maxLength: 20 },
      { name: 'attributeId', type: 'number', required: true },
      { name: 'valueId', type: 'number', required: true }
    ]
  },
  {
    name: 'ItemReference',
    displayName: 'Item References',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/itemRefImportBatches',
    fields: [
      { name: 'itemNo', type: 'string', required: true, maxLength: 20 },
      { name: 'referenceType', type: 'string', required: true, description: 'VENDOR, CUSTOMER, BAR CODE' },
      { name: 'referenceTypeNo', type: 'string', required: false, maxLength: 20, description: 'Vendor/Customer No.' },
      { name: 'referenceNo', type: 'string', required: true, maxLength: 50 },
      { name: 'description', type: 'string', required: false, maxLength: 100 },
      { name: 'unitOfMeasureCode', type: 'string', required: false, maxLength: 10 }
    ]
  },
  {
    name: 'BOM',
    displayName: 'Bill of Materials',
    apiEndpoint: '/api/VOLT/VOLT/v1.0/companies({companyId})/bomImportBatches',
    fields: [
      { name: 'parentItemNo', type: 'string', required: true, maxLength: 20, description: 'BC Item No. for parent item (sets Assembly BOM flag)' }
    ]
  },
  {
    name: 'BOMComponent',
    displayName: 'BOM Components',
    apiEndpoint: 'Nested in bomImportBatches',
    fields: [
      { name: 'lineNumber', type: 'number', required: true, description: 'Line number (typically increments of 10000)' },
      { name: 'componentNo', type: 'string', required: true, maxLength: 20, description: 'BC Item No. for component item' },
      { name: 'quantityPer', type: 'number', required: true, description: 'Quantity of component per parent item' }
    ]
  }
];

export function getTargetEntity(name: string): TargetEntity | undefined {
  return BC_TARGET_ENTITIES.find(e => e.name === name);
}

// ============ Export for CLI ============

export const mappingStorage = {
  listProjects,
  loadProject,
  saveProject,
  createProject,
  deleteProject,
  addQueryToProject,
  updateQuery,
  deleteQuery,
  addMappingToProject,
  updateMapping,
  deleteMapping,
  analyzeQueryResults,
  getTargetEntity,
  BC_TARGET_ENTITIES
};
