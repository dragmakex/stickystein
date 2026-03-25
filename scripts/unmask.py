#!/usr/bin/env python3

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


try:
    import fitz  # type: ignore
except Exception:
    fitz = None

try:
    import pikepdf  # type: ignore
except Exception:
    pikepdf = None

try:
    from PIL import Image  # type: ignore
except Exception:
    Image = None


BLACK_THRESHOLD = 24
MIN_BAR_WIDTH = 36
MIN_BAR_HEIGHT = 6
MAX_BAR_HEIGHT = 120


@dataclass
class Candidate:
    label: str
    path: Path
    score: int


def log(message: str) -> None:
    print(f"[unmask] {message}", file=sys.stderr)


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run(command: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=check, text=True, capture_output=True)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def score_text(value: str) -> int:
    normalized = normalize_text(value)
    if not normalized:
        return 0
    alnum = len(re.findall(r"[A-Za-z0-9]", normalized))
    long_words = len(re.findall(r"[A-Za-z]{4,}", normalized)) * 4
    return alnum + long_words


def extract_text(pdf_path: Path) -> str:
    if command_exists("pdftotext"):
        try:
            completed = run(["pdftotext", "-layout", str(pdf_path), "-"])
            if completed.stdout.strip():
                return completed.stdout
        except Exception:
            pass

    if fitz is not None:
        try:
            doc = fitz.open(str(pdf_path))
            try:
                return "\n".join(page.get_text("text") for page in doc)
            finally:
                doc.close()
        except Exception:
            pass

    return ""


def copy_pdf(source: Path, destination: Path) -> Path:
    shutil.copyfile(source, destination)
    return destination


def choose_best(candidates: Iterable[Path]) -> Candidate:
    best: Candidate | None = None
    for candidate_path in candidates:
        text = extract_text(candidate_path)
        candidate = Candidate(candidate_path.stem, candidate_path, score_text(text))
        log(f"candidate {candidate.label} score={candidate.score}")
        if best is None or candidate.score > best.score:
            best = candidate

    if best is None:
        raise RuntimeError("No PDF candidates were produced")
    return best


def strip_annotations_with_fitz(source: Path, destination: Path) -> Path | None:
    if fitz is None:
        return None

    try:
        doc = fitz.open(str(source))
        changed = False
        try:
            for page in doc:
                annot = page.first_annot
                while annot is not None:
                    next_annot = annot.next
                    subtype = annot.type[1] if annot.type else ""
                    if subtype in {"Redact", "Square", "Highlight", "Ink", "FreeText"}:
                        page.delete_annot(annot)
                        changed = True
                    annot = next_annot

            if not changed:
                return None

            doc.save(str(destination), garbage=4, deflate=True, clean=True)
            return destination
        finally:
            doc.close()
    except Exception as error:
        log(f"fitz annotation stripping failed: {error}")
        return None


def is_black_fill(operands: list[object], operator: str, current_fill_black: bool) -> bool:
    try:
        if operator == "g":
            return float(operands[0]) <= 0.05
        if operator == "rg":
            values = [float(operands[0]), float(operands[1]), float(operands[2])]
            return max(values) <= 0.05
    except Exception:
        return current_fill_black
    return current_fill_black


def strip_vector_bars_with_pikepdf(source: Path, destination: Path) -> Path | None:
    if pikepdf is None:
        return None

    try:
        pdf = pikepdf.open(str(source))
        changed = False

        for page in pdf.pages:
            if "/Annots" in page:
                kept = pikepdf.Array()
                for annot in page.Annots:
                    subtype = str(annot.get("/Subtype", ""))
                    if subtype in {"/Redact", "/Square"}:
                        changed = True
                        continue
                    kept.append(annot)
                if len(kept) == 0:
                    del page["/Annots"]
                else:
                    page["/Annots"] = kept

            try:
                instructions = list(pikepdf.parse_content_stream(page))
            except Exception:
                continue

            page_width = float(page.MediaBox[2]) - float(page.MediaBox[0])
            new_instructions = []
            fill_black = False
            pending_rectangle: tuple[object, object, float, float, bool] | None = None
            page_changed = False

            for instruction in instructions:
                operands = list(instruction.operands)
                operator = str(instruction.operator)

                if operator in {"g", "rg"}:
                    fill_black = is_black_fill(operands, operator, fill_black)
                    new_instructions.append(instruction)
                    pending_rectangle = None
                    continue

                if operator == "re":
                    try:
                        width = abs(float(operands[2]))
                        height = abs(float(operands[3]))
                    except Exception:
                        width = 0
                        height = 0
                    pending_rectangle = (instruction.operands, instruction.operator, width, height, fill_black)
                    new_instructions.append(instruction)
                    continue

                if operator in {"f", "f*", "B", "B*", "b", "b*"} and pending_rectangle is not None:
                    prev_operands, prev_operator, width, height, rect_black = pending_rectangle
                    pending_rectangle = None
                    probable_bar = (
                        rect_black
                        and width >= MIN_BAR_WIDTH
                        and MIN_BAR_HEIGHT <= height <= MAX_BAR_HEIGHT
                        and width <= page_width * 0.9
                        and width >= height * 2
                    )
                    if probable_bar:
                        if new_instructions:
                            new_instructions.pop()
                        page_changed = True
                        changed = True
                        continue

                if operator not in {"q", "Q", "cm"}:
                    pending_rectangle = None

                new_instructions.append(instruction)

            if page_changed:
                page.Contents = pikepdf.Stream(pdf, pikepdf.unparse_content_stream(new_instructions))

        if not changed:
            pdf.close()
            return None

        pdf.save(str(destination))
        pdf.close()
        return destination
    except Exception as error:
        log(f"pikepdf vector cleanup failed: {error}")
        return None


def rewrite_with_qpdf(source: Path, destination: Path) -> Path | None:
    if not command_exists("qpdf"):
        return None

    try:
        run(["qpdf", "--stream-data=uncompress", str(source), str(destination)])
        return destination
    except Exception as error:
        log(f"qpdf rewrite failed: {error}")
        return None


def whiten_redaction_bars(image_path: Path) -> None:
    if Image is None:
        return

    image = Image.open(image_path).convert("L")
    pixels = image.load()
    width, height = image.size
    visited: set[tuple[int, int]] = set()
    bars: list[tuple[int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            if (x, y) in visited or pixels[x, y] > BLACK_THRESHOLD:
                continue

            stack = [(x, y)]
            visited.add((x, y))
            min_x = max_x = x
            min_y = max_y = y
            count = 0

            while stack:
                cx, cy = stack.pop()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if (nx, ny) in visited or pixels[nx, ny] > BLACK_THRESHOLD:
                        continue
                    visited.add((nx, ny))
                    stack.append((nx, ny))

            bbox_width = max_x - min_x + 1
            bbox_height = max_y - min_y + 1
            fill_ratio = count / float(bbox_width * bbox_height)

            if (
                bbox_width >= MIN_BAR_WIDTH
                and MIN_BAR_HEIGHT <= bbox_height <= MAX_BAR_HEIGHT
                and bbox_width >= bbox_height * 2
                and fill_ratio >= 0.75
            ):
                bars.append((min_x, min_y, max_x, max_y))

    if not bars:
        return

    output = image.convert("RGB")
    out_pixels = output.load()
    for min_x, min_y, max_x, max_y in bars:
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                out_pixels[x, y] = (255, 255, 255)

    output.save(image_path)


def ocr_with_tesseract(source: Path, destination: Path) -> Path | None:
    if not (command_exists("pdftoppm") and command_exists("tesseract") and command_exists("pdfunite")):
        return None

    with tempfile.TemporaryDirectory(prefix="stickystein-ocr-") as work_dir:
        work = Path(work_dir)
        prefix = work / "page"
        try:
            run(["pdftoppm", "-png", str(source), str(prefix)])
        except Exception as error:
            log(f"pdftoppm OCR render failed: {error}")
            return None

        page_images = sorted(work.glob("page-*.png"))
        if not page_images:
            return None

        page_pdfs: list[Path] = []
        for image_path in page_images:
            try:
                whiten_redaction_bars(image_path)
            except Exception as error:
                log(f"bar whitening failed for {image_path.name}: {error}")

            out_base = work / image_path.stem
            try:
                run(["tesseract", str(image_path), str(out_base), "pdf"])
            except Exception as error:
                log(f"tesseract OCR failed for {image_path.name}: {error}")
                continue

            page_pdf = out_base.with_suffix(".pdf")
            if page_pdf.exists():
                page_pdfs.append(page_pdf)

        if not page_pdfs:
            return None

        try:
            run(["pdfunite", *[str(pdf) for pdf in page_pdfs], str(destination)])
            return destination
        except Exception as error:
            log(f"pdfunite failed: {error}")
            return None


def main() -> int:
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("INPUT_FILE", ""))
    output_path = Path(sys.argv[2] if len(sys.argv) > 2 else os.environ.get("OUTPUT_FILE", ""))

    if not input_path or not output_path:
        print("usage: unmask.py INPUT_FILE OUTPUT_FILE", file=sys.stderr)
        return 2

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="stickystein-unmask-") as work_dir:
        work = Path(work_dir)
        baseline = copy_pdf(input_path, work / "baseline.pdf")
        candidates: list[Path] = [baseline]

        fitz_candidate = strip_annotations_with_fitz(baseline, work / "fitz-clean.pdf")
        if fitz_candidate is not None:
            candidates.append(fitz_candidate)

        pike_candidate = strip_vector_bars_with_pikepdf(baseline, work / "pike-clean.pdf")
        if pike_candidate is not None:
            candidates.append(pike_candidate)

        qpdf_candidate = rewrite_with_qpdf(baseline, work / "qpdf-rewrite.pdf")
        if qpdf_candidate is not None:
            candidates.append(qpdf_candidate)

        best = choose_best(candidates)
        log(f"best structural candidate: {best.label}")

        ocr_candidate = ocr_with_tesseract(best.path, work / "ocr.pdf")
        if ocr_candidate is not None:
            best = choose_best([best.path, ocr_candidate])
            log(f"best final candidate: {best.label}")

        shutil.copyfile(best.path, output_path)
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        log(f"fatal fallback copy due to error: {error}")
        input_file = Path(os.environ.get("INPUT_FILE", ""))
        output_file = Path(os.environ.get("OUTPUT_FILE", ""))
        if input_file and output_file:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(input_file, output_file)
            raise SystemExit(0)
        raise SystemExit(1)
