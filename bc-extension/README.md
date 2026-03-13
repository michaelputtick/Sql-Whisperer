# SQLWhisperer BC Extension

This Business Central extension provides migration result tracking for use with SQLWhisperer.

## Features

- **Migration Result Table** - Stores migration results with status, error messages, and batch tracking
- **Migration Result List Page** - UI for viewing and managing migration results in BC
- **Migration Result API** - Read-only API endpoint for SQLWhisperer to query results

## Installation

1. Open this folder in VS Code with the AL Language extension
2. Download symbols (Ctrl+Shift+P > AL: Download Symbols)
3. Publish to your Business Central environment (Ctrl+Shift+P > AL: Publish)

## Object IDs

This extension uses the 50100-50199 ID range:

| Object | ID | Name |
|--------|-----|------|
| Enum | 50109 | SQLW Migration Result Status |
| Table | 50139 | SQLW Migration Result |
| Page | 50180 | SQLW Migration Result API |
| Page | 50181 | SQLW Migration Result List |

## API Endpoint

Once published, the API is available at:
```
GET /api/SQLW/SQLW/v1.0/companies({companyId})/migrationResults
```

### Query Examples

```bash
# Get all results
GET /api/SQLW/SQLW/v1.0/companies({companyId})/migrationResults

# Filter by status
GET /api/SQLW/SQLW/v1.0/companies({companyId})/migrationResults?$filter=status eq 'Error'

# Filter by migration type
GET /api/SQLW/SQLW/v1.0/companies({companyId})/migrationResults?$filter=migrationType eq 'Customer'

# Top N results
GET /api/SQLW/SQLW/v1.0/companies({companyId})/migrationResults?$top=50
```

## Usage with SQLWhisperer CLI

Configure your BC environment in SQLWhisperer:
```bash
npm run sqlw -- config set bc.environmentUrl "https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name"
npm run sqlw -- config set bc.companyId "company-guid"
```

Then query migration results:
```bash
npm run sqlw -- bc results           # View recent results
npm run sqlw -- bc errors            # View errors only
npm run sqlw -- bc summary           # View summary statistics
```

## Logging Results

Your migration codeunits can log results using the table's helper methods:

```al
var
    MigrationResult: Record "SQLW Migration Result";
begin
    // Log success
    MigrationResult.LogSuccess('Customer', CustomerNo);

    // Log error
    MigrationResult.LogError('Customer', CustomerNo, GetLastErrorText());

    // Log skipped
    MigrationResult.LogSkipped('Customer', CustomerNo, 'Already exists');
end;
```

## Customization

If you need to customize the ID range for your environment, update `app.json` and rename the object IDs in all `.al` files accordingly.
