# GP Query Writer

Expert skill for writing SQL queries against Great Plains (Dynamics GP) databases.

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

- **Field names**: 8-15 char uppercase (ITEMNMBR, CUSTNMBR, VENDORID)
- **Numeric suffixes**: ADDRESS1, ADDRESS2, PHONE1, PHONE2
- **Sequence fields**: SEQNUMBR, LNSEQNBR for line items
- **Amount fields**: Often suffixed with AMT (CRLMTAMT, ORDAMNT)
- **Date fields**: Suffixed with DATE (DOCDATE, DUEDATE)

## Core Tables

### Inventory (IV)
| Table | Description | Key Fields |
|-------|-------------|------------|
| IV00101 | Item Master | ITEMNMBR, ITEMDESC, ITMSHNAM, ITEMTYPE, UOMSCHDL |
| IV00102 | Item Quantity | ITEMNMBR, LOCNCODE, QTYONHND, QTYONORD, QTYSOLD |
| IV00105 | Item Currency | ITEMNMBR, CURNCYID |
| IV00108 | Item Vendor | ITEMNMBR, VENDORID, VNDITNUM |
| IV40201 | Unit of Measure Setup | UOMSCHDL |
| IV40202 | UoM Schedule Detail | UOMSCHDL, UOFM, QTYBSUOM |

### Customers (RM)
| Table | Description | Key Fields |
|-------|-------------|------------|
| RM00101 | Customer Master | CUSTNMBR, CUSTNAME, ADDRESS1, CITY, STATE, ZIP |
| RM00102 | Customer Address | CUSTNMBR, APTS_ATYP, ADDRESS1, CITY, STATE, ZIP |
| RM00103 | Customer Ship-To | CUSTNMBR, SHIPMTHD, LOCNCODE |

### Vendors (PM)
| Table | Description | Key Fields |
|-------|-------------|------------|
| PM00200 | Vendor Master | VENDORID, VENDNAME, ADDRESS1, CITY, STATE, ZIPCODE |
| PM00300 | Vendor Address | VENDORID, APTS_ATYP, ADDRESS1, CITY, STATE, ZIPCODE |

### Sales (SOP)
| Table | Description | Key Fields |
|-------|-------------|------------|
| SOP10100 | Sales Order Header | SOPNUMBE, SOPTYPE, CUSTNMBR, DOCDATE, DOCAMNT |
| SOP10200 | Sales Order Lines | SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR, QUANTITY, UNITPRCE |
| SOP30200 | Sales History Header | SOPNUMBE, SOPTYPE, CUSTNMBR |
| SOP30300 | Sales History Lines | SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR |

### Purchasing (POP)
| Table | Description | Key Fields |
|-------|-------------|------------|
| POP10100 | Purchase Order Header | PONUMBER, VENDORID, DOCDATE, POTYPE |
| POP10110 | Purchase Order Lines | PONUMBER, ORD, ITEMNMBR, QUANTITY, UNITCOST |
| POP30100 | PO History Header | PONUMBER, VENDORID |
| POP30110 | PO History Lines | PONUMBER, ORD, ITEMNMBR |

### Bill of Materials (BM)
| Table | Description | Key Fields |
|-------|-------------|------------|
| BM00101 | BOM Header | ITEMNMBR, BOMNUM, BOMNAME |
| BM00111 | BOM Components | ITEMNMBR, SEQNUMBR, CMPTITNM, CMPNTYPE, CMPNQTY |

## Common Joins

### Item with UoM
```sql
SELECT iv.ITEMNMBR, iv.ITEMDESC, iv.ITMSHNAM, uom.UOFM, uom.QTYBSUOM
FROM IV00101 iv
LEFT JOIN IV40202 uom ON iv.UOMSCHDL = uom.UOMSCHDL
WHERE uom.UOFM = iv.SELNGUOM  -- Selling UoM
```

### Item with Quantity
```sql
SELECT iv.ITEMNMBR, iv.ITEMDESC, qty.LOCNCODE, qty.QTYONHND, qty.QTYONORD
FROM IV00101 iv
JOIN IV00102 qty ON iv.ITEMNMBR = qty.ITEMNMBR
WHERE qty.QTYONHND > 0
```

### Item with Vendor (Primary)
```sql
SELECT iv.ITEMNMBR, iv.ITEMDESC, ivv.VENDORID, ivv.VNDITNUM
FROM IV00101 iv
JOIN IV00108 ivv ON iv.ITEMNMBR = ivv.ITEMNMBR
WHERE ivv.PRIMVNDR = 1  -- Primary vendor
```

### Customer with Ship-To Addresses
```sql
SELECT rm.CUSTNMBR, rm.CUSTNAME, addr.ADRSCODE, addr.ADDRESS1, addr.CITY
FROM RM00101 rm
JOIN RM00102 addr ON rm.CUSTNMBR = addr.CUSTNMBR
WHERE addr.APTS_ATYP = 'SHIP'
```

### Vendor with Remit-To Addresses
```sql
SELECT pm.VENDORID, pm.VENDNAME, addr.ADRSCODE, addr.ADDRESS1, addr.CITY
FROM PM00200 pm
JOIN PM00300 addr ON pm.VENDORID = addr.VENDORID
WHERE addr.APTS_ATYP = 'REMIT'
```

### BOM with Components
```sql
SELECT h.ITEMNMBR AS ParentItem, h.BOMNAME,
       c.CMPTITNM AS ComponentItem, c.CMPNQTY AS Quantity
FROM BM00101 h
JOIN BM00111 c ON h.ITEMNMBR = c.ITEMNMBR
```

## ITEMTYPE Values

| Value | Description |
|-------|-------------|
| 1 | Sales Inventory |
| 2 | Discontinued |
| 3 | Kit |
| 4 | Misc Charges |
| 5 | Services |
| 6 | Flat Fee |

## SOP Types (SOPTYPE)

| Value | Description |
|-------|-------------|
| 1 | Quote |
| 2 | Order |
| 3 | Invoice |
| 4 | Return |
| 5 | Back Order |
| 6 | Fulfillment Order |

## Common Filters

### Active Items Only
```sql
SELECT * FROM IV00101 iv
WHERE iv.INACTIVE = 0
  AND iv.ITEMTYPE IN (1, 3)  -- Inventory and Kits
```

### Items with Stock
```sql
SELECT * FROM IV00101 iv
WHERE EXISTS (
    SELECT 1 FROM IV00102 qty
    WHERE qty.ITEMNMBR = iv.ITEMNMBR AND qty.QTYONHND > 0
)
```

### Customers with Activity (Last 2 Years)
```sql
SELECT * FROM RM00101 rm
WHERE EXISTS (
    SELECT 1 FROM SOP30200 sop
    WHERE sop.CUSTNMBR = rm.CUSTNMBR
    AND sop.DOCDATE > DATEADD(YEAR, -2, GETDATE())
)
```

### Deduplication
```sql
-- Dedupe by primary key (when duplicates exist from joins)
SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY ITEMNMBR ORDER BY ITEMNMBR) AS rn
    FROM IV00101
) x WHERE rn = 1
```

## String Handling

GP often pads strings with spaces. Always trim:
```sql
SELECT RTRIM(LTRIM(ITEMNMBR)) AS ItemNo,
       RTRIM(LTRIM(ITEMDESC)) AS Description
FROM IV00101
```

## Date Handling

GP stores dates as datetime. For date-only comparison:
```sql
SELECT * FROM SOP10100
WHERE CAST(DOCDATE AS DATE) >= '2024-01-01'
```

## Migration Query Template

```sql
-- Standard migration extract pattern (READ-ONLY)
SELECT
    RTRIM(LTRIM(iv.ITEMNMBR)) AS ItemNo,
    RTRIM(LTRIM(iv.ITMSHNAM)) AS ShortName,
    RTRIM(LTRIM(iv.ITEMDESC)) AS Description,
    iv.ITEMTYPE,
    RTRIM(LTRIM(iv.SELNGUOM)) AS SalesUoM,
    RTRIM(LTRIM(iv.PRCHSUOM)) AS PurchaseUoM,
    iv.CURRCOST AS UnitCost,
    CASE WHEN iv.INACTIVE = 1 THEN 'true' ELSE 'false' END AS Blocked
FROM IV00101 iv
WHERE iv.ITEMTYPE IN (1, 3)  -- Inventory and Kits only
  AND RTRIM(LTRIM(iv.ITMSHNAM)) <> ''  -- Must have short name
  AND iv.INACTIVE = 0  -- Active only
ORDER BY iv.ITEMNMBR
```

## Tips

1. **Always RTRIM/LTRIM** - GP pads strings with spaces
2. **Use EXISTS for filters** - More efficient than JOINs for existence checks
3. **Watch for duplicates** - Joins can multiply rows, use ROW_NUMBER() to dedupe
4. **Check INACTIVE flags** - Most master tables have INACTIVE field
5. **SOP/POP types matter** - Always filter by SOPTYPE/POTYPE
6. **Dates are datetime** - Cast to DATE for date-only comparisons
7. **SELECT only** - Never generate any statement that modifies data
