import os
import json
import textwrap
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from typing import Any


HOST = "127.0.0.1"
PORT = 9876
CHARS_PER_LINE = 42
ALLOWED_ORIGINS = {"https://msparate-finance-console.onrender.com"} | {value.strip().rstrip("/") for value in os.getenv("PRINT_ALLOWED_ORIGINS", "").split(",") if value.strip()}


def is_allowed_origin(origin):
    if not origin:
        return True  # Local non-browser clients; this service binds loopback only.
    parsed = urlparse(origin)
    return origin.rstrip("/") in ALLOWED_ORIGINS or (
        parsed.scheme in ("http", "https") and parsed.hostname in ("localhost", "127.0.0.1", "::1")
    )

QR_IMAGE_PATH = Path(__file__).resolve().parent / "frontend" / "assets" / "payment-qr.png"
QR_UPI_ID = os.getenv("PAYMENT_UPI_ID", "")


def esc_init() -> bytes:
    return b"\x1b@"


def esc_align(mode: str) -> bytes:
    mapping = {"left": 0, "center": 1, "right": 2}
    return b"\x1ba" + bytes([mapping.get(mode, 0)])


def esc_bold(enabled: bool) -> bytes:
    return b"\x1bE" + (b"\x01" if enabled else b"\x00")


def esc_double(enabled: bool) -> bytes:
    return b"\x1d!" + (b"\x11" if enabled else b"\x00")


def esc_feed(lines: int = 1) -> bytes:
    return b"\n" * max(1, int(lines))


def esc_cut() -> bytes:
    return b"\x1dV\x00"


def esc_raster_image(image_bytes: bytes, width_bytes: int, height: int) -> bytes:
    return b"\x1dv0\x00" + bytes([width_bytes % 256, width_bytes // 256, height % 256, height // 256]) + image_bytes


def encode_line(text: str) -> bytes:
    # Do not let item names/notes inject ESC/POS commands into the printer.
    text = "".join(c for c in str(text) if c.isprintable())
    return text.encode("cp437", errors="replace") + b"\n"


def money(value: Any) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except Exception:
        return "0.00"


def compact_money(value: Any) -> str:
    try:
        number = float(value or 0)
    except Exception:
        return "0.0"
    text = f"{number:.2f}".rstrip("0")
    return text if text.endswith(".0") or "." in text else f"{text}.0"


def decimal3(value: Any) -> str:
    try:
        return f"{float(value or 0):.3f}"
    except Exception:
        return "0.000"


def integerish(value: Any) -> str:
    try:
        num = float(value or 0)
    except Exception:
        return "0"
    return str(int(num)) if num.is_integer() else str(num)


def hr() -> str:
    return "-" * CHARS_PER_LINE


def center(text: str) -> bytes:
    return esc_align("center") + encode_line(text) + esc_align("left")


def _load_qr_image_bytes() -> bytes:
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return b""

    if not QR_IMAGE_PATH.exists():
        return b""

    try:
        image = Image.open(QR_IMAGE_PATH).convert("L")
    except Exception:
        return b""

    max_width = 220
    if image.width > max_width:
        scale = max_width / float(image.width)
        resized_height = max(1, int(image.height * scale))
        image = image.resize((max_width, resized_height))

    thresholded = image.point(lambda px: 0 if px < 200 else 255, mode="1")
    width, height = thresholded.size
    width_bytes = (width + 7) // 8
    raster = bytearray()

    for y in range(height):
        for byte_index in range(width_bytes):
            value = 0
            for bit in range(8):
                x = byte_index * 8 + bit
                if x < width:
                    pixel_on = thresholded.getpixel((x, y)) == 0
                    if pixel_on:
                        value |= 1 << (7 - bit)
            raster.append(value)

    return esc_align("center") + esc_raster_image(bytes(raster), width_bytes, height) + esc_feed(1) + esc_align("left")


def payment_qr_block() -> bytes:
    qr_bytes = _load_qr_image_bytes()
    if not qr_bytes or not QR_UPI_ID:
        return b""

    out = bytearray()
    out += encode_line(hr())
    out += center("Scan & Pay")
    out += qr_bytes
    out += center(QR_UPI_ID)
    return bytes(out)


def wrap_text(text: str, width: int):
    return textwrap.wrap(str(text or ""), width=width, break_long_words=True, break_on_hyphens=False) or [""]


def lr(left: str, right: str, width: int = CHARS_PER_LINE) -> str:
    left = str(left or "")
    right = str(right or "")
    if len(left) + len(right) + 1 <= width:
        return left + (" " * (width - len(left) - len(right))) + right
    available = max(1, width - len(right) - 1)
    left = left[:available]
    return left + " " + right.rjust(width - len(left) - 1)


def label_value(label: str, value: Any, width: int = CHARS_PER_LINE) -> str:
    prefix = f"{label}:"
    return lr(prefix, str(value or ""), width)


def retail_item_lines(item: dict, index: int):
    kg = float(item.get("weight") or 0)
    qty = f"{decimal3(kg)}Kg" if kg > 0 else f"{integerish(item.get('nag', item.get('quantity')))}PCS"
    name_lines = wrap_text(item.get("item_name") or "", 16)
    lines = [f"{name_lines[0]:<16} {'--':>5} {qty:>9} {money(item.get('rate')):>9}"]
    lines.extend(name_lines[1:])
    lines.append(money(item.get("amount")).center(20).rstrip())
    return lines


def shop_header(shop: dict) -> bytes:
    out = bytearray(esc_align("center"))
    out += esc_bold(True) + encode_line(str(shop.get("name") or "Shop")) + esc_bold(False)
    for line in [shop.get("proprietor"), shop.get("address"), f"MOB-{shop.get('phone')}" if shop.get("phone") else "", f"FSSAI LIC. NO. {shop.get('fssai')}" if shop.get("fssai") else ""]:
        if line:
            for part in wrap_text(str(line), CHARS_PER_LINE):
                out += encode_line(part)
    return bytes(out) + esc_align("left")


def build_retail_bytes(payload: dict) -> bytes:
    shop = payload.get("shop") or {}
    bill = payload.get("bill") or {}
    items = bill.get("items") or []
    due = float(bill.get("outstanding_amount") or 0)
    balance = float(bill.get("running_balance") if bill.get("running_balance") is not None else due)
    try:
        bill_date = date.fromisoformat(str(bill.get("date"))).strftime("%d/%m/%y")
    except ValueError:
        bill_date = str(bill.get("date") or "")
    out = bytearray(esc_init() + shop_header(shop) + esc_feed(2))
    out += encode_line(lr(f"BILL NO : {bill.get('bill_number') or ''}", f"DATE: {bill_date}"))
    out += encode_line(lr("", f"TIME: {str(bill.get('time') or '')[:5]}"))
    if bill.get("local_only"):
        out += encode_line("PROVISIONAL - PENDING SYNC")
    for key, label in [("customer_name", "CUSTOMER"), ("customer_phone", "PHONE"), ("customer_address", "ADDRESS")]:
        if bill.get(key):
            for part in wrap_text(f"{label}: {bill[key]}", CHARS_PER_LINE):
                out += encode_line(part)
    out += encode_line(hr())
    out += encode_line(f"{'ITEM NAME':<16} {'T NUM':>5} {'QTY':>9} {'PRICE':>9}")
    out += encode_line("AMOUNT".center(20).rstrip()) + encode_line(hr())
    for idx, item in enumerate(items, 1):
        for line in retail_item_lines(item, idx):
            out += encode_line(line)
    weight = sum(float(item.get("weight") or 0) for item in items)
    pieces = sum(float(item.get("nag", item.get("quantity")) or 0) for item in items if not float(item.get("weight") or 0))
    qty = decimal3(weight) + (f" + {integerish(pieces)}PCS" if pieces else "")
    out += encode_line(hr())
    # Separate summary lines keep long quantities/totals intact on a 42-column roll.
    out += encode_line(f"TOTAL ITEM(S):{len(items)} /QTY:{qty}")
    subtotal = bill.get("items_subtotal_amount")
    if subtotal is None:
        subtotal = float(bill.get("total_amount") or 0) - float(bill.get("ice_amount") or 0)
    out += encode_line(lr("", money(subtotal)))
    if float(bill.get("ice_amount") or 0) > 0:
        out += encode_line(lr("ICE", money(bill.get("ice_amount"))))
    out += encode_line(hr())
    # Rs. works on legacy CP437 printers, which cannot encode the rupee symbol.
    out += esc_bold(True) + encode_line(lr("TOTAL", f"Rs.{money(bill.get('total_amount'))}")) + esc_bold(False)
    out += encode_line(hr()) + encode_line("TOTAL ROUNDOFF: 0.00")
    if due > 0 or (bill.get("customer_name") and balance != 0):
        out += encode_line(hr())
        for label, value in [("PAID", bill.get("paid_amount")), ("BILL DUE", due), ("ACCOUNT BALANCE", balance)]:
            out += encode_line(lr(label, money(value)))
    if str(bill.get("payment_mode") or "Cash").upper() not in ("CASH", "CREDIT"):
        out += encode_line(lr("PAYMENT", str(bill.get("payment_mode"))))
    if bill.get("notes"):
        for line in wrap_text(str(bill["notes"]), CHARS_PER_LINE):
            out += encode_line(line)
    out += payment_qr_block() + encode_line(hr())
    out += center("THANK YOU VISIT AGAIN") + esc_feed(4) + esc_cut()
    return bytes(out)


def build_payment_receipt_bytes(payload: dict) -> bytes:
    shop = payload.get("shop") or {}
    receipt = payload.get("receipt") or {}
    direction = str(receipt.get("direction") or "RECEIVED").upper()
    title = "Payment Voucher" if direction == "PAID" else "Payment Receipt"
    amount_label = "Amount Paid" if direction == "PAID" else "Amount Received"

    out = bytearray()
    out += esc_init()
    out += center(title)
    out += shop_header(shop)
    out += encode_line(hr())
    out += encode_line(lr("Receipt no", str(receipt.get("receipt_number") or "")))
    out += encode_line(lr("Date", str(receipt.get("date") or "")))
    out += encode_line(lr("Time", str(receipt.get("time") or "")))
    out += encode_line(lr("Handled by", str(receipt.get("cashier_name") or "admin")))
    if receipt.get("party_name"):
        out += encode_line("")
        out += encode_line(f"Party  : {receipt.get('party_name')}")
    if receipt.get("party_phone"):
        out += encode_line(f"Phone  : {receipt.get('party_phone')}")
    if receipt.get("party_address"):
        out += encode_line(f"Address: {receipt.get('party_address')}")
    out += encode_line(hr())
    out += encode_line(lr("Direction", direction))
    out += encode_line(lr("Mode", str(receipt.get("payment_mode") or "Cash")))
    out += esc_bold(True) + encode_line(lr(amount_label, money(receipt.get("amount")))) + esc_bold(False)
    out += encode_line(lr("Balance After", money(receipt.get("balance_after"))))
    if receipt.get("notes"):
        out += encode_line(hr())
        for line in wrap_text(str(receipt.get("notes")), CHARS_PER_LINE):
            out += encode_line(line)
    out += encode_line(hr())
    out += center("Thank You")
    out += center("Visit Again")
    out += esc_feed(4)
    out += esc_cut()
    return bytes(out)


def print_raw(raw_bytes: bytes, printer_name: str | None = None):
    try:
        import win32print  # type: ignore
    except Exception as exc:
        raise RuntimeError("pywin32 is not installed. Install it with: pip install pywin32") from exc

    target_printer = printer_name or win32print.GetDefaultPrinter()
    if not target_printer:
        raise RuntimeError("No default printer configured")

    handle = win32print.OpenPrinter(target_printer)
    try:
        job = win32print.StartDocPrinter(handle, 1, ("Finance Console Receipt", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, raw_bytes)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)
    return target_printer


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, format: str, *args):
        return

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin and is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()

    def do_OPTIONS(self):
        if not is_allowed_origin(self.headers.get("Origin", "")):
            return self._json(403, {"error": "Origin not allowed. Add your MSParte URL to PRINT_ALLOWED_ORIGINS."})
        try:
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
        except Exception:
            return

    def do_GET(self):
        if not is_allowed_origin(self.headers.get("Origin", "")):
            return self._json(403, {"error": "Origin not allowed. Add your MSParte URL to PRINT_ALLOWED_ORIGINS."})
        try:
            if self.path == "/health":
                return self._json(200, {"status": "ok"})
            if self.path == "/printers":
                import win32print  # type: ignore
                flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
                printers = [entry[2] for entry in win32print.EnumPrinters(flags)]
                default_printer = win32print.GetDefaultPrinter()
                return self._json(200, {"default_printer": default_printer, "printers": printers})
            return self._json(404, {"error": "Not found"})
        except Exception as exc:
            try:
                return self._json(500, {"error": str(exc)})
            except Exception:
                return

    def do_POST(self):
        if not is_allowed_origin(self.headers.get("Origin", "")):
            return self._json(403, {"error": "Origin not allowed. Add your MSParte URL to PRINT_ALLOWED_ORIGINS."})
        try:
            content_length = int(self.headers.get("Content-Length", "0") or 0)
            if content_length < 0 or content_length > 1024 * 1024:
                return self._json(413, {"error": "Print job must be 1 MB or smaller"})
            raw_body = self.rfile.read(content_length) if content_length else b"{}"
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return self._json(400, {"error": "Invalid JSON"})

        try:
            printer_name = payload.get("printer_name")
            if self.path == "/print/retail":
                raw_bytes = build_retail_bytes(payload)
            elif self.path == "/print/payment-receipt":
                raw_bytes = build_payment_receipt_bytes(payload)
            else:
                return self._json(404, {"error": "Not found"})

            used_printer = print_raw(raw_bytes, printer_name)
            return self._json(200, {"status": "printed", "printer": used_printer})
        except Exception as exc:
            try:
                return self._json(500, {"error": str(exc)})
            except Exception:
                return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Finance Console print bridge running on http://{HOST}:{PORT}")
    server.serve_forever()
