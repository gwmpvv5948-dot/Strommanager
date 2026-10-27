"""Device command planning and rate limiting, independent of HA imports."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from .model import Decision, Settings, Snapshot


@dataclass(frozen=True)
class Command:
    channel: str
    value: float | bool
    cloud: bool = False


def plan(s: Snapshot, d: Decision, c: Settings) -> list[Command]:
    """Only propose actual changes. A failed protection command blocks EV start."""
    commands: list[Command] = []
    if s.grid_charge_enabled is True:
        commands.append(Command("grid_charge", False))
    if s.current_discharge_w is not None and abs(s.current_discharge_w - d.discharge_w) >= 1:
        commands.append(Command("discharge_limit", d.discharge_w))
    if not d.may_control_car or d.target_amps is None:
        return commands
    if d.target_amps == 0:
        if s.charging is True:
            commands.append(Command("car_charge", False, True))
    else:
        # Never start when the local safety actuators cannot be verified.
        if s.current_discharge_w is None or s.grid_charge_enabled is None or s.car_current is None:
            return commands
        difference = s.car_current - d.target_amps
        if difference > 0 or difference <= -2 or (difference != 0 and s.charging is False):
            commands.append(Command("car_current", d.target_amps, True))
        if s.charging is False and s.charge_changed_age >= c.minimum_pause_s:
            commands.append(Command("car_charge", True, True))
    return commands


class Executor:
    """Serialize writes, bound retries and preserve user ownership of settings."""
    def __init__(self, send: Callable[[Command], Awaitable[None]]):
        self.send = send
        self.attempts: dict[str, float] = {}
        self.failures: dict[str, int] = {}
        self.cloud_last = float("-inf")
        self.baselines: dict[str, float] = {}
        self.owned: dict[str, float] = {}
        self.history: list[dict] = []
        self.error: str | None = None

    def _record(self, now: float, cmd: Command, outcome: str):
        self.history.insert(0, {"time": now, "channel": cmd.channel, "value": cmd.value, "outcome": outcome})
        del self.history[30:]

    async def run(self, now: float, commands: list[Command], cloud_interval: int,
                  current: dict[str, float | None]) -> None:
        cloud_allowed = now - self.cloud_last >= cloud_interval
        safety_ok = True
        for cmd in commands:
            safety_channel = cmd.channel in ("grid_charge", "discharge_limit")
            interval = min(1800, 120 * 2 ** min(self.failures.get(cmd.channel, 0), 4)) if self.failures.get(cmd.channel) else (cloud_interval if cmd.cloud else 20)
            ready = now - self.attempts.get(cmd.channel, float("-inf")) >= interval
            if not ready or (cmd.cloud and not cloud_allowed):
                if safety_channel:
                    safety_ok = False
                continue
            if cmd.cloud and cmd.value is not False and not safety_ok:
                continue
            self.attempts[cmd.channel] = now
            if cmd.cloud:
                self.cloud_last = now
            if cmd.channel in ("discharge_limit", "car_current") and cmd.channel not in self.baselines:
                value = current.get(cmd.channel)
                if value is not None:
                    self.baselines[cmd.channel] = value
            try:
                await self.send(cmd)
            except Exception as exc:  # Integration service failures remain visible and retry is bounded.
                self.failures[cmd.channel] = self.failures.get(cmd.channel, 0) + 1
                self.error = f"{cmd.channel}: {exc}"
                self._record(now, cmd, "error")
                safety_ok = False
                if cmd.channel == "car_current":
                    # Do not start at an unverified, possibly excessive current.
                    break
            else:
                self.failures.pop(cmd.channel, None)
                if not self.failures:
                    self.error = None
                if cmd.channel in ("discharge_limit", "car_current"):
                    self.owned[cmd.channel] = float(cmd.value)
                self._record(now, cmd, "accepted")

    def restoration(self, current: dict[str, float | None]) -> list[Command]:
        """Only restore settings still equal to our most recent accepted command."""
        return [Command(channel, baseline, channel == "car_current")
                for channel, baseline in self.baselines.items()
                if channel in self.owned and current.get(channel) is not None
                and abs(current[channel] - self.owned[channel]) < .01]
