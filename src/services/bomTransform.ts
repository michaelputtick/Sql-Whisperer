/**
 * BOM Transformation Service
 * Handles GP BOM data transformation to BC Assembly BOM format
 */

import {
  GPBOMRecord,
  BCAssemblyBOMLine,
  BCAssemblyBOM,
  BOMAnalysisResult,
  BOMValidationResult,
  BOMValidationError
} from '../types/mapping';

/**
 * Analyze GP BOM data for statistics and insights
 */
export function analyzeBOMData(records: GPBOMRecord[]): BOMAnalysisResult {
  const warnings: string[] = [];

  // Get unique parent items
  const parentItems = new Set(records.map(r => r.ParentShortItem || r.ParentItem));
  const componentItems = new Set(records.map(r => r.ComponentShortItem || r.ComponentItem));

  // Count components per parent
  const componentsPerParent: Record<string, number> = {};
  records.forEach(r => {
    const parent = r.ParentShortItem || r.ParentItem;
    componentsPerParent[parent] = (componentsPerParent[parent] || 0) + 1;
  });

  const componentCounts = Object.values(componentsPerParent);
  const avgComponents = componentCounts.length > 0
    ? componentCounts.reduce((a, b) => a + b, 0) / componentCounts.length
    : 0;

  // Stock method distribution
  const stockMethodDist = { stock: 0, phantom: 0, unknown: 0 };
  const seenParents = new Set<string>();
  records.forEach(r => {
    const parent = r.ParentShortItem || r.ParentItem;
    if (!seenParents.has(parent)) {
      seenParents.add(parent);
      if (r.BM_Stock_Method === 1) stockMethodDist.stock++;
      else if (r.BM_Stock_Method === 2) stockMethodDist.phantom++;
      else stockMethodDist.unknown++;
    }
  });

  // UoM distribution
  const uomDist: Record<string, number> = {};
  records.forEach(r => {
    const uom = (r.CompUOM || 'UNKNOWN').trim().toUpperCase();
    uomDist[uom] = (uomDist[uom] || 0) + 1;
  });

  // Check for potential issues
  records.forEach((r, i) => {
    const parent = r.ParentShortItem || r.ParentItem;
    const component = r.ComponentShortItem || r.ComponentItem;

    // Self-referencing BOM
    if (parent === component) {
      warnings.push(`Record ${i}: Item "${parent}" references itself as a component`);
    }

    // Missing descriptions
    if (!r.ParentDesc && !r.ComponentDesc) {
      warnings.push(`Record ${i}: Missing descriptions for parent "${parent}"`);
    }

    // Zero or negative quantity
    if (r.QtyPer <= 0) {
      warnings.push(`Record ${i}: Invalid quantity ${r.QtyPer} for component "${component}"`);
    }
  });

  return {
    totalRecords: records.length,
    uniqueParentItems: parentItems.size,
    uniqueComponents: componentItems.size,
    avgComponentsPerParent: Math.round(avgComponents * 100) / 100,
    maxComponentsPerParent: componentCounts.length > 0 ? Math.max(...componentCounts) : 0,
    minComponentsPerParent: componentCounts.length > 0 ? Math.min(...componentCounts) : 0,
    stockMethodDistribution: stockMethodDist,
    uomDistribution: uomDist,
    warnings: warnings.slice(0, 50) // Limit warnings
  };
}

/**
 * Transform GP BOM records to BC Assembly BOM format
 */
export function transformToBCFormat(records: GPBOMRecord[]): BCAssemblyBOM[] {
  // Group records by parent item
  const grouped: Record<string, GPBOMRecord[]> = {};

  records.forEach(r => {
    const parent = (r.ParentShortItem || r.ParentItem || '').trim();
    if (!grouped[parent]) {
      grouped[parent] = [];
    }
    grouped[parent].push(r);
  });

  // Transform each group to BC format
  const result: BCAssemblyBOM[] = [];

  for (const [parentItemNo, components] of Object.entries(grouped)) {
    if (!parentItemNo) continue;

    // Sort by line number/order
    components.sort((a, b) => (a.LineNo || 0) - (b.LineNo || 0));

    // Transform components to BOM lines
    const bomLines: BCAssemblyBOMLine[] = components.map((c, index) => ({
      lineNo: (index + 1) * 10000,
      type: 'Item' as const,
      no: (c.ComponentShortItem || c.ComponentItem || '').trim().substring(0, 20),
      description: (c.ComponentDesc || '').trim().substring(0, 100) || undefined,
      unitOfMeasureCode: (c.CompUOM || 'EACH').trim().toUpperCase().substring(0, 10),
      quantityPer: c.QtyPer || 1,
      position: c.LineNo ? String(c.LineNo).padStart(5, '0') : undefined
    }));

    result.push({
      parentItemNo: parentItemNo.substring(0, 20),
      bomLines
    });
  }

  // Sort by parent item number
  result.sort((a, b) => a.parentItemNo.localeCompare(b.parentItemNo));

  return result;
}

/**
 * Validate BOM data for BC import
 */
export function validateForBC(records: GPBOMRecord[]): BOMValidationResult {
  const errors: BOMValidationError[] = [];
  const warnings: string[] = [];
  let validCount = 0;

  records.forEach((r, index) => {
    const parent = r.ParentShortItem || r.ParentItem || '';
    const component = r.ComponentShortItem || r.ComponentItem || '';
    let recordValid = true;

    // Required field checks
    if (!parent.trim()) {
      errors.push({
        recordIndex: index,
        parentItem: parent,
        componentItem: component,
        field: 'ParentItem',
        message: 'Parent item number is required'
      });
      recordValid = false;
    }

    if (!component.trim()) {
      errors.push({
        recordIndex: index,
        parentItem: parent,
        componentItem: component,
        field: 'ComponentItem',
        message: 'Component item number is required'
      });
      recordValid = false;
    }

    // Self-reference check
    if (parent.trim() === component.trim() && parent.trim()) {
      errors.push({
        recordIndex: index,
        parentItem: parent,
        componentItem: component,
        field: 'ComponentItem',
        message: 'Component cannot be the same as parent (circular reference)'
      });
      recordValid = false;
    }

    // Quantity check
    if (r.QtyPer === undefined || r.QtyPer === null) {
      errors.push({
        recordIndex: index,
        parentItem: parent,
        componentItem: component,
        field: 'QtyPer',
        message: 'Quantity per is required'
      });
      recordValid = false;
    } else if (r.QtyPer <= 0) {
      errors.push({
        recordIndex: index,
        parentItem: parent,
        componentItem: component,
        field: 'QtyPer',
        message: `Quantity per must be greater than zero (found: ${r.QtyPer})`
      });
      recordValid = false;
    }

    // UoM check
    if (!r.CompUOM || !r.CompUOM.trim()) {
      warnings.push(`Record ${index}: Missing unit of measure for component "${component}", defaulting to EACH`);
    }

    // Length checks
    if (parent.length > 20) {
      warnings.push(`Record ${index}: Parent item "${parent}" exceeds 20 chars, will be truncated`);
    }

    if (component.length > 20) {
      warnings.push(`Record ${index}: Component item "${component}" exceeds 20 chars, will be truncated`);
    }

    if (recordValid) validCount++;
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.slice(0, 100), // Limit warnings
    recordCount: records.length,
    validCount,
    errorCount: errors.length
  };
}

/**
 * Export to VOLT Batch API JSON format
 */
export function exportToJSON(boms: BCAssemblyBOM[]): string {
  return JSON.stringify(boms, null, 2);
}

/**
 * Export to flat CSV format
 */
export function exportToCSV(boms: BCAssemblyBOM[]): string {
  const headers = ['parentItemNo', 'lineNo', 'type', 'no', 'description', 'unitOfMeasureCode', 'quantityPer', 'position'];
  const lines: string[] = [headers.join(',')];

  boms.forEach(bom => {
    bom.bomLines.forEach(line => {
      const row = [
        escapeCSV(bom.parentItemNo),
        line.lineNo,
        escapeCSV(line.type),
        escapeCSV(line.no),
        escapeCSV(line.description || ''),
        escapeCSV(line.unitOfMeasureCode),
        line.quantityPer,
        escapeCSV(line.position || '')
      ];
      lines.push(row.join(','));
    });
  });

  return lines.join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Get standard BOM query SQL
 */
export function getStandardBOMQuery(): string {
  return `SELECT
  h.ITEMNMBR AS ParentItem,
  parent.ITMSHNAM AS ParentShortItem,
  RTRIM(parent.ITEMDESC) AS ParentDesc,
  h.BM_Stock_Method,
  c.ORD AS [LineNo],
  c.CMPTITNM AS ComponentItem,
  comp.ITMSHNAM AS ComponentShortItem,
  RTRIM(comp.ITEMDESC) AS ComponentDesc,
  c.Design_Qty AS QtyPer,
  c.Scrap_Percentage,
  c.UOFM AS CompUOM
FROM dbo.BM00101 h
INNER JOIN dbo.BM00111 c ON h.ITEMNMBR = c.ITEMNMBR AND h.Bill_Status = c.Bill_Status
LEFT JOIN dbo.IV00101 parent ON RTRIM(h.ITEMNMBR) = RTRIM(parent.ITEMNMBR)
LEFT JOIN dbo.IV00101 comp ON RTRIM(c.CMPTITNM) = RTRIM(comp.ITEMNMBR)
WHERE h.Bill_Status = 1
  AND parent.ITMSHNAM IS NOT NULL
  AND comp.ITMSHNAM IS NOT NULL
ORDER BY parent.ITMSHNAM, c.ORD`;
}

// Export service object
export const bomTransformService = {
  analyzeBOMData,
  transformToBCFormat,
  validateForBC,
  exportToJSON,
  exportToCSV,
  getStandardBOMQuery
};
