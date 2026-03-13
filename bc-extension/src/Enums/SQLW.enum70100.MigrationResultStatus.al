enum 70100 "SQLW Migration Result Status"
{
    Extensible = true;

    value(0; Success)
    {
        Caption = 'Success';
    }
    value(1; Error)
    {
        Caption = 'Error';
    }
    value(2; Skipped)
    {
        Caption = 'Skipped';
    }
    value(3; Warning)
    {
        Caption = 'Warning';
    }
}
