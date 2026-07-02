import os
import tempfile

import pytest

os.environ["TABLET_USER_EMAIL"] = "tablet-test@superlab.local"
os.environ["TABLET_USER_PASSWORD"] = "TabletTestPassword2026!"

from app import create_app, normalize_database_url


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    app = create_app({"TESTING": True, "DATABASE_URL": f"sqlite:///{path}", "SECRET_KEY": "test"})
    with app.test_client() as client:
        yield client
    app.extensions["db_session"].remove()
    app.extensions["db_engine"].dispose()
    os.unlink(path)


def login(client):
    return client.post("/api/auth/login", json={"email": "admin@superlab.local", "password": "Superlab2026!"})


def test_login_and_seeded_catalog(client):
    assert login(client).status_code == 200
    response = client.get("/api/catalog")
    assert response.status_code == 200
    products = response.get_json()["products"]
    assert len(products) == 18
    assert {product["sku"]: product["price"] for product in products}["001"] == 15000
    assert {product["sku"]: product["name"] for product in products}["001"] == "Granizado Lab 12 oz"
    assert {product["sku"]: product["name"] for product in products}["002"] == "Raspado Lab 12oz"
    assert {product["sku"]: product["price"] for product in products}["002"] == 8000
    assert {product["sku"]: product["name"] for product in products}["003"] == "Smoothie Lab 16oz"
    assert {product["sku"]: product["price"] for product in products}["003"] == 16000
    assert {product["sku"]: product["name"] for product in products}["004"] == "Bowl Lab"
    assert {product["sku"]: product["price"] for product in products}["004"] == 17000
    assert {product["sku"]: product["name"] for product in products}["005"] == "Bandeja fruti Lab"
    assert {product["sku"]: product["price"] for product in products}["005"] == 25000
    assert {product["sku"]: product["name"] for product in products}["006"] == "Lab Rolls - Carne"
    assert {product["sku"]: product["price"] for product in products}["006"] == 22000
    assert {product["sku"]: product["name"] for product in products}["015"] == "Lab Rolls - Pollo"
    assert {product["sku"]: product["price"] for product in products}["015"] == 22000
    assert {product["sku"]: product["name"] for product in products}["016"] == "Lab Rolls - Dulce"
    assert {product["sku"]: product["price"] for product in products}["016"] == 22000
    assert {product["sku"]: product["name"] for product in products}["013"] == "Bandeja Enchilada Lab"
    assert {product["sku"]: product["name"] for product in products}["017"] == "Lab Rolls - Proyecto Libre"
    assert {product["sku"]: product["price"] for product in products}["017"] == 22000
    assert {product["sku"]: product["name"] for product in products}["018"] == "Boosters Lab 20oz"
    assert {product["sku"]: product["price"] for product in products}["018"] == 5000


def test_database_health_and_admin_diagnostics(client):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.get_json()["database"] == {
        "connected": True,
        "engine": "sqlite",
        "provider": "sqlite",
    }
    login(client)
    status = client.get("/api/system/database")
    assert status.status_code == 200
    data = status.get_json()
    assert data["connected"] is True
    assert data["persistent"] is False
    assert data["counts"]["products"] == 18


def test_supabase_url_is_normalized_with_psycopg_and_ssl():
    result = normalize_database_url(
        "postgres://postgres.project:password@aws-0-region.pooler.supabase.com:5432/postgres"
    )
    assert result.startswith("postgresql+psycopg2://")
    assert "sslmode=require" in result


def test_superadmin_is_immutable(client):
    login(client)
    response = client.put("/api/users/1", json={"active": False})
    assert response.status_code == 409


def test_mixed_payment_and_bogota_time(client):
    login(client)
    product = client.post("/api/products", json={
        "name": "Producto mixto", "category_id": 1, "price": 20000,
        "image_url": "data:image/png;base64,AA==",
    }).get_json()["product"]
    client.post("/api/cash-session/open", json={"opening_cash": 75000})
    response = client.post("/api/orders", json={
        "status": "paid", "payment_method": "mixed",
        "cash_amount": 5000, "qr_amount": 10000, "card_amount": 5000,
        "items": [{"product_id": product["id"], "quantity": 1}],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["cash_amount"] == 5000
    assert order["created_at"].endswith("-05:00")


def test_priced_modifiers_are_added_to_order_total(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    granizado = next(product for product in catalog["products"] if product["sku"] == "001")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "paid",
        "payment_method": "cash",
        "received": 18000,
        "items": [{
            "product_id": granizado["id"],
            "quantity": 1,
            "toppings": ["Elige 3 toppings: Fresa"],
            "modifiers": [{"name": "Fórmula 1 — 2 toppings + 1 salsa"}],
        }],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["total"] == 18000
    assert order["items"][0]["unit_price"] == 18000


def test_formula_is_restricted_to_granizado(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    bowl = next(product for product in catalog["products"] if product["sku"] == "004")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "held",
        "items": [{
            "product_id": bowl["id"],
            "quantity": 1,
            "modifiers": [{"code": "formula_1"}],
        }],
    })
    assert response.status_code == 400
    assert "Granizado" in response.get_json()["error"]


def test_tablet_order_reaches_worker_command_queue(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    product = next(product for product in catalog["products"] if product["sku"] == "006")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    client.post("/api/auth/logout")

    assert client.post("/api/tablet/session", json={
        "email": "tablet-test@superlab.local",
        "password": "TabletTestPassword2026!",
    }).status_code == 200
    response = client.post("/api/tablet/orders", json={
        "notes": "Cliente: Laura",
        "items": [{"product_id": product["id"], "quantity": 1, "toppings": [], "modifiers": []}],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["source"] == "tablet"
    assert order["status"] == "queued"

    client.post("/api/auth/logout")
    login(client)
    orders = client.get("/api/orders").get_json()["orders"]
    assert any(row["id"] == order["id"] for row in orders)
    updated = client.put(f"/api/orders/{order['id']}/status", json={"status": "preparing"})
    assert updated.status_code == 200
    assert updated.get_json()["order"]["status"] == "preparing"


def test_worker_cannot_access_admin(client):
    login(client)
    client.post("/api/users", json={
        "name": "Caja Uno", "email": "caja@superlab.local",
        "password": "Temporal123", "pin": "1234",
    })
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "caja@superlab.local", "password": "Temporal123"})
    assert client.get("/api/reports/summary").status_code == 403
    assert client.get("/api/users").status_code == 403


def test_catalog_seed_numeric_codes_daily_summary_and_delete(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    assert len(catalog["products"]) == 18
    assert all(product["sku"].isdigit() for product in catalog["products"])
    assert client.post("/api/products", json={
        "name": "Código inválido", "category_id": 1, "sku": "ABC-15",
    }).status_code == 400
    client.post("/api/cash-session/open", json={"opening_cash": 100000})
    report = client.get("/api/reports/daily-cash").get_json()
    assert report["summary"]["session_count"] == 1
    product_id = catalog["products"][0]["id"]
    assert client.delete(f"/api/products/{product_id}").status_code == 200
    remaining = client.get("/api/catalog").get_json()["products"]
    assert len(remaining) == 14
