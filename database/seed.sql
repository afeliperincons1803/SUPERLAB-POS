INSERT INTO categories (name, color, icon) VALUES
('Productos Lab', '#E8450A', '🧪'),
('Bebidas Lab', '#2E6BE6', '🥤'),
('Bandejas Lab', '#22C55E', '🍓'),
('Adiciones Lab', '#8B5CF6', '✦')
ON CONFLICT (name) DO NOTHING;

INSERT INTO toppings (name, group_name) VALUES
('Fresa','Frutas'),('Mango','Frutas'),('Sandía','Frutas'),('Kiwi','Frutas'),
('Arándanos','Frutas'),('Frambuesa','Frutas'),('Mora','Frutas'),('Cereza','Frutas'),
('Piña','Frutas'),('Uva','Frutas'),('Tomate de árbol','Frutas'),('Melón','Frutas'),
('Frutos Rojos','Sabores smoothie'),('Frutos Amarillos','Sabores smoothie'),
('Frutos Verdes','Sabores smoothie'),('Sandía & Mango','Sabores smoothie'),
('Sirope Fresa','Siropes'),('Sirope Mora Azul','Siropes'),('Sirope Mango','Siropes'),
('Sirope Maracuyá','Siropes'),('Sirope Cereza','Siropes'),('Sirope Uva','Siropes'),
('Sirope Limón','Siropes'),('Gomitas Osito','Dulces'),('Gomitas Agrias','Dulces'),
('Malvaviscos','Dulces'),('Chocolatinas','Dulces'),('Chispas de Colores','Dulces'),
('Galleta Oreo','Crunch'),('Granola','Crunch'),('Cereal Colorido','Crunch'),
('Coco Rallado','Crunch'),('Maní','Crunch'),('Perlas de Tapioca','Perlas'),
('Perlas de Fruta','Perlas'),('Perlas Explosivas','Perlas'),('Chamoy','Salsas'),
('Chocolate','Salsas'),('Leche Condensada','Salsas'),('Sirope','Salsas'),
('Salsa Fresa','Salsas'),('Caramelo','Salsas'),('Crema de Leche','Salsas'),
('Yogur','Salsas'),('Sales dulces','Sales'),('Sales picantes','Sales'),
('Miguelito','Sales'),('Tajín','Sales'),('Paleta dulce','Paletas'),
('Paleta ácida','Paletas'),('Pollo','Proteínas'),('Carne','Proteínas'),
('Proyecto libre','Proteínas'),('Dulce','Proteínas'),('Chocolate booster','Boosters Lab'),
('Licor booster','Boosters Lab'),('Chamoy booster','Boosters Lab'),
('Leche Condensada booster','Boosters Lab'),('Sirope booster','Boosters Lab')
ON CONFLICT (name) DO NOTHING;
