# NAV Query Writer

Expert skill for writing SQL queries against Dynamics NAV / Business Central On-Prem databases.

---

## CRITICAL: READ-ONLY QUERIES ONLY

**This skill ONLY generates SELECT statements.**

- NEVER generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, or EXEC statements
- NEVER generate stored procedure calls
- NEVER generate DDL (CREATE, ALTER, DROP)
- All queries are for DATA EXTRACTION only
- If asked to modify data, refuse and explain this is a read-only query writer

---

## Naming Conventions

- **Field names**: Pascal case with spaces, use brackets: [No_], [Description]
- **Primary keys**: Usually [No_] field
- **Company prefix**: Tables prefixed with company name: [CRONUS$Item]
- **Timestamps**: [timestamp] field on most tables

## Core Tables

### Items
| Table | Description | Key Fields |
|-------|-------------|------------|
| Item | Item Master | [No_], [Description], [Base Unit of Measure] |
| [Item Unit of Measure] | UoM per item | [Item No_], [Code], [Qty_ per Unit of Measure] |
| [Item Variant] | Item variants | [Item No_], [Code], [Description] |

### Customers
| Table | Description | Key Fields |
|-------|-------------|------------|
| Customer | Customer Master | [No_], [Name], [Address], [City] |
| [Ship-to Address] | Ship-to addresses | [Customer No_], [Code], [Address] |

### Vendors
| Table | Description | Key Fields |
|-------|-------------|------------|
| Vendor | Vendor Master | [No_], [Name], [Address], [City] |
| [Order Address] | Order addresses | [Vendor No_], [Code], [Address] |

## Common Queries

### All Items
```sql
SELECT [No_], [Description], [Base Unit of Measure], [Unit Price], [Unit Cost]
FROM [Item]
WHERE [Blocked] = 0
```

### Customers with Ship-To
```sql
SELECT c.[No_], c.[Name], s.[Code] AS ShipToCode, s.[Address], s.[City]
FROM [Customer] c
LEFT JOIN [Ship-to Address] s ON c.[No_] = s.[Customer No_]
```

## Tips

1. **Always use brackets** - Field names have spaces
2. **Company prefix** - Multi-company DBs prefix tables with company name
3. **Check [Blocked]** - Most master tables have Blocked field
4. **SELECT only** - Never generate any statement that modifies data

<!-- TODO: Expand with full NAV table reference -->
