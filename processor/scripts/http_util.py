"""Polite HTTP helpers for the official-data fetch scripts.

* Identifies itself with a descriptive User-Agent.
* Honours robots.txt (RFC 9309: 4xx → allowed, 5xx/unreachable → stop).
* Retries timeouts / 5xx with exponential backoff.
* Stops immediately on 403 / 429 – the scripts never try to bypass access controls.
"""

from __future__ import annotations

import logging
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

logger = logging.getLogger("fetch")

DEFAULT_CONTACT = "admin contact in README"
_RETRYABLE = {500, 502, 503, 504, 408}


class StopFetching(Exception):
    """The server refused access (403/429) or robots.txt disallows fetching."""


def user_agent(contact: str = DEFAULT_CONTACT) -> str:
    return f"UPTACPredictorDataFetcher/1.0 (+{contact})"


def make_client(contact: str = DEFAULT_CONTACT, timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": user_agent(contact), "Accept": "text/html,application/xhtml+xml"},
        timeout=timeout,
        follow_redirects=True,
    )


def ensure_allowed_by_robots(client: httpx.Client, url: str) -> None:
    parts = urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        response = client.get(robots_url)
    except httpx.HTTPError as exc:
        raise StopFetching(f"robots.txt could not be fetched ({type(exc).__name__}); not continuing.") from exc
    if response.status_code >= 500:
        raise StopFetching(f"robots.txt returned HTTP {response.status_code}; not continuing.")
    if response.status_code >= 400:
        return  # no robots.txt → crawling allowed
    parser = RobotFileParser()
    parser.parse(response.text.splitlines())
    agent = str(client.headers.get("User-Agent", "*"))
    if not parser.can_fetch(agent, url):
        raise StopFetching(f"robots.txt at {robots_url} disallows fetching {url}.")


def fetch_text(client: httpx.Client, url: str, retries: int = 4, backoff: float = 2.0) -> str:
    """GETs a page, retrying transient failures. Raises StopFetching on 403/429."""
    for attempt in range(retries + 1):
        try:
            response = client.get(url)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt == retries:
                raise RuntimeError(f"Giving up on {url}: {type(exc).__name__}") from exc
            wait = backoff * (2**attempt)
            logger.warning("%s on %s – retrying in %.0fs", type(exc).__name__, url, wait)
            time.sleep(wait)
            continue
        if response.status_code == 200:
            return response.text
        if response.status_code in (403, 429):
            raise StopFetching(
                f"Server returned HTTP {response.status_code} for {url}. Stopping – resume later with --start-page."
            )
        if response.status_code in _RETRYABLE and attempt < retries:
            wait = backoff * (2**attempt)
            logger.warning("HTTP %s on %s – retrying in %.0fs", response.status_code, url, wait)
            time.sleep(wait)
            continue
        raise RuntimeError(f"HTTP {response.status_code} for {url}")
    raise RuntimeError(f"Giving up on {url}")
