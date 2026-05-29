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

import torch as th
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import numpy as np
import copy

class QNetwork(nn.Module):
    """Individual Q-Network for each agent"""
    def __init__(self, input_dim, output_dim, hidden_dim=64):
        super(QNetwork, self).__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.fc3 = nn.Linear(hidden_dim, output_dim)

    def forward(self, x):
        x = th.relu(self.fc1(x))
        x = th.relu(self.fc2(x))
        return self.fc3(x)

class QMixer(nn.Module):
    def __init__(self, num_agents, state_dim, mixing_embed_dim=32, hypernet_layers=2, hypernet_embed=64):
        super(QMixer, self).__init__()
        self.num_agents = num_agents
        self.state_dim = state_dim
        self.embed_dim = mixing_embed_dim

        if hypernet_layers == 1:
            self.hyper_w_1 = nn.Linear(self.state_dim, self.embed_dim * self.num_agents)
            self.hyper_w_final = nn.Linear(self.state_dim, self.embed_dim)
        elif hypernet_layers == 2:
            hypernet_embed = hypernet_embed
            self.hyper_w_1 = nn.Sequential(nn.Linear(self.state_dim, hypernet_embed), nn.ReLU(), nn.Linear(hypernet_embed, self.embed_dim * self.num_agents))
            self.hyper_w_final = nn.Sequential(nn.Linear(self.state_dim, hypernet_embed), nn.ReLU(), nn.Linear(hypernet_embed, self.embed_dim))
        else:
            raise Exception("Sorry >2 hypernet layers is not implemented!")

        self.hyper_b_1 = nn.Linear(self.state_dim, self.embed_dim)
        self.V = nn.Sequential(nn.Linear(self.state_dim, self.embed_dim), nn.ReLU(), nn.Linear(self.embed_dim, 1))

    def forward(self, agent_qs, states):
        agent_qs = agent_qs.contiguous().view(-1, 1, self.num_agents)
        w1 = th.abs(self.hyper_w_1(states))
        b1 = self.hyper_b_1(states)
        w1 = w1.view(-1, self.num_agents, self.embed_dim)
        b1 = b1.view(-1, 1, self.embed_dim)
        hidden = F.elu(th.bmm(agent_qs, w1) + b1)
        w_final = th.abs(self.hyper_w_final(states))
        w_final = w_final.view(-1, self.embed_dim, 1)
        v = self.V(states).view(-1, 1, 1)
        y = th.bmm(hidden, w_final) + v
        q_tot = y.view(-1, 1)
        return q_tot

class QMIX:
    """QMIX algorithm for multi-agent learning"""
    def __init__(self, num_agents, input_dim, output_dim, state_dim, hidden_dim=64, lr=1e-3, gamma=0.99, update_target_every=200, double_q=True, mixing_embed_dim=32, hypernet_layers=2, hypernet_embed=64):
        self.num_agents = num_agents
        self.input_dim = input_dim
        self.output_dim = output_dim
        self.hidden_dim = hidden_dim
        self.state_dim = state_dim
        self.gamma = gamma
        self.update_target_every = update_target_every
        self.double_q = double_q
        self.mixing_embed_dim = mixing_embed_dim
        self.hypernet_layers = hypernet_layers
        self.hypernet_embed = hypernet_embed

        self.q_network = QNetwork(self.input_dim, self.output_dim, self.hidden_dim)
        self.target_q_network = copy.deepcopy(self.q_network)
        self.mixing_network = QMixer(self.num_agents, self.state_dim, self.mixing_embed_dim, self.hypernet_layers, self.hypernet_embed)
        self.target_mixing_network = copy.deepcopy(self.mixing_network)

        self.optimizer = optim.RMSprop(self.get_parameters() + list(self.mixing_network.parameters()), lr=lr)
        self.training_step = 0
        self.criterion = nn.MSELoss()

    def get_parameters(self):
        """Returns parameters for agent network"""
        return list(self.q_network.parameters())

    def select_actions(self, obs, valid_agents, epsilon=0.1):
        """Epsilon-greedy action selection for each agent, dynamically masking invalid agents."""
        actions = []
        for i in range(len(obs)):
            obs_tensor = th.tensor(obs[i], dtype=th.float32).unsqueeze(0)
            if valid_agents[i]:
                if np.random.rand() < epsilon:
                    action = np.random.randint(1, 10)  # Random bid
                else:
                    with th.no_grad():
                        q_values = self.q_network(obs_tensor)
                        action = th.argmax(q_values[:, 1:]).item()
            else:
                action = 0
            actions.append(action)
        return actions


    def train(self, experiences):
        """Train QMIX with batch experience while handling dynamic agent count."""
        states, obs, actions, rewards, next_states, next_obs = zip(*experiences)

        # Pad states, next_states, and actions to match `max_agents`
        def pad(data, target_size, feature_dim=None):
            padded_data = []
            for item in data:
                pad_size = target_size - len(item)
                if feature_dim:  # For obs and next_obs
                    pad_array = np.zeros((pad_size, feature_dim), dtype=np.float32)
                else:  # For states next_states, rewards, actions
                    pad_array = [0] * pad_size
                padded_data.append(np.vstack((item, pad_array)) if feature_dim else np.concatenate((item, pad_array)))
            return np.array(padded_data)

        # Ensure consistent shapes
        states = pad(states, self.state_dim)
        obs = pad(obs, self.num_agents, feature_dim=self.input_dim)
        next_states = pad(next_states, self.state_dim)
        next_obs = pad(next_obs, self.num_agents, feature_dim=self.input_dim)
        actions = pad(actions, self.num_agents)

        # Convert to tensors
        states = th.tensor(states, dtype=th.float32)
        obs = th.tensor(obs, dtype=th.float32)
        next_states = th.tensor(next_states, dtype=th.float32)
        next_obs = th.tensor(next_obs, dtype=th.float32)
        rewards = th.tensor(rewards, dtype=th.float32)
        actions = th.tensor(actions, dtype=th.int64)

        q_values = self.q_network(obs).gather(2, actions.unsqueeze(2)).squeeze(2)
        joint_q_values = self.mixing_network(q_values, states.reshape(-1, self.state_dim))

        # Apply double-Q learning if needed
        if self.double_q:
            next_actions = self.q_network(next_obs).argmax(2)
            next_q_values = self.target_q_network(next_obs).gather(2, next_actions.unsqueeze(2)).squeeze(2)
        else:
            next_q_values = self.target_q_network(next_obs).max(2)
        joint_next_q_values = self.mixing_network(next_q_values, next_states.reshape(-1, self.state_dim))
        rewards = rewards.view(-1, 1) # reshape rewards
        targets = rewards + self.gamma * joint_next_q_values

        loss = self.criterion(joint_q_values, targets)

        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        self.training_step += 1
        # Check if target networks have to be updated
        if self.training_step % self.update_target_every == 0:
            self.target_q_network.load_state_dict(self.q_network.state_dict())
            self.target_mixing_network.load_state_dict(self.mixing_network.state_dict())
