import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import server
from fastapi.testclient import TestClient


class PptxValidationTests(unittest.TestCase):
    def test_accepts_minimal_valid_pptx_structure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.pptx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("[Content_Types].xml", "<Types />")
                archive.writestr("ppt/presentation.xml", "<presentation />")

            server.validate_pptx(path)

    def test_rejects_regular_zip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "fake.pptx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("notes.txt", "not a presentation")

            with self.assertRaisesRegex(ValueError, "PowerPoint"):
                server.validate_pptx(path)


class LibreOfficeDiscoveryTests(unittest.TestCase):
    @patch.dict("os.environ", {"LIBREOFFICE_PATH": ""}, clear=False)
    @patch("server.shutil.which", return_value=None)
    @patch("server.Path.is_file", return_value=False)
    def test_missing_libreoffice_has_clear_error(self, _is_file, _which):
        with self.assertRaisesRegex(RuntimeError, "LibreOffice"):
            server.find_libreoffice()


class ConversionApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    @staticmethod
    def pptx_bytes():
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types />")
            archive.writestr("ppt/presentation.xml", "<presentation />")
        return output.getvalue()

    def test_rejects_non_pptx_extension(self):
        response = self.client.post(
            "/api/convert/pptx-to-pdf",
            files={"file": ("notes.txt", b"text", "text/plain")},
        )
        self.assertEqual(response.status_code, 415)

    def test_returns_converted_pdf(self):
        def fake_conversion(_source, output_dir, _profile_dir):
            pdf_path = output_dir / "presentation.pdf"
            pdf_path.write_bytes(b"%PDF-1.4\n%%EOF")
            return pdf_path

        with patch("server.convert_pptx_to_pdf", side_effect=fake_conversion):
            response = self.client.post(
                "/api/convert/pptx-to-pdf",
                files={
                    "file": (
                        "slides.pptx",
                        self.pptx_bytes(),
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    )
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    @patch("server.find_libreoffice", side_effect=RuntimeError("missing"))
    def test_health_is_unavailable_without_libreoffice(self, _find):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
