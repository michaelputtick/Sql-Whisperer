# BC Target Writer

Expert skill for mapping data to Business Central APIs and entities.

---

## Target System: Business Central

All migrations target Business Central via REST APIs. This skill covers:
- Standard BC API endpoints
- VOLT Migration API extensions
- Field mappings and data types
- Deep insert patterns

---

## Standard BC API Endpoints

### Items
```
POST /api/v2.0/companies({companyId})/items

{
  "number": "ITEM001",           // max 20 chars
  "displayName": "Widget",       // max 100 chars
  "type": "Inventory",           // Inventory, Service, Non-Inventory
  "itemCategoryCode": "PARTS",
  "baseUnitOfMeasureCode": "PCS",
  "unitPrice": 99.99,
  "unitCost": 49.99,
  "blocked": false
}
```

### Customers
```
POST /api/v2.0/companies({companyId})/customers

{
  "number": "CUST001",           // max 20 chars
  "displayName": "Acme Corp",    // max 100 chars
  "addressLine1": "123 Main St",
  "city": "Seattle",
  "state": "WA",
  "postalCode": "98101",
  "phoneNumber": "555-1234",
  "email": "contact@acme.com",
  "paymentTermsCode": "NET30",
  "blocked": " "                 // " ", "Ship", "Invoice", "All"
}
```

### Vendors
```
POST /api/v2.0/companies({companyId})/vendors

{
  "number": "VEND001",
  "displayName": "Supplier Inc",
  "addressLine1": "456 Oak Ave",
  "city": "Portland",
  "state": "OR",
  "postalCode": "97201",
  "phoneNumber": "555-5678",
  "paymentTermsCode": "NET30",
  "blocked": " "
}
```

## VOLT Migration APIs

Custom APIs for complex migrations with deep inserts.

### Item with UoM and Pricing (Deep Insert)
```
POST /api/volt/v1.0/companies({companyId})/itemMigration

{
  "number": "ITEM001",
  "displayName": "Widget",
  "baseUnitOfMeasureCode": "PCS",
  "unitOfMeasures": [
    { "code": "PCS", "qtyPerUnitOfMeasure": 1 },
    { "code": "BOX", "qtyPerUnitOfMeasure": 12 }
  ],
  "priceListLines": [
    { "unitOfMeasureCode": "PCS", "minimumQuantity": 1, "unitPrice": 9.99 },
    { "unitOfMeasureCode": "BOX", "minimumQuantity": 1, "unitPrice": 99.99 }
  ]
}
```

### Customer with Ship-To (Deep Insert)
```
POST /api/volt/v1.0/companies({companyId})/customerMigration

{
  "number": "CUST001",
  "displayName": "Acme Corp",
  "shipToAddresses": [
    {
      "code": "MAIN",
      "name": "Main Warehouse",
      "addressLine1": "123 Main St",
      "city": "Seattle",
      "state": "WA"
    },
    {
      "code": "WEST",
      "name": "West Coast DC",
      "addressLine1": "789 West Blvd",
      "city": "Los Angeles",
      "state": "CA"
    }
  ]
}
```

### Contact Migration
```
POST /api/volt/v1.0/companies({companyId})/contactMigration

{
  "number": "CONT001",
  "firstName": "John",
  "surname": "Smith",
  "jobTitle": "Buyer",
  "companyNo": "CUST001",
  "email": "john@acme.com",
  "phoneNumber": "555-1234"
}
```

## Field Type Mappings

| Source Type | BC Type | Transform |
|-------------|---------|-----------|
| GP CHAR(X) | Code[20] | RTRIM, truncate to 20 |
| GP VARCHAR | Text[100] | RTRIM, truncate |
| GP NUMERIC | Decimal | Direct |
| GP INT | Integer | Direct |
| GP BIT/TINYINT | Boolean | 0=false, 1=true |
| GP DATETIME | DateTime | ISO 8601 format |

## Common Transforms

### Truncate to BC field length
```javascript
{ "type": "truncate", "params": { "length": 20 } }
```

### Payment Terms Lookup
```javascript
{
  "type": "lookup",
  "params": {
    "mappings": {
      "N30": "NET30",
      "N60": "NET60",
      "COD": "COD"
    },
    "passthrough": true
  }
}
```

### Boolean Conversion
```javascript
{
  "type": "custom",
  "params": {
    "expression": "value === 1 || value === '1' || value === true"
  }
}
```

## Blocked Field Values

| Entity | Values |
|--------|--------|
| Customer | " " (none), "Ship", "Invoice", "All" |
| Vendor | " " (none), "Payment", "All" |
| Item | true/false |

## Tips

1. **Always trim strings** - GP pads with spaces, BC doesn't accept trailing spaces
2. **Truncate to BC limits** - number fields max 20 chars, names max 100
3. **Use deep inserts** - More efficient than separate API calls for related data
4. **Validate before POST** - Check required fields, data types
5. **Handle blocked states** - Map GP INACTIVE to appropriate BC blocked value
