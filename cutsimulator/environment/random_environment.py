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

"""RandomEnvironment

Single source of randomness for the whole simulator.

Rules:
- Never use global `random` or `np.random` directly in simulator code.
- Always draw randomness from this object so both BenchMARL (PettingZoo)
  and standalone simulator runs behave identically for the same seed.
"""

from __future__ import annotations

import random
from typing import Optional

import numpy as np
from numpy.random import Generator

import sys

import logging

logger = logging.getLogger(__name__)

class RandomEnvironment:
    """A helper class for managing deterministic randomness.

    We keep four independent RNG streams:
    - numpy_random: NumPy Generator (preferred for numeric sampling)
    - python_random: Python random.Random (preferred for tie-breaks / choices)
    - sheduler_python_random: Python random.Random (preferred for scheduler decisions),
      this should be used for randomness which is not part of the state of the environment. This random environment can be used in a none deterministic way.
    - torch_random: torch.Generator (optional; always deterministically seeded
      when torch is available)
    """

    def __init__(self, seed: Optional[int] = None):
        self.numpy_random: Generator
        self.python_random: random.Random
        self.sheduler_python_random: random.Random
        self.torch_random = None
        self.has_torch = "torch" in sys.modules
        if seed is not None:
            self.numpy_random = np.random.default_rng(seed)
            import random
            self.python_random = random.Random(seed+1)
            self.sheduler_python_random = random.Random(seed+3)
            if self.has_torch:
                import torch
                self.torch_random = torch.Generator()
                self.torch_random.manual_seed(seed+2)
        else:
            self.numpy_random = np.random.default_rng()
            import random
            self.python_random = random.Random()
            self.sheduler_python_random = random.Random()
            if self.has_torch:
                import torch
                self.torch_random = torch.Generator()

    def reset(self, seed: Optional[int]):
        """(Re)seed all RNG streams.

        Seed are initialized deterministically based on the provided seed, with an offset to ensure
        different RNG streams produce different sequences. If seed is None, no reseeding is performed, and the RNG streams will continue from their current state.
        """
        numpy_seed = self.numpy_random.bit_generator.state['state']['state'] if self.numpy_random else 'None'
        python_seed = hash(self.python_random.getstate()) if self.python_random else 'None'
        sheduler_python_seed = hash(self.sheduler_python_random.getstate()) if self.sheduler_python_random else 'None'
        torch_seed = self.torch_random.initial_seed() if self.torch_random else 'None'
        logger.warning(f"[RESET] seed={seed} env id={id(self)}, numpy_seed={numpy_seed}, python_seed={python_seed}, sheduler_python_seed={sheduler_python_seed}, torch_seed={torch_seed}")
        if seed is not None and seed != 0:
            self.numpy_random = np.random.default_rng(int(seed))
            self.python_random = random.Random(int(seed+1))
            self.sheduler_python_random = random.Random(int(seed+3))
            if self.has_torch:
                import torch
                self.torch_random = torch.Generator()
                self.torch_random.manual_seed(int(seed+2))