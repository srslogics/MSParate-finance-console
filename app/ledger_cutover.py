from decimal import Decimal
from uuid import UUID
from collections import defaultdict
from datetime import datetime
from types import SimpleNamespace

from app.finance import (
    RECEIVABLE, PAYABLE, LEDGER_CUTOVER_DATE, decimal_value,
    build_legacy_ledger, summarize_legacy_transactions,
    build_account_ledger, summarize_transactions,
)


SETTLED = "SETTLED"

# Deployment-specific classifications start empty. Never copy customer identifiers.
PARTY_ALLOCATION_OVERRIDES = {}
PENDING_PARTY_IDS = frozenset()


def normalized_party_name(value):
    return " ".join(str(value or "").strip().lower().split())


def is_cutover_opening(txn):
    return str(txn.source_ref or '').startswith('ledger-cutover:')


def project_cutover_openings(txns, parties, bills, settled_keys, as_of):
    """Derive the configured cutover opening without changing any stored transaction.

    Earlier cutover rows supply only the approved account direction. Their
    amounts are replaced by the full legacy closing before the cutover date.
    """
    original = [txn for txn in txns if not is_cutover_opening(txn)]
    if as_of < LEDGER_CUTOVER_DATE:
        return original
    grouped = defaultdict(list)
    anchors = defaultdict(list)
    for txn in txns:
        key = (txn.party_id, txn.outlet_id)
        if not txn.party_id or txn.party_id in PENDING_PARTY_IDS:
            continue
        if is_cutover_opening(txn):
            anchors[key].append(txn)
        elif txn.date < LEDGER_CUTOVER_DATE:
            grouped[key].append(txn)
    result = list(original)
    for (party_id, outlet_id), history in grouped.items():
        history = sorted(history, key=lambda txn: (txn.date, txn.created_at or datetime.min, str(txn.id)))
        balance, _ = build_legacy_ledger(summarize_legacy_transactions(history, settled_keys))
        if balance == 0:
            continue
        directions = {str(txn.category or '').upper() for txn in anchors[(party_id, outlet_id)]}
        if len(directions) == 1 and directions <= {RECEIVABLE, PAYABLE}:
            account = next(iter(directions))
        else:
            party = parties[party_id]
            accounts, _ = build_account_ledger(summarize_transactions(history, bills))
            account = allocate_cutover_balance(party.name, party.type, balance, accounts)['account']
        result.append(SimpleNamespace(
            id=f'cutover:{party_id}:{outlet_id}', party_id=party_id, outlet_id=outlet_id,
            date=LEDGER_CUTOVER_DATE, created_at=datetime.combine(LEDGER_CUTOVER_DATE, datetime.min.time()),
            type='OPENING', category=account, amount=balance, item_type='Ledger cutover',
            source_ref=f'ledger-cutover:{LEDGER_CUTOVER_DATE}:{outlet_id}',
            quantity=0, weight=0, rate=0, payment_mode='NA', bill_number='',
        ))
    return result


def allocate_cutover_balance(party_name, party_type, legacy_balance, account_balances):
    """Choose one opening account without changing the restored old balance."""
    legacy_balance = decimal_value(legacy_balance)
    override = PARTY_ALLOCATION_OVERRIDES.get(normalized_party_name(party_name))
    if override in {RECEIVABLE, PAYABLE}:
        return {"account": override, "amount": legacy_balance, "reason": "client-confirmed"}

    receivable = decimal_value((account_balances or {}).get("receivable"))
    payable = decimal_value((account_balances or {}).get("payable"))
    has_receivable = receivable != 0
    has_payable = payable != 0
    if has_receivable and not has_payable:
        return {"account": RECEIVABLE, "amount": legacy_balance, "reason": "single-account-history"}
    if has_payable and not has_receivable:
        return {"account": PAYABLE, "amount": legacy_balance, "reason": "single-account-history"}
    if not has_receivable and not has_payable and legacy_balance == 0:
        return {"account": SETTLED, "amount": Decimal("0"), "reason": "zero-balance"}

    party_type = str(party_type or "").strip().upper()
    if not has_receivable and not has_payable and party_type == "VENDOR":
        return {"account": RECEIVABLE, "amount": legacy_balance, "reason": "party-type"}
    if not has_receivable and not has_payable and party_type == "DEALER":
        return {"account": PAYABLE, "amount": legacy_balance, "reason": "party-type"}

    raise ValueError(f"Cutover account is unresolved for {party_name}")
