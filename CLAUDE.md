# SQLWhisperer - Claude Instructions

This is the SQLWhisperer application for ERP to Business Central migrations. You have access to CLI tools to interact with Azure Data Factory pipelines.

---

## CRITICAL: READ-ONLY QUERIES ONLY

**You must ONLY generate SELECT statements when writing SQL.**

- NEVER generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, or EXEC statements
- NEVER generate stored procedure calls
- NEVER generate DDL (CREATE, ALTER, DROP)
- All queries are for DATA EXTRACTION only
- If asked to modify source data, refuse and explain this tool is read-only

---

## Query & Mapping Skills

### Source Systems (READ-ONLY queries)
| Source System | Skill File |
|---------------|------------|
| Great Plains (GP) | `.claude/skills/gp-query-writer.md` |
| Dynamics NAV | `.claude/skills/nav-query-writer.md` |
| Dynamics AX | `.claude/skills/ax-query-writer.md` |

### Target System
| Target | Skill File |
|--------|------------|
| Business Central | `.claude/skills/bc-target-writer.md` |

These skills contain table schemas, API patterns, naming conventions, and common transforms. Reference them when writing queries or mapping fields.

## Available CLI Tool: `sqlw`

Run with: `npm run sqlw -- <command>` or after building: `node dist/cli/sqlw.js <command>`

### Commands

#### Configuration
```bash
# View current configuration
npm run sqlw -- config get

# Set a configuration value
npm run sqlw -- config set azure.subscriptionId "your-subscription-id"
npm run sqlw -- config set azure.resourceGroup "your-resource-group"
npm run sqlw -- config set paths.adfRepoPath "C:/path/to/adf/repo"
```

#### ADF Pipeline Operations
```bash
# List available pipelines in the ADF repo
npm run sqlw -- adf list

# Set a SQL query in the SQLWhisperer pipeline
npm run sqlw -- adf query "SELECT TOP 10 * FROM IV00101"

# Trigger pipeline (after publishing)
npm run sqlw -- adf trigger              # Triggers SQLWhisperer pipeline
npm run sqlw -- adf trigger PipelineName # Triggers specific pipeline

# Trigger and wait for completion
npm run sqlw -- adf run                  # Trigger SQLWhisperer and wait

# Check pipeline run status
npm run sqlw -- adf status <runId>

# Wait for a running pipeline
npm run sqlw -- adf wait <runId>

# Read a pipeline's JSON configuration
npm run sqlw -- adf read-pipeline SQLWhisperer

# Read pipeline results
npm run sqlw -- adf results
npm run sqlw -- adf results custom-output.json
```

#### Git Operations
```bash
# Check git status of ADF repo
npm run sqlw -- git status

# Commit and push changes
npm run sqlw -- git push "Updated SQL query for inventory lookup"
```

#### Business Central Migration Results
```bash
# View recent migration results (last 50)
npm run sqlw -- bc results

# Filter by migration type
npm run sqlw -- bc results --type Customer
npm run sqlw -- bc results --type Item
npm run sqlw -- bc results --type Vendor

# Filter by status
npm run sqlw -- bc results --status Error
npm run sqlw -- bc results --status Success

# Filter by batch ID
npm run sqlw -- bc results --batch 123

# Combine filters
npm run sqlw -- bc results --type Customer --status Error --top 100

# Output formats
npm run sqlw -- bc results --format json     # Raw JSON
npm run sqlw -- bc results --format summary  # Statistics summary
npm run sqlw -- bc results --format table    # Table view (default)

# Shortcuts
npm run sqlw -- bc errors    # Show errors only
npm run sqlw -- bc summary   # Show summary statistics
```

## Workflow for Running Queries

When the user asks you to query GP data:

1. **Set the SQL Query**
   ```bash
   npm run sqlw -- adf query "SELECT TOP 100 * FROM IV00101 WHERE ITEMTYPE = 1"
   ```

2. **Push to Git** (this triggers ADF to sync)
   ```bash
   npm run sqlw -- git push "Query: Get inventory items"
   ```

3. **Ask user to publish** the ADF pipeline in Azure Portal (required after git sync)

4. **Trigger the pipeline and wait for completion**
   ```bash
   npm run sqlw -- adf run
   ```

5. **Read Results** after the pipeline completes
   ```bash
   npm run sqlw -- adf results
   ```

6. **Analyze** the results and provide insights based on the user's request

## ERP Table Reference

For detailed table schemas, field names, and query patterns:

- **GP**: See `.claude/skills/gp-query-writer.md` for full table reference
- **NAV**: See `.claude/skills/nav-query-writer.md` for full table reference
- **AX**: See `.claude/skills/ax-query-writer.md` for full table reference

### Quick Reference (GP)
- `IV00101` - Item Master
- `IV00102` - Item Quantity Master
- `IV00108` - Item Vendor
- `PM00200` - Vendor Master
- `RM00101` - Customer Master
- `SOP10100/SOP10200` - Sales Orders
- `POP10100/POP10110` - Purchase Orders
- `BM00101/BM00111` - Bill of Materials

## Important Notes

- Always use `npm run sqlw --` prefix when running commands
- The ADF repo path is configured in the config file
- Results are typically stored in the configured results path or ADF output folder
- After pushing changes, ADF needs to be published (manual step in Azure Portal)
- To trigger pipelines, Azure credentials must be configured:
  ```bash
  npm run sqlw -- config set azure.subscriptionId "your-subscription-id"
  npm run sqlw -- config set azure.resourceGroup "your-resource-group"
  npm run sqlw -- config set azure.factoryName "your-factory-name"
  ```
- To access BC migration results, BC API must be configured:
  ```bash
  npm run sqlw -- config set bc.environmentUrl "https://api.businesscentral.dynamics.com/v2.0/tenant-id/environment-name"
  npm run sqlw -- config set bc.companyId "company-guid"
  ```
- Uses Azure CLI credential for authentication (run `az login` first)
