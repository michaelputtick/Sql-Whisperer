table 70101 "SQLW Migration Result"
{
    Caption = 'Migration Result';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Entry No."; Integer)
        {
            Caption = 'Entry No.';
            AutoIncrement = true;
        }
        field(2; "Migration Type"; Text[50])
        {
            Caption = 'Migration Type';
        }
        field(3; "Record ID"; Text[100])
        {
            Caption = 'Record ID';
        }
        field(4; Status; Enum "SQLW Migration Result Status")
        {
            Caption = 'Status';
        }
        field(5; "Error Message"; Text[2048])
        {
            Caption = 'Error Message';
        }
        field(6; "Created DateTime"; DateTime)
        {
            Caption = 'Created DateTime';
        }
        field(7; "Source Data"; Blob)
        {
            Caption = 'Source Data';
        }
        field(8; "Parent Record ID"; Text[100])
        {
            Caption = 'Parent Record ID';
        }
        field(9; "Batch ID"; Integer)
        {
            Caption = 'Batch ID';
        }
    }

    keys
    {
        key(PK; "Entry No.")
        {
            Clustered = true;
        }
        key(MigrationType; "Migration Type", Status)
        {
        }
        key(RecordID; "Record ID")
        {
        }
    }

    trigger OnInsert()
    begin
        "Created DateTime" := CurrentDateTime();
    end;

    procedure LogSuccess(MigrationType: Text[50]; RecordId: Text[100])
    begin
        Init();
        "Migration Type" := MigrationType;
        "Record ID" := RecordId;
        Status := Status::Success;
        Insert(true);
    end;

    procedure LogError(MigrationType: Text[50]; RecordId: Text[100]; ErrorMsg: Text)
    begin
        Init();
        "Migration Type" := MigrationType;
        "Record ID" := RecordId;
        Status := Status::Error;
        "Error Message" := CopyStr(ErrorMsg, 1, MaxStrLen("Error Message"));
        Insert(true);
    end;

    procedure LogSkipped(MigrationType: Text[50]; RecordId: Text[100]; Reason: Text)
    begin
        Init();
        "Migration Type" := MigrationType;
        "Record ID" := RecordId;
        Status := Status::Skipped;
        "Error Message" := CopyStr(Reason, 1, MaxStrLen("Error Message"));
        Insert(true);
    end;
}
