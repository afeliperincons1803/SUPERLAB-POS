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
    assert len(products) == 19
    by_sku = {product["sku"]: product for product in products}
    assert by_sku["001"]["name"] == "Granizado Lab 9 oz"
    assert by_sku["001"]["price"] == 12000
    assert by_sku["002"]["name"] == "Granizado Lab 12 oz"
    assert by_sku["002"]["price"] == 15000
    assert by_sku["003"]["name"] == "Raspado Lab 9 oz"
    assert by_sku["003"]["price"] == 8000
    assert by_sku["004"]["name"] == "Smoothie Lab 16 oz"
    assert by_sku["004"]["price"] == 16000
    assert by_sku["010"]["name"] == "Bowl Lab"
    assert by_sku["010"]["price"] == 20000
    assert by_sku["011"]["name"] == "Bandeja Lab"
    assert by_sku["011"]["price"] == 35000
    assert by_sku["012"]["name"] == "Crepa de Carne"
    assert by_sku["012"]["price"] == 21000
    assert by_sku["015"]["name"] == "Mini Donas x7"
    assert by_sku["015"]["price"] == 15000
    assert by_sku["017"]["name"] == "Michelada 12 oz"
    assert by_sku["017"]["price"] == 13000
    assert by_sku["019"]["name"] == "Fórmula X Max 20 ml"
    assert by_sku["019"]["price"] == 5000
    toppings = response.get_json()["toppings"]
    by_group = {}
    for topping in toppings:
        if topping["available"]:
            by_group.setdefault(topping["group"], set()).add(topping["name"])
    assert by_group["Frutas"] == {
        "Mango dulce", "Mango biche", "Manzana", "Sandía", "Piña", "Kiwi", "Cereza",
        "Fresa", "Uva", "Maracuyá", "Lulo", "Mora", "Uva verde", "Durazno",
    }
    assert by_group["Salsas"] == {
        "Leche Condensada", "Salsa de Caramelo", "Salsa de Chamoy",
        "Salsa de Chocolate", "Salsa de Fresa", "Salsa de Piña",
    }
    assert by_group["Adicionales sin costo"] == {"Tajín", "Pimienta", "Sal"}
    assert by_group["Cervezas"] == {"Coronita"}


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
    assert data["counts"]["products"] == 19


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
        "received": 15000,
        "items": [{
            "product_id": granizado["id"],
            "quantity": 1,
            "toppings": ["Elige 2 toppings: Gomitas"],
            "modifiers": [{"code": "booster_8"}],
        }],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["total"] == 15000
    assert order["items"][0]["unit_price"] == 15000


def test_legacy_formula_is_rejected(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    bowl = next(product for product in catalog["products"] if product["sku"] == "010")
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
    assert "anteriores" in response.get_json()["error"]


def test_formula_x_is_only_for_drinks(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    bowl = next(product for product in catalog["products"] if product["sku"] == "010")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "held",
        "items": [{
            "product_id": bowl["id"],
            "quantity": 1,
            "modifiers": [{"code": "booster_8"}],
        }],
    })
    assert response.status_code == 400
    assert "solo se puede agregar a bebidas" in response.get_json()["error"]


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
    assert len(catalog["products"]) == 19
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
    assert len(remaining) == 18


def test_inventory_alerts_allow_zero_stock(client):
    login(client)
    items = client.get("/api/inventory").get_json()["items"]
    assert items
    assert all(item["status"] == "critical" for item in items)
    item = items[0]
    response = client.put(f"/api/inventory/{item['id']}", json={
        "name": item["name"],
        "category": item["category"],
        "quantity": 1500,
        "unit": "g",
        "critical_level": 500,
        "low_level": 1000,
        "notes": "Prueba de inventario",
    })
    assert response.status_code == 200
    assert response.get_json()["item"]["status"] == "ok"
