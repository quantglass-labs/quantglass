from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone


class RateLimitExceededError(RuntimeError):
    def __init__(self, key: str, retry_after_seconds: int) -> None:
        self.key = key
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"Rate limit exceeded for {key}; retry in {retry_after_seconds}s")


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[datetime]] = defaultdict(deque)

    def check_and_record(self, key: str, limit_per_minute: int) -> None:
        if limit_per_minute <= 0:
            raise RateLimitExceededError(key, 60)

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=1)
        events = self._events[key]

        while events and events[0] <= window_start:
            events.popleft()

        if len(events) >= limit_per_minute:
            retry_after = max(1, int((events[0] + timedelta(minutes=1) - now).total_seconds()))
            raise RateLimitExceededError(key, retry_after)

        events.append(now)