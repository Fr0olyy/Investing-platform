from app.schemas.base import APIModel


class PositionResponse(APIModel):
    ticker: str
    name: str
    quantity: int
    average_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    share_of_portfolio: float


class AllocationItem(APIModel):
    ticker: str
    share_of_portfolio: float
    market_value: float


class PortfolioSummaryResponse(APIModel):
    cash_balance: float
    invested_value: float
    total_value: float
    total_pnl: float
    total_pnl_percent: float
    base_currency: str
    positions_count: int
    positions: list[PositionResponse]
    allocation: list[AllocationItem]
