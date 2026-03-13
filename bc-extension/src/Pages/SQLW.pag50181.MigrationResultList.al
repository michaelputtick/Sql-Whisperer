page 50181 "SQLW Migration Result List"
{
    PageType = List;
    ApplicationArea = All;
    UsageCategory = Lists;
    SourceTable = "SQLW Migration Result";
    Caption = 'Migration Results';
    Editable = false;
    InsertAllowed = false;
    ModifyAllowed = false;

    layout
    {
        area(Content)
        {
            repeater(Results)
            {
                field("Entry No."; Rec."Entry No.")
                {
                    ApplicationArea = All;
                }
                field("Migration Type"; Rec."Migration Type")
                {
                    ApplicationArea = All;
                }
                field("Record ID"; Rec."Record ID")
                {
                    ApplicationArea = All;
                }
                field(Status; Rec.Status)
                {
                    ApplicationArea = All;
                    StyleExpr = StatusStyle;
                }
                field("Error Message"; Rec."Error Message")
                {
                    ApplicationArea = All;
                }
                field("Created DateTime"; Rec."Created DateTime")
                {
                    ApplicationArea = All;
                }
                field("Batch ID"; Rec."Batch ID")
                {
                    ApplicationArea = All;
                }
            }
        }
        area(FactBoxes)
        {
            systempart(Notes; Notes)
            {
                ApplicationArea = All;
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(ClearAll)
            {
                ApplicationArea = All;
                Caption = 'Clear All Results';
                Image = Delete;
                ToolTip = 'Delete all migration results';

                trigger OnAction()
                begin
                    if Confirm('Are you sure you want to delete all migration results?') then
                        Rec.DeleteAll();
                end;
            }
            action(ClearErrors)
            {
                ApplicationArea = All;
                Caption = 'Clear Errors Only';
                Image = DeleteRow;
                ToolTip = 'Delete only error results';

                trigger OnAction()
                var
                    MigrationResult: Record "SQLW Migration Result";
                begin
                    if Confirm('Are you sure you want to delete all error results?') then begin
                        MigrationResult.SetRange(Status, MigrationResult.Status::Error);
                        MigrationResult.DeleteAll();
                    end;
                end;
            }
            action(ShowErrorsOnly)
            {
                ApplicationArea = All;
                Caption = 'Show Errors Only';
                Image = FilterLines;
                ToolTip = 'Filter to show only errors';

                trigger OnAction()
                begin
                    Rec.SetRange(Status, Rec.Status::Error);
                end;
            }
            action(ClearFilter)
            {
                ApplicationArea = All;
                Caption = 'Clear Filter';
                Image = ClearFilter;
                ToolTip = 'Remove all filters';

                trigger OnAction()
                begin
                    Rec.Reset();
                end;
            }
        }
        area(Promoted)
        {
            group(Category_Process)
            {
                Caption = 'Process';

                actionref(ShowErrorsOnly_Promoted; ShowErrorsOnly) { }
                actionref(ClearFilter_Promoted; ClearFilter) { }
                actionref(ClearErrors_Promoted; ClearErrors) { }
                actionref(ClearAll_Promoted; ClearAll) { }
            }
        }
    }

    var
        StatusStyle: Text;

    trigger OnAfterGetRecord()
    begin
        case Rec.Status of
            Rec.Status::Success:
                StatusStyle := 'Favorable';
            Rec.Status::Error:
                StatusStyle := 'Unfavorable';
            Rec.Status::Warning:
                StatusStyle := 'Ambiguous';
            Rec.Status::Skipped:
                StatusStyle := 'Subordinate';
        end;
    end;
}
