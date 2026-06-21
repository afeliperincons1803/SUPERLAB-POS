"""Local visual smoke test. Requires Selenium and a local Edge installation."""
from pathlib import Path
import sys
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"
full_flow = "--full" in sys.argv
daily_view = "--daily" in sys.argv
output = Path(__file__).resolve().parents[2] / "app-preview.png"

options = Options()
options.add_argument("--headless=new")
options.add_argument("--window-size=1440,1000")
options.add_argument("--disable-gpu")
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Edge(options=options)
try:
    driver.get(base_url)
    driver.find_element(By.NAME, "email").send_keys("admin@superlab.local")
    driver.find_element(By.NAME, "password").send_keys("Superlab2026!")
    driver.find_element(By.CSS_SELECTOR, "#login-form button").click()
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "product-grid")))
    if daily_view:
        driver.find_element(By.CSS_SELECTOR, '[data-view="daily"]').click()
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "daily-sessions")))
    if full_flow:
        driver.find_element(By.CSS_SELECTOR, '[data-view="products"]').click()
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "new-product"))).click()
        driver.find_element(By.NAME, "name").send_keys("Batido visual")
        driver.find_element(By.NAME, "price").send_keys("20000")
        driver.find_element(By.NAME, "sku").send_keys("VIS-001")
        driver.find_element(By.CSS_SELECTOR, "#product-form button.button.primary").click()
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, '[data-edit-product]')))
        driver.find_element(By.CSS_SELECTOR, '[data-view="cash"]').click()
        open_form = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "open-cash")))
        open_form.find_element(By.NAME, "opening_cash").clear()
        open_form.find_element(By.NAME, "opening_cash").send_keys("100000")
        open_form.find_element(By.CSS_SELECTOR, "button").click()
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "close-cash")))
        driver.find_element(By.CSS_SELECTOR, '[data-view="pos"]').click()
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".product-card"))).click()
        driver.find_element(By.ID, "checkout").click()
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.CSS_SELECTOR, '[data-payment="mixed"]'))).click()
        for field_id, amount in (("cash-amount", "5000"), ("qr-amount", "10000"), ("card-amount", "5000")):
            field = driver.find_element(By.ID, field_id)
            field.clear()
            field.send_keys(amount)
        time.sleep(0.5)
    time.sleep(1)
    driver.save_screenshot(str(output))
    severe = [entry for entry in driver.get_log("browser") if entry["level"] == "SEVERE"]
    if severe:
        raise RuntimeError(f"Browser errors: {severe}")
    print(f"OK {driver.current_url} {output}")
finally:
    driver.quit()
