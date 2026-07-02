from __future__ import annotations

import os
import secrets
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, session
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    create_engine,
    func,
    inspect,
    or_,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, scoped_session, sessionmaker
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import make_url
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
try:
    BOGOTA = ZoneInfo("America/Bogota")
except ZoneInfoNotFoundError:
    BOGOTA = timezone(timedelta(hours=-5))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env.tablet")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="cashier")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    immutable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    color: Mapped[str] = mapped_column(String(12), default="#2E6BE6")
    icon: Mapped[str] = mapped_column(String(20), default="🧪")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 0), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    customizable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    category: Mapped[Category] = relationship()


class Topping(Base):
    __tablename__ = "toppings"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    group_name: Mapped[str] = mapped_column(String(60))
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 0), nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)


class CashSession(Base):
    __tablename__ = "cash_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    opened_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closing_cash: Mapped[Decimal | None] = mapped_column(Numeric(12, 0))
    status: Mapped[str] = mapped_column(String(20), default="open")
    notes: Mapped[str] = mapped_column(Text, default="")


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    cash_session_id: Mapped[int] = mapped_column(ForeignKey("cash_sessions.id"))
    status: Mapped[str] = mapped_column(String(20), default="paid")
    source: Mapped[str] = mapped_column(String(20), default="pos")
    payment_method: Mapped[str] = mapped_column(String(30), default="cash")
    cash_amount: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    qr_amount: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    card_amount: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 0), default=0)
    received: Mapped[Decimal | None] = mapped_column(Numeric(12, 0))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    cashier: Mapped[User] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 0))
    toppings: Mapped[str] = mapped_column(Text, default="")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 0))


PRICED_MODIFIERS = {
    "Fórmula 1 — 2 toppings + 1 salsa": Decimal(3000),
    "Fórmula 2 — 3 toppings + 2 salsas": Decimal(5000),
    "Fórmula 3 — 4 toppings + 2 salsas": Decimal(7000),
    "Fórmula X — 5 toppings premium + 3 salsas + booster 8 ml": Decimal(10000),
    "Booster 8 ml": Decimal(3000),
    "Booster 20 ml": Decimal(5000),
}
PRICED_MODIFIER_CODES = {
    "formula_1": ("Fórmula 1 — 2 toppings + 1 salsa", Decimal(3000)),
    "formula_2": ("Fórmula 2 — 3 toppings + 2 salsas", Decimal(5000)),
    "formula_3": ("Fórmula 3 — 4 toppings + 2 salsas", Decimal(7000)),
    "formula_x": ("Fórmula X — 5 toppings premium + 3 salsas + booster 8 ml", Decimal(10000)),
    "booster_8": ("Booster 8 ml", Decimal(3000)),
    "booster_20": ("Booster 20 ml", Decimal(5000)),
}


def money(value) -> int | None:
    return None if value is None else int(value)


def normalize_database_url(raw_url):
    value = str(raw_url or "").strip().strip("\"'")
    if value.startswith("postgres://"):
        value = "postgresql+psycopg2://" + value.removeprefix("postgres://")
    elif value.startswith("postgresql://"):
        value = "postgresql+psycopg2://" + value.removeprefix("postgresql://")
    if not value.startswith("postgresql"):
        return value
    url = make_url(value)
    query = dict(url.query)
    host = (url.host or "").lower()
    if "sslmode" not in query and ("supabase" in host or os.getenv("DATABASE_SSLMODE")):
        query["sslmode"] = os.getenv("DATABASE_SSLMODE", "require")
    return url.set(query=query).render_as_string(hide_password=False)


def database_provider(engine):
    host = (engine.url.host or "").lower()
    if "supabase" in host:
        return "supabase"
    return "sqlite" if engine.dialect.name == "sqlite" else "postgresql"


def initialize_database(engine, Session):
    lock_connection = None
    try:
        if engine.dialect.name == "postgresql":
            lock_connection = engine.connect()
            lock_connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": 824673921})
        Base.metadata.create_all(engine)
        upgrade_schema(engine)
        with Session() as db:
            seed(db)
    finally:
        if lock_connection is not None:
            try:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": 824673921})
            finally:
                lock_connection.close()


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "local-development-key-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "False").lower() == "true",
    )
    if test_config:
        app.config.update(test_config)

    db_url = app.config.get("DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///instance/superlab.db")
    db_url = normalize_database_url(db_url)
    require_postgres = (
        os.getenv("DATABASE_REQUIRE_POSTGRES", "False").lower() == "true"
        or os.getenv("RENDER", "False").lower() == "true"
    )
    if require_postgres and not db_url.startswith("postgresql"):
        raise RuntimeError("DATABASE_URL debe ser una conexión PostgreSQL de Supabase en producción")
    if db_url.startswith("sqlite:///") and not db_url.startswith("sqlite:////") and db_url != "sqlite:///:memory:":
        db_path = ROOT / "backend" / db_url.removeprefix("sqlite:///")
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{db_path.as_posix()}"
    engine_options = {"pool_pre_ping": True}
    if db_url.startswith("postgresql"):
        engine_options.update(pool_size=3, max_overflow=2, pool_recycle=300, pool_timeout=20)
    engine = create_engine(db_url, **engine_options)
    Session = scoped_session(sessionmaker(bind=engine, expire_on_commit=False))
    app.extensions["db_session"] = Session
    app.extensions["db_engine"] = engine
    initialize_database(engine, Session)

    @app.teardown_appcontext
    def cleanup(_exc=None):
        Session.remove()

    def current_user(db):
        user_id = session.get("user_id")
        return db.get(User, user_id) if user_id else None

    def auth_required(admin=False):
        def decorator(fn):
            @wraps(fn)
            def wrapped(*args, **kwargs):
                db = Session()
                user = current_user(db)
                if not user or not user.active:
                    return jsonify(error="Sesión requerida"), 401
                if admin and user.role != "superadmin":
                    return jsonify(error="Acceso exclusivo del superusuario"), 403
                return fn(db, user, *args, **kwargs)
            return wrapped
        return decorator

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.get("/health")
    def health():
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return jsonify(
                status="ok",
                timezone="America/Bogota",
                database={"connected": True, "engine": engine.dialect.name, "provider": database_provider(engine)},
            )
        except Exception:
            return jsonify(
                status="error",
                timezone="America/Bogota",
                database={"connected": False, "engine": engine.dialect.name},
            ), 503

    @app.get("/app")
    def app_shell():
        return send_from_directory(FRONTEND, "app.html")

    @app.get("/tablet")
    def tablet_shell():
        return send_from_directory(FRONTEND, "tablet.html")

    @app.get("/static/<path:path>")
    def static_files(path):
        return send_from_directory(FRONTEND / "static", path)

    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        with Session() as db:
            user = db.scalar(select(User).where(func.lower(User.email) == str(data.get("email", "")).lower()))
            if not user or not user.active or not check_password_hash(user.password_hash, str(data.get("password", ""))):
                return jsonify(error="Correo o contraseña incorrectos"), 401
            session.clear()
            session["user_id"] = user.id
            return jsonify(user=serialize_user(user))

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.post("/api/tablet/session")
    def tablet_session():
        data = request.get_json(silent=True) or {}
        with Session() as db:
            user = db.scalar(select(User).where(
                User.role == "tablet",
                User.active.is_(True),
                func.lower(User.email) == str(data.get("email", "")).strip().lower(),
            ))
            if not user or not check_password_hash(user.password_hash, str(data.get("password", ""))):
                return jsonify(error="Correo o contraseña de tablet incorrectos"), 401
            session.clear()
            session["user_id"] = user.id
            return jsonify(user=serialize_user(user), store=store_info())

    @app.get("/api/me")
    @auth_required()
    def me(db, user):
        return jsonify(user=serialize_user(user), store=store_info())

    @app.get("/api/system/database")
    @auth_required(admin=True)
    def database_status(db, user):
        return jsonify(
            connected=True,
            engine=engine.dialect.name,
            provider=database_provider(engine),
            persistent=engine.dialect.name == "postgresql",
            counts={
                "users": db.scalar(select(func.count(User.id))) or 0,
                "products": db.scalar(select(func.count(Product.id)).where(Product.deleted_at.is_(None))) or 0,
                "toppings": db.scalar(select(func.count(Topping.id))) or 0,
                "orders": db.scalar(select(func.count(Order.id))) or 0,
            },
        )

    @app.get("/api/catalog")
    @auth_required()
    def catalog(db, user):
        categories = db.scalars(select(Category).where(Category.active.is_(True)).order_by(Category.id)).all()
        products = db.scalars(select(Product).where(Product.deleted_at.is_(None)).order_by(Product.name)).all()
        toppings = db.scalars(select(Topping).order_by(Topping.group_name, Topping.name)).all()
        return jsonify(
            categories=[serialize_category(x) for x in categories],
            products=[serialize_product(x) for x in products],
            toppings=[serialize_topping(x) for x in toppings],
        )

    @app.route("/api/products", methods=["GET", "POST"])
    @auth_required(admin=True)
    def products(db, user):
        if request.method == "GET":
            return jsonify(products=[serialize_product(x) for x in db.scalars(select(Product).where(Product.deleted_at.is_(None)).order_by(Product.name)).all()])
        data = request.get_json(silent=True) or {}
        error = validate_product(data)
        if error:
            return jsonify(error=error), 400
        product = Product(
            name=data["name"].strip(),
            category_id=int(data["category_id"]),
            description=str(data.get("description", "")).strip(),
            image_url=validate_image(data.get("image_url")),
            price=parse_optional_money(data.get("price")),
            sku=str(data.get("sku") or "").strip() or None,
            available=bool(data.get("available", True)),
            customizable=bool(data.get("customizable", False)),
        )
        db.add(product)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return jsonify(error="El código ya está asignado a otro producto"), 409
        return jsonify(product=serialize_product(product)), 201

    @app.route("/api/products/<int:product_id>", methods=["PUT", "DELETE"])
    @auth_required(admin=True)
    def product_detail(db, user, product_id):
        product = db.get(Product, product_id)
        if not product:
            return jsonify(error="Producto no encontrado"), 404
        if request.method == "DELETE":
            product.available = False
            product.deleted_at = datetime.now(timezone.utc)
            db.commit()
            return jsonify(ok=True, mode="deleted")
        data = request.get_json(silent=True) or {}
        error = validate_product(data)
        if error:
            return jsonify(error=error), 400
        product.name = data["name"].strip()
        product.category_id = int(data["category_id"])
        product.description = str(data.get("description", "")).strip()
        product.image_url = validate_image(data.get("image_url"))
        product.price = parse_optional_money(data.get("price"))
        product.sku = str(data.get("sku") or "").strip() or None
        product.available = bool(data.get("available", True))
        product.customizable = bool(data.get("customizable", False))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return jsonify(error="El código ya está asignado a otro producto"), 409
        return jsonify(product=serialize_product(product))

    @app.route("/api/users", methods=["GET", "POST"])
    @auth_required(admin=True)
    def users(db, user):
        if request.method == "GET":
            rows = db.scalars(select(User).order_by(User.immutable.desc(), User.name)).all()
            return jsonify(users=[serialize_user(x) for x in rows])
        data = request.get_json(silent=True) or {}
        name, email, password = str(data.get("name", "")).strip(), str(data.get("email", "")).strip().lower(), str(data.get("password", ""))
        pin = str(data.get("pin", "")).strip()
        if len(name) < 2 or "@" not in email or len(password) < 8 or (pin and (not pin.isdigit() or len(pin) < 4)):
            return jsonify(error="Revisa nombre, correo, contraseña (8+) y PIN numérico (4+)"), 400
        if db.scalar(select(User).where(User.email == email)):
            return jsonify(error="El correo ya está registrado"), 409
        worker = User(name=name, email=email, password_hash=generate_password_hash(password), pin_hash=generate_password_hash(pin) if pin else None)
        db.add(worker)
        db.commit()
        return jsonify(user=serialize_user(worker)), 201

    @app.put("/api/users/<int:user_id>")
    @auth_required(admin=True)
    def update_user(db, user, user_id):
        worker = db.get(User, user_id)
        if not worker:
            return jsonify(error="Usuario no encontrado"), 404
        if worker.immutable:
            return jsonify(error="El superusuario es inmutable"), 409
        data = request.get_json(silent=True) or {}
        if "active" in data:
            worker.active = bool(data["active"])
        if data.get("name"):
            worker.name = str(data["name"]).strip()
        if data.get("password"):
            if len(str(data["password"])) < 8:
                return jsonify(error="La contraseña debe tener al menos 8 caracteres"), 400
            worker.password_hash = generate_password_hash(str(data["password"]))
        db.commit()
        return jsonify(user=serialize_user(worker))

    @app.get("/api/cash-session")
    @auth_required()
    def get_cash_session(db, user):
        if user.role == "tablet":
            return jsonify(error="Acceso no permitido"), 403
        row = db.scalar(select(CashSession).where(CashSession.status == "open").order_by(CashSession.id.desc()))
        return jsonify(cash_session=serialize_cash_session(row, db) if row else None)

    @app.post("/api/cash-session/open")
    @auth_required()
    def open_cash_session(db, user):
        if user.role == "tablet":
            return jsonify(error="Acceso no permitido"), 403
        existing = db.scalar(select(CashSession).where(CashSession.status == "open"))
        if existing:
            return jsonify(cash_session=serialize_cash_session(existing, db))
        data = request.get_json(silent=True) or {}
        try:
            opening_cash = parse_money(data.get("opening_cash", 0))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        row = CashSession(opened_by_id=user.id, opening_cash=opening_cash)
        db.add(row)
        db.commit()
        return jsonify(cash_session=serialize_cash_session(row, db)), 201

    @app.post("/api/cash-session/close")
    @auth_required()
    def close_cash_session(db, user):
        if user.role == "tablet":
            return jsonify(error="Acceso no permitido"), 403
        row = db.scalar(select(CashSession).where(CashSession.status == "open"))
        if not row:
            return jsonify(error="No hay una caja abierta"), 409
        data = request.get_json(silent=True) or {}
        try:
            row.closing_cash = parse_money(data.get("closing_cash", 0))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        row.notes = str(data.get("notes", "")).strip()
        row.closed_at = datetime.now(timezone.utc)
        row.status = "closed"
        db.commit()
        return jsonify(cash_session=serialize_cash_session(row, db))

    @app.post("/api/orders")
    @auth_required()
    def create_order(db, user):
        if user.role == "tablet":
            return jsonify(error="La tablet debe enviar comandas desde su pantalla de pedidos"), 403
        cash = db.scalar(select(CashSession).where(CashSession.status == "open"))
        if not cash:
            return jsonify(error="Abre la caja antes de vender"), 409
        data = request.get_json(silent=True) or {}
        raw_items = data.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            return jsonify(error="El pedido está vacío"), 400
        items, subtotal = [], Decimal(0)
        for raw in raw_items:
            product = db.get(Product, int(raw.get("product_id", 0)))
            quantity = int(raw.get("quantity", 0))
            if not product or not product.available or product.price is None or quantity < 1:
                return jsonify(error="Hay un producto no disponible, sin precio o con cantidad inválida"), 400
            try:
                validate_modifier_eligibility(product, raw)
                modifiers = item_modifiers(raw)
            except ValueError as exc:
                return jsonify(error=str(exc)), 400
            modifier_total = sum((price for _name, price in modifiers), Decimal(0))
            unit_price = Decimal(product.price) + modifier_total
            line_total = unit_price * quantity
            subtotal += line_total
            labels = [str(x)[:80] for x in raw.get("toppings", [])]
            labels += [f"{name} (+{money(price):,})".replace(",", ".") for name, price in modifiers]
            items.append(OrderItem(
                product_id=product.id, product_name=product.name, quantity=quantity,
                unit_price=unit_price, subtotal=line_total,
                toppings=", ".join(labels),
            ))
        discount = min(parse_money(data.get("discount", 0)), subtotal)
        total = subtotal - discount
        status = str(data.get("status", "paid"))
        payment = str(data.get("payment_method", "cash"))
        if status not in {"paid", "held"} or payment not in {"cash", "qr", "card", "mixed"}:
            return jsonify(error="Estado o método de pago inválido"), 400
        try:
            cash_amount, qr_amount, card_amount = payment_breakdown(data, payment, total, status)
            received = parse_optional_money(data.get("received"))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        if status == "paid" and payment == "cash" and (received is None or received < total):
            return jsonify(error="El efectivo recibido no puede ser menor al total"), 400
        count = db.scalar(select(func.count(Order.id))) or 0
        order = Order(
            number=f"SL-{datetime.now():%y%m%d}-{count + 1:04d}",
            cashier_id=user.id, cash_session_id=cash.id, status=status,
            source="pos",
            payment_method=payment, cash_amount=cash_amount, qr_amount=qr_amount, card_amount=card_amount,
            subtotal=subtotal, discount=discount, total=total,
            received=received, notes=str(data.get("notes", "")).strip(),
            items=items,
        )
        db.add(order)
        db.commit()
        return jsonify(order=serialize_order(order)), 201

    @app.post("/api/tablet/orders")
    @auth_required()
    def create_tablet_order(db, user):
        if user.role != "tablet":
            return jsonify(error="Este acceso es exclusivo de la tablet"), 403
        cash = db.scalar(select(CashSession).where(CashSession.status == "open"))
        if not cash:
            return jsonify(error="La tienda todavía no ha abierto caja. Solicita ayuda al personal."), 409
        data = request.get_json(silent=True) or {}
        raw_items = data.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            return jsonify(error="El pedido está vacío"), 400
        items, subtotal = [], Decimal(0)
        for raw in raw_items:
            product = db.get(Product, int(raw.get("product_id", 0)))
            quantity = int(raw.get("quantity", 0))
            if not product or not product.available or product.price is None or quantity < 1:
                return jsonify(error="Hay un producto no disponible"), 400
            try:
                validate_modifier_eligibility(product, raw)
                modifiers = item_modifiers(raw)
            except ValueError as exc:
                return jsonify(error=str(exc)), 400
            modifier_total = sum((price for _name, price in modifiers), Decimal(0))
            unit_price = Decimal(product.price) + modifier_total
            line_total = unit_price * quantity
            subtotal += line_total
            labels = [str(x)[:120] for x in raw.get("toppings", [])]
            labels += [f"{name} (+{money(price):,})".replace(",", ".") for name, price in modifiers]
            items.append(OrderItem(
                product_id=product.id, product_name=product.name, quantity=quantity,
                unit_price=unit_price, subtotal=line_total, toppings=", ".join(labels),
            ))
        count = db.scalar(select(func.count(Order.id))) or 0
        order = Order(
            number=f"SL-{datetime.now():%y%m%d}-{count + 1:04d}",
            cashier_id=user.id, cash_session_id=cash.id, status="queued", source="tablet",
            payment_method="pending", cash_amount=0, qr_amount=0, card_amount=0,
            subtotal=subtotal, discount=0, total=subtotal, received=None,
            notes=str(data.get("notes", "")).strip(), items=items,
        )
        db.add(order)
        db.commit()
        return jsonify(order=serialize_order(order)), 201

    @app.get("/api/orders")
    @auth_required()
    def orders(db, user):
        if user.role == "tablet":
            return jsonify(error="Acceso no permitido"), 403
        stmt = select(Order).order_by(Order.created_at.desc()).limit(300)
        if user.role != "superadmin":
            stmt = stmt.where(or_(Order.cashier_id == user.id, Order.source == "tablet"))
        return jsonify(orders=[serialize_order(x) for x in db.scalars(stmt).unique().all()])

    @app.put("/api/orders/<int:order_id>/status")
    @auth_required()
    def update_order_status(db, user, order_id):
        if user.role == "tablet":
            return jsonify(error="Acceso no permitido"), 403
        order = db.get(Order, order_id)
        if not order or order.source != "tablet":
            return jsonify(error="Comanda no encontrada"), 404
        target = str((request.get_json(silent=True) or {}).get("status", ""))
        transitions = {
            "queued": {"preparing"},
            "preparing": {"ready"},
            "ready": {"completed"},
            "completed": set(),
        }
        if target not in transitions.get(order.status, set()):
            return jsonify(error="Cambio de estado no permitido"), 409
        order.status = target
        db.commit()
        return jsonify(order=serialize_order(order))

    @app.get("/api/reports/summary")
    @auth_required(admin=True)
    def reports(db, user):
        paid = db.scalars(select(Order).where(Order.status == "paid").order_by(Order.created_at)).all()
        revenue = sum((Decimal(x.total) for x in paid), Decimal(0))
        by_method = {"cash": 0, "qr": 0, "card": 0}
        by_day = {}
        for row in paid:
            parts = order_payment_parts(row)
            for method, value in parts.items():
                by_method[method] += money(value)
            day = as_bogota(row.created_at).date().isoformat()
            by_day[day] = by_day.get(day, 0) + money(row.total)
        item_rows = db.execute(
            select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"), func.sum(OrderItem.subtotal).label("sales"))
            .join(Order).where(Order.status == "paid").group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(8)
        ).all()
        workers = db.execute(
            select(User.name, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
            .join(Order, Order.cashier_id == User.id, isouter=True).group_by(User.id).order_by(func.sum(Order.total).desc())
        ).all()
        return jsonify(
            kpis={"revenue": money(revenue), "orders": len(paid), "average": money(revenue / len(paid)) if paid else 0, "products": db.scalar(select(func.count(Product.id)).where(Product.deleted_at.is_(None))) or 0},
            by_method=by_method,
            by_day=[{"date": k, "value": v} for k, v in by_day.items()],
            top_products=[{"name": x[0], "quantity": int(x[1]), "sales": money(x[2])} for x in item_rows],
            workers=[{"name": x[0], "orders": int(x[1]), "sales": money(x[2])} for x in workers],
        )

    @app.get("/api/reports/daily-cash")
    @auth_required(admin=True)
    def daily_cash_report(db, user):
        requested = request.args.get("date") or datetime.now(BOGOTA).date().isoformat()
        try:
            selected_date = date.fromisoformat(requested)
        except ValueError:
            return jsonify(error="La fecha debe tener formato AAAA-MM-DD"), 400
        sessions = db.scalars(select(CashSession).order_by(CashSession.opened_at)).all()
        day_sessions = [row for row in sessions if as_bogota(row.opened_at).date() == selected_date]
        serialized = []
        total_sales = Decimal(0)
        cash_sales = Decimal(0)
        qr_sales = Decimal(0)
        card_sales = Decimal(0)
        for row in day_sessions:
            session_data = serialize_cash_session(row, db)
            opener = db.get(User, row.opened_by_id)
            session_data["opened_by"] = opener.name if opener else "Usuario"
            serialized.append(session_data)
            paid = db.scalars(select(Order).where(Order.cash_session_id == row.id, Order.status == "paid")).all()
            for order in paid:
                total_sales += Decimal(order.total)
                parts = order_payment_parts(order)
                cash_sales += parts["cash"]
                qr_sales += parts["qr"]
                card_sales += parts["card"]
        closed = [row for row in day_sessions if row.closed_at is not None]
        opening_total = sum((Decimal(row.opening_cash) for row in day_sessions), Decimal(0))
        closing_total = sum((Decimal(row.closing_cash or 0) for row in closed), Decimal(0))
        difference_total = sum((Decimal(item["difference"] or 0) for item in serialized if item["difference"] is not None), Decimal(0))
        return jsonify(
            date=selected_date.isoformat(),
            summary={
                "session_count": len(day_sessions),
                "closed_count": len(closed),
                "open_count": len(day_sessions) - len(closed),
                "opening_total": money(opening_total),
                "closing_total": money(closing_total),
                "difference_total": money(difference_total),
                "sales": money(total_sales),
                "cash_sales": money(cash_sales),
                "qr_sales": money(qr_sales),
                "card_sales": money(card_sales),
            },
            sessions=serialized,
        )

    return app


def seed(db):
    if not db.scalar(select(User).where(User.role == "superadmin")):
        db.add(User(
            name=os.getenv("SUPERADMIN_NAME", "Superusuario Superlab"),
            email=os.getenv("SUPERADMIN_EMAIL", "admin@superlab.local").lower(),
            password_hash=generate_password_hash(os.getenv("SUPERADMIN_PASSWORD", "Superlab2026!")),
            role="superadmin", active=True, immutable=True,
        ))
    category_specs = [
        ("Bebidas del Lab", "#2E6BE6", "🧪"),
        ("La Barra", "#E8450A", "⚗️"),
        ("Comida", "#22C55E", "🥪"),
        ("Experiencias", "#8B5CF6", "✦"),
    ]
    existing_categories = {row.name: row for row in db.scalars(select(Category)).all()}
    for name, color, icon in category_specs:
        if name not in existing_categories:
            category = Category(name=name, color=color, icon=icon)
            db.add(category)
            existing_categories[name] = category
    if not db.scalar(select(func.count(Topping.id))):
        groups = {
            "Frutas": ["Fresa", "Mango", "Sandía", "Kiwi", "Arándanos", "Frambuesa", "Mora", "Cereza", "Piña", "Uva"],
            "Dulces": ["Gomitas Osito", "Gomitas Agrias", "Malvaviscos", "Chocolatinas"],
            "Crunch": ["Galleta Oreo", "Granola", "Cereal Colorido", "Coco Rallado"],
            "Perlas": ["Perlas de Tapioca", "Perlas de Fruta", "Perlas Explosivas"],
            "Salsas": ["Salsa Chamoy", "Salsa Tajín", "Salsa Chocolate", "Salsa Caramelo", "Salsa Fresa"],
            "Boosters": ["Proteína Vainilla", "Colágeno", "Energizante", "Vitamina C"],
        }
        db.add_all([Topping(name=name, group_name=group) for group, names in groups.items() for name in names])
    db.flush()
    catalog_products = [
        ("001", "La Barra del Lab", "La Barra", "Barra central con más de 30 ingredientes para crear combinaciones únicas: frutas frescas, dulces, crunch, perlas, salsas y boosters."),
        ("002", "Bandeja Enchilada", "La Barra", "Elige 4 frutos de la barra y acompáñalos con tus salsas favoritas. Puede ser enchilada, dulce o ácida."),
        ("003", "Lab Rolls", "La Barra", "Rolls dulces o salados con ingredientes de la barra. Tú decides la mezcla y el estilo."),
        ("004", "Proyecto Res", "Comida", "Lab Roll salado con proteína tipo res, vegetales, toppings y salsas para una experiencia más contundente."),
        ("005", "Proyecto Pollo", "Comida", "Lab Roll salado con proteína tipo pollo, salsas y toppings; ideal para quienes prefieren sabores suaves y cremosos."),
        ("006", "Proyecto Libre", "La Barra", "Roll personalizable con frutas, dulces, salsas y toppings. Una opción creativa para mezclar sin límites."),
        ("007", "Minidonas", "Comida", "Mini donas con coberturas, salsas y sprinkles. Formato llamativo para complementar la experiencia del lab."),
        ("008", "Coleccionables del Lab", "Experiencias", "Figuras coleccionables temáticas para activar la experiencia de marca y motivar recompra o colección."),
        ("009", "Zona Creativa", "Experiencias", "Espacio para pintar y personalizar figuras, pensado como actividad interactiva dentro de la experiencia."),
        ("010", "Smoothie Lab", "Bebidas del Lab", "Bebida de fruta real licuada. Combina ingredientes favoritos para una mezcla fresca y personalizada."),
        ("011", "Granizado Lab", "Bebidas del Lab", "Bebida fría tipo granizado para mezclar sabores y toppings. Refrescante y visualmente llamativa."),
        ("012", "Raspado Lab", "Bebidas del Lab", "Raspado refrescante, divertido y personalizable con sabores, salsas y toppings."),
        ("013", "Sodas del Lab", "Bebidas del Lab", "Soda con burbujas, sabor y toque especial. Ideal para una opción fresca, colorida y personalizable."),
        ("014", "Micheladas del Lab", "Bebidas del Lab", "Michelada con o sin alcohol. El cliente elige la mezcla, el nivel de sabor y el toque final."),
    ]
    existing_codes = {row.sku for row in db.scalars(select(Product).where(Product.sku.is_not(None))).all()}
    for code, name, category_name, description in catalog_products:
        if code not in existing_codes:
            db.add(Product(
                category_id=existing_categories[category_name].id,
                name=name,
                description=description,
                image_url=f"/static/products/{code}.webp",
                price=None,
                sku=code,
                available=True,
                customizable=category_name in {"La Barra", "Bebidas del Lab"},
            ))
    db.commit()


def item_modifiers(raw):
    modifiers = raw.get("modifiers", [])
    if not isinstance(modifiers, list):
        return []
    clean = []
    for modifier in modifiers:
        code = str(modifier.get("code", "") if isinstance(modifier, dict) else "").strip()
        name = str(modifier.get("name", "") if isinstance(modifier, dict) else modifier).strip()
        if not code and not name:
            continue
        if code in PRICED_MODIFIER_CODES:
            clean.append(PRICED_MODIFIER_CODES[code])
            continue
        if name in PRICED_MODIFIERS:
            clean.append((name, PRICED_MODIFIERS[name]))
            continue
        if name.startswith("Formula 1") or name.startswith("F?rmula 1"):
            clean.append(PRICED_MODIFIER_CODES["formula_1"])
            continue
        if name.startswith("Formula 2") or name.startswith("F?rmula 2"):
            clean.append(PRICED_MODIFIER_CODES["formula_2"])
            continue
        if name.startswith("Formula 3") or name.startswith("F?rmula 3"):
            clean.append(PRICED_MODIFIER_CODES["formula_3"])
            continue
        if name.startswith("Formula X") or name.startswith("F?rmula X"):
            clean.append(PRICED_MODIFIER_CODES["formula_x"])
            continue
        if name not in PRICED_MODIFIERS:
            raise ValueError(f"Adición no válida: {name}")
    return clean


def validate_modifier_eligibility(product, raw):
    codes = {
        str(modifier.get("code", "")).strip()
        for modifier in raw.get("modifiers", [])
        if isinstance(modifier, dict)
    }
    formula_codes = {"formula_1", "formula_2", "formula_3", "formula_x"}
    booster_codes = {"booster_8", "booster_20"}
    if codes & formula_codes and str(product.sku) != "001":
        raise ValueError("Las fórmulas solo se pueden agregar al Granizado Lab")
    if codes & booster_codes and str(product.sku) not in {"001", "002", "003"}:
        raise ValueError("Las jeringas solo están disponibles para granizado, raspado y smoothie")


def seed(db):
    if not db.scalar(select(User).where(User.role == "superadmin")):
        db.add(User(
            name=os.getenv("SUPERADMIN_NAME", "Superusuario Superlab"),
            email=os.getenv("SUPERADMIN_EMAIL", "admin@superlab.local").lower(),
            password_hash=generate_password_hash(os.getenv("SUPERADMIN_PASSWORD", "Superlab2026!")),
            role="superadmin", active=True, immutable=True,
        ))

    tablet_email = os.getenv("TABLET_USER_EMAIL", "tablet@superlab.co").lower()
    tablet_password = os.getenv("TABLET_USER_PASSWORD")
    tablet_user = db.scalar(select(User).where(User.role == "tablet"))
    if not tablet_user:
        tablet_user = User(
            role="tablet",
            password_hash=generate_password_hash(secrets.token_urlsafe(32)),
            active=bool(tablet_password),
        )
        db.add(tablet_user)
    tablet_user.name = "Tablet de autoservicio"
    tablet_user.email = tablet_email
    if tablet_password:
        tablet_user.password_hash = generate_password_hash(tablet_password)
        tablet_user.active = True
    tablet_user.immutable = True

    category_specs = [
        ("Productos Lab", "#E8450A", "🧪"),
        ("Bebidas Lab", "#2E6BE6", "🥤"),
        ("Bandejas Lab", "#22C55E", "🍓"),
        ("Adiciones Lab", "#8B5CF6", "✦"),
    ]
    existing_categories = {row.name: row for row in db.scalars(select(Category)).all()}
    desired_categories = {name for name, _color, _icon in category_specs}
    for category in existing_categories.values():
        if category.name not in desired_categories:
            category.active = False
    for name, color, icon in category_specs:
        category = existing_categories.get(name)
        if not category:
            category = Category(name=name)
            db.add(category)
            existing_categories[name] = category
        category.color = color
        category.icon = icon
        category.active = True

    topping_specs = {
        "Frutas": ["Fresa", "Mango", "Sandía", "Kiwi", "Arándanos", "Frambuesa", "Mora", "Cereza", "Piña", "Uva", "Tomate de árbol", "Melón"],
        "Sabores smoothie": ["Frutos Rojos", "Frutos Amarillos", "Frutos Verdes", "Sandía & Mango"],
        "Siropes": ["Sirope Fresa", "Sirope Mora Azul", "Sirope Mango", "Sirope Maracuyá", "Sirope Cereza", "Sirope Uva", "Sirope Limón"],
        "Dulces": ["Gomitas Osito", "Gomitas Agrias", "Malvaviscos", "Chocolatinas", "Chispas de Colores"],
        "Crunch": ["Galleta Oreo", "Granola", "Cereal Colorido", "Coco Rallado", "Maní"],
        "Perlas": ["Perlas de Tapioca", "Perlas de Fruta", "Perlas Explosivas"],
        "Salsas": ["Chamoy", "Chocolate", "Leche Condensada", "Sirope", "Salsa Fresa", "Caramelo", "Crema de Leche", "Yogur"],
        "Sales": ["Sales dulces", "Sales picantes", "Miguelito", "Tajín"],
        "Paletas": ["Paleta dulce", "Paleta ácida"],
        "Proteínas": ["Pollo", "Carne", "Proyecto libre", "Dulce"],
        "Boosters Lab": ["Chocolate booster", "Licor booster", "Chamoy booster", "Leche Condensada booster", "Sirope booster"],
    }
    existing_toppings = {row.name: row for row in db.scalars(select(Topping)).all()}
    for group, names in topping_specs.items():
        for name in names:
            topping = existing_toppings.get(name)
            if not topping:
                topping = Topping(name=name)
                db.add(topping)
                existing_toppings[name] = topping
            topping.group_name = group
            topping.available = True

    db.flush()
    catalog_products = [
        ("001", "Granizado Lab 12 oz", "Bebidas Lab", "Granizado Lab 12 oz. Incluye granizado + 3 toppings + 1 salsa + 1 paleta dulce.", 15000, True),
        ("002", "Raspado Lab 12oz", "Bebidas Lab", "Raspado Lab 12oz. Hielo molido + 2 siropes + leche condensada.", 8000, True),
        ("003", "Smoothie Lab 16oz", "Bebidas Lab", "Smoothie Lab 16oz. Elige frutos rojos, amarillos, verdes o sandía & mango.", 16000, True),
        ("004", "Bowl Lab", "Productos Lab", "Bowl Lab. Elige 5 frutas de la barra + yogur o crema de leche + chamoy + sales dulces o picantes.", 17000, True),
        ("005", "Bandeja fruti Lab", "Bandejas Lab", "Bandeja fruti Lab. Elige 4 frutas de la barra + yogur o crema de leche + chamoy + sales dulces o picantes.", 25000, True),
        ("006", "Lab Rolls - Carne", "Productos Lab", "Lab Rolls - Carne. Roll salado con carne, vegetales y salsas.", 22000, True),
        ("007", "Fórmula 1", "Adiciones Lab", "Adición básica para potenciar tu pedido. Nivel de sabor 1.", 3000, False),
        ("008", "Fórmula 2", "Adiciones Lab", "Adición intermedia para llevar tu experiencia al siguiente nivel.", 5000, False),
        ("009", "Fórmula 3", "Adiciones Lab", "Adición avanzada para los que buscan más sabor e intensidad.", 7000, False),
        ("010", "Fórmula X", "Adiciones Lab", "La fórmula secreta. Máxima potencia, solo para los más atrevidos.", 10000, False),
        ("011", "Sodas Italianas Lab 16oz", "Bebidas Lab", "Soda italiana artesanal bien fría con hielo, burbujeante y refrescante.", 12000, True),
        ("012", "Michelada Lab 12oz", "Bebidas Lab", "Michelada estilo Lab con borde enchilado, hielo y toque de limón.", 14000, True),
        ("013", "Bandeja Enchilada Lab", "Bandejas Lab", "Bandeja de frutas frescas en cubos con chamoy y chile piquín al centro.", 23000, True),
        ("014", "Boosters Lab 8oz", "Adiciones Lab", "Booster en presentación pequeña para darle el toque perfecto a tu combo.", 3000, True),
        ("015", "Lab Rolls - Pollo", "Productos Lab", "Lab Rolls - Pollo. Roll salado con pollo, champiñones, crema y salsa.", 22000, True),
        ("016", "Lab Rolls - Dulce", "Productos Lab", "Lab Rolls - Dulce. Roll dulce con fresas y chocolate.", 22000, True),
        ("017", "Lab Rolls - Proyecto Libre", "Productos Lab", "Roll de tortilla relleno a tu gusto, bañado en salsa especial de la casa.", 22000, True),
        ("018", "Boosters Lab 20oz", "Adiciones Lab", "Booster en presentación grande para maximizar el sabor de tu experiencia.", 5000, True),
    ]
    imported_product_images = {
        "007": "007.png",
        "008": "008.png",
        "009": "009.png",
        "010": "010.png",
        "011": "011.png",
        "012": "012.png",
        "013": "013.png",
        "014": "014.png",
        "017": "017.jpeg",
        "018": "018.png",
    }
    existing_products = {row.sku: row for row in db.scalars(select(Product).where(Product.sku.is_not(None))).all()}
    for code, name, category_name, description, price, customizable in catalog_products:
        product = existing_products.get(code)
        if not product:
            product = Product(sku=code)
            db.add(product)
        product.category_id = existing_categories[category_name].id
        product.name = name
        product.description = description
        product.image_url = f"/static/products/{imported_product_images.get(code, f'{code}.webp')}"
        product.price = Decimal(price)
        product.available = True
        product.customizable = customizable
        product.deleted_at = None
    db.commit()


def parse_money(value):
    try:
        amount = Decimal(str(value or 0))
    except Exception as exc:
        raise ValueError("Monto inválido") from exc
    if amount < 0 or amount != amount.to_integral_value():
        raise ValueError("El monto debe ser un entero positivo")
    return amount


def parse_optional_money(value):
    return None if value in (None, "") else parse_money(value)


def payment_breakdown(data, payment, total, status):
    if status == "held":
        return Decimal(0), Decimal(0), Decimal(0)
    if payment == "cash":
        return total, Decimal(0), Decimal(0)
    if payment == "qr":
        return Decimal(0), total, Decimal(0)
    if payment == "card":
        return Decimal(0), Decimal(0), total
    cash = parse_money(data.get("cash_amount", 0))
    qr = parse_money(data.get("qr_amount", 0))
    card = parse_money(data.get("card_amount", 0))
    active_parts = sum(1 for value in (cash, qr, card) if value > 0)
    if active_parts < 2:
        raise ValueError("El pago mixto debe usar al menos dos métodos")
    if cash + qr + card != total:
        raise ValueError("Los montos de efectivo, QR y tarjeta deben sumar exactamente el total")
    return cash, qr, card


def validate_image(value):
    image = str(value or "").strip() or None
    if image and len(image) > 3_000_000:
        raise ValueError("La imagen supera el tamaño permitido")
    if image and not (image.startswith(("https://", "http://", "data:image/"))):
        raise ValueError("La imagen debe ser una URL válida o un archivo de imagen")
    return image


def validate_product(data):
    if len(str(data.get("name", "")).strip()) < 2:
        return "El nombre del producto es obligatorio"
    try:
        if int(data.get("category_id", 0)) < 1:
            return "Selecciona una categoría"
        parse_optional_money(data.get("price"))
        validate_image(data.get("image_url"))
    except (TypeError, ValueError):
        return "Categoría o precio inválido"
    code = str(data.get("sku") or "").strip()
    if code and (not code.isdigit() or len(code) > 18):
        return "El código debe contener únicamente números"
    return None


def serialize_user(x):
    return {"id": x.id, "name": x.name, "email": x.email, "role": x.role, "active": x.active, "immutable": x.immutable, "created_at": bogota_iso(x.created_at)}


def serialize_category(x):
    return {"id": x.id, "name": x.name, "color": x.color, "icon": x.icon}


def serialize_product(x):
    return {"id": x.id, "name": x.name, "description": x.description, "image_url": x.image_url, "price": money(x.price), "sku": x.sku, "available": x.available, "customizable": x.customizable, "category_id": x.category_id, "category": x.category.name if x.category else "", "created_at": bogota_iso(x.created_at)}


def serialize_topping(x):
    return {"id": x.id, "name": x.name, "group": x.group_name, "price": money(x.price), "available": x.available}


def serialize_order(x):
    return {
        "id": x.id, "number": x.number, "cashier": x.cashier.name, "status": x.status,
        "source": x.source,
        "payment_method": x.payment_method, "cash_amount": money(x.cash_amount), "qr_amount": money(x.qr_amount),
        "card_amount": money(x.card_amount), "subtotal": money(x.subtotal), "discount": money(x.discount),
        "total": money(x.total), "received": money(x.received), "notes": x.notes, "created_at": bogota_iso(x.created_at),
        "items": [{"name": i.product_name, "quantity": i.quantity, "unit_price": money(i.unit_price), "subtotal": money(i.subtotal), "toppings": i.toppings} for i in x.items],
    }


def serialize_cash_session(x, db):
    paid = db.scalars(select(Order).where(Order.cash_session_id == x.id, Order.status == "paid")).all()
    sales = sum((Decimal(o.total) for o in paid), Decimal(0))
    cash_sales = sum((order_payment_parts(o)["cash"] for o in paid), Decimal(0))
    expected = Decimal(x.opening_cash) + cash_sales
    return {
        "id": x.id, "status": x.status, "opened_at": bogota_iso(x.opened_at), "closed_at": bogota_iso(x.closed_at) if x.closed_at else None,
        "opening_cash": money(x.opening_cash), "closing_cash": money(x.closing_cash), "sales": money(sales),
        "cash_sales": money(cash_sales), "expected_cash": money(expected),
        "difference": money(Decimal(x.closing_cash) - expected) if x.closing_cash is not None else None,
        "orders": len(paid), "notes": x.notes,
    }


def store_info():
    return {"name": os.getenv("STORE_NAME", "Superlab — Mix and Chill"), "branch": "Sucursal principal", "currency": "COP", "timezone": "America/Bogota"}


def as_bogota(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(BOGOTA)


def bogota_iso(value):
    if value is None:
        return None
    return as_bogota(value).isoformat()


def order_payment_parts(order):
    cash = Decimal(order.cash_amount or 0)
    qr = Decimal(order.qr_amount or 0)
    card = Decimal(order.card_amount or 0)
    if cash + qr + card == 0 and order.status == "paid":
        if order.payment_method == "cash":
            cash = Decimal(order.total)
        elif order.payment_method in {"qr", "transfer"}:
            qr = Decimal(order.total)
        elif order.payment_method == "card":
            card = Decimal(order.total)
    return {"cash": cash, "qr": qr, "card": card}


def upgrade_schema(engine):
    """Small idempotent upgrades for existing local databases and first deploys."""
    columns = {column["name"] for column in inspect(engine).get_columns("products")}
    order_columns = {column["name"] for column in inspect(engine).get_columns("orders")}
    statements = []
    if "image_url" not in columns:
        statements.append("ALTER TABLE products ADD COLUMN image_url TEXT")
    if "created_at" not in columns:
        statements.append("ALTER TABLE products ADD COLUMN created_at TIMESTAMP")
    if "deleted_at" not in columns:
        statements.append("ALTER TABLE products ADD COLUMN deleted_at TIMESTAMP")
    for name in ("cash_amount", "qr_amount", "card_amount"):
        if name not in order_columns:
            statements.append(f"ALTER TABLE orders ADD COLUMN {name} NUMERIC(12,0) NOT NULL DEFAULT 0")
    if "source" not in order_columns:
        statements.append("ALTER TABLE orders ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'pos'")
    if statements:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))
