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

from typing import List, Optional

# Represents the resources of a node or a pod (e.g., CPU, memory), 
# and provides utility functions to manipulate them.
class Resources:
    def __init__(self, resources: dict):
        self.resources = resources
    
    def __repr__(self):
        representation = f"Resources("
        for key, value in self.resources.items():
            representation += f"{key}={value}, "
        representation = representation.rstrip(", ") + ")"
        return representation
    
    def copy(self):
        return Resources(self.resources.copy())

    def metrics(self):
        return self.resources.keys()

    def values(self):
        return self.resources.values()

    def set(self, metric_name: str, value):
        self.resources[metric_name] = value 
    
    def get(self, metric_name: str, default=0):
        return self.resources.get(metric_name, default)

    def increment(self, other: "Resources", max: Optional["Resources"]=None):
        ''' Increment this resource by another resource, optionally capping at a max resource.'''
        for key in self.resources.keys():
            if max is not None:
                self.resources[key] = min(max.resources.get(key, float('inf')), self.resources[key] + other.resources.get(key, 0))
            else:
                self.resources[key] += other.resources.get(key, 0)

    def decrement(self, other: "Resources", min: Optional["Resources"]=None):
        ''' Decrement this resource by another resource, optionally flooring at a min resource.'''
        for key in self.resources.keys():
            if min is not None:
                self.resources[key] = max(min.resources.get(key, float('-inf')), self.resources[key] - other.resources.get(key, 0))
            else:
                self.resources[key] -= other.resources.get(key, 0)

    def fits_in(self, other: "Resources", exclude_metrics: Optional[List]=None) -> bool:
        ''' Checks if this resource can fit within the 'other' resource. '''
        for key in self.resources.keys():
            if exclude_metrics and key in exclude_metrics:
                continue
            if self.resources[key] > other.resources.get(key, 0):
                return False
        return True
    
    def aggregate(self, other: "Resources"):
        ''' Aggregate another resource into this resource. 
            Keys that are not present in this resource will be added, 
            and keys that are present will be summed. 
        '''
        for key, value in other.resources.items():
            self.resources[key] = self.resources.get(key, 0) + value

    def add(self, other: "Resources") -> "Resources":
        ''' Add another resource to this resource and return a new resource object. '''
        new_resources = self.copy()
        new_resources.increment(other)
        return new_resources
    
    def subtract(self, other: "Resources") -> "Resources":
        ''' Subtract another resource from this resource and return a new resource object. '''
        new_resources = self.copy()
        new_resources.decrement(other)
        return new_resources
