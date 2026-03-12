# AX Query Writer

Expert skill for writing SQL queries against Dynamics AX databases.

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

- **Field names**: camelCase or PascalCase (ItemId, AccountNum)
- **Primary keys**: RecId (system), business keys vary
- **Company filter**: DataAreaId column on all tables
- **Enums**: Stored as integers, need mapping

## Core Tables

### Items
| Table | Description | Key Fields |
|-------|-------------|------------|
| InventTable | Item Master | ItemId, ItemName, ItemType |
| InventTableModule | Item settings per module | ItemId, ModuleType |
| InventItemGroup | Item groups | ItemGroupId, Name |

### Customers
| Table | Description | Key Fields |
|-------|-------------|------------|
| CustTable | Customer Master | AccountNum, Name, CustGroup |
| DirPartyTable | Party (address book) | RecId, Name |
| LogisticsPostalAddress | Addresses | RecId, Street, City |

### Vendors
| Table | Description | Key Fields |
|-------|-------------|------------|
| VendTable | Vendor Master | AccountNum, Name, VendGroup |

## Common Queries

### All Items (with company filter)
```sql
SELECT ItemId, ItemName, ItemType
FROM InventTable
WHERE DataAreaId = 'DAT'  -- Always filter by company
  AND ItemType = 0  -- Item (not BOM, Service, etc.)
```

### Customers
```sql
SELECT AccountNum, Name, CustGroup, Currency
FROM CustTable
WHERE DataAreaId = 'DAT'
  AND Blocked = 0
```

## Tips

1. **Always filter DataAreaId** - AX is multi-company, always include this
2. **RecId for relationships** - Use RecId for joining related tables
3. **Enums are integers** - Map enum values (ItemType 0=Item, 1=BOM, etc.)
4. **SELECT only** - Never generate any statement that modifies data

<!-- TODO: Expand with full AX table reference -->
