from datetime import datetime
from decimal import Decimal
import importlib.util
from pathlib import Path
import pytest
from fastapi import HTTPException


def test_saved_receipt_time_is_india_time(endpoints):
    assert endpoints['business_document_time'](datetime(2026,9,29,10,46)) == '16:16:00'

@pytest.mark.parametrize('value',['NaN','Infinity','-Infinity','1e999','bad'])
def test_invalid_money_rejected(endpoints,value):
    with pytest.raises(HTTPException) as error:
        endpoints['parse_decimal'](value)
    assert error.value.status_code == 422


def test_zero_and_exact_decimals_preserved(endpoints):
    assert endpoints['parse_decimal']('0') == Decimal('0')
    assert endpoints['parse_decimal']('10.25') == Decimal('10.25')
    assert endpoints['parse_input_date']('NaT') is None


def bridge():
    spec=importlib.util.spec_from_file_location('bridge',Path(__file__).parents[1]/'print_bridge.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod


def test_thermal_bridge_layout_and_long_names():
    mod=bridge()
    data=mod.build_retail_bytes({'shop':{'name':'Synthetic test shop','fssai':'TEST'},'bill':{'bill_number':'TEST','date':'2026-09-29','time':'16:16','total_amount':10.25,'items':[{'item_name':'X'*60,'weight':0.1,'rate':102.5,'amount':10.25}]}})
    assert b'FSSAI LIC. NO. TEST' in data
    assert b'29/09/26' in data and b'0.100 KG' in data and b'Rs.10.25' in data
    assert b'TOTAL ROUNDOFF: 0.00' in data and b'WE LOOK FORWARD TO YOUR NEXT VISIT' in data
    assert all(len(line)<=42 for line in mod.retail_item_lines({'item_name':'X'*60,'weight':0.1,'rate':102.5,'amount':10.25},1))
    assert mod.encode_line('danger\x1b@\x1dV') == b'danger@V\n'
    assert b'NAG: 2' in mod.build_retail_bytes({'bill':{'items':[{'item_name':'Test','nag':2,'amount':10}]}})


def test_report_names_export_as_text_not_formulas(endpoints):
    from io import BytesIO
    from openpyxl import load_workbook
    response=endpoints['report_response']([{'Name':'=1+2','Amount':10}], ['Name','Amount'], 'synthetic', 'excel', 'Test')
    sheet=load_workbook(BytesIO(response.body)).active
    cell=next(cell for row in sheet for cell in row if cell.value=='=1+2')
    assert cell.data_type=='s'


def test_printer_rejects_unapproved_websites():
    mod=bridge()
    assert mod.is_allowed_origin('http://127.0.0.1:8000')
    assert not mod.is_allowed_origin('https://untrusted.example')
    assert not mod.is_allowed_origin('https://localhost.attacker.example')
    mod.ALLOWED_ORIGINS.add('https://test-shop.example')
    assert mod.is_allowed_origin('https://test-shop.example')
