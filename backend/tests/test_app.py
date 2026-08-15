import os
import tempfile
import base64

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
    assert len(products) == 30
    by_sku = {product["sku"]: product for product in products}
    assert by_sku["001"]["name"] == "Granizado Lab 9 oz"
    assert by_sku["001"]["price"] == 13000
    assert by_sku["002"]["name"] == "Granizado Lab 12 oz"
    assert by_sku["002"]["price"] == 13000
    assert by_sku["003"]["name"] == "Sundae Lab · Frutos rojos"
    assert by_sku["003"]["price"] == 13000
    assert by_sku["029"]["name"] == "Sundae Lab · Frutos amarillos"
    assert by_sku["029"]["image_url"].endswith("/029-pos.webp")
    assert by_sku["030"]["name"] == "Sundae Lab · Chocolate"
    assert by_sku["030"]["image_url"].endswith("/030-pos.webp")
    assert by_sku["004"]["name"] == "Smoothie Lab"
    assert by_sku["004"]["price"] == 16000
    assert by_sku["010"]["name"] == "Bowl Lab"
    assert by_sku["010"]["price"] == 20000
    assert by_sku["011"]["name"] == "Bandeja Lab"
    assert by_sku["011"]["price"] == 30000
    assert by_sku["012"]["name"] == "Crepa de Res"
    assert by_sku["012"]["price"] == 22000
    assert by_sku["015"]["name"] == "Mini Donas x7"
    assert by_sku["016"]["name"] == "Mini Donas x14"
    assert by_sku["015"]["price"] == 7000
    assert by_sku["017"]["name"] == "Michelada Clásica Mexicana"
    assert by_sku["017"]["price"] == 15000
    assert by_sku["018"]["name"] == "Michelada Dulce"
    assert by_sku["018"]["price"] == 15000
    assert by_sku["019"]["name"] == "Malteada Unicornio"
    assert by_sku["019"]["price"] == 15000
    assert by_sku["020"]["name"] == "Rosa Tamarindo"
    assert by_sku["020"]["price"] == 10000
    assert by_sku["020"]["send_to_command"] is True
    assert by_sku["020"]["prep_minutes"] == 3
    assert by_sku["020"]["batch_capacity"] == 3
    assert by_sku["021"]["batch_capacity"] == 3
    assert by_sku["022"]["batch_capacity"] == 3
    assert by_sku["001"]["send_to_command"] is False
    assert by_sku["003"]["send_to_command"] is False
    assert by_sku["023"]["name"] == "Zona Creativa · Pieza pequeña"
    assert by_sku["023"]["price"] == 14000
    assert by_sku["026"]["name"] == "Helados caseros Arazá"
    assert by_sku["026"]["price"] is None
    assert by_sku["027"]["name"] == "Fórmula Estrella del Mes"
    assert by_sku["027"]["price"] is None
    assert by_sku["028"]["name"] == "Michelada Sin Licor"
    assert by_sku["028"]["price"] == 10000
    assert all(by_sku[f"{index:03d}"]["image_url"].endswith(f"/{index:03d}-pos.webp") for index in range(1, 31))
    toppings = response.get_json()["toppings"]
    by_group = {}
    for topping in toppings:
        if topping["available"]:
            by_group.setdefault(topping["group"], set()).add(topping["name"])
    assert by_group["Frutas"] == {
        "Mango biche", "Mango dulce", "Fresa y arándanos", "Durazno", "Sandía",
        "Lulo", "Piña", "Cereza", "Maracuyá", "Queso",
    }
    assert by_group["Salsas"] == {
        "Frutos amarillos", "Frutos rojos", "Leche condensada", "Crema de leche",
        "Chocolate", "Chamoy", "Fresa",
    }
    assert by_group["Adicionales sin costo"] == {"Tajín", "Pimienta", "Sal"}
    assert by_group["Cervezas"] == {"Sol", "Coronita"}
    assert by_group["Boosters Lab"] == {"Chamoy booster", "Leche Condensada booster", "Licor booster"}


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
    assert data["counts"]["products"] == 30


def test_admin_can_reorder_products_and_catalog_keeps_order(client):
    login(client)
    products = client.get("/api/products").get_json()["products"]
    reversed_ids = [product["id"] for product in reversed(products)]
    response = client.put("/api/products/reorder", json={"product_ids": reversed_ids})
    assert response.status_code == 200
    assert [product["id"] for product in response.get_json()["products"]] == reversed_ids
    catalog = client.get("/api/catalog").get_json()["products"]
    assert [product["id"] for product in catalog] == reversed_ids
    assert [product["sort_order"] for product in catalog] == list(range(10, 10 * (len(catalog) + 1), 10))


def test_product_reorder_rejects_incomplete_or_duplicate_ids(client):
    login(client)
    products = client.get("/api/products").get_json()["products"]
    ids = [product["id"] for product in products]
    assert client.put("/api/products/reorder", json={"product_ids": ids[:-1]}).status_code == 400
    assert client.put("/api/products/reorder", json={"product_ids": [ids[0]] * len(ids)}).status_code == 400


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
        "received": 16000,
        "items": [{
            "product_id": granizado["id"],
            "quantity": 1,
            "toppings": ["Elige 3 ingredientes: Gomitas, Fresa, Oreo"],
            "modifiers": [{"code": "booster_8"}],
        }],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["total"] == 16000
    assert order["items"][0]["unit_price"] == 16000


def test_paid_pos_order_creates_command_and_percentage_discounts(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    product = next(product for product in catalog["products"] if product["sku"] == "015")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "paid",
        "payment_method": "cash",
        "received": 12000,
        "customer_name": "Camila",
        "discount_percent": 10,
        "items": [{
            "product_id": product["id"],
            "quantity": 2,
            "discount_percent": 20,
        }],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["customer_name"] == "Camila"
    assert order["status"] == "paid"
    assert order["preparation_status"] == "queued"
    assert order["has_command"] is True
    assert order["own_prep_minutes"] == 8
    assert order["estimated_wait_minutes"] == 10
    assert order["items"][0]["discount"] == 2800
    assert order["items"][0]["subtotal"] == 11200
    assert order["discount"] == 1120
    assert order["total"] == 10080
    invoice = client.get(f"/api/orders/{order['id']}/escpos?type=invoice")
    command = client.get(f"/api/orders/{order['id']}/escpos?type=command")
    assert invoice.status_code == 200
    assert command.status_code == 200
    assert invoice.get_json()["escpos_base64"]
    assert command.get_json()["escpos_base64"]


def test_percentage_discount_must_be_in_range(client):
    login(client)
    product = client.get("/api/catalog").get_json()["products"][0]
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "held",
        "discount_percent": 101,
        "items": [{"product_id": product["id"], "quantity": 1}],
    })
    assert response.status_code == 400
    assert "porcentaje" in response.get_json()["error"].lower()


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
    assert "anterior" in response.get_json()["error"]


def test_booster_is_only_for_compatible_drinks(client):
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
    assert "solo se pueden agregar a bebidas" in response.get_json()["error"]


def test_mocktail_with_liquor_adds_five_thousand(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()
    mocktail = next(product for product in catalog["products"] if product["sku"] == "020")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "paid",
        "payment_method": "cash",
        "received": 15000,
        "items": [{
            "product_id": mocktail["id"],
            "quantity": 1,
            "toppings": ["Versión: Con licor"],
            "modifiers": [{"code": "with_liquor"}],
        }],
    })
    assert response.status_code == 201
    assert response.get_json()["order"]["total"] == 15000


def test_unpaid_tablet_order_does_not_reach_command_queue(client):
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
        "customer_name": "Laura",
        "notes": "Cliente: Laura",
        "items": [{"product_id": product["id"], "quantity": 1, "toppings": [], "modifiers": []}],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["source"] == "tablet"
    assert order["status"] == "queued"
    assert order["preparation_status"] == "held"
    assert order["estimated_wait_minutes"] == 0

    client.post("/api/auth/logout")
    login(client)
    orders = client.get("/api/orders").get_json()["orders"]
    assert any(row["id"] == order["id"] for row in orders)
    updated = client.put(f"/api/orders/{order['id']}/status", json={"status": "ready"})
    assert updated.status_code == 404


def test_mixed_order_command_contains_only_kitchen_items(client):
    login(client)
    catalog = client.get("/api/catalog").get_json()["products"]
    bowl = next(product for product in catalog if product["sku"] == "010")
    crepe = next(product for product in catalog if product["sku"] == "013")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "paid", "payment_method": "cash", "received": 42000,
        "customer_name": "Valentina",
        "items": [
            {"product_id": bowl["id"], "quantity": 1},
            {"product_id": crepe["id"], "quantity": 1, "toppings": ["Sin cilantro"]},
        ],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert len(order["items"]) == 2
    assert [item["name"] for item in order["command_items"]] == ["Crepa de Pollo"]
    assert order["own_prep_minutes"] == 10
    raw = base64.b64decode(client.get(f"/api/orders/{order['id']}/escpos?type=command").get_json()["escpos_base64"])
    ticket = raw.decode("cp850", errors="ignore")
    assert "Crepa de Pollo" in ticket
    assert "Bowl Lab" not in ticket


def test_immediate_order_is_completed_and_has_no_command(client):
    login(client)
    granizado = next(product for product in client.get("/api/catalog").get_json()["products"] if product["sku"] == "001")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    response = client.post("/api/orders", json={
        "status": "paid", "payment_method": "cash", "received": 13000,
        "customer_name": "Nicolás", "items": [{"product_id": granizado["id"], "quantity": 1}],
    })
    assert response.status_code == 201
    order = response.get_json()["order"]
    assert order["preparation_status"] == "completed"
    assert order["has_command"] is False
    assert order["estimated_wait_minutes"] == 0
    assert client.get(f"/api/orders/{order['id']}/escpos?type=command").status_code == 409


def test_batch_capacity_and_congestion_margin_from_fourth_order(client):
    login(client)
    mocktail = next(product for product in client.get("/api/catalog").get_json()["products"] if product["sku"] == "020")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    waits = []
    for index in range(4):
        response = client.post("/api/orders", json={
            "status": "paid", "payment_method": "cash", "received": 30000,
            "customer_name": f"Cliente {index + 1}",
            "items": [{"product_id": mocktail["id"], "quantity": 3}],
        })
        assert response.status_code == 201
        order = response.get_json()["order"]
        assert order["own_prep_minutes"] == 3
        waits.append(order["estimated_wait_minutes"])
    assert waits == [5, 10, 10, 20]

    fourth_batch = client.post("/api/orders", json={
        "status": "paid", "payment_method": "cash", "received": 40000,
        "items": [{"product_id": mocktail["id"], "quantity": 4}],
    }).get_json()["order"]
    assert fourth_batch["own_prep_minutes"] == 6


def test_print_steps_are_recorded(client):
    login(client)
    frappe = next(product for product in client.get("/api/catalog").get_json()["products"] if product["sku"] == "006")
    client.post("/api/cash-session/open", json={"opening_cash": 0})
    order = client.post("/api/orders", json={
        "status": "paid", "payment_method": "cash", "received": 13000,
        "items": [{"product_id": frappe["id"], "quantity": 1}],
    }).get_json()["order"]
    invoice = client.put(f"/api/orders/{order['id']}/print-status", json={"ticket_type": "invoice"})
    assert invoice.status_code == 200
    assert invoice.get_json()["order"]["invoice_printed_at"]
    command = client.put(f"/api/orders/{order['id']}/print-status", json={"ticket_type": "command"})
    assert command.status_code == 200
    assert command.get_json()["order"]["command_printed_at"]


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
    assert len(catalog["products"]) == 30
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
    assert len(remaining) == 29


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
