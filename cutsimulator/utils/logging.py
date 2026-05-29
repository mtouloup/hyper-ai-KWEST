# Copyright (c) 2026 CUT and HES-SO
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# 
# SPDX-License-Identifier: Apache-2.0

import csv
import logging
import re
import sys
from pathlib import Path
from typing import Optional

try:
    from hydra.core.hydra_config import HydraConfig  # type: ignore
except Exception:
    HydraConfig = None  # type: ignore

def try_get_hydra_output_dir():
    if HydraConfig is None:
        return None
    try:
        if HydraConfig.initialized():
            from pathlib import Path
            return Path(HydraConfig.get().runtime.output_dir)
    except Exception:
        pass
    return None

def setup_logger(config, name=None, log_file=None):
    type = config.get("logging_output", 3)
    level = config.get("logging_level", "INFO")

    new_logger = logging.getLogger(name)
    new_logger.setLevel(level)
    new_logger.propagate = False  # Prevent duplicate logs if root logger is also set

    formatter = logging.Formatter(
        fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Console handler
    if type in [1, 3] and not any(isinstance(h, logging.StreamHandler) for h in new_logger.handlers):
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)
        new_logger.addHandler(stream_handler)

    # File handler
    if type in [2, 3] and log_file and not any(isinstance(h, logging.FileHandler) and h.baseFilename == log_file for h in new_logger.handlers):
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        new_logger.addHandler(file_handler)

    return new_logger

def to_exp_abs(path):
    p = Path(path).expanduser()
    exp_path = try_get_hydra_output_dir()
    if exp_path is not None:
        p = exp_path / p
        return p.resolve(strict=False)
    else:
        return p.resolve(strict=False)


def sanitize_userid(userid: Optional[str]) -> Optional[str]:
    """Make userid safe for filenames while preserving readability."""
    if userid is None:
        return None
    uid = str(userid).strip()
    if not uid:
        return None
    # Replace any non filename-friendly character with underscore
    uid = re.sub(r"[^A-Za-z0-9._-]+", "_", uid)
    return uid


def _suffix_csv_filename(path: str, userid: Optional[str]) -> str:
    """Append _<userid> before extension, keeping directories intact."""
    uid = sanitize_userid(userid)
    if not uid:
        return path
    p = Path(path)
    return str(p.with_name(f"{p.stem}_{uid}{p.suffix}"))


def ensure_userid_column(path: Path, *, userid_col: str = "userid") -> None:
    """Ensure an existing CSV file has a leading `userid` column.

    This supports a smooth migration from legacy CSVs without the userid column.
    For large files, we stream row-by-row (no full-file load).
    """
    if not path.exists() or path.stat().st_size == 0:
        return

    try:
        with open(path, mode="r", newline="") as f:
            reader = csv.reader(f)
            header = next(reader, None)
    except Exception:
        return

    if not header:
        return

    # If userid already present as the first column, nothing to do.
    if len(header) > 0 and header[0] == userid_col:
        return

    # If userid exists elsewhere, don't attempt to rewrite.
    if userid_col in header:
        return

    tmp_path = path.with_suffix(path.suffix + ".tmp")
    # One backup is enough; overwrite any existing .bak
    bak_path = path.with_suffix(path.suffix + ".bak")

    with open(path, mode="r", newline="") as src, open(tmp_path, mode="w", newline="") as dst:
        reader = csv.reader(src)
        writer = csv.writer(dst)

        old_header = next(reader, None)
        if not old_header:
            return

        writer.writerow([userid_col, *old_header])
        for row in reader:
            writer.writerow(["", *row])

    try:
        if bak_path.exists():
            bak_path.unlink()
        path.replace(bak_path)
    except Exception:
        # If we can't create a backup, still try to overwrite safely.
        pass

    tmp_path.replace(path)
