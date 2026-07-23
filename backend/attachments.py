"""File attachments.

A file lives on the canvas as its own node. Drawing a connector from it to a
message links the two, and from then on that file rides along in the context
for anything asked at or below that point.

Images go to the model as image blocks; text-ish files are inlined as text.
Anything else is described but not sent -- silently dropping a file the user
explicitly attached would be worse than saying it could not be read.
"""

from __future__ import annotations

import base64
import io
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}

TEXT_SUFFIXES = {
    ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".log", ".py", ".js", ".ts", ".tsx", ".jsx", ".html",
    ".css", ".sql", ".sh", ".rb", ".go", ".rs", ".java", ".c", ".h", ".cpp",
}

MAX_TEXT_CHARS = 20_000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PDF_CHARS = 20_000

THUMB_WIDTH = 260
TEXT_PREVIEW_LINES = 6
TEXT_PREVIEW_CHARS = 400


def _pdf_text(path: Path, limit: int = MAX_PDF_CHARS) -> Optional[str]:
    """Extract text from a PDF, or None if pypdf is absent / the file is not
    text-bearing (scanned images have no extractable text)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    try:
        reader = PdfReader(str(path))
        out: list[str] = []
        total = 0
        for page in reader.pages:
            t = (page.extract_text() or "").strip()
            if not t:
                continue
            out.append(t)
            total += len(t)
            if total >= limit:
                break
        text = "\n\n".join(out).strip()
    except Exception:
        return None
    return text or None


@dataclass
class Attachment:
    id: str
    tree_id: str
    name: str
    path: str
    mime: str
    size: int
    created_at: float
    x: Optional[float] = None
    y: Optional[float] = None

    @property
    def kind(self) -> str:
        if self.mime in IMAGE_TYPES:
            return "image"
        if Path(self.name).suffix.lower() in TEXT_SUFFIXES:
            return "text"
        if self.mime == "application/pdf":
            return "pdf"
        return "other"


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"


def preview(att: Attachment) -> dict:
    """A small preview for the canvas card.

    Images get a real downscaled thumbnail; text files get their opening lines.
    PDFs get neither -- rendering a page needs poppler or an equivalent native
    dependency, and claiming a preview we cannot produce would be worse than
    showing the file type plainly.
    """
    path = Path(att.path)
    if not path.exists():
        return {"type": "missing"}

    if att.kind == "image":
        data = _thumbnail(path)
        if data:
            return {"type": "image", "data_uri": data}
        # Pillow unavailable or the file is not decodable.
        return {"type": "none", "note": "no preview"}

    if att.kind == "text":
        try:
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                lines = []
                for _ in range(TEXT_PREVIEW_LINES):
                    line = fh.readline()
                    if not line:
                        break
                    lines.append(line.rstrip("\n"))
        except OSError:
            return {"type": "none", "note": "unreadable"}
        return {"type": "text", "text": "\n".join(lines)[:TEXT_PREVIEW_CHARS]}

    if att.kind == "pdf":
        text = _pdf_text(path, limit=TEXT_PREVIEW_CHARS * 3)
        if text:
            snippet = " ".join(text.split())[:TEXT_PREVIEW_CHARS]
            return {"type": "text", "text": snippet}
        # No extractable text (scanned/image PDF) or pypdf missing.
        return {"type": "none", "note": "PDF — no extractable text"}

    return {"type": "none", "note": att.mime}


def _thumbnail(path: Path) -> Optional[str]:
    try:
        from PIL import Image
    except ImportError:
        return None

    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
            ratio = THUMB_WIDTH / max(im.width, 1)
            if ratio < 1:
                im = im.resize(
                    (THUMB_WIDTH, max(1, round(im.height * ratio))),
                    Image.LANCZOS,
                )
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=72)
    except Exception:
        # Corrupt or unsupported image: fall back to no preview rather than
        # taking the whole attachment down with it.
        return None

    encoded = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def to_blocks(att: Attachment, supports_vision: bool = True) -> list[dict]:
    """Content blocks for one attachment, in the Anthropic block shape.

    Providers translate from here -- Ollama pulls images into its own `images`
    array, for instance. Returning one shape keeps that conversion in one place.
    """
    path = Path(att.path)
    if not path.exists():
        return [{"type": "text", "text": f"[attached file missing: {att.name}]"}]

    kind = att.kind

    if kind == "image":
        if not supports_vision:
            return [
                {
                    "type": "text",
                    "text": (
                        f"[image “{att.name}” attached, but the selected model "
                        f"cannot see images]"
                    ),
                }
            ]
        if att.size > MAX_IMAGE_BYTES:
            return [
                {
                    "type": "text",
                    "text": f"[image “{att.name}” is too large to send ({att.size // 1024} KB)]",
                }
            ]
        return [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": att.mime,
                    "data": base64.standard_b64encode(path.read_bytes()).decode("ascii"),
                },
            },
            {"type": "text", "text": f"[attached image: {att.name}]"},
        ]

    if kind == "text":
        try:
            body = path.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            return [{"type": "text", "text": f"[could not read {att.name}: {e}]"}]
        truncated = len(body) > MAX_TEXT_CHARS
        body = body[:MAX_TEXT_CHARS]
        note = "\n\n[…truncated]" if truncated else ""
        return [
            {
                "type": "text",
                "text": f"<attached_file name={att.name!r}>\n{body}{note}\n</attached_file>",
            }
        ]

    if kind == "pdf":
        text = _pdf_text(path)
        if text:
            truncated = len(text) >= MAX_PDF_CHARS
            note = "\n\n[…truncated]" if truncated else ""
            return [
                {
                    "type": "text",
                    "text": f"<attached_pdf name={att.name!r}>\n{text[:MAX_PDF_CHARS]}{note}\n</attached_pdf>",
                }
            ]
        # pypdf absent, or a scanned PDF with no text layer.
        return [
            {
                "type": "text",
                "text": (
                    f"[attached PDF “{att.name}” has no extractable text "
                    f"(likely scanned images) — its contents are not available to the model]"
                ),
            }
        ]

    # Everything else: name it rather than pretending it was read.
    return [
        {
            "type": "text",
            "text": (
                f"[attached file “{att.name}” ({att.mime}) could not be converted "
                f"to text — its contents are not available to the model]"
            ),
        }
    ]
