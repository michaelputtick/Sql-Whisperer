page 50180 "SQLW Migration Result API"
{
    PageType = API;
    EntityName = 'migrationResult';
    EntitySetName = 'migrationResults';
    APIGroup = 'SQLW';
    APIPublisher = 'SQLW';
    APIVersion = 'v1.0';
    SourceTable = "SQLW Migration Result";
    DelayedInsert = true;
    Editable = false;
    InsertAllowed = false;
    ModifyAllowed = false;
    DeleteAllowed = false;

    layout
    {
        area(Content)
        {
            group(GroupName)
            {
                field(entryNo; Rec."Entry No.") { }
                field(migrationType; Rec."Migration Type") { }
                field(recordId; Rec."Record ID") { }
                field(status; Rec.Status) { }
                field(errorMessage; Rec."Error Message") { }
                field(createdDateTime; Rec."Created DateTime") { }
                field(parentRecordId; Rec."Parent Record ID") { }
                field(batchId; Rec."Batch ID") { }
            }
        }
    }

    trigger OnOpenPage()
    begin
        Rec.SetCurrentKey("Entry No.");
        Rec.Ascending(false);
    end;
}
