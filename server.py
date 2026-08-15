"""HTTP server for the PDF tools UI and PPTX-to-PDF conversion API."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask


ROOT_DIR = Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = int(os.getenv("MAX_PPTX_UPLOAD_BYTES", 50 * 1024 * 1024))
CONVERSION_TIMEOUT_SECONDS = int(os.getenv("PPTX_CONVERSION_TIMEOUT_SECONDS", 120))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app = FastAPI(title="PDF Tools", version="4.0.0")

if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["POST", "GET"],
        allow_headers=["Content-Type"],
    )


def find_libreoffice() -> str:
    """Return the configured or discovered LibreOffice executable."""
    configured = os.getenv("LIBREOFFICE_PATH")
    candidates = [
        configured,
        shutil.which("libreoffice"),
        shutil.which("soffice"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    raise RuntimeError("LibreOffice 실행 파일을 찾을 수 없습니다.")


def validate_pptx(path: Path) -> None:
    """Reject non-OOXML archives even when their extension is .pptx."""
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile as exc:
        raise ValueError("올바른 PPTX 파일이 아닙니다.") from exc

    required = {"[Content_Types].xml", "ppt/presentation.xml"}
    if not required.issubset(names):
        raise ValueError("PowerPoint 프레젠테이션 구조를 확인할 수 없습니다.")


def convert_pptx_to_pdf(source: Path, output_dir: Path, profile_dir: Path) -> Path:
    """Convert one PPTX file to PDF in an isolated LibreOffice profile."""
    executable = find_libreoffice()
    command = [
        executable,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_dir.as_uri()}",
        "--convert-to",
        "pdf:impress_pdf_Export",
        "--outdir",
        str(output_dir),
        str(source),
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CONVERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("PPTX 변환 제한 시간을 초과했습니다.") from exc

    output = output_dir / f"{source.stem}.pdf"
    if completed.returncode != 0 or not output.is_file() or output.stat().st_size == 0:
        details = (completed.stderr or completed.stdout or "알 수 없는 변환 오류").strip()
        raise RuntimeError(f"LibreOffice 변환에 실패했습니다: {details[:500]}")
    return output


async def save_upload_limited(upload: UploadFile, destination: Path) -> None:
    """Stream an upload to disk without allowing unbounded memory or disk use."""
    total = 0
    with destination.open("wb") as target:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="PPTX 파일은 최대 50MB까지 업로드할 수 있습니다.")
            target.write(chunk)


@app.get("/api/health")
def health() -> dict[str, object]:
    try:
        executable = find_libreoffice()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "libreoffice": executable}


@app.post("/api/convert/pptx-to-pdf", response_class=FileResponse)
async def pptx_to_pdf(file: UploadFile = File(...)) -> FileResponse:
    filename = Path(file.filename or "presentation.pptx").name
    if Path(filename).suffix.lower() != ".pptx":
        raise HTTPException(status_code=415, detail=".pptx 파일만 업로드할 수 있습니다.")

    try:
        with tempfile.TemporaryDirectory(prefix="pptx-convert-") as temp_path:
            workspace = Path(temp_path)
            source = workspace / "presentation.pptx"
            output_dir = workspace / "output"
            profile_dir = workspace / "libreoffice-profile"
            output_dir.mkdir()
            profile_dir.mkdir()

            await save_upload_limited(file, source)
            validate_pptx(source)
            pdf_path = convert_pptx_to_pdf(source, output_dir, profile_dir)

            # FileResponse streams after this function returns, so copy to a
            # named temporary file whose cleanup is handled by the response.
            response_temp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            response_temp.close()
            shutil.copyfile(pdf_path, response_temp.name)

        safe_stem = Path(filename).stem.replace('"', "") or "presentation"
        return FileResponse(
            response_temp.name,
            media_type="application/pdf",
            filename=f"{safe_stem}.pdf",
            background=BackgroundTask(os.unlink, response_temp.name),
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        await file.close()


@app.get("/", response_class=FileResponse)
def index() -> FileResponse:
    return FileResponse(ROOT_DIR / "index.html")


@app.get("/{asset_name}", response_class=FileResponse)
def static_asset(asset_name: str) -> FileResponse:
    public_assets = {"index.html", "style.css", "config.js", "script.js"}
    if asset_name not in public_assets:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    return FileResponse(ROOT_DIR / asset_name)
