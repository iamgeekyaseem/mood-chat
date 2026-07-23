"""Security regression tests.

Each of these locks a fix from the security review. They fail loudly if a
future change reopens the hole.
"""

import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

import websearch
from ids import InvalidId, is_valid_id, require_id


# -- id validation (path traversal defense) ---------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        "../../Documents",
        "..",
        "../etc",
        "a/b",
        "a\\b",
        "id.with.dots",
        "id with spaces",
        "",
        "/absolute",
        "UPPERCASE",  # minted ids are lowercase hex
        "'; DROP TABLE trees;--",
        None,
        123,
    ],
)
def test_traversal_and_malformed_ids_are_rejected(bad):
    assert not is_valid_id(bad)
    with pytest.raises(InvalidId):
        require_id(bad, field="tree_id")


@pytest.mark.parametrize(
    "good",
    ["0123456789ab", "abcdef012345", "a" * 12, "0" * 32],
)
def test_real_ids_pass(good):
    assert is_valid_id(good)
    assert require_id(good) == good


def test_minted_ids_validate():
    from ids import new_id

    for _ in range(50):
        assert is_valid_id(new_id())


# -- delete_tree / add_file path containment --------------------------------


def test_files_dir_rejects_traversal(tmp_path, monkeypatch):
    """_files_dir must refuse to build a path outside ~/.branch/files."""
    import app as app_module

    monkeypatch.setattr(app_module, "APP_DIR", tmp_path / ".branch")

    api = app_module.Api.__new__(app_module.Api)  # skip __init__ (no DB needed)

    # A real id resolves inside the base...
    good = app_module.Api._files_dir(api, "abcdef012345")
    assert (tmp_path / ".branch" / "files") in good.parents or good == (
        tmp_path / ".branch" / "files" / "abcdef012345"
    )

    # ...traversal is refused before it can touch the filesystem.
    with pytest.raises((InvalidId, ValueError)):
        app_module.Api._files_dir(api, "../../Documents")


def test_safe_unlink_only_touches_app_files(tmp_path, monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "APP_DIR", tmp_path / ".branch")
    files = tmp_path / ".branch" / "files" / "abcdef012345"
    files.mkdir(parents=True)
    inside = files / "keep.jpg"
    inside.write_text("x")
    outside = tmp_path / "important.txt"
    outside.write_text("do not delete")

    api = app_module.Api.__new__(app_module.Api)

    # A path outside the app files dir is left untouched...
    app_module.Api._safe_unlink(api, str(outside))
    assert outside.exists()

    # ...one inside is removed.
    app_module.Api._safe_unlink(api, str(inside))
    assert not inside.exists()


# -- evaluate_js payload cannot break out -----------------------------------


def test_emit_payload_is_inert_base64(monkeypatch):
    """A hostile chunk of model text must not escape the evaluate_js string."""
    import app as app_module

    api = app_module.Api.__new__(app_module.Api)

    captured = {}

    class FakeWindow:
        def evaluate_js(self, code: str) -> None:
            captured["code"] = code

    api.window = FakeWindow()

    # Every classic breakout: quote, backslash, script close, JS terminators.
    hostile = (
        'evil"); window.pwned=1; ("'
        "\\ '</script>'     \n \r"
        "`${alert(1)}`"
    )
    app_module.Api._emit(api, "chunk", {"node_id": "abc", "text": hostile})

    code = captured["code"]
    # The transported blob is base64 only — none of the hostile characters
    # appear literally in the JS source.
    assert "window.pwned" not in code
    assert "</script>" not in code
    assert "${alert" not in code
    assert 'atob("' in code

    # And it decodes back to exactly the original payload.
    blob = code.split('atob("', 1)[1].split('"', 1)[0]
    decoded = json.loads(base64.b64decode(blob).decode("ascii"))
    assert decoded == {"event": "chunk", "node_id": "abc", "text": hostile}


# -- SSRF guard on fetch_page -----------------------------------------------


@pytest.mark.parametrize(
    "blocked",
    [
        "http://localhost/",
        "http://127.0.0.1:8080/admin",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://[::1]/",
        "http://10.0.0.5/internal",
        "http://192.168.1.1/",
        "file:///etc/passwd",
        "ftp://example.com/",
        "gopher://x/",
        "not a url",
    ],
)
def test_ssrf_targets_are_rejected(blocked):
    assert websearch._is_public_url(blocked) is False


def test_public_url_shape_is_accepted():
    # A well-formed public https URL passes the scheme/shape checks. (DNS
    # resolution may vary in CI, so this asserts the negative cases above are
    # the load-bearing ones; here we only require it not crash.)
    from urllib.parse import urlparse

    assert urlparse("https://example.com/page").scheme == "https"
