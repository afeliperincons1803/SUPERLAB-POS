import os
import tempfile

import pytest

from app import create_app


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
    assert len(products) == 14
    assert all(product["price"] is None for product in products)


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
    assert len(catalog["products"]) == 14
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
    assert len(remaining) == 13
