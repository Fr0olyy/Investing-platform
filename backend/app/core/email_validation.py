from __future__ import annotations

import re


EMAIL_MAX_LENGTH = 254
LOCAL_PART_MIN_LENGTH = 3
LOCAL_PART_MAX_LENGTH = 64
DOMAIN_MAX_LENGTH = 253

BLOCKED_EMAIL_DOMAINS = {
    "example.com",
    "example.net",
    "example.org",
    "localhost",
    "local",
    "test.com",
    "random.ru",
    "mailinator.com",
    "10minutemail.com",
    "tempmail.com",
    "temp-mail.org",
}

WEAK_LOCAL_PARTS = {
    "test",
    "user",
    "admin",
    "qwe",
    "asd",
    "random",
    "email",
    "mail",
}

LOCAL_PART_RE = re.compile(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$")
DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def normalize_email(value: str) -> str:
    return value.strip().lower()


def validate_registration_email(value: str) -> str:
    email = normalize_email(value)

    if len(email) > EMAIL_MAX_LENGTH:
        raise ValueError("Email слишком длинный. Максимум 254 символа.")

    if "@" not in email:
        raise ValueError("Введите корректный email.")

    local_part, domain = email.rsplit("@", 1)

    if not (LOCAL_PART_MIN_LENGTH <= len(local_part) <= LOCAL_PART_MAX_LENGTH):
        raise ValueError("Часть email до @ должна быть от 3 до 64 символов.")

    if local_part.isdigit() or local_part in WEAK_LOCAL_PARTS:
        raise ValueError("Введите более реальный email, а не тестовый адрес.")

    if not LOCAL_PART_RE.fullmatch(local_part):
        raise ValueError("Email содержит недопустимые символы до @.")

    if len(domain) > DOMAIN_MAX_LENGTH or "." not in domain:
        raise ValueError("Укажите реальный домен почты, например gmail.com.")

    if domain in BLOCKED_EMAIL_DOMAINS:
        raise ValueError("Этот домен похож на тестовый. Укажите реальную почту.")

    labels = domain.split(".")
    if any(not label or not DOMAIN_LABEL_RE.fullmatch(label) for label in labels):
        raise ValueError("Домен email указан некорректно.")

    tld = labels[-1]
    if len(tld) < 2 or tld.isdigit():
        raise ValueError("Доменная зона email указана некорректно.")

    return email
