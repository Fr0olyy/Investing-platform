from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from email.utils import parsedate_to_datetime
from io import StringIO
from typing import Any
from xml.etree import ElementTree

import httpx
import pandas as pd
from bs4 import BeautifulSoup

from app.core.config import settings


class ExternalDataError(RuntimeError):
    """Raised when an external market data source cannot be parsed or reached."""


@dataclass(slots=True)
class MarketSnapshot:
    code: str
    name: str
    value: float
    source: str
    recorded_at: datetime


@dataclass(slots=True)
class NewsSnapshot:
    title: str
    summary: str
    url: str
    source: str
    sentiment: str
    published_at: datetime


class MarketDataClient:
    def __init__(self) -> None:
        self._client = httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "InvestingPlatformBackend/1.0"},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "MarketDataClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def fetch_share_snapshot(self, ticker: str, board: str = "TQBR") -> dict[str, Any]:
        payload = self._get_json(
            f"{settings.MOEX_BASE_URL}/engines/stock/markets/shares/boards/{board}/securities/{ticker.upper()}.json",
            params={"iss.meta": "off"},
        )
        marketdata = self._block_rows(payload, "marketdata")
        securities = self._block_rows(payload, "securities")
        if not marketdata or not securities:
            raise ExternalDataError(f"No live MOEX snapshot for {ticker}.")

        md = marketdata[0]
        sec = securities[0]
        seed_price = self._first_positive_number(sec, "PREVPRICE", default=0.0)
        price = self._first_positive_number(
            md,
            "LAST",
            "MARKETPRICE",
            "LCURRENTPRICE",
            "LEGALCLOSEPRICE",
            "WAPRICE",
            "CLOSEPRICE",
            "OPEN",
            default=seed_price,
        )
        if price <= 0:
            raise ExternalDataError(f"No valid MOEX price for {ticker}.")

        prev_close = self._first_positive_number(md, "LCLOSEPRICE", "CLOSEPRICE", "PREVPRICE", default=price)
        open_price = self._first_positive_number(md, "OPEN", default=price)
        high = self._first_positive_number(md, "HIGH", default=max(price, open_price))
        low = self._first_positive_number(md, "LOW", default=min(price, open_price))
        volume = int(float(md.get("VOLTODAY") or md.get("VALTODAY") or 0))
        change_percent = (
            ((price - prev_close) / prev_close) * 100
            if prev_close not in (0, None)
            else float(md.get("LASTCHANGEPRCNT") or 0)
        )

        return {
            "ticker": sec["SECID"],
            "name": sec.get("SHORTNAME") or sec.get("SECNAME") or sec["SECID"],
            "lot_size": int(sec.get("LOTSIZE") or 1),
            "price": price,
            "open": open_price,
            "high": high,
            "low": low,
            "close": price,
            "prev_close": prev_close,
            "change_percent": change_percent,
            "volume": volume,
            "source": "MOEX ISS",
            "recorded_at": self._parse_moex_datetime(md.get("SYSTIME"), md.get("TIME")),
        }

    def fetch_share_history(self, ticker: str, start_date: date, end_date: date, board: str = "TQBR") -> pd.DataFrame:
        rows = self._fetch_moex_history(
            f"/history/engines/stock/markets/shares/boards/{board}/securities/{ticker.upper()}.json",
            start_date,
            end_date,
        )
        if not rows:
            raise ExternalDataError(f"No MOEX history for {ticker}.")

        frame = pd.DataFrame(rows)
        frame["date"] = pd.to_datetime(frame["TRADEDATE"])
        frame["close"] = pd.to_numeric(frame["CLOSE"], errors="coerce")
        frame["open"] = pd.to_numeric(frame["OPEN"], errors="coerce")
        frame["high"] = pd.to_numeric(frame["HIGH"], errors="coerce")
        frame["low"] = pd.to_numeric(frame["LOW"], errors="coerce")
        frame["volume"] = pd.to_numeric(frame["VOLUME"], errors="coerce").fillna(0)
        frame["name"] = frame["SHORTNAME"].fillna(ticker.upper())
        return frame[["date", "close", "open", "high", "low", "volume", "name"]].dropna(subset=["close"])

    def fetch_index_history(self, secid: str, start_date: date, end_date: date) -> pd.DataFrame:
        rows = self._fetch_moex_history(
            f"/history/engines/stock/markets/index/securities/{secid.upper()}.json",
            start_date,
            end_date,
        )
        if not rows:
            raise ExternalDataError(f"No index history for {secid}.")

        frame = pd.DataFrame(rows)
        frame["date"] = pd.to_datetime(frame["TRADEDATE"])
        frame["close"] = pd.to_numeric(frame["CLOSE"], errors="coerce")
        frame["open"] = pd.to_numeric(frame["OPEN"], errors="coerce")
        frame["high"] = pd.to_numeric(frame["HIGH"], errors="coerce")
        frame["low"] = pd.to_numeric(frame["LOW"], errors="coerce")
        frame["volume"] = pd.to_numeric(frame["VOLUME"], errors="coerce").fillna(0)
        return frame[["date", "close", "open", "high", "low", "volume"]].dropna(subset=["close"])

    def fetch_index_snapshot(self, secid: str) -> MarketSnapshot:
        payload = self._get_json(
            f"{settings.MOEX_BASE_URL}/engines/stock/markets/index/securities/{secid.upper()}.json",
            params={"iss.meta": "off"},
        )
        marketdata = self._block_rows(payload, "marketdata")
        if not marketdata:
            raise ExternalDataError(f"No current index snapshot for {secid}.")
        md = marketdata[0]
        value = self._first_number(md, "CURRENTVALUE", "LASTVALUE", "OPENVALUE")
        return MarketSnapshot(
            code=secid.upper(),
            name=secid.upper(),
            value=value,
            source="MOEX ISS",
            recorded_at=self._parse_moex_datetime(md.get("SYSTIME"), md.get("TIME")),
        )

    def fetch_usd_rub_history(self, start_date: date, end_date: date) -> pd.DataFrame:
        response = self._client.get(
            f"{settings.CBR_BASE_URL}/scripts/XML_dynamic.asp",
            params={
                "date_req1": start_date.strftime("%d/%m/%Y"),
                "date_req2": end_date.strftime("%d/%m/%Y"),
                "VAL_NM_RQ": "R01235",
            },
        )
        response.raise_for_status()
        root = ElementTree.fromstring(response.content.decode("windows-1251"))
        rows: list[dict[str, Any]] = []
        for record in root.findall("Record"):
            value = float(record.findtext("Value", default="0").replace(",", "."))
            rows.append(
                {
                    "date": datetime.strptime(record.attrib["Date"], "%d.%m.%Y"),
                    "value": value,
                }
            )
        return pd.DataFrame(rows)

    def fetch_current_usd_rub(self) -> MarketSnapshot:
        today_xml = self._client.get(f"{settings.CBR_BASE_URL}/scripts/XML_daily.asp")
        today_xml.raise_for_status()
        decoded = today_xml.content.decode("windows-1251")
        root = ElementTree.fromstring(decoded)
        valuation_date = datetime.strptime(root.attrib["Date"], "%d.%m.%Y")
        for valute in root.findall("Valute"):
            if valute.findtext("CharCode") == "USD":
                value = float(valute.findtext("Value", default="0").replace(",", "."))
                return MarketSnapshot(
                    code="USD_RUB",
                    name="USD/RUB",
                    value=value,
                    source="CBR",
                    recorded_at=valuation_date,
                )
        raise ExternalDataError("USD/RUB rate not found in CBR response.")

    def fetch_key_rate_history(self, start_date: date, end_date: date) -> pd.DataFrame:
        response = self._client.get(
            f"{settings.CBR_BASE_URL}/eng/hd_base/KeyRate/",
            params={
                "UniDbQuery.Posted": "True",
                "UniDbQuery.From": start_date.strftime("%d.%m.%Y"),
                "UniDbQuery.To": end_date.strftime("%d.%m.%Y"),
            },
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        table = soup.find("table", class_="data")
        if table is None:
            raise ExternalDataError("Could not parse key rate table from CBR.")

        rows: list[dict[str, Any]] = []
        for tr in table.find_all("tr")[1:]:
            cells = [cell.get_text(strip=True) for cell in tr.find_all("td")]
            if len(cells) != 2:
                continue
            rows.append(
                {
                    "date": datetime.strptime(cells[0], "%d.%m.%Y"),
                    "value": float(cells[1].replace(",", ".")),
                }
            )
        return pd.DataFrame(rows)

    def fetch_current_key_rate(self) -> MarketSnapshot:
        today = datetime.now().date()
        history = self.fetch_key_rate_history(today - timedelta(days=30), today)
        if history.empty:
            raise ExternalDataError("No key rate rows parsed from CBR.")
        latest = history.sort_values("date").iloc[-1]
        return MarketSnapshot(
            code="KEY_RATE",
            name="Key Rate",
            value=float(latest["value"]),
            source="CBR",
            recorded_at=pd.Timestamp(latest["date"]).to_pydatetime(),
        )

    def fetch_brent_history(self, start_date: date, end_date: date) -> pd.DataFrame:
        response = self._client.get(settings.FRED_BRENT_CSV_URL)
        response.raise_for_status()
        frame = pd.read_csv(StringIO(response.text))
        frame["date"] = pd.to_datetime(frame["observation_date"])
        frame["value"] = pd.to_numeric(frame["DCOILBRENTEU"], errors="coerce")
        mask = (frame["date"] >= pd.Timestamp(start_date)) & (frame["date"] <= pd.Timestamp(end_date))
        return frame.loc[mask, ["date", "value"]].dropna()

    def fetch_current_brent(self) -> MarketSnapshot:
        today = datetime.now().date()
        history = self.fetch_brent_history(today - timedelta(days=15), today)
        if history.empty:
            raise ExternalDataError("Brent history is empty.")
        latest = history.sort_values("date").iloc[-1]
        return MarketSnapshot(
            code="BRENT",
            name="Brent Oil",
            value=float(latest["value"]),
            source="FRED",
            recorded_at=pd.Timestamp(latest["date"]).to_pydatetime(),
        )

    def fetch_macro_history(self, start_date: date, end_date: date) -> dict[str, pd.DataFrame]:
        return {
            "BRENT": self.fetch_brent_history(start_date, end_date),
            "USD_RUB": self.fetch_usd_rub_history(start_date, end_date),
            "IMOEX": self.fetch_index_history("IMOEX", start_date, end_date)[["date", "close"]].rename(columns={"close": "value"}),
            "RGBI": self.fetch_index_history("RGBI", start_date, end_date)[["date", "close"]].rename(columns={"close": "value"}),
            "KEY_RATE": self.fetch_key_rate_history(start_date, end_date),
        }

    def fetch_current_macro_snapshot(self) -> list[MarketSnapshot]:
        return [
            self.fetch_current_brent(),
            self.fetch_current_usd_rub(),
            self.fetch_index_snapshot("IMOEX"),
            self.fetch_current_key_rate(),
            self.fetch_index_snapshot("RGBI"),
        ]

    def fetch_asset_news(self, ticker: str, company_name: str, limit: int = 10) -> list[NewsSnapshot]:
        query = self._build_news_query(ticker, company_name)
        response = self._client.get(
            settings.NEWS_RSS_URL,
            params={
                "q": query,
                "hl": settings.NEWS_FEED_LANGUAGE,
                "gl": settings.NEWS_FEED_REGION,
                "ceid": f"{settings.NEWS_FEED_REGION}:{settings.NEWS_FEED_LANGUAGE}",
            },
        )
        response.raise_for_status()

        try:
            root = ElementTree.fromstring(response.text)
        except ElementTree.ParseError as exc:
            raise ExternalDataError(f"Unable to parse RSS response for {ticker}.") from exc

        raw_items = root.findall("./channel/item")
        if not raw_items:
            raw_items = root.findall(".//item")

        snapshots: list[NewsSnapshot] = []
        for item in raw_items:
            title = (item.findtext("title") or "").strip()
            url = (item.findtext("link") or "").strip()
            if not title or not url:
                continue

            summary_html = item.findtext("description") or ""
            summary = self._strip_html(summary_html)
            source_node = item.find("source")
            source = (source_node.text or "").strip() if source_node is not None else ""
            published_at = self._parse_rss_datetime(item.findtext("pubDate"))

            snapshots.append(
                NewsSnapshot(
                    title=title,
                    summary=summary or f"Новость по активу {ticker.upper()}",
                    url=url,
                    source=source or "Google News",
                    sentiment=self._detect_sentiment(title, summary),
                    published_at=published_at,
                )
            )

            if len(snapshots) >= limit:
                break

        return snapshots

    def _fetch_moex_history(self, path: str, start_date: date, end_date: date) -> list[dict[str, Any]]:
        all_rows: list[dict[str, Any]] = []
        start_index = 0
        while True:
            payload = self._get_json(
                f"{settings.MOEX_BASE_URL}{path}",
                params={
                    "from": start_date.isoformat(),
                    "till": end_date.isoformat(),
                    "start": start_index,
                    "iss.meta": "off",
                },
            )
            rows = self._block_rows(payload, "history")
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < 100:
                break
            start_index += 100
        return all_rows

    def _get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = self._client.get(url, params=params)
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _block_rows(payload: dict[str, Any], block_name: str) -> list[dict[str, Any]]:
        block = payload.get(block_name)
        if not block:
            return []
        columns = block.get("columns", [])
        return [dict(zip(columns, row)) for row in block.get("data", [])]

    @staticmethod
    def _first_number(payload: dict[str, Any], *keys: str, default: float = 0.0) -> float:
        for key in keys:
            value = payload.get(key)
            if value not in (None, ""):
                return float(value)
        return float(default)

    @staticmethod
    def _first_positive_number(payload: dict[str, Any], *keys: str, default: float = 0.0) -> float:
        for key in keys:
            value = payload.get(key)
            if value in (None, ""):
                continue
            number = float(value)
            if number > 0:
                return number
        return float(default)

    @staticmethod
    def _parse_moex_datetime(system_time: str | None, fallback_time: str | None) -> datetime:
        if system_time:
            try:
                return datetime.fromisoformat(system_time)
            except ValueError:
                pass
        if fallback_time:
            now = datetime.now()
            parsed_time = datetime.strptime(fallback_time, "%H:%M:%S").time()
            return datetime.combine(now.date(), parsed_time)
        return datetime.now()

    @staticmethod
    def _build_news_query(ticker: str, company_name: str) -> str:
        safe_company = " ".join(company_name.split()) if company_name else ticker.upper()
        return f'"{ticker.upper()}" OR "{safe_company}" акции MOEX'

    @staticmethod
    def _strip_html(raw_html: str) -> str:
        if not raw_html:
            return ""
        text = BeautifulSoup(raw_html, "html.parser").get_text(" ", strip=True)
        return " ".join(text.split())[:500]

    @staticmethod
    def _parse_rss_datetime(raw_date: str | None) -> datetime:
        if not raw_date:
            return datetime.now()
        try:
            parsed = parsedate_to_datetime(raw_date)
        except (TypeError, ValueError):
            return datetime.now()
        if parsed.tzinfo is not None:
            return parsed.astimezone(UTC).replace(tzinfo=None)
        return parsed

    @staticmethod
    def _detect_sentiment(title: str, summary: str) -> str:
        text = f"{title} {summary}".lower()
        positive_keywords = ("рост", "вырос", "прибыль", "рекорд", "дивиденд", "подорожал", "повысил", "укрепился")
        negative_keywords = ("падение", "снижение", "убыток", "санкц", "обвал", "штраф", "дешевеет", "риски")
        has_positive = any(keyword in text for keyword in positive_keywords)
        has_negative = any(keyword in text for keyword in negative_keywords)
        if has_positive and not has_negative:
            return "positive"
        if has_negative and not has_positive:
            return "negative"
        return "neutral"
