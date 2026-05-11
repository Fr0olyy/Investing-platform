from __future__ import annotations

import argparse

from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.database import SessionLocal, init_db
from app.db.models import Portfolio, User


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create admin user if missing, or promote existing user to admin.",
    )
    parser.add_argument("--email", default="admin@example.com", help="Admin email.")
    parser.add_argument("--password", default="Admin12345!", help="Admin password.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password for an existing user.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    init_db()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email))
        if user:
            user.role = "admin"
            user.is_active = True
            if args.reset_password:
                user.hashed_password = get_password_hash(args.password)
            db.commit()
            print(f"OK: user '{args.email}' promoted to admin.")
            return

        user = User(
            email=args.email,
            hashed_password=get_password_hash(args.password),
            role="admin",
            is_active=True,
        )
        portfolio = Portfolio(
            user=user,
            cash_balance=settings.STARTING_BALANCE,
            base_currency=settings.BASE_CURRENCY,
        )
        db.add_all([user, portfolio])
        db.commit()
        print(f"OK: admin '{args.email}' created.")


if __name__ == "__main__":
    main()

